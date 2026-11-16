// BC-13 MCP 客户端：stdio JSON-RPC 2.0（initialize → tools/list → tools/call）。
// 安全边界：进程 spawn 只来自本机用户配置（不含凭据值）；调用必须经 BC-02 授权卡。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

export interface McpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  cwd?: string
  /** 显式允许从父进程继承的环境变量名（其余宿主环境不传给 MCP 子进程）。 */
  envFrom?: string[]
}

export interface McpTransport {
  send: (message: unknown) => void
  onMessage: (handler: (message: unknown) => void) => void
  onClose: (handler: (reason: string) => void) => void
  close: () => void
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: string; code?: number }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class McpRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'McpRpcError'
  }
}

/** JSON-RPC 2.0 peer（按 id 匹配；超时/关闭时拒绝所有挂起请求） */
export class JsonRpcPeer {
  private nextId = 1
  private pending = new Map<number, PendingRequest>()

  constructor(
    private readonly sendFn: (message: unknown) => void,
    private readonly timeoutMs = 15_000,
  ) {}

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new McpRpcError(`MCP 请求超时：${method}`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.sendFn({ jsonrpc: '2.0', id, method, params })
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  notify(method: string, params?: unknown): void {
    try {
      this.sendFn({ jsonrpc: '2.0', method, params })
    } catch {
      /* 通知失败由传输关闭事件统一收敛 */
    }
  }

  handleMessage(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const msg = raw as JsonRpcMessage
    if (typeof msg.id !== 'number' && typeof msg.id !== 'string') return // 服务器通知
    const id = typeof msg.id === 'string' ? Number(msg.id) : msg.id
    if (!Number.isInteger(id)) return
    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(id)
    if (msg.error) {
      pending.reject(
        new McpRpcError(msg.error.message || `MCP 错误（code ${msg.error.code}）`, msg.error.code),
      )
      return
    }
    pending.resolve(msg.result)
  }

  rejectAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new McpRpcError(reason))
      this.pending.delete(id)
    }
  }
}

/** 子进程基础环境（不含任何凭据）：路径/家目录/区域/临时目录/Windows 系统变量。 */
const MCP_SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'TERM',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'WINDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
] as const

/** 2026-11-17 审查修复：MCP 子进程不再全量继承 process.env（防第三方可执行文件读取宿主凭据）。
 * 只传安全基础变量 + 用户在配置中显式列出的 envFrom 名称。 */
export function buildMcpEnv(
  envFrom: readonly string[] = [],
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const key of MCP_SAFE_ENV_KEYS) {
    const value = source[key]
    if (value !== undefined) out[key] = value
  }
  for (const key of envFrom) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    const value = source[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/** stdio 传输：按行解析 JSON；stderr 只保留尾部用于错误提示 */
export function createStdioTransport(config: McpServerConfig): McpTransport {
  const command = String(config.command ?? '').trim()
  if (!command) throw new Error(`MCP 服务器 ${config.name} 缺少 command`)
  const args = (config.args ?? []).map((a) => String(a))
  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    cwd: config.cwd,
    env: buildMcpEnv(config.envFrom),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const messageHandlers: Array<(message: unknown) => void> = []
  const closeHandlers: Array<(reason: string) => void> = []
  let closed = false
  let stderrTail = ''
  const MAX_STDERR = 2000

  const emitClose = (reason: string) => {
    if (closed) return
    closed = true
    for (const handler of closeHandlers) handler(reason)
  }

  let buffer = ''
  const decoder = new StringDecoder('utf8')
  const MAX_BUFFER = 16_000_000
  const onStdout = (chunk: Buffer) => {
    if (closed) return
    buffer += decoder.write(chunk)
    // 超长单行不再从头部截断（会破坏 JSON 前缀/id）——直接断开并报错
    if (buffer.length > MAX_BUFFER) {
      buffer = ''
      emitClose('MCP 响应超过 16MB，连接已断开')
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      return
    }
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          const parsed: unknown = JSON.parse(line)
          for (const handler of messageHandlers) handler(parsed)
        } catch {
          /* 非 JSON 行（服务器日志）忽略 */
        }
      }
      newline = buffer.indexOf('\n')
    }
  }
  child.stdout.on('data', onStdout)
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-MAX_STDERR)
  })
  child.on('error', (e) => emitClose(`MCP 进程启动失败：${e.message}`))
  child.on('exit', (code, signal) =>
    emitClose(
      `MCP 进程退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）${
        stderrTail ? `：${stderrTail.trim()}` : ''
      }`,
    ),
  )
  child.stdin.on('error', (e) => emitClose(`MCP stdin 错误：${e.message}`))

  return {
    send: (message) => {
      if (closed) throw new McpRpcError('MCP 传输已关闭')
      child.stdin.write(`${JSON.stringify(message)}\n`)
    },
    onMessage: (handler) => messageHandlers.push(handler),
    onClose: (handler) => closeHandlers.push(handler),
    close: () => {
      // 即使已被 stdin-error/exit 标记 closed，也要确保子进程被 kill（防残留）
      emitClose('客户端关闭')
      try {
        if (!child.killed) child.kill()
      } catch {
        /* ignore */
      }
    },
  }
}

function contentToText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .map((item) =>
      item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string'
        ? (item as { text: string }).text
        : '',
    )
    .filter(Boolean)
    .join('\n')
}

export interface McpClientOptions {
  timeoutMs?: number
  clientName?: string
  clientVersion?: string
}

/** 单个 MCP 服务器会话 */
export class McpClient {
  private readonly peer: JsonRpcPeer
  private initialized = false

  constructor(
    private readonly transport: McpTransport,
    private readonly options: McpClientOptions = {},
  ) {
    this.peer = new JsonRpcPeer((message) => transport.send(message), options.timeoutMs ?? 15_000)
    transport.onMessage((message) => this.peer.handleMessage(message))
    transport.onClose((reason) => {
      this.initialized = false
      this.peer.rejectAll(reason)
    })
  }

  async initialize(): Promise<unknown> {
    if (this.initialized) return { alreadyInitialized: true }
    const result = await this.peer.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: this.options.clientName ?? 'neonforge',
        version: this.options.clientVersion ?? '0.1.0',
      },
    })
    this.peer.notify('notifications/initialized', {})
    this.initialized = true
    return result
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const result = await this.peer.request('tools/list', {})
    const raw = (result as { tools?: unknown })?.tools
    if (!Array.isArray(raw)) return []
    const tools: McpToolDescriptor[] = []
    for (const tool of raw) {
      if (!tool || typeof tool !== 'object') continue
      const name = String((tool as { name?: unknown }).name ?? '').trim()
      if (!name) continue
      const inputSchema = (tool as { inputSchema?: unknown }).inputSchema
      tools.push({
        name,
        description:
          typeof (tool as { description?: unknown }).description === 'string'
            ? (tool as { description: string }).description
            : '',
        inputSchema:
          inputSchema && typeof inputSchema === 'object'
            ? (inputSchema as Record<string, unknown>)
            : undefined,
      })
    }
    return tools
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const result = await this.peer.request('tools/call', { name, arguments: args })
    const isError = Boolean((result as { isError?: unknown })?.isError)
    if (isError) {
      const text = contentToText(result)
      return { ok: false, error: text || `MCP 工具执行失败：${name}` }
    }
    return {
      ok: true,
      data: {
        content: (result as { content?: unknown }).content ?? null,
        structuredContent: (result as { structuredContent?: unknown }).structuredContent ?? null,
      },
    }
  }

  close(): void {
    this.transport.close()
  }
}
