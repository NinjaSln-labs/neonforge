import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { timelineFile, logTimeline, timelineLogger } from '../../src/main/timelineLogger'

// timelineFile/logTimeline 用 os.homedir() 定位 logs 目录——重定向到 /tmp（不污染真实 userData）
vi.mock('node:os', () => ({ default: { homedir: () => '/tmp/nf-timeline-test' } }))

describe('timelineLogger（会话时间线——2026-08-08 会话级文件）', () => {
  beforeEach(() => {
    rmSync('/tmp/nf-timeline-test', { recursive: true, force: true })
    mkdirSync('/tmp/nf-timeline-test/Library/Application Support/neonforge-desktop/logs', { recursive: true })
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
    logTimeline({ session: sid, type: 'assistant-start', role: 'assistant', detail: { forceTool: true } })
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
})

describe('timelineLogger.query（2026-08-15 DDD 重建——通用接入 A3）', () => {
  it('按会话 + 类型过滤 + limit（含坏行容忍）', () => {
    const sid = 'query-0000-4000-8000-000000000001'
    logTimeline({ session: sid, type: 'conversation.message_sent', role: 'user', detail: { content: 'hi' } })
    logTimeline({ session: sid, type: 'tool.requested', role: 'tool', detail: { name: 'read' } })
    // 坏行（崩溃残留半行）容忍
    const f = timelineFile(sid)
    const raw = readFileSync(f, 'utf8')
    const corrupt = raw.split('\n').filter(Boolean)
    corrupt.splice(1, 0, '{bad json')
    const fs2 = require('node:fs') as typeof import('node:fs')
    fs2.writeFileSync(f, corrupt.join('\n') + '\n')
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
