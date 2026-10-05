import { describe, it, expect } from 'vitest'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DomainError } from '../../src/domain/domainError'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'

const repoWith = (...specs: Array<[string, string]>) => {
  const r = new InMemoryEvidenceRepo()
  for (const [id, delegationId] of specs)
    r.save(EvidenceItem.record({ evidenceId: id, delegationId, type: '命令输出', content: 'x' }))
  return r
}
const claim = (refs: string[]) => ({ claim: 'done', turnId: 't1', evidenceRefs: refs })

describe('Delegation 重开挂原单（C11/I-14）', () => {
  it('pendingVerify reject ⇒ reopened，delegationId 不变、reopenCount +1、发 Rejected+Reopened', () => {
    const d = Delegation.create('d1', 'intent').delegation
    const repo = repoWith(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    const { rejected, reopened } = d.reject()
    expect(d.delegationId).toBe('d1')
    expect(d.state).toBe('reopened')
    expect(d.reopenCount).toBe(1)
    expect(rejected.type).toBe('DelegationRejected')
    expect(reopened.type).toBe('DelegationReopened')
  })

  it('重开后重新声称→再拒 ⇒ reopenCount 单调 +1，仍同一委托（不新建）', () => {
    const d = Delegation.create('d1', 'intent').delegation
    const repo = repoWith(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    d.reject()
    d.claimCompletion(claim(['e1']), repo) // 允许自 reopened 再声称
    d.reject()
    expect(d.reopenCount).toBe(2)
    expect(d.delegationId).toBe('d1')
  })

  it('非待核验态 reject ⇒ 拒（路径限 pendingVerify）', () => {
    const d = Delegation.create('d1', 'intent').delegation
    expect(() => d.reject()).toThrow(DomainError)
  })
})
