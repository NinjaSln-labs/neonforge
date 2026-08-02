// DeepSeekGateway：V1 = DeepSeek-only（A0 §1 裁决 D-C1）
// toDeepSeekParams 四档映射 / ModelRouter / ToolCallRepair / streamChat SSE
// 网络侧收敛在 Main Process（A0 §6 裁决 D-M8）；renderer 经 IPC 调用

export type ThinkingLevel = 'none' | 'basic' | 'medium' | 'high'

export interface DeepSeekThinkingParams {
  thinking: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}

// A0 §2 Layer 2：ThinkingLevel 四档 → API 参数（裁决 D-C4，映射全量一次到位）
export function toDeepSeekParams(level: ThinkingLevel): DeepSeekThinkingParams {
  switch (level) {
    case 'none': return { thinking: { type: 'disabled' } }
    case 'basic': return { thinking: { type: 'enabled' } }
    case 'medium': return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    case 'high': return { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
}

export type ModelID = 'deepseek-v4-flash' | 'deepseek-v4-pro'

// A0 §2 边界判定：ThinkingLevel=定义、ModelRouter=决策（返回完整 API 模型名）
export class ModelRouter {
  route(task: { userRequestedPro?: boolean; thinking: ThinkingLevel; stageAgent?: string }): ModelID {
    if (task.userRequestedPro) return 'deepseek-v4-pro'
    if (task.thinking === 'high') return 'deepseek-v4-pro'
    if (task.stageAgent === 'analyst' || task.stageAgent === 'architect') return 'deepseek-v4-pro'
    return 'deepseek-v4-flash'
  }
}

// A0 §2 边界判定：ToolRegistry 执行、Gateway 修复（4 轮）
export function toolCallRepair(raw: unknown, round: number = 0): unknown | null {
  if (round >= 4) return null // 4 轮上限
  try {
    if (typeof raw === 'string') return JSON.parse(raw)
    return raw
  } catch {
    // 截断/畸形：尝试补全最简修复（V1 基础实现）
    const s = String(raw)
    const fixed = s.replace(/,\s*}$/, '}').replace(/,\s*\]$/, ']')
    try {
      return JSON.parse(fixed)
    } catch {
      return null
    }
  }
}

// A0 §4 工具面：4 核心工具 + 6 LSP 工具定义（请求带 tools → 模型返回 tool_calls → ToolRegistry 执行）
// LSP 工具（ticket 12 真实语言服务器）：模型经 LSP 上下文回答问题（HANDOFF §3 第一优先——2026-08-02 接入模型）
// 参数设计：模型不知道行号——用 path + symbol（符号名）定位，LSP 侧文本扫描转 line/character（确定性零 token）
export const TOOL_DEFS = [
  { type: 'function', function: { name: 'read', description: '读取文件内容', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write', description: '写入文件（需 L3 授权）', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'edit', description: '替换文件内容（需 L3 授权）', parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } } },
  { type: 'function', function: { name: 'bash', description: '执行命令（需 L3 授权，V1 占位）', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'search', description: '关键词搜索代码库（grep 模式——Layer2 CodeRAG 兜底）：找文件/函数/错误位置用，返回命中文件+行号+片段', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词（如 "greet 定义" 或 "TODO"）' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'find_definition', description: '查找符号（函数/变量/类）的定义位置——LSP 真实查询', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' }, symbol: { type: 'string', description: '符号名（如 greet）——无需行号' } }, required: ['path', 'symbol'] } } },
  { type: 'function', function: { name: 'find_references', description: '查找符号的全部引用位置——LSP 真实查询', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' }, symbol: { type: 'string', description: '符号名' } }, required: ['path', 'symbol'] } } },
  { type: 'function', function: { name: 'get_type_info', description: '获取符号的类型信息（hover）——LSP 真实查询', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' }, symbol: { type: 'string', description: '符号名' } }, required: ['path', 'symbol'] } } },
  { type: 'function', function: { name: 'get_diagnostics', description: '获取文件全部诊断（类型/语法错误）——LSP 真实查询', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'get_imports', description: '提取文件 import 语句（本地扫描——零成本）', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'get_call_chain', description: '获取文件符号结构（documentSymbol 降级）', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } }, required: ['path'] } } }
]

const API_BASE = 'https://api.deepseek.com'

export class DeepSeekGateway {
  private router = new ModelRouter()

  // 非流式：验证 Key 用（max_tokens 最小）
  async validateKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    // 测试钩子：模拟断网/超时（不改系统网络）
    if (process.env.NF_FORCE_NETWORK_ERROR === '1') {
      return { ok: false, error: 'network' }
    }
    if (process.env.NF_FORCE_NETWORK_ERROR === 'timeout') {
      return { ok: false, error: 'timeout' }
    }
    if (process.env.NF_FORCE_NETWORK_ERROR === 'service') {
      return { ok: false, error: 'service-error' }
    }
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          ...toDeepSeekParams('none'),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (res.ok) return { ok: true }
      if (res.status === 401) return { ok: false, error: 'key-invalid' }
      if (res.status >= 500) return { ok: false, error: 'service-error' }
      return { ok: false, error: `http-${res.status}` }
    } catch (e) {
      return { ok: false, error: e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network' }
    }
  }

  // 流式 chat（SSE）：reasoning_content → content → tool_calls 状态机
  // 回调返回解析出的增量；V1 先透传文本流，tool_calls 解析留 04
  async streamChat(
    apiKey: string,
    opts: {
      model?: ModelID
      level?: ThinkingLevel
      messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>
      tools?: boolean
      onDelta: (chunk: { type: 'reasoning' | 'content' | 'tool-call' | 'done'; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void
    }
  ): Promise<void> {
    const model = opts.model ?? this.router.route({ thinking: opts.level ?? 'basic' })
    console.log('[gateway] stream start model=' + model + ' tools=' + (opts.tools ?? false))
    console.log('[gateway] stream start model=' + model + ' tools=' + (opts.tools ?? false))
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        // 工具调用模式禁用 thinking（DeepSeek thinking+tools 易陷入思考-工具循环——直接调工具快速收敛）
        ...toDeepSeekParams(opts.tools ? 'none' : (opts.level ?? 'basic')),
        messages: opts.messages,
        stream: true,
        ...(opts.tools ? { tools: TOOL_DEFS, tool_choice: 'auto' } : {})
      }),
      signal: AbortSignal.timeout(45000)
    })
    console.log('[gateway] http', res.status)
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.log('[gateway] error body:', bodyText.slice(0, 500))
      throw new Error(`gateway: http-${res.status}`)
    }
    if (!res.body) throw new Error('gateway: no-body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolAcc: Array<{ name: string; arguments: string }> = []
    let toolStart = 0 // 工具调用收集开始时间

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 按行解析 data: {...}
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          continue // 不在此处发 done——循环结束统一发（保证 tool-call 先于 done）
        }
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta ?? {}
          if (delta.reasoning_content) opts.onDelta({ type: 'reasoning', text: delta.reasoning_content })
          if (delta.content) opts.onDelta({ type: 'content', text: delta.content })
          // tool_calls 增量（DeepSeek SSE：按 index 分片，arguments 为字符串增量）
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const fn = tc.function ?? {}
              toolAcc[idx] ??= { name: '', arguments: '' }
              if (fn.name) toolAcc[idx].name += fn.name
              if (fn.arguments) toolAcc[idx].arguments += fn.arguments
            }
            // 模型已决定调工具——等 arguments 完整后截断（分片到达——半截 JSON 会解析失败）
            // 上限 5s：收到第一个工具调用后 5s 内强制截断（防流式挂起）
            const named = toolAcc.filter((x) => x && x.name)
            if (named.length > 0) {
              if (toolStart === 0) toolStart = Date.now()
              const allComplete = named.every((x) => { try { JSON.parse(x.arguments); return true } catch { return false } })
              if (allComplete || Date.now() - toolStart > 5000) {
                console.log('[gateway] tool-call 完整（或超时）——截断')
                break
              }
            }
          }
        } catch { /* 跳过半包 JSON */ }
      }
    }
    // 收集到的工具调用 → 修复 → 逐个发出（A0 边界：Gateway 修复，ToolRegistry 执行）
    for (const acc of toolAcc) {
      if (!acc.name) continue
      const repaired = toolCallRepair(acc.arguments)
      if (repaired === null) { console.log('[gateway] tool-call repair failed:', acc.name, acc.arguments.slice(0, 80)); continue }
      console.log('[gateway] tool-call emit:', acc.name, JSON.stringify(repaired).slice(0, 120))
      opts.onDelta({ type: 'tool-call', toolCall: { name: acc.name, args: repaired as Record<string, unknown> } })
    }
    console.log('[gateway] stream done')
    opts.onDelta({ type: 'done' })
  }

  // 预热（ticket 09 / A0 §6 裁决 D-C7）：最小成本请求让服务端缓存 prefix KV
  // v4-flash + thinking=disabled + max_tokens=1；system 携带完整 prefix（KV 缓存前缀）+ 极简 user 保证请求合法
  async preheat(apiKey: string, prefix: string): Promise<{ ok: boolean; error?: string; ms: number }> {
    const start = Date.now()
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          ...toDeepSeekParams('none'),
          messages: [
            { role: 'system', content: prefix },
            { role: 'user', content: '继续' }
          ],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(20000)
      })
      const ms = Date.now() - start
      if (res.ok) return { ok: true, ms }
      return { ok: false, error: `http-${res.status}`, ms }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network', ms: Date.now() - start }
    }
  }

  // 压缩摘要（ticket 11 Compaction）：compactor 角色非流式——历史 → 紧凑摘要（thinking=none + v4-flash）
  async summarize(
    apiKey: string,
    history: Array<{ role: string; content: string | null }>
  ): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          ...toDeepSeekParams('none'),
          messages: [
            { role: 'system', content: '你是 NeonForge 对话压缩器。把以下对话历史压缩为紧凑中文摘要（保留：用户目标、已决策、已授权、已完成事项、关键约束、失败/待办；忽略寒暄与工具细节）。用「对话摘要：」开头，200 字内。' },
            ...history,
            { role: 'user', content: '请压缩以上对话为摘要。' }
          ],
          max_tokens: 400,
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      })
      const j = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
      if (!res.ok) return { ok: false, error: j.error?.message ?? `http-${res.status}` }
      const summary = j.choices?.[0]?.message?.content?.trim()
      if (!summary) return { ok: false, error: '压缩返回空摘要' }
      return { ok: true, summary }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network' }
    }
  }
}

export const gateway = new DeepSeekGateway()
