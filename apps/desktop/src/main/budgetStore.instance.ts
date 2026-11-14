// BudgetStore 单例（main userData/config/budget.json）。
import { app } from 'electron'
import path from 'node:path'
import { BudgetStore } from './budgetStore.js'

let store: BudgetStore | null = null

export function getBudgetStore(): BudgetStore {
  if (!store) store = new BudgetStore(path.join(app.getPath('userData'), 'config', 'budget.json'))
  return store
}
