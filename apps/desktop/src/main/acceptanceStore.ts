// BC-14 验收记录持久化（main）：按 session 保存验收记录；原子写（临时文件 + rename）。
// 领域规则在 domain/acceptance.ts；本模块只负责加载/保存/调用。
import { existsSync, readFileSync } from 'node:fs'
import {
  applyStateWrites,
  type StateCommitSink,
  type StateWrite,
  type StoreEvent,
} from './stateTransaction.js'
import {
  deriveAcceptance,
  evaluateGate,
  markFailed,
  markPassed,
  waiveItem,
  type AcceptanceRecord,
  type AcceptanceSource,
  type GateResult,
} from '../domain/acceptance.js'

interface AcceptanceFile {
  records: Record<string, AcceptanceRecord>
}

export type AcceptanceEventSink = (event: StoreEvent) => void

export class AcceptanceStore {
  constructor(
    private readonly filePath: string,
    private readonly emit: AcceptanceEventSink = () => {},
    private readonly commit?: StateCommitSink,
    private readonly pendingRead?: (filePath: string) => string | null,
  ) {}

  private loadAll(): AcceptanceFile {
    try {
      const pending = this.pendingRead?.(this.filePath)
      const raw =
        pending ?? (existsSync(this.filePath) ? readFileSync(this.filePath, 'utf-8') : null)
      if (raw === null) return { records: {} }
      const parsed = JSON.parse(raw) as Partial<AcceptanceFile>
      if (parsed && typeof parsed.records === 'object' && parsed.records) {
        return { records: parsed.records }
      }
    } catch {
      /* 损坏 → 空记录（不阻断） */
    }
    return { records: {} }
  }

  /** 状态 + 事件同一事务（有 commit 回调时走 WAL；单测/无事务环境降级为原子写 + emit）。 */
  private write(data: AcceptanceFile, events: StoreEvent[], extraWrites: StateWrite[] = []): void {
    const writes: StateWrite[] = [
      { filePath: this.filePath, content: JSON.stringify(data, null, 2) },
      ...extraWrites,
    ]
    if (this.commit) {
      this.commit(writes, events)
      return
    }
    try {
      applyStateWrites(writes)
    } catch {
      /* 落盘失败不阻断业务（与既有内存态策略一致） */
    }
    for (const event of events) this.emit(event)
  }

  get(sessionId: string): AcceptanceRecord | null {
    return this.loadAll().records[sessionId] ?? null
  }

  derive(
    sessionId: string,
    labels: readonly string[],
    source: AcceptanceSource = 'plan-verification',
  ): AcceptanceRecord {
    const at = new Date().toISOString()
    const record = deriveAcceptance(sessionId, labels, source, at)
    const data = this.loadAll()
    data.records[sessionId] = record
    this.write(data, [
      {
        session: sessionId,
        type: 'acceptance.criteria_derived',
        detail: { recordId: record.id, source, items: record.items.map((i) => i.label) },
      },
    ])
    return record
  }

  mark(
    sessionId: string,
    itemId: string,
    status: 'passed' | 'failed' | 'waived',
    opts: { evidenceRef?: string; manualReason?: string; reason?: string } = {},
  ): AcceptanceRecord | null {
    const record = this.get(sessionId)
    if (!record) return null
    let next: AcceptanceRecord
    if (status === 'passed') {
      next = markPassed(record, itemId, {
        evidenceRef: opts.evidenceRef,
        manualReason: opts.manualReason,
      })
    } else if (status === 'failed') {
      next = markFailed(record, itemId, opts.reason ?? '未提供原因')
    } else {
      next = waiveItem(record, itemId, opts.reason ?? '')
    }
    const data = this.loadAll()
    data.records[sessionId] = next
    const item = next.items.find((i) => i.id === itemId)
    this.write(data, [
      {
        session: sessionId,
        type:
          status === 'passed'
            ? 'acceptance.item_passed'
            : status === 'failed'
              ? 'acceptance.item_failed'
              : 'acceptance.item_waived',
        detail: {
          recordId: next.id,
          itemId,
          ...(status === 'passed' ? { evidenceRef: item?.evidenceRef } : { reason: opts.reason }),
        },
      },
    ])
    return next
  }

  /** 完成核验通过后，把命令证据按顺序绑定到 pending 验收项（不足则保留 pending）。 */
  applyEvidence(sessionId: string, evidenceRefs: readonly string[]): AcceptanceRecord | null {
    const record = this.get(sessionId)
    if (!record) return null
    let next = record
    const events: StoreEvent[] = []
    const pending = record.items.filter((i) => i.status === 'pending')
    pending.forEach((item, i) => {
      const ref = evidenceRefs[i]
      if (!ref) return
      next = markPassed(next, item.id, { evidenceRef: `verification:${ref}` })
      events.push({
        session: sessionId,
        type: 'acceptance.item_passed',
        detail: { recordId: next.id, itemId: item.id, evidenceRef: `verification:${ref}` },
      })
    })
    const data = this.loadAll()
    data.records[sessionId] = next
    this.write(data, events)
    return next
  }

  /** 用户显式接受“无验收来源”：生成一条带理由的豁免项（门禁 passed-with-waivers）。 */
  acceptEmpty(sessionId: string): AcceptanceRecord {
    const at = new Date().toISOString()
    const record = deriveAcceptance(sessionId, ['无验收来源（用户确认按交付关闭）'], 'manual', at)
    const waived = waiveItem(record, record.items[0].id, '用户显式确认接受空验收', at)
    const data = this.loadAll()
    data.records[sessionId] = waived
    this.write(data, [
      {
        session: sessionId,
        type: 'acceptance.criteria_derived',
        detail: { recordId: waived.id, source: 'manual', items: waived.items.map((i) => i.label) },
      },
      {
        session: sessionId,
        type: 'acceptance.item_waived',
        detail: {
          recordId: waived.id,
          itemId: waived.items[0].id,
          reason: '用户显式确认接受空验收',
        },
      },
    ])
    return waived
  }

  evaluate(sessionId: string): GateResult | null {
    const record = this.get(sessionId)
    if (!record) return null
    const gate = evaluateGate(record)
    this.emit({
      session: sessionId,
      type: 'quality_gate.evaluated',
      detail: { verdict: gate.verdict, blocking: gate.blocking, waived: gate.waived },
    })
    return gate
  }

  clear(sessionId: string): void {
    const data = this.loadAll()
    delete data.records[sessionId]
    this.write(data, [])
  }
}
