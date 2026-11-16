import { describe, it, expect } from 'vitest'
import {
  EMPTY_PRICE_TABLE,
  createUsageEntry,
  summarizeUsage,
  evaluateBudget,
  cacheOutcome,
  type PriceTable,
  type UsageEntry,
} from '../../src/domain/usageLedger'

const table: PriceTable = {
  version: 'test-v1',
  models: {
    'deepseek:deepseek-flash': {
      promptPerMillion: 1,
      completionPerMillion: 2,
      cacheHitPerMillion: 0.2,
    },
  },
}

function entry(partial: Partial<UsageEntry> = {}): UsageEntry {
  return {
    id: 'u1',
    at: '2026-11-14T00:00:00.000Z',
    provider: 'deepseek',
    model: 'deepseek-flash',
    promptTokens: 1_000_000,
    completionTokens: 500_000,
    reasoningTokens: 100_000,
    cacheHitTokens: null,
    cacheMissTokens: null,
    cost: 2,
    priceVersion: 'test-v1',
    ...partial,
  }
}

describe('UsageLedger（BC-12）', () => {
  it('cacheOutcome：命中/未命中/未知可区分', () => {
    expect(cacheOutcome(10, 20)).toBe('hit')
    expect(cacheOutcome(0, 20)).toBe('miss')
    expect(cacheOutcome(null, null)).toBe('unknown')
  })

  it('createUsageEntry：已知价格按 token 计算成本并记录价格版本', () => {
    const e = createUsageEntry(
      {
        id: 'u1',
        at: '2026-11-14T00:00:00.000Z',
        provider: 'deepseek',
        model: 'deepseek-flash',
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        reasoningTokens: 100_000,
        cacheHitTokens: 200_000,
        cacheMissTokens: 800_000,
      },
      table,
    )
    // prompt 非缓存 800k × 1 + 缓存 200k × 0.2 + completion 500k × 2 = 0.8 + 0.04 + 1 = 1.84
    expect(e.cost).toBeCloseTo(1.84, 6)
    expect(e.priceVersion).toBe('test-v1')
    expect(e.cache).toBe('hit')
  })

  it('createUsageEntry：未知模型不按 0 计算', () => {
    const e = createUsageEntry(
      {
        id: 'u2',
        at: '2026-11-14T00:00:00.000Z',
        provider: 'unknown',
        model: 'm',
        promptTokens: 10,
        completionTokens: 20,
        reasoningTokens: 0,
        cacheHitTokens: null,
        cacheMissTokens: null,
      },
      EMPTY_PRICE_TABLE,
    )
    expect(e.cost).toBeNull()
    expect(e.priceVersion).toBe(EMPTY_PRICE_TABLE.version)
  })

  it('summarizeUsage：聚合 token、成本与未知成本条目', () => {
    const s = summarizeUsage([
      entry({ id: 'a', cost: 2 }),
      entry({ id: 'b', cost: 1, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }),
      entry({ id: 'c', cost: null }),
    ])
    expect(s.entries).toBe(3)
    expect(s.promptTokens).toBe(2_000_000)
    expect(s.completionTokens).toBe(1_000_000)
    expect(s.cost).toBe(3)
    expect(s.unknownCostEntries).toBe(1)
  })

  it('evaluateBudget：无预算不限制；达到阈值标记 reached', () => {
    const s = summarizeUsage([entry()])
    expect(evaluateBudget(s, null)).toEqual({ limit: null, spent: 2, reached: false })
    const b = evaluateBudget(s, 1)
    expect(b.reached).toBe(true)
    expect(b.limit).toBe(1)
  })
})
