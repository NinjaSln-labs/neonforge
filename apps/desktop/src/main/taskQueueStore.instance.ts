// TaskQueueStore 单例（main userData/workspace/task-queue.json）；类无 electron 依赖可单测。
import { app } from 'electron'
import path from 'node:path'
import { TaskQueueStore } from './taskQueueStore.js'
import { logTimeline } from './timelineLogger.js'

let store: TaskQueueStore | null = null

export function getTaskQueueStore(): TaskQueueStore {
  if (!store) {
    store = new TaskQueueStore(
      path.join(app.getPath('userData'), 'workspace', 'task-queue.json'),
      (event) =>
        logTimeline({
          session: event.session,
          type: event.type,
          role: 'system',
          detail: event.detail,
        }),
    )
  }
  return store
}
