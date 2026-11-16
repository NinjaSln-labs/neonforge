// P1-05 阶段 4a：对话历史构建（纯函数，无组件依赖）。
// 把消息列表转换为 OpenAI Chat Completions 历史：保留工具轮完整结果与 reasoning_content。
import type { Msg } from './ConversationPanel'

export interface HistoryMessage {
  role: string
  content: string | null
  tool_calls?: unknown[]
  tool_call_id?: string
  reasoning_content?: string
}

export function buildHistory(msgs: Msg[]): HistoryMessage[] {
  let callSeq = 0 // 历史多轮工具的全局唯一 tool_call_id
  return msgs
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done'))
    .flatMap((m): HistoryMessage[] => {
      // D4：工具轮完整回填——有正文+工具的消息也带 tool_calls；tool 消息用 rawResult 完整内容
      // （原用 UI 摘要 result 且截断 300——模型后续轮看不到 read 内容 → 反复 read）
      // ADR-007/provider 兼容：回放统一带 reasoning_content（DeepSeek V4 多轮 thinking 回放必须带）
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const calls = m.toolCalls.map((c, i) => ({
          id: `h${callSeq + i}`,
          name: c.name,
          args: c.args,
          result: c.rawResult ?? c.result ?? c.status ?? '执行失败',
        }))
        callSeq += calls.length
        return [
          {
            role: 'assistant',
            content: m.content || null,
            reasoning_content: m.reasoning ?? '',
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          },
          ...calls.map((c) => ({
            role: 'tool',
            tool_call_id: c.id,
            content: String(c.result),
          })),
        ]
      }
      return [
        {
          role: m.role,
          content: m.content,
          ...(m.role === 'assistant' ? { reasoning_content: m.reasoning ?? '' } : {}),
        },
      ]
    })
}
