import { describe, it, expect } from 'vitest'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { Scope, type ScopeEntry } from '../../src/domain/authorization/Scope'
import { DomainError } from '../../src/domain/domainError'

// 已批准的作用域修正决议（夹具）：raise 后 resolve('批准')，返回 EventDraft[] 非聚合本体。
function approvedDp(id: string): DecisionPoint {
  const { decisionPoint: dp } = DecisionPoint.raise({
    decisionPointId: id,
    delegationId: 'd1',
    turnId: 't1',
    requestReason: { reason: '作用域修正', operation: '扩到 docs', requestedBy: '用户提请' },
  })
  dp.resolve('批准')
  return dp
}

const base = (): Scope => Scope.initial('d1', [{ kind: '仓库', pattern: 'src/**' }])
const docs: ScopeEntry[] = [{ kind: '仓库', pattern: 'docs/**' }]
const TS = '2026-10-06T00:00:00Z'

describe('Scope 版本链 A1：seq 单调（amend 无 seq 注入位）', () => {
  it('1. initial v1 后 amend ⇒ version === 2', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    expect(next.scope.version).toBe(2)
  })

  it('2. chain 逐次严格递增 [1,2]，长度 2', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    expect([...next.scope.chain].map((v) => v.seq)).toEqual([1, 2])
    expect(next.scope.chain.length).toBe(2)
  })

  it('3. 对返回实例再 amend ⇒ 末位 seq 恰＝上一位 + 1', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    const prevSeq = next.scope.chain.at(-1)!.seq
    const next2 = next.scope.amend(approvedDp('dp2'), [{ kind: '目录', pattern: 'tests/**' }], TS)
    expect(next2.scope.chain.at(-1)!.seq).toBe(prevSeq + 1)
  })

  it('4. 调用方无 seq 注入位：连续 amend 的链仍 [1,2,3] 无跳号无越序', () => {
    const s1 = base().amend(approvedDp('dp1'), docs, TS).scope
    const s2 = s1.amend(approvedDp('dp2'), [{ kind: '目录', pattern: 'tests/**' }], TS).scope
    expect([...s2.chain].map((v) => v.seq)).toEqual([1, 2, 3])
  })
})

describe('Scope 版本链 A2：决议绑定', () => {
  it('5. chain[1].amendmentRef === 决议 dp1', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    expect(next.scope.chain[1].amendmentRef).toBe('dp1')
  })

  it('6. chain[0].amendmentRef === null（首版本无修正引用）', () => {
    expect(base().chain[0].amendmentRef).toBeNull()
  })

  it('7. 同 decisionPointId 二次修正 ⇒ DomainError I-8 且不产第二个版本', () => {
    const scope = base()
    const next = scope.amend(approvedDp('dp1'), docs, TS).scope
    const dpAgain = approvedDp('dp1')
    let err: unknown
    try {
      next.amend(dpAgain, [{ kind: '命令', pattern: 'rm -rf' }], TS)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('I-8')
    expect(next.chain.length).toBe(2)
  })
})

describe('Scope 版本链 A3：旧版本只读可溯（三层深冻结）', () => {
  it('8. 修正后整条链可读，旧版本 entries 逐字不变', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    expect(next.scope.chain.length).toBe(2)
    // 码审 CR3 采纳针：A3 的「逐字不变」判整条 entries，不是单字段——多 entry／改 kind 的漂移也要红。
    expect(next.scope.chain[0].entries).toEqual([{ kind: '仓库', pattern: 'src/**' }])
  })

  it('9. 三层深冻结：version／entries／entry 各冻结，改写尝试不生效', () => {
    const next = base().amend(approvedDp('dp1'), docs, TS)
    const v0 = next.scope.chain[0]
    expect(Object.isFrozen(v0)).toBe(true)
    expect(Object.isFrozen(v0.entries)).toBe(true)
    expect(Object.isFrozen(v0.entries[0])).toBe(true)
    // 逃逸尝试：严格模式下对冻结对象赋值抛 TypeError；即便不抛，重读也须逐字不变。
    expect(() => {
      v0.entries[0].pattern = 'x'
    }).toThrow()
    expect(next.scope.chain[0].entries[0].pattern).toBe('src/**')
  })
})
