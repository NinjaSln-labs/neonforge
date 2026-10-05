import { DomainError } from '../domainError.js'
import type { EventDraft, PayloadOf } from '../timeline.js'

// DecisionPoint 聚合根（详设 §2／段3 §2、§4 I-3/I-7；段2 X1a/X2）。
// 公开命令＝raise/resolve；拒绝＝Resolution 三值之一（非独立 deny 命令，M-03）。
// 作废＝终态字段非决议值，由 DelegationAbandoned 事件驱动消费→S5（S1 不建该面）。
// I-3：每个决策点恰属一个 (delegationId, turnId) 归属对，缺归属⇒命令拒绝且不生成。

export type RequestCause = '作用域外' | '高影响清单命中' | '作用域修正'
export type RequestedBy = 'AI 提请' | '用户提请'

// RequestReason VO＝缘由＋操作描述＋requestedBy（不可变事实）。
export interface RequestReason {
  reason: RequestCause
  operation: string
  requestedBy: RequestedBy
}

export type ResolutionValue = PayloadOf<'DecisionResolved'>['resolution'] // 三值单源＝注册表（段2 X1a）

// Resolution VO＝决议值（承段2 X1a 三值）＋选项值（仅 选项 时有）＋时刻；首次生效、不可变。
export interface Resolution {
  value: ResolutionValue
  option: string | null
  at: string
}

export interface RaiseInput {
  decisionPointId: string
  delegationId: string
  turnId: string
  requestReason: RequestReason
}

export interface ResolveOptions {
  option?: string
  reason?: string
  at?: string
}

export class DecisionPoint {
  readonly decisionPointId: string
  readonly delegationId: string
  readonly turnId: string
  readonly requestReason: RequestReason
  private _resolution: Resolution | null = null

  private constructor(input: RaiseInput) {
    this.decisionPointId = input.decisionPointId
    this.delegationId = input.delegationId
    this.turnId = input.turnId
    this.requestReason = input.requestReason
  }

  static raise(input: RaiseInput): { decisionPoint: DecisionPoint; raised: EventDraft } {
    if (!input.delegationId || !input.turnId)
      throw new DomainError('I-3', '决策点缺 (delegationId, turnId) 归属，不生成')
    const decisionPoint = new DecisionPoint(input)
    const { reason, requestedBy } = input.requestReason
    return {
      decisionPoint,
      raised: {
        type: 'DecisionRaised',
        delegationId: input.delegationId,
        detail: {
          decisionPointId: input.decisionPointId,
          delegationId: input.delegationId,
          turnId: input.turnId,
          requestReason: { reason, requestedBy },
        },
      },
    }
  }

  get resolution(): Resolution | null {
    return this._resolution
  }

  get open(): boolean {
    return this._resolution === null
  }

  // 决议幂等（机制侧命令前置）：首次生效，重复决议拒绝。返回应落账的事件草稿（拒绝另发 DecisionDenied）。
  resolve(value: ResolutionValue, opts: ResolveOptions = {}): EventDraft[] {
    if (this._resolution !== null) throw new DomainError('C2', '决议首次生效，重复决议拒绝（幂等）')
    this._resolution = { value, option: opts.option ?? null, at: opts.at ?? '' }
    const drafts: EventDraft[] = [
      {
        type: 'DecisionResolved',
        delegationId: this.delegationId,
        detail: { decisionPointId: this.decisionPointId, resolution: value },
      },
    ]
    if (value === '拒绝') {
      drafts.push({
        type: 'DecisionDenied',
        delegationId: this.delegationId,
        detail: {
          decisionPointId: this.decisionPointId,
          delegationId: this.delegationId,
          turnId: this.turnId,
          ...(opts.reason === undefined ? {} : { reason: opts.reason }),
        },
      })
    }
    return drafts
  }
}
