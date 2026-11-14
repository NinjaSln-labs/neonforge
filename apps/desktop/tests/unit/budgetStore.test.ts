import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BudgetStore, validateBudgetSettings } from '../../src/main/budgetStore'

let dir = ''
let file = ''
let store: BudgetStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-budget-'))
  file = path.join(dir, 'budget.json')
  store = new BudgetStore(file)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('BudgetStore（BC-12）', () => {
  it('默认未设置；保存/读取阈值与暂停开关', () => {
    expect(store.load()).toEqual({ limitUsd: null, pauseOnReach: false })
    expect(store.save({ limitUsd: 5, pauseOnReach: true })).toEqual({
      limitUsd: 5,
      pauseOnReach: true,
    })
    expect(store.load()).toEqual({ limitUsd: 5, pauseOnReach: true })
  })

  it('校验：负数/非数字拒绝；null 允许；损坏文件回退默认', () => {
    expect(() => validateBudgetSettings({ limitUsd: -1 })).toThrow(/非负/)
    expect(() => validateBudgetSettings({ limitUsd: 'abc' })).toThrow(/非负/)
    expect(validateBudgetSettings({ limitUsd: null })).toEqual({
      limitUsd: null,
      pauseOnReach: false,
    })
    writeFileSync(file, '{bad', { mode: 0o600 })
    expect(store.load()).toEqual({ limitUsd: null, pauseOnReach: false })
  })
})
