import { describe, it, expect } from 'vitest'
import { REQUEST_CAUSES } from '../../src/domain/authorization/DecisionPoint'
import { OPERATION_CATEGORIES } from '../../src/domain/spec/requiresApproval'

describe('F-14：作用域修正词表双源同源断言', () => {
  it('两侧各三值，且共享成员的字面完全同一（取同一常量比较，不各写一遍字面）', () => {
    expect(REQUEST_CAUSES.length).toBe(3)
    expect(OPERATION_CATEGORIES.length).toBe(3)
    const shared = REQUEST_CAUSES.filter((c) => OPERATION_CATEGORIES.includes(c))
    expect(shared).toEqual(['作用域修正'])
  })
})
