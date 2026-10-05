import { describe, it, expect } from 'vitest'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { DomainError } from '../../src/domain/domainError'

const submit = (
  itemId: string,
  over: Partial<Parameters<InstructionQueue['submitInput']>[0]> = {},
) => ({
  itemId,
  delegationId: 'd1',
  inputId: `in-${itemId}`,
  origin: 'StartTurn 忙转投',
  ...over,
})

describe('InstructionQueue（C3／I-4 单一消费 + FIFO）', () => {
  it('submitInput 入队分支 ⇒ InstructionQueued + InputAcknowledged（归宿＝入队，非丢弃）', () => {
    const q = new InstructionQueue('q1')
    const { queued, acknowledged } = q.submitInput(submit('i1'))
    expect(queued.type).toBe('InstructionQueued')
    expect(queued.detail).toEqual({ itemId: 'i1', delegationId: 'd1', origin: 'StartTurn 忙转投' })
    expect(acknowledged.type).toBe('InputAcknowledged')
    expect(acknowledged.detail).toMatchObject({
      inputId: 'in-i1',
      delegationId: 'd1',
      disposition: { into: 'queue', itemId: 'i1' },
      silentlyDropped: false,
    })
  })

  it('pending 排除已准入/已撤回 ∧ FIFO 保序（I-9 有归宿）', () => {
    const q = new InstructionQueue('q1')
    ;['i1', 'i2', 'i3'].forEach((id) => q.submitInput(submit(id)))
    expect(q.pending().map((i) => i.itemId)).toEqual(['i1', 'i2', 'i3'])
    q.admit('i2', 't1')
    q.markWithdrawn('i1')
    expect(q.pending().map((i) => i.itemId)).toEqual(['i3'])
  })

  it('admit 首次生效 ⇒ InstructionAdmitted；同 itemId 二次准入＝no-op（I-4 幂等）', () => {
    const q = new InstructionQueue('q1')
    q.submitInput(submit('i1'))
    const admitted = q.admit('i1', 't1')
    expect(admitted).toMatchObject({
      type: 'InstructionAdmitted',
      detail: { itemId: 'i1', admittedTurnId: 't1' },
    })
    expect(q.admit('i1', 't2')).toBeNull()
    expect(q.pending()).toEqual([])
  })

  it('撤回是终态：已撤回项再 admit ⇒ 拒绝（I-4）', () => {
    const q = new InstructionQueue('q1')
    q.submitInput(submit('i1'))
    q.markWithdrawn('i1')
    expect(() => q.admit('i1', 't1')).toThrow(DomainError)
  })

  it('悬空 itemId admit ⇒ 拒绝（无项可准入）', () => {
    expect(() => new InstructionQueue('q1').admit('ghost', 't1')).toThrow(DomainError)
  })

  it('同 itemId 重复入队 ⇒ 拒（准入按 id 定位唯一项，重复即双源）', () => {
    const q = new InstructionQueue('q1')
    q.submitInput(submit('i1'))
    expect(() => q.submitInput(submit('i1'))).toThrow(DomainError)
  })

  it('撤回后项终态可见、不占 pending（markWithdrawn＝机制口，S1 不接 DelegationAbandoned）', () => {
    const q = new InstructionQueue('q1')
    q.submitInput(submit('i1'))
    q.markWithdrawn('i1')
    const item = q.find('i1')
    expect([item?.state, item?.withdrawn]).toEqual(['withdrawn', true])
    expect(() => q.markWithdrawn('i1')).toThrow(DomainError) // 重复撤回＝终态唯一
  })
})
