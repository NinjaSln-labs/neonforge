// ChangeSetService 单例（main userData/workspace/changesets.json）；类无 electron 依赖可单测。
import { app } from 'electron'
import path from 'node:path'
import { ChangeSetService } from './changeSetService.js'
import { logTimeline } from './timelineLogger.js'
import { commitStateTransaction, getStateTransactionLog } from './stateTransaction.instance.js'

let service: ChangeSetService | null = null

export function getChangeSetService(): ChangeSetService {
  if (!service) {
    service = new ChangeSetService(
      path.join(app.getPath('userData'), 'workspace', 'changesets.json'),
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
  return service
}
