// BC-12 预算设置（main 本机 JSON；只存阈值/开关，不含用量内容）。原子写 0600。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface BudgetSettings {
  /** 周期预算（USD）；null = 未设置 */
  limitUsd: number | null
  /** 用户显式开启：达到阈值后在新一轮开始前暂停（不打断进行中的工具调用） */
  pauseOnReach: boolean
}

const DEFAULTS: BudgetSettings = { limitUsd: null, pauseOnReach: false }

export function validateBudgetSettings(input: unknown): BudgetSettings {
  if (!input || typeof input !== 'object') throw new Error('预算设置必须是对象')
  const raw = input as Record<string, unknown>
  let limit: number | null = null
  if (raw.limitUsd !== null && raw.limitUsd !== undefined) {
    const n = Number(raw.limitUsd)
    if (!Number.isFinite(n) || n < 0) throw new Error('预算必须是非负数或 null')
    limit = n
  }
  return {
    limitUsd: limit,
    pauseOnReach: Boolean(raw.pauseOnReach),
  }
}

export class BudgetStore {
  constructor(private readonly filePath: string) {}

  load(): BudgetSettings {
    try {
      if (!existsSync(this.filePath)) return { ...DEFAULTS }
      return validateBudgetSettings(JSON.parse(readFileSync(this.filePath, 'utf-8')))
    } catch {
      return { ...DEFAULTS }
    }
  }

  save(input: unknown): BudgetSettings {
    const settings = validateBudgetSettings(input)
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 })
    renameSync(tmp, this.filePath)
    return settings
  }
}
