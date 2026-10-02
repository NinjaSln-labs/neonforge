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
  approvalRequested,
  approvalExecutionSettled,
  drainQueued,
  reconcileJournal,
  expireWindow,
  resolveUncertain,
  windowResolved,
  applyToolResult,
  setPending,
  restorePending as restorePendingDomain,
  type ConversationState,
  type DecisionAnswers,
  type DecisionContent,
  type PendingKind,
  type RejectReason,
  type ApprovalRecord,
  type ApprovalRequest,
} from '../domain/conversationState'
import { deriveStateEvents } from '../domain/timeline'

export type ConfirmPoint = 'goal' | 'plan' | 'resolution' | 'system_clarify'

export interface UseConversationStateOpts {
  // 领域事件发出（应用层接 IPC——落盘时间线）
  emit?: (type: string, detail: Record<string, unknown>) => void
}

export function useConversationState(opts?: UseConversationStateOpts) {
  const { emit } = opts ?? {}
  const stateRef = useRef<ConversationState>(initialState())
  // A-005：转换后强制重渲染计数（ref 变化不触发渲染——卡隐藏/内容切换依赖响应式；
  // rejectedCardIdx 移除后由 version 驱动；读 stateRef 的渲染点消费 `version`）
  const [version, setVersion] = useState(0)
  const transition = (fn: (s: ConversationState) => ConversationState): boolean => {
    const prev = stateRef.current
    stateRef.current = fn(prev)
    // ADR-015：身份门 no-op 时 fn 返回同一引用——eff＝转换真生效位（main 镜像联动判据 T3.6）
    const eff = stateRef.current !== prev
    // DDD：转换后 diff 派生领域事件（状态机可回放——G1 缺口闭环；no-op ⇒ 零事件）
    if (emit) {
      for (const evt of deriveStateEvents(prev, stateRef.current)) {
        emit(evt.type, evt.detail)
      }
    }
    setVersion((v) => v + 1)
    return eff
  }
  return {
    stateRef,
    // A-005：转换计数（响应式——读 stateRef 的渲染点消费 version 以触发重渲染；ref 本身非响应式）
    version,
    // 用户确认/拒绝（确认卡按钮——pending 清除 + 状态推进/回退）
    // S3：拒绝带原因（不变量 8——userDecided 签名强制；A-006：reason 必传——缺省会静默掩盖调用方漏传）
    // #6 真机 2026-08-31（复验轮）：plan 确认镜像到 main（approve-files 硬序门）；goal 确认=任务边界 → 复位
    // ADR-017 B5.5（提前入本刀——纯 hook 面）：转换生效时外包 windowResolved——确认卡释放槽后
    // 窗内若有可见 pending 记录，槽回 'approval'（双向同步）；门 no-op（n===s）不触碰槽
    confirm: (point: ConfirmPoint, answers?: DecisionAnswers) => {
      const eff = transition((s) => {
        const n = userConfirmed(s, point, answers)
        return n === s ? s : windowResolved(n)
      })
      // T3.6（第十二轴 P2）：main 镜像仅随转换真生效——门 no-op 不得翻硬序门
      if (eff && point === 'plan') void window.neonforge?.session?.setPlanConfirmed?.(true)
      else if (eff && point === 'goal') void window.neonforge?.session?.setPlanConfirmed?.(false)
      return eff
    },
    reject: (point: ConfirmPoint, reason: RejectReason, answers?: DecisionAnswers) => {
      const eff = transition((s) => {
        const n = userRejected(s, point, reason, answers)
        return n === s ? s : windowResolved(n)
      })
      // 审计修正（stage-review-2026-08-31 Spec-3）：plan 拒绝 → main 镜像复位（否则硬序门仍开）
      if (eff && point === 'plan') void window.neonforge?.session?.setPlanConfirmed?.(false)
      return eff
    },
    // approve-files 批准（追加语义——A0 §5；files 已 trustPath 规范化）
    grantPlan: (files: string[]) => transition((s) => approvalGranted(s, files)),
    // S7（A0 审校 P1-2 接线）：授权拒绝——approvalDecided（§3.4 C6——拒绝记忆登记——同轮同类短封）
    // ADR-017 B2 兼容改线：allow/deny 同权进门（t000073 领域根治）——身份＝窗内最近可决记录
    // （窗空＝{requestId:''} 闸 miss 引用级 no-op，行为等同旧"无卡可拒"）；B4 换真 requestId 寻址
    // （旧 ADR-015 answers 身份门随 approval 族作废——request/_answers 形参保留供调用点过渡）
    rejectApproval: (_request: ApprovalRequest, reason: RejectReason, _answers?: DecisionAnswers) =>
      transition((s) => {
        const last = [...s.approvalWindow.requests]
          .reverse()
          .find((r) => r.state === 'pending' || r.state === 'queued')
        return approvalDecided(s, last ? { requestId: last.requestId } : { requestId: '' }, {
          confirm: false,
          reason,
        })
      }),
    // ADR-017 B4.1 窗口面装配（四入口改线的 hook 侧——transition 包装＋引用级 no-op 检测打点；
    // B4.2 消费接线：ConversationPanel/useToolApproval）
    // 入窗：同 id 再入＝引用级 no-op → duplicate 打点（§3 M-02 可观测化）＋false（调用层不重复铺卡）
    requestApproval: (rec: Omit<ApprovalRecord, 'state'>, slotBusy: boolean): boolean => {
      const before = stateRef.current
      const eff = transition((s) => approvalRequested(s, rec, slotBusy))
      if (!eff) {
        emit?.('approval.duplicate_ingress', {
          requestId: rec.requestId,
          fingerprintMatch:
            before.approvalWindow.requests.find((x) => x.requestId === rec.requestId)
              ?.argsFingerprint === rec.argsFingerprint,
        })
        return false
      }
      return true
    },
    // 决策进门：闸 miss（id∉窗/已决）→ stale 打点（ADR-015 通道复用——answers×窗态摘要）＋false
    decideApproval: (
      target: Parameters<typeof approvalDecided>[1],
      decision: Parameters<typeof approvalDecided>[2],
      by?: 'user' | 'rule',
    ): boolean => {
      const before = stateRef.current
      const eff = transition((s) => approvalDecided(s, target, decision, by))
      if (!eff) {
        emit?.('conversation.stale_input_discarded', {
          answers: 'requestId' in target ? target.requestId : null,
          window: before.approvalWindow.requests.map((x) => ({
            requestId: x.requestId,
            state: x.state,
          })),
        })
        return false
      }
      return true
    },
    // 执行回写收敛（done 幂等 no-op／failed 入窗——B4.2 approve 路径 .then 消费）
    settleApproval: (id: string, outcome: 'done' | 'failed') =>
      transition((s) => approvalExecutionSettled(s, id, outcome)),
    // 呈现队列推进（槽空 ∧ 无可见 → queued 顶上）
    drainWindow: () => transition(drainQueued),
    // 恢复/重连 journal 对账（C2 消费——rows 经 approval:reconcile 回读）
    reconcileWindow: (
      rows: Array<{ requestId: string; phase: 'issued' | 'approved' | 'started' | 'done' }>,
    ) => transition((s) => reconcileJournal(s, rows)),
    // ttl/legacy 到期（未决→expired；legacy approved→failed）
    expireWindowFn: (reason: 'ttl' | 'legacy') => transition((s) => expireWindow(s, reason)),
    // uncertain 唯一用户出口（禁自动重放——rerun 差异由调用层承接）
    resolveUncertainFn: (requestId: string, choice: 'settled-done' | 'authorize-rerun') =>
      transition((s) => resolveUncertain(s, requestId, choice)),
    // 工具结果汇入（进度/失败标记——坑 93 ② policy 不置失败）
    applyTool: (r: {
      name: string
      ok: boolean
      needApproval?: boolean
      policy?: boolean
      file?: string
    }) => transition((s) => applyToolResult(s, r)),
    // 确认卡触发 → 会话级 PENDING（D5）；S3：decisionContent 快照随置位（卡渲染唯一来源）
    setPending: (
      kind: Exclude<PendingKind, 'none'>,
      content?: Omit<DecisionContent, 'kind' | 'instanceId'>,
    ) => transition((s) => setPending(s, kind, content)),
    // ADR-015（第十三轴 B#6）：clearPending 同步清快照/描述符——恒铺骨架残留经持久化→恢复＝approval 幽灵循环破口封堵
    // ADR-017 B5.5：释放后外包 windowResolved（窗有可见 pending 记录 → 槽回 approval）
    clearPending: () =>
      transition((s) =>
        windowResolved({
          ...s,
          pending: 'none' as PendingKind,
          decisionContent: undefined,
          activeDescriptor: undefined,
        }),
      ),
    // ADR-010：强制卡「我要重新描述」按钮专用——点卡 = 明确新一轮协商，rejectStreak 重置
    // （pending 期间打字拒绝不重置——C2 循环形态仍需累积触发强制卡）
    resetRejectStreak: () => transition((s) => ({ ...s, rejectStreak: 0 })),
    // 执行方案块解析清单并入（原 Set 直接 add——转换入口规范化）
    addPlannedFiles: (files: string[]) =>
      transition((s) => ({ ...s, plannedFiles: new Set([...s.plannedFiles, ...files]) })),
    // 规划幂等标记（clearTrust 任务边界——D2 同步 main 在组件层）
    setFilesApproved: (v: boolean) => transition((s) => ({ ...s, filesApproved: v })),
    // D3（ADR-005）：启动恢复——main plannedFilesStore 权威状态 → 本地镜像（批准事实跨重启）；
    // 不走 transition（恢复是系统初始化非用户转换——不 emit 派生事件，防时间线污染）
    restorePlanned: (files: string[], approved: boolean) => {
      stateRef.current = {
        ...stateRef.current,
        plannedFiles: new Set(files),
        filesApproved: approved,
      }
      setVersion((v) => v + 1)
    },
    // ADR-015（§8.2E）：会话恢复决策点——直置 pending/快照/seq（续号）。
    // 不走 transition（不 emit——重显卡＝同实例不得重发 decision.requested；不推号）
    restorePending: (dc: DecisionContent) => {
      stateRef.current = restorePendingDomain(stateRef.current, dc)
      setVersion((v) => v + 1)
    },
  }
}
