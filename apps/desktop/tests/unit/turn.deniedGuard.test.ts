import { describe, it, expect } from 'vitest'
import { Turn, type StartContext, type StartInput } from '../../src/domain/turn/Turn'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { DomainError } from '../../src/domain/domainError'
import { InMemoryTurnRepo } from '../../src/domain/repos/memory/turnRepo'

const ctx = (over: Partial<StartContext> = {}): StartContext => ({
  inFlight: null,
  deniedPending: false,
  ...over,
})
const input = (turnId: string, triggerSource: StartInput['triggerSource']): StartInput => ({
  delegationId: 'd1',
  turnId,
  triggerSource,
  inputId: `in-${turnId}`,
})

describe('拒绝待决期守卫（C12／I-15 U2 守卫）', () => {
  it('DecisionDenied ⇒ 委托置拒绝待决标记（机制侧内部转移，事件驱动消费）', () => {
    const d = Delegation.create('d1', 'intent').delegation
    const dp = DecisionPoint.raise({
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '高影响清单命中', operation: '删除文件', requestedBy: 'AI 提请' },
    }).decisionPoint
    expect(dp.resolve('拒绝').map((e) => e.type)).toEqual(['DecisionResolved', 'DecisionDenied'])
    d.markAwaitingUser()
    expect(d.awaitingUser).toBe(true)
  })

  it('拒绝待决期：系统恢复／队列准入两源开轮＝命令拒绝，计数保持 0', () => {
    const repo = new InMemoryTurnRepo()
    const denied = { inFlight: null, deniedPending: true }
    for (const source of ['系统恢复', '队列准入'] as const) {
      expect(() => Turn.start(input(`t-${source}`, source), ctx(denied))).toThrow(DomainError)
    }
    expect(repo.findByDelegation('d1')).toHaveLength(0) // 开轮计数＝0
    expect(repo.findInFlight()).toBeNull()
  })

  it('拒绝待决期：用户输入源仍可开轮（推进权交还不等于冻结）', () => {
    const { turn } = Turn.start(input('t2', '用户输入'), ctx({ deniedPending: true }))
    expect(turn.triggerSource).toBe('用户输入')
  })

  it('解除后守卫退出：队列准入源恢复可用；单飞仍守 I-1（解除≠放开串行）', () => {
    const d = Delegation.create('d1', 'intent').delegation
    d.markAwaitingUser()
    expect(() => Turn.start(input('t2', '用户输入'), ctx({ deniedPending: true }))).not.toThrow()
    d.resumeFromAwaitingUser()
    expect(d.awaitingUser).toBe(false)
    const { turn: t3 } = Turn.start(input('t3', '队列准入'), ctx({ deniedPending: d.awaitingUser }))
    expect(t3.triggerSource).toBe('队列准入')
    expect(() => Turn.start(input('t4', '系统恢复'), ctx({ inFlight: t3.token }))).toThrow(
      DomainError,
    )
  })

  it('解除后队列按序恢复消费（FIFO 准入挂新轮）', () => {
    const queue = new InstructionQueue('q1')
    const a = queue.submitInput({
      itemId: 'i1',
      delegationId: 'd1',
      inputId: 'in-a',
      origin: '忙转投',
    }).item
    const b = queue.submitInput({
      itemId: 'i2',
      delegationId: 'd1',
      inputId: 'in-b',
      origin: '忙转投',
    }).item
    expect(queue.pending().map((i) => i.itemId)).toEqual(['i1', 'i2'])
    const d = Delegation.create('d1', 'intent').delegation
    d.markAwaitingUser()
    expect(() =>
      Turn.start(input('t4', '队列准入'), ctx({ deniedPending: d.awaitingUser })),
    ).toThrow(DomainError)
    const { turn: released } = Turn.start(
      input('t5', '用户输入'),
      ctx({ deniedPending: d.awaitingUser }),
    )
    d.resumeFromAwaitingUser()
    const { turn: admitted } = Turn.start(
      input('t6', '队列准入'),
      ctx({ deniedPending: d.awaitingUser }),
    )
    expect([a, b].map((i) => queue.admit(i.itemId, admitted.turnId)?.type)).toEqual([
      'InstructionAdmitted',
      'InstructionAdmitted',
    ])
    expect(queue.pending()).toEqual([])
    expect([released.triggerSource, admitted.triggerSource]).toEqual(['用户输入', '队列准入'])
  })

  it('非用户输入源在拒绝待决期的违例码可定位（I-15，供命令回执呈现）', () => {
    try {
      Turn.start(input('t9', '系统恢复'), ctx({ deniedPending: true }))
      expect.unreachable('应违例')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('I-15')
    }
  })
})
