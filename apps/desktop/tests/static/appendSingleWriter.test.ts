import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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

// append 单一写者闸（详设 §8 I-2/S-1 承载）：TimelineLog.record / new TimelineLog 只允许出现在
// 聚合定义（timeline.ts）与机制口（repos/memory/timelineRepo.ts）；其余任何文件直连＝回流违例。
// 判据面：直连＝「文中具名 TimelineLog（导入绑定或类型标注）∧ 出现 .record(」，或 new TimelineLog。
// 单看 `.record(` 会把别的聚合同名命令（EvidenceItem.record，Task 14 实证）误判为违例，故加具名条件。
// ponytail: 天花板＝具名文本面——别名导入（import { TimelineLog as TL }）再 new、或不具名持实例再
// record 均不命中（异构审计 N2 实测：TimelineLog 构造器是默认的公开构造器，注释原写「私有构造器已挡
// new」与代码不符，已改）。当场收口需给构造器加机制口专用 token；全量依赖图面随 S-1 全量（S6）。
function singleWriterHit(src: string): boolean {
  if (/new\s+TimelineLog\b/.test(src)) return true
  return /\bTimelineLog\b/.test(src) && /\.record\(/.test(src)
}

describe('append 单一写者（I-2/S-1）', () => {
  it('record/构造 仅经聚合与机制口，非 append 路径命中＝0', () => {
    const hits: string[] = []
    for (const f of collect(SRC)) {
      if (ALLOWED.includes(f)) continue
      if (singleWriterHit(readFileSync(f, 'utf-8'))) hits.push(path.relative(SRC, f))
    }
    expect(hits).toEqual([])
  })

  it('判据可红自证（A5.2 同族）：直连判红、异聚合同名命令不判红', () => {
    expect(singleWriterHit(`import { TimelineLog } from '../timeline.js'\nlog.record(e)`)).toBe(
      true,
    )
    expect(singleWriterHit(`const log = new TimelineLog()`)).toBe(true)
    expect(singleWriterHit(`EvidenceItem.record({ evidenceId })`)).toBe(false)
    expect(singleWriterHit(`timeline.append({ ts, type })`)).toBe(false)
  })

  it('机制口确在允许清单内且被判据认出（防闸因文件移位或判据漂移而空跑）', () => {
    const repo = readFileSync(path.join(SRC, 'domain/repos/memory/timelineRepo.ts'), 'utf-8')
    expect(singleWriterHit(repo)).toBe(true)
  })
})
