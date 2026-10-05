import type { DecisionPoint } from '../authorization/DecisionPoint.js'
import type { Delegation } from '../delegation/Delegation.js'
import type { InstructionQueue } from '../queue/InstructionQueue.js'

// deriveWaitingItems（详设 §5／段3 §1 裁定4／I-9／stage-spec C7）：等待项＝派生读模型，无独立聚合。
// 纯函数、无状态、不属任一子域（呈现投影与度量采点各自调用，两域互不依赖）。
// 四类闭集来源：待拍板←DecisionPoint 未决／待核验←Delegation 有效声称后待核验态／
// 待用户指令←拒绝待决标记（I-15 读侧落 Delegation，段3 §4）／排队中←InstructionQueue 未准入项。
// 偏离登记：详设 §5 四入参里的 turns 分量在 S1 无来源——中断态→S3、卡滞待指令态→S5，
// 届时补该入参；S1 拒绝待决以 Delegation 标记为准，故本面不收 turns（不留空转参数）。
// 收束态过滤谓词→S5（M-10：不实现、不预绿，见 waitingItems.test.ts 的跳过用例）。

export type WaitingKind = '待拍板' | '待核验' | '待用户指令' | '排队中'

export interface WaitingItem {
  readonly kind: WaitingKind
  readonly sourceId: string // 归属实例 id（decisionPointId / delegationId / itemId）
  readonly delegationId: string
  readonly slot: number // 同类内创建序（0 起）＝呈现可见位置＋deriveFocus 排序键
}

// 类优先级（焦点与呈现共用，单源）。
export const WAITING_PRIORITY: Record<WaitingKind, number> = {
  待拍板: 0,
  待核验: 1,
  待用户指令: 2,
  排队中: 3,
}

type Raw = Omit<WaitingItem, 'slot'>

const row = (kind: WaitingKind, sourceId: string, delegationId: string): Raw => ({
  kind,
  sourceId,
  delegationId,
})

export function deriveWaitingItems(
  delegations: readonly Delegation[],
  decisionPoints: readonly DecisionPoint[],
  queue: InstructionQueue,
): WaitingItem[] {
  const raw: Raw[] = [
    ...decisionPoints
      .filter((p) => p.open)
      .map((p) => row('待拍板', p.decisionPointId, p.delegationId)),
    ...delegations
      .filter((d) => d.state === 'pendingVerify')
      .map((d) => row('待核验', d.delegationId, d.delegationId)),
    ...delegations
      .filter((d) => d.awaitingUser)
      .map((d) => row('待用户指令', d.delegationId, d.delegationId)),
    ...queue.pending().map((i) => row('排队中', i.itemId, i.delegationId)),
  ]

  // 每实例属且仅属一类（I-9）：按 (类,实例) 去重，再按类优先级定序并回填同类创建序 slot。
  const seen = new Set<string>()
  const unique: Raw[] = []
  for (const i of raw) {
    const key = `${i.kind}:${i.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(i)
  }
  const sorted = [...unique].sort((a, b) => WAITING_PRIORITY[a.kind] - WAITING_PRIORITY[b.kind])
  const next = new Map<WaitingKind, number>()
  return sorted.map((i) => {
    const slot = next.get(i.kind) ?? 0
    next.set(i.kind, slot + 1)
    return { ...i, slot }
  })
}
