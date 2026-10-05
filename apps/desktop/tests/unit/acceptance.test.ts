import { describe, it, expect } from 'vitest'
import { acceptance } from '../../src/domain/spec/acceptance'
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
