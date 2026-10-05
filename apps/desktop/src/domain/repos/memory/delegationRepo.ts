import type { Delegation } from '../../delegation/Delegation.js'
import type { DelegationRepo } from '../index.js'

// S1 内存实现：findActive＝排除 archived/abandoned（含 accepted 已收尾，I-9 读侧）；listArchived＝archived。
export class InMemoryDelegationRepo implements DelegationRepo {
  private byId = new Map<string, Delegation>()

  save(d: Delegation): void {
    this.byId.set(d.delegationId, d)
  }

  findById(id: string): Delegation | undefined {
    return this.byId.get(id)
  }

  findActive(): Delegation[] {
    return [...this.byId.values()].filter((d) => d.state !== 'archived' && d.state !== 'abandoned')
  }

  listArchived(): Delegation[] {
    return [...this.byId.values()].filter((d) => d.state === 'archived')
  }
}
