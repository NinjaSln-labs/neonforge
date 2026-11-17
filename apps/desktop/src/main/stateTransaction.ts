// 跨存储事务性 Outbox（P1-02 完整版）：把「状态写入」与「领域事件」放进同一条 WAL 记录一次 fsync 提交。
// - 提交点 = WAL 记录先落盘；随后应用状态文件并投递事件（事件带确定性 outboxId，重放幂等）。
// - 崩溃窗口：WAL 已写但状态/事件未完成 → 启动 drain 按 FIFO 重放；状态文件内容幂等覆盖，事件按 outboxId 去重。
// - 单进程同步实现；WAL 全部成功后压缩删除，失败保留（不丢已提交意图）。
// - store 读取优先取 WAL 最新已提交意图（latestWriteContent），状态落盘失败后后续变更不丢更新。
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { OutboxEvent } from './timelineOutbox.js'

export interface StateWrite {
  filePath: string
  content: string
}

/** 领域事件（session/type/detail）——由 store 产生，事务层补 role。 */
export interface StoreEvent {
  session: string
  type: string
  detail: Record<string, unknown>
}

/** 事件出口：返回 true = 已进入时间线；false = 待重放。 */
export type StateEventSink = (event: OutboxEvent, outboxId: string) => boolean

export type StateCommitSink = (
  writes: StateWrite[],
  events: StoreEvent[],
) => StateCommitResult | void

interface StateTransactionRecord {
  id: string
  at: string
  writes: StateWrite[]
  events: StoreEvent[]
}

export interface StateCommitResult {
  id: string
  applied: boolean
  eventsDelivered: boolean
  pending: boolean
  error?: string
}

export interface StateDrainResult {
  applied: number
  events: number
  remaining: number
  /** WAL 读取失败等阻塞态（不是“没有剩余”，调用方不得据此判成功）。 */
  pending?: boolean
  error?: string
}

/** 磁盘文件是否比 WAL 记录更新（WAL 降级直写后的磁盘意图优先，不回放旧快照）。 */
function diskNewerThan(target: string, at: string): boolean {
  const ts = Date.parse(at)
  if (!Number.isFinite(ts)) return false
  try {
    const info = statSync(target)
    return info.isFile() && info.mtimeMs >= ts
  } catch {
    return false
  }
}

function syncDirBestEffort(dir: string): void {
  let fd: number | null = null
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch {
    /* Windows 等平台不支持目录 fsync——忽略 */
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

/** writeSync 可能短写（ENOSPC 等）——循环写满，否则 WAL/状态文件会被静默截断。 */
function writeAll(fd: number, data: string): void {
  const buf = Buffer.from(data)
  let offset = 0
  while (offset < buf.length) {
    const written = writeSync(fd, buf, offset, buf.length - offset)
    if (written <= 0) throw new Error('写入未完成（短写）')
    offset += written
  }
}

/** 上次崩溃若留下未换行的半条事务（未完成提交），截掉该尾部再追加——避免与新记录黏连。 */
function dropIncompleteTail(filePath: string): void {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath)
  if (raw.length === 0 || raw[raw.length - 1] === 0x0a) return
  // 按**字节**定位最后一个换行（按 UTF-8 字符串索引会让 CJK 前缀偏移，截断到上一条完整记录内部）
  const lastNewline = raw.lastIndexOf(0x0a)
  truncateSync(filePath, lastNewline >= 0 ? lastNewline + 1 : 0)
}

function appendLineDurable(filePath: string, line: string): void {
  const fd = openSync(filePath, 'a', 0o600)
  try {
    writeAll(fd, line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** 原子写单个状态文件（tmp + fsync + rename + 目录同步）。抛错由调用方决定保留/重试。
 * 2026-11-17 审查修复：临时名随机 + O_EXCL——防止预置 symlink 把写重定向到项目外。 */
export function writeStateFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.tx-tmp-${randomUUID()}`
  const fd = openSync(tmp, 'wx', 0o600)
  try {
    writeAll(fd, content)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, filePath)
  syncDirBestEffort(dir)
}

/** 应用一组状态写入（store 无事务回调时的降级路径也复用同一原子写）。 */
export function applyStateWrites(writes: StateWrite[]): void {
  for (const write of writes) writeStateFile(write.filePath, write.content)
}

export class StateTransactionLog {
  constructor(
    private readonly filePath: string,
    private readonly eventSink: StateEventSink,
  ) {}

  private ensureDir(): void {
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private readRecords(): { records: StateTransactionRecord[]; error?: string } {
    if (!existsSync(this.filePath)) return { records: [] }
    try {
      const records: StateTransactionRecord[] = []
      const raw = readFileSync(this.filePath, 'utf-8')
      const lines = raw.split('\n')
      const endsWithNewline = raw.endsWith('\n')
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as Partial<StateTransactionRecord>
          if (
            typeof parsed.id === 'string' &&
            parsed.id &&
            Array.isArray(parsed.writes) &&
            parsed.writes.every(
              (w) =>
                w && typeof w.filePath === 'string' && w.filePath && typeof w.content === 'string',
            ) &&
            Array.isArray(parsed.events) &&
            parsed.events.every(
              (e) => e && typeof e.session === 'string' && typeof e.type === 'string',
            )
          ) {
            records.push({
              id: parsed.id,
              at: typeof parsed.at === 'string' ? parsed.at : '',
              writes: parsed.writes,
              events: (parsed.events ?? []) as StoreEvent[],
            })
          } else {
            return { records: [], error: '事务日志条目结构非法（保留文件待人工处理）' }
          }
        } catch {
          // 崩溃留下的未完成尾行（无换行）不是已提交事务，忽略；其余损坏保留文件。
          if (i === lines.length - 1 && !endsWithNewline) {
            console.error('[state-tx] 忽略未完成的尾部事务记录')
            continue
          }
          return { records: [], error: '事务日志损坏（保留文件待人工处理）' }
        }
      }
      return { records }
    } catch (e) {
      return { records: [], error: e instanceof Error ? e.message : String(e) }
    }
  }

  private writeRecords(records: StateTransactionRecord[]): void {
    const dir = path.dirname(this.filePath)
    if (records.length === 0) {
      rmSync(this.filePath, { force: true })
      syncDirBestEffort(dir)
      return
    }
    const tmp = `${this.filePath}.tmp-${randomUUID()}`
    const fd = openSync(tmp, 'wx', 0o600)
    try {
      writeAll(fd, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.filePath)
    syncDirBestEffort(dir)
  }

  /** 应用一条事务：先写状态，再投递事件。返回是否有待重放项。
   * `writtenThisDrain`：本次 drain 已写过的文件不再做 mtime 守卫
   * （否则刚由前一条 WAL 记录写入的 mtime 会误拦同批次后续记录）。 */
  private applyRecord(
    record: StateTransactionRecord,
    writtenThisDrain?: Set<string>,
  ): {
    applied: boolean
    events: number
    pending: boolean
    error?: string
  } {
    try {
      // 2026-11-17 审查修复：重放也要做 mtime 守卫——降级直写更新的文件不被旧 WAL 快照覆盖
      const writes = record.writes.filter(
        (w) => writtenThisDrain?.has(w.filePath) || !diskNewerThan(w.filePath, record.at),
      )
      if (writes.length > 0) {
        applyStateWrites(writes)
        writes.forEach((w) => writtenThisDrain?.add(w.filePath))
      }
    } catch (e) {
      return {
        applied: false,
        events: 0,
        pending: true,
        error: e instanceof Error ? e.message : String(e),
      }
    }
    let events = 0
    let pending = false
    let error: string | undefined
    record.events.forEach((event, index) => {
      try {
        const delivered = this.eventSink(
          { session: event.session, type: event.type, role: 'system', detail: event.detail },
          `${record.id}:${index}`,
        )
        if (delivered) events += 1
        else pending = true
      } catch (e) {
        pending = true
        error = error ?? (e instanceof Error ? e.message : String(e))
      }
    })
    return { applied: true, events, pending, error }
  }

  /** 应用全部 WAL 记录（FIFO）；全部成功压缩删除，失败保留最早未完成记录及后续。 */
  drain(): StateDrainResult {
    const read = this.readRecords()
    if (read.error) {
      // 2026-11-17 审查修复：读取失败不是“剩余 0”——显式 pending，commit 不得谎报成功
      return { applied: 0, events: 0, remaining: 0, pending: true, error: read.error }
    }
    const records = read.records
    if (records.length === 0) return { applied: 0, events: 0, remaining: 0 }
    let applied = 0
    let events = 0
    let firstPending = -1
    let error: string | undefined
    const writtenThisDrain = new Set<string>()
    records.forEach((record, index) => {
      const result = this.applyRecord(record, writtenThisDrain)
      if (result.applied) applied += 1
      events += result.events
      if (result.pending || !result.applied) {
        if (firstPending === -1) firstPending = index
        error = error ?? result.error ?? (result.pending ? '事件仍待重放' : undefined)
      }
    })
    const remaining = firstPending === -1 ? [] : records.slice(firstPending)
    try {
      this.writeRecords(remaining)
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : String(e))
    }
    return { applied, events, remaining: remaining.length, error }
  }

  /** 提交一条跨存储事务；返回提交结果（pending=true 表示仍待重放）。 */
  commit(writes: StateWrite[], events: StoreEvent[]): StateCommitResult {
    const id = `tx-${randomUUID()}`
    const record: StateTransactionRecord = {
      id,
      at: new Date().toISOString(),
      writes,
      events,
    }
    try {
      this.ensureDir()
      try {
        dropIncompleteTail(this.filePath)
      } catch (e) {
        console.error('[state-tx] 清理未完成尾行失败', e)
      }
      const existed = existsSync(this.filePath)
      appendLineDurable(this.filePath, JSON.stringify(record) + '\n')
      if (!existed) syncDirBestEffort(path.dirname(this.filePath))
    } catch (e) {
      // WAL 不可用：退化为直接应用（无事务保证，但仍不让当前变更静默丢失）
      try {
        applyStateWrites(writes)
      } catch (applyError) {
        return {
          id,
          applied: false,
          eventsDelivered: false,
          pending: false,
          error: `事务日志与状态写入均失败：${applyError instanceof Error ? applyError.message : String(applyError)}`,
        }
      }
      let pending = false
      events.forEach((event, index) => {
        try {
          if (!this.eventSink({ ...event, role: 'system' }, `${id}:${index}`)) pending = true
        } catch {
          pending = true
        }
      })
      return {
        id,
        applied: true,
        eventsDelivered: !pending,
        pending,
        error: `事务日志不可用：${e instanceof Error ? e.message : String(e)}`,
      }
    }
    const drained = this.drain()
    const blocked = Boolean(drained.pending)
    return {
      id,
      applied: !blocked && (drained.remaining === 0 || drained.applied > 0),
      eventsDelivered: !blocked && drained.remaining === 0 && !drained.error,
      pending: blocked || drained.remaining > 0,
      error: drained.error,
    }
  }

  pendingCount(): number {
    return this.readRecords().records.length
  }

  /** 某状态文件的最新「已提交意图」（WAL 最新记录，含尚未成功落盘的写入）；无则 null。
   *  store 读取时优先用它，避免状态写入失败后下一次变更基于旧磁盘内容而丢掉前一次变更。 */
  latestWriteContent(target: string): string | null {
    const read = this.readRecords()
    if (read.error) return null
    for (let i = read.records.length - 1; i >= 0; i -= 1) {
      const record = read.records[i]
      const write = record.writes.find((w) => w.filePath === target)
      if (!write) continue
      // WAL append 失败时的直写降级不会进入日志：磁盘 mtime 晚于记录时间 → 磁盘是更新的意图，不回放旧 WAL。
      if (diskNewerThan(target, record.at)) return null
      return write.content
    }
    return null
  }
}
