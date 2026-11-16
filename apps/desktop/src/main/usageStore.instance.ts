// UsageStore 单例（main userData）；类无 electron 依赖可单测。
// 惰性初始化：vitest 下 import 链不触碰 app.getPath。
import { app } from 'electron'
import path from 'node:path'
import { UsageStore } from './usageStore.js'

let store: UsageStore | null = null

export function getUsageStore(): UsageStore {
  if (!store) {
    store = new UsageStore(path.join(app.getPath('userData'), 'logs', 'usage.jsonl'))
  }
  return store
}
