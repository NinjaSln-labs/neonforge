import type { ResourceKind, Scope } from '../authorization/Scope.js'
import type { HighImpactOperation } from '../authorization/highImpactList.js'

// RequiresApprovalSpec（详设 §4／段3 I-7/I-17 执行点／stage-spec C6）：
//   须拍板操作＝①作用域外任何资源访问 ∪ ②作用域内命中高影响操作清单的操作 ∪ ③作用域修正 ⇒ true。
// 三支全外延已落地（S2a）：类别闭集＝OPERATION_CATEGORIES；③类恒真，谓词面不查决议。

export type OperationCategory = '资源访问' | '命令执行' | '作用域修正'
export const OPERATION_CATEGORIES: readonly OperationCategory[] = [
  '资源访问',
  '命令执行',
  '作用域修正',
]

export interface Operation {
  category: OperationCategory
  entryKind: ResourceKind
  resource: string
  hits: HighImpactOperation | null
}

export function requiresApproval(
  op: Operation,
  scope: Scope,
  list: readonly HighImpactOperation[],
): boolean {
  if (op.category === '作用域修正') return true // ③类恒真：修正必经拍板（I-17 的「拍板够不够」由 Scope.amend 前置复核，两处不同源＝防双源）
  if (!scope.covers(op.entryKind, op.resource)) return true
  return op.hits !== null && list.includes(op.hits)
}
