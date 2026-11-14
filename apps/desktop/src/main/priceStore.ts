// BC-12 价格表配置（main 本机 JSON；价格是易变外部事实——未配置时成本诚实为 unknown）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EMPTY_PRICE_TABLE, type PriceRule, type PriceTable } from '../domain/usageLedger.js'

const KEY_RE = /^[^:]+:.+$/

export function validatePriceTable(input: unknown): PriceTable {
  if (!input || typeof input !== 'object') throw new Error('价格表必须是对象')
  const raw = input as Record<string, unknown>
  const version =
    typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : 'configured-v1'
  const modelsRaw = raw.models
  if (!modelsRaw || typeof modelsRaw !== 'object' || Array.isArray(modelsRaw)) {
    throw new Error('价格表 models 必须是对象')
  }
  const models: Record<string, PriceRule> = {}
  for (const [key, value] of Object.entries(modelsRaw as Record<string, unknown>)) {
    if (!KEY_RE.test(key)) throw new Error(`价格键必须是 provider:model（小写）：${key}`)
    if (!value || typeof value !== 'object') throw new Error(`价格规则必须是对象：${key}`)
    const rule = value as Record<string, unknown>
    const promptPerMillion = Number(rule.promptPerMillion)
    const completionPerMillion = Number(rule.completionPerMillion)
    if (!Number.isFinite(promptPerMillion) || promptPerMillion < 0) {
      throw new Error(`${key} 的 promptPerMillion 必须是非负数`)
    }
    if (!Number.isFinite(completionPerMillion) || completionPerMillion < 0) {
      throw new Error(`${key} 的 completionPerMillion 必须是非负数`)
    }
    let cacheHitPerMillion: number | undefined
    if (rule.cacheHitPerMillion !== undefined) {
      cacheHitPerMillion = Number(rule.cacheHitPerMillion)
      if (!Number.isFinite(cacheHitPerMillion) || cacheHitPerMillion < 0) {
        throw new Error(`${key} 的 cacheHitPerMillion 必须是非负数`)
      }
    }
    models[key.toLowerCase()] = {
      promptPerMillion,
      completionPerMillion,
      ...(cacheHitPerMillion !== undefined ? { cacheHitPerMillion } : {}),
    }
  }
  return { version, models }
}

export class PriceStore {
  constructor(private readonly filePath: string) {}

  load(): PriceTable {
    try {
      if (!existsSync(this.filePath)) return { ...EMPTY_PRICE_TABLE, models: {} }
      return validatePriceTable(JSON.parse(readFileSync(this.filePath, 'utf-8')))
    } catch {
      return { ...EMPTY_PRICE_TABLE, models: {} }
    }
  }

  save(input: unknown): PriceTable {
    const table = validatePriceTable(input)
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(table, null, 2), { mode: 0o600 })
    renameSync(tmp, this.filePath)
    return table
  }
}
