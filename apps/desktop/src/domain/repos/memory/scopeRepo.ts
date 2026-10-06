import type { Scope } from '../../authorization/Scope.js'
import type { ScopeRepo } from '../index.js'

// 内存实现：一委托一作用域链。追加版本走聚合 `Scope.amend()`（S2a 已落）＋`rt.amendScope` 编排；
// 仓储不理解版本链（段3 §7），`scope:amend` 通道与呈现面属 S2b。
export class InMemoryScopeRepo implements ScopeRepo {
  private byDelegation = new Map<string, Scope>()

  save(scope: Scope): void {
    this.byDelegation.set(scope.delegationId, scope)
  }

  findByDelegation(delegationId: string): Scope | undefined {
    return this.byDelegation.get(delegationId)
  }
}
