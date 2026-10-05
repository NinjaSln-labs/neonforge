import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import type { AppendInput } from '../../src/domain/timeline'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOMAIN = path.resolve(HERE, '../../src/domain')

// 新域扫描面＝timeline 注册表＋九个新域目录（旧领域文件属归档面，其现况另有 G-1 闸管）。
const SCAN_ROOTS = [
  path.join(DOMAIN, 'timeline.ts'),
  ...[
    'delegation',
    'authorization',
    'turn',
    'queue',
    'evidence',
    'projection',
    'spec',
    'service',
    'repos',
  ].map((d) => path.join(DOMAIN, d)),
]
function collect(root: string): string[] {
  if (!existsSync(root)) return []
  if (statSync(root).isFile()) return [root]
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => collect(path.join(root, e.name)))
}
const files = SCAN_ROOTS.flatMap(collect)

const ev = (delegationId: string): AppendInput => ({
  ts: '2026-01-01T00:00:00.000Z',
  delegationId,
  type: 'TurnStarted',
  detail: { turnId: 't1', delegationId, triggerSource: '用户输入' },
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

  it('对外发布通道＝0（无 process.send/网络/WS），扫描面＝新域全树（N7 扩面）', () => {
    expect(files.length).toBeGreaterThan(10) // 空跑守卫（目录移位即报红，不静默放行）
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      expect(src, f).not.toMatch(/process\.send\b/)
      expect(src, f).not.toMatch(/\bfetch\s*\(/)
      expect(src, f).not.toMatch(/XMLHttpRequest|WebSocket|superagent/)
      expect(src, f).not.toMatch(/https?:\/\//)
    }
  })
})
