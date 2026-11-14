import { describe, it, expect } from 'vitest'
import {
  createChangeSet,
  reviewItem,
  applyChangeSet,
  revertChangeSet,
  markConflict,
} from '../../src/domain/changeSet'

const at = '2026-11-14T00:00:00.000Z'

function makeSet() {
  return createChangeSet(
    'c1',
    [
      { id: 'i1', path: '/p/a.ts', baseHash: 'b1', afterHash: 'a1', snapshotRef: '/p/a.ts.nf-bak' },
      { id: 'i2', path: '/p/b.ts', baseHash: null, afterHash: 'a2', snapshotRef: null },
    ],
    at,
  )
}

describe('ChangeSet（BC-10）', () => {
  it('create：初始 proposed/pending；每个变更项都有基线字段', () => {
    const s = makeSet()
    expect(s.status).toBe('proposed')
    expect(s.items.map((i) => i.status)).toEqual(['pending', 'pending'])
    expect(s.items[0].baseHash).toBe('b1')
  })

  it('review：批准/拒绝记录；未审核项不得应用', () => {
    const s = makeSet()
    const reviewed = reviewItem(s, 'i1', 'approved')
    expect(reviewed.items[0].status).toBe('approved')
    expect(() => applyChangeSet(s, { i1: true })).toThrow(/审核/)
    const rejected = reviewItem(s, 'i2', 'rejected', '不需要')
    expect(rejected.items[1].status).toBe('rejected')
  })

  it('apply：只应用已批准项；未应用项保持 approved；结果记录冲突', () => {
    let s = makeSet()
    s = reviewItem(s, 'i1', 'approved')
    s = reviewItem(s, 'i2', 'approved')
    const applied = applyChangeSet(s, { i1: true, i2: true })
    expect(applied.status).toBe('applied')
    expect(applied.items.every((i) => i.status === 'applied')).toBe(true)
    const conflicted = applyChangeSet(s, { i1: true, i2: false })
    expect(conflicted.items[1].status).toBe('conflicted')
    expect(conflicted.status).toBe('conflicted')
  })

  it('markConflict：记录期望/实际哈希', () => {
    const s = makeSet()
    const c = markConflict(reviewItem(s, 'i1', 'approved'), 'i1', 'b1', 'external')
    expect(c.items[0]).toMatchObject({
      status: 'conflicted',
      baseHash: 'b1',
      afterHash: 'external',
    })
    expect(c.status).toBe('conflicted')
  })

  it('revert：已应用项 → reverted；全回滚 → reverted', () => {
    let s = makeSet()
    s = reviewItem(s, 'i1', 'approved')
    s = reviewItem(s, 'i2', 'approved')
    s = applyChangeSet(s, { i1: true, i2: true })
    const reverted = revertChangeSet(s, { i1: true, i2: true })
    expect(reverted.status).toBe('reverted')
    expect(reverted.items.every((i) => i.status === 'reverted')).toBe(true)
  })
})
