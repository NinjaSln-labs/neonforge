// TrustPolicyStore 单例（main userData/config/trust-policy.json）。
// 惰性初始化：vitest（node 环境无 electron app）下 import 链不触碰 app.getPath。
import { app } from 'electron'
import path from 'node:path'
import { TrustPolicyStore } from './trustPolicyStore.js'

let store: TrustPolicyStore | null = null

export function getTrustPolicyStore(): TrustPolicyStore {
  if (!store) {
    store = new TrustPolicyStore(path.join(app.getPath('userData'), 'config', 'trust-policy.json'))
  }
  return store
}
