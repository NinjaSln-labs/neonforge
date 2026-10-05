import { describe, it, expect } from 'vitest'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import type { AppendInput } from '../../src/domain/timeline'

const ev = (delegationId: string): AppendInput => ({
  ts: '2026-01-01T00:00:00.000Z',
  delegationId,
  type: 'TurnStarted',
  detail: { turnId: 't1', delegationId, triggerSource: '用户输入' },
})

describe('TimelineRepo.append（B3/C14 单一写者同事务）', () => {
  it('顺序追加 seq＝[1,2,3…] 单调、无重号无跳号', () => {
    const repo = new InMemoryTimelineRepo()
    repo.append(ev('d1'))
    repo.append(ev('d2'))
    repo.append(ev('d1'))
    expect(repo.since(1).map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('同事务失败⇒回滚（tx throw 时该条不入账、游标复位）', () => {
    const repo = new InMemoryTimelineRepo()
    repo.append(ev('a'))
    expect(() =>
      repo.append(ev('b'), () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    // b 被回滚，仅剩 a
    expect(repo.since(1).map((e) => e.seq)).toEqual([1])
    // 下一条续接 seq 2（回滚彻底，未留跳号）
    repo.append(ev('c'))
    expect(repo.since(1).map((e) => e.seq)).toEqual([1, 2])
  })

  it('findByDelegation 按委托过滤', () => {
    const repo = new InMemoryTimelineRepo()
    repo.append(ev('d1'))
    repo.append(ev('d2'))
    repo.append(ev('d1'))
    const d1 = repo.findByDelegation('d1')
    expect(d1.map((e) => e.seq)).toEqual([1, 3])
    expect(d1.every((e) => e.delegationId === 'd1')).toBe(true)
  })

  it('since(seq) 从给定 seq 起返回', () => {
    const repo = new InMemoryTimelineRepo()
    repo.append(ev('x'))
    repo.append(ev('x'))
    expect(repo.since(2).map((e) => e.seq)).toEqual([2])
  })
})
