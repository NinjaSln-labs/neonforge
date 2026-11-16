// P1-05 阶段 5：对话遥测打点（从 ConversationPanel 提取；行为不变）。
// 卡弹出（goal/plan/resolution + 授权卡）与状态变化（working/approval-pending/ready）。
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Msg } from './ConversationPanel'
import type { ConversationState } from '../domain/conversationState'
import type { TimelineLog } from './useTimelineLog'

export interface ConversationTelemetryDeps {
  goalConfirmed?: boolean
  messages: Msg[]
  planConfirmed?: boolean
  stateRef: RefObject<ConversationState>
  stateVersion: number
  tlog: TimelineLog
  working: boolean
}

export function useConversationTelemetry({
  goalConfirmed,
  messages,
  planConfirmed,
  stateRef,
  stateVersion,
  tlog,
  working,
}: ConversationTelemetryDeps): void {
  // 2026-08-08 卡弹出打点（用户「加一个确认/授权等卡弹出的点」）：确认卡（目标/执行/达成）+ 授权卡/approve-files 卡——卡从无到有打一次
  const cardShownRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const last = messages[messages.length - 1]
    const isLastAssistant = last?.role === 'assistant' && last.status === 'done'
    const show = (card: string, extra?: Record<string, unknown>) => {
      if (cardShownRef.current.has(card)) return
      cardShownRef.current.add(card)
      tlog('card.shown', { card, ...extra }, 'system')
    }
    if (isLastAssistant) {
      // #6 真机 2026-08-30（P1-3 修正）：原条件 `|| !goalConfirmed` 使目标未确认时**任何** assistant
      // 回合都打 card.shown goal-confirm（goalText=随手截断的正文）——遥测假象三例（空文本/旁白/恢复快照）
      // 全部源于此，排查时严重误导（真实弹卡唯一依据 = pending + decisionContent）。
      // 修正：只在目标决策点真实存在时打点，goalText 取提议 statement
      const dc = stateRef.current.decisionContent
      const goalStatement =
        dc?.kind === 'goal' ? ((dc.proposal as { statement?: string })?.statement ?? '') : ''
      if (stateRef.current.pending === 'goal' && goalStatement)
        show('goal-confirm', { goalText: goalStatement.slice(0, 120) })
      // A-020 附带（P2-2 对齐）：原条件 `goalConfirmed && !planConfirmed` 使目标确认后**任何**
      // assistant 回合都打 card.shown exec-confirm（真机 seq54 实证——无卡也打点，排查误导）。
      // 对齐真实决策点（与 goal-confirm/resolution 同款）：只在 plan pending 真实存在时打点
      if (stateRef.current.pending === 'plan') show('exec-confirm')
      // #6 真机 2026-08-30（P2-2）：对齐真实决策点——原条件【已达成】+产物即打点，
      // S4 门控（verifyCompletion 不通过不弹卡）下产生假「已弹卡」遥测（真机排查误导）
      if (stateRef.current.pending === 'resolution') show('achieve-confirm')
    }
    // 授权卡 / approve-files 卡（工具卡 need-approval/plan-approval 状态）——每次弹卡独立记录（同工具不同 args 是新的授权决策）
    // #6 真机 2026-08-30（坑 107 双卡同弹复现）：goal/plan/resolution 决策点 pending 时延迟显示授权卡
    //（本 effect 依赖含 pending——决策点清掉后下一 tick 补显）；同一时刻只呈现一个决策——A0 §3.5b 门控顺序的 UI 面
    const decisionPending =
      stateRef.current.pending === 'goal' ||
      stateRef.current.pending === 'plan' ||
      stateRef.current.pending === 'resolution'
    for (const m of messages) {
      for (const c of m.toolCalls ?? []) {
        if (c.status === 'need-approval' || c.status === 'file-approval') {
          if (decisionPending) continue
          const key = `approval:${c.name}:${JSON.stringify(c.args ?? {}).slice(0, 60)}`
          show(key, {
            card: c.status === 'file-approval' ? 'file-approval' : 'approval',
            name: c.name,
            args: c.args,
          })
        }
      }
    }
  }, [
    messages,
    goalConfirmed,
    planConfirmed,
    stateVersion, // 审计修正 2026-08-31：stateRef 字段变化不触发 effect——决策点异步置位（verifyThenResolve）后靠 version 重渲染补打（原写 ref 字段进依赖形同虚设）
  ])
  // 2026-08-08 状态变化打点（working / approval-pending / ready——统一状态机；变化才记录）
  const lastStatusRef = useRef('')
  useEffect(() => {
    const status = working
      ? 'working'
      : stateRef.current.pending === 'approval'
        ? 'approval-pending'
        : 'ready'
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status
      tlog('conversation.status_change', { status })
    }
  }, [working, messages])
}
