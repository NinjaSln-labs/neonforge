// PermissionRulesStore 单例（main userData/config/permission-rules.json）。
// 惰性初始化：vitest（node 环境无 electron app）下 import 链不触碰 app.getPath。
import { app } from 'electron'
import path from 'node:path'
import { PermissionRulesStore } from './permissionRulesStore.js'

let store: PermissionRulesStore | null = null

export function getPermissionRulesStore(): PermissionRulesStore {
  if (!store) {
    store = new PermissionRulesStore(
      path.join(app.getPath('userData'), 'config', 'permission-rules.json'),
    )
  }
  return store
}
