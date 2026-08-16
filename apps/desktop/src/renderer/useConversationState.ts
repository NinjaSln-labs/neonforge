// 会话状态机 hook（2026-08-15 Q1a+Q2：转换单点封装——写路径唯一入口）
// 背景：S2 迁移后状态收敛于 stateRef（ConversationState 单一来源），但转换调用散落组件 20+ 处
// （userConfirmed/userRejected/approvalGranted/applyToolResult/setPending + 2 处直接展开改 + 1 处 Set 直接 add）。
// 本 hook = 写路径唯一入口（transition 单点）；读仍经 stateRef.current（ref 语义——渲染镜像由 MainWorkspace props 承担）。
// 未来换 useState/useSyncExternalStore（Q2 完整方案）只改本文件内部。
//
// 2026-08-15 DDD 重建（Session Timeline BC）：transition 内自动 diff 派生领域事件（Event Sourcing-lite——
// deriveStateEvents：任意状态转换 → task.*/session.*/plan.* 事件）→ emit 回调（应用层接 IPC 落盘）。
// 一处接入覆盖全部状态转换——替代散落打点；事件目录见 domain/timeline.ts（对齐 06 文档）。
import { useRef } from 'react'
import {
  initialState,
  userConfirmed,
  userRejected,
  approvalGranted,
  applyToolResult,
  setPending,
  type ConversationState,
  type DecisionContent,
  type PendingKind,
  type RejectReason,
} from '../domain/conversationState'
import { deriveStateEvents } from '../domain/timeline'

export type ConfirmPoint = 'goal' | 'plan' | 'resolution'

export interface UseConversationStateOpts {
  // 领域事件发出（应用层接 IPC——落盘时间线）
  emit?: (type: string, detail: Record<string, unknown>) => void
}

export function useConversationState(opts?: UseConversationStateOpts) {
  const { emit } = opts ?? {}
  const stateRef = useRef<ConversationState>(initialState())
  const transition = (fn: (s: ConversationState) => ConversationState): void => {
    const prev = stateRef.current
    stateRef.current = fn(prev)
    // DDD：转换后 diff 派生领域事件（状态机可回放——G1 缺口闭环）
    if (emit) {
      for (const evt of deriveStateEvents(prev, stateRef.current)) {
        emit(evt.type, evt.detail)
      }
    }
  }
  return {
    stateRef,
    // 用户确认/拒绝（确认卡按钮——pending 清除 + 状态推进/回退）
    // S3：拒绝带原因（不变量 8——userDecided 签名强制；rejectStreak 计数领域层维护）
    confirm: (point: ConfirmPoint) => transition((s) => userConfirmed(s, point)),
    reject: (point: ConfirmPoint, reason?: RejectReason) =>
      transition((s) => userRejected(s, point, reason ?? { kind: 'other' })),
    // approve-files 批准（追加语义——A0 §5；files 已 trustPath 规范化）
    grantPlan: (files: string[]) => transition((s) => approvalGranted(s, files)),
    // 工具结果汇入（进度/失败标记——坑 93 ② policy 不置失败）
    applyTool: (r: {
      name: string
      ok: boolean
      needApproval?: boolean
      policy?: boolean
      file?: string
    }) => transition((s) => applyToolResult(s, r)),
    // 确认卡触发 → 会话级 PENDING（D5）；S3：decisionContent 快照随置位（卡渲染唯一来源）
    setPending: (kind: Exclude<PendingKind, 'none'>, content?: Omit<DecisionContent, 'kind'>) =>
      transition((s) => setPending(s, kind, content)),
    clearPending: () => transition((s) => ({ ...s, pending: 'none' as PendingKind })),
    // 执行方案块解析清单并入（原 Set 直接 add——转换入口规范化）
    addPlannedFiles: (files: string[]) =>
      transition((s) => ({ ...s, plannedFiles: new Set([...s.plannedFiles, ...files]) })),
    // 规划幂等标记（clearTrust 任务边界——D2 同步 main 在组件层）
    setFilesApproved: (v: boolean) => transition((s) => ({ ...s, filesApproved: v })),
  }
}
