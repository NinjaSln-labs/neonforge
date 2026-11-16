// StateTransactionLog 单例（main userData/state/transactions.jsonl）。
// 惰性初始化：vitest（node 环境无 electron app）下 import 链不触碰 app.getPath。
import { app } from 'electron'
import path from 'node:path'
import { StateTransactionLog } from './stateTransaction.js'
import type { StateCommitResult, StateWrite, StoreEvent } from './stateTransaction.js'
import { logTimeline } from './timelineLogger.js'

let log: StateTransactionLog | null = null

export function getStateTransactionLog(): StateTransactionLog {
  if (!log) {
    log = new StateTransactionLog(
      path.join(app.getPath('userData'), 'state', 'transactions.jsonl'),
      (event, outboxId) => logTimeline(event, { outboxId }),
    )
  }
  return log
}

/** 提交事务并把未完成原因写入日志（store 侧不感知返回值）。 */
export function commitStateTransaction(
  writes: StateWrite[],
  events: StoreEvent[],
): StateCommitResult {
  const result = getStateTransactionLog().commit(writes, events)
  if (result.error) {
    console.error('[state-tx] 事务提交未完成（状态仍可用，启动时按 WAL 重放）：', result.error)
  }
  return result
}

/** 启动重放：状态写入 + 事件按 WAL FIFO 补齐（单实例锁之后调用）。 */
export function drainStateTransactions() {
  return getStateTransactionLog().drain()
}
