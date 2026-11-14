// 会话时间线日志（2026-08-07——用户「日志割裂，应有单会话所有步骤的完整时间线，分析一步到位」）
// 领域：Session Timeline BC——统一记录 用户消息/搭档回复/工具调用/授权/确认/状态/错误——按 ts+seq 升序
// 与 chatLog 关系：timeline 是超集（吸收文本事件 + 工具/授权/状态）——chatLog 降级兼容
// 纯 Node（main 进程）——appendFileSync 追加 JSONL（崩溃也保留已写行）
// 2026-08-08 会话级文件：renderer 进入对话（ConversationPanel 挂载）生成 UUID 会话 ID → timeline-<会话ID>.jsonl
// （每会话独立文件——不再按日期聚合所有会话；无会话 ID（启动页阶段/单元测试）→ 降级按日期文件）
// 2026-09-28：落盘对齐 app.getPath('userData')/logs（NF_TEST_USERDATA 隔离——不再写死 Application Support）

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { TimelineEvent, TimelineLogger, TimelineEventType } from '../domain/timeline.js'
import { TIMELINE_EVENT_SPECS, dedupeKey } from '../domain/timeline.js'

// 会话内 seq（设计文档 §2.1：seq=会话内序号）——按会话隔离自增（原进程级计数器——多次启动 seq 冲突）
const seqBySession = new Map<string, number>()

// P2-06：dedupe 事件（card.shown 等）按「会话 + 类型 + detail 签名」只记一次
const dedupeSeen = new Set<string>()
export function resetTimelineDedupe(): void {
  dedupeSeen.clear()
}

// P1-02：事件写失败可见化（原 catch 静默——审计不可靠时无人知道）
let writeFailures = 0
let lastWriteError: string | null = null
export function getTimelineWriteStats(): { failures: number; lastError: string | null } {
  return { failures: writeFailures, lastError: lastWriteError }
}

// P1-02：写失败进入本机 DLQ（保留原事件行），下次启动可重放——避免审计事件静默丢失
function timelineDlqFile(): string {
  return path.join(timelineLogsDir(), 'timeline-dlq.jsonl')
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
        const target = timelineFile(record.session)
        appendFileSync(target, record.event.endsWith('\n') ? record.event : `${record.event}\n`)
        replayed += 1
      } catch {
        remaining.push(line)
      }
    }
    if (remaining.length > 0) writeFileSync(timelineDlqFile(), remaining.join('\n') + '\n')
    else rmSync(timelineDlqFile(), { force: true })
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

export function logTimeline(evt: {
  session?: string
  type: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail?: Record<string, unknown>
}): void {
  const key = evt.session ?? 'default'
  const detail = evt.detail ?? {}
  // P2-06：注册表标记 dedupe 的事件（同一会话同一 detail 签名只落一次）
  const spec = TIMELINE_EVENT_SPECS[evt.type as TimelineEventType]
  if (spec?.dedupe) {
    const dedupe = dedupeKey(evt.type, detail)
    const fullKey = `${key}:${dedupe}`
    if (dedupeSeen.has(fullKey)) return
    dedupeSeen.add(fullKey)
  }
  try {
    const s = (seqBySession.get(key) ?? 0) + 1
    seqBySession.set(key, s)
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      seq: s,
      eventId: `${key}:${s}`, // P2-07：消费方幂等键
      version: 1, // P2-07：事件 schema 版本
      session: evt.session ?? 'default',
      type: evt.type,
      role: evt.role,
      detail,
    })
    appendFileSync(timelineFile(evt.session), line + '\n')
  } catch (e) {
    writeFailures += 1
    lastWriteError = e instanceof Error ? e.message : String(e)
    console.error('[timeline] 事件写入失败', evt.type, lastWriteError)
    // 写入 DLQ（含会话与原事件 JSON），下次启动 drainTimelineDlq 重放
    try {
      appendFileSync(
        timelineDlqFile(),
        JSON.stringify({
          failedAt: new Date().toISOString(),
          session: evt.session,
          type: evt.type,
          error: lastWriteError,
          event: JSON.stringify({
            ts: new Date().toISOString(),
            seq: -1,
            session: evt.session ?? 'default',
            type: evt.type,
            role: evt.role,
            detail,
          }),
        }) + '\n',
      )
    } catch (dlqError) {
      console.error('[timeline] DLQ 写入也失败', dlqError)
    }
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
