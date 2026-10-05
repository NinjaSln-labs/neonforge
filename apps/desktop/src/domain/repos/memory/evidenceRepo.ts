import type { EvidenceItem } from '../../evidence/EvidenceItem.js'
import type { EvidenceRepo } from '../index.js'

// S1 内存实现：单线程；findByIds 只返存在项（悬空 ref 由上层 ValidClaimSpec 以「返回数≠请求数」判拒）。
export class InMemoryEvidenceRepo implements EvidenceRepo {
  private items = new Map<string, EvidenceItem>()

  save(item: EvidenceItem): void {
    this.items.set(item.evidenceId, item)
  }

  findByIds(ids: string[]): EvidenceItem[] {
    const found: EvidenceItem[] = []
    for (const id of ids) {
      const it = this.items.get(id)
      if (it) found.push(it)
    }
    return found
  }

  findByDelegation(delegationId: string): EvidenceItem[] {
    return [...this.items.values()].filter((e) => e.delegationId === delegationId)
  }

  markFirstInspection(id: string): void {
    this.items.get(id)?.inspect()
  }
}
