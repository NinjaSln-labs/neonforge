// P1-05 阶段 5：消息状态与会话持久化（从 ConversationPanel 提取；行为不变）。
// messages/messagesRef/nextMsgId + 恢复（含决策点快照）+ 持久化（过滤半截 streaming）。
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { loadSession, saveSession, serializeMessages } from './sessionStore'
import type { Msg } from './ConversationPanel'
import type { useConversationState } from './useConversationState'
import type { ConversationState } from '../domain/conversationState'

type SetPending = ReturnType<typeof useConversationState>['setPending']

export interface MessageStoreDeps {
  setPendingState: SetPending
  stateRef: RefObject<ConversationState>
  stateVersion: number
}

export interface MessageStore {
  messages: Msg[]
  messagesRef: RefObject<Msg[]>
  nextMsgId: () => string
  setMessages: Dispatch<SetStateAction<Msg[]>>
}

export function useMessageStore({
  setPendingState,
  stateRef,
  stateVersion,
}: MessageStoreDeps): MessageStore {
  const [messages, setMessages] = useState<Msg[]>([])
  const messagesRef = useRef<Msg[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  // 2026-08-15 Q5：消息稳定 id 生成（会话内递增——key 稳定性）
  const msgSeqRef = useRef(0)
  const nextMsgId = () => `m${Date.now().toString(36)}-${(msgSeqRef.current++).toString(36)}`
  // 断点续做（ticket 06/基线 §21）：挂载恢复上次会话（onNew 已 clearSession → 空）
  // S3（§8.2 E C5）：恢复后 pending 冻结立即生效——决策点内容快照（decisionContent）随消息恢复，
  // 卡重显旧内容（用户确认/修改后才更新——模型首轮只能响应用户对已有决策点的决策）
  useEffect(() => {
    const stored = loadSession()
    if (stored && stored.length > 0) {
      setMessages(
        stored.map((s) => ({
          id: s.id ?? nextMsgId(),
          role: s.role,
          content: s.content,
          reasoning: s.reasoning,
          status: 'done' as const,
          toolCalls: s.toolCalls,
        })),
      )
      // 恢复决策点冻结：最新消息携带 decisionContent → 恢复 pending（goal/plan/resolution——卡重显）
      for (let i = stored.length - 1; i >= 0; i--) {
        const dc = stored[i].decisionContent
        if (dc) {
          setPendingState(dc.kind, {
            since: dc.since,
            ...(dc.proposal ? { proposal: dc.proposal } : {}),
          })
          break
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 断点续做：完整消息变化 → 持久化（过滤半截 streaming——streaming 时 serialize 为空不覆盖存档）
  // S3（§8.2 E）：决策点内容快照随最近 assistant 消息持久化（恢复后卡内容不丢——pending 冻结语义）
  useEffect(() => {
    const dc = stateRef.current.decisionContent
    const withSnapshot = dc
      ? messages.map((m, i) =>
          i === messages.length - 1 && m.role === 'assistant' && m.status === 'done'
            ? { ...m, decisionContent: dc }
            : m,
        )
      : // A-009：决策点已清除（确认/拒绝后）→ 剥离历史消息上的过期快照（防恢复时命中旧卡）
        messages.map((m) => ({ ...m, decisionContent: undefined }))
    const serialized = serializeMessages(withSnapshot)
    if (serialized.length > 0) saveSession(serialized)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, stateRef.current.decisionContent, stateVersion])
  return { messages, messagesRef, nextMsgId, setMessages }
}
