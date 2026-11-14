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

export class TaskQueueStore {
  constructor(private readonly filePath: string) {}

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
    return this.mutate(sessionId, (state, at) =>
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
  }

  start(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => startTask(state, entryId, at))
  }

  block(sessionId: string, entryId: string, reason: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => blockTask(state, entryId, reason, at))
  }

  resume(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => resumeTask(state, entryId, at))
  }

  pause(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => pauseTask(state, entryId, at))
  }

  complete(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => completeTask(state, entryId, at))
  }

  fail(sessionId: string, entryId: string, reason: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => failTask(state, entryId, reason, at))
  }

  cancel(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(sessionId, (state, at) => cancelTask(state, entryId, at))
  }

  reorder(sessionId: string, entryId: string, position: number): TaskQueueState {
    return this.mutate(sessionId, (state, at) => reorderTask(state, entryId, position, at))
  }

  clear(sessionId: string): void {
    const data = this.loadAll()
    delete data[sessionId]
    this.saveAll(data)
  }
}
