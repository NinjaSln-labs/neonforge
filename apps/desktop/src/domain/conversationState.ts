// 领域层：会话状态机（Conversation BC 聚合根 Task——A0 §2/§3/§4/§5）
// 2026-08-16 意图确认重设计 S1（intent-confirmation-domain-design.md §3/§4/§6）：
// - 值对象：GoalProposal/PlanProposal/CompletionClaim/CompletionEvidence/ApprovalRequest/RejectReason/ActionAttribute（§3.2）
// - 状态：executionConfirmed → planConfirmed（确认的是方案）；achievementConfirmed → resolutionConfirmed（确认的是「解决」）
//         pending 枚举 execution/achievement → plan/resolution；新增 decisionContent（决策点内容快照）+ deniedApprovals（拒绝记忆）
// - 转换唯一入口：userDecided（不变量 1/8）/ approvalDecided（§3.4）；userConfirmed/userRejected 降为兼容壳（S3 移除）
// - 派生：deriveDecisionPoint（不变量 2/7）/ sessionGate×actionGate（不变量 3）/ verifyCompletion（不变量 4）/
//         decideProgressGuarantee（不变量 5）/ derivePlannedFiles（不变量 6）
// - 继承：单一 PENDING、plannedFiles 追加语义、producedFiles、lastToolFailed、shouldStopContinuation、classifyAction（兼容壳）
// 纯逻辑无 React 依赖——L1 可测。依赖关系：tools.ts preApproval 消费 classifyAction（同源——缝隙 4）。
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
export type DecisionKind = 'goal' | 'plan' | 'approval' | 'resolution'

// ============================================================================
// 会话级单一 PENDING（A0 §3.2——所有卡统一「等用户决策」；来源只是卡类型）
// ============================================================================
export type PendingKind = 'none' | DecisionKind

/** 决策点内容快照（决策点呈现与审计的唯一来源——run4「确认了什么无法追溯」解法） */
export interface DecisionContent {
  kind: DecisionKind
  proposal?: GoalProposal | PlanProposal | CompletionClaim // 结构化内容
  approval?: ApprovalRequest // 授权请求内容
  since: string // 决策点出现时间（诊断）
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
  deniedApprovals: Array<{ toolName: string; subject: string }> // 拒绝记忆（§3.4 C6——同轮同类动作短封，S6 actionGate 消费；任务边界重置）
  rejectStreak: number // 同一决策点连续拒绝计数（§4.1 C8——上限 3 超限回退澄清/人工接管；随确认/新提议重置；S3 消费）
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
  deniedApprovals: [],
  rejectStreak: 0,
})

// ============================================================================
// 转换（唯一入口——所有状态变化必须经过这里；返回新实例，原状态不可变）
// 不变量 1：状态推进只能由用户决策发生；不变量 8：拒绝必须带原因（签名强制 + 运行时校验）
// ============================================================================

/** 用户决策（设计 §3.4——confirm/reject 二元；modify = reject(kind='modify')+修正内容 → 模型重提议，不单列分支） */
export function userDecided(
  s: ConversationState,
  point: DecisionKind,
  decision: { confirm: true } | { confirm: false; reason: RejectReason },
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
  }
  const next: ConversationState = { ...s, pending: 'none', decisionContent: undefined }
  if (decision.confirm) {
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
    }
    if (point === 'approval') {
      // 确认点不处理 approval（approval 走 approvalDecided）——防御：不推进任何确认位
    }
  } else {
    const reason = decision.reason
    if (point === 'goal') next.goalConfirmed = false
    if (point === 'plan') next.planConfirmed = false
    if (point === 'resolution') next.resolutionConfirmed = false
    // §4.1 C8：同一决策点连续拒绝计数（含 kind='modify'——修改=拒绝）——超限处理（AskToAct 澄清/人工接管）S3 消费
    next.rejectStreak = s.rejectStreak + 1
    // reason 由事件层回填模型（decision.resolved detail.reason——S3 接线）；状态层只回退 + 清 pending
    void reason
  }
  return next
}

/** 授权决策（设计 §3.4 approvalDecided——允许清 pending；拒绝 + reason 登记拒绝记忆） */
export function approvalDecided(
  s: ConversationState,
  request: ApprovalRequest,
  decision: { confirm: true } | { confirm: false; reason: RejectReason },
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
  }
  const next: ConversationState = { ...s, pending: 'none', decisionContent: undefined }
  if (!decision.confirm) {
    // 拒绝记忆（§3.4 C6——机制层防绕过：同轮同类动作 actionGate 直接 deny——S6 消费）
    next.deniedApprovals = [
      ...s.deniedApprovals,
      { toolName: request.toolName, subject: request.subject },
    ]
  }
  return next
}

// 兼容壳（S3 由 userDecided 直连取代——renderer 现状消费；缺省拒绝原因仅兼容旧调用，新代码一律显式带原因）
export function userConfirmed(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution',
): ConversationState {
  return userDecided(s, point, { confirm: true })
}

export function userRejected(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution',
  reason: RejectReason,
): ConversationState {
  // A-006：reason 必传——不变量 8 真身（userDecided throw）不得被兼容壳缺省绕过
  return userDecided(s, point, { confirm: false, reason })
}

// 卡弹出 → 会话进入 PENDING（A0 §3.2 单一 PENDING——pending 只有一个；不变量 7）
export function setPending(
  s: ConversationState,
  kind: Exclude<PendingKind, 'none'>,
  content?: Omit<DecisionContent, 'kind'>,
): ConversationState {
  // §4.1 C8 计数语义（S1.1 审计裁定）：模型重提议（新 content）属**同一决策点延续**——不重置计数
  // （否则「连续拒绝 3 次上限」因每次重提议清零而永远不触发——协商保护失效）；
  // 「随新提议重置」按 C2 语义 = 用户新意图（pending 期间新自由文本 → reject(direction)+新 GoalProposal）
  // 是**新决策点**——由应用层经 goal 确认边界/新任务重置（S3 接线）；领域层只承载计数
  return { ...s, pending: kind, decisionContent: content ? { kind, ...content } : undefined }
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
])

// 链中危险命令（bash 链递归判定——&&/;/| 任一危险 → hazardous；含写副作用标记（重定向到文件）→ hazardous）
const BASH_CHAIN_DANGEROUS =
  /\b(rm|mv|cp|mkdir|touch|npm|pnpm|yarn|git|curl|wget|python|python3|node|install|unlink|ln|chmod|chown)\b/

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
    const hasBodyFlag =
      /-d\b|--data\b|--data-raw\b|-F\b|--form\b|-X\s+(POST|PUT|PATCH|DELETE)\b/.test(c)
    if (!hasBodyFlag && (!method || method[1] === 'GET' || method[1] === 'HEAD'))
      return 'network-read'
    return 'hazardous'
  }
  // 重定向到文件 → 写副作用
  if (/>\s*[^|]*$/m.test(c)) return 'hazardous'
  // 链递归：& / ; / | 分隔的每一段——任一危险命令 → hazardous（原实现只查链后命令，不递归）
  const segments = c.split(/[;&|]/).map((seg) => seg.trim())
  if (segments.length > 1 && segments.some((seg) => BASH_CHAIN_DANGEROUS.test(seg)))
    return 'hazardous'
  const head = segments[0].split(/\s+/)[0]?.replace(/^sudo\s+/, '') ?? ''
  // git 子命令级判定（git status/log/diff 只读；git push/commit 写）
  if (head === 'git') {
    const sub = segments[0].split(/\s+/)[1] ?? ''
    return GIT_READONLY_SUBCOMMANDS.has(sub) ? 'readonly' : 'hazardous'
  }
  return BASH_READONLY_HEADS.has(head) ? 'readonly' : 'hazardous'
}

// 动作分类兼容壳（缝隙 4 单一权威——main preApproval 消费；S6 由 actionGate 直连取代）
// 注意：network-read 在壳内仍按 side-effect（旧 fail-closed 语义——curl 一律需授权）——S1 阶段 main 尚未接
// actionGate（S6），若按 readonly 放行则外网 curl 自动通过 = 安全倒退；S6 切换后 network-read 走
// actionGate（localhost 自动/外网 ask——拍板 3）。
export function classifyAction(name: string, command?: string): 'side-effect' | 'readonly' {
  return classifyReadonly(name, command) === 'readonly' ? 'readonly' : 'side-effect'
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
  if (!s.goalConfirmed) return { ok: false, reason: '目标未确认——先澄清目标' }
  if (!s.planConfirmed) return { ok: false, reason: '方案未确认——先给方案等确认' }
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
    // 拍板 3：curl 对 localhost 自动放行，外网 GET ask
    const cmd = String(action.command ?? '')
    const localhost = /localhost|127\.0\.0\.1|::1/.test(cmd)
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
  // 1. 目标提议存在（或用户主动请求目标确认）&& 目标未确认 → goal
  if (!state.goalConfirmed && (proposals.goal !== undefined || userRequested === 'goal'))
    return 'goal'
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

/** 证据可核验性（不变量 4 单源——Q2 审计：completionEvidenceComplete 与 verifyCompletion 共用，消除分歧）：
 * verification 非空 + 全部系统可代跑（只读）+ 无 pendingQuestions */
export function evidenceVerifiable(evidence: CompletionEvidence): boolean {
  if (evidence.verification.length === 0) return false
  if (evidence.pendingQuestions.length > 0) return false
  return evidence.verification.every((item) => isSystemVerifiable(item.command))
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
 * 完成声明核验（设计 §3.3）：证据不足（verification 空 / pendingQuestions 非空 / 存在 unverifiable）→ ok=false + 清单
 * - 纯逻辑部分（S1）：passed=false → missing；非只读命令 → unverifiable（拍板 4——与 evidenceVerifiable 同源）
 * - V1a/V1b（S2 扩展）：systemState 提供时——系统代跑结果复核（ok:false → missing）；
 *   diffs 由系统从 plannedFiles/producedFiles 派生比对（planned 有文件未产出 → missing）
 * - systemState 缺省 = 纯逻辑判定（S1 兼容——不代跑；S4 接线后必传）
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
  if (claim.evidence.pendingQuestions.length > 0)
    missing.push(...claim.evidence.pendingQuestions.map((q) => `pending-question:${q}`))
  // S2 V1a：系统代跑结果复核（只读命令——系统已核验且失败 → missing；「自报」降级为「系统复核」）
  if (systemState) {
    for (const item of claim.evidence.verification) {
      if (item.passed === false) continue // 已计 missing
      if (!isSystemVerifiable(item.command)) continue // 已计 unverifiable——系统不代跑
      const result = systemState.verificationResults[item.command]
      if (result && !result.ok && !missing.includes(`verification:${item.command}`)) {
        missing.push(`verification:${item.command}`)
      }
    }
    // S2 V1b：diff 对账系统派生——planned 有文件未产出（不在 produced）→ missing（系统核对，非模型自述）
    const sysDiffs = systemState.deriveDiffs(systemState.plannedFiles, systemState.producedFiles)
    if (systemState.plannedFiles.size > 0 && sysDiffs.length < systemState.plannedFiles.size) {
      missing.push('diff:planned-not-produced')
    }
  }
  return { ok: missing.length === 0 && unverifiable.length === 0, missing, unverifiable }
}

/** V1b diff 对账系统派生（S4 单源——renderer/main 共用）：planned ∩ produced 匹配项。
 * verifyCompletion 消费语义：匹配数 < planned 数 → missing diff:planned-not-produced（系统核对，非模型自述） */
export function deriveDiffs(planned: Set<string>, produced: Set<string>): Array<{ path: string }> {
  return [...produced].filter((p) => planned.has(p)).map((path) => ({ path }))
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
  if (v.unverifiable.length > 0) lines.push(`以下证据未经系统核验：${v.unverifiable.join('；')}`)
  lines.push('请补充可核验的验证证据（只读验证命令结果）后重新输出【已达成】声明。')
  return lines.join('\n')
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
export function plannedComplete(s: ConversationState, projectFiles: ReadonlySet<string>): boolean {
  if (s.plannedFiles.size === 0) return s.producedFiles.size > 0
  return [...s.plannedFiles].every((f) => s.producedFiles.has(f) || projectFiles.has(f))
}

// S5：forceToolInput 已删除（decideTurnPolicy 语义并入 decideProgressGuarantee——§6 S5 唯一推进判定器；
// 状态空间由 stateRef 直读 + projectFiles 传参，不再经 TurnPolicyInput 中转）

// 进展判定（缝隙 2：有副作用的工具成功执行 = 任务推进）
export function isProgressing(
  toolResults: Array<{ name: string; ok: boolean; command?: string }>,
): boolean {
  return toolResults.some((r) => r.ok && classifyAction(r.name, r.command) === 'side-effect')
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
