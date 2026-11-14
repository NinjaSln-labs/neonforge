// BC-11 任务编排持久化（main）：按会话保存队列；原子写。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  emptyQueue,
  enqueueTask,
  startTask,
  blockTask,
  resumeTask,
  pauseTask,
  completeTask,
  failTask,
  cancelTask,
  reorderTask,
  type TaskQueueState,
} from '../domain/taskQueue.js'

type QueueFile = Record<string, TaskQueueState>

export type QueueEventSink = (event: {
  session: string
  type: string
  detail: Record<string, unknown>
}) => void

export class TaskQueueStore {
  constructor(
    private readonly filePath: string,
    private readonly emit: QueueEventSink = () => {},
  ) {}

  private loadAll(): QueueFile {
    try {
      if (!existsSync(this.filePath)) return {}
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as QueueFile
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private saveAll(data: QueueFile): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
      renameSync(tmp, this.filePath)
    } catch {
      /* 落盘失败不阻断业务 */
    }
  }

  private mutate(
    sessionId: string,
    fn: (state: TaskQueueState, at: string) => TaskQueueState,
  ): TaskQueueState {
    const data = this.loadAll()
    const at = new Date().toISOString()
    const next = fn(data[sessionId] ?? emptyQueue(), at)
    data[sessionId] = next
    this.saveAll(data)
    return next
  }

  list(sessionId: string): TaskQueueState {
    return this.loadAll()[sessionId] ?? emptyQueue()
  }

  enqueue(
    sessionId: string,
    title: string,
    taskRef: string = title.trim().toLowerCase(),
  ): TaskQueueState {
    const before = this.list(sessionId)
    const next = this.mutate(sessionId, (state, at) =>
      enqueueTask(
        state,
        {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          taskRef,
          title: title.trim(),
        },
        at,
      ),
    )
    const added = next.entries.find((e) => !before.entries.some((p) => p.id === e.id))
    if (added) {
      this.emit({
        session: sessionId,
        type: 'queue.entry_enqueued',
        detail: {
          entryId: added.id,
          taskRef: added.taskRef,
          position: next.entries.indexOf(added),
        },
      })
    }
    return next
  }

  start(sessionId: string, entryId: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => startTask(state, entryId, at))
    const entry = next.entries.find((e) => e.id === entryId)
    this.emit({
      session: sessionId,
      type: 'queue.entry_started',
      detail: { entryId, taskRef: entry?.taskRef },
    })
    return next
  }

  block(sessionId: string, entryId: string, reason: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => blockTask(state, entryId, reason, at))
    this.emit({
      session: sessionId,
      type: 'queue.entry_blocked',
      detail: { entryId, reason },
    })
    return next
  }

  resume(sessionId: string, entryId: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => resumeTask(state, entryId, at))
    this.emit({ session: sessionId, type: 'queue.entry_resumed', detail: { entryId } })
    return next
  }

  pause(sessionId: string, entryId: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => pauseTask(state, entryId, at))
    this.emit({ session: sessionId, type: 'queue.entry_paused', detail: { entryId } })
    return next
  }

  complete(sessionId: string, entryId: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => completeTask(state, entryId, at))
    this.emit({
      session: sessionId,
      type: 'queue.entry_completed',
      detail: { entryId, outcome: 'completed' },
    })
    return next
  }

  fail(sessionId: string, entryId: string, reason: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => failTask(state, entryId, reason, at))
    this.emit({
      session: sessionId,
      type: 'queue.entry_completed',
      detail: { entryId, outcome: 'failed', reason },
    })
    return next
  }

  cancel(sessionId: string, entryId: string): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => cancelTask(state, entryId, at))
    this.emit({ session: sessionId, type: 'queue.entry_cancelled', detail: { entryId } })
    return next
  }

  reorder(sessionId: string, entryId: string, position: number): TaskQueueState {
    const next = this.mutate(sessionId, (state, at) => reorderTask(state, entryId, position, at))
    this.emit({
      session: sessionId,
      type: 'queue.entry_reordered',
      detail: { entryId, position },
    })
    return next
  }

  clear(sessionId: string): void {
    const data = this.loadAll()
    delete data[sessionId]
    this.saveAll(data)
  }
}
