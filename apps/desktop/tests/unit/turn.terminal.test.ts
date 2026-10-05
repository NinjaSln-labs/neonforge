import { describe, it, expect } from 'vitest'
import { Turn } from '../../src/domain/turn/Turn'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DomainError } from '../../src/domain/domainError'
import { InMemoryTurnRepo } from '../../src/domain/repos/memory/turnRepo'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import type { TurnTerminal } from '../../src/domain/turn/Turn'

const start = (turnId: string) =>
  Turn.start(
    { delegationId: 'd1', turnId, triggerSource: '用户输入', inputId: `in-${turnId}` },
    { inFlight: null, deniedPending: false },
  )

describe('Turn 恰一终态（C8／I-10 轮面＋委托面）', () => {
  it('三种终态各出 TurnEnded（收口/中止/中断＝段3 §3 TurnTerminal VO）', () => {
    const kinds: TurnTerminal[] = ['收口', '中止', '中断']
    for (const kind of kinds) {
      const { turn } = start(`t-${kind}`)
      expect(turn.terminal(kind).detail).toEqual({ turnId: `t-${kind}`, terminal: kind })
      expect(turn.terminalState).toBe(kind)
    }
  })

  it('重复终态 ⇒ 幂等拒绝，首个终态不变（I-10）', () => {
    const { turn } = start('t1')
    turn.terminal('中止')
    expect(() => turn.terminal('收口')).toThrow(DomainError)
    expect(turn.terminalState).toBe('中止')
  })

  it('终态后退出在飞读侧（findInFlight ≤1 的收口路径）', () => {
    const repo = new InMemoryTurnRepo()
    const { turn } = start('t1')
    repo.save(turn)
    expect(repo.findInFlight()?.turnId).toBe('t1')
    turn.terminal('收口')
    expect(repo.findInFlight()).toBeNull()
    expect(repo.findByDelegation('d1')).toHaveLength(1) // 终态轮仍可溯，非删除
  })

  it('TurnEnded 载荷键＝二键闭集（禁增禁减，段3 §5）', () => {
    const { turn } = start('t1')
    expect(Object.keys(turn.terminal('收口').detail).sort()).toEqual(['terminal', 'turnId'])
  })

  it('委托面恰一当前终态：accepted 后 reject 拒（重开路径限待核验态）', () => {
    const evidence = new InMemoryEvidenceRepo()
    evidence.save(
      EvidenceItem.record({ evidenceId: 'e1', delegationId: 'd1', type: '变更集', content: 'x' }),
    )
    const d = Delegation.create('d1', 'intent').delegation
    d.claimCompletion({ claim: 'done', turnId: 't1', evidenceRefs: ['e1'] }, evidence)
    d.accept(evidence)
    expect(() => d.reject()).toThrow(DomainError)
    expect(d.state).toBe('accepted')
  })
})
