import { describe, it, expect } from 'vitest'
import { validClaim } from '../../src/domain/spec/validClaim'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'

const seed = (...specs: Array<[string, string]>) => {
  const repo = new InMemoryEvidenceRepo()
  for (const [id, delegationId] of specs)
    repo.save(
      EvidenceItem.record({ evidenceId: id, delegationId, type: '命令输出', content: `out ${id}` }),
    )
  return repo
}

describe('ValidClaimSpec（C4/I-5）', () => {
  it('evidenceRefs 空 ⇒ false', () => {
    expect(validClaim({ delegationId: 'd1', evidenceRefs: [] }, seed(['e1', 'd1']))).toBe(false)
  })

  it('全命中 ∧ 同委托 ⇒ true', () => {
    const repo = seed(['e1', 'd1'], ['e2', 'd1'])
    expect(validClaim({ delegationId: 'd1', evidenceRefs: ['e1', 'e2'] }, repo)).toBe(true)
  })

  it('悬空引用（ref 不存在）⇒ false', () => {
    const repo = seed(['e1', 'd1'])
    expect(validClaim({ delegationId: 'd1', evidenceRefs: ['e1', 'eGHOST'] }, repo)).toBe(false)
  })

  it('跨委托（证据属他委托）⇒ false', () => {
    const repo = seed(['e1', 'd1'], ['e2', 'd2'])
    expect(validClaim({ delegationId: 'd1', evidenceRefs: ['e1', 'e2'] }, repo)).toBe(false)
  })

  it('单条有效 ⇒ true（Provenance 恒系统采集）', () => {
    const repo = seed(['e1', 'd1'])
    expect(validClaim({ delegationId: 'd1', evidenceRefs: ['e1'] }, repo)).toBe(true)
  })

  it('全部证据 provenance=系统采集（类型面保证，仍判据）', () => {
    const repo = seed(['e1', 'd1'], ['e2', 'd1'])
    const items = repo.findByIds(['e1', 'e2'])
    expect(items.every((e) => e.provenance === '系统采集')).toBe(true)
  })
})
