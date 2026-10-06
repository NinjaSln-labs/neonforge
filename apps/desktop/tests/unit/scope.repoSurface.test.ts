import { describe, it, expect } from 'vitest'
import type { ScopeRepo } from '../../src/domain/repos/index'
import { InMemoryScopeRepo } from '../../src/domain/repos/memory/scopeRepo'

describe('A6：ScopeRepo 面不变（段3 §7 v1.3，防就地扩上游冻结件）', () => {
  it('方法名集合仍＝save／findByDelegation（类型层＋运行时层两面）', () => {
    const repo = new InMemoryScopeRepo()
    // ①类型层：多一个方法／少一个方法 ⇒ 双 tsc 编译不过（satisfies 逐键收口）
    const surface: Record<keyof ScopeRepo, unknown> = {
      save: repo.save,
      findByDelegation: repo.findByDelegation,
    } satisfies Record<keyof ScopeRepo, unknown>
    expect(Object.keys(surface).sort()).toEqual(['findByDelegation', 'save'])
    // ②运行时层：取原型上的自有属性名（class 方法在原型上，`for…in` 会漏）
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(repo))
    expect(new Set(proto)).toEqual(new Set(['constructor', 'save', 'findByDelegation']))
  })
})
