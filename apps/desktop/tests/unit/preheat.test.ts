import { describe, it, expect } from 'vitest'
import { buildStandardPrefix, estimateTokens, PrefixCache } from '../../src/main/preheat'

describe('StandardPrefix 构建（ticket 09——确定性零 token 成本）', () => {
  it('结构：含叙述/工具/文件树 + 同输入同 hash', () => {
    const p1 = buildStandardPrefix('/proj', ['a.ts', 'b.ts'])
    const p2 = buildStandardPrefix('/proj', ['a.ts', 'b.ts'])
    expect(p1.text).toContain('NeonForge 搭档')
    expect(p1.text).toContain('read')
    expect(p1.text).toContain('a.ts')
    expect(p1.hash).toBe(p2.hash)
    expect(p1.tokens).toBeGreaterThan(0)
    expect(p1.builtAt).toBeTruthy()
  })

  it('文件变化 → hash 变（PrefixCache 重建触发）', () => {
    const p1 = buildStandardPrefix('/proj', ['a.ts'])
    const p2 = buildStandardPrefix('/proj', ['a.ts', 'new.ts'])
    expect(p1.hash).not.toBe(p2.hash)
  })

  it('文件树摘要：超 30 条截断标注', () => {
    const many = Array.from({ length: 40 }, (_, i) => `f${i}.ts`)
    const p = buildStandardPrefix('/proj', many)
    expect(p.text).toContain('共 40 个文件')
  })

  it('estimateTokens：空 0 / 非空 >0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('你好世界')).toBeGreaterThan(0)
  })
})

describe('PrefixCache（Append-Only + hash 检测——≥90% 命中目标）', () => {
  it('首次 ensure → miss（重建）+ hash 记录', () => {
    const c = new PrefixCache()
    const p = buildStandardPrefix('/p', ['a.ts'])
    const r = c.ensure(p)
    expect(r.hit).toBe(false)
    expect(r.state.hash).toBe(p.hash)
    expect(r.state.history).toHaveLength(1)
  })

  it('相同前缀 → hit（不重建）+ history 追加', () => {
    const c = new PrefixCache()
    const p = buildStandardPrefix('/p', ['a.ts'])
    c.ensure(p)
    const r2 = c.ensure(p)
    expect(r2.hit).toBe(true)
    expect(r2.state.history).toHaveLength(2)
    expect(r2.state.history.every((h) => h.hash === p.hash)).toBe(true)
  })

  it('前缀变化 → miss + 重建（append-only 保留历史）', () => {
    const c = new PrefixCache()
    c.ensure(buildStandardPrefix('/p', ['a.ts']))
    const r2 = c.ensure(buildStandardPrefix('/p', ['a.ts', 'b.ts']))
    expect(r2.hit).toBe(false)
    expect(r2.state.standardPrefix).toContain('b.ts')
    expect(r2.state.history).toHaveLength(2)
    expect(r2.state.history[0].hit).toBe(false)
  })
})
