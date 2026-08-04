// 对话日志（2026-08-04 用户诉求：对话内容全导出/专有日志——方便用户反馈时 AI 能看实际对话）
// main 进程：renderer 上报每条消息 → 追加 JSONL（userData/logs/chat-YYYY-MM-DD.jsonl）；导出 → 合并生成可读 .md 到 Downloads
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface ChatLogEntry {
  ts: string // ISO 时间戳（排序键）
  role: 'user' | 'assistant'
  content?: string
  toolCalls?: Array<{ name: string; status: string }>
}

export function logDir(base: string): string {
  return path.join(base, 'logs')
}

export function todayLogFile(base: string): string {
  const d = new Date().toISOString().slice(0, 10)
  return path.join(logDir(base), `chat-${d}.jsonl`)
}

// 追加一条对话记录（失败静默——日志不影响对话）
export function appendChatLog(base: string, entry: ChatLogEntry): void {
  try {
    mkdirSync(logDir(base), { recursive: true })
    appendFileSync(todayLogFile(base), JSON.stringify(entry) + '\n', 'utf-8')
  } catch { /* 日志失败不影响对话 */ }
}

// 导出全部对话 → Downloads/neonforge-chat-YYYY-MM-DD.md（可读格式，方便发给 AI 反馈）
export function exportChatLog(base: string): { ok: boolean; path?: string; error?: string } {
  try {
    const dir = logDir(base)
    mkdirSync(dir, { recursive: true })
    const files = readdirSync(dir).filter((f) => f.startsWith('chat-') && f.endsWith('.jsonl')).sort()
    const entries: ChatLogEntry[] = []
    for (const f of files) {
      for (const line of readFileSync(path.join(dir, f), 'utf-8').split('\n')) {
        if (!line.trim()) continue
        try { entries.push(JSON.parse(line) as ChatLogEntry) } catch { /* 忽略损坏行 */ }
      }
    }
    entries.sort((a, b) => a.ts.localeCompare(b.ts))
    if (entries.length === 0) return { ok: false, error: '还没有对话记录' }
    const md = entries
      .map((e) => `${e.role === 'user' ? '我' : '搭档'}（${e.ts.slice(11, 19)}）：\`${e.content ?? ''}\`${e.toolCalls && e.toolCalls.length > 0 ? `\n\n工具调用：${e.toolCalls.map((t) => `${t.name}（${t.status}）`).join('、')}` : ''}`)
      .join('\n\n')
    const out = path.join(os.homedir(), 'Downloads', `neonforge-chat-${new Date().toISOString().slice(0, 10)}.md`)
    writeFileSync(out, `# NeonForge 对话记录\n\n${md}\n`, 'utf-8')
    return { ok: true, path: out }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'export-failed' }
  }
}
