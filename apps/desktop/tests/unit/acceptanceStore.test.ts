import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AcceptanceStore } from '../../src/main/acceptanceStore'

const TMP = '/tmp/nf-unit-acceptance'

describe('AcceptanceStore（BC-14 持久化）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('derive/list/mark/evaluate：跨调用保持记录', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    const r = store.derive('s1', ['npm test 通过', '页面可打开'], 'plan-verification')
    expect(store.get('s1')?.items).toHaveLength(2)
    store.mark('s1', 'item-1', 'passed', { evidenceRef: 'verification:npm test' })
    store.mark('s1', 'item-2', 'passed', { manualReason: '用户目视确认' })
    expect(store.evaluate('s1')?.verdict).toBe('passed')
    expect(r.id).toBe('s1')
  })

  it('无来源 → incomplete；acceptEmpty 生成带理由的豁免 → passed-with-waivers', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    store.derive('s2', [], 'plan-verification')
    expect(store.evaluate('s2')?.verdict).toBe('incomplete')
    store.acceptEmpty('s2')
    const gate = store.evaluate('s2')
    expect(gate?.verdict).toBe('passed-with-waivers')
    expect(gate?.waived).toContain('item-1')
  })

  it('损坏文件 → 空记录，不阻断', () => {
    const file = path.join(TMP, 'acceptance.json')
    writeFileSync(file, 'not-json')
    const store = new AcceptanceStore(file)
    expect(store.get('s1')).toBeNull()
    expect(() => store.derive('s1', ['a'], 'manual')).not.toThrow()
  })

  it('clear：任务边界清理记录', () => {
    const store = new AcceptanceStore(path.join(TMP, 'acceptance.json'))
    store.derive('s1', ['a'], 'manual')
    store.clear('s1')
    expect(store.get('s1')).toBeNull()
  })
})
