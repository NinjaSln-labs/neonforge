// 轻量 Outbox（P1-02 剩余项）：事件先写入本机 outbox 文件，再投递到会话时间线。
// 保证「事件已发出但时间线写入失败」不丢：outbox 保留待投递事件，下一次 logTimeline 或应用启动重放。
// 单进程轻量实现：不引入跨存储事务；outboxId 写入时间线事件，重放时按 outboxId 幂等跳过。
import {
  closeSync,
  existsSync,
  fsyncSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
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
  /** 入队时解析的目标时间线文件（无会话 ID 的日期文件跨午夜重放仍落原文件）。 */
  targetFile?: string
}

export type AppendOutboxEvent = (
  event: OutboxEvent,
  outboxId: string,
  targetFile?: string,
) => 'inserted' | 'duplicate'

export function newOutboxId(): string {
  return `outbox-${randomUUID()}`
}

export interface OutboxDrainResult {
  delivered: number
  duplicates: number
  remaining: number
  error?: string
}

/** 尽力 fsync 目录（rename/rm 后确保目录项落盘；Windows 不支持目录 fsync 时忽略）。 */
function syncDirBestEffort(dir: string): void {
  let fd: number | null = null
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch {
    /* 平台不支持目录 fsync——忽略 */
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* 忽略 */
      }
    }
  }
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

/** 上次崩溃若留下未换行的半行，先补换行，避免下一条事件与该半行黏连后被整体丢弃。 */
function ensureTrailingNewline(filePath: string): void {
  if (!existsSync(filePath)) return
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const size = fstatSync(fd).size
    if (size === 0) return
    const lastByte = Buffer.alloc(1)
    readSync(fd, lastByte, 0, 1, size - 1)
    if (lastByte[0] !== 0x0a) appendLineDurable(filePath, '\n')
  } catch {
    /* 目录/不可读等交由后续 append 报错 */
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* 忽略 */
      }
    }
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

  private readAll(): { entries: OutboxEntry[]; error?: string } {
    if (!existsSync(this.filePath)) return { entries: [] }
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
              ...(typeof entry.targetFile === 'string' && entry.targetFile
                ? { targetFile: entry.targetFile }
                : {}),
            })
          }
        } catch {
          console.error('[outbox] 跳过损坏条目')
        }
      }
      return { entries }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.error('[outbox] 读取失败', error)
      return { entries: [], error }
    }
  }

  private writeAll(entries: OutboxEntry[]): void {
    const dir = path.dirname(this.filePath)
    if (entries.length === 0) {
      rmSync(this.filePath, { force: true })
      syncDirBestEffort(dir)
      return
    }
    const tmp = `${this.filePath}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.filePath)
    syncDirBestEffort(dir)
  }

  /** 入队（同步 + fsync）——返回 outboxId；入队失败抛出，由调用方降级。 */
  enqueue(event: OutboxEvent, targetFile?: string, outboxId?: string): string {
    this.ensureDir()
    const id = outboxId ?? newOutboxId()
    // 固定 outboxId 的重放（WAL 保留记录每次 drain 都会重新投递）：已在队列中则幂等跳过，避免队列膨胀。
    if (outboxId) {
      const existing = this.readAll()
      if (!existing.error && existing.entries.some((e) => e.id === outboxId)) return id
    }
    const existed = existsSync(this.filePath)
    ensureTrailingNewline(this.filePath)
    const entry: OutboxEntry = {
      id,
      enqueuedAt: new Date().toISOString(),
      event,
      ...(targetFile ? { targetFile } : {}),
    }
    appendLineDurable(this.filePath, JSON.stringify(entry) + '\n')
    if (!existed) syncDirBestEffort(path.dirname(this.filePath))
    return id
  }

  /**
   * 按 FIFO 投递；成功/重复条目移除，遇到失败保留当前及后续条目并停止（保证顺序）。
   * 崩溃窗口（时间线已写、outbox 未压缩）由 appendEvent 按 outboxId 返回 duplicate 收敛。
   */
  drain(): OutboxDrainResult {
    const read = this.readAll()
    if (read.error) {
      return { delivered: 0, duplicates: 0, remaining: 0, error: read.error }
    }
    const entries = read.entries
    if (entries.length === 0) return { delivered: 0, duplicates: 0, remaining: 0 }
    const remaining: OutboxEntry[] = []
    let delivered = 0
    let duplicates = 0
    let error: string | undefined
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      try {
        const result = this.appendEvent(entry.event, entry.id, entry.targetFile)
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
    return this.readAll().entries.length
  }
}
