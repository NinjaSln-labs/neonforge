// 会话时间线日志（2026-08-07——用户「日志割裂，应有单会话所有步骤的完整时间线，分析一步到位」）
// 领域：Session Timeline BC——统一记录 用户消息/搭档回复/工具调用/授权/确认/状态/错误——按 ts+seq 升序
// 与 chatLog 关系：timeline 是超集（吸收文本事件 + 工具/授权/状态）——chatLog 降级兼容
// 纯 Node（main 进程）——appendFileSync 追加 JSONL（崩溃也保留已写行）
// 2026-08-08 会话级文件：renderer 进入对话（ConversationPanel 挂载）生成 UUID 会话 ID → timeline-<会话ID>.jsonl
// （每会话独立文件——不再按日期聚合所有会话；无会话 ID（启动页阶段/单元测试）→ 降级按日期文件）
// 2026-09-28：落盘对齐 app.getPath('userData')/logs（NF_TEST_USERDATA 隔离——不再写死 Application Support）
// 2026-11-15：P1-02 轻量 Outbox——事件先入 outbox 文件（fsync），再投递时间线；失败保留，启动重放。

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { TimelineEvent, TimelineLogger, TimelineEventType } from '../domain/timeline.js'
import { TIMELINE_EVENT_SPECS, dedupeKey } from '../domain/timeline.js'
import { TimelineOutbox, newOutboxId, type OutboxEvent } from './timelineOutbox.js'

// 会话内 seq（设计文档 §2.1：seq=会话内序号）——按会话隔离自增（原进程级计数器——多次启动 seq 冲突）
const seqBySession = new Map<string, number>()

// P2-06：dedupe 事件（card.shown 等）按「会话 + 类型 + detail 签名」只记一次
const dedupeSeen = new Set<string>()
export function resetTimelineDedupe(): void {
  dedupeSeen.clear()
}

// P1-02：事件写失败可见化（原 catch 静默——审计不可靠时无人知道）
// 2026-11-28 审计：删 writeFailures 计数器（唯一读者 getTimelineWriteStats 亦为死导出）。
let lastWriteError: string | null = null

// P1-02：写失败进入本机 DLQ（保留原事件行），下次启动可重放——避免审计事件静默丢失
function timelineDlqFile(): string {
  return path.join(timelineLogsDir(), 'timeline-dlq.jsonl')
}

function timelineOutboxFile(): string {
  return path.join(timelineLogsDir(), 'timeline-outbox.jsonl')
}

// P1-02 / P2-07：每会话文件索引——重启后 seq 续接 + outboxId 幂等重放
interface TimelineFileIndex {
  maxSeq: number
  outboxIds: Set<string>
  scanned: boolean
}
const fileIndexes = new Map<string, TimelineFileIndex>()

let outbox: TimelineOutbox | null = null
let outboxFilePath: string | null = null

function timelineFileIndex(file: string): TimelineFileIndex {
  const cached = fileIndexes.get(file)
  if (cached?.scanned) return cached
  const index = cached ?? { maxSeq: 0, outboxIds: new Set<string>(), scanned: false }
  fileIndexes.set(file, index)
  if (!existsSync(file)) {
    index.scanned = true
    return index
  }
  try {
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      if (!line.trim()) continue
      try {
        const evt = JSON.parse(line) as Partial<TimelineEvent> & { outboxId?: string }
        if (typeof evt.seq === 'number' && evt.seq > index.maxSeq) index.maxSeq = evt.seq
        if (typeof evt.outboxId === 'string' && evt.outboxId) index.outboxIds.add(evt.outboxId)
      } catch {
        /* 坏行跳过 */
      }
    }
    index.scanned = true
  } catch (e) {
    // 读失败不缓存（下次重试）；否则 maxSeq=0 会生成重复 seq/eventId，outboxId 幂等也会失效
    console.error('[timeline] 会话文件索引读取失败（下次重试）', file, e)
  }
  return index
}

/** 重置进程内时间线状态（测试隔离 / userData 切换；不影响已落盘事件）。 */
export function resetTimelineRuntimeState(): void {
  seqBySession.clear()
  dedupeSeen.clear()
  fileIndexes.clear()
  outbox = null
  outboxFilePath = null
  lastWriteError = null
}

function getTimelineOutbox(): TimelineOutbox {
  const file = timelineOutboxFile()
  if (!outbox || outboxFilePath !== file) {
    outbox = new TimelineOutbox(file, (event, outboxId, targetFile) =>
      appendTimelineEvent(event, outboxId, targetFile),
    )
    outboxFilePath = file
  }
  return outbox
}

/** 重放 outbox（成功/重复条目移除；失败保留）；供启动与诊断调用。 */
export function drainTimelineOutbox(): {
  delivered: number
  duplicates: number
  remaining: number
  error?: string
} {
  try {
    return getTimelineOutbox().drain()
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[timeline] Outbox 重放失败', error)
    return { delivered: 0, duplicates: 0, remaining: 0, error }
  }
}

/**
 * 时间线追加并 fsync：投递成功后 outbox 条目会被移除，目标行必须先落盘
 * （否则断电时可能「outbox 已删、时间线未落盘」→ 事件丢失）。
 */
function appendTimelineLine(file: string, line: string): void {
  const fd = openSync(file, 'a', 0o600)
  try {
    writeSync(fd, line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** 追加一条事件到时间线；outboxId 已存在 → duplicate（崩溃窗口重放幂等）。失败抛出。 */
function appendTimelineEvent(
  evt: OutboxEvent,
  outboxId?: string,
  targetFile?: string,
): 'inserted' | 'duplicate' {
  const key = evt.session ?? 'default'
  const detail = evt.detail ?? {}
  const file = targetFile ?? timelineFile(evt.session)
  const index = timelineFileIndex(file)
  if (outboxId && index.outboxIds.has(outboxId)) return 'duplicate'
  const spec = TIMELINE_EVENT_SPECS[evt.type as TimelineEventType]
  const dedupe = spec?.dedupe ? `${key}:${dedupeKey(evt.type, detail)}` : null
  if (dedupe && dedupeSeen.has(dedupe)) return 'duplicate'
  const seq = Math.max(seqBySession.get(key) ?? 0, index.maxSeq) + 1
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    seq,
    eventId: `${key}:${seq}`, // P2-07：消费方幂等键
    version: 1, // P2-07：事件 schema 版本
    session: key,
    type: evt.type,
    role: evt.role,
    detail,
    ...(outboxId ? { outboxId } : {}),
  })
  try {
    appendTimelineLine(file, line + '\n')
  } catch (e) {
    // 可能已写入但 fsync 报错：强制下次重扫文件，重放时按 outboxId 判重（避免同进程重复 seq）
    index.scanned = false
    throw e
  }
  seqBySession.set(key, seq)
  index.maxSeq = seq
  if (outboxId) index.outboxIds.add(outboxId)
  if (dedupe) dedupeSeen.add(dedupe)
  return 'inserted'
}

function writeTimelineDlq(evt: OutboxEvent, error: string, outboxId?: string): void {
  try {
    appendFileSync(
      timelineDlqFile(),
      JSON.stringify({
        failedAt: new Date().toISOString(),
        session: evt.session,
        type: evt.type,
        error,
        ...(outboxId ? { outboxId } : {}),
        event: JSON.stringify({
          ts: new Date().toISOString(),
          seq: -1,
          session: evt.session ?? 'default',
          type: evt.type,
          role: evt.role,
          detail: evt.detail ?? {},
          ...(outboxId ? { outboxId } : {}),
        }),
      }) + '\n',
    )
  } catch (dlqError) {
    console.error('[timeline] DLQ 写入也失败', dlqError)
  }
}

/** 重放 DLQ（成功写入原会话文件的行移除；坏行保留）；返回重放统计 */
export function drainTimelineDlq(): { replayed: number; remaining: number } {
  try {
    if (!existsSync(timelineDlqFile())) return { replayed: 0, remaining: 0 }
    const lines = readFileSync(timelineDlqFile(), 'utf-8').split('\n').filter(Boolean)
    const remaining: string[] = []
    let replayed = 0
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as { event?: string; session?: string }
        if (!record.event) throw new Error('missing event')
        const parsed = JSON.parse(record.event) as {
          session?: string
          type?: string
          role?: OutboxEvent['role']
          detail?: Record<string, unknown>
          outboxId?: string
        }
        if (typeof parsed.type !== 'string') throw new Error('invalid event')
        const outboxId = typeof parsed.outboxId === 'string' ? parsed.outboxId : undefined
        const target = timelineFile(record.session ?? parsed.session)
        // 走 appendTimelineEvent（而非裸 append）：分配新 seq + 按 outboxId 判重——
        // WAL 已成功投递的同一事件不会被 DLQ 重放再写一遍（无 outboxId 的旧 DLQ 行照常补写）
        appendTimelineEvent(
          {
            session: parsed.session,
            type: parsed.type,
            role: parsed.role,
            detail: parsed.detail ?? {},
          },
          outboxId,
          target,
        )
        replayed += 1
      } catch {
        remaining.push(line)
      }
    }
    if (remaining.length > 0) writeFileSync(timelineDlqFile(), remaining.join('\n') + '\n')
    else rmSync(timelineDlqFile(), { force: true })
    fileIndexes.clear() // DLQ 直写后强制下次 append 重扫 seq/outboxId
    return { replayed, remaining: remaining.length }
  } catch (e) {
    console.error('[timeline] DLQ 重放失败', e)
    return { replayed: 0, remaining: 0 }
  }
}

// main 在 setPath(userData) 后注入——asar ESM 里 require('electron') 不可靠，会误落 Application Support
let userDataLogsDir: string | null = null

/** 与 configStore.reload 同序：NF_TEST_USERDATA / 默认 userData 就绪后调用 */
export function setTimelineUserData(userData: string): void {
  userDataLogsDir = path.join(userData, 'logs')
  // 切换 userData / 测试隔离：清空进程内 seq、索引与 outbox 句柄（不删除已落盘事件）
  resetTimelineRuntimeState()
}

// 文件名安全（会话 ID 是 UUID，防御性清洗——防路径注入）
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_')
}

function timelineLogsDir(): string {
  if (userDataLogsDir) return userDataLogsDir
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    if (app?.getPath) return path.join(app.getPath('userData'), 'logs')
  } catch {
    /* 单测 / 无 electron */
  }
  return path.join(os.homedir(), 'Library/Application Support/neonforge-desktop/logs')
}

export function timelineFile(session?: string): string {
  const dir = timelineLogsDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 目录创建失败不影响 */
  }
  const name = session
    ? `timeline-${safeName(session)}.jsonl`
    : `timeline-${new Date().toISOString().slice(0, 10)}.jsonl`
  return path.join(dir, name)
}

/** 记录事件（轻量 Outbox）：先入队 fsync，再投递；失败保留待下次/启动重放。
 * 返回 true = 已进入时间线（含幂等重复）；false = 仍待重放或已落 DLQ。
 * 跨存储事务传入固定 outboxId，重放时按同一 id 幂等。 */
export function logTimeline(evt: OutboxEvent, opts: { outboxId?: string } = {}): boolean {
  const spec = TIMELINE_EVENT_SPECS[evt.type as TimelineEventType]
  if (spec?.dedupe) {
    const fullKey = `${evt.session ?? 'default'}:${dedupeKey(evt.type, evt.detail ?? {})}`
    if (dedupeSeen.has(fullKey)) return true
  }
  const outboxId = opts.outboxId ?? newOutboxId()
  try {
    const queue = getTimelineOutbox()
    // 入队时固定目标文件：无会话 ID 的日期文件跨午夜重放仍写原文件（outboxId 幂等才对得上）
    queue.enqueue(evt, timelineFile(evt.session), outboxId)
    const result = queue.drain()
    if (result.error) {
      lastWriteError = result.error
      console.error('[timeline] Outbox 投递失败（已保留待重放）', evt.type, result.error)
      return false
    }
    if (result.remaining > 0) {
      lastWriteError = 'outbox-pending'
      return false
    }
    return true
  } catch (e) {
    // Outbox 自身不可用（目录/权限等）——降级直写 + 旧 DLQ（保留既有失败可见性）
    try {
      // 带同一 outboxId 直写：若入队已部分成功，后续重放按 outboxId 判重，不会产生第二条
      appendTimelineEvent(evt, outboxId)
    } catch (e2) {
      lastWriteError = e2 instanceof Error ? e2.message : String(e2)
      console.error('[timeline] 事件写入失败', evt.type, lastWriteError)
      writeTimelineDlq(evt, lastWriteError, outboxId)
      return false
    }
    console.warn('[timeline] Outbox 不可用，已降级直写', e instanceof Error ? e.message : String(e))
    return true
  }
}

export const timelineLogger: TimelineLogger = {
  append: (event) =>
    logTimeline({
      session: event.session,
      type: event.type,
      role: event.role,
      detail: event.detail,
    }),
  query: (filter) => {
    try {
      const file = timelineFile(filter.session)
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
      const out: TimelineEvent[] = []
      for (const line of lines) {
        try {
          const evt = JSON.parse(line) as TimelineEvent
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type]
            if (!types.includes(evt.type as TimelineEventType)) continue
          }
          if (filter.from && evt.ts < filter.from) continue
          if (filter.to && evt.ts > filter.to) continue
          out.push(evt)
          if (filter.limit && out.length >= filter.limit) break
        } catch {
          /* 坏行跳过（JSONL 崩溃保留已写行——容忍） */
        }
      }
      return out
    } catch {
      return []
    }
  },
}
