// ChangeSetService 单例（main userData/workspace/changesets.json）；类无 electron 依赖可单测。
import { app } from 'electron'
import path from 'node:path'
import { ChangeSetService } from './changeSetService.js'

let service: ChangeSetService | null = null

export function getChangeSetService(): ChangeSetService {
  if (!service) {
    service = new ChangeSetService(
      path.join(app.getPath('userData'), 'workspace', 'changesets.json'),
    )
  }
  return service
}
