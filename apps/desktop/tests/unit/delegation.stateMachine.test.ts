import { describe, it, expect } from 'vitest'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DomainError } from '../../src/domain/domainError'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import type { EvidenceRepo } from '../../src/domain/repos/index'

const repoWith = (...specs: Array<[string, string]>): EvidenceRepo => {
  const r = new InMemoryEvidenceRepo()
  for (const [id, delegationId] of specs)
    r.save(EvidenceItem.record({ evidenceId: id, delegationId, type: '命令输出', content: 'x' }))
  return r
}
const claim = (refs: string[]) => ({ claim: 'done', turnId: 't1', evidenceRefs: refs })
const fresh = () => Delegation.create('d1', 'intent').delegation

describe('Delegation 状态机（C5/I-6 + 基线转移 C8）', () => {
  it('create ⇒ created，事件 DelegationCreated', () => {
    const { delegation, event } = Delegation.create('d1', 'intent')
    expect(delegation.state).toBe('created')
    expect(event.type).toBe('DelegationCreated')
  })

  it('无有效证据声称 ⇒ 拒（I-6/C5），状态不变', () => {
    const d = fresh()
    expect(() => d.claimCompletion(claim(['ghost']), repoWith())).toThrow(DomainError)
    expect(d.state).toBe('created')
  })

  it('有效声称 ⇒ pendingVerify', () => {
    const d = fresh()
    d.claimCompletion(claim(['e1']), repoWith(['e1', 'd1']))
    expect(d.state).toBe('pendingVerify')
  })

  it('非待核验态 accept ⇒ 拒', () => {
    expect(() => fresh().accept(repoWith(['e1', 'd1']))).toThrow(DomainError)
  })

  it('待核验 ∧ 验收判据过 ⇒ accepted', () => {
    const d = fresh()
    const repo = repoWith(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    d.accept(repo)
    expect(d.state).toBe('accepted')
  })

  it('已收尾→已归档＝终态更新（I-10/C8）', () => {
    const d = fresh()
    const repo = repoWith(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    d.accept(repo)
    d.archive()
    expect(d.state).toBe('archived')
  })

  it('重复归档 ⇒ 幂等拒绝（C8：非 accepted 不可再归档）', () => {
    const d = fresh()
    const repo = repoWith(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    d.accept(repo)
    d.archive()
    expect(() => d.archive()).toThrow(DomainError)
  })
})
