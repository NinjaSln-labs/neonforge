// 会话状态机 hook（2026-08-15 Q1a+Q2：转换单点封装——写路径唯一入口）
// 背景：S2 迁移后状态收敛于 stateRef（ConversationState 单一来源），但转换调用散落组件 20+ 处
// （userConfirmed/userRejected/approvalGranted/applyToolResult/setPending + 2 处直接展开改 + 1 处 Set 直接 add）。
// 本 hook = 写路径唯一入口（transition 单点）；读仍经 stateRef.current（ref 语义——渲染镜像由 MainWorkspace props 承担）。
// 未来换 useState/useSyncExternalStore（Q2 完整方案）只改本文件内部。
//
// 2026-08-15 DDD 重建（Session Timeline BC）：transition 内自动 diff 派生领域事件（Event Sourcing-lite——
// deriveStateEvents：任意状态转换 → task.*/session.*/plan.* 事件）→ emit 回调（应用层接 IPC 落盘）。
// 一处接入覆盖全部状态转换——替代散落打点；事件目录见 domain/timeline.ts（对齐 06 文档）。
import { useRef, useState } from 'react'
import {
  initialState,
  userConfirmed,
  userRejected,
  approvalGranted,
  approvalDecided,
  applyToolResult,
  setPending,
  type ConversationState,
  type DecisionContent,
  type PendingKind,
  type RejectReason,
  type ApprovalRequest,
  type PlanProposal,
  type SystemClarifyProposal,
} from '../domain/conversationState'
import { deriveStateEvents, type StateTransitionCause } from '../domain/timeline'
import { fromTaskSnapshot } from '../domain/taskSnapshot'

export type ConfirmPoint = 'goal' | 'plan' | 'resolution' | 'system_clarify'

/** P1 修复：system_clarify 是包装决策点——副作用按 underlying 的真实决策类型执行 */
export function resolveEffectiveDecisionPoint(
  point: ConfirmPoint,
  before: ConversationState,
): ConfirmPoint {
  if (point !== 'system_clarify') return point
  const dc = before.decisionContent
  if (dc?.kind === 'system_clarify') {
    const underlying = (dc.proposal as SystemClarifyProposal | undefined)?.underlying
    if (underlying) return underlying
  }
  return point
}

export interface UseConversationStateOpts {
  // 领域事件发出（应用层接 IPC——落盘时间线）
  emit?: (type: string, detail: Record<string, unknown>) => void
  // BC-14：方案确认后把 verificationPlan 交给验收上下文（记录在 main；renderer 不持有权威）
  onPlanConfirmed?: (plan: PlanProposal) => void
  // 任务边界（goal 确认）：清理上一任务的验收记录等跨任务数据
  onTaskBoundary?: () => void
  // 项目根（可选）：方案清单派生时过滤根外条目（根外文件永不进入自动批准清单——V2 信任模式约束）
  rootPath?: string | null
}

export function useConversationState(opts?: UseConversationStateOpts) {
  const { emit } = opts ?? {}
  const stateRef = useRef<ConversationState>(initialState())
  // A-005：转换后强制重渲染计数（ref 变化不触发渲染——卡隐藏/内容切换依赖响应式；
  // rejectedCardIdx 移除后由 version 驱动；读 stateRef 的渲染点消费 `version`）
  const [version, setVersion] = useState(0)
  const transition = (
    fn: (s: ConversationState) => ConversationState,
    cause?: StateTransitionCause,
  ): void => {
    const prev = stateRef.current
    stateRef.current = fn(prev)
    // DDD：转换后 diff 派生领域事件（状态机可回放——G1 缺口闭环）
    // 2026-11-24 审计：确认/拒绝必须携带转换原因——纯 diff 无法区分「确认重置」与「拒绝」，
    // 也无法看到初始确认位 false→false 的拒绝（原实现据此漏发/误发 task.*_rejected）。
    if (emit) {
      for (const evt of deriveStateEvents(prev, stateRef.current, cause)) {
        emit(evt.type, evt.detail)
      }
    }
    setVersion((v) => v + 1)
  }
  // P1 修复：system_clarify 是包装决策点——副作用按 underlying 的真实决策类型执行
  const effectivePoint = (point: ConfirmPoint, before: ConversationState): ConfirmPoint =>
    resolveEffectiveDecisionPoint(point, before)
  // P1-03：plan 确认镜像带重试（1 次）；失败不阻断已完成的领域转换，但记录错误
  const syncPlanMirror = async (value: boolean): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await window.neonforge?.session?.setPlanConfirmed?.(value)
        return true
      } catch (e) {
        if (attempt === 1) {
          console.error('[session] plan 确认镜像失败', e)
          return false
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    return false
  }
  return {
    stateRef,
    // A-005：转换计数（响应式——读 stateRef 的渲染点消费 version 以触发重渲染；ref 本身非响应式）
    version,
    // 用户确认/拒绝（确认卡按钮——pending 清除 + 状态推进/回退）
    // S3：拒绝带原因（不变量 8——userDecided 签名强制；A-006：reason 必传——缺省会静默掩盖调用方漏传）
    // #6 真机 2026-08-31（复验轮）：plan 确认镜像到 main（approve-files 硬序门）；goal 确认=任务边界 → 复位
    // P1-03：镜像失败重试，避免 renderer 已确认而 main 门控仍关闭（极端时序）；state 转换仍同步完成
    confirm: async (point: ConfirmPoint) => {
      const before = stateRef.current
      const target = effectivePoint(point, before)
      const r = transition((s) => userConfirmed(s, point, opts?.rootPath), {
        action: 'confirm',
        point: target,
      })
      if (target === 'plan') {
        await syncPlanMirror(true)
        // BC-14：确认前的 decisionContent 是方案快照；确认时派生验收记录（无来源则记录为空）
        // （system_clarify 包装时内容快照可能是 clarify 摘要——不会伪造 plan proposal）
        const dc = before.decisionContent
        if (dc?.kind === 'plan' && dc.proposal) {
          opts?.onPlanConfirmed?.(dc.proposal as PlanProposal)
        }
      } else if (target === 'goal') {
        await syncPlanMirror(false)
        opts?.onTaskBoundary?.()
      }
      return r
    },
    reject: async (point: ConfirmPoint, reason: RejectReason) => {
      const before = stateRef.current
      const target = effectivePoint(point, before)
      const r = transition((s) => userRejected(s, point, reason), {
        action: 'reject',
        point: target,
      })
      // 审计修正（stage-review-2026-08-31 Spec-3）：plan 拒绝 → main 镜像复位（否则硬序门仍开）
      if (target === 'plan') await syncPlanMirror(false)
      return r
    },
    // approve-files 批准（追加语义——A0 §5；files 已 trustPath 规范化）
    grantPlan: (files: string[]) => transition((s) => approvalGranted(s, files)),
    // S7（A0 审校 P1-2 接线）：授权拒绝——approvalDecided（§3.4 C6——拒绝记忆登记——同轮同类短封）
    rejectApproval: (request: ApprovalRequest, reason: RejectReason) =>
      transition((s) => approvalDecided(s, request, { confirm: false, reason })),
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
    // ADR-010：强制卡「我要重新描述」按钮专用——点卡 = 明确新一轮协商，rejectStreak 重置
    // （pending 期间打字拒绝不重置——C2 循环形态仍需累积触发强制卡）
    resetRejectStreak: () => transition((s) => ({ ...s, rejectStreak: 0 })),
    // 规划幂等标记（clearTrust 任务边界——D2 同步 main 在组件层）
    setFilesApproved: (v: boolean) => transition((s) => ({ ...s, filesApproved: v })),
    // D3（ADR-005）：启动恢复——main plannedFilesStore 权威状态 → 本地镜像（批准事实跨重启）；
    // 不走 transition（恢复是系统初始化非用户转换——不 emit 派生事件，防时间线污染）
    // ADR-013：与任务快照恢复并集——main 只承载批准事实；快照中已确认方案派生的清单不能被空 main 覆盖
    restorePlanned: (files: string[], approved: boolean) => {
      stateRef.current = {
        ...stateRef.current,
        plannedFiles: new Set([...stateRef.current.plannedFiles, ...files]),
        filesApproved: stateRef.current.filesApproved || approved,
      }
      setVersion((v) => v + 1)
    },
    // ADR-013（GitHub #11）：任务状态机跨重启——完整快照恢复（确认位/pending/进度/拒绝记忆）；
    // 与 restorePlanned 同语义：系统初始化，不派生领域事件。损坏/版本不符返回 false（保持初始态）。
    restoreTaskState: (snapshot: unknown): boolean => {
      const restored = fromTaskSnapshot(snapshot)
      if (!restored) return false
      stateRef.current = restored
      // P1-03 / 硬序门：main 的 planConfirmedRef 不随 renderer 重启恢复——必须镜像回写（失败不阻断恢复）
      void syncPlanMirror(restored.planConfirmed)
      setVersion((v) => v + 1)
      return true
    },
    // ADR-013：恢复后的陈旧 approval pending（对应工具卡已不在消息中）静默清理——
    // 不伪造 decision.resolved confirm（原 clearPending transition 会记录用户从未做过的批准）。
    clearPendingSilently: () => {
      if (stateRef.current.pending === 'none') return
      stateRef.current = {
        ...stateRef.current,
        pending: 'none',
        decisionContent: undefined,
      }
      setVersion((v) => v + 1)
    },
  }
}
