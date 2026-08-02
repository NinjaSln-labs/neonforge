import { describe, it, expect } from 'vitest'
import { decideCompact, compactHint, compaction, estimateTokens, COMPACT_MSG_LIMIT, COMPACT_KEEP_RECENT } from '../../src/main/compact'

describe('decideCompact（策略层——既有）', () => {
  it('未超阈值 → 不压缩', () => {
    expect(decideCompact(10)).toEqual({ shouldCompact: false, keep: 10, drop: 0 })
  })

  it('超阈值（24）→ 压缩保留 12', () => {
    expect(decideCompact(30)).toEqual({ shouldCompact: true, keep: 12, drop: 18 })
  })

  it('compactHint：超阈值给提示文案', () => {
    expect(compactHint(30)).toContain('压缩前 18 条')
    expect(compactHint(10)).toBeNull()
  })
})

describe('CompactionService（ticket 11 真实摘要接入）', () => {
  const hist = (n: number): Array<{ role: string; content: string | null }> =>
    Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `消息 ${i}` }))

  it('shouldCompact：消息数 >100 触发', () => {
    expect(compaction.shouldCompact(hist(50))).toBe(false)
    expect(compaction.shouldCompact(hist(120))).toBe(true)
  })

  it('shouldCompact：字符量 >200K 触发（tokens 近似）', () => {
    const long = Array.from({ length: 30 }, () => ({ role: 'user' as const, content: '字'.repeat(8000) }))
    expect(estimateTokens(long)).toBeGreaterThan(200 * 1000)
    expect(compaction.shouldCompact(long)).toBe(true)
  })

  it('compact：历史不足 20 条 → 拒绝', async () => {
    const r = await compaction.compact('key', async () => ({ ok: true, summary: 's' }), hist(10))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('无需压缩')
  })

  it('compact：成功 → 摘要 + 保留最近 20 条原始', async () => {
    const r = await compaction.compact('key', async () => ({ ok: true, summary: '对话摘要：解决了 X' }), hist(50))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary).toContain('对话摘要')
      expect(r.kept).toHaveLength(COMPACT_KEEP_RECENT)
      expect(r.kept[0].content).toBe('消息 30') // 保留最近 20 条（从 index 30 起）
    }
  })

  it('compact：summarize 失败 → 透传错误（降级不阻塞）', async () => {
    const r = await compaction.compact('key', async () => ({ ok: false, error: 'network' }), hist(50))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('network')
  })
})
