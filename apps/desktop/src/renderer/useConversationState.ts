// 会话状态机 hook（2026-08-15 Q1a+Q2：转换单点封装——消除散落双轨模式）
// 背景：S2 迁移后状态收敛于 stateRef（ConversationState 单一来源），但转换调用散落组件 20+ 处
// （userConfirmed/userRejected/approvalGranted/applyToolResult/setPending + 2 处直接展开改 + 1 处 Set 直接 add）。
// 本 hook = 写路径唯一入口（transition 单点）；读仍经 stateRef.current（ref 语义——渲染镜像由 MainWorkspace props 承担）。
// 未来换 useState/useSyncExternalStore（Q2 完整方案）只改本文件内部。
import { useRef } from 'react'
import {
  initialState, userConfirmed, userRejected, approvalGranted, applyToolResult, setPending,
  type ConversationState, type PendingKind,
} from '../domain/conversationState'

export type ConfirmPoint = 'goal' | 'execution' | 'achievement'

export function useConversationState() {
  const stateRef = useRef<ConversationState>(initialState())
  const transition = (fn: (s: ConversationState) => ConversationState): void => {
    stateRef.current = fn(stateRef.current)
  }
  return {
    stateRef,
    // 用户确认/拒绝（确认卡按钮——pending 清除 + 状态推进/回退）
    confirm: (point: ConfirmPoint) => transition((s) => userConfirmed(s, point)),
    reject: (point: ConfirmPoint) => transition((s) => userRejected(s, point)),
    // approve-files 批准（追加语义——A0 §5；files 已 trustPath 规范化）
    grantPlan: (files: string[]) => transition((s) => approvalGranted(s, files)),
    // 工具结果汇入（进度/失败标记——坑 93 ② policy 不置失败）
    applyTool: (r: { name: string; ok: boolean; needApproval?: boolean; policy?: boolean; file?: string }) =>
      transition((s) => applyToolResult(s, r)),
    // 确认卡触发 → 会话级 PENDING（D5）
    setPending: (kind: Exclude<PendingKind, 'none'>) => transition((s) => setPending(s, kind)),
    clearPending: () => transition((s) => ({ ...s, pending: 'none' as PendingKind })),
    // 执行方案块解析清单并入（原 Set 直接 add——转换入口规范化）
    addPlannedFiles: (files: string[]) => transition((s) => ({ ...s, plannedFiles: new Set([...s.plannedFiles, ...files]) })),
    // 规划幂等标记（clearTrust 任务边界——D2 同步 main 在组件层）
    setFilesApproved: (v: boolean) => transition((s) => ({ ...s, filesApproved: v })),
  }
}
