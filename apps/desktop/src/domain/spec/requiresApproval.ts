import type { ResourceKind, Scope } from '../authorization/Scope.js'
import type { HighImpactOperation } from '../authorization/highImpactList.js'

// RequiresApprovalSpec（详设 §4／段3 I-7/I-17 执行点／stage-spec C6）：
//   须拍板操作＝①作用域外任何资源访问 ∪ ②作用域内命中高影响操作清单的操作 ⇒ true。
// S1 只判两类＝资源访问／命令执行；作用域修正分支的全外延（I-8/I-17 绑定决议）→ S2。

export type OperationCategory = '资源访问' | '命令执行' | '作用域修正'

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
  // 作用域修正：本谓词 S1 面不判（修正必经拍板由 AmendScope/I-17 命令前置承载，全外延→S2）。
  if (op.category === '作用域修正') return false
  if (!scope.covers(op.entryKind, op.resource)) return true
  return op.hits !== null && list.includes(op.hits)
}
