import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { Scope, type ScopeEntry } from '../../src/domain/authorization/Scope'
import { DomainError } from '../../src/domain/domainError'
import { getRuntime, resetRuntime } from '../../src/main/domainRuntime'

// S2a Task 2 A4/A5：amend() 的 I-17 两支前置——缘由＝作用域修正 ∧ 决议已批准。
function raiseDp(
  id: string,
  requestedBy: 'AI 提请' | '用户提请' = '用户提请',
  cause: '作用域修正' | '作用域外' = '作用域修正',
): DecisionPoint {
  const { decisionPoint: dp } = DecisionPoint.raise({
    decisionPointId: id,
    delegationId: 'd1',
    turnId: 't1',
    requestReason: { reason: cause, operation: '扩到 docs', requestedBy },
  })
  return dp
}

const base = (): Scope => Scope.initial('d1', [{ kind: '仓库', pattern: 'src/**' }])
const docs: ScopeEntry[] = [{ kind: '仓库', pattern: 'docs/**' }]
const TS = '2026-10-06T00:00:00Z'

describe('Scope.amend A4：无决议不产版本（I-17）', () => {
  it('1. 无决议（undefined）⇒ DomainError I-17，链长不变', () => {
    const scope = base()
    let err: unknown
    expect(() => {
      try {
        scope.amend(undefined as unknown as DecisionPoint, docs, TS)
      } catch (e) {
        err = e
        throw e
      }
    }).toThrow(DomainError)
    expect((err as DomainError).code).toBe('I-17')
    expect(scope.chain.length).toBe(1)
  })

  it('2. 决议未决（只 raise 不 resolve）⇒ DomainError I-17，链长仍 1', () => {
    const scope = base()
    const dp = raiseDp('dp1')
    let err: unknown
    try {
      scope.amend(dp, docs, TS)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('I-17')
    expect(scope.chain.length).toBe(1)
  })

  it('3. 决议值＝拒绝 ⇒ DomainError I-17，链长仍 1', () => {
    const scope = base()
    const dp = raiseDp('dp1')
    dp.resolve('拒绝')
    let err: unknown
    try {
      scope.amend(dp, docs, TS)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('I-17')
    expect(scope.chain.length).toBe(1)
  })

  it('4. 决议值＝批准 ⇒ 不抛，version === 2 且 draft.type === ScopeAmended', () => {
    const dp = raiseDp('dp1')
    dp.resolve('批准')
    const next = base().amend(dp, docs, TS)
    expect(next.scope.version).toBe(2)
    expect(next.draft.type).toBe('ScopeAmended')
  })

  // 主会话复核补：①缘由支的真实语义此前无正面用例——第 1 条虽能杀掉①支（`dp.resolution` 读 undefined 撞 TypeError），
  // 但「决议已批准 ∧ 缘由不符 ⇒ 拒」这条判据只有本条覆盖（变异实测：删①支则本条与第 1 条同时红）。
  it('4b. 已批准但缘由＝作用域外 ⇒ DomainError I-17（①支独立生效），链长仍 1', () => {
    const scope = base()
    const dp = raiseDp('dp1', '用户提请', '作用域外')
    dp.resolve('批准')
    let err: unknown
    try {
      scope.amend(dp, docs, TS)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('I-17')
    expect((err as DomainError).message).toContain('作用域修正')
    expect(scope.chain.length).toBe(1)
  })
})

describe('Scope.amend A5：批准权仅用户判的是决议值', () => {
  it('5. AI 提请 ∧ 已批准 ⇒ amend 仍然成功（提请者不影响）', () => {
    const dp = raiseDp('dp1', 'AI 提请')
    dp.resolve('批准')
    const next = base().amend(dp, docs, TS)
    expect(next.scope.version).toBe(2)
    expect(next.draft.type).toBe('ScopeAmended')
  })

  it('6. 决议值＝选项 ⇒ DomainError I-17，链长仍 1', () => {
    const scope = base()
    const dp = raiseDp('dp1')
    dp.resolve('选项', { option: 'A' })
    let err: unknown
    try {
      scope.amend(dp, docs, TS)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('I-17')
    expect(scope.chain.length).toBe(1)
  })
})

// S2b Task 1（案 A／ADR-030）：rt.amendScope 消费「已批准决议」这一事实，聚合写入与事件 append 同事务。
describe('rt.amendScope 编排口：批准决议的消纳面（S2b Task 1）', () => {
  beforeEach(() => {
    resetRuntime()
  })

  const seed = () => {
    const rt = getRuntime()
    rt.scopes.save(base())
    const dp = raiseDp('dp1')
    dp.resolve('批准')
    rt.decisionPoints.save(dp)
    return rt
  }

  it('7. 已批准决议在场 ⇒ 返 version 2，作用域链推进且 ScopeAmended 恰 1 条', () => {
    const rt = seed()
    expect(rt.amendScope({ delegationId: 'd1', decisionPointId: 'dp1', entries: docs })).toEqual({
      version: 2,
    })
    expect(rt.scopes.findByDelegation('d1')!.version).toBe(2)
    expect(rt.timeline.since(1).filter((e) => e.type === 'ScopeAmended')).toHaveLength(1)
  })

  it('8. 事务失败 ⇒ 抛错且链不长、事件不落（回滚路径不 publish）', () => {
    const rt = seed()
    vi.spyOn(rt.scopes, 'save').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() =>
      rt.amendScope({ delegationId: 'd1', decisionPointId: 'dp1', entries: docs }),
    ).toThrow('boom')
    expect(rt.scopes.findByDelegation('d1')!.version).toBe(1)
    expect(rt.timeline.since(1).filter((e) => e.type === 'ScopeAmended')).toHaveLength(0)
    vi.restoreAllMocks()
  })
})
