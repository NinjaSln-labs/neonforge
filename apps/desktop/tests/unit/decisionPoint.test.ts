import { describe, it, expect } from 'vitest'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { Scope } from '../../src/domain/authorization/Scope'
import { HIGH_IMPACT_LIST } from '../../src/domain/authorization/highImpactList'
import { DomainError } from '../../src/domain/domainError'
import { InMemoryDecisionPointRepo } from '../../src/domain/repos/memory/decisionPointRepo'

const reason = { reason: '高影响清单命中', operation: '删除文件', requestedBy: 'AI 提请' } as const
const full = { decisionPointId: 'dp1', delegationId: 'd1', turnId: 't1', requestReason: reason }

describe('DecisionPoint（C2／I-3 归属唯一 + 决议幂等）', () => {
  it('raise 缺归属对 ⇒ 命令拒绝（I-3）', () => {
    expect(() => DecisionPoint.raise({ ...full, turnId: '' })).toThrow(DomainError)
    expect(() => DecisionPoint.raise({ ...full, delegationId: '' })).toThrow(DomainError)
  })

  it('raise 完整归属 ⇒ 未决 ∧ DecisionRaised 草稿', () => {
    const { decisionPoint, raised } = DecisionPoint.raise(full)
    expect(decisionPoint.open).toBe(true)
    expect(raised.type).toBe('DecisionRaised')
    expect(raised.detail).toEqual({
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '高影响清单命中', requestedBy: 'AI 提请' },
    })
  })

  it('同 decisionPointId 重复决议 ⇒ 首次生效（第二次拒绝）', () => {
    const { decisionPoint } = DecisionPoint.raise(full)
    decisionPoint.resolve('批准')
    expect(() => decisionPoint.resolve('拒绝')).toThrow(DomainError)
    expect(decisionPoint.resolution?.value).toBe('批准')
  })

  it('拒绝经 Resolution 三值（非独立 deny 命令）⇒ DecisionResolved + DecisionDenied 两草稿', () => {
    const { decisionPoint } = DecisionPoint.raise(full)
    const drafts = decisionPoint.resolve('拒绝', { reason: '不外发' })
    expect(drafts.map((d) => d.type)).toEqual(['DecisionResolved', 'DecisionDenied'])
    expect(drafts[1].detail).toEqual({
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      reason: '不外发',
    })
    expect(decisionPoint.open).toBe(false)
  })

  it('选项决议 ⇒ 决议值＝选项 ∧ 无 Denied（三值承段2 X1a）', () => {
    const { decisionPoint } = DecisionPoint.raise(full)
    const drafts = decisionPoint.resolve('选项', { option: '只删缓存' })
    expect(drafts).toHaveLength(1)
    expect(decisionPoint.resolution).toMatchObject({ value: '选项', option: '只删缓存' })
  })

  it('findOpenBy 只返该归属对的未决项（仓储面）', () => {
    const repo = new InMemoryDecisionPointRepo()
    const a = DecisionPoint.raise(full).decisionPoint
    const b = DecisionPoint.raise({ ...full, decisionPointId: 'dp2', turnId: 't2' }).decisionPoint
    const c = DecisionPoint.raise({ ...full, decisionPointId: 'dp3' }).decisionPoint
    repo.save(a)
    repo.save(b)
    repo.save(c)
    c.resolve('批准')
    expect(repo.findOpenBy('d1', 't1').map((d) => d.decisionPointId)).toEqual(['dp1'])
    expect(repo.findOpenBy('d1', 't2').map((d) => d.decisionPointId)).toEqual(['dp2'])
    expect(repo.findById('dp3')?.open).toBe(false)
  })
})

describe('Scope 与高影响清单（CC-05／段2 §4 唯一源）', () => {
  it('Scope.initial ⇒ 版本链首元素 seq=1，不发事件（ScopeAmended→S2）', () => {
    const scope = Scope.initial('d1', [{ kind: '目录', pattern: 'src/**' }])
    expect(scope.version).toBe(1)
    expect(scope.entries).toEqual([{ kind: '目录', pattern: 'src/**' }])
  })

  it('高影响清单＝段2 附录 A 初版五行（逐字）', () => {
    expect(HIGH_IMPACT_LIST).toEqual([
      '删除文件',
      '改写 git 历史（force push/reset --hard 类）',
      '安装/卸载依赖',
      '修改凭据配置',
      '外发仓库内容出本机',
    ])
  })
})
