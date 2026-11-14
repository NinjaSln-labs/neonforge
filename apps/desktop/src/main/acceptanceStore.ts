// BC-14 验收记录持久化（main）：按 session 保存验收记录；原子写（临时文件 + rename）。
// 领域规则在 domain/acceptance.ts；本模块只负责加载/保存/调用。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
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

export type AcceptanceEventSink = (event: {
  session: string
  type: string
  detail: Record<string, unknown>
}) => void

export class AcceptanceStore {
  constructor(
    private readonly filePath: string,
    private readonly emit: AcceptanceEventSink = () => {},
  ) {}

  private loadAll(): AcceptanceFile {
    try {
      if (!existsSync(this.filePath)) return { records: {} }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<AcceptanceFile>
      if (parsed && typeof parsed.records === 'object' && parsed.records) {
        return { records: parsed.records }
      }
    } catch {
      /* 损坏 → 空记录（不阻断） */
    }
    return { records: {} }
  }

  private saveAll(data: AcceptanceFile): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
      renameSync(tmp, this.filePath)
    } catch {
      /* 落盘失败不阻断业务 */
    }
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
    this.saveAll(data)
    this.emit({
      session: sessionId,
      type: 'acceptance.criteria_derived',
      detail: { recordId: record.id, source, items: record.items.map((i) => i.label) },
    })
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
    this.saveAll(data)
    const item = next.items.find((i) => i.id === itemId)
    this.emit({
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
    })
    return next
  }

  /** 完成核验通过后，把命令证据按顺序绑定到 pending 验收项（不足则保留 pending）。 */
  applyEvidence(sessionId: string, evidenceRefs: readonly string[]): AcceptanceRecord | null {
    const record = this.get(sessionId)
    if (!record) return null
    let next = record
    const pending = record.items.filter((i) => i.status === 'pending')
    pending.forEach((item, i) => {
      const ref = evidenceRefs[i]
      if (!ref) return
      next = markPassed(next, item.id, { evidenceRef: `verification:${ref}` })
      this.emit({
        session: sessionId,
        type: 'acceptance.item_passed',
        detail: { recordId: next.id, itemId: item.id, evidenceRef: `verification:${ref}` },
      })
    })
    const data = this.loadAll()
    data.records[sessionId] = next
    this.saveAll(data)
    return next
  }

  /** 用户显式接受“无验收来源”：生成一条带理由的豁免项（门禁 passed-with-waivers）。 */
  acceptEmpty(sessionId: string): AcceptanceRecord {
    const at = new Date().toISOString()
    const record = deriveAcceptance(
      sessionId,
      ['无验收来源（用户确认按交付关闭）'],
      'manual',
      at,
    )
    const waived = waiveItem(record, record.items[0].id, '用户显式确认接受空验收', at)
    const data = this.loadAll()
    data.records[sessionId] = waived
    this.saveAll(data)
    this.emit({
      session: sessionId,
      type: 'acceptance.criteria_derived',
      detail: { recordId: waived.id, source: 'manual', items: waived.items.map((i) => i.label) },
    })
    this.emit({
      session: sessionId,
      type: 'acceptance.item_waived',
      detail: {
        recordId: waived.id,
        itemId: waived.items[0].id,
        reason: '用户显式确认接受空验收',
      },
    })
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
    this.saveAll(data)
  }
}
