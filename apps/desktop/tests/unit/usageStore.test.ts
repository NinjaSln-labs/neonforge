import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { UsageStore } from '../../src/main/usageStore'
import { createUsageEntry, EMPTY_PRICE_TABLE } from '../../src/domain/usageLedger'

const TMP = '/tmp/nf-unit-usage'

function makeEntry(id: string, sessionId = 's1') {
  return createUsageEntry(
    {
      id,
      at: new Date().toISOString(),
      provider: 'deepseek',
      model: 'deepseek-flash',
      promptTokens: 10,
      completionTokens: 20,
      reasoningTokens: 0,
      cacheHitTokens: null,
      cacheMissTokens: null,
      sessionId,
    },
    EMPTY_PRICE_TABLE,
  )
}

describe('UsageStore（BC-12 持久化）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('record/load：append-only JSONL；损坏行跳过', () => {
    const store = new UsageStore(path.join(TMP, 'usage.jsonl'))
    store.record(makeEntry('a'))
    store.record(makeEntry('b', 's2'))
    expect(store.load()).toHaveLength(2)
    writeFileSync(path.join(TMP, 'usage.jsonl'), 'not-json\n', { flag: 'a' })
    expect(store.load()).toHaveLength(2)
    expect(store.summary('s1').entries).toBe(1)
    expect(store.summary().entries).toBe(2)
  })

  it('export：生成脱敏 CSV（无内容/密钥字段）', () => {
    const store = new UsageStore(path.join(TMP, 'usage.jsonl'))
    store.record(makeEntry('a'))
    const r = store.exportCsv()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(existsSync(r.path)).toBe(true)
    const csv = readFileSync(r.path, 'utf-8')
    expect(csv).toContain('id,at,provider,model')
    expect(csv).toContain('unknown')
    expect(csv).not.toMatch(/prompt|apiKey|secret/i)
  })

  it('空台账：summary 为空且不伪造成本', () => {
    const store = new UsageStore(path.join(TMP, 'none.jsonl'))
    const s = store.summary()
    expect(s.entries).toBe(0)
    expect(s.cost).toBe(0)
    expect(s.unknownCostEntries).toBe(0)
  })
})
