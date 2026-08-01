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

// A0 §4 工具面：4 核心工具定义（请求带 tools → 模型返回 tool_calls → ToolRegistry 执行）
export const TOOL_DEFS = [
  { type: 'function', function: { name: 'read', description: '读取文件内容', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write', description: '写入文件（需 L3 授权）', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'edit', description: '替换文件内容（需 L3 授权）', parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } } },
  { type: 'function', function: { name: 'bash', description: '执行命令（需 L3 授权，V1 占位）', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } }
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
      messages: Array<{ role: string; content: string }>
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
        ...toDeepSeekParams(opts.level ?? 'basic'),
        messages: opts.messages,
        stream: true,
        ...(opts.tools ? { tools: TOOL_DEFS, tool_choice: 'auto' } : {})
      }),
      signal: AbortSignal.timeout(120000)
    })
    console.log('[gateway] http', res.status)
    if (!res.ok || !res.body) throw new Error(`gateway: http-${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolAcc: Array<{ name: string; arguments: string }> = []

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
}

export const gateway = new DeepSeekGateway()
