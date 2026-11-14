// BC-11 任务编排（目标态实现）：纯队列状态机。
// 不变量（I18）：
// - 每个工作区同时最多一个 running（本聚合实例即一个工作区队列）。
// - 队列只消费任务状态；阻塞项不得自动跳过/自动确认。
// - 取消不破坏 Task 状态（本模块只改队列条目）。
// - 顺序稳定；重排仅由用户显式触发，且只能重排排队项。

export type QueueStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface QueueEntry {
  id: string
  taskRef: string
  title: string
  status: QueueStatus
  createdAt: string
  updatedAt: string
  blockReason?: string
  failReason?: string
}

export interface TaskQueueState {
  entries: QueueEntry[]
}

export function emptyQueue(): TaskQueueState {
  return { entries: [] }
}

function replace(
  state: TaskQueueState,
  entryId: string,
  fn: (e: QueueEntry) => QueueEntry,
  at: string,
): TaskQueueState {
  let found = false
  const entries = state.entries.map((e) => {
    if (e.id !== entryId) return e
    found = true
    return { ...fn(e), updatedAt: at }
  })
  if (!found) throw new TypeError(`队列条目不存在：${entryId}`)
  return { entries }
}

export function activeTask(state: TaskQueueState): QueueEntry | null {
  return state.entries.find((e) => e.status === 'running') ?? null
}

export function enqueueTask(
  state: TaskQueueState,
  input: { id: string; taskRef: string; title: string },
  at: string,
): TaskQueueState {
  if (state.entries.some((e) => e.taskRef === input.taskRef)) return state // 幂等
  const entry: QueueEntry = {
    ...input,
    status: 'queued',
    createdAt: at,
    updatedAt: at,
  }
  return { entries: [...state.entries, entry] }
}

export function startTask(state: TaskQueueState, entryId: string, at: string): TaskQueueState {
  const target = state.entries.find((e) => e.id === entryId)
  if (!target) throw new TypeError(`队列条目不存在：${entryId}`)
  if (target.status !== 'queued' && target.status !== 'paused') {
    throw new TypeError(`只有排队/暂停任务可启动：${target.status}`)
  }
  if (activeTask(state)) throw new TypeError('已有运行中的任务（每工作区单活跃，不变量 I18）')
  return replace(state, entryId, (e) => ({ ...e, status: 'running' }), at)
}

export function blockTask(
  state: TaskQueueState,
  entryId: string,
  reason: string,
  at: string,
): TaskQueueState {
  return replace(
    state,
    entryId,
    (e) => {
      if (e.status !== 'running') throw new TypeError(`只有运行中任务可阻塞：${e.status}`)
      return { ...e, status: 'blocked', blockReason: reason }
    },
    at,
  )
}

export function resumeTask(state: TaskQueueState, entryId: string, at: string): TaskQueueState {
  const target = state.entries.find((e) => e.id === entryId)
  if (!target || target.status !== 'blocked') {
    throw new TypeError('只有阻塞任务可恢复')
  }
  if (activeTask(state)) throw new TypeError('已有运行中的任务（每工作区单活跃，不变量 I18）')
  return replace(
    state,
    entryId,
    (e) => ({ ...e, status: 'running', blockReason: undefined }),
    at,
  )
}

export function pauseTask(state: TaskQueueState, entryId: string, at: string): TaskQueueState {
  return replace(
    state,
    entryId,
    (e) => {
      if (e.status !== 'queued' && e.status !== 'running') {
        throw new TypeError(`只有排队/运行中任务可暂停：${e.status}`)
      }
      return { ...e, status: 'paused' }
    },
    at,
  )
}

export function completeTask(state: TaskQueueState, entryId: string, at: string): TaskQueueState {
  return replace(
    state,
    entryId,
    (e) => {
      if (e.status !== 'running' && e.status !== 'blocked') {
        throw new TypeError(`只有运行/阻塞任务可完成：${e.status}`)
      }
      return { ...e, status: 'completed' }
    },
    at,
  )
}

export function failTask(
  state: TaskQueueState,
  entryId: string,
  reason: string,
  at: string,
): TaskQueueState {
  return replace(
    state,
    entryId,
    (e) => ({ ...e, status: 'failed', failReason: reason }),
    at,
  )
}

export function cancelTask(state: TaskQueueState, entryId: string, at: string): TaskQueueState {
  return replace(
    state,
    entryId,
    (e) => {
      if (e.status === 'completed' || e.status === 'failed' || e.status === 'cancelled') {
        throw new TypeError(`任务已是终态：${e.status}`)
      }
      return { ...e, status: 'cancelled' }
    },
    at,
  )
}

export function reorderTask(state: TaskQueueState, entryId: string, position: number, at: string): TaskQueueState {
  const target = state.entries.find((e) => e.id === entryId)
  if (!target) throw new TypeError(`队列条目不存在：${entryId}`)
  if (target.status !== 'queued' && target.status !== 'paused') {
    throw new TypeError('只能重排排队/暂停任务')
  }
  const entries = state.entries.filter((e) => e.id !== entryId)
  const index = Math.max(0, Math.min(position, entries.length))
  const moved = { ...target, updatedAt: at }
  return { entries: [...entries.slice(0, index), moved, ...entries.slice(index)] }
}
