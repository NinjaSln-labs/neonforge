// LspService（ticket 12 / A0 §2 Layer 2）：真实语言服务器连接（typescript-language-server）
// JSON-RPC over stdio：spawn server → initialize → didOpen → 查询（definition/references/hover/diagnostics）
// 边界：ContextEngine=上下文注入；get_imports 本地文本扫描（零成本确定性）；get_call_chain 降级 documentSymbol
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const LSP_TOOLS = [
  'find_definition',
  'find_references',
  'get_imports',
  'get_call_chain',
  'get_type_info',
  'get_diagnostics',
] as const

// JSON-RPC 帧：Content-Length 头 + 消息体（LSP stdio 传输）
class LspConnection {
  private proc: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = ''
  onNotification: ((method: string, params: unknown) => void) | null = null

  async start(projectPath: string): Promise<void> {
    const bin = path.join(process.cwd(), 'node_modules', '.bin', 'typescript-language-server')
    if (!existsSync(bin))
      throw new Error('typescript-language-server 未安装——npm i -D typescript-language-server')
    this.proc = spawn(bin, ['--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout?.setEncoding('utf-8')
    this.proc.stdout?.on('data', (d: string) => this.onData(d))
    this.proc.stderr?.on('data', (d: Buffer) =>
      console.log('[lsp] stderr:', String(d).slice(0, 300)),
    )
    this.proc.on('exit', () => {
      this.rejectAll(new Error('LSP 进程退出'))
    })

    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToUri(projectPath),
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext'] },
          definition: {},
          references: {},
          documentSymbol: {},
          diagnostic: {},
        },
      },
    })
    this.notify('initialized', {})
    this.notify('workspace/didChangeConfiguration', {
      settings: { typescript: {}, javascript: {} },
    })
  }

  async request(method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`LSP 请求超时: ${method}`))
        }
      }, timeoutMs)
    })
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  stop(): void {
    try {
      this.notify('shutdown', null)
    } catch {
      /* ignore */
    }
    try {
      this.notify('exit', null)
    } catch {
      /* ignore */
    }
    this.proc?.kill()
    this.proc = null
    this.rejectAll(new Error('LSP 已关闭'))
  }

  isRunning(): boolean {
    return !!this.proc
  }

  private send(msg: unknown): void {
    if (!this.proc?.stdin?.writable) throw new Error('LSP 未连接')
    const body = JSON.stringify(msg)
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`)
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    // Content-Length: N\r\n\r\n{body}
    while (true) {
      const headEnd = this.buffer.indexOf('\r\n\r\n')
      if (headEnd === -1) return
      const header = this.buffer.slice(0, headEnd)
      const m = header.match(/Content-Length:\s*(\d+)/i)
      if (!m) {
        this.buffer = this.buffer.slice(headEnd + 4)
        continue
      }
      const len = parseInt(m[1], 10)
      const bodyStart = headEnd + 4
      if (this.buffer.length < bodyStart + len) return
      const body = this.buffer.slice(bodyStart, bodyStart + len)
      this.buffer = this.buffer.slice(bodyStart + len)
      try {
        const msg = JSON.parse(body)
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error)
            p.reject(new Error(`LSP 错误: ${msg.error.message ?? JSON.stringify(msg.error)}`))
          else p.resolve(msg.result)
        } else if (msg.method && this.onNotification) {
          this.onNotification(msg.method, msg.params)
        }
      } catch (e) {
        console.log('[lsp] 解析失败:', e instanceof Error ? e.message : String(e))
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }
}

function pathToUri(p: string): string {
  return (
    'file://' +
    p
      .split(path.sep)
      .map(encodeURIComponent)
      .join('/')
      .replace(/^file:\/\/\//, 'file:///')
  )
}

// LSP definition/references 可返回 Location | Location[] | LocationLink[]——统一为 {uri, range}（LocationLink 用 targetUri/targetRange）
function normalizeLocations(r: unknown): unknown {
  if (!Array.isArray(r)) return r
  return r.map((loc) => {
    const l = loc as { uri?: string; targetUri?: string; range?: unknown; targetRange?: unknown }
    return l.uri ? loc : { uri: l.targetUri, range: l.targetRange }
  })
}

// LspService：连接生命周期 + 6 工具查询分发
export class LspService {
  private conn: LspConnection | null = null
  private projectPath: string | null = null
  private opened = new Set<string>() // 已 didOpen 的 uri
  private diagnostics = new Map<string, unknown[]>() // uri → publishDiagnostics 缓存

  async connect(projectPath: string): Promise<{ ok: true; projectPath: string }> {
    await this.disconnect()
    const conn = new LspConnection()
    conn.onNotification = (method, params) => {
      if (method === 'textDocument/publishDiagnostics') {
        const p = params as { uri: string; diagnostics: unknown[] }
        this.diagnostics.set(p.uri, p.diagnostics)
      }
    }
    await conn.start(projectPath)
    this.conn = conn
    this.projectPath = projectPath
    console.log('[lsp] connected:', projectPath)
    return { ok: true, projectPath }
  }

  async disconnect(): Promise<void> {
    this.conn?.stop()
    this.conn = null
    this.projectPath = null
    this.opened.clear()
    this.diagnostics.clear()
  }

  isConnected(): boolean {
    return !!this.conn?.isRunning()
  }

  private requireConn(): LspConnection {
    if (!this.conn || !this.conn.isRunning()) throw new Error('LSP 未连接——打开项目后自动连接')
    return this.conn
  }

  // 打开文件（LSP 需文件在内存——didOpen 一次即可；content 缺省读磁盘）
  // definition 跳转需要目标文件已 didOpen（tsserver 未打开文件不解析）——顺带打开本地 import 引入的文件
  private async ensureOpen(filePath: string): Promise<string> {
    const conn = this.requireConn()
    const uri = pathToUri(filePath)
    let openedAny = false
    if (!this.opened.has(uri)) {
      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
      conn.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'typescript', version: 1, text },
      })
      this.opened.add(uri)
      openedAny = true
      for (const imp of extractImports(text)) {
        const target = resolveImportPath(filePath, imp.from, this.projectPath)
        if (!target || this.opened.has(pathToUri(target))) continue
        try {
          conn.notify('textDocument/didOpen', {
            textDocument: {
              uri: pathToUri(target),
              languageId: 'typescript',
              version: 1,
              text: readFileSync(target, 'utf-8'),
            },
          })
          this.opened.add(pathToUri(target))
        } catch {
          /* 不可读文件跳过 */
        }
      }
    }
    // didOpen 为 notify（异步）——等一拍保证 tsserver 已处理（definition 紧随查询）
    if (openedAny) await new Promise((r) => setTimeout(r, 200))
    return uri
  }

  // 6 工具查询分发（A0 §4 工具面）
  // rootPath：模型传相对/类绝对路径（如 /src/a.ts）→ join rootPath 解析（复用 tools.ts 路径语义）
  async query(kind: string, args: Record<string, unknown>, rootPath?: string): Promise<unknown> {
    const conn = this.requireConn()
    const filePath = resolveLspPath(String(args.path ?? ''), rootPath)
    // 模型给 symbol（符号名）→ 文本扫描定位（无需行号）；显式 line/character 优先
    const hasExplicitPos = typeof args.line === 'number' && typeof args.character === 'number'
    let line = hasExplicitPos ? Number(args.line) : 0
    let character = hasExplicitPos ? Number(args.character) : 0
    if (!hasExplicitPos && args.symbol && existsSync(filePath)) {
      const pos = locateSymbol(readFileSync(filePath, 'utf-8'), String(args.symbol))
      if (pos) {
        line = pos.line
        character = pos.character
      }
    }
    const uri = await this.ensureOpen(filePath)
    const position = { line, character }
    const doc = { uri }

    switch (kind) {
      case 'find_definition':
        return normalizeLocations(
          await conn.request('textDocument/definition', { textDocument: doc, position }),
        )
      case 'find_references':
        return normalizeLocations(
          await conn.request('textDocument/references', {
            textDocument: doc,
            position,
            context: { includeDeclaration: true },
          }),
        )
      case 'get_type_info':
        return conn.request('textDocument/hover', { textDocument: doc, position })
      case 'get_diagnostics':
        // 推送模型：didOpen 后服务端 publishDiagnostics 已缓存；未收到则等一拍
        if (this.diagnostics.has(uri)) return this.diagnostics.get(uri)
        await new Promise((r) => setTimeout(r, 500))
        return this.diagnostics.get(uri) ?? []
      case 'get_imports':
        // 本地文本扫描（LSP 无 imports 查询——零成本确定性）
        return {
          imports: extractImports(existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''),
        }
      case 'get_call_chain':
        // 降级：documentSymbol 返回符号结构（V1 说明——真实调用图后续）
        return conn.request('textDocument/documentSymbol', { textDocument: doc })
      default:
        throw new Error(`未知 LSP 查询: ${kind}`)
    }
  }
}

// 提取 import 语句（ESM/CommonJS 顶行）——确定性文本扫描
export function extractImports(text: string): Array<{ from: string; names: string[] }> {
  const out: Array<{ from: string; names: string[] }> = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    const esm = t.match(/^import\s+(?:type\s+)?(?:\{([^}]*)\}|([^'"]+?))\s+from\s+['"]([^'"]+)['"]/)
    if (esm) {
      const names = (esm[1] ?? esm[2] ?? '')
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0])
        .filter(Boolean)
      out.push({ from: esm[3], names })
      continue
    }
    const sideEffect = t.match(/^import\s+['"]([^'"]+)['"]/)
    if (sideEffect) out.push({ from: sideEffect[1], names: [] })
  }
  return out
}

// 本地相对 import → 目标文件解析（.ts/.tsx/index 候选；仅项目内——防逃逸）
function resolveImportPath(
  fromFile: string,
  spec: string,
  projectPath: string | null,
): string | null {
  if (!spec.startsWith('.')) return null // 包导入（node_modules 无需 didOpen）
  const base = path.dirname(fromFile)
  const candidates = [
    path.resolve(base, spec),
    path.resolve(base, spec + '.ts'),
    path.resolve(base, spec + '.tsx'),
    path.resolve(base, spec, 'index.ts'),
    path.resolve(base, spec, 'index.tsx'),
  ]
  for (const c of candidates) {
    if (existsSync(c) && (!projectPath || c.startsWith(projectPath))) return c
  }
  return null
}

// 路径解析：① 已是绝对路径（rootPath 内或真实存在）→ 直接用；② 相对/类绝对路径（如 /src/a.ts）→ join rootPath
// 语义对齐 tools.ts resolvePath（模型传 /package.json 类相对路径 → 项目根下）
function resolveLspPath(p: string, rootPath?: string): string {
  if (!p) throw new Error('缺少 path 参数')
  if (rootPath && (p.startsWith(rootPath) || existsSync(p))) return p
  if (rootPath) return path.join(rootPath, p.replace(/^\/+/, ''))
  if (path.isAbsolute(p)) return p
  throw new Error('路径需为绝对路径或提供 rootPath')
}

// 文本扫描定位符号（symbol → line/character）——确定性零 token，模型无需算行号
export function locateSymbol(
  text: string,
  symbol: string,
): { line: number; character: number } | null {
  if (!symbol) return null
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const col = lines[i].indexOf(symbol)
    if (col !== -1) return { line: i, character: col }
  }
  return null
}

export const lsp = new LspService()

// 注册 6 LSP 工具到 ToolRegistry（source: 'lsp'；2026-08-02 起加入模型 TOOL_DEFS——deepseek 模型可自主调用查询真实代码上下文）
export function registerLspTools(registry: {
  register(t: {
    name: string
    source: 'lsp'
    requiresApproval: boolean
    risk: 'none'
    execute: (args: Record<string, unknown>, ctx: { rootPath?: string }) => Promise<unknown>
  }): void
}): void {
  for (const name of LSP_TOOLS) {
    registry.register({
      name,
      source: 'lsp',
      requiresApproval: false,
      risk: 'none',
      execute: (args, ctx) => lsp.query(name, args, ctx?.rootPath),
    })
  }
}
