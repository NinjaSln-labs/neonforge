import { WAITING_PRIORITY, type WaitingKind } from './waitingItems.js'

// deriveFocus（详设 §5／段3 §1 裁定3／stage-spec F3 领域面）：焦点＝前三类里最优先类的最早实例。
// 排队中不参选（等的是系统空槽非用户动作，只保可见位置）；三类皆空⇒焦点为空（null，不退化指排队）。
// 焦点只作呈现指向，不带动作类型（动作由呈现侧按 kind 决定，S6 扩面）。
// 入参取结构面（WaitingItem 天然满足），呈现侧可传任意带 kind/sourceId/slot 的读模型。
export interface FocusCandidate {
  readonly kind: WaitingKind
  readonly sourceId: string
  readonly slot: number
}

export function deriveFocus(items: readonly FocusCandidate[]): FocusCandidate | null {
  const candidates = items.filter((i) => i.kind !== '排队中')
  if (candidates.length === 0) return null
  return candidates.reduce((best: FocusCandidate, cur: FocusCandidate): FocusCandidate => {
    const rank = WAITING_PRIORITY[cur.kind] - WAITING_PRIORITY[best.kind]
    if (rank !== 0) return rank < 0 ? cur : best
    return cur.slot < best.slot ? cur : best
  })
}
