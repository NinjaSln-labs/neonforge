// BC-14 验收与质量门禁（目标态实现）：纯领域状态机。
// 不变量（I21）：
// - 验收项必须有来源；无来源时记录为空（不得伪造“全部通过”）。
// - passed 必须绑定证据或带理由的手工确认。
// - waived 必须带理由，且不参与门禁通过计算。
// - 门禁 = 所有非豁免项 passed；failed/pending 阻塞；全豁免 → passed-with-waivers。

export type AcceptanceSource = 'plan-verification' | 'user-dod' | 'manual'
export type AcceptanceStatus = 'pending' | 'passed' | 'failed' | 'waived'
export type GateVerdict = 'passed' | 'failed' | 'incomplete' | 'passed-with-waivers'

export interface AcceptanceItem {
  id: string
  label: string
  source: AcceptanceSource
  status: AcceptanceStatus
  evidenceRef?: string
  manualReason?: string
  waivedReason?: string
}

export interface AcceptanceRecord {
  id: string
  items: AcceptanceItem[]
  createdAt: string
  updatedAt: string
}

export interface GateResult {
  verdict: GateVerdict
  /** 阻塞项 id（含 `no-acceptance-source` 元项） */
  blocking: string[]
  waived: string[]
}

function touch(record: AcceptanceRecord, at: string | undefined): AcceptanceRecord {
  return { ...record, updatedAt: at ?? new Date().toISOString() }
}

function replaceItem(
  record: AcceptanceRecord,
  itemId: string,
  fn: (item: AcceptanceItem) => AcceptanceItem,
  at?: string,
): AcceptanceRecord {
  let found = false
  const items = record.items.map((item) => {
    if (item.id !== itemId) return item
    found = true
    return fn(item)
  })
  if (!found) throw new TypeError(`验收项不存在：${itemId}`)
  return touch({ ...record, items }, at)
}

export function deriveAcceptance(
  recordId: string,
  labels: readonly string[],
  source: AcceptanceSource,
  at: string,
): AcceptanceRecord {
  const items = labels
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label, i) => ({
      id: `item-${i + 1}`,
      label,
      source,
      status: 'pending' as const,
    }))
  return { id: recordId, items, createdAt: at, updatedAt: at }
}

export function markPassed(
  record: AcceptanceRecord,
  itemId: string,
  evidence: { evidenceRef?: string; manualReason?: string } = {},
  at?: string,
): AcceptanceRecord {
  if (!evidence.evidenceRef && !evidence.manualReason) {
    throw new TypeError('验收通过必须有证据引用或手工确认理由（不变量 I21）')
  }
  return replaceItem(
    record,
    itemId,
    (item) => ({
      ...item,
      status: 'passed',
      evidenceRef: evidence.evidenceRef ?? item.evidenceRef,
      manualReason: evidence.manualReason ?? item.manualReason,
    }),
    at,
  )
}

export function markFailed(
  record: AcceptanceRecord,
  itemId: string,
  reason: string,
  at?: string,
): AcceptanceRecord {
  return replaceItem(
    record,
    itemId,
    (item) => ({
      ...item,
      status: 'failed',
      evidenceRef: reason || item.evidenceRef,
    }),
    at,
  )
}

export function waiveItem(
  record: AcceptanceRecord,
  itemId: string,
  reason: string,
  at?: string,
): AcceptanceRecord {
  if (!String(reason ?? '').trim()) {
    throw new TypeError('豁免验收项必须填写理由（不变量 I21）')
  }
  return replaceItem(record, itemId, (item) => ({ ...item, status: 'waived', waivedReason: reason }), at)
}

export function evaluateGate(record: AcceptanceRecord): GateResult {
  if (record.items.length === 0) {
    return { verdict: 'incomplete', blocking: ['no-acceptance-source'], waived: [] }
  }
  const waived = record.items.filter((i) => i.status === 'waived').map((i) => i.id)
  const blocking = record.items.filter((i) => i.status === 'pending' || i.status === 'failed').map((i) => i.id)
  if (blocking.length > 0) {
    const verdict: GateVerdict = record.items.some((i) => i.status === 'failed') ? 'failed' : 'incomplete'
    return { verdict, blocking, waived }
  }
  if (record.items.every((i) => i.status === 'waived')) {
    return { verdict: 'passed-with-waivers', blocking: [], waived }
  }
  return { verdict: 'passed', blocking: [], waived }
}
