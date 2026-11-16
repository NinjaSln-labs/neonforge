// BC-12 用量台账持久化（main）：append-only JSONL + 脱敏 CSV 导出。
// 隐私边界：只写计量字段，不写 prompt/文件内容/密钥；导出使用 in/out token 命名。
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { summarizeUsage, type UsageEntry, type UsageSummary } from '../domain/usageLedger.js'

function isUsageEntry(v: unknown): v is UsageEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<UsageEntry>
  return (
    typeof e.id === 'string' &&
    typeof e.at === 'string' &&
    typeof e.provider === 'string' &&
    typeof e.model === 'string' &&
    typeof e.promptTokens === 'number' &&
    typeof e.completionTokens === 'number'
  )
}

export class UsageStore {
  constructor(private readonly filePath: string) {}

  load(): UsageEntry[] {
    try {
      if (!existsSync(this.filePath)) return []
      return readFileSync(this.filePath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            const parsed = JSON.parse(line) as unknown
            return isUsageEntry(parsed) ? parsed : null
          } catch {
            return null // 坏行跳过——不阻断查询
          }
        })
        .filter((e): e is UsageEntry => e !== null)
    } catch {
      return []
    }
  }

  record(entry: UsageEntry): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    } catch {
      /* 台账写失败不阻断业务——与时间线同策略，但调用方可记录诊断 */
    }
  }

  summary(sessionId?: string): UsageSummary {
    const entries = sessionId ? this.load().filter((e) => e.sessionId === sessionId) : this.load()
    return summarizeUsage(entries)
  }

  exportCsv(): { ok: true; path: string } | { ok: false; error: string } {
    const target = this.filePath.replace(/\.jsonl$/, '') + '.csv'
    try {
      const dir = path.dirname(target)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const header =
        'id,at,provider,model,in_tokens,out_tokens,reasoning_tokens,cache,cost,price_version,session_id,task_id'
      const rows = this.load().map((e) =>
        [
          e.id,
          e.at,
          e.provider,
          e.model,
          e.promptTokens,
          e.completionTokens,
          e.reasoningTokens,
          e.cache,
          e.cost === null ? 'unknown' : e.cost,
          e.priceVersion,
          e.sessionId ?? '',
          e.taskId ?? '',
        ]
          .map((v) => {
            const s = String(v)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(','),
      )
      writeFileSync(target, `${header}\n${rows.join('\n')}\n`, { mode: 0o600 })
      return { ok: true, path: target }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}
