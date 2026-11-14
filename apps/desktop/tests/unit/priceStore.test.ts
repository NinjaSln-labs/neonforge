import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PriceStore, validatePriceTable } from '../../src/main/priceStore'
import { createUsageEntry } from '../../src/domain/usageLedger'

let dir = ''
let store: PriceStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-price-'))
  store = new PriceStore(path.join(dir, 'prices.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('PriceStore（BC-12 价格表）', () => {
  it('校验/保存/读取：provider:model 键 + 非负单价', () => {
    const table = validatePriceTable({
      version: 'v1',
      models: { 'deepseek:deepseek-chat': { promptPerMillion: 0.14, completionPerMillion: 0.28 } },
    })
    expect(table.models['deepseek:deepseek-chat'].promptPerMillion).toBe(0.14)
    expect(() => validatePriceTable({ models: { bad: { promptPerMillion: 1 } } })).toThrow(
      /provider:model/,
    )
    expect(() =>
      validatePriceTable({
        models: { 'a:b': { promptPerMillion: -1, completionPerMillion: 1 } },
      }),
    ).toThrow(/非负/)
    store.save(table)
    expect(store.load().version).toBe('v1')
  })

  it('未配置/损坏 → 空表（成本 unknown）', () => {
    expect(store.load().models).toEqual({})
  })

  it('价格表参与计量：命中模型 → 数值成本；未命中 → null', () => {
    const table = store.save({
      version: 'v2',
      models: { 'p:m': { promptPerMillion: 1, completionPerMillion: 2 } },
    })
    const entry = createUsageEntry(
      {
        id: 'u1',
        at: '2026-11-14T00:00:00.000Z',
        provider: 'p',
        model: 'm',
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        reasoningTokens: 0,
        cacheHitTokens: null,
        cacheMissTokens: null,
      },
      table,
    )
    expect(entry.cost).toBe(3)
    const unknown = createUsageEntry(
      {
        id: 'u2',
        at: '2026-11-14T00:00:00.000Z',
        provider: 'p',
        model: 'nope',
        promptTokens: 1,
        completionTokens: 1,
        reasoningTokens: 0,
        cacheHitTokens: null,
        cacheMissTokens: null,
      },
      table,
    )
    expect(unknown.cost).toBeNull()
  })
})
