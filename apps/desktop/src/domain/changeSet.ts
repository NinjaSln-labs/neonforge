// BC-10 变更与版本（目标态实现）：纯领域状态机。
// 不变量（I17）：
// - 变更项必须有基线信息（可为 null=新建文件；但字段存在，语义明确）。
// - 未审核项不得应用；应用结果必须显式记录（成功 → applied，失败/冲突 → conflicted）。
// - 回滚只处理已应用项；基线冲突不得静默覆盖；失败项显式保留。
// 文件 IO 与哈希在 main/changeSetService.ts；本模块只做状态转换。

export type ChangeItemStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'reverted'
  | 'conflicted'

export type ChangeSetStatus =
  | 'proposed'
  | 'reviewed'
  | 'applied'
  | 'reverted'
  | 'conflicted'
  | 'superseded'

export interface ChangeItemInput {
  id: string
  path: string
  /** null = 新建文件（无应用前内容） */
  baseHash: string | null
  afterHash: string | null
  snapshotRef: string | null
}

export interface ChangeItem extends ChangeItemInput {
  status: ChangeItemStatus
  reviewReason?: string
}

export interface ChangeSet {
  id: string
  items: ChangeItem[]
  status: ChangeSetStatus
  createdAt: string
  updatedAt: string
}

function touch(set: ChangeSet, at?: string): ChangeSet {
  return { ...set, updatedAt: at ?? new Date().toISOString() }
}

function replaceItem(
  set: ChangeSet,
  itemId: string,
  fn: (item: ChangeItem) => ChangeItem,
  at?: string,
): ChangeSet {
  let found = false
  const items = set.items.map((item) => {
    if (item.id !== itemId) return item
    found = true
    return fn(item)
  })
  if (!found) throw new TypeError(`变更项不存在：${itemId}`)
  return touch({ ...set, items }, at)
}

function deriveStatus(items: ChangeItem[], previous: ChangeSetStatus): ChangeSetStatus {
  if (items.some((i) => i.status === 'conflicted')) return 'conflicted'
  const appliedLike = items.filter((i) => i.status === 'applied' || i.status === 'reverted')
  if (appliedLike.length > 0) {
    const allReverted = appliedLike.every((i) => i.status === 'reverted')
    const allDone = items.every((i) => i.status === 'applied' || i.status === 'reverted' || i.status === 'rejected')
    if (allReverted && allDone) return 'reverted'
    return 'applied'
  }
  if (items.some((i) => i.status === 'approved' || i.status === 'rejected')) return 'reviewed'
  return previous === 'superseded' ? 'superseded' : 'proposed'
}

export function createChangeSet(
  id: string,
  inputs: readonly ChangeItemInput[],
  at: string,
): ChangeSet {
  return {
    id,
    items: inputs.map((input) => ({ ...input, status: 'pending' })),
    status: 'proposed',
    createdAt: at,
    updatedAt: at,
  }
}

export function reviewItem(
  set: ChangeSet,
  itemId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
  at?: string,
): ChangeSet {
  const next = replaceItem(
    set,
    itemId,
    (item) => ({
      ...item,
      status: decision,
      ...(reason ? { reviewReason: reason } : {}),
    }),
    at,
  )
  return { ...next, status: deriveStatus(next.items, next.status) }
}

export function applyChangeSet(
  set: ChangeSet,
  outcomes: Record<string, boolean>,
  at?: string,
): ChangeSet {
  let items = set.items
  for (const [itemId, ok] of Object.entries(outcomes)) {
    const item = items.find((i) => i.id === itemId)
    if (!item) throw new TypeError(`变更项不存在：${itemId}`)
    if (item.status !== 'approved') {
      throw new TypeError(`变更项未审核，不得应用：${itemId}（不变量 I17）`)
    }
    items = items.map((i) =>
      i.id === itemId ? { ...i, status: ok ? ('applied' as const) : ('conflicted' as const) } : i,
    )
  }
  const next: ChangeSet = { ...set, items, updatedAt: at ?? new Date().toISOString() }
  return { ...next, status: deriveStatus(items, set.status) }
}

export function revertChangeSet(
  set: ChangeSet,
  outcomes: Record<string, boolean>,
  at?: string,
): ChangeSet {
  let items = set.items
  for (const [itemId, ok] of Object.entries(outcomes)) {
    const item = items.find((i) => i.id === itemId)
    if (!item) throw new TypeError(`变更项不存在：${itemId}`)
    if (item.status !== 'applied') continue // 未应用项无需回滚
    items = items.map((i) =>
      i.id === itemId ? { ...i, status: ok ? ('reverted' as const) : ('conflicted' as const) } : i,
    )
  }
  const next: ChangeSet = { ...set, items, updatedAt: at ?? new Date().toISOString() }
  return { ...next, status: deriveStatus(items, set.status) }
}

export function markConflict(
  set: ChangeSet,
  itemId: string,
  expected: string | null,
  actual: string | null,
  at?: string,
): ChangeSet {
  const next = replaceItem(
    set,
    itemId,
    (item) => ({ ...item, status: 'conflicted', baseHash: expected, afterHash: actual }),
    at,
  )
  return { ...next, status: 'conflicted' }
}

export function supersedeChangeSet(set: ChangeSet, at?: string): ChangeSet {
  return { ...set, status: 'superseded', updatedAt: at ?? new Date().toISOString() }
}
