import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { StateTransactionLog } from '../../src/main/stateTransaction'

const TMP = '/tmp/nf-state-tx-test'
const JOURNAL = path.join(TMP, 'transactions.jsonl')
const STATE = path.join(TMP, 'state.json')

const event = (type: string) => ({ session: 's1', type, detail: { n: 1 } })

describe('StateTransactionLog（跨存储事务性 Outbox）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('状态写入 + 事件一次提交；事件使用确定性 outboxId；成功后 WAL 清空', () => {
    const sink = vi.fn((_evt: unknown, _outboxId: string) => true)
    const log = new StateTransactionLog(JOURNAL, sink)
    const result = log.commit(
      [{ filePath: STATE, content: '{"v":1}' }],
      [event('acceptance.criteria_derived'), event('acceptance.item_passed')],
    )
    expect(result).toMatchObject({ pending: false, eventsDelivered: true })
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":1}')
    expect(sink.mock.calls.map((call) => call[1])).toEqual([`${result.id}:0`, `${result.id}:1`])
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('事件投递失败保留 WAL；重试按同一 outboxId 幂等', () => {
    let ok = false
    const sink = vi.fn((_evt: unknown, _outboxId: string) => ok)
    const log = new StateTransactionLog(JOURNAL, sink)
    const result = log.commit([{ filePath: STATE, content: '{"v":1}' }], [event('q')])
    expect(result.pending).toBe(true)
    expect(existsSync(JOURNAL)).toBe(true)
    expect(log.pendingCount()).toBe(1)
    ok = true
    const drained = log.drain()
    expect(drained).toMatchObject({ remaining: 0, events: 1 })
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":1}')
    const ids = sink.mock.calls.map((call) => call[1])
    expect(ids).toEqual([`${result.id}:0`, `${result.id}:0`])
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('状态写入失败保留 WAL；恢复后重放写入与事件', () => {
    const sink = vi.fn(() => true)
    const log = new StateTransactionLog(JOURNAL, sink)
    mkdirSync(STATE) // 同名目录 → rename 失败
    const result = log.commit([{ filePath: STATE, content: '{"v":2}' }], [event('a')])
    expect(result.pending).toBe(true)
    expect(sink).not.toHaveBeenCalled()
    rmSync(STATE, { recursive: true, force: true })
    const drained = log.drain()
    expect(drained).toMatchObject({ remaining: 0, applied: 1, events: 1 })
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":2}')
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('多条事务按 FIFO 重放，最终状态为最后一条', () => {
    let fail = true
    const sink = vi.fn((evt: { type: string }) => !(fail && evt.type === 'a'))
    const log = new StateTransactionLog(JOURNAL, sink)
    log.commit([{ filePath: STATE, content: '{"v":1}' }], [event('a')])
    log.commit([{ filePath: STATE, content: '{"v":2}' }], [event('b')])
    // A 事件仍待重放；B 已应用（状态文件最终 v2）
    expect(existsSync(JOURNAL)).toBe(true)
    expect(log.pendingCount()).toBe(2)
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":2}')
    fail = false
    const drained = log.drain()
    expect(drained.remaining).toBe(0)
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":2}')
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('损坏 WAL 返回 error 且保留文件', () => {
    writeFileSync(JOURNAL, '{broken\n')
    const log = new StateTransactionLog(JOURNAL, () => true)
    const result = log.drain()
    expect(result.error).toBeTruthy()
    expect(existsSync(JOURNAL)).toBe(true)
  })

  // 2026-11-17 审查修复：WAL 不可读时 commit 不得谎报成功（原 remaining=0 → applied:true）
  it('损坏 WAL：commit 返回 applied=false/pending=true，不静默丢事务', () => {
    writeFileSync(JOURNAL, '{broken\n')
    const log = new StateTransactionLog(JOURNAL, () => true)
    const result = log.commit([{ filePath: STATE, content: '{"v":3}' }], [event('x')])
    expect(result.applied).toBe(false)
    expect(result.pending).toBe(true)
    expect(result.eventsDelivered).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('保留 WAL 重放不覆盖比记录更新的磁盘状态（mtime 守卫）', () => {
    writeFileSync(
      JOURNAL,
      JSON.stringify({
        id: 'tx-old',
        at: '2020-01-01T00:00:00.000Z',
        writes: [{ filePath: STATE, content: '{"v":"old"}' }],
        events: [event('a')],
      }) + '\n',
    )
    writeFileSync(STATE, '{"v":"new"}')
    const sink = vi.fn(() => true)
    const log = new StateTransactionLog(JOURNAL, sink)
    const drained = log.drain()
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":"new"}')
    expect(drained.remaining).toBe(0)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('latestWriteContent 在状态落盘失败时返回 WAL 意图；清空后 null', () => {
    mkdirSync(STATE) // 同名目录 → 状态写入失败，记录保留
    const log = new StateTransactionLog(JOURNAL, () => true)
    log.commit([{ filePath: STATE, content: '{"v":1}' }], [event('a')])
    expect(log.latestWriteContent(STATE)).toBe('{"v":1}')
    rmSync(STATE, { recursive: true, force: true })
    log.drain()
    expect(log.latestWriteContent(STATE)).toBeNull()
  })

  it('磁盘比 WAL 记录新（WAL 降级直写）→ 不回放旧 WAL 内容', () => {
    writeFileSync(
      JOURNAL,
      JSON.stringify({
        id: 'tx-old',
        at: '2020-01-01T00:00:00.000Z',
        writes: [{ filePath: STATE, content: '{"v":"old"}' }],
        events: [],
      }) + '\n',
    )
    writeFileSync(STATE, '{"v":"new"}')
    const log = new StateTransactionLog(JOURNAL, () => true)
    expect(log.latestWriteContent(STATE)).toBeNull()
  })

  it('崩溃留下的未完成尾行被丢弃，后续提交仍可重放', () => {
    const record = {
      id: 'tx-manual',
      at: '',
      writes: [{ filePath: STATE, content: '{"v":1}' }],
      events: [event('a')],
    }
    writeFileSync(JOURNAL, JSON.stringify(record) + '\n{"id":"tx-half')
    const sink = vi.fn(() => true)
    const log = new StateTransactionLog(JOURNAL, sink)
    const result = log.commit([{ filePath: STATE, content: '{"v":2}' }], [event('b')])
    expect(result.pending).toBe(false)
    expect(sink).toHaveBeenCalledTimes(2)
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":2}')
    expect(existsSync(JOURNAL)).toBe(false)
  })

  it('非 ASCII 记录后的半条尾行按字节截断（不切断上一条完整记录）', () => {
    const record = {
      id: 'tx-中文',
      at: '2026-11-15T00:00:00.000Z',
      writes: [{ filePath: STATE, content: '{"v":"第一版中文"}' }],
      events: [{ session: 's1', type: 'acceptance.criteria_derived', detail: { 中文: '值' } }],
    }
    writeFileSync(JOURNAL, JSON.stringify(record) + '\n{"id":"tx-半条中文')
    const sink = vi.fn(() => true)
    const log = new StateTransactionLog(JOURNAL, sink)
    const result = log.commit(
      [{ filePath: STATE, content: '{"v":"第二版中文"}' }],
      [{ session: 's1', type: 'acceptance.item_passed', detail: { 中文: '更新' } }],
    )
    expect(result.pending).toBe(false)
    expect(sink).toHaveBeenCalledTimes(2)
    expect(readFileSync(STATE, 'utf-8')).toBe('{"v":"第二版中文"}')
    expect(existsSync(JOURNAL)).toBe(false)
  })
})
