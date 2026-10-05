import { describe, it, expect } from 'vitest'
import { requiresApproval, type Operation } from '../../src/domain/spec/requiresApproval'
import { admissionCheck } from '../../src/domain/service/admissionCheck'
import { Scope } from '../../src/domain/authorization/Scope'
import { HIGH_IMPACT_LIST } from '../../src/domain/authorization/highImpactList'

// 作用域内＝目录 src/** 与命令 npm test；其余访问/执行皆作用域外。
const scope = Scope.initial('d1', [
  { kind: '目录', pattern: 'src/**' },
  { kind: '命令', pattern: 'npm test' },
])
const access = (over: Partial<Operation> = {}): Operation => ({
  category: '资源访问',
  entryKind: '目录',
  resource: 'src/a.ts',
  hits: null,
  ...over,
})
const run = (over: Partial<Operation> = {}): Operation => ({
  category: '命令执行',
  entryKind: '命令',
  resource: 'npm test',
  hits: null,
  ...over,
})

describe('RequiresApprovalSpec（C6／I-7：作用域外 ∪ 清单命中）', () => {
  it('作用域内 ∧ 未命中清单 ⇒ 不需拍板（S1 两类各一）', () => {
    expect(requiresApproval(access(), scope, HIGH_IMPACT_LIST)).toBe(false)
    expect(requiresApproval(run(), scope, HIGH_IMPACT_LIST)).toBe(false)
  })

  it('作用域外资源访问 ⇒ 需拍板（①类）', () => {
    expect(requiresApproval(access({ resource: 'etc/hosts' }), scope, HIGH_IMPACT_LIST)).toBe(true)
  })

  it('作用域内但命中高影响清单 ⇒ 需拍板（②类）', () => {
    expect(
      requiresApproval(
        run({ resource: 'npm test', hits: '安装/卸载依赖' }),
        scope,
        HIGH_IMPACT_LIST,
      ),
    ).toBe(true)
  })

  it('清单为权威：hits 不在传入清单内 ⇒ 不算命中（防字面漂移）', () => {
    expect(requiresApproval(run({ hits: '安装/卸载依赖' }), scope, [])).toBe(false)
  })

  it('作用域修正分支 ⇒ false（全外延→S2，不 throw）', () => {
    expect(
      requiresApproval(
        access({ category: '作用域修正', resource: 'any' }),
        scope,
        HIGH_IMPACT_LIST,
      ),
    ).toBe(false)
  })
})

describe('AdmissionCheck 前置闸（C6：校验先于产出）', () => {
  it('过闸＝不需拍板；未过闸＝需拍板', () => {
    expect(admissionCheck(access(), scope, HIGH_IMPACT_LIST)).toBe(true)
    expect(admissionCheck(access({ resource: 'etc/hosts' }), scope, HIGH_IMPACT_LIST)).toBe(false)
  })

  it('未过闸 ⇒ 操作副作用计数＝0（I-7）', () => {
    let sideEffects = 0
    const execute = (o: Operation): boolean => {
      if (!admissionCheck(o, scope, HIGH_IMPACT_LIST)) return false // 调用方转 RaiseDecision
      sideEffects += 1
      return true
    }
    expect(execute(access({ resource: 'etc/hosts' }))).toBe(false)
    expect(execute(run({ resource: 'rm -rf build', hits: '删除文件' }))).toBe(false)
    expect(sideEffects).toBe(0)
    expect(execute(access())).toBe(true)
    expect(sideEffects).toBe(1)
  })
})
