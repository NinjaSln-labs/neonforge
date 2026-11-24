// A1 Task 聚合跨重启快照（GitHub #11 / ADR-013）：ConversationState ↔ 纯 JSON 值。
// 领域层单源序列化：Set → string[]；恢复时严格校验（损坏快照返回 null，不阻断启动）。
// 持久化位置由 renderer sessionStore 与消息存档同一记录原子写入（compaction 基准一致）。
import {
  type Assumption,
  type AssumptionSource,
  type CompletionClaim,
  type ConversationState,
  type DecisionContent,
  type DecisionKind,
  type GoalProposal,
  type PendingKind,
  type PlanProposal,
  type RejectKind,
  type RejectReason,
} from './conversationState.js'

export const TASK_SNAPSHOT_VERSION = 2 as const
/** 兼容版本：1 = ADR-013 初版（假设为 string[]）；2 = ADR-014（假设为 Assumption[]） */
const SUPPORTED_SNAPSHOT_VERSIONS = [1, 2] as const

export interface DeniedApproval {
  toolName: string
  subject: string
}

export interface TaskSnapshot {
  version: (typeof SUPPORTED_SNAPSHOT_VERSIONS)[number]
  goalConfirmed: boolean
  planConfirmed: boolean
  resolutionConfirmed: boolean
  pending: PendingKind
  plannedFiles: string[]
  producedFiles: string[]
  filesApproved: boolean
  lastToolFailed: boolean
  decisionContent?: DecisionContent
  deniedApprovals: DeniedApproval[]
  rejectStreak: number
  lastRejectReason?: RejectReason | null
  pendingRepeatCount: number
  unresolvedTextReplies: number
}

const PENDING_KINDS: readonly PendingKind[] = [
  'none',
  'goal',
  'plan',
  'approval',
  'resolution',
  'system_clarify',
]
const DECISION_KINDS: readonly DecisionKind[] = [
  'goal',
  'plan',
  'approval',
  'resolution',
  'system_clarify',
]
const REJECT_KINDS: readonly RejectKind[] = [
  'direction',
  'scope',
  'complexity',
  'missing-info',
  'modify',
  'other',
]

const ASSUMPTION_SOURCES: readonly AssumptionSource[] = [
  'model_inference',
  'user_choice',
  'clarification',
]
const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** 当前任务状态 → 可持久化快照（字段全集；不丢失任何 A1 状态）。 */
export function toTaskSnapshot(state: ConversationState): TaskSnapshot {
  return {
    version: TASK_SNAPSHOT_VERSION,
    goalConfirmed: state.goalConfirmed,
    planConfirmed: state.planConfirmed,
    resolutionConfirmed: state.resolutionConfirmed,
    pending: state.pending,
    plannedFiles: [...state.plannedFiles],
    producedFiles: [...state.producedFiles],
    filesApproved: state.filesApproved,
    lastToolFailed: state.lastToolFailed,
    ...(state.decisionContent ? { decisionContent: state.decisionContent } : {}),
    deniedApprovals: state.deniedApprovals.map((d) => ({
      toolName: d.toolName,
      subject: d.subject,
    })),
    rejectStreak: state.rejectStreak,
    lastRejectReason: state.lastRejectReason ?? null,
    pendingRepeatCount: state.pendingRepeatCount,
    unresolvedTextReplies: state.unresolvedTextReplies,
  }
}

/** 假设条目兼容解析（ADR-014）：旧字符串 → model_inference；新对象保留来源；非法 → null */
function parseAssumption(raw: unknown): Assumption | null {
  if (typeof raw === 'string') {
    return raw.trim() ? { text: raw, source: 'model_inference' } : null
  }
  if (!isRecord(raw) || typeof raw.text !== 'string' || !raw.text.trim()) return null
  const source = raw.source === undefined ? 'model_inference' : raw.source
  if (typeof source !== 'string' || !ASSUMPTION_SOURCES.includes(source as AssumptionSource)) {
    return null
  }
  return { text: raw.text, source: source as AssumptionSource }
}

function parseAssumptions(raw: unknown): Assumption[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const out: Assumption[] = []
  for (const item of raw) {
    // 旧 string[] 存档允许空串（旧 schema 只校验 string）——空条目跳过，不能因一条无意义空串拒绝整个任务快照
    if (typeof item === 'string' && !item.trim()) continue
    const parsed = parseAssumption(item)
    if (!parsed) return null
    out.push(parsed)
  }
  return out
}

function parseGoalProposal(raw: unknown): GoalProposal | undefined {
  if (!isRecord(raw) || typeof raw.statement !== 'string') return undefined
  const assumptions = parseAssumptions(raw.assumptions)
  if (!assumptions) return undefined
  return { statement: raw.statement, assumptions }
}

function parsePlanProposal(raw: unknown): PlanProposal | undefined {
  if (!isRecord(raw) || typeof raw.summary !== 'string') return undefined
  if (
    !Array.isArray(raw.files) ||
    !raw.files.every(
      (f) => isRecord(f) && typeof f.path === 'string' && typeof f.reason === 'string',
    )
  ) {
    return undefined
  }
  const assumptions = parseAssumptions(raw.assumptions)
  if (!assumptions || !isStringArray(raw.verificationPlan)) return undefined
  return {
    summary: raw.summary,
    files: raw.files.map((f) => ({ path: f.path as string, reason: f.reason as string })),
    assumptions,
    verificationPlan: raw.verificationPlan,
  }
}

function parseCompletionClaim(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  if (typeof raw.summary !== 'string' || !isRecord(raw.evidence)) return false
  const evidence = raw.evidence
  return (
    Array.isArray(evidence.verification) &&
    evidence.verification.every(
      (v) =>
        isRecord(v) &&
        typeof v.command === 'string' &&
        (v.output === undefined || typeof v.output === 'string') &&
        (v.passed === undefined || typeof v.passed === 'boolean'),
    ) &&
    Array.isArray(evidence.diffs) &&
    evidence.diffs.every((d) => isRecord(d) && typeof d.path === 'string') &&
    isStringArray(evidence.pendingQuestions)
  )
}

function parseApproval(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  return (
    typeof raw.toolName === 'string' &&
    typeof raw.subject === 'string' &&
    typeof raw.reason === 'string' &&
    typeof raw.risk === 'string' &&
    ['low', 'medium', 'high'].includes(raw.risk)
  )
}

function parseSystemClarify(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  return (
    typeof raw.statement === 'string' &&
    typeof raw.underlying === 'string' &&
    ['goal', 'plan', 'resolution'].includes(raw.underlying)
  )
}

/** 决策内容深层校验：卡渲染会直接读 proposal.files/assumptions/pendingQuestions——结构不符必须拒绝。
 * 校验同时归一化（旧字符串假设 → Assumption[]——ADR-014），返回可安全渲染的干净对象。 */
export function normalizeDecisionContent(raw: unknown): DecisionContent | undefined {
  if (!isRecord(raw)) return undefined
  if (typeof raw.kind !== 'string' || !DECISION_KINDS.includes(raw.kind as DecisionKind)) {
    return undefined
  }
  if (typeof raw.since !== 'string') return undefined
  const kind = raw.kind as DecisionKind
  if (kind === 'goal') {
    const proposal = parseGoalProposal(raw.proposal)
    return proposal ? { kind, since: raw.since, proposal } : undefined
  }
  if (kind === 'plan') {
    const proposal = parsePlanProposal(raw.proposal)
    return proposal ? { kind, since: raw.since, proposal } : undefined
  }
  if (kind === 'resolution') {
    if (!parseCompletionClaim(raw.proposal)) return undefined
    return {
      kind,
      since: raw.since,
      proposal: raw.proposal as unknown as CompletionClaim,
    }
  }
  if (kind === 'system_clarify') {
    if (!parseSystemClarify(raw.proposal)) return undefined
    return {
      kind,
      since: raw.since,
      proposal: raw.proposal as unknown as DecisionContent['proposal'],
    }
  }
  if (kind === 'approval') {
    if (!parseApproval(raw.approval)) return undefined
    return {
      kind,
      since: raw.since,
      approval: raw.approval as unknown as DecisionContent['approval'],
    }
  }
  return undefined
}

function parseRejectReason(raw: unknown): RejectReason | undefined {
  if (!isRecord(raw)) return undefined
  if (typeof raw.kind !== 'string' || !REJECT_KINDS.includes(raw.kind as RejectKind)) {
    return undefined
  }
  if (raw.text !== undefined && typeof raw.text !== 'string') return undefined
  if (raw.target !== undefined && typeof raw.target !== 'string') return undefined
  return {
    kind: raw.kind as RejectKind,
    ...(typeof raw.text === 'string' ? { text: raw.text } : {}),
    ...(typeof raw.target === 'string' ? { target: raw.target } : {}),
  }
}

/** 快照 → 任务状态；版本/类型/枚举非法 → null（调用方回退 initialState，不崩）。 */
export function fromTaskSnapshot(raw: unknown): ConversationState | null {
  if (!isRecord(raw)) return null
  if (!SUPPORTED_SNAPSHOT_VERSIONS.includes(raw.version as 1 | 2)) return null
  if (typeof raw.pending !== 'string' || !PENDING_KINDS.includes(raw.pending as PendingKind)) {
    return null
  }
  if (
    typeof raw.goalConfirmed !== 'boolean' ||
    typeof raw.planConfirmed !== 'boolean' ||
    typeof raw.resolutionConfirmed !== 'boolean' ||
    typeof raw.filesApproved !== 'boolean' ||
    typeof raw.lastToolFailed !== 'boolean'
  ) {
    return null
  }
  if (!isStringArray(raw.plannedFiles) || !isStringArray(raw.producedFiles)) return null
  if (!Array.isArray(raw.deniedApprovals)) return null
  const deniedApprovals: DeniedApproval[] = []
  for (const entry of raw.deniedApprovals) {
    if (!isRecord(entry)) return null
    if (typeof entry.toolName !== 'string' || typeof entry.subject !== 'string') return null
    deniedApprovals.push({ toolName: entry.toolName, subject: entry.subject })
  }
  if (
    !isCount(raw.rejectStreak) ||
    !isCount(raw.pendingRepeatCount) ||
    !isCount(raw.unresolvedTextReplies)
  ) {
    return null
  }
  const decisionContent = normalizeDecisionContent(raw.decisionContent)
  const lastRejectReason = parseRejectReason(raw.lastRejectReason)
  // 非 approval 决策点必须有可渲染内容；approval 卡由消息中的授权工具调用承载（可无 decisionContent）
  if (raw.pending !== 'none' && raw.pending !== 'approval' && !decisionContent) return null
  return {
    goalConfirmed: raw.goalConfirmed,
    planConfirmed: raw.planConfirmed,
    resolutionConfirmed: raw.resolutionConfirmed,
    pending: raw.pending as PendingKind,
    plannedFiles: new Set(raw.plannedFiles),
    producedFiles: new Set(raw.producedFiles),
    filesApproved: raw.filesApproved,
    lastToolFailed: raw.lastToolFailed,
    ...(decisionContent ? { decisionContent } : {}),
    deniedApprovals,
    rejectStreak: raw.rejectStreak,
    lastRejectReason: lastRejectReason ?? null,
    pendingRepeatCount: raw.pendingRepeatCount,
    unresolvedTextReplies: raw.unresolvedTextReplies,
  }
}
