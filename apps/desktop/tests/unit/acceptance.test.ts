import { describe, it, expect } from 'vitest'
import { acceptance } from '../../src/domain/spec/acceptance'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DomainError } from '../../src/domain/domainError'

const seed = (...specs: Array<[string, string]>) => {
  const repo = new InMemoryEvidenceRepo()
  for (const [id, delegationId] of specs)
    repo.save(
      EvidenceItem.record({ evidenceId: id, delegationId, type: '命令输出', content: `out ${id}` }),
    )
  return repo
}
const claim = (refs: string[]) => ({ claim: 'done', turnId: 't1', evidenceRefs: refs })

describe('AcceptanceSpec 基线（C13）', () => {
  it('存在系统采集且可打开的证据 ⇒ true', () => {
    expect(acceptance(seed(['e1', 'd1']), 'd1')).toBe(true)
  })

  it('该委托零证据 ⇒ false', () => {
    expect(acceptance(seed(), 'd1')).toBe(false)
  })

  it('证据属他委托 ⇒ 本委托 false（限界）', () => {
    expect(acceptance(seed(['e1', 'd2']), 'd1')).toBe(false)
  })

  it.skip('产物谓词两条款（变更集 ∧ 验收判据运行结果）→ S4（ADR-027 D1/D6，不预绿）', () => {
    // S1 基线只判「系统采集 ∧ 可打开」；两条款合取为必要条件属 S4 接线，届时补真判据
  })
})

describe('Delegation.accept 验收前置（C13/I-16）', () => {
  it('待核验 ∧ 验收判据过 ⇒ accepted', () => {
    const d = Delegation.create('d1', 'intent').delegation
    const repo = seed(['e1', 'd1'])
    d.claimCompletion(claim(['e1']), repo)
    d.accept(repo)
    expect(d.state).toBe('accepted')
  })

  it('待核验但验收判据不过 ⇒ 拒且可走 reject（DelegationRejected 路径）', () => {
    const d = Delegation.create('d1', 'intent').delegation
    d.claimCompletion(claim(['e1']), seed(['e1', 'd1']))
    expect(() => d.accept(seed())).toThrow(DomainError) // 证据不可核
    const { rejected } = d.reject() // 拒绝路径仍可用
    expect(rejected.type).toBe('DelegationRejected')
    expect(d.state).toBe('reopened')
  })

  it('非待核验态 accept ⇒ 拒', () => {
    const d = Delegation.create('d1', 'intent').delegation
    expect(() => d.accept(seed(['e1', 'd1']))).toThrow(DomainError)
  })
})
