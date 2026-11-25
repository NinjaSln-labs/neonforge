import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AcceptanceStore } from '../../src/main/acceptanceStore'
import { StateTransactionLog } from '../../src/main/stateTransaction'

const TMP = '/tmp/nf-unit-acceptance'

describe('AcceptanceStore（BC-14 持久化）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('derive/list/mark/evaluate：跨调用保持记录', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    const r = store.derive('s1', ['npm test 通过', '页面可打开'], 'plan-verification')
    expect(store.get('s1')?.items).toHaveLength(2)
    store.mark('s1', 'item-1', 'passed', { evidenceRef: 'verification:npm test' })
    store.mark('s1', 'item-2', 'passed', { manualReason: '用户目视确认' })
    expect(store.evaluate('s1')?.verdict).toBe('passed')
    expect(r.id).toBe('s1')
  })

  it('无来源 → incomplete；acceptEmpty 生成带理由的豁免 → passed-with-waivers', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    store.derive('s2', [], 'plan-verification')
    expect(store.evaluate('s2')?.verdict).toBe('incomplete')
    store.acceptEmpty('s2')
    const gate = store.evaluate('s2')
    expect(gate?.verdict).toBe('passed-with-waivers')
    expect(gate?.waived).toContain('item-1')
  })

  it('已有验收项 → acceptEmpty 不得覆盖原记录（防竞态把真实验收洗成豁免）', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    const original = store.derive('s3', ['npm test 通过', '页面可打开'], 'plan-verification')
    const after = store.acceptEmpty('s3')
    expect(after.id).toBe(original.id)
    expect(after.items.map((i) => i.label)).toEqual(['npm test 通过', '页面可打开'])
    expect(store.evaluate('s3')?.verdict).not.toBe('passed-with-waivers')
  })

  it('损坏文件 → 空记录，不阻断', () => {
    const file = path.join(TMP, 'acceptance.json')
    writeFileSync(file, 'not-json')
    const store = new AcceptanceStore(file)
    expect(store.get('s1')).toBeNull()
    expect(() => store.derive('s1', ['a'], 'manual')).not.toThrow()
  })

  it('clear：任务边界清理记录', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    store.derive('s1', ['a'], 'manual')
    store.clear('s1')
    expect(store.get('s1')).toBeNull()
  })

  it('commit 回调：状态写入与事件同一事务（不再单独 emit）', () => {
    const file = path.join(TMP, 'acceptance.json')
    const commits: Array<{
      writes: Array<{ filePath: string; content: string }>
      events: Array<{ type: string }>
    }> = []
    let emitted = 0
    const store = new AcceptanceStore(
      file,
      () => {
        emitted += 1
      },
      (writes, events) => {
        commits.push({ writes, events })
      },
    )
    store.derive('s1', ['a'], 'manual')
    expect(emitted).toBe(0)
    expect(commits).toHaveLength(1)
    expect(commits[0].writes[0].filePath).toBe(file)
    expect(commits[0].writes[0].content).toContain('"s1"')
    expect(commits[0].events.map((e) => e.type)).toEqual(['acceptance.criteria_derived'])
    const derived = (commits[0].events as Array<{ detail?: Record<string, unknown> }>)[0]
    expect(derived.detail).toEqual({ recordId: 's1', source: 'manual', items: ['a'] })
  })

  // 2026-11-25 事件语义补课：验收事件载荷与真实判定一致——通过项带证据引用、失败带原因、
  // 豁免带理由、门禁评估带 verdict/blocking/waived（时间线消费方无需重建记录）。
  it('事件载荷语义：通过（证据引用）/失败（原因）/豁免（理由）/门禁评估', () => {
    const emitted: Array<{ type: string; detail?: Record<string, unknown> }> = []
    const store = new AcceptanceStore(path.join(TMP, 'acceptance-events.json'), (e) =>
      emitted.push(e as never),
    )
    store.derive('s1', ['项一', '项二', '项三'], 'plan-verification')
    store.applyEvidence('s1', ['ls 通过', 'npm test 通过'])
    store.mark('s1', 'item-3', 'failed', { reason: '页面 500' })
    const gate = store.evaluate('s1')
    expect(gate).toEqual({ verdict: 'failed', blocking: ['item-3'], waived: [] })
    store.acceptEmpty('s2')

    const evt = (type: string, nth = 0): Record<string, unknown> | undefined =>
      emitted.filter((e) => e.type === type)[nth]?.detail
    expect(evt('acceptance.criteria_derived', 0)).toEqual({
      recordId: 's1',
      source: 'plan-verification',
      items: ['项一', '项二', '项三'],
    })
    expect(evt('acceptance.item_passed', 0)).toEqual({
      recordId: 's1',
      itemId: 'item-1',
      evidenceRef: 'verification:ls 通过',
    })
    expect(evt('acceptance.item_passed', 1)).toEqual({
      recordId: 's1',
      itemId: 'item-2',
      evidenceRef: 'verification:npm test 通过',
    })
    expect(evt('acceptance.item_failed')).toEqual({
      recordId: 's1',
      itemId: 'item-3',
      reason: '页面 500',
    })
    expect(evt('quality_gate.evaluated')).toEqual({
      verdict: 'failed',
      blocking: ['item-3'],
      waived: [],
    })
    expect(evt('acceptance.criteria_derived', 1)).toEqual({
      recordId: 's2',
      source: 'manual',
      items: ['无验收来源（用户确认按交付关闭）'],
    })
    expect(evt('acceptance.item_waived')).toEqual({
      recordId: 's2',
      itemId: 'item-1',
      reason: '用户显式确认接受空验收',
    })
  })

  it('状态落盘失败时下一次变更基于 WAL 已提交意图（重放不丢更新）', () => {
    const file = path.join(TMP, 'acceptance.json')
    mkdirSync(file) // 同名目录 → 状态 rename 失败，提交保留在 WAL
    const journal = path.join(TMP, 'transactions.jsonl')
    const log = new StateTransactionLog(journal, () => true)
    const store = new AcceptanceStore(
      file,
      () => {},
      (writes, events) => log.commit(writes, events),
      (target) => log.latestWriteContent(target),
    )
    store.derive('s1', ['a', 'b'], 'manual')
    expect(log.pendingCount()).toBe(1)
    store.mark('s1', 'item-1', 'passed', { manualReason: '用户确认' })
    expect(log.pendingCount()).toBe(2)
    rmSync(file, { recursive: true, force: true })
    expect(log.drain().remaining).toBe(0)
    expect(store.get('s1')?.items.find((i) => i.id === 'item-1')?.status).toBe('passed')
  })
})
