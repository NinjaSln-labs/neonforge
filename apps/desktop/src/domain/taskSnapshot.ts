// A1 Task 聚合跨重启快照（GitHub #11 / ADR-013）：ConversationState ↔ 纯 JSON 值。
// 领域层单源序列化：Set → string[]；恢复时严格校验（损坏快照返回 null，不阻断启动）。
// 持久化位置由 renderer sessionStore 与消息存档同一记录原子写入（compaction 基准一致）。
import {
  type ConversationState,
  type DecisionContent,
  type DecisionKind,
  type PendingKind,
  type RejectKind,
  type RejectReason,
} from './conversationState.js'

export const TASK_SNAPSHOT_VERSION = 1 as const

export interface DeniedApproval {
  toolName: string
  subject: string
}

export interface TaskSnapshot {
  version: typeof TASK_SNAPSHOT_VERSION
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
  lastRejectReason?: RejectReason
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
    ...(state.lastRejectReason ? { lastRejectReason: state.lastRejectReason } : {}),
    pendingRepeatCount: state.pendingRepeatCount,
    unresolvedTextReplies: state.unresolvedTextReplies,
  }
}

function parseDecisionContent(raw: unknown): DecisionContent | undefined {
  if (!isRecord(raw)) return undefined
  if (typeof raw.kind !== 'string' || !DECISION_KINDS.includes(raw.kind as DecisionKind)) {
    return undefined
  }
  if (typeof raw.since !== 'string') return undefined
  if (raw.proposal !== undefined && !isRecord(raw.proposal)) return undefined
  if (raw.approval !== undefined && !isRecord(raw.approval)) return undefined
  const content: DecisionContent = {
    kind: raw.kind as DecisionKind,
    since: raw.since,
  }
  if (isRecord(raw.proposal)) {
    content.proposal = raw.proposal as unknown as DecisionContent['proposal']
  }
  if (isRecord(raw.approval)) {
    content.approval = raw.approval as unknown as DecisionContent['approval']
  }
  return content
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
  if (raw.version !== TASK_SNAPSHOT_VERSION) return null
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
  // 聚合不变量：方案确认必然在目标确认之后；解决确认必然在方案确认之后——非法组合视为损坏快照
  if (raw.planConfirmed && !raw.goalConfirmed) return null
  if (raw.resolutionConfirmed && !raw.planConfirmed) return null
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
  const decisionContent = parseDecisionContent(raw.decisionContent)
  const lastRejectReason = parseRejectReason(raw.lastRejectReason)
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
    ...(lastRejectReason ? { lastRejectReason } : {}),
    pendingRepeatCount: raw.pendingRepeatCount,
    unresolvedTextReplies: raw.unresolvedTextReplies,
  }
}
