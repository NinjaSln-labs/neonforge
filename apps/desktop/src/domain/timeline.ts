// TimelineLog 机制聚合 ＋ 22 事件闭集注册表
// 契约源＝段3 `03-domain-tactics.md` §5（frozen v1.2，事件名/载荷键逐字）＋ 详设 v1.0.0-s1-detailed-design.md §6
// I-2 单一写者：record 为唯一写者口，seq 全局单调无重号无跳号；追加失败⇒同事务回滚。
// 本文件不 import 任何归档面（conversationState/agentLoop/protocolTools/…/timelineLogger）——G-1 防回流。

// ─────────────────────────────────────────────────────────────
// EventType 闭集（22 名，顺序＝段3 §5 表；禁增禁减）
// S1 发射 17，另 5（ScopeAmended/StallDetected/SessionInterrupted/DelegationRestored/DelegationAbandoned）
//   类型先入联合占位、发射逻辑分阶段接线（S2/S3/S5）。
// ─────────────────────────────────────────────────────────────
export type EventType =
  | 'DelegationCreated'
  | 'InputAcknowledged'
  | 'TurnStarted'
  | 'TurnEnded'
  | 'DecisionRaised'
  | 'DecisionResolved'
  | 'DecisionDenied'
  | 'ScopeAmended'
  | 'ChangeProduced'
  | 'EvidenceRecorded'
  | 'EvidenceInspected'
  | 'CompletionClaimed'
  | 'DelegationAccepted'
  | 'DelegationRejected'
  | 'DelegationReopened'
  | 'DelegationClosed'
  | 'InstructionQueued'
  | 'InstructionAdmitted'
  | 'StallDetected'
  | 'SessionInterrupted'
  | 'DelegationRestored'
  | 'DelegationAbandoned'

/** 22 事件闭集名单快照＝段3 §5（`timeline.eventCatalog.test.ts` 比对此序，改动回段3 不改测试）。 */
export const EVENT_NAMES: readonly EventType[] = [
  'DelegationCreated',
  'InputAcknowledged',
  'TurnStarted',
  'TurnEnded',
  'DecisionRaised',
  'DecisionResolved',
  'DecisionDenied',
  'ScopeAmended',
  'ChangeProduced',
  'EvidenceRecorded',
  'EvidenceInspected',
  'CompletionClaimed',
  'DelegationAccepted',
  'DelegationRejected',
  'DelegationReopened',
  'DelegationClosed',
  'InstructionQueued',
  'InstructionAdmitted',
  'StallDetected',
  'SessionInterrupted',
  'DelegationRestored',
  'DelegationAbandoned',
] as const

/** S1 不发射的 5 事件（详设 §6 M-01/M-11/M-13：类型先入联合、发射逻辑分阶段接线）。 */
const NON_EMIT: readonly EventType[] = [
  'ScopeAmended',
  'StallDetected',
  'SessionInterrupted',
  'DelegationRestored',
  'DelegationAbandoned',
] as const

/** S1 发射子集（17）＝22 闭集去掉上述 5 个。 */
export const S1_EMIT_EVENT_NAMES: readonly EventType[] = EVENT_NAMES.filter(
  (n) => !NON_EMIT.includes(n),
) as readonly EventType[]

// ─────────────────────────────────────────────────────────────
// 载荷接口（键名 camelCase 系段6 接线权，语义逐一对齐段3 §5 描述符；禁增禁减）
// 未发射 5 事件的载荷类型先收口 never（详设 §6 CC-04，接线阶段替换）。
// ─────────────────────────────────────────────────────────────
export interface DelegationCreatedPayload {
  delegationId: string
  intent: string
  scopeVersion: number // =1
}

// 段3 §5「归宿(进轮 turnId/入队 itemId)」＝单键，值域按进轮/入队二选一（不拆成两键）。
export type InputDisposition = { into: 'turn'; turnId: string } | { into: 'queue'; itemId: string }
export interface InputAcknowledgedPayload {
  inputId: string
  delegationId: string
  disposition: InputDisposition // 归宿
  silentlyDropped: false // 静默丢弃标志（恒否）
}

export interface TurnStartedPayload {
  turnId: string
  delegationId: string
  triggerSource: string
}

// terminal 三值＝段3 §5「收口/中止/中断」
export interface TurnEndedPayload {
  turnId: string
  terminal: 'closed' | 'aborted' | 'interrupted'
}

// requestReason＝段3 §5「缘由+requestedBy」（单键承载二面）
export interface DecisionRaisedPayload {
  decisionPointId: string
  delegationId: string
  turnId: string
  requestReason: { reason: string; requestedBy: string }
}

export interface DecisionResolvedPayload {
  decisionPointId: string
  resolution: string
}

// 理由(可选) → reason?: string（§5 明标「可选」，键可缺省）
export interface DecisionDeniedPayload {
  decisionPointId: string
  delegationId: string
  turnId: string
  reason?: string
}

// 变更集ref(=PayloadRef)→changeSetRef；作用域校验结果→scopeCheckResult
export interface ChangeProducedPayload {
  delegationId: string
  turnId: string
  changeSetRef: string
  scopeCheckResult: string
}

export interface EvidenceRecordedPayload {
  evidenceId: string
  type: string // EvidenceType 四值（段3 §3）
  delegationId: string
  payloadRef: string
}

// 核验动作(打开)→inspectAction；首次打开标志→firstInspection
export interface EvidenceInspectedPayload {
  evidenceId: string
  delegationId: string
  inspectAction: 'open'
  firstInspection: boolean
}

export interface CompletionClaimedPayload {
  delegationId: string
  turnId: string
  claim: string
  evidenceRefs: string[]
}

// 收尾态→closeState（段3 §8 收束态三值）
export interface DelegationAcceptedPayload {
  delegationId: string
  closeState: string
}

// 去向→outcome
export interface DelegationRejectedPayload {
  delegationId: string
  outcome: string
}

export interface DelegationReopenedPayload {
  delegationId: string
  reopenCount: number
}

// 归档态→archivedState
export interface DelegationClosedPayload {
  delegationId: string
  archivedState: string
}

export interface InstructionQueuedPayload {
  itemId: string
  delegationId: string
  origin: string
}

// 准入 turnId→admittedTurnId
export interface InstructionAdmittedPayload {
  itemId: string
  admittedTurnId: string
}

// 未发射 5 事件：类型入联合、载荷 never（S2/S3/S5 接线时替换）
export type ScopeAmendedPayload = never
export type StallDetectedPayload = never
export type SessionInterruptedPayload = never
export type DelegationRestoredPayload = never
export type DelegationAbandonedPayload = never

// ─────────────────────────────────────────────────────────────
// PayloadOf 判别联合（详设 §6：detail 由此收口；TS 类型面＝契约面）
// ─────────────────────────────────────────────────────────────
export interface PayloadMap {
  DelegationCreated: DelegationCreatedPayload
  InputAcknowledged: InputAcknowledgedPayload
  TurnStarted: TurnStartedPayload
  TurnEnded: TurnEndedPayload
  DecisionRaised: DecisionRaisedPayload
  DecisionResolved: DecisionResolvedPayload
  DecisionDenied: DecisionDeniedPayload
  ScopeAmended: ScopeAmendedPayload
  ChangeProduced: ChangeProducedPayload
  EvidenceRecorded: EvidenceRecordedPayload
  EvidenceInspected: EvidenceInspectedPayload
  CompletionClaimed: CompletionClaimedPayload
  DelegationAccepted: DelegationAcceptedPayload
  DelegationRejected: DelegationRejectedPayload
  DelegationReopened: DelegationReopenedPayload
  DelegationClosed: DelegationClosedPayload
  InstructionQueued: InstructionQueuedPayload
  InstructionAdmitted: InstructionAdmittedPayload
  StallDetected: StallDetectedPayload
  SessionInterrupted: SessionInterruptedPayload
  DelegationRestored: DelegationRestoredPayload
  DelegationAbandoned: DelegationAbandonedPayload
}

export type PayloadOf<T extends EventType> = PayloadMap[T]

// ─────────────────────────────────────────────────────────────
// 事件与 VO
// ─────────────────────────────────────────────────────────────
export type AnyPayload = PayloadMap[EventType]

export interface TimelineEvent {
  ts: string // ISO
  seq: number // 全局单调
  delegationId: string
  type: EventType
  detail: AnyPayload
}

// EventEntry VO＝seq＋事件，追加不可变（段3 §3）。
export interface EventEntry {
  readonly seq: number
  readonly event: TimelineEvent
}

// append 机制口的输入＝事件主体（无 seq，seq 由聚合落）。
export interface AppendInput {
  ts: string
  delegationId: string
  type: EventType
  detail: AnyPayload
}

// 聚合命令派生的事件草稿（未落 seq/ts，供 Task 18 经 TimelineRepo.append 落账）。跨聚合共享 VO。
export interface EventDraft {
  type: EventType
  delegationId: string
  detail: AnyPayload
}

// ─────────────────────────────────────────────────────────────
// TimelineLog 聚合根：唯一写者口 record（seq 单调、无重号无跳号）。
// TimelineRepo.append 为其机制口（M-02：seq/单写者由聚合维护，非仓储）；
// 追加与聚合状态写入同事务，失败⇒回滚（§6 例外条款）。
// ─────────────────────────────────────────────────────────────
export class TimelineLog {
  private entries: EventEntry[] = []
  private nextSeq = 1
  private listeners = new Set<(event: TimelineEvent) => void>()

  // 进程内只读订阅（呈现/度量为只读消费者）；返回 unsubscribe。
  subscribe(listener: (event: TimelineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // 只读分发（无对外发布通道，L0 原则6）。由 append 机制口在落账成功【后】调用（先落账后分发）。
  publish(event: TimelineEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  // 唯一写者口：落全局单调 seq 入序列，返回 EventEntry（seq＋event）。
  record(input: AppendInput): EventEntry {
    const event: TimelineEvent = { ...input, seq: this.nextSeq }
    const entry: EventEntry = { seq: this.nextSeq, event }
    this.entries.push(entry)
    this.nextSeq += 1
    return entry
  }

  // 同事务回滚：丢弃 seq > uptoLastSeq 的追加、复位游标（append 内 tx throw 时调）。
  rollbackTo(uptoLastSeq: number): void {
    this.entries = this.entries.filter((e) => e.seq <= uptoLastSeq)
    this.nextSeq = uptoLastSeq + 1
  }

  lastSeq(): number {
    return this.entries.length === 0 ? 0 : this.entries[this.entries.length - 1].seq
  }

  since(seq: number): TimelineEvent[] {
    return this.entries.filter((e) => e.seq >= seq).map((e) => e.event)
  }

  findByDelegation(id: string): TimelineEvent[] {
    return this.entries.filter((e) => e.event.delegationId === id).map((e) => e.event)
  }
}
