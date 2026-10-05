import type { EvidenceRepo } from '../repos/index.js'

// AcceptanceSpec（详设 §4／段3 I-16／C13）——S1 只实现基线半边：
//   该 delegation 下存在 Provenance=系统采集 ∧ 可打开核验 的证据引用 ⇒ 通过证据侧判据。
// 「委托待核验态」这道闸由 Delegation.accept() 自持状态把关（Task 6），不在本谓词参数面。
// 产物谓词两条款（变更集 ∧ 验收判据运行结果）＝ADR-027 D1/D6 ⇒ 延 S4（acceptance.test.ts 记 it.skip，不预绿）。

export function acceptance(evidenceRepo: EvidenceRepo, delegationId: string): boolean {
  return evidenceRepo
    .findByDelegation(delegationId)
    .some((e) => e.provenance === '系统采集' && isOpenable(e))
}

function isOpenable(e: { payloadRef: { ptr: string; digest: string } }): boolean {
  return e.payloadRef != null && e.payloadRef.ptr !== ''
}
