// 会话时间线日志（2026-08-07——用户「日志割裂，应有单会话所有步骤的完整时间线，分析一步到位」）
// 领域：Session Timeline BC——统一记录 用户消息/搭档回复/工具调用/授权/确认/状态/错误——按 ts+seq 升序
// 与 chatLog 关系：timeline 是超集（吸收文本事件 + 工具/授权/状态）——chatLog 降级兼容
// 纯 Node（main 进程）——appendFileSync 追加 JSONL（崩溃也保留已写行）

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let seq = 0

export function timelineFile(): string {
  const dir = path.join(os.homedir(), 'Library/Application Support/neonforge-desktop/logs')
  try { mkdirSync(dir, { recursive: true }) } catch { /* 目录创建失败不影响 */ }
  return path.join(dir, `timeline-${new Date().toISOString().slice(0, 10)}.jsonl`)
}

// 事件类型（穷举会话步骤——见 .scratch/neonforge-v1/session-timeline-domain.md §2.2）
// user-message / assistant-start / assistant-chunk / assistant-done / tool-call / tool-exec /
// tool-result / tool-approval / goal-confirmed / exec-confirmed / status-change / stuck-escalate / error / interrupt
export function logTimeline(evt: {
  session?: string
  type: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail?: Record<string, unknown>
}): void {
  try {
    seq += 1
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      seq,
      session: evt.session ?? 'default',
      type: evt.type,
      role: evt.role,
      detail: evt.detail ?? {}
    })
    appendFileSync(timelineFile(), line + '\n')
  } catch { /* 日志失败不影响运行 */ }
}
