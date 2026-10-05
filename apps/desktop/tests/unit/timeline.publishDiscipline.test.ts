import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import type { AppendInput, AnyPayload } from '../../src/domain/timeline'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TIMELINE_SRC = path.resolve(HERE, '../../src/domain/timeline.ts')

const ev = (delegationId: string): AppendInput => ({
  ts: '2026-01-01T00:00:00.000Z',
  delegationId,
  type: 'TurnStarted',
  detail: {} as unknown as AnyPayload,
})

describe('发布纪律（B4：先落账后分发、对外零发布）', () => {
  it('append 前分发调用＝0，append 成功后收到恰一次', () => {
    const repo = new InMemoryTimelineRepo()
    const seen: number[] = []
    repo.subscribe((e) => seen.push(e.seq))
    expect(seen).toEqual([]) // 未 append ⇒ 无分发
    repo.append(ev('d1'))
    expect(seen).toEqual([1])
  })

  it('同事务失败⇒回滚路径不分发', () => {
    const repo = new InMemoryTimelineRepo()
    const seen: number[] = []
    repo.subscribe((e) => seen.push(e.seq))
    repo.append(ev('a'))
    expect(() =>
      repo.append(ev('b'), () => {
        throw new Error('boom')
      }),
    ).toThrow()
    expect(seen).toEqual([1]) // b 未入账也未分发
    repo.append(ev('c'))
    expect(seen).toEqual([1, 2]) // c 续接 seq 2 并分发
  })

  it('unsubscribe 后停止分发', () => {
    const repo = new InMemoryTimelineRepo()
    const seen: number[] = []
    const off = repo.subscribe((e) => seen.push(e.seq))
    repo.append(ev('x'))
    off()
    repo.append(ev('y'))
    expect(seen).toEqual([1]) // 第二条退订后不再收
  })

  it('对外发布通道＝0（无 process.send/网络/WS）', () => {
    const src = readFileSync(TIMELINE_SRC, 'utf-8')
    expect(src).not.toMatch(/process\.send\b/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/XMLHttpRequest|WebSocket|superagent/)
    expect(src).not.toMatch(/https?:\/\//)
  })
})
