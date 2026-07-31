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
      onDelta: (chunk: { type: 'reasoning' | 'content' | 'done'; text?: string }) => void
    }
  ): Promise<void> {
    const model = opts.model ?? this.router.route({ thinking: opts.level ?? 'basic' })
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
        stream: true
      }),
      signal: AbortSignal.timeout(120000)
    })
    if (!res.ok || !res.body) throw new Error(`gateway: http-${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

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
          opts.onDelta({ type: 'done' })
          continue
        }
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta ?? {}
          if (delta.reasoning_content) opts.onDelta({ type: 'reasoning', text: delta.reasoning_content })
          if (delta.content) opts.onDelta({ type: 'content', text: delta.content })
        } catch { /* 跳过半包 JSON */ }
      }
    }
    opts.onDelta({ type: 'done' })
  }
}

export const gateway = new DeepSeekGateway()
