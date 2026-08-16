// plannedFilesStore 单例（main 进程——userData 落盘；类在 plannedFilesStore.ts——无 electron 依赖可测）
// ADR-005：PlannedFiles 权威落点 = main；renderer 镜像经 IPC 同步
// 惰性初始化：vitest（node 环境无 electron app）下 import 链不触碰 app.getPath——恢复/读写只在 registerIpc 后发生
import { app } from 'electron'
import path from 'node:path'
import { PlannedFilesStore } from './plannedFilesStore.js'

let store: PlannedFilesStore | null = null

export function getPlannedFilesStore(): PlannedFilesStore {
  if (!store) {
    store = new PlannedFilesStore(
      path.join(app.getPath('userData'), 'workspace', 'planned-files.json'),
    )
  }
  return store
}
