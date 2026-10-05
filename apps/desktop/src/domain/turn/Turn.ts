import { DomainError } from '../domainError.js'
import { isExpired, type TurnToken } from './TurnToken.js'
import type { EventDraft, PayloadOf } from '../timeline.js'

// Turn 聚合根（详设 §2／段3 §2、§4 I-1/I-10/I-12/I-13/I-15）。
// 公开命令＝start（StartTurn）与 terminal（EndTurn；中止/中断为其内部终态分支，非独立命令）；
// MarkStalled（卡滞待指令）→S5。守卫的读侧入参由仓储/委托提供（校验位置仍在聚合，段3 §4）。
// TriggerSource 与 TurnTerminal 两 VO 单源＝事件注册表（段3 §3 闭集三种／§5 终态词表，不另造二源）。
export type TriggerSource = PayloadOf<'TurnStarted'>['triggerSource']
export type TurnTerminal = PayloadOf<'TurnEnded'>['terminal']

export interface StartInput {
  delegationId: string
  turnId: string
  triggerSource: TriggerSource
  inputId: string
}

export interface StartContext {
  inFlight: TurnToken | null // I-1 读侧＝TurnRepo.findInFlight
  deniedPending: boolean // I-15 读侧＝Delegation.awaitingUser
}

export class Turn {
  readonly turnId: string
  readonly delegationId: string
  readonly triggerSource: TriggerSource
  readonly token: TurnToken
  private _terminal: TurnTerminal | null = null
  private _expiredWrites = 0

  private constructor(input: StartInput) {
    this.turnId = input.turnId
    this.delegationId = input.delegationId
    this.triggerSource = input.triggerSource
    this.token = { delegationId: input.delegationId, turnId: input.turnId }
  }

  // I-1 单飞：已有在飞轮 ⇒ 命令拒绝（失败方输入由调用方转入队列，InputAcknowledged 归宿＝入队，C1）。
  // I-15 拒绝待决期：仅 TriggerSource=用户输入 可开轮。
  static start(
    input: StartInput,
    ctx: StartContext,
  ): { turn: Turn; started: EventDraft; acknowledged: EventDraft } {
    if (ctx.inFlight !== null) throw new DomainError('I-1', '在飞轮≤1，拒开新轮')
    if (ctx.deniedPending && input.triggerSource !== '用户输入')
      throw new DomainError('I-15', '拒绝待决期该委托仅用户输入可开轮')
    const turn = new Turn(input)
    return {
      turn,
      started: {
        type: 'TurnStarted',
        delegationId: input.delegationId,
        detail: {
          turnId: input.turnId,
          delegationId: input.delegationId,
          triggerSource: input.triggerSource,
        },
      },
      acknowledged: {
        type: 'InputAcknowledged',
        delegationId: input.delegationId,
        detail: {
          inputId: input.inputId,
          delegationId: input.delegationId,
          disposition: { into: 'turn', turnId: input.turnId },
          silentlyDropped: false,
        },
      },
    }
  }

  get terminalState(): TurnTerminal | null {
    return this._terminal
  }

  get inFlight(): boolean {
    return this._terminal === null
  }

  // I-10：每轮恰一个终态，重复终态＝幂等拒绝。
  terminal(kind: TurnTerminal): EventDraft {
    if (this._terminal !== null) throw new DomainError('I-10', '每轮恰一终态，重复终态拒绝')
    this._terminal = kind
    return {
      type: 'TurnEnded',
      delegationId: this.delegationId,
      detail: { turnId: this.turnId, terminal: kind },
    }
  }

  get expiredWriteCount(): number {
    return this._expiredWrites
  }

  // I-13 写前复核（推进恢复点）：过期 ⇒ 丢弃（返 false）且过期令牌写入计数器留证（聚合状态字段，不入 timeline）。
  guardedWrite(inFlight: TurnToken | null): boolean {
    if (!isExpired(this.token, inFlight)) return true
    this._expiredWrites += 1
    return false
  }
}
