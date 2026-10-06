import { describe, it, expect } from 'vitest'
import {
  OPERATION_CATEGORIES,
  requiresApproval,
  type Operation,
} from '../../src/domain/spec/requiresApproval'
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

  it('③类翻转：作用域修正⇒恒真（修正必经拍板）', () => {
    expect(
      requiresApproval(
        access({ category: '作用域修正', resource: 'any' }),
        scope,
        HIGH_IMPACT_LIST,
      ),
    ).toBe(true)
  })

  it('类别闭集＝三支（不多不少）', () => {
    expect(OPERATION_CATEGORIES).toEqual(['资源访问', '命令执行', '作用域修正'])
  })

  // ③类不查决议：形参面里没有决议／DecisionPoint（三形参 op, scope, list）。
  // 判「拍板够不够」在 Scope.amend 前置，两处不同源＝防双源。
  it('③类不查决议：谓词三形参，决议不在其面', () => {
    expect(requiresApproval.length).toBe(3)
  })
})

describe('三类并集真值表（①作用域外 ∪ ②清单命中 ∪ ③作用域修正）', () => {
  it('1 作用域外 ∧ 未命中 ∧ 非修正 ⇒ true', () => {
    expect(requiresApproval(access({ resource: 'etc/hosts' }), scope, HIGH_IMPACT_LIST)).toBe(true)
  })

  it('2 作用域外 ∧ 命中清单 ∧ 非修正 ⇒ true', () => {
    expect(
      requiresApproval(
        access({ resource: 'etc/hosts', hits: '删除文件' }),
        scope,
        HIGH_IMPACT_LIST,
      ),
    ).toBe(true)
  })

  it('3 作用域内 ∧ 未命中 ∧ 非修正 ⇒ false', () => {
    expect(requiresApproval(access(), scope, HIGH_IMPACT_LIST)).toBe(false)
    expect(requiresApproval(run(), scope, HIGH_IMPACT_LIST)).toBe(false)
  })

  it('4 作用域内 ∧ 命中清单 ∧ 非修正 ⇒ true', () => {
    expect(requiresApproval(run({ hits: '安装/卸载依赖' }), scope, HIGH_IMPACT_LIST)).toBe(true)
  })

  it('5 作用域内 ∧ hits 非 null 但不在传入清单 ∧ 非修正 ⇒ false（清单是闭集）', () => {
    expect(requiresApproval(run({ hits: '随手编的一条' as never }), scope, HIGH_IMPACT_LIST)).toBe(
      false,
    )
  })

  it('6 作用域内 ∧ 未命中 ∧ 修正 ⇒ true', () => {
    expect(
      requiresApproval(
        access({ category: '作用域修正', resource: 'src/a.ts' }),
        scope,
        HIGH_IMPACT_LIST,
      ),
    ).toBe(true)
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
