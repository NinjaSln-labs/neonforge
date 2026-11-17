import { app } from 'electron'
import path from 'node:path'
import { ProblemLedgerStore } from './problemLedgerStore.js'

let instance: ProblemLedgerStore | null = null

/** main 单例（惰性——vitest 不触 app.getPath）。 */
export function getProblemLedgerStore(): ProblemLedgerStore {
  if (!instance) {
    instance = new ProblemLedgerStore({
      baseDir: path.join(app.getPath('userData'), 'config'),
    })
  }
  return instance
}
