import { DomainError } from '../domainError.js'
import type { EventDraft } from '../timeline.js'

// InstructionQueue 聚合根（详设 §2／段3 §2、§4 I-4/I-9；V1 单队列＝全局一个 queueId）。
// 命令＝submitInput（入队分支）/admit；撤回＝markWithdrawn 机制口的领域侧，无独立用户命令（M-03），
// 其唯一触发（所属委托 DelegationAbandoned 事件驱动消费）→S5，S1 不接。
// 本文件零归档面 import。

export type QueueItemState = 'queued' | 'admitted' | 'withdrawn'

export interface SubmitInput {
  itemId: string
  delegationId: string
  inputId: string
  origin: string // ItemOrigin VO 读数（不可变事实）
}

export class QueueItem {
  readonly itemId: string
  readonly delegationId: string
  readonly inputId: string
  readonly origin: string
  private _state: QueueItemState = 'queued'
  private _turnId: string | null = null

  constructor(input: SubmitInput) {
    this.itemId = input.itemId
    this.delegationId = input.delegationId
    this.inputId = input.inputId
    this.origin = input.origin
  }

  get state(): QueueItemState {
    return this._state
  }

  get admittedTurnId(): string | null {
    return this._turnId
  }

  get queued(): boolean {
    return this._state === 'queued'
  }

  get withdrawn(): boolean {
    return this._state === 'withdrawn'
  }

  // 转移只由聚合根在守卫后调用（I-4 校验位置＝聚合）。
  admit(turnId: string): void {
    this._state = 'admitted'
    this._turnId = turnId
  }

  withdraw(): void {
    this._state = 'withdrawn'
  }
}

export class InstructionQueue {
  readonly queueId: string
  private items: QueueItem[] = []

  constructor(queueId: string) {
    this.queueId = queueId
  }

  find(itemId: string): QueueItem | undefined {
    return this.items.find((i) => i.itemId === itemId)
  }

  // 读侧（I-9 排队有归宿／C3）：未准入未撤回项按登记序＝FIFO。
  pending(): QueueItem[] {
    return this.items.filter((i) => i.queued)
  }

  submitInput(input: SubmitInput): {
    item: QueueItem
    queued: EventDraft
    acknowledged: EventDraft
  } {
    if (this.find(input.itemId))
      throw new DomainError('C3', '同 itemId 重复入队拒绝（id 定位唯一项）')
    const item = new QueueItem(input)
    this.items.push(item)
    return {
      item,
      queued: {
        type: 'InstructionQueued',
        delegationId: input.delegationId,
        detail: { itemId: input.itemId, delegationId: input.delegationId, origin: input.origin },
      },
      acknowledged: {
        type: 'InputAcknowledged',
        delegationId: input.delegationId,
        detail: {
          inputId: input.inputId,
          delegationId: input.delegationId,
          disposition: { into: 'queue', itemId: input.itemId },
          silentlyDropped: false,
        },
      },
    }
  }

  // I-4 单一消费：首次准入生效，二次＝no-op（返 null 不出第二事件）；撤回项再准入＝拒绝。
  admit(itemId: string, turnId: string): EventDraft | null {
    const item = this.require(itemId)
    if (item.state === 'withdrawn') throw new DomainError('I-4', '撤回为终态，不可再准入')
    if (item.state === 'admitted') return null
    item.admit(turnId)
    return {
      type: 'InstructionAdmitted',
      delegationId: item.delegationId,
      detail: { itemId, admittedTurnId: turnId },
    }
  }

  markWithdrawn(itemId: string): void {
    const item = this.require(itemId)
    if (!item.queued) throw new DomainError('I-10', '撤回限排队中的项（终态唯一）')
    item.withdraw()
  }

  private require(itemId: string): QueueItem {
    const item = this.find(itemId)
    if (!item) throw new DomainError('I-4', '队列无此项')
    return item
  }
}
