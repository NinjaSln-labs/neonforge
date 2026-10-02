// 领域层：会话状态机（Conversation BC 聚合根 Task——A0 §2/§3/§4/§5）
// 2026-08-16 意图确认重设计 S1（intent-confirmation-domain-design.md §3/§4/§6）：
// - 值对象：GoalProposal/PlanProposal/CompletionClaim/CompletionEvidence/ApprovalRequest/RejectReason/ActionAttribute（§3.2）
// - 状态：executionConfirmed → planConfirmed（确认的是方案）；achievementConfirmed → resolutionConfirmed（确认的是「解决」）
//         pending 枚举 execution/achievement → plan/resolution；新增 decisionContent（决策点内容快照）+ deniedApprovals（拒绝记忆）
// - 转换唯一入口：userDecided（不变量 1/8）/ approvalDecided（§3.4）；userConfirmed/userRejected 降为兼容壳（S3 移除）
// - 派生：deriveDecisionPoint（不变量 2/7）/ sessionGate×actionGate（不变量 3）/ verifyCompletion（不变量 4）/
//         decideProgressGuarantee（不变量 5）/ derivePlannedFiles（不变量 6）
// - 继承：单一 PENDING、plannedFiles 追加语义、producedFiles、lastToolFailed、shouldStopContinuation（classifyAction 兼容壳 S6 已移除）
// 纯逻辑无 React 依赖——L1 可测。依赖关系：tools.ts preApproval 消费 classifyReadonly/isLocalhostCommand（同源——缝隙 4）。
// S5：turnPolicy.ts 已移除（decideTurnPolicy/TurnPolicyInput 语义并入 decideProgressGuarantee——§6 S5 唯一推进判定器）。

// ============================================================================
// 值对象（设计 §3.2）
// ============================================================================

/** 目标提议（模型产出） */
export interface GoalProposal {
  statement: string // 一句话目标（原【目标确认】文本）
  assumptions: string[] // 模型的关键假设（用户从未确认过的细节——必须显式呈现）
}

/** 方案文件条目 */
export interface PlanFileEntry {
  path: string
  reason: string
}

/** 方案提议（模型产出——替代 parseExecutionPlan 的裸文件集合） */
export interface PlanProposal {
  summary: string // 一句话方案
  files: Array<{ path: string; reason: string }> // 文件清单（含理由——A0 §5 派生源）
  assumptions: string[] // 方案假设（技术选型/行为细节——用户审阅点）
  verificationPlan: string[] // 验证计划（怎么证明做成了——「已解决」的证据承诺）
}

/** 可核验证据条目 */
export interface VerificationItem {
  command: string
  output?: string
  passed?: boolean
}

/** 完成证据（不足 = 声明不完整——不变量 4） */
export interface CompletionEvidence {
  verification: VerificationItem[] // 可核验证据（Aider lint 循环/Cline verified 方向）
  diffs: Array<{ path: string }> // diff 对账（用户原始目标 vs 声称完成）
  pendingQuestions: string[] // 模型自己不确定/需要用户判断的事项
}

/** 完成声明（模型产出） */
export interface CompletionClaim {
  summary: string
  evidence: CompletionEvidence
}

/** 授权请求（动作门控产出——DSH ApprovalRequest 同构） */
export interface ApprovalRequest {
  toolName: string
  subject: string // 要执行什么（命令/写哪个文件）
  reason: string // 为什么需要授权（verbatim）
  risk: 'low' | 'medium' | 'high'
}

/** 授权请求记录（ADR-017——ApprovalWindow.requests 成员；身份＝requestId，不透明） */
export interface ApprovalRecord {
  requestId: string
  kind: 'tool' | 'plan-batch' // plan-batch＝approve-files 合并卡（执行链仍走 approvalGranted＋planConfirmed——G2）
  toolName: string
  subject: string
  argsFingerprint: string
  request: ApprovalRequest // 呈现内容（reason/risk——卡展示视图）
  state: 'queued' | 'pending' | 'approved' | 'denied' | 'failed' | 'expired' | 'uncertain'
  decidedBy?: 'user' | 'rule' // rule＝预先裁决（00 §3.2 规则 2 骑注）
  decidedAt?: string // 审计时间戳，非身份
}

/** 授权窗口（领域真相源——无序号无代次；排序归时间线日志域） */
export interface ApprovalWindow {
  requests: ApprovalRecord[]
}

/** 授权答复凭据（对应确认卡族 DecisionAnswers 的窗口版） */
export interface ApprovalAnswers {
  requestId: string
}

export type DecidableApprovalState = 'queued' | 'pending'
/** 可决记录（§2 术语一处定义） */
export function decidableRequests(w: ApprovalWindow): ApprovalRecord[] {
  return w.requests.filter((r) => r.state === 'queued' || r.state === 'pending')
}

/** 拒绝原因类型（§2 Decision 三型之一——modify=修改决策） */
export type RejectKind = 'direction' | 'scope' | 'complexity' | 'missing-info' | 'modify' | 'other'

/** 拒绝原因（用户决策的一部分——Cline denial reason / Deep Code 回灌方向；不变量 8 必填） */
export interface RejectReason {
  kind: RejectKind
  text?: string // 自由文本 / 修正内容（modify 时）
  target?: string // 针对的具体内容（方案第几条/哪个文件/哪个假设）
}

/** 动作属性种类（门控判定结果——与模型自评无关） */
export type ActionKind = 'readonly' | 'in-plan' | 'out-of-plan' | 'network-read' | 'hazardous'

/** 动作属性判定依据（审计） */
export type ActionBasis =
  'tool-type' | 'command-head' | 'command-chain' | 'git-subcommand' | 'plan-list'

/** 动作属性（门控判定结果——§3.2） */
export interface ActionAttribute {
  kind: ActionKind
  basis: ActionBasis
}

/** 决策点种类 */
export type DecisionKind = 'goal' | 'plan' | 'approval' | 'resolution' | 'system_clarify'

/** ADR-010 强制澄清卡内容（系统触发——不经模型；underlying 指向被循环阻塞的真实决策点） */
export interface SystemClarifyProposal {
  underlying: 'goal' | 'plan' | 'resolution'
  statement: string // 被阻塞决策点的摘要（目标 statement / 方案 summary / 完成声明 summary）
}

// ============================================================================
// 会话级单一 PENDING（A0 §3.2——所有卡统一「等用户决策」；来源只是卡类型）
// ============================================================================
export type PendingKind = 'none' | DecisionKind

/** 决策点内容快照（决策点呈现与审计的唯一来源——run4「确认了什么无法追溯」解法） */
export interface DecisionContent {
  kind: DecisionKind
  proposal?: GoalProposal | PlanProposal | CompletionClaim | SystemClarifyProposal // 结构化内容
  approval?: ApprovalRequest // 授权请求内容
  since: string // 决策点出现时间（诊断）
  instanceId: number // ADR-015：＝置位时 decisionInstanceSeq（卡/按钮 render 冻结与恢复重建的载体）
}

/** 答复归属凭据（ADR-015 归属轴——用户对「哪一版待决内容」作答；渲染帧/入队时刻冻结，flush 原样回传） */
export interface DecisionAnswers {
  kind: PendingKind
  instanceId: number
}

// === Task 聚合状态（单一来源） ===
export interface ConversationState {
  goalConfirmed: boolean
  planConfirmed: boolean // 原 executionConfirmed——用户确认的是「方案」（与 PlanProposal 对应）
  resolutionConfirmed: boolean // 原 achievementConfirmed——用户确认的是「问题解决」（「达成」是模型声明）
  pending: PendingKind
  plannedFiles: Set<string> // A0 §5 宿主边界（追加语义——只由已确认的 PlanProposal.files 派生，不变量 6）
  producedFiles: Set<string> // write/edit 成功累积（进度数据）
  filesApproved: boolean // 本任务已批准过 approve-files（幂等——坑 95；设计 §3.1 清单外保留字段）
  lastToolFailed: boolean // 上一轮工具执行失败（坑 93 ②：策略引导 policy 不置）
  decisionContent?: DecisionContent // 当前待决策内容快照（决策点呈现与审计唯一来源）
  // —— 决策点身份（归属轴——ADR-015：descriptor 变→新实例；与 rejectStreak 协商轴正交）——
  decisionInstanceSeq: number // 当前呈现实例号：单调；setPending 唯一推进；恢复续号不回 0
  activeDescriptor?: string // 当前实例的决策描述符规范化键（descriptorOf 产物——"是否新实例"基准）
  deniedApprovals: Array<{ toolName: string; subject: string }> // 拒绝记忆（§3.4 C6——同轮同类动作短封，S6 actionGate 消费；任务边界重置）
  rejectStreak: number // 同一决策点连续拒绝计数（§4.1 C8——上限 3 超限回退澄清/人工接管；随确认/新提议重置；S3 消费）
  lastRejectReason?: RejectReason // S7（A0 审校 P1-4）：最近一次拒绝的原因（诊断——decision.resolved 载荷；confirm/其他转换清除）
  approvalWindow: ApprovalWindow // ADR-017——需批准事实的领域真相源；pending='approval' 为其单向派生呈现
  pendingRepeatCount: number // ADR-010 T1：同 kind 决策点连续 pending_set 次数（换 kind/决策清零）
  unresolvedTextReplies: number // ADR-010 T2：pending 存在期间用户连续文本回复数（决策清零）
}

export const initialState = (): ConversationState => ({
  goalConfirmed: false,
  planConfirmed: false,
  resolutionConfirmed: false,
  pending: 'none',
  plannedFiles: new Set(),
  producedFiles: new Set(),
  filesApproved: false,
  lastToolFailed: false,
  decisionInstanceSeq: 0,
  deniedApprovals: [],
  rejectStreak: 0,
  approvalWindow: { requests: [] },
  pendingRepeatCount: 0,
  unresolvedTextReplies: 0,
})

// ============================================================================
// ADR-015：决策描述符（DecisionDescriptor——归属轴判据；纯函数、无 crypto、可 L1 测）
// 白名单＝用户被要求拍板的结构化内容；排除模型措辞（summary/assumptions/reason/risk/output/since）
// ============================================================================

const joinUniqSorted = (xs: string[]): string => [...new Set(xs)].sort().join('|')

/** 决策描述符规范化键（集字段排序+去重 join——插入序 derivePlannedFiles 不可复用） */
export function descriptorOf(
  kind: DecisionKind,
  content?: Omit<DecisionContent, 'kind' | 'instanceId'>,
): string {
  const p = content?.proposal
  switch (kind) {
    case 'goal':
      return `goal:${(p as GoalProposal | undefined)?.statement ?? ''}`
    case 'plan': {
      const pp = p as PlanProposal | undefined
      return `plan:${joinUniqSorted((pp?.files ?? []).map((f) => f.path))}::${joinUniqSorted(pp?.verificationPlan ?? [])}`
    }
    case 'resolution': {
      const ev = (p as CompletionClaim | undefined)?.evidence
      // 含 passed（提案 §7-1：verdict 属被裁决对象——红转绿/unverifiable→核验 均为新实例）
      return `res:${joinUniqSorted((ev?.verification ?? []).map((v) => `${v.command}=${String(v.passed)}`))}::${joinUniqSorted((ev?.diffs ?? []).map((d) => d.path))}`
    }
    case 'approval':
      // approval descriptor 退役（ADR-017）——不入推号机制
      return ''
    case 'system_clarify': {
      const sc = p as SystemClarifyProposal | undefined
      return `clarify:${sc?.underlying ?? ''}::${sc?.statement ?? ''}`
    }
  }
}

// ============================================================================
// 转换（唯一入口——所有状态变化必须经过这里；返回新实例，原状态不可变）
// 不变量 1：状态推进只能由用户决策发生；不变量 8：拒绝必须带原因（签名强制 + 运行时校验）
// ============================================================================

/** 用户决策（设计 §3.4——confirm/reject 二元；modify = reject(kind='modify')+修正内容 → 模型重提议，不单列分支） */
export function userDecided(
  s: ConversationState,
  point: DecisionKind,
  decision: { confirm: true } | { confirm: false; reason: RejectReason },
  answers?: DecisionAnswers,
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
  }
  // ADR-015 身份门（不变量 1 唯一承载）：有活 pending 且答复不针对当前实例 → 整转换 no-op
  // （stale 在途文本/点旧卡/换 kind/跨任务/同 kind 续提议后的旧答复，全挡；连 rejectStreak 亦不动）。
  // answers 缺省＝迁移期实现豁免（跳门，行为同源现状）——非领域语义；stale 事件与可见重提示＝应用层前置探测义务。
  // 门比 s.pending 不比 point（X5）：system_clarify 委派递归透传原 answers 复过门自洽，无例外分支。
  if (
    answers &&
    s.pending !== 'none' &&
    !(answers.kind === s.pending && answers.instanceId === s.decisionInstanceSeq)
  ) {
    return s
  }
  // ADR-010：system_clarify 是系统触发的包装决策点——确认/拒绝直接委派 underlying（真实决策点）
  if (point === 'system_clarify') {
    const dc = s.decisionContent
    const underlying =
      dc?.kind === 'system_clarify'
        ? (dc.proposal as SystemClarifyProposal | undefined)?.underlying
        : undefined
    if (!underlying) {
      throw new TypeError('system_clarify 决策缺少 underlying（快照缺失/损坏）')
    }
    // 强制卡 = 升级梯度终点：点卡上「我要重新描述」是明确的新一轮协商——由调用方（强制卡按钮）
    // 经 resetRejectStreak 重置；pending 期间的打字拒绝仍走 C2 累积（A-024 循环形态，不重置）
    return userDecided(s, underlying, decision, answers)
  }
  const next: ConversationState = { ...s, pending: 'none', decisionContent: undefined }
  // ADR-010：任何用户决策都终结「无进展对话」状态——两类计数清零
  next.pendingRepeatCount = 0
  next.unresolvedTextReplies = 0
  if (decision.confirm) {
    next.lastRejectReason = undefined // S7（P1-4）：确认清除拒绝原因（诊断字段只保留最近一次拒绝）
    next.rejectStreak = 0 // §4.1 C8：决策点确认 → 连续拒绝计数重置
    if (point === 'goal') {
      // 目标确认 = 任务边界（A0 §9 目标驱动原点；对齐 clearTrust 语义）——新任务清零进度/清单/达成/拒绝记忆
      next.goalConfirmed = true
      next.planConfirmed = false
      next.resolutionConfirmed = false
      next.plannedFiles = new Set()
      next.producedFiles = new Set()
      next.filesApproved = false
      next.lastToolFailed = false
      next.deniedApprovals = []
    }
    if (point === 'plan') {
      // 方案确认蕴含目标确认（继承 handleExecutionConfirmed 现状语义）；plannedFiles 只由已确认方案派生（不变量 6）
      next.goalConfirmed = true
      next.planConfirmed = true
      // 决策内容按 kind 收窄（Q3 审计：不裸收窄三型 union——kind 非 plan 视同无 proposal，防御）
      const dc = s.decisionContent
      if (
        dc?.kind === 'plan' &&
        dc.proposal &&
        Array.isArray((dc.proposal as PlanProposal).files)
      ) {
        next.plannedFiles = derivePlannedFiles(s, dc.proposal as PlanProposal)
      }
    }
    if (point === 'resolution') {
      next.resolutionConfirmed = true
      // A-025（UAT-Sim 2026-09-07）：resolution = 任务边界——planConfirmed 必须重置，否则同会话
      // 下一任务的执行确认卡渲染条件 `!planConfirmed` 恒假 → 卡不渲染（真机实证 seq 848/851）
      next.planConfirmed = false
    }
    if (point === 'approval') {
      // 确认点不处理 approval（窗口族自管——ADR-017）——防御：不推进任何确认位
    }
  } else {
    const reason = decision.reason
    if (point === 'goal') next.goalConfirmed = false
    if (point === 'plan') next.planConfirmed = false
    if (point === 'resolution') next.resolutionConfirmed = false
    // §4.1 C8：同一决策点连续拒绝计数（含 kind='modify'——修改=拒绝）——超限处理（AskToAct 澄清/人工接管）S3 消费
    next.rejectStreak = s.rejectStreak + 1
    // S7（A0 审校 P1-4）：拒绝原因入状态（诊断——decision.resolved 载荷由 deriveStateEvents 读取；事件层回填模型）
    next.lastRejectReason = reason
  }
  return next
}

// ============================================================================
// ADR-010：无进展对话检测（T1 同决策点重复 / T2 pending 期间文本回复 / T4 总回合软上限）
// 行业对标：cline 连续错误上限（mistake-tracker）、gemini-cli loop detection、reasonix storm-breaker；
// 上限挂「无进展重复」而非总轮数——T4 仅作兜底（见 research/uat-forced-clarify-research-20260907.md）
// ============================================================================

/** T1：决策点置位计数——同 kind 连续 +1，换 kind 则重置为 1。
 *  调用契约：必须在 pending 变更**之前**调用（比较的是旧 pending）——renderer setPendingState 内先 note 后改 pending */
export function notePendingSet(s: ConversationState, kind: PendingKind): ConversationState {
  const sameAsLast = s.pending === kind
  return { ...s, pendingRepeatCount: sameAsLast ? s.pendingRepeatCount + 1 : 1 }
}

/** T2：pending 存在期间用户文本回复 +1（用户在试图用文字确认/回应——A-024 主动检测）；无 pending 清零 */
export function noteUserTextReply(s: ConversationState): ConversationState {
  return { ...s, unresolvedTextReplies: s.pending !== 'none' ? s.unresolvedTextReplies + 1 : 0 }
}

/** 触发判定：loop-guard（软重定向——引导模型让用户点卡）/ forced-clarify（系统强制澄清卡）/ null */
export function detectUnproductiveDialogue(
  s: ConversationState,
  turnCount = 0,
): 'loop-guard' | 'forced-clarify' | null {
  // rejectStreak 纳入（C2 隐式拒绝循环——A-024 真机机制：用户文本→隐式 reject(direction)→模型重提议→循环，
  // 每轮 reject 都走 userDecided 会清零 T1/T2 计数，唯 rejectStreak 持续累积）
  // rejectStreak 走更低阈值（1/2）：C2 隐式拒绝后模型常不重新提交提议（A-026——口头称卡已弹出），
  // 每一次拒绝都应立即注入「重新提交提议」引导；连续 2 次拒绝 = 协商失败 → 强制澄清卡
  if (s.rejectStreak >= 2) return 'forced-clarify'
  if (s.rejectStreak >= 1) return 'loop-guard'
  const repeated = Math.max(s.pendingRepeatCount, s.unresolvedTextReplies)
  if (turnCount >= 40) return 'forced-clarify' // T4：总回合软上限兜底
  if (repeated >= 3) return 'forced-clarify'
  if (repeated >= 2) return 'loop-guard'
  return null
}

// ============================================================================
// ADR-017：授权窗口转换族（§3.4 落地——allow/deny 同权入态；无钟可撞）
// 槽派生不变式（00 §3.2 要点 5）：pending='approval' ⇔ 窗含 pending 呈现记录 ∧ 无确认卡占槽。
// 幂等/闸的 stale 打点由调用层（useConversationState）凭"引用级 no-op"检测发事件——领域保持纯。
// ============================================================================

/** 同 id 已在窗→no-op（签发唯一性条款保证跨重启不撞号——A2）；slotBusy＝确认卡占槽 ∨ 窗已有 pending 呈现（P-03 基数） */
export function approvalRequested(
  s: ConversationState,
  rec: Omit<ApprovalRecord, 'state'>,
  slotBusy: boolean,
): ConversationState {
  if (s.approvalWindow.requests.some((r) => r.requestId === rec.requestId)) return s
  const hasVisible = s.approvalWindow.requests.some((r) => r.state === 'pending')
  const state: ApprovalRecord['state'] = slotBusy || hasVisible ? 'queued' : 'pending'
  const requests = [...s.approvalWindow.requests, { ...rec, state }]
  const pending: PendingKind = s.pending === 'none' && state === 'pending' ? 'approval' : s.pending
  return { ...s, approvalWindow: { requests }, pending }
}

/** 槽↔窗双向同步（00 §3.2 要点 5）：有可见 pending 记录且槽空闲 → 槽回 'approval'（确认卡让位后恢复呈现）；
 *  槽为 approval 但窗无可见记录 → 释放（dc 残值一并清——dc.approval 面退役） */
export function windowResolved(s: ConversationState): ConversationState {
  const visible = s.approvalWindow.requests.some((r) => r.state === 'pending')
  if (s.pending === 'approval' && !visible)
    return { ...s, pending: 'none', decisionContent: undefined }
  if (s.pending === 'none' && visible) return { ...s, pending: 'approval' }
  return s
}

/** 决定：闸＝id∈窗 ∧ 可决；miss/已决→引用级 no-op（调用层 stale 打点）；batch 逐 id 记账（一决定 N 记录） */
export function approvalDecided(
  s: ConversationState,
  target: { requestId: string } | { batch: 'window' } | { batch: 'reject-rest'; keep: string[] },
  decision: { confirm: true } | { confirm: false; reason: RejectReason },
  by: 'user' | 'rule' = 'user', // 缺省 user；rule＝预先裁决命中（C3 drain 回写——同闸同记，decidedBy 入档）
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
  }
  const decidable = decidableRequests(s.approvalWindow)
  const hit = (r: ApprovalRecord): boolean =>
    'requestId' in target
      ? r.requestId === target.requestId
      : target.batch === 'window'
        ? true
        : !target.keep.includes(r.requestId)
  const affected = decidable.filter(hit)
  if (affected.length === 0) return s
  const now = new Date().toISOString()
  const ids = new Set(affected.map((r) => r.requestId))
  const requests = s.approvalWindow.requests.map((r) =>
    ids.has(r.requestId)
      ? {
          ...r,
          state: (decision.confirm ? 'approved' : 'denied') as ApprovalRecord['state'],
          decidedBy: by,
          decidedAt: now,
        }
      : r,
  )
  const next: ConversationState = { ...s, approvalWindow: { requests } }
  if (!decision.confirm) {
    // C6 拒绝记忆（机制不变）：每条被拒记录入 deniedApprovals（actionGate 同轮同类短封——canExecute 消费）
    next.deniedApprovals = [
      ...s.deniedApprovals,
      ...affected.map((r) => ({ toolName: r.toolName, subject: r.subject })),
    ]
    next.lastRejectReason = decision.reason
  } else {
    next.lastRejectReason = undefined
  }
  return drainQueued(windowResolved(next))
}

/** 执行回写收敛：done→幂等 no-op（进度真相在 journal——领域不重复记账）；failed→记录置 failed（防双真相） */
export function approvalExecutionSettled(
  s: ConversationState,
  requestId: string,
  outcome: 'done' | 'failed',
): ConversationState {
  if (outcome === 'done') return s
  const r = s.approvalWindow.requests.find(
    (x) => x.requestId === requestId && x.state === 'approved',
  )
  if (!r) return s
  const requests = s.approvalWindow.requests.map((x) =>
    x === r ? { ...x, state: 'failed' as const } : x,
  )
  return windowResolved({ ...s, approvalWindow: { requests } })
}

/** 槽释放后 queued→pending（呈现队列推进步——仅 approval 槽空且无呈现时） */
export function drainQueued(s: ConversationState): ConversationState {
  if (s.pending !== 'none') return s
  if (s.approvalWindow.requests.some((r) => r.state === 'pending')) return s
  const idx = s.approvalWindow.requests.findIndex((r) => r.state === 'queued')
  if (idx < 0) return s
  const requests = s.approvalWindow.requests.map((r, i) =>
    i === idx ? { ...r, state: 'pending' as const } : r,
  )
  return { ...s, approvalWindow: { requests }, pending: 'approval' }
}

/** uncertain（journal 判 C）唯一用户出口——禁自动重放；rerun＝回 approved 待调用层再 execute（journal 侧 rerun 授权由 main 判） */
export function resolveUncertain(
  s: ConversationState,
  requestId: string,
  _choice: 'settled-done' | 'authorize-rerun', // 两选项呈现态同收敛 approved；差异（是否再 execute）由调用层承接
): ConversationState {
  const r = s.approvalWindow.requests.find(
    (x) => x.requestId === requestId && x.state === 'uncertain',
  )
  if (!r) return s
  const requests = s.approvalWindow.requests.map((x) =>
    x === r
      ? {
          ...x,
          state: 'approved' as const,
          decidedBy: 'user' as const,
          decidedAt: new Date().toISOString(),
        }
      : x,
  )
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}

/** 恢复/重连三判（§5）：done→收敛（approved 幂等）；started∧¬done→uncertain；issued/approved→存续（判 A）；
 *  窗内有、rows 无（异机/旧档退化）→未决 expired、approved failed——仅退化分支 */
export function reconcileJournal(
  s: ConversationState,
  rows: Array<{ requestId: string; phase: 'issued' | 'approved' | 'started' | 'done' }>,
): ConversationState {
  const phase = new Map(rows.map((r) => [r.requestId, r.phase]))
  const requests = s.approvalWindow.requests.map((r) => {
    const p = phase.get(r.requestId)
    if (p === undefined) {
      if (r.state === 'queued' || r.state === 'pending') return { ...r, state: 'expired' as const }
      if (r.state === 'approved') return { ...r, state: 'failed' as const }
      return r
    }
    if (p === 'started') return { ...r, state: 'uncertain' as const }
    return r // done/issued/approved：呈现态存续（执行进度真相在 journal）
  })
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}

/** ttl/legacy 过期（§5 判 C 之外的独立到期）：未决→expired；approved∧未 settled→failed（"批了没跑"＝失败可重批） */
export function expireWindow(s: ConversationState, reason: 'ttl' | 'legacy'): ConversationState {
  const requests = s.approvalWindow.requests.map((r) =>
    r.state === 'queued' || r.state === 'pending'
      ? { ...r, state: 'expired' as const, decidedBy: undefined, decidedAt: undefined }
      : r.state === 'approved' && reason === 'legacy'
        ? { ...r, state: 'failed' as const }
        : r,
  )
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}

// 兼容壳（S3 由 userDecided 直连取代——renderer 现状消费；缺省拒绝原因仅兼容旧调用，新代码一律显式带原因）
export function userConfirmed(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution' | 'system_clarify',
  answers?: DecisionAnswers,
): ConversationState {
  return userDecided(s, point, { confirm: true }, answers)
}

export function userRejected(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution' | 'system_clarify',
  reason: RejectReason,
  answers?: DecisionAnswers,
): ConversationState {
  // A-006：reason 必传——不变量 8 真身（userDecided throw）不得被兼容壳缺省绕过
  return userDecided(s, point, { confirm: false, reason }, answers)
}

// 卡弹出 → 会话进入 PENDING（A0 §3.2 单一 PENDING——pending 只有一个；不变量 7）
// ADR-015：setPending＝归属轴唯一推进点——kind 变或 descriptor 变 → 新实例（seq+1）；
// 描述符等值重提议＝同实例（seq 不变——"重提议＝同一决策点延续"，队列确认语照落地）；
// 恒铺骨架（X2）：decisionContent 必带 instanceId（approval 置位须携 ApprovalRequest 才有描述符载体）
export function setPending(
  s: ConversationState,
  kind: Exclude<PendingKind, 'none'>,
  content?: Omit<DecisionContent, 'kind' | 'instanceId'>,
): ConversationState {
  // §4.1 C8 计数语义（S1.1 审计裁定）：模型重提议（新 content）属**同一决策点延续**——不重置计数
  // （否则「连续拒绝 3 次上限」因每次重提议清零而永远不触发——协商保护失效）；
  // 「随新提议重置」按 C2 语义 = 用户新意图（pending 期间新自由文本 → reject(direction)+新 GoalProposal）
  // 是**新决策点**——由应用层经 goal 确认边界/新任务重置（S3 接线）；领域层只承载计数
  // ADR-010 T1：同 kind 连续置位计数（换 kind 重置为 1——notePendingSet 比较旧 pending）；
  // 计数只增不清（清零唯二入口：userDecided / noteUserTextReply 的 none 分支），避免重提议洗掉循环证据
  const descriptor = descriptorOf(kind, content)
  const seq =
    kind !== s.pending || descriptor !== s.activeDescriptor
      ? s.decisionInstanceSeq + 1
      : s.decisionInstanceSeq
  const noted = notePendingSet(s, kind)
  return {
    ...noted,
    pending: kind,
    decisionInstanceSeq: seq,
    activeDescriptor: descriptor,
    decisionContent: { since: '', ...content, kind, instanceId: seq },
  }
}

// ADR-015 恢复旁路（§8.2E）：直置 pending/快照/seq（续号不回 0）——应用层不经 transition、不 emit
// （仿 useConversationState restorePlanned 先例：恢复是系统初始化非用户转换——不推号、不派生事件）
export function restorePending(s: ConversationState, dc: DecisionContent): ConversationState {
  return {
    ...s,
    pending: dc.kind,
    decisionContent: dc,
    decisionInstanceSeq: dc.instanceId,
    activeDescriptor: descriptorOf(dc.kind, dc),
  }
}

// ADR-015 应用层前置探测的判据（纯函数——send 路由与域门共用同一语义；echo 豁免规则也在调用方）
export function isAnswerStale(
  cur: { pending: PendingKind; decisionInstanceSeq: number },
  answers: DecisionAnswers,
): boolean {
  return !(cur.pending === answers.kind && cur.decisionInstanceSeq === answers.instanceId)
}

// ADR-015 旧会话补水（§8.2E 兼容）：存量快照无 instanceId → 视作新实例续号（拒 undefined/NaN 静默杀全门）
export function hydrateDecisionContent(
  dc: Omit<DecisionContent, 'instanceId'> & { instanceId?: number },
  fallbackSeq: number,
): DecisionContent {
  return { ...dc, instanceId: dc.instanceId ?? fallbackSeq + 1 }
}

// approve-files 批准 → 计划清单追加（A0 §5 追加语义——不覆盖前批）+ 幂等标记（坑 95）
// 兼容壳（S3 起由「plan 确认携带 PlanProposal」取代；approve-files 批量授权路径保留）
export function approvalGranted(s: ConversationState, files: string[]): ConversationState {
  const planned = new Set(s.plannedFiles)
  files.forEach((f) => planned.add(f))
  return { ...s, plannedFiles: planned, filesApproved: true, pending: 'none' }
}

// 工具结果 → 进度数据 + 失败标记（缝隙 6：诊断上下文汇入状态）
export function applyToolResult(
  s: ConversationState,
  r: { name: string; ok: boolean; needApproval?: boolean; policy?: boolean; file?: string },
): ConversationState {
  const next = { ...s }
  if (r.ok) {
    next.lastToolFailed = false
    if ((r.name === 'write' || r.name === 'edit') && r.file) {
      const produced = new Set(s.producedFiles)
      produced.add(r.file)
      next.producedFiles = produced
    }
  } else if (!r.needApproval && !r.policy) {
    next.lastToolFailed = true // 坑 93 ②：策略引导（policy）≠ 执行失败
  }
  return next
}

// ============================================================================
// 派生（纯函数——所有机制从此读取，不再各自推断）
// ============================================================================

// —— 动作属性判定（设计 §3.3 classifyReadonly——粒度升级：bash 链递归/git 子命令/网络只读） ——

// 只读命令头白名单（继承 main isReadOnlyBash fail-closed 判定——列表唯一）
// #6 真机 2026-08-30（P2-5 授权疲劳）：补 ps/lsof 等诊断只读头——真机 `ps aux | grep …` 授权卡连弹
export const BASH_READONLY_HEADS: ReadonlySet<string> = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'wc',
  'pwd',
  'echo',
  'which',
  'find',
  'sed',
  'awk',
  'cd',
  'stat',
  'file',
  'du',
  'df',
  'sort',
  'uniq',
  'rg',
  'tree',
  'diff',
  'history',
  'ps',
  'lsof',
  'uname',
  'whoami',
  'hostname',
  'id',
  'date',
])

// 2026-08-22 #6 真机体验闭环（问题 4——P1 根因链）：危险命令的**只读形态**排除——
// 真机取证：`node -v 2>&1; echo ---npm---; npm -v 2>&1` 验证环境被 `;` 链递归误判 hazardous
// （node/npm 是危险词，但 -v/--version 查询只读）→ sessionGate 拦「方案未确认」→ 模型无法验证
// 环境 → 被迫进方案决策点 → 空方案卡（根因链源头）。段级判定：段首危险命令 + 只读参数形态 → 非危险
const BASH_DANGEROUS_READONLY_SHAPE =
  /^(?:sudo\s+)?(node|npm|pnpm|yarn|python|python3)\s+(-v|--version|-V|-h|--help)\b|^which\s+[a-zA-Z0-9._-]+$/

// 段首命令词是否为危险命令（链递归用——**段首**匹配，非任意子串：`echo ---npm---` 的 npm 是参数不判危险）
const BASH_SEGMENT_DANGEROUS_HEAD =
  /^(?:sudo\s+)?(rm|mv|cp|mkdir|touch|npm|pnpm|yarn|git|curl|wget|python|python3|node|install|unlink|ln|chmod|chown)\b/

// git 只读子命令（Codex is_safe_git_command 方向）
const GIT_READONLY_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'ls-files',
  'remote',
])

/** 动作只读判定（升级版——设计 §3.3）：readonly / network-read / hazardous（fail-closed） */
export function classifyReadonly(name: string, command?: string): ActionKind {
  if (name === 'write' || name === 'edit') return 'hazardous'
  if (name !== 'bash') return 'readonly' // read/search/LSP/check-capability → 工具类型只读
  const c = String(command ?? '').trim()
  if (!c) return 'hazardous' // 空命令 fail-closed（非只读）
  // 网络只读（curl/wget GET/HEAD 无写副作用 → network-read；拍板 3：localhost 自动放行，外网 ask——S6 策略落地在 actionGate）
  const netMatch = c.match(/^(curl|wget)\s+/)
  if (netMatch) {
    const method = c.match(/-X\s+(GET|HEAD)\b|--request\s+(GET|HEAD)\b/)
    // 写副作用标志（S6 复审补全——curl -o/-O/-T/-a/-C/-J 与 wget -O 大小写敏感漏网→localhost 自动放行下成洞）：
    // -o/--output 输出文件；-O/--remote-name/-J 落盘 CWD；-T/--upload-file 上传（写远端）；-a/--append 追加；-C/--continue-at 续传
    // #6 真机 2026-08-30（P2-5）：`-o /dev/null` 例外——健康检查惯用法（不落盘），不计写副作用
    const hasBodyFlag =
      /-d\b|--data\b|--data-raw\b|-F\b|--form\b|-X\s+(POST|PUT|PATCH|DELETE)\b|-o(?!\s*\/dev\/null\b)|--output(?!\s*\/dev\/null\b)|--remote-name\b|-J\b|-T\b|--upload-file\b|-a\b|--append\b|-C\b|--continue-at\b|-O\b/.test(
        c,
      ) // -O 大写（wget -O file——大小写敏感补全）
    if (!hasBodyFlag && (!method || method[1] === 'GET' || method[1] === 'HEAD'))
      return 'network-read'
    return 'hazardous'
  }
  // 重定向到文件 → 写副作用（2026-08-22 问题 4：排除 stderr 重定向 `2>&1`/`2>>1`——不写文件）
  // A-020（S5 真机）：stderr 丢弃 `2>/dev/null`/`2>>/dev/null` 同为不落盘——一并排除
  //（真机实证：`head -20 README.md 2>/dev/null` 被判 hazardous → 兜底强置空方案卡冻结工具——P1 ①）
  const stripped = c.replace(/2>&1|2>>1|2>>?\/dev\/null/g, '')
  if (/>\s*[^|]*$/m.test(stripped)) return 'hazardous'
  // 链递归：& / ; / | 分隔的每一段——段首为危险命令且非只读形态 → hazardous
  // 2026-08-22 问题 4：段级只读形态排除（node -v / npm --version / which node 查询 → 非危险）；
  // 段首匹配（echo ---npm--- 的 npm 是参数——不误伤）；
  // 链分隔：`2>&1` 中的 `&` 是 stderr 重定向不是链分隔——先保护再分割（原 `[;&|]` 把 2>&1 误拆成 2> 和 1）
  const protectedCmd = c.replace(/2>&1|2>>1|2>>?\/dev\/null/g, '§§§') // 保护 stderr 重定向（§ 非链分隔符）
  const segments = protectedCmd.split(/[;&|]/).map((seg) => seg.trim().replace(/§§§/g, '2>&1'))
  if (
    segments.length > 1 &&
    segments.some(
      (seg) => BASH_SEGMENT_DANGEROUS_HEAD.test(seg) && !BASH_DANGEROUS_READONLY_SHAPE.test(seg),
    )
  )
    return 'hazardous'
  const head = segments[0].split(/\s+/)[0]?.replace(/^sudo\s+/, '') ?? ''
  // git 子命令级判定（git status/log/diff 只读；git push/commit 写）
  if (head === 'git') {
    const sub = segments[0].split(/\s+/)[1] ?? ''
    return GIT_READONLY_SUBCOMMANDS.has(sub) ? 'readonly' : 'hazardous'
  }
  // 2026-08-22 问题 4：危险命令的只读形态（node -v / npm --version / which node）→ readonly
  // （单段/链段均适用——head 匹配 + 只读参数形态）
  if (BASH_DANGEROUS_READONLY_SHAPE.test(segments[0])) return 'readonly'
  return BASH_READONLY_HEADS.has(head) ? 'readonly' : 'hazardous'
}

// S6（§8.1 A + 拍板 3）：classifyAction 兼容壳移除——由 classifyReadonly + isSideEffectAction 直连取代。
// network-read 语义升级：localhost 自动放行（非 side-effect）/ 外网 ask（side-effect——安全默认）。
// 判定统一领域层（坑 97——renderer 6 处 + main preApproval 全部同源消费）。

/** localhost 判定（拍板 3 单源——actionGate 与 isSideEffectAction 共享；S6 复审：**host 精确匹配**——
 * 防子串误报（127.0.0.1.attacker.com / localhost.evil.io 不得自动放行）——只认协议头后的 host 为
 * localhost/127.0.0.1/::1（可带端口） */
export function isLocalhostCommand(command: string): boolean {
  // 匹配 http(s):// 或裸 host 开头的 localhost/127.0.0.1/[::1]（host 段结束于 / : 空白——精确边界）
  return /(?:^|\s)(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$|\s)/.test(
    command,
  )
}

/** 动作是否构成「需用户决策的副作用」（S6 同源判定——renderer 确认卡/拦截 + main 授权流）：
 * readonly → 非（自动放行）；network-read localhost → 非（拍板 3 自动放行）；
 * network-read 外网 → 是（外网 GET ask——安全默认）；write/edit/hazardous → 是（恒——fail-closed） */
export function isSideEffectAction(name: string, command?: string): boolean {
  const kind = classifyReadonly(name, command)
  if (kind === 'readonly') return false
  if (kind === 'network-read') return !isLocalhostCommand(String(command ?? ''))
  return true
}

export interface ExecAction {
  name: string
  command?: string
  path?: string
}

/** 动作是否需授权（S1 判定：out-of-plan/hazardous 需授权——S6 actionGate 策略联动） */
export function actionNeedsApproval(a: ActionAttribute): boolean {
  return a.kind === 'out-of-plan' || a.kind === 'hazardous'
}

// —— 门控（双维正交——不变量 3：SessionGate 优先于 ActionGate） ——

/** 会话状态门（冻结 + 确认点前置——继承 canExecute 前半） */
export function sessionGate(
  s: ConversationState,
  action: ExecAction,
): { ok: boolean; reason: string } {
  if (s.pending !== 'none') {
    return { ok: false, reason: `会话等待用户决策（${s.pending}）——此动作无效` }
  }
  const kind = classifyReadonly(action.name, action.command)
  if (kind === 'readonly' || kind === 'network-read') return { ok: true, reason: '' }
  // 副作用（hazardous/write/edit）：确认点前置
  // #8（拦截引导优化）：拒绝回填给出**下一步明确动作**（对齐 sysPrompt ⑬⑭ 提议格式契约——
  // 模型被拦后按引导重提议，而非盲目重试）
  if (!s.goalConfirmed) {
    return {
      ok: false,
      reason: '目标未确认——先输出【目标确认：一句话目标】提议目标（用户确认后工具才放行）',
    }
  }
  if (!s.planConfirmed) {
    return {
      ok: false,
      reason: '方案未确认——先输出【执行方案】清单（文件+原因）等用户确认（确认后工具才放行）',
    }
  }
  // A0 §3.5：方案已确认 → 按计划清单判定（write/edit 新建/清单外 → 拒绝；清单空则无边界）
  if (
    (action.name === 'write' || action.name === 'edit') &&
    s.plannedFiles.size > 0 &&
    !inPlannedFiles(s, action)
  ) {
    const approved = [...s.plannedFiles].map((p) => p.split('/').pop()).join('、')
    return {
      ok: false,
      reason: `不在批准清单（已批准：${approved || '无'}）——改写清单内文件或再次调 approve-files 补充`,
    }
  }
  return { ok: true, reason: '' }
}

// 清单匹配判定（Q5 单源——S3 统一：renderer 引用本函数，消除双实现；相对/绝对/目录尾斜杠兼容）
export function inPlannedFiles(s: ConversationState, action: ExecAction): boolean {
  const p = String(action.path ?? '')
  return [...s.plannedFiles].some((f) => f === p || f.endsWith('/' + p) || p.endsWith('/' + f))
}

export interface ActionGatePolicy {
  /** 高危动作策略（S6 配置化——默认 ask；deny 为机制拦截） */
  hazardous?: 'ask' | 'deny'
  /** 网络只读策略（拍板 3：localhost 自动放行，外网 ask——S1 落地） */
  networkRead?: { allowLocalhost: boolean }
}

export interface ActionGateResult {
  verdict: 'allow' | 'ask' | 'deny'
  attribute: ActionAttribute
  risk: 'low' | 'medium' | 'high'
}

/** 动作属性门（属性判定 + 放行/询问/拦截——不变量 3 的第二维） */
export function actionGate(
  action: ExecAction,
  inPlanned: boolean,
  policy?: ActionGatePolicy,
): ActionGateResult {
  const kind = classifyReadonly(action.name, action.command)
  if (kind === 'readonly') {
    return { verdict: 'allow', attribute: { kind: 'readonly', basis: 'tool-type' }, risk: 'low' }
  }
  if (kind === 'network-read') {
    // 拍板 3：curl 对 localhost 自动放行，外网 GET ask（isLocalhostCommand 单源——isSideEffectAction 共享）
    const cmd = String(action.command ?? '')
    const localhost = isLocalhostCommand(cmd)
    const allowLocal = policy?.networkRead?.allowLocalhost ?? true
    if (allowLocal && localhost) {
      return {
        verdict: 'allow',
        attribute: { kind: 'network-read', basis: 'command-head' },
        risk: 'low',
      }
    }
    return {
      verdict: 'ask',
      attribute: { kind: 'network-read', basis: 'command-head' },
      risk: 'medium',
    }
  }
  if (action.name === 'write' || action.name === 'edit') {
    if (inPlanned) {
      return { verdict: 'allow', attribute: { kind: 'in-plan', basis: 'plan-list' }, risk: 'low' }
    }
    return {
      verdict: 'ask',
      attribute: { kind: 'out-of-plan', basis: 'plan-list' },
      risk: 'medium',
    }
  }
  // hazardous（bash 写/未知）
  const hazardous = policy?.hazardous ?? 'ask'
  return {
    verdict: hazardous,
    attribute: { kind: 'hazardous', basis: 'command-chain' },
    risk: 'high',
  }
}

/** 唯一门控入口（不变量 3：SessionGate 优先，通过后 ActionGate）
 * 注意：ask 不在此拒绝——授权卡机制在执行层（main 返回 needApproval——现状授权闭环）；
 * actionGate 的 ask/deny 全量接线在 S6（只读自动/越界 ask/高危 deny 进执行流）。S1 只拦 deny（策略级拦截）。 */
export function canExecute(
  s: ConversationState,
  action: ExecAction,
  inPlanned: boolean,
  policy?: ActionGatePolicy,
): { ok: boolean; reason: string } {
  const gate = sessionGate(s, action)
  if (!gate.ok) return gate
  // S7（A0 审校 P1-2 接线——§3.4 C6 短封）：拒绝记忆——同任务内被拒绝的同类动作直接 deny
  // （「不要绕过」机制层落地——拒绝的 toolName+命令类匹配；任务边界重置（goal 确认清 deniedApprovals））
  const denied = s.deniedApprovals.some(
    (d) =>
      d.toolName === action.name &&
      (!d.subject ||
        d.subject === String(action.command ?? action.path ?? '') ||
        // bash 命令匹配命令头（同命令类拒绝——rm 类的另一条 rm 也短封）
        (action.command !== undefined &&
          d.subject.length > 0 &&
          String(action.command).startsWith(d.subject.split(/\s+/)[0] ?? ''))),
  )
  if (denied) return { ok: false, reason: '动作已被你拒绝（拒绝记忆——同轮同类短封）' }
  // 清单为空（无计划）→ 无文件边界（写放行由确认点把关——继承现状语义）
  const effectiveInPlanned =
    (action.name === 'write' || action.name === 'edit') && s.plannedFiles.size === 0
      ? true
      : inPlanned
  const verdict = actionGate(action, effectiveInPlanned, policy)
  if (verdict.verdict === 'deny')
    return { ok: false, reason: `动作被策略拦截（${verdict.attribute.kind}）` }
  return { ok: true, reason: '' }
}

// —— 决策点派生（触发权重构——不变量 2：决策点 = 确定性纯函数；不变量 7：单值返回） ——

export interface DecisionProposals {
  goal?: GoalProposal
  plan?: PlanProposal
  completion?: CompletionClaim
}

/**
 * 决策点派生（设计 §3.3）：状态 × 提议 × 待执行动作 × 用户主动请求 → 唯一决策点
 * 规则（顺序命中）：goal → plan → approval → resolution；userRequested（goalFallback 语义——用户无提议时主动发起确认）
 */
export function deriveDecisionPoint(
  state: ConversationState,
  proposals: DecisionProposals = {},
  pendingActions: ActionAttribute[] = [],
  userRequested?: DecisionKind,
): PendingKind | 'none' {
  // 1. 目标提议存在（或用户主动请求目标确认）→ goal
  //    #7（ADR-006）：goal 已确认后的新目标提议 = 换目标/新任务提议——仍触发（确认=任务边界清理，
  //    拒绝=维持当前任务）；误弹防御：模型同任务内重复【目标确认】标记（sysPrompt ⑬ 契约 + 测试锁定）
  if (proposals.goal !== undefined || userRequested === 'goal') return 'goal'
  // 2. 目标已确认 && 方案提议存在（或用户主动请求方案确认）&& 方案未确认 → plan
  if (
    state.goalConfirmed &&
    !state.planConfirmed &&
    (proposals.plan !== undefined || userRequested === 'plan')
  )
    return 'plan'
  // 3. 目标+方案已确认 && 存在需授权动作 → approval（不变量 3 同源：动作属性判定）
  if (state.goalConfirmed && state.planConfirmed && pendingActions.some(actionNeedsApproval))
    return 'approval'
  // 4. 完成声明存在（含证据——不变量 4：无证据不进入对账）&& 未确认解决 → resolution
  if (!state.resolutionConfirmed && proposals.completion !== undefined) {
    if (completionEvidenceComplete(proposals.completion.evidence)) return 'resolution'
    return 'none' // 证据不足 → 不进入对账（引导由 S4 回填）
  }
  // 5. 用户主动请求（goalFallback 兜底——其余决策点）
  if (userRequested && userRequested !== 'approval') return userRequested
  return 'none'
}

// —— 完成对账（不变量 4：无证据不进入对账——verifyCompletion 纯逻辑部分 + V1a/V1b 系统核验 S2 扩展） ——

/** 验证命令是否系统可代跑（只读——V1a 核验范围；network-read 同为可代跑核验） */
function isSystemVerifiable(command: string): boolean {
  const kind = classifyReadonly('bash', command)
  return kind === 'readonly' || kind === 'network-read'
}

/** 证据可核验性（不变量 4 单源——completionEvidenceComplete 与 verifyCompletion.ok 共用）：
 * verification 非空 + **至少一条**系统可代跑（`isSystemVerifiable`）。
 * ADR-011：unverifiable 仅标注，不单独否决；零条可代跑 → false。
 * ADR-008：pendingQuestions 不计入（遗留问题=知情项，非证据缺失）。 */
export function evidenceVerifiable(evidence: CompletionEvidence): boolean {
  if (evidence.verification.length === 0) return false
  return evidence.verification.some((item) => isSystemVerifiable(item.command))
}

/** V1a：claim.output ↔ 代跑 stdout 对齐（ADR-011）——去空白后双向包含；空串不对齐 */
function outputAligns(claimed: string | undefined, actual: string | undefined): boolean {
  if (claimed == null || actual == null) return false
  const a = claimed.replace(/\s+/g, '').trim()
  const b = actual.replace(/\s+/g, '').trim()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/** 证据完整性判定（兼容壳——语义 = evidenceVerifiable；S4 接线时可由 verifyCompletion 直连取代） */
export function completionEvidenceComplete(evidence: CompletionEvidence): boolean {
  return evidenceVerifiable(evidence)
}

/** 系统核验数据（S2 V1a/V1b——verifyCompletion 第二参数；由 main 进程在 S4 接线时提供）
 * 领域层只消费「系统已核验」的同步快照（V1a 代跑执行在 main 侧——领域层保持纯逻辑 L1 可测） */
export interface SystemVerifier {
  /** V1a：只读验证命令的系统代跑结果（command → 复核 ok 与否；缺省 = 系统未核验——按模型自报 passed 计） */
  verificationResults: Record<string, { ok: boolean; output?: string }>
  /** V1b：diff 对账系统派生——从 plannedFiles/producedFiles 派生比对（非模型自述） */
  deriveDiffs(planned: Set<string>, produced: Set<string>): Array<{ path: string }>
  plannedFiles: Set<string>
  producedFiles: Set<string>
}

/**
 * 完成声明核验（设计 §3.3 / ADR-011）：
 * ok = missing 空且至少一条可代跑（hasSystemEvidence）；unverifiable 可非空（仅标注）。
 * - 纯逻辑：verification 空 / passed=false → missing；非只读 → unverifiable（仍列出）
 * - V1a/V1b（systemState）：代跑 ok:false → missing；planned 未产出 → missing
 * - 全部不可代跑 → ok=false（无系统证据）；空 verification 不放宽
 * - ADR-008：pendingQuestions 不阻塞 ok
 */
export function verifyCompletion(
  claim: CompletionClaim,
  systemState?: SystemVerifier,
): {
  ok: boolean
  missing: string[]
  unverifiable: string[]
} {
  const missing: string[] = []
  const unverifiable: string[] = []
  if (claim.evidence.verification.length === 0) missing.push('verification')
  for (const item of claim.evidence.verification) {
    if (item.passed === false) missing.push(`verification:${item.command}`)
    // 非只读验证命令（系统不可代跑）→ unverifiable（拍板 4：标记 + 用户对账时提示「该证据未经系统核验」；
    // 与 evidenceVerifiable 同源——isSystemVerifiable）
    if (!isSystemVerifiable(item.command)) unverifiable.push(item.command)
  }
  // S2 V1a：系统代跑结果复核（只读命令——系统已核验且失败 → missing；「自报」降级为「系统复核」）
  // ADR-011：exit 非0 但 stdout 与 claim.output 对齐（如 grep -c → "0"）→ 不 missing
  if (systemState) {
    for (const item of claim.evidence.verification) {
      if (item.passed === false) continue // 已计 missing
      if (!isSystemVerifiable(item.command)) continue // 已计 unverifiable——系统不代跑
      const result = systemState.verificationResults[item.command]
      if (!result) continue
      const aligned = !result.ok && outputAligns(item.output, result.output)
      if (result.ok || aligned) continue
      if (!missing.includes(`verification:${item.command}`)) {
        missing.push(`verification:${item.command}`)
      }
    }
    // S2 V1b：diff 对账系统派生——planned 有文件未产出（不在 produced）→ missing（系统核对，非模型自述）
    // A-021 r2：覆盖判定从 produced 侧计数改为 **planned 侧逐项覆盖**——集合可能含同一文件的相对/绝对
    // 双形态登记（真机实证：propose_plan 注册时 rootPath 未注入 → 'index.html'；approve-files → 绝对），
    // 产生侧计数恒 < planned.size → 相对形态永远 not-produced → resolution 不可达（真机三连 evidence_missing）
    if (
      systemState.plannedFiles.size > 0 &&
      [...systemState.plannedFiles].some((q) => !matchesPlannedPath(q, systemState.producedFiles))
    ) {
      missing.push('diff:planned-not-produced')
    }
  }
  const hasSystemEvidence = claim.evidence.verification.some((item) =>
    isSystemVerifiable(item.command),
  )
  return { ok: missing.length === 0 && hasSystemEvidence, missing, unverifiable }
}

/** V1b diff 对账系统派生（S4 单源——renderer/main 共用）：planned ∩ produced 匹配项。
 * verifyCompletion 消费语义（A-021 r2）：planned 逐项 matchesPlannedPath 覆盖判定。
 * A-021（S5 真机 2026-09-06）：plannedFiles 存在相对/绝对双形态登记（propose_plan 注册时 rootPath 尚未
 * 注入 → trustPath 保留相对 'index.html'；approve-files 批准 → 绝对）——精确匹配恒 miss → 相对项永远
 * not-produced → resolution 不可达（真机实证：report_completion 连续 3 次 evidence_missing 死锁）。
 * 修正：精确匹配外加路径末段边界匹配（'/…/index.html' 以 '/index.html' 结尾 = 同一文件）。 */
export function deriveDiffs(planned: Set<string>, produced: Set<string>): Array<{ path: string }> {
  return [...produced]
    .filter((p) => [...planned].some((q) => q === p || p.endsWith('/' + q)))
    .map((path) => ({ path }))
}

/** A-021：planned 清单项 q 是否已被 produced 产出覆盖——精确相等或 produced 末段边界匹配
 *（q 相对 'index.html'，produced '/…/index.html' → 同一文件；q 需非空——trustPath 空 fallback 不算已产出） */
export function matchesPlannedPath(q: string, produced: ReadonlySet<string>): boolean {
  if (!q) return false
  if (produced.has(q)) return true
  for (const p of produced) {
    if (p.endsWith('/' + q)) return true
  }
  return false
}

// —— 证据不足回填引导（S4——§6 S4 + §3.3：完成声明被拒 → 引导文本注入模型重新输出带证据声明） ——

/** verifyCompletion 结果 → 回填引导文本（ok=true → 空串——不注入；ok=false → 缺失/未核验清单显式列出）。
 * 纯函数（L1 可测）——注入时机与触发续轮由应用层（S4 接线）承担 */
export function buildEvidenceBackfill(v: {
  ok: boolean
  missing: string[]
  unverifiable: string[]
}): string {
  if (v.ok) return ''
  const lines: string[] = []
  if (v.missing.length > 0) lines.push(`证据不足：${v.missing.join('；')}`)
  if (v.unverifiable.length > 0) {
    lines.push(`以下证据未经系统核验：${v.unverifiable.join('；')}`)
    lines.push(
      '禁止在 verification 里使用重定向（>、>>）或写临时文件；请改用只读命令（如 ls、grep、cat、curl -I localhost）并重新提交 report_completion。',
    )
    lines.push(
      '禁止把中文叙述或未真实执行的伪命令（如 node -e "读某文件…"）当作 verification；command 必须是已跑过的只读 shell，并附带真实 stdout。',
    )
  }
  // 可执行下一步（UAT P1：抽象「补充证据」不够——模型在 force 下空转 write/read）
  lines.push(
    '下一步：① bash 跑一条只读命令（例：ls -la <产物相对路径>；或 grep -n . <文件> | head）；② 必须再次调用 report_completion 工具，把该 command 与真实 stdout 填进 verification（禁止只用文字声称完成）；③ 再提交。read/write/edit/open 工具记录不算验证证据；不确定事项写入 pending_questions。',
  )
  return lines.join('\n')
}

/** 静默回填次数上限（与 count++ 后 `<= max` 配对）。
 * missing 路径保持旧行为 1 次（原 `count < 2`）；仅 unverifiable（无 missing）允许多到 3 次换只读证据。 */
export function evidenceGuideMaxAttempts(v: { missing: string[]; unverifiable: string[] }): number {
  return v.unverifiable.length > 0 && v.missing.length === 0 ? 3 : 1
}

// —— 方案清单派生（不变量 6 承载：plannedFiles 只由已确认的 PlanProposal.files 派生——追加语义 A0 §5） ——

/** 返回 state.plannedFiles ∪ proposal.files（追加/去重——路径规范化由解析层 trustPath 承担，S2） */
export function derivePlannedFiles(s: ConversationState, proposal: PlanProposal): Set<string> {
  const planned = new Set(s.plannedFiles)
  for (const f of proposal.files ?? []) {
    if (f && typeof f.path === 'string' && f.path.trim()) planned.add(f.path.trim())
  }
  return planned
}

// —— 推进保障（turnPolicy 重设计——不变量 5：推进 ≠ 逼调工具；pending 恒 auto——P1 继承） ——

export interface TurnProgress {
  produced: boolean // 有产出（write/edit 成功）
  proposed: boolean // 输出了结构化提议（目标/方案/完成声明——设计 §8.1 B 扩展维度）
  providedEvidence: boolean // 完成声明带证据（设计 §8.1 B 扩展维度）
  toolsAvailable: boolean // 工具可用（原 forceTool 前置条件）
}

export interface ProgressGuaranteeDecision {
  mode: 'require-action' | 'require-advance' | 'auto'
  reason: string
}

/** 推进保障判定（设计 §3.3 + §6 S5——替代 forceTool=required 语义；S5 起唯一推进判定器：
 * 吸收 turnPolicy 状态空间（lastToolFailed 失败诊断释放/plannedComplete 写完释放/resolutionConfirmed
 * 达成释放——坑 12 冒烟 11/12 完成度语义）+ S5 推进维度（proposed/providedEvidence））
 * projectFiles 可选（无 → plannedComplete 以 producedFiles 判定；renderer 传文件树快照） */
export function decideProgressGuarantee(
  s: ConversationState,
  turn: TurnProgress,
  projectFiles?: ReadonlySet<string>,
): ProgressGuaranteeDecision {
  // pending 非 none → 恒 auto（P1 继承：等用户决策不强制——模型停住等用户）
  if (s.pending !== 'none') return { mode: 'auto', reason: 'pending-user-decision' }
  // 未确认目标/方案 → 不强制（澄清/方案期模型自由输出）
  if (!s.goalConfirmed || !s.planConfirmed) return { mode: 'auto', reason: 'not-confirmed' }
  // 失败诊断优先（坑 93——turnPolicy 继承：上一轮工具失败 → 释放强制，模型停下看 stderr 修正）
  if (s.lastToolFailed) return { mode: 'auto', reason: 'tool-failed-diagnose' }
  // 本轮推进（S5 维度：本轮产出/结构化提议/完成声明带证据）→ 不强制（模型在推进）
  if (turn.produced || turn.proposed || turn.providedEvidence)
    return { mode: 'auto', reason: 'has-progress' }
  // 累积完成度（turnPolicy 继承——坑 12 冒烟 11/12：写 1 文件 ≠ 任务达成；
  // 已有产出但计划未写完且未确认达成 → 逼继续；计划写完或达成确认 → 收敛 auto）
  const complete = plannedComplete(s, projectFiles ?? new Set())
  if (s.producedFiles.size > 0 && !complete && !s.resolutionConfirmed)
    return { mode: 'require-action', reason: 'goal-exec-until-achieved' }
  if (s.producedFiles.size > 0 && (complete || s.resolutionConfirmed))
    return { mode: 'auto', reason: 'produced-auto' }
  // 无产出无推进：工具可用 → 逼工具产出（原 required）；工具不可用 → 逼「推进」（允许提议/证据/提问——不逼调工具）
  if (turn.toolsAvailable)
    return { mode: 'require-action', reason: 'confirmed-no-progress-tools-available' }
  return { mode: 'require-advance', reason: 'confirmed-no-progress-no-tools' }
}

// ============================================================================
// 继承派生（renderer 现状消费——S3/S5 逐步切换）
// ============================================================================

// 计划完成度（A0 §4 表 + 补行：无计划时以 produced 为准——缝隙 3 无计划死锁）
// A-021 同构：planned/produced 可能相对↔绝对双形态——精确 .has 会让 force 永转（四档 T1 forced×15）
export function plannedComplete(s: ConversationState, projectFiles: ReadonlySet<string>): boolean {
  if (s.plannedFiles.size === 0) return s.producedFiles.size > 0
  return [...s.plannedFiles].every(
    (f) => matchesPlannedPath(f, s.producedFiles) || matchesPlannedPath(f, projectFiles),
  )
}

// S5 复审修正（坑 97 单源）：结构化提议信号唯一探测（【目标确认】/【执行方案】/【已达成】——
// agentLoop.evaluateTurnProgress 与 renderer proposalConsumed 共用——渲染层不再自写文本探测）
export function isStructuredProposal(text: string): boolean {
  return /【(目标确认|执行方案|已达成)/.test(text)
}

/** 已确认决策点的已消费提议（S5 复审——renderer 组装层单源判定）：提议信号 + 对应决策点已确认 →
 * 该提议已消费（确认执行后上轮方案提议不再计「本轮推进」——应逼执行——L3 根因 3 回归）；
 * 未确认的提议（pending 期/拒绝后重提议轮）仍算推进（auto——模型在走决策点流程）。
 * 注意：resolutionConfirmed 收敛态下【已达成】恒为已消费——证据维度无意义（累积完成度分支已 auto） */
export function isConsumedProposal(
  content: string,
  s: Pick<ConversationState, 'goalConfirmed' | 'planConfirmed' | 'resolutionConfirmed'>,
): boolean {
  if (!isStructuredProposal(content)) return false
  if (s.goalConfirmed && /【目标确认/.test(content)) return true
  if (s.planConfirmed && /【执行方案/.test(content)) return true
  if (s.resolutionConfirmed && /【已达成/.test(content)) return true
  return false
}

// S5：forceToolInput 已删除（decideTurnPolicy 语义并入 decideProgressGuarantee——§6 S5 唯一推进判定器；
// 状态空间由 stateRef 直读 + projectFiles 传参，不再经 TurnPolicyInput 中转）

// 进展判定（缝隙 2：有副作用的工具成功执行 = 任务推进）
export function isProgressing(
  toolResults: Array<{ name: string; ok: boolean; command?: string }>,
): boolean {
  return toolResults.some((r) => r.ok && isSideEffectAction(r.name, r.command))
}

// 确认卡触发兼容壳（缝隙 5——S3 由 deriveDecisionPoint 取代；参数/返回值已切新枚举）
export function pendingCardToShow(
  goalConfirmed: boolean,
  planConfirmed: boolean,
  resolutionConfirmed: boolean,
  lastContent: string,
  sideEffectPending: boolean,
): PendingKind {
  if (!goalConfirmed && lastContent.includes('【目标确认')) return 'goal'
  if (
    goalConfirmed &&
    !planConfirmed &&
    (lastContent.includes('【执行方案') ||
      sideEffectPending ||
      /(等你确认|你确认一下|确认一下|等你点头|你看行吗|你看行不行|可以的话我)/.test(lastContent))
  )
    return 'plan'
  if (!resolutionConfirmed && lastContent.includes('【已达成')) return 'resolution'
  return 'none'
}

// 续聊停止判定（问题 A 2026-08-15：maybeContinue 停止条件与 canExecute **同源**——状态机 pending 非 none 即停）
export function shouldStopContinuation(
  s: ConversationState,
  lastMsg: { needsApproval: boolean; confirmPending: boolean },
): boolean {
  return s.pending !== 'none' || lastMsg.needsApproval || lastMsg.confirmPending
}
