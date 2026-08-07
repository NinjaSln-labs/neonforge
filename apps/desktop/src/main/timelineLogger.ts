// 会话时间线日志（2026-08-07——用户「日志割裂，应有单会话所有步骤的完整时间线，分析一步到位」）
// 领域：Session Timeline BC——统一记录 用户消息/搭档回复/工具调用/授权/确认/状态/错误——按 ts+seq 升序
// 与 chatLog 关系：timeline 是超集（吸收文本事件 + 工具/授权/状态）——chatLog 降级兼容
// 纯 Node（main 进程）——appendFileSync 追加 JSONL（崩溃也保留已写行）
// 2026-08-08 会话级文件：renderer 进入对话（ConversationPanel 挂载）生成 UUID 会话 ID → timeline-<会话ID>.jsonl
// （每会话独立文件——不再按日期聚合所有会话；无会话 ID（启动页阶段/单元测试）→ 降级按日期文件）

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 会话内 seq（设计文档 §2.1：seq=会话内序号）——按会话隔离自增（原进程级计数器——多次启动 seq 冲突）
const seqBySession = new Map<string, number>()

// 文件名安全（会话 ID 是 UUID，防御性清洗——防路径注入）
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_')
}

export function timelineFile(session?: string): string {
  const dir = path.join(os.homedir(), 'Library/Application Support/neonforge-desktop/logs')
  try { mkdirSync(dir, { recursive: true }) } catch { /* 目录创建失败不影响 */ }
  const name = session ? `timeline-${safeName(session)}.jsonl` : `timeline-${new Date().toISOString().slice(0, 10)}.jsonl`
  return path.join(dir, name)
}

// 事件类型（穷举会话步骤——见 .scratch/neonforge-v1/session-timeline-domain.md §2.2）
// user-message / assistant-start / assistant-chunk（可选） / assistant-done / tool-call / tool-exec /
// tool-result / tool-approval / goal-confirmed / exec-confirmed / status-change / stuck-escalate / error / interrupt
// 2026-08-08 新增 card-shown：确认卡/授权卡弹出（用户「加一个确认/授权等卡弹出的点」）——detail: { card: 'goal-confirm'|'exec-confirm'|'achieve-confirm'|'approval'|'file-approval', name?, args? }
export function logTimeline(evt: {
  session?: string
  type: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail?: Record<string, unknown>
}): void {
  try {
    const key = evt.session ?? 'default'
    const s = (seqBySession.get(key) ?? 0) + 1
    seqBySession.set(key, s)
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      seq: s,
      session: evt.session ?? 'default',
      type: evt.type,
      role: evt.role,
      detail: evt.detail ?? {}
    })
    appendFileSync(timelineFile(evt.session), line + '\n')
  } catch { /* 日志失败不影响运行 */ }
}
