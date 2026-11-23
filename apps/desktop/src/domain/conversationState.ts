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

// 路径解析单源（renderer trustPath / main resolvePath 共用；纯字符串无 node 依赖）
import { resolveSandboxPath } from './sandboxPath.js'

/** 假设来源（ADR-014）——确认卡可追溯「用户确认过」与「模型自行假定」 */
export type AssumptionSource = 'model_inference' | 'user_choice' | 'clarification'

/** 一条提议假设（文本 + 来源） */
export interface Assumption {
  text: string
  source: AssumptionSource
}

/** 目标提议（模型产出） */
export interface GoalProposal {
  statement: string // 一句话目标（原【目标确认】文本）
  assumptions: Assumption[] // 模型的关键假设（用户从未确认过的细节——必须显式呈现）
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
  assumptions: Assumption[] // 方案假设（技术选型/行为细节——用户审阅点）
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
  lastRejectReason?: RejectReason // S7（A0 审校 P1-4）：最近一次拒绝的原因（诊断——decision.resolved 载荷；confirm/其他转换清除）
  pendingRepeatCount: number // ADR-010 T1：同 kind 决策点连续 pending_set 次数（换 kind/决策清零）
  unresolvedTextReplies: number // ADR-010 T2：pending 存在期间用户连续文本回复数（决策清零）
}

/** P2-02：聚合根语义名 Task 的别名（历史文件名为 conversationState——避免新人误读聚合是 Conversation） */
export type TaskState = ConversationState

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
  pendingRepeatCount: 0,
  unresolvedTextReplies: 0,
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
  rootPath?: string | null,
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
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
    return userDecided(s, underlying, decision, rootPath)
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
        next.plannedFiles = derivePlannedFiles(s, dc.proposal as PlanProposal, rootPath)
      }
    }
    if (point === 'resolution') {
      next.resolutionConfirmed = true
      // A-025（UAT-Sim 2026-09-07）：resolution = 任务边界——planConfirmed 必须重置，否则同会话
      // 下一任务的执行确认卡渲染条件 `!planConfirmed` 恒假 → 卡不渲染（真机实证 seq 848/851）
      next.planConfirmed = false
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
    // S7（P1-4）：授权拒绝原因同样入诊断字段
    next.lastRejectReason = decision.reason
  } else {
    next.lastRejectReason = undefined
  }
  return next
}

// 兼容壳（S3 由 userDecided 直连取代——renderer 现状消费；缺省拒绝原因仅兼容旧调用，新代码一律显式带原因）
export function userConfirmed(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution' | 'system_clarify',
  rootPath?: string | null,
): ConversationState {
  return userDecided(s, point, { confirm: true }, rootPath)
}

export function userRejected(
  s: ConversationState,
  point: 'goal' | 'plan' | 'resolution' | 'system_clarify',
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
  // ADR-010 T1：同 kind 连续置位计数（换 kind 重置为 1——notePendingSet 比较旧 pending）；
  // 计数只增不清（清零唯二入口：userDecided / noteUserTextReply 的 none 分支），避免重提议洗掉循环证据
  const noted = notePendingSet(s, kind)
  return { ...noted, pending: kind, decisionContent: content ? { kind, ...content } : undefined }
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

// P0-02：危险参数形态（参数级判定——只读命令头不等于只读）。
// 背景：sed/find/awk/sort/rg/git 的写能力在参数里，仅看命令头会把 `sed -i`、`find -delete`
// 判成只读而免授权（fail-open）。以下命中任一即 hazardous。
function segmentTokens(seg: string): { head: string; args: string[] } {
  const tokens = seg.trim().split(/\s+/).filter(Boolean)
  if (tokens[0] === 'sudo') tokens.shift()
  return { head: tokens[0] ?? '', args: tokens.slice(1) }
}

function hasDangerousArgumentShape(seg: string): boolean {
  const { head, args } = segmentTokens(seg)
  const joined = args.join(' ')
  switch (head) {
    case 'sed': {
      // -i / --in-place / 组合短标志（-ni）/ BSD 备份后缀（-i.bak）；脚本内 w 写文件命令（地址/替换标志形态）
      const inPlace = args.some(
        (t) => /^--in-place(?:=.*)?$/.test(t) || /^-([a-zA-Z.]*)i([a-zA-Z.]*)$/.test(t),
      )
      // 2026-11-17 审查修复：`1w file`（地址）与 `s/a/b/w file`（替换标志）都写文件——
      // 原正则只认段首/分号后的裸 `w`，漏掉地址前缀与 `/` 分隔的脚本形态。
      const writesFile = /(?:^|;|\s|\/|['"])\s*(?:\d+(?:,\d*)?)?\s*w\s+\S+/.test(joined)
      return inPlace || writesFile
    }
    case 'find':
      // -exec/-execdir 执行命令；-delete 删除；-fprint/-fprint0/-fprintf/-fls 写文件；-ok/-okdir 执行
      return args.some((t) =>
        /^(-exec|-execdir|-delete|-fprint|-fprint0|-fprintf|-fls|-ok|-okdir)$/.test(t),
      )
    case 'awk':
      // system() 执行命令；print/printf 重定向到文件或管道到命令
      return /system\s*\(|\bprint(?:f)?\s*(?:>|\|)/.test(joined)
    case 'sort':
      // --compress-program 执行外部程序（原只拦 -o/--output）
      return args.some(
        (t) =>
          t === '-o' || /^--output(?:=.*)?$/.test(t) || /^--compress-program(?:=|\s|$)/.test(t),
      )
    case 'rg':
      return args.some((t) => /^--pre(?:=.*)?$/.test(t)) // --pre 执行外部命令
    case 'git': {
      const sub = args[0] ?? ''
      if (sub === 'branch') {
        // 创建/删除/重命名/复制/强制移动/设置上游都写引用；只读 = 查询标志（无位置参数）
        const READONLY_FLAGS = new Set([
          '-a',
          '--all',
          '-r',
          '--remotes',
          '-v',
          '-vv',
          '--verbose',
          '--list',
          '--show-current',
          '--column',
          '--no-column',
          '--color',
          '--no-color',
          '--ignore-case',
        ])
        const READONLY_VALUE_FLAGS = new Set([
          '--contains',
          '--no-contains',
          '--merged',
          '--no-merged',
          '--points-at',
          '--sort',
          '--format',
        ])
        const rest = args.slice(1)
        for (let i = 0; i < rest.length; i += 1) {
          const t = rest[i]!
          if (READONLY_VALUE_FLAGS.has(t)) {
            i += 1 // 查询值参数（commit/object/format）——只读
            continue
          }
          if ([...READONLY_VALUE_FLAGS].some((f) => t.startsWith(f + '='))) continue
          if (t.startsWith('--color=') || t.startsWith('--format=')) continue
          if (READONLY_FLAGS.has(t)) continue
          return true // 未知标志/位置参数 = 创建/修改分支
        }
        return false
      }
      if (sub === 'remote') {
        // 仅列出/查询只读；add/remove/rename/set-url/prune/set-head 均为写
        const rest = args.slice(1).filter((t) => t !== '-v' && t !== '--verbose')
        if (rest.length === 0) return false
        return !(
          rest[0] === 'show' ||
          rest[0] === 'get-url' ||
          rest[0] === '-h' ||
          rest[0] === '--help'
        )
      }
      return false
    }
    default:
      return false
  }
}

/** 动作只读判定（升级版——设计 §3.3）：readonly / network-read / hazardous（fail-closed） */
export function classifyReadonly(name: string, command?: string): ActionKind {
  if (name === 'write' || name === 'edit') return 'hazardous'
  if (name !== 'bash') return 'readonly' // read/search/LSP/check-capability → 工具类型只读
  const c = String(command ?? '').trim()
  if (!c) return 'hazardous' // 空命令 fail-closed（非只读）
  // 2026-11-17 审查修复：命令替换/换行/进程替换可执行任意命令——原链分割只认 [;&|]，
  // `ls\nrm`、`echo $(rm)`、反引号均会被误判只读并自动执行。统一 fail-closed。
  if (/[\n\r]|`|\$\(|<\(|>\(/.test(c)) return 'hazardous'
  // 网络只读（curl/wget GET/HEAD 无写副作用 → network-read；拍板 3：localhost 自动放行，外网 ask——S6 策略落地在 actionGate）
  // 2026-11-17 审查修复：快路径仅在**单一命令**时成立——链/管道/重定向必须落回下方段级判定；
  // 否则 `curl localhost; rm -rf` 会因头上 localhost 被整条判 network-read 自动放行。
  const withoutStderr = c.replace(/2>&1|2>>1|2>>?\/dev\/null/g, '')
  const hasShellComposition = /[;&|<>]/.test(withoutStderr)
  const netMatch = c.match(/^(curl|wget)\s+/)
  if (netMatch && !hasShellComposition) {
    const tool = netMatch[1]
    if (tool === 'wget') {
      // P0-02：wget 默认下载落盘 → hazardous；只有 --spider / 输出到 stdout 才是网络只读
      if (/(?:^|\s)(?:--help|-h|--version|-V)(?:\s|$)/.test(c)) return 'readonly'
      const stdoutOnly = /(?:^|\s)(?:--spider|-O-|-qO-|--output-document=-)(?:\s|$)/.test(c)
      return stdoutOnly ? 'network-read' : 'hazardous'
    }
    const method = c.match(/-X\s+(GET|HEAD)\b|--request\s+(GET|HEAD)\b/)
    // 写副作用标志（S6 复审补全——curl -o/-O/-T/-a/-C/-J 与 wget -O 大小写敏感漏网→localhost 自动放行下成洞）：
    // -o/--output 输出文件；-O/--remote-name/-J 落盘 CWD；-T/--upload-file 上传（写远端）；-a/--append 追加；-C/--continue-at 续传
    // #6 真机 2026-08-30（P2-5）：`-o /dev/null` 例外——健康检查惯用法（不落盘），不计写副作用
    const hasBodyFlag =
      /-d\b|--data\b|--data-raw\b|-F\b|--form\b|-X\s+(POST|PUT|PATCH|DELETE)\b|-o(?!\s*\/dev\/null\b)|--output(?!\s*\/dev\/null\b)|--output-document\b|--remote-name\b|-J\b|-T\b|--upload-file\b|-a\b|--append\b|-C\b|--continue-at\b|-O\b|-K\b|--config\b|--cookie-jar\b|--trace(?:-ascii)?\b|--hsts\b/.test(
        c,
      ) // -O 大写（wget -O file——大小写敏感补全）；-K/--config/--cookie-jar/--trace/--hsts 均为写副作用
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
  // P0-02：参数级危险形态——链中任一段命中即 hazardous（如 `ls && sed -i ...`）。
  // awk 引号内的 `print | "cmd"` 会被链分割误拆，先对整条命令做一次保守判定。
  if (/\bawk\b.*(?:system\s*\(|\bprint(?:f)?\s*\|)/.test(c)) return 'hazardous'
  if (segments.some((seg) => hasDangerousArgumentShape(seg))) return 'hazardous'
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

// P1-08：路径规范化（比较用）——统一分隔符、去 ./ 与前导尾斜杠、折叠重复分隔符
export function normalizeComparePath(p: unknown): string {
  const raw = String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
  if (!raw) return ''
  const absolute = raw.startsWith('/')
  const segments: string[] = []
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop()
      else if (!absolute) segments.push('..')
      continue
    }
    segments.push(part)
  }
  return (absolute ? '/' : '') + segments.join('/')
}

// 清单匹配判定（Q5 单源——S3 统一：renderer 引用本函数，消除双实现；相对/绝对/目录尾斜杠兼容）
export function isPathInsideRoot(path: string, rootPath: string): boolean {
  const p = normalizeComparePath(path)
  const r = normalizeComparePath(rootPath)
  if (!p || !r || !p.startsWith('/')) return false
  return p === r || p.startsWith(r + '/')
}

export function inPlannedFiles(s: ConversationState, action: ExecAction): boolean {
  const p = normalizeComparePath(action.path)
  if (!p) return false
  return [...s.plannedFiles].some((raw) => {
    const f = normalizeComparePath(raw)
    return f === p || f.endsWith('/' + p) || p.endsWith('/' + f)
  })
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
 * actionGate 的 ask/deny 全量接线在 S6（只读自动/越界 ask/高危 deny 进执行流）。S1 只拦 deny（策略级拦截）。
 * ADR-016：`deniedBy` 为结构化拒绝来源——`session-gate`（冻结/确认点/清单边界）、
 * `rejection-memory`（拒绝记忆短封）、`action-gate`（策略 deny）；后两者带动作属性/风险，
 * 供应用层发送 `gate.denied` 领域事件（ask 不产生该事件）。 */
export interface ExecuteGateResult {
  ok: boolean
  reason: string
  deniedBy?: 'session-gate' | 'rejection-memory' | 'action-gate'
  attribute?: ActionAttribute
  risk?: 'low' | 'medium' | 'high'
}

export function canExecute(
  s: ConversationState,
  action: ExecAction,
  inPlanned: boolean,
  policy?: ActionGatePolicy,
): ExecuteGateResult {
  const gate = sessionGate(s, action)
  if (!gate.ok) return { ...gate, deniedBy: 'session-gate' }
  // 清单为空（无计划）→ 无文件边界（写放行由确认点把关——继承现状语义）
  const effectiveInPlanned =
    (action.name === 'write' || action.name === 'edit') && s.plannedFiles.size === 0
      ? true
      : inPlanned
  // 先算动作属性（纯函数）——拒绝记忆/策略 deny 的事件载荷复用同一判定（不重复 classify）
  const verdict = actionGate(action, effectiveInPlanned, policy)
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
  if (denied)
    return {
      ok: false,
      reason: '动作已被你拒绝（拒绝记忆——同轮同类短封）',
      deniedBy: 'rejection-memory',
      attribute: verdict.attribute,
      risk: verdict.risk,
    }
  if (verdict.verdict === 'deny')
    return {
      ok: false,
      reason: `动作被策略拦截（${verdict.attribute.kind}）`,
      deniedBy: 'action-gate',
      attribute: verdict.attribute,
      risk: verdict.risk,
    }
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
  // 已确认的一次性决策点不再触发（plan/resolution 确认后，滞后的 UI 信号不得重开决策点——
  // 2026-11-23 真机 repro：write 成功后 UI 卡片状态未回填，sideEffectPendingUi 仍为真 →
  // 事件层把信号翻译成 userRequested=plan → 本规则绕过规则 2 的 !planConfirmed 门，
  // 置 pending=plan 而方案卡渲染条件仍要求 !planConfirmed → 无卡可点、模型停等死锁）
  if (userRequested && userRequested !== 'approval') {
    if (userRequested === 'plan' && state.planConfirmed) return 'none'
    if (userRequested === 'resolution' && state.resolutionConfirmed) return 'none'
    return userRequested
  }
  return 'none'
}

// —— 完成对账（不变量 4：无证据不进入对账——verifyCompletion 纯逻辑部分 + V1a/V1b 系统核验 S2 扩展） ——

/** 验证命令是否系统可代跑：只读命令；网络只读仅限 localhost（P0-05——外网证据不自动代跑）。
 * 单源导出，main 侧 verification.ts 直接复用（避免两份判定漂移）。 */
export function isSystemVerifiable(command: string): boolean {
  const kind = classifyReadonly('bash', command)
  if (kind === 'readonly') return true
  return kind === 'network-read' && isLocalhostCommand(command)
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
    .filter((raw) => {
      const p = normalizeComparePath(raw)
      return [...planned].some((qRaw) => {
        const q = normalizeComparePath(qRaw)
        return q !== '' && (q === p || p.endsWith('/' + q))
      })
    })
    .map((path) => ({ path }))
}

/** A-021：planned 清单项 q 是否已被 produced 产出覆盖——精确相等或 produced 末段边界匹配
 *（q 相对 'index.html'，produced '/…/index.html' → 同一文件；q 需非空——trustPath 空 fallback 不算已产出）
 * P1-08：比较前规范化路径（./、反斜杠、尾斜杠）；裸文件名（无目录）在多个候选时视为歧义 → 不通过（fail-closed） */
export function matchesPlannedPath(q: string, produced: ReadonlySet<string>): boolean {
  const nq = normalizeComparePath(q)
  if (!nq) return false
  const matches = [...produced].filter((pRaw) => {
    const p = normalizeComparePath(pRaw)
    return p === nq || p.endsWith('/' + nq)
  })
  if (matches.length === 0) return false
  if (!nq.includes('/') && matches.length > 1) return false
  return true
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

/** 返回 state.plannedFiles ∪ proposal.files（追加/去重——路径规范化由解析层 trustPath 承担，S2）
 * 2026-11-24 根外条目：已确认方案中的**根外**文件不并入写入批准清单（清单外/根外永不自动放行的
 * 数据侧防线）——调用方传入 rootPath 时过滤，根外文件只能走逐次授权（rootPath 缺失时保持旧行为）。 */
export function derivePlannedFiles(
  s: ConversationState,
  proposal: PlanProposal,
  rootPath?: string | null,
): Set<string> {
  const planned = new Set(s.plannedFiles)
  for (const f of proposal.files ?? []) {
    if (!f || typeof f.path !== 'string' || !f.path.trim()) continue
    const p = f.path.trim()
    if (rootPath) {
      const abs = resolveSandboxPath(rootPath, p)
      if (!isPathInsideRoot(abs, rootPath)) continue
    }
    planned.add(p)
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
