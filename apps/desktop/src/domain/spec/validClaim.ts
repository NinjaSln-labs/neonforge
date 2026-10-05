import type { EvidenceRepo } from '../repos/index.js'

// ValidClaimSpec（详设 §4／段3 I-5／C4）：声称有效性＝
//   evidenceRefs 非空 ∧ 全部命中（无悬空）∧ 全 Provenance=系统采集 ∧ 同 delegationId。
// Provenance 恒系统采集由证据类型面保证（I-5），此处仍显式判据以钉死契约。

export interface ClaimInput {
  delegationId: string
  evidenceRefs: string[]
}

export function validClaim(claim: ClaimInput, evidenceRepo: EvidenceRepo): boolean {
  const refs = claim.evidenceRefs
  if (refs.length === 0) return false
  const found = evidenceRepo.findByIds(refs)
  if (found.length !== refs.length) return false // 悬空引用
  return found.every((e) => e.provenance === '系统采集' && e.delegationId === claim.delegationId)
}
