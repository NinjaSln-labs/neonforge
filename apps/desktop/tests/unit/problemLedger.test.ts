import { describe, it, expect } from 'vitest'
import {
  activeProblems,
  mergeProblemLedgers,
  normalizeProblemLedger,
  type LedgerProblem,
} from '../../src/domain/problemLedger'

function p(over: Partial<LedgerProblem> & { id: string }): LedgerProblem {
  return {
    title: over.title ?? '问题 ' + over.id,
    status: 'executing',
    updatedAt: '10:00',
    updatedAtIso: '2026-11-17T10:00:00.000Z',
    revision: 1,
    ...over,
    id: over.id,
  }
}

describe('problemLedger 合并（ADR-018）', () => {
  it('revision 高者胜', () => {
    const r = mergeProblemLedgers(
      [p({ id: 'a', revision: 3, title: '本地' })],
      [p({ id: 'a', revision: 2, title: '远端' })],
      'device-a',
      'device-b',
    )
    expect(r.problems[0]?.title).toBe('本地')
    expect(r.conflicts).toHaveLength(1)
  })

  it('同 revision → updatedAt 晚者胜', () => {
    const r = mergeProblemLedgers(
      [p({ id: 'a', revision: 2, updatedAtIso: '2026-11-17T10:00:00.000Z' })],
      [p({ id: 'a', revision: 2, updatedAtIso: '2026-11-17T11:00:00.000Z', title: '新' })],
      'device-a',
      'device-b',
    )
    expect(r.problems[0]?.title).toBe('新')
  })

  it('同 revision/时间 → deviceId 字典序大者胜（确定性）', () => {
    const r = mergeProblemLedgers(
      [p({ id: 'a', revision: 2, title: 'A' })],
      [p({ id: 'a', revision: 2, title: 'B' })],
      'device-a',
      'device-b',
    )
    expect(r.problems[0]?.title).toBe('B')
    expect(r.conflicts[0]?.winner).toBe('remote')
  })

  it('tombstone 不复活：删除优先于任意活动版本', () => {
    const r = mergeProblemLedgers(
      [p({ id: 'a', revision: 1 })],
      [p({ id: 'a', revision: 99, deletedAt: '2026-11-17T12:00:00.000Z' })],
      'device-a',
      'device-b',
    )
    expect(r.problems[0]?.deletedAt).toBeTruthy()
    expect(activeProblems(r.problems)).toHaveLength(0)
  })

  it('一方独有保留；结果活动条目上限 20', () => {
    const local = Array.from({ length: 21 }, (_, i) =>
      p({ id: `l${i}`, updatedAtIso: `2026-11-17T10:${String(i).padStart(2, '0')}:00.000Z` }),
    )
    const r = mergeProblemLedgers(
      local,
      [p({ id: 'remote', updatedAtIso: '2026-11-18T10:00:00.000Z' })],
      'a',
      'b',
    )
    expect(activeProblems(r.problems)).toHaveLength(20)
    expect(r.problems.some((x) => x.id === 'remote')).toBe(true)
  })
})

describe('problemLedger 规范化', () => {
  it('跳过非法项/重复 id；非法 status 拒绝', () => {
    const list = normalizeProblemLedger([
      { id: 'a', title: 'A', status: 'executing', updatedAt: '10:00' },
      { id: 'a', title: 'dup', status: 'executing', updatedAt: '10:00' },
      { id: 'b', title: '', status: 'executing', updatedAt: '10:00' },
      { id: 'c', title: 'C', status: 'bogus', updatedAt: '10:00' },
      null,
    ])
    expect(list.map((x) => x.id)).toEqual(['a'])
  })

  it('snapshot 白名单：授权项缺字段丢弃；数组仅保留非空字符串', () => {
    const [x] = normalizeProblemLedger([
      {
        id: 'a',
        title: 'A',
        status: 'closed',
        updatedAt: '10:00',
        snapshot: {
          goal: 'g',
          decisions: ['d', '', 3],
          authorized: [{ tool: 'write', file: '/a' }, { tool: 'x' }, null],
          pending: ['p'],
        },
      },
    ])
    expect(x?.snapshot).toEqual({
      goal: 'g',
      decisions: ['d'],
      authorized: [{ tool: 'write', file: '/a' }],
      pending: ['p'],
    })
  })
})
