// ApprovalJournal 单例（main——userData 落盘；惰性：vitest 不触碰 app.getPath）
import { app } from 'electron'
import path from 'node:path'
import { ApprovalJournal } from './approvalJournal.js'

let journal: ApprovalJournal | null = null

export function getApprovalJournal(): ApprovalJournal {
  if (!journal) {
    journal = new ApprovalJournal(
      path.join(app.getPath('userData'), 'workspace', 'approval-journal.jsonl'),
    )
  }
  return journal
}
