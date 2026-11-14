// BC-12 用量与成本（目标态实现）：纯领域逻辑——计量、成本、汇总、预算。
// 关键不变量（I19）：
// - 只接受 Provider 真实 usage；缺失字段记 unknown，不以字符数伪装。
// - 条目不可变；成本未知时 cost=null，不按 0 计算。
// - 台账条目不包含 prompt 内容/密钥（本模块只接收计量字段）。
// 价格表默认空：价格是易变的外部事实，未配置时诚实返回 unknown，而不是编造单价。

export type CacheOutcome = 'hit' | 'miss' | 'unknown'

export interface PriceRule {
  promptPerMillion: number
  completionPerMillion: number
  /** 缓存命中的 prompt token 单价（缺省沿用 promptPerMillion） */
  cacheHitPerMillion?: number
}

export interface PriceTable {
  version: string
  /** key = `${provider}:${model}`（lowercase） */
  models: Record<string, PriceRule>
}

export const EMPTY_PRICE_TABLE: PriceTable = { version: 'unconfigured-v1', models: {} }

export interface UsageInput {
  id: string
  at: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  cacheHitTokens: number | null
  cacheMissTokens: number | null
  sessionId?: string
  taskId?: string
}

export interface UsageEntry extends UsageInput {
  cache: CacheOutcome
  /** null = 价格未知（不得当作 0） */
  cost: number | null
  priceVersion: string
}

export interface UsageSummary {
  entries: number
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  /** 已知成本之和；未知成本条目不计入 */
  cost: number
  unknownCostEntries: number
  /** 0-1；无缓存信息时为 null */
  cacheHitRate: number | null
}

export interface BudgetState {
  limit: number | null
  spent: number
  reached: boolean
}

export function cacheOutcome(hitTokens: number | null, missTokens: number | null): CacheOutcome {
  if (hitTokens === null && missTokens === null) return 'unknown'
  if ((hitTokens ?? 0) > 0) return 'hit'
  if ((missTokens ?? 0) > 0) return 'miss'
  return 'unknown'
}

function priceKey(provider: string, model: string): string {
  return `${provider}:${model}`.toLowerCase()
}

function computeCost(input: UsageInput, table: PriceTable): number | null {
  const rule = table.models[priceKey(input.provider, input.model)]
  if (!rule) return null
  const hit = Math.max(0, input.cacheHitTokens ?? 0)
  const promptUncached = Math.max(0, input.promptTokens - hit)
  const promptRate = rule.promptPerMillion / 1_000_000
  const cacheRate = (rule.cacheHitPerMillion ?? rule.promptPerMillion) / 1_000_000
  const completionRate = rule.completionPerMillion / 1_000_000
  return (
    promptUncached * promptRate +
    hit * cacheRate +
    Math.max(0, input.completionTokens) * completionRate
  )
}

export function createUsageEntry(input: UsageInput, table: PriceTable = EMPTY_PRICE_TABLE): UsageEntry {
  return {
    ...input,
    promptTokens: Math.max(0, Math.floor(input.promptTokens)),
    completionTokens: Math.max(0, Math.floor(input.completionTokens)),
    reasoningTokens: Math.max(0, Math.floor(input.reasoningTokens)),
    cache: cacheOutcome(input.cacheHitTokens, input.cacheMissTokens),
    cost: computeCost(input, table),
    priceVersion: table.version,
  }
}

export function summarizeUsage(entries: readonly UsageEntry[]): UsageSummary {
  let promptTokens = 0
  let completionTokens = 0
  let reasoningTokens = 0
  let cost = 0
  let unknownCostEntries = 0
  let cacheKnown = 0
  let cacheHits = 0
  for (const e of entries) {
    promptTokens += e.promptTokens
    completionTokens += e.completionTokens
    reasoningTokens += e.reasoningTokens
    if (e.cost === null) unknownCostEntries++
    else cost += e.cost
    if (e.cache !== 'unknown') {
      cacheKnown++
      if (e.cache === 'hit') cacheHits++
    }
  }
  return {
    entries: entries.length,
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens: promptTokens + completionTokens + reasoningTokens,
    cost,
    unknownCostEntries,
    cacheHitRate: cacheKnown === 0 ? null : cacheHits / cacheKnown,
  }
}

export function evaluateBudget(summary: UsageSummary, limit: number | null | undefined): BudgetState {
  if (limit === null || limit === undefined || limit < 0) {
    return { limit: null, spent: summary.cost, reached: false }
  }
  return { limit, spent: summary.cost, reached: summary.cost >= limit }
}
