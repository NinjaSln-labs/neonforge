// 轻量 Outbox（P1-02 剩余项）：事件先写入本机 outbox 文件，再投递到会话时间线。
// 保证「事件已发出但时间线写入失败」不丢：outbox 保留待投递事件，下一次 logTimeline 或应用启动重放。
// 单进程轻量实现：不引入跨存储事务；outboxId 写入时间线事件，重放时按 outboxId 幂等跳过。
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface OutboxEvent {
  session?: string
  type: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail?: Record<string, unknown>
}

export interface OutboxEntry {
  id: string
  enqueuedAt: string
  event: OutboxEvent
}

export type AppendOutboxEvent = (event: OutboxEvent, outboxId: string) => 'inserted' | 'duplicate'

export interface OutboxDrainResult {
  delivered: number
  duplicates: number
  remaining: number
  error?: string
}

/** 追加一行并 fsync（崩溃/断电时已入队事件不丢）。 */
function appendLineDurable(filePath: string, line: string): void {
  const fd = openSync(filePath, 'a', 0o600)
  try {
    writeSync(fd, line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export class TimelineOutbox {
  constructor(
    private readonly filePath: string,
    private readonly appendEvent: AppendOutboxEvent,
  ) {}

  private ensureDir(): void {
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private readAll(): OutboxEntry[] {
    if (!existsSync(this.filePath)) return []
    try {
      const lines = readFileSync(this.filePath, 'utf-8').split('\n').filter(Boolean)
      const entries: OutboxEntry[] = []
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Partial<OutboxEntry>
          if (
            entry &&
            typeof entry.id === 'string' &&
            entry.id &&
            entry.event &&
            typeof entry.event.type === 'string'
          ) {
            entries.push({
              id: entry.id,
              enqueuedAt: typeof entry.enqueuedAt === 'string' ? entry.enqueuedAt : '',
              event: entry.event,
            })
          }
        } catch {
          console.error('[outbox] 跳过损坏条目')
        }
      }
      return entries
    } catch (e) {
      console.error('[outbox] 读取失败', e)
      return []
    }
  }

  private writeAll(entries: OutboxEntry[]): void {
    if (entries.length === 0) {
      rmSync(this.filePath, { force: true })
      return
    }
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', { mode: 0o600 })
    renameSync(tmp, this.filePath)
  }

  /** 入队（同步 + fsync）——返回 outboxId；入队失败抛出，由调用方降级。 */
  enqueue(event: OutboxEvent): string {
    this.ensureDir()
    const id = `outbox-${randomUUID()}`
    const entry: OutboxEntry = {
      id,
      enqueuedAt: new Date().toISOString(),
      event,
    }
    appendLineDurable(this.filePath, JSON.stringify(entry) + '\n')
    return id
  }

  /**
   * 按 FIFO 投递；成功/重复条目移除，遇到失败保留当前及后续条目并停止（保证顺序）。
   * 崩溃窗口（时间线已写、outbox 未压缩）由 appendEvent 按 outboxId 返回 duplicate 收敛。
   */
  drain(): OutboxDrainResult {
    const entries = this.readAll()
    if (entries.length === 0) return { delivered: 0, duplicates: 0, remaining: 0 }
    const remaining: OutboxEntry[] = []
    let delivered = 0
    let duplicates = 0
    let error: string | undefined
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      try {
        const result = this.appendEvent(entry.event, entry.id)
        if (result === 'inserted') delivered += 1
        else duplicates += 1
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        remaining.push(...entries.slice(i))
        break
      }
    }
    try {
      this.writeAll(remaining)
    } catch (e) {
      // 压缩失败不抛：旧 outbox 文件仍保留已投递条目，下次 drain 按 outboxId 幂等收敛
      error = error ?? (e instanceof Error ? e.message : String(e))
    }
    return { delivered, duplicates, remaining: remaining.length, error }
  }

  pendingCount(): number {
    return this.readAll().length
  }
}
