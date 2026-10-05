import { DomainError } from '../domainError.js'
import { validClaim } from '../spec/validClaim.js'
import { acceptance } from '../spec/acceptance.js'
import type { EvidenceRepo } from '../repos/index.js'
import type { EventDraft } from '../timeline.js'

// Delegation 聚合状态机（详设 §2／段3 §2、§4 I-6/I-10/I-14/I-16）。
// 命令＝公开方法；违例 throw DomainError 且不改状态；返回事件草稿供 append（Task 18 接线）。
export type DelegationState =
  | 'created'
  | 'inProgress'
  | 'pendingDecision'
  | 'pendingClaim'
  | 'pendingVerify'
  | 'awaitingUser'
  | 'accepted'
  | 'rejected'
  | 'reopened'
  | 'archived'
  | 'abandoned'

export interface ClaimInput {
  claim: string
  turnId: string
  evidenceRefs: string[]
}

const isClosed = (s: DelegationState) => s === 'archived' || s === 'abandoned'

export class Delegation {
  readonly delegationId: string
  readonly intent: string
  private _state: DelegationState = 'created'
  private _reopenCount = 0

  private constructor(delegationId: string, intent: string) {
    this.delegationId = delegationId
    this.intent = intent
  }

  static create(
    delegationId: string,
    intent: string,
  ): { delegation: Delegation; event: EventDraft } {
    const delegation = new Delegation(delegationId, intent)
    return {
      delegation,
      event: {
        type: 'DelegationCreated',
        delegationId,
        detail: { delegationId, intent, scopeVersion: 1 },
      },
    }
  }

  get state(): DelegationState {
    return this._state
  }

  get reopenCount(): number {
    return this._reopenCount
  }

  // I-6：仅当存在有效声称（ValidClaimSpec 过）才转待核验；否则拒且不改状态（C5）。
  claimCompletion(claim: ClaimInput, evidenceRepo: EvidenceRepo): EventDraft {
    if (isClosed(this._state)) throw new DomainError('I-10', '终态委托不可再声称')
    if (
      !validClaim(
        { delegationId: this.delegationId, evidenceRefs: claim.evidenceRefs },
        evidenceRepo,
      )
    )
      throw new DomainError('I-6', '无据不核：声称证据无效，拒绝转待核验')
    this._state = 'pendingVerify'
    return {
      type: 'CompletionClaimed',
      delegationId: this.delegationId,
      detail: {
        delegationId: this.delegationId,
        turnId: claim.turnId,
        claim: claim.claim,
        evidenceRefs: claim.evidenceRefs,
      },
    }
  }

  // I-16/C13：待核验态 ∧ AcceptanceSpec 过才可验收。非待核验态（含重复终态 C8）⇒ 拒。
  accept(evidenceRepo: EvidenceRepo): EventDraft {
    if (this._state !== 'pendingVerify')
      throw new DomainError('I-16', '仅待核验态可验收（重复终态拒绝，C8）')
    if (!acceptance(evidenceRepo, this.delegationId)) throw new DomainError('I-16', '验收判据未过')
    this._state = 'accepted'
    return {
      type: 'DelegationAccepted',
      delegationId: this.delegationId,
      detail: { delegationId: this.delegationId, closeState: 'accepted' },
    }
  }

  // I-14/C11：验收拒绝⇒挂原 delegationId 重开（不新建委托），reopenCount 单调 +1，回推进中。
  // reason 入命令回执与呈现文案，不入 timeline：§5 DelegationRejected 键集仅 delegationId＋去向（禁增键）。
  reject(_reason?: string): { rejected: EventDraft; reopened: EventDraft } {
    if (this._state !== 'pendingVerify') throw new DomainError('I-16', '验收拒绝路径限待核验态')
    this._reopenCount += 1
    this._state = 'reopened'
    return {
      rejected: {
        type: 'DelegationRejected',
        delegationId: this.delegationId,
        detail: { delegationId: this.delegationId, outcome: 'reopened' },
      },
      reopened: {
        type: 'DelegationReopened',
        delegationId: this.delegationId,
        detail: { delegationId: this.delegationId, reopenCount: this._reopenCount },
      },
    }
  }

  // I-10/C8：已收尾→已归档＝终态更新；重复归档（非 accepted）⇒ 幂等拒绝。
  archive(): EventDraft {
    if (this._state !== 'accepted')
      throw new DomainError('I-10', '仅已收尾可归档（重复终态拒绝，C8）')
    this._state = 'archived'
    return {
      type: 'DelegationClosed',
      delegationId: this.delegationId,
      detail: { delegationId: this.delegationId, archivedState: 'archived' },
    }
  }

  // 机制侧内部转移（非段3 §2 关键命令，M-03 口径）：拒绝待决＝DecisionDenied 的事件驱动消费置位（详设 §2 awaitingUser）。
  // I-15 的校验位置在 Turn 聚合，其读侧＝本标记（段3 §4）；重复置位＝no-op（再次拒绝不重复计数）。
  markAwaitingUser(): void {
    if (isClosed(this._state)) throw new DomainError('I-10', '终态委托不再进入拒绝待决')
    this._state = 'awaitingUser'
  }

  // 解除＝TriggerSource=用户输入 的开轮成功（C12）；解除后回推进中态（新轮即推进），队列按序恢复消费。
  resumeFromAwaitingUser(): void {
    if (this._state !== 'awaitingUser') throw new DomainError('I-15', '非拒绝待决态无需解除')
    this._state = 'inProgress'
  }

  get awaitingUser(): boolean {
    return this._state === 'awaitingUser'
  }
}
