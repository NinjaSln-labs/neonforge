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
    const sink = vi.fn(() => true)
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
    const sink = vi.fn(() => ok)
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

  it('latestWriteContent 返回最新已提交意图；WAL 清空后返回 null', () => {
    let ok = false
    const log = new StateTransactionLog(JOURNAL, () => ok)
    log.commit([{ filePath: STATE, content: '{"v":1}' }], [event('a')])
    expect(log.latestWriteContent(STATE)).toBe('{"v":1}')
    ok = true
    log.drain()
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
})
