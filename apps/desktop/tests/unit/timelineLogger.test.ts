import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import {
  timelineFile,
  logTimeline,
  timelineLogger,
  resetTimelineDedupe,
  drainTimelineDlq,
  drainTimelineOutbox,
  resetTimelineRuntimeState,
} from '../../src/main/timelineLogger'

// timelineFile/logTimeline 用 os.homedir() 定位 logs 目录——重定向到 /tmp（不污染真实 userData）
vi.mock('node:os', () => ({ default: { homedir: () => '/tmp/nf-timeline-test' } }))

describe('timelineLogger（会话时间线——2026-08-08 会话级文件）', () => {
  beforeEach(() => {
    rmSync('/tmp/nf-timeline-test', { recursive: true, force: true })
    mkdirSync('/tmp/nf-timeline-test/Library/Application Support/neonforge-desktop/logs', {
      recursive: true,
    })
    resetTimelineRuntimeState()
  })
  afterEach(() => {
    rmSync('/tmp/nf-timeline-test', { recursive: true, force: true })
  })

  it('timelineFile(session)：会话 ID → 按会话独立文件（非日期聚合）', () => {
    const f = timelineFile('3f8a2c1b-9d4e-4a1a-8b2b-123456789abc')
    expect(f).toContain('timeline-3f8a2c1b-9d4e-4a1a-8b2b-123456789abc.jsonl')
    // 不带日期段——不再按日期聚合
    expect(f).not.toMatch(/timeline-\d{4}-\d{2}-\d{2}/)
  })

  it('timelineFile()：无会话 ID（启动页/单元测试）→ 降级按日期文件', () => {
    const f = timelineFile()
    expect(f).toMatch(/timeline-\d{4}-\d{2}-\d{2}\.jsonl$/)
  })

  it('logTimeline：会话 ID → 写入该会话文件 + seq 会话内自增（从 1 开始）', () => {
    const sid = 'aaa11111-0000-4000-8000-000000000001'
    logTimeline({ session: sid, type: 'user-message', role: 'user', detail: { content: '你好' } })
    logTimeline({
      session: sid,
      type: 'assistant-start',
      role: 'assistant',
      detail: { forceTool: true },
    })
    const lines = readFileSync(timelineFile(sid), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const e1 = JSON.parse(lines[0])
    const e2 = JSON.parse(lines[1])
    expect(e1).toMatchObject({ session: sid, type: 'user-message', seq: 1 })
    expect(e2).toMatchObject({ session: sid, type: 'assistant-start', seq: 2 })
  })

  it('logTimeline：不同会话 seq 各自独立（原进程级计数器——多次启动 seq 冲突修复）', () => {
    const a = 'aaaaaaaa-0000-4000-8000-00000000000a'
    const b = 'bbbbbbbb-0000-4000-8000-00000000000b'
    logTimeline({ session: a, type: 'user-message', role: 'user', detail: { content: 'a1' } })
    logTimeline({ session: a, type: 'user-message', role: 'user', detail: { content: 'a2' } })
    logTimeline({ session: b, type: 'user-message', role: 'user', detail: { content: 'b1' } })
    // 会话 a：seq 1、2；会话 b：seq 从 1 开始（互不干扰）
    const linesA = readFileSync(timelineFile(a), 'utf-8').trim().split('\n')
    const linesB = readFileSync(timelineFile(b), 'utf-8').trim().split('\n')
    expect(linesA).toHaveLength(2)
    expect(linesB).toHaveLength(1)
    expect(JSON.parse(linesA[1]).seq).toBe(2)
    expect(JSON.parse(linesB[0]).seq).toBe(1)
  })

  it('logTimeline：无会话 ID → 写日期文件（fallback——不崩）', () => {
    logTimeline({ type: 'tool-exec', role: 'tool', detail: { name: 'read' } })
    const f = timelineFile()
    expect(existsSync(f)).toBe(true)
  })

  it('P2-06：dedupe 事件（card.shown）同会话同 detail 只记一次', () => {
    resetTimelineDedupe()
    const sid = 'dedupe-0000-4000-8000-000000000001'
    logTimeline({ session: sid, type: 'card.shown', role: 'system', detail: { card: 'approval' } })
    logTimeline({ session: sid, type: 'card.shown', role: 'system', detail: { card: 'approval' } })
    logTimeline({ session: sid, type: 'card.shown', role: 'system', detail: { card: 'goal' } })
    const lines = readFileSync(timelineFile(sid), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('P2-07：事件携带 eventId/version', () => {
    const sid = 'eventid-0000-4000-8000-00000000001'
    logTimeline({
      session: sid,
      type: 'conversation.message_sent',
      role: 'user',
      detail: { content: 'hi' },
    })
    const event = JSON.parse(readFileSync(timelineFile(sid), 'utf-8').trim())
    expect(event.eventId).toBe(`${sid}:1`)
    expect(event.version).toBe(1)
  })

  it('P1-02：主文件写入失败 → Outbox 保留；恢复后重放', () => {
    const sid = 'dlq-0000-4000-8000-000000000001'
    const f = timelineFile(sid)
    mkdirSync(f) // 同名目录让 appendFileSync 失败（EISDIR）
    logTimeline({
      session: sid,
      type: 'conversation.message_sent',
      role: 'user',
      detail: { content: 'dlq' },
    })
    const outbox = f.replace('timeline-' + sid + '.jsonl', 'timeline-outbox.jsonl')
    expect(existsSync(outbox)).toBe(true)
    expect(readFileSync(outbox, 'utf-8')).toContain('conversation.message_sent')
    rmSync(f, { recursive: true, force: true })
    const result = drainTimelineOutbox()
    expect(result.delivered).toBe(1)
    expect(result.remaining).toBe(0)
    expect(existsSync(f)).toBe(true)
    expect(readFileSync(f, 'utf-8')).toContain('conversation.message_sent')
    expect(existsSync(outbox)).toBe(false)
    // 再重放不重复（outboxId 幂等）
    expect(drainTimelineOutbox()).toMatchObject({ delivered: 0, duplicates: 0, remaining: 0 })
  })

  it('P1-02：重启后 seq 从已落盘文件续接（不再从 1 覆盖 eventId）', () => {
    const sid = 'restart-0000-4000-8000-000000000001'
    logTimeline({ session: sid, type: 'user-message', role: 'user', detail: { content: 'a' } })
    logTimeline({ session: sid, type: 'assistant-start', role: 'assistant', detail: {} })
    // 模拟进程重启：清空进程内 seq/索引/outbox 句柄，但保留时间线文件
    resetTimelineRuntimeState()
    logTimeline({ session: sid, type: 'assistant-start', role: 'assistant', detail: {} })
    const events = readFileSync(timelineFile(sid), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(events.map((e) => e.eventId)).toEqual([`${sid}:1`, `${sid}:2`, `${sid}:3`])
  })

  it('P1-02：旧 DLQ 文件启动重放仍兼容', () => {
    const sid = 'legacy-dlq-0000-4000-8000-0000000001'
    const f = timelineFile(sid)
    const dlq = f.replace('timeline-' + sid + '.jsonl', 'timeline-dlq.jsonl')
    const event = JSON.stringify({
      ts: new Date().toISOString(),
      seq: -1,
      session: sid,
      type: 'conversation.message_sent',
      role: 'user',
      detail: { content: 'legacy' },
    })
    writeFileSync(
      dlq,
      JSON.stringify({
        failedAt: new Date().toISOString(),
        session: sid,
        type: 'conversation.message_sent',
        error: 'legacy-failure',
        event,
      }) + '\n',
    )
    const result = drainTimelineDlq()
    expect(result.replayed).toBe(1)
    expect(result.remaining).toBe(0)
    expect(readFileSync(f, 'utf-8')).toContain('legacy')
  })
})

describe('timelineLogger.query（2026-08-15 DDD 重建——通用接入 A3）', () => {
  it('按会话 + 类型过滤 + limit（含坏行容忍）', () => {
    const sid = 'query-0000-4000-8000-000000000001'
    logTimeline({
      session: sid,
      type: 'conversation.message_sent',
      role: 'user',
      detail: { content: 'hi' },
    })
    logTimeline({ session: sid, type: 'tool.requested', role: 'tool', detail: { name: 'read' } })
    // 坏行（崩溃残留半行）容忍
    const f = timelineFile(sid)
    const raw = readFileSync(f, 'utf8')
    const corrupt = raw.split('\n').filter(Boolean)
    corrupt.splice(1, 0, '{bad json')
    writeFileSync(f, corrupt.join('\n') + '\n')
    logTimeline({ session: sid, type: 'tool.executed', role: 'tool', detail: { name: 'read' } })

    const all = timelineLogger.query({ session: sid })
    expect(all.length).toBe(3) // 坏行跳过
    const tools = timelineLogger.query({ session: sid, type: 'tool.requested' })
    expect(tools.length).toBe(1)
    expect(tools[0].type).toBe('tool.requested')
    const limited = timelineLogger.query({ session: sid, limit: 1 })
    expect(limited.length).toBe(1)
  })
})
