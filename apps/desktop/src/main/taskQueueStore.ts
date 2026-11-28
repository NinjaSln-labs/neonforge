// BC-11 任务编排持久化（main）：按会话保存队列；原子写。
import { existsSync, readFileSync } from 'node:fs'
import {
  applyStateWrites,
  type StateCommitSink,
  type StateWrite,
  type StoreEvent,
} from './stateTransaction.js'
import {
  emptyQueue,
  enqueueTask,
  startTask,
  blockTask,
  resumeTask,
  pauseTask,
  completeTask,
  cancelTask,
  reorderTask,
  recoverInterruptedTasks,
  type TaskQueueState,
} from '../domain/taskQueue.js'

type QueueFile = Record<string, TaskQueueState>

export type QueueEventSink = (event: StoreEvent) => void

export class TaskQueueStore {
  private accessedSessions = new Set<string>()

  constructor(
    private readonly filePath: string,
    private readonly emit: QueueEventSink = () => {},
    private readonly commit?: StateCommitSink,
    private readonly pendingRead?: (filePath: string) => string | null,
  ) {}

  private loadAll(): QueueFile {
    try {
      const pending = this.pendingRead?.(this.filePath)
      const raw =
        pending ?? (existsSync(this.filePath) ? readFileSync(this.filePath, 'utf-8') : null)
      if (raw === null) return {}
      const parsed = JSON.parse(raw) as QueueFile
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** 状态 + 事件同一事务（有 commit 回调时走 WAL；单测降级为原子写 + emit）。 */
  private write(data: QueueFile, events: StoreEvent[], extraWrites: StateWrite[] = []): void {
    const writes: StateWrite[] = [
      { filePath: this.filePath, content: JSON.stringify(data, null, 2) },
      ...extraWrites,
    ]
    if (this.commit) {
      this.commit(writes, events)
      return
    }
    try {
      applyStateWrites(writes)
    } catch {
      /* 落盘失败不阻断业务 */
    }
    for (const event of events) this.emit(event)
  }

  private mutate(
    sessionId: string,
    fn: (state: TaskQueueState, at: string) => TaskQueueState,
    events?: (next: TaskQueueState, before: TaskQueueState) => StoreEvent[],
  ): TaskQueueState {
    const data = this.loadAll()
    const at = new Date().toISOString()
    const before = data[sessionId] ?? emptyQueue()
    const next = fn(before, at)
    data[sessionId] = next
    this.write(data, events?.(next, before) ?? [])
    return next
  }

  list(sessionId: string): TaskQueueState {
    const data = this.loadAll()
    let state = data[sessionId] ?? emptyQueue()
    // 重启后首次访问：running → blocked（进程内不误伤正在运行的任务）
    if (!this.accessedSessions.has(sessionId)) {
      this.accessedSessions.add(sessionId)
      const recovered = recoverInterruptedTasks(
        state,
        '应用重启——请确认后恢复',
        new Date().toISOString(),
      )
      if (recovered !== state) {
        const before = state.entries
        state = recovered
        data[sessionId] = state
        const events: StoreEvent[] = []
        for (const entry of state.entries) {
          if (entry.status !== 'blocked') continue
          const wasRunning = before.find((e) => e.id === entry.id)?.status === 'running'
          if (wasRunning) {
            events.push({
              session: sessionId,
              type: 'queue.entry_blocked',
              detail: { entryId: entry.id, reason: entry.blockReason },
            })
          }
        }
        this.write(data, events)
      }
    }
    return state
  }

  enqueue(
    sessionId: string,
    title: string,
    taskRef: string = title.trim().toLowerCase(),
  ): TaskQueueState {
    this.list(sessionId) // 首次访问先做 running→blocked 恢复（与既有语义一致）
    return this.mutate(
      sessionId,
      (state, at) =>
        enqueueTask(
          state,
          {
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            taskRef,
            title: title.trim(),
          },
          at,
        ),
      (next, before) => {
        const added = next.entries.find((e) => !before.entries.some((p) => p.id === e.id))
        return added
          ? [
              {
                session: sessionId,
                type: 'queue.entry_enqueued',
                detail: {
                  entryId: added.id,
                  taskRef: added.taskRef,
                  position: next.entries.indexOf(added),
                },
              },
            ]
          : []
      },
    )
  }

  start(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => startTask(state, entryId, at),
      (next) => [
        {
          session: sessionId,
          type: 'queue.entry_started',
          detail: { entryId, taskRef: next.entries.find((e) => e.id === entryId)?.taskRef },
        },
      ],
    )
  }

  block(sessionId: string, entryId: string, reason: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => blockTask(state, entryId, reason, at),
      () => [{ session: sessionId, type: 'queue.entry_blocked', detail: { entryId, reason } }],
    )
  }

  resume(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => resumeTask(state, entryId, at),
      () => [{ session: sessionId, type: 'queue.entry_resumed', detail: { entryId } }],
    )
  }

  pause(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => pauseTask(state, entryId, at),
      () => [{ session: sessionId, type: 'queue.entry_paused', detail: { entryId } }],
    )
  }

  complete(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => completeTask(state, entryId, at),
      () => [
        {
          session: sessionId,
          type: 'queue.entry_completed',
          detail: { entryId, outcome: 'completed' },
        },
      ],
    )
  }

  // 2026-11-28 审计（D-1）：删 fail / clear——对应 IPC 通道无 UI 消费方；
  // 领域函数 failTask 保留（taskQueue 领域语义不变，供未来接线）。

  cancel(sessionId: string, entryId: string): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => cancelTask(state, entryId, at),
      () => [{ session: sessionId, type: 'queue.entry_cancelled', detail: { entryId } }],
    )
  }

  reorder(sessionId: string, entryId: string, position: number): TaskQueueState {
    return this.mutate(
      sessionId,
      (state, at) => reorderTask(state, entryId, position, at),
      () => [{ session: sessionId, type: 'queue.entry_reordered', detail: { entryId, position } }],
    )
  }
}
