// 断点续做（ticket 06 / 基线 §21）：对话会话持久化——重启恢复上次会话
// 边界：消息序列存 localStorage；过滤半截 streaming；onNew 清空（台账复开已覆盖「继续昨天那个」）
// S3（§8.2 E）：decisionContent（决策点内容快照）随消息序列化——断点恢复后决策点内容不丢
import type { ToolCallMsg } from './ConversationPanel'
import type { DecisionContent } from '../domain/conversationState'

export const SESSION_KEY = 'nf-session'
export const SESSION_MAX = 50 // 会话消息上限（防膨胀）

// 可持久化消息（过滤半截 streaming——只存完整消息）
export interface StoredMsg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCallMsg[]
  id?: string // 2026-08-15 Q5：稳定 id 跨会话保留（断点恢复后 React key 稳定）
  decisionContent?: DecisionContent // S3：决策点内容快照（恢复后卡内容不丢——§8.2 E）
}

// messages → 可存子集（assistant 仅 status done/error；toolCalls 仅完整状态）
export function serializeMessages(
  msgs: Array<{
    role: 'user' | 'assistant'
    content: string
    reasoning?: string
    status?: string
    toolCalls?: ToolCallMsg[]
    id?: string
    decisionContent?: DecisionContent
  }>,
): StoredMsg[] {
  const out: StoredMsg[] = []
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content, id: m.id })
      continue
    }
    if (m.role === 'assistant' && (m.status === 'done' || m.status === 'error')) {
      out.push({
        role: 'assistant',
        content: m.content,
        reasoning: m.reasoning,
        toolCalls: m.toolCalls?.filter(
          (t) => t.status === 'done' || t.status === 'error' || t.status === 'reverted',
        ),
        id: m.id,
        decisionContent: m.decisionContent, // S3：决策点快照随完整消息持久化
      })
    }
  }
  return out.slice(-SESSION_MAX)
}

// 持久化（失败忽略——内存态仍工作）
export function saveSession(msgs: StoredMsg[]): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(msgs))
  } catch {
    /* 存储不可用——忽略 */
  }
}

// 加载（损坏忽略 → null）
export function loadSession(): StoredMsg[] | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* 损坏——忽略 */
  }
  return null
}

// 清空（新会话开始）
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* 忽略 */
  }
}
