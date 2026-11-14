// TaskQueueStore 单例（main userData/workspace/task-queue.json）；类无 electron 依赖可单测。
import { app } from 'electron'
import path from 'node:path'
import { TaskQueueStore } from './taskQueueStore.js'

let store: TaskQueueStore | null = null

export function getTaskQueueStore(): TaskQueueStore {
  if (!store) {
    store = new TaskQueueStore(
      path.join(app.getPath('userData'), 'workspace', 'task-queue.json'),
    )
  }
  return store
}
