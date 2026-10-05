import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// append 单一写者闸（详设 §8 I-2/S-1 承载）：TimelineLog.record / new TimelineLog 只允许出现在
// 聚合定义（timeline.ts）与机制口（repos/memory/timelineRepo.ts）；其余任何文件直连＝回流违例。

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '../../src')

const ALLOWED = [
  path.join(SRC, 'domain/timeline.ts'),
  path.join(SRC, 'domain/repos/memory/timelineRepo.ts'),
]

function collect(root: string): string[] {
  if (!existsSync(root)) return []
  if (statSync(root).isFile()) return /\.(ts|tsx)$/.test(root) ? [root] : []
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => collect(path.join(root, e.name)))
}

describe('append 单一写者（I-2/S-1）', () => {
  it('record/构造 仅经聚合与机制口，非 append 路径命中＝0', () => {
    const hits: string[] = []
    for (const f of collect(SRC)) {
      if (ALLOWED.includes(f)) continue
      const src = readFileSync(f, 'utf-8')
      if (/\.record\(/.test(src) || /new TimelineLog\b/.test(src)) hits.push(path.relative(SRC, f))
    }
    expect(hits).toEqual([])
  })

  it('机制口确在允许清单内且引用了 record（防闸因文件移位而空跑）', () => {
    const repo = readFileSync(path.join(SRC, 'domain/repos/memory/timelineRepo.ts'), 'utf-8')
    expect(/\.record\(/.test(repo)).toBe(true)
  })
})
