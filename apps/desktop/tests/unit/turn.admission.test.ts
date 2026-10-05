import { describe, it, expect } from 'vitest'
import { Turn, type StartContext, type StartInput } from '../../src/domain/turn/Turn'
import { DomainError } from '../../src/domain/domainError'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { InMemoryTurnRepo } from '../../src/domain/repos/memory/turnRepo'
import type { EventDraft } from '../../src/domain/timeline'

const input = (turnId: string, over: Partial<StartInput> = {}): StartInput => ({
  delegationId: 'd1',
  turnId,
  triggerSource: '用户输入',
  inputId: `in-${turnId}`,
  ...over,
})
const ctx = (over: Partial<StartContext> = {}): StartContext => ({
  inFlight: null,
  deniedPending: false,
  ...over,
})

// C1 编排：在飞≤1，拒方输入转入队（§9 步2；S1b 接线前由本测承载）。
const startOrEnqueue = (
  repo: InMemoryTurnRepo,
  queue: InstructionQueue,
  i: StartInput,
): EventDraft[] => {
  const inFlight = repo.findInFlight()?.token ?? null
  try {
    const { turn, started, acknowledged } = Turn.start(i, ctx({ inFlight }))
    repo.save(turn)
    return [started, acknowledged]
  } catch (e) {
    if (!(e instanceof DomainError) || e.code !== 'I-1') throw e
    const { queued, acknowledged } = queue.submitInput({
      itemId: `q-${i.inputId}`,
      delegationId: i.delegationId,
      inputId: i.inputId,
      origin: 'StartTurn 忙转投',
    })
    return [queued, acknowledged]
  }
}

describe('Turn 单飞准入（C1／I-1）', () => {
  it('空闲时 start ⇒ TurnStarted + InputAcknowledged（归宿＝进轮）', () => {
    const repo = new InMemoryTurnRepo()
    const { turn, started, acknowledged } = Turn.start(input('t1'), ctx())
    repo.save(turn)
    expect(started.detail).toMatchObject({
      turnId: 't1',
      delegationId: 'd1',
      triggerSource: '用户输入',
    })
    expect(acknowledged.detail).toMatchObject({ disposition: { into: 'turn', turnId: 't1' } })
    expect(repo.findInFlight()?.turnId).toBe('t1')
  })

  it('已有在飞轮再 start ⇒ 命令拒绝（I-1 在飞≤1），不产生第二个轮', () => {
    const repo = new InMemoryTurnRepo()
    const { turn } = Turn.start(input('t1'), ctx())
    repo.save(turn)
    expect(() => Turn.start(input('t2'), ctx({ inFlight: turn.token }))).toThrow(DomainError)
    expect(repo.findInFlight()?.turnId).toBe('t1')
    expect(repo.findByDelegation('d1')).toHaveLength(1)
  })

  it('并发两次 StartTurn ⇒ 至多一次成功；失败方输入入队非丢弃（InputAcknowledged 归宿＝入队）', () => {
    const repo = new InMemoryTurnRepo()
    const queue = new InstructionQueue('q1')
    const first = startOrEnqueue(repo, queue, input('t1', { inputId: 'in-a' }))
    const second = startOrEnqueue(repo, queue, input('t2', { inputId: 'in-b' }))
    expect(first.map((e) => e.type)).toEqual(['TurnStarted', 'InputAcknowledged'])
    expect(second.map((e) => e.type)).toEqual(['InstructionQueued', 'InputAcknowledged'])
    expect(second[1]).toMatchObject({
      detail: { disposition: { into: 'queue', itemId: 'q-in-b' }, silentlyDropped: false },
    })
    expect(repo.findInFlight()?.turnId).toBe('t1')
    expect(queue.pending().map((i) => i.inputId)).toEqual(['in-b'])
  })

  it('轮收口后在飞清空 ⇒ 下一轮可 start，队列项准入挂新轮', () => {
    const repo = new InMemoryTurnRepo()
    const queue = new InstructionQueue('q1')
    const { turn } = Turn.start(input('t1'), ctx())
    repo.save(turn)
    turn.terminal('收口')
    expect(repo.findInFlight()).toBeNull()
    const { item } = queue.submitInput({
      itemId: 'q1',
      delegationId: 'd1',
      inputId: 'in-q',
      origin: '用户排队',
    })
    const started = startOrEnqueue(repo, queue, input('t2', { triggerSource: '队列准入' }))
    expect(started.map((e) => e.type)).toEqual(['TurnStarted', 'InputAcknowledged'])
    expect(queue.admit(item.itemId, 't2')).toMatchObject({
      type: 'InstructionAdmitted',
      detail: { itemId: 'q1', admittedTurnId: 't2' },
    })
  })

  it('在飞轮非本委托时同样拒（I-1 单位＝全局单飞，非按委托各一）', () => {
    const repo = new InMemoryTurnRepo()
    const { turn } = Turn.start(input('t1'), ctx())
    repo.save(turn)
    expect(() =>
      Turn.start(input('t9', { delegationId: 'd2' }), ctx({ inFlight: turn.token })),
    ).toThrow(DomainError)
    expect(repo.findInFlight()?.delegationId).toBe('d1')
  })
})
