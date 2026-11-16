import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { TimelineOutbox, type OutboxEvent } from '../../src/main/timelineOutbox'

const TMP = '/tmp/nf-timeline-outbox-test'
const FILE = path.join(TMP, 'timeline-outbox.jsonl')

function event(type: string, detail: Record<string, unknown> = {}): OutboxEvent {
  return { session: 's1', type, detail }
}

describe('TimelineOutbox（P1-02 轻量 Outbox）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('入队后按 FIFO 投递；成功后 outbox 清空', () => {
    const seen: string[] = []
    const outbox = new TimelineOutbox(FILE, (evt) => {
      seen.push(evt.type)
      return 'inserted'
    })
    outbox.enqueue(event('a'))
    outbox.enqueue(event('b'))
    expect(outbox.pendingCount()).toBe(2)
    const result = outbox.drain()
    expect(result).toEqual({ delivered: 2, duplicates: 0, remaining: 0 })
    expect(seen).toEqual(['a', 'b'])
    expect(existsSync(FILE)).toBe(false)
  })

  it('投递失败保留当前及后续条目，恢复后按序重放', () => {
    let failNext = true
    const seen: string[] = []
    const outbox = new TimelineOutbox(FILE, (evt) => {
      if (failNext) {
        failNext = false
        throw new Error('disk-full')
      }
      seen.push(evt.type)
      return 'inserted'
    })
    outbox.enqueue(event('a'))
    outbox.enqueue(event('b'))
    const failed = outbox.drain()
    expect(failed.remaining).toBe(2)
    expect(failed.delivered).toBe(0)
    expect(failed.error).toContain('disk-full')
    expect(outbox.pendingCount()).toBe(2)
    const retried = outbox.drain()
    expect(retried).toEqual({ delivered: 2, duplicates: 0, remaining: 0 })
    expect(seen).toEqual(['a', 'b'])
    expect(existsSync(FILE)).toBe(false)
  })

  it('outboxId 重复 → duplicate 并移除条目（崩溃窗口幂等）', () => {
    const delivered = new Set<string>()
    const outbox = new TimelineOutbox(FILE, (_evt, id) => {
      if (delivered.has(id)) return 'duplicate'
      delivered.add(id)
      return 'inserted'
    })
    const id = outbox.enqueue(event('a'))
    expect(outbox.drain()).toEqual({ delivered: 1, duplicates: 0, remaining: 0 })
    // 模拟「时间线已写、outbox 未压缩」：重新入队同一 outboxId
    writeFileSync(
      FILE,
      JSON.stringify({
        id,
        enqueuedAt: new Date().toISOString(),
        event: event('a'),
      }) + '\n',
    )
    expect(outbox.drain()).toEqual({ delivered: 0, duplicates: 1, remaining: 0 })
    expect(existsSync(FILE)).toBe(false)
  })

  it('损坏条目跳过，不阻断后续可解析条目', () => {
    const seen: string[] = []
    const outbox = new TimelineOutbox(FILE, (evt) => {
      seen.push(evt.type)
      return 'inserted'
    })
    writeFileSync(FILE, 'not-json\n')
    outbox.enqueue(event('a'))
    const result = outbox.drain()
    expect(result).toEqual({ delivered: 1, duplicates: 0, remaining: 0 })
    expect(seen).toEqual(['a'])
  })

  it('尾部半行（无换行）不吞掉下一条入队事件', () => {
    const seen: string[] = []
    const outbox = new TimelineOutbox(FILE, (evt) => {
      seen.push(evt.type)
      return 'inserted'
    })
    writeFileSync(FILE, '{"id":"crash-partial"') // 崩溃残留：写入中断，无换行
    outbox.enqueue(event('a'))
    const result = outbox.drain()
    expect(result).toEqual({ delivered: 1, duplicates: 0, remaining: 0 })
    expect(seen).toEqual(['a'])
    expect(existsSync(FILE)).toBe(false)
  })

  it('读取失败返回 error（不静默当作空队列）', () => {
    mkdirSync(FILE) // 同名目录 → readFileSync EISDIR
    const outbox = new TimelineOutbox(FILE, () => 'inserted')
    const result = outbox.drain()
    expect(result.delivered).toBe(0)
    expect(result.remaining).toBe(0)
    expect(result.error).toBeTruthy()
    expect(outbox.pendingCount()).toBe(0)
  })

  it('入队固定目标文件，重放按原文件投递（日期文件跨午夜不漂移）', () => {
    const files: Array<string | undefined> = []
    const outbox = new TimelineOutbox(FILE, (_evt, _id, targetFile) => {
      files.push(targetFile)
      return 'inserted'
    })
    outbox.enqueue(event('a'), '/logs/timeline-2026-11-15.jsonl')
    outbox.drain()
    expect(files).toEqual(['/logs/timeline-2026-11-15.jsonl'])
  })
})
