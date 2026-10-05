import type { Scope } from '../../authorization/Scope.js'
import type { ScopeRepo } from '../index.js'

// S1 内存实现：一委托一作用域链（initial() 的 v1 链落存）。追加版本＝AmendScope→S2。
export class InMemoryScopeRepo implements ScopeRepo {
  private byDelegation = new Map<string, Scope>()

  save(scope: Scope): void {
    this.byDelegation.set(scope.delegationId, scope)
  }

  findByDelegation(delegationId: string): Scope | undefined {
    return this.byDelegation.get(delegationId)
  }
}
