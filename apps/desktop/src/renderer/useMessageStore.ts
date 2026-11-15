// P1-05 阶段 5：消息状态与会话持久化（从 ConversationPanel 提取；行为不变）。
// messages/messagesRef/nextMsgId + 恢复（含决策点快照）+ 持久化（过滤半截 streaming）。
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { loadSessionSnapshot, saveSession, serializeMessages } from './sessionStore'
import { normalizeDecisionContent, toTaskSnapshot } from '../domain/taskSnapshot'
import type { Msg } from './ConversationPanel'
import type { useConversationState } from './useConversationState'
import type { ConversationState } from '../domain/conversationState'

type SetPending = ReturnType<typeof useConversationState>['setPending']

export interface MessageStoreDeps {
  setPendingState: SetPending
  stateRef: RefObject<ConversationState>
  stateVersion: number
  restoreTaskState: ReturnType<typeof useConversationState>['restoreTaskState']
  onTaskStateRestored?: (state: ConversationState) => void
}

export interface MessageStore {
  messages: Msg[]
  messagesRef: RefObject<Msg[]>
  nextMsgId: () => string
  setMessages: Dispatch<SetStateAction<Msg[]>>
  /** 会话恢复完成（messages 与任务快照已一致）——依赖消息的同步效应须等此标志置位 */
  sessionReady: boolean
}

export function useMessageStore({
  setPendingState,
  stateRef,
  stateVersion,
  restoreTaskState,
  onTaskStateRestored,
}: MessageStoreDeps): MessageStore {
  const [messages, setMessages] = useState<Msg[]>([])
  const [sessionReady, setSessionReady] = useState(false)
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
    const snapshot = loadSessionSnapshot()
    if (!snapshot) {
      setSessionReady(true)
      return
    }
    // ADR-013：任务快照优先——目标/方案/解决确认态、pending、执行进度与拒绝记忆完整恢复；
    // 快照损坏/版本不符 → 回退旧消息快照恢复路径（legacy）。
    const taskRestored = snapshot.task != null && restoreTaskState(snapshot.task)
    if (taskRestored) onTaskStateRestored?.(stateRef.current)
    if (snapshot.messages.length > 0) {
      setMessages(
        snapshot.messages.map((s) => ({
          id: s.id ?? nextMsgId(),
          role: s.role,
          content: s.content,
          reasoning: s.reasoning,
          status: 'done' as const,
          toolCalls: s.toolCalls,
        })),
      )
    }
    // 旧存档兼容：最新消息携带 decisionContent → 恢复 pending（任务快照已恢复时不重复覆盖）
    if (!taskRestored) {
      for (let i = snapshot.messages.length - 1; i >= 0; i--) {
        // ADR-014：旧消息快照也必须经过与任务快照相同的校验/归一化——
        // 否则字符串/非法 source 会以 Assumption[] 类型进入状态并污染持久化
        const dc = normalizeDecisionContent(snapshot.messages[i].decisionContent)
        if (dc) {
          setPendingState(dc.kind, {
            since: dc.since,
            ...(dc.proposal ? { proposal: dc.proposal } : {}),
            ...(dc.approval ? { approval: dc.approval } : {}),
          })
          break
        }
      }
    }
    // 恢复完成：消息与任务状态此刻一致；依赖消息的同步效应（授权 pending 对账）从下一次渲染起生效，
    // 避免与首渲染的空消息快照竞态（错误清掉任务快照里的 approval pending 再经 transition 重建 → 伪造决策事件）
    setSessionReady(true)
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
    if (serialized.length > 0) saveSession(serialized, toTaskSnapshot(stateRef.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, stateRef.current.decisionContent, stateVersion])
  return { messages, messagesRef, nextMsgId, setMessages, sessionReady }
}
