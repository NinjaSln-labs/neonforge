// AcceptanceStore 单例（main userData/workspace/acceptance.json）；类无 electron 依赖可单测。
import { app } from 'electron'
import path from 'node:path'
import { AcceptanceStore } from './acceptanceStore.js'
import { logTimeline } from './timelineLogger.js'
import { commitStateTransaction, getStateTransactionLog } from './stateTransaction.instance.js'

let store: AcceptanceStore | null = null

export function getAcceptanceStore(): AcceptanceStore {
  if (!store) {
    store = new AcceptanceStore(
      path.join(app.getPath('userData'), 'workspace', 'acceptance.json'),
      (event) =>
        logTimeline({
          session: event.session,
          type: event.type,
          role: 'system',
          detail: event.detail,
        }),
      (writes, events) => commitStateTransaction(writes, events),
      (filePath) => getStateTransactionLog().latestWriteContent(filePath),
    )
  }
  return store
}
