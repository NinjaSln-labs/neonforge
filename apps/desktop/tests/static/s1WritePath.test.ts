import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// S-1 写路径闸（段3 S-1／详设 §8 M-04／stage-spec D1）：呈现投影与度量采点不得直接引用聚合写命令面与写服务面。
// 射程＝呈现面（src/renderer/**）＋只读投影面（src/domain/projection/**）。
// src/main/** 不在射程＝详设 §7 明文「main 持领域单例」——wiring 侧（domainRuntime／ipc）本就须引用聚合与
// 服务，把它列进来会把 §7 自己的接线判成违例（S1a 期无 wiring 文件故未暴露；S1b Task 1 建 domainRuntime 时现形）。
// 与 eslint flat 的 renderer 分块同射程（CC-07：真判据以本测为准，flat 只作即时红示意）。
// 禁列＝src/domain/{delegation,turn,queue,evidence,authorization,service}/** ＋ src/domain/repos/memory/**；
// 允许＝src/domain/timeline.ts 只读类型与 projection/ 读模型（timeline 追加唯一机制口的守卫见
// tests/static/appendSingleWriter.test.ts，本闸不重复计数）。

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(HERE, '../..')
const SCAN_ROOTS = [path.join(DESKTOP, 'src/renderer'), path.join(DESKTOP, 'src/domain/projection')]

const FORBIDDEN = [
  /domain\/(?:delegation|turn|queue|evidence|authorization|service)\//,
  /domain\/repos\/memory\//,
]

// 静态 from、副作用 import 'x'、动态 import('x')、require('x') 四类说明符同源提取。
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
}
function s1HitsIn(source: string): string[] {
  return importSpecifiers(source).filter((spec) => FORBIDDEN.some((re) => re.test(spec)))
}
function collect(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? collect(path.join(root, e.name))
      : /\.(ts|tsx)$/.test(e.name)
        ? [path.join(root, e.name)]
        : [],
  )
}

describe('S-1 呈现/度量写路径闸（D1）', () => {
  const files = SCAN_ROOTS.flatMap(collect)

  it('扫描面非空（防目录移位后空跑）', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('呈现/度量 import 面零命中聚合写命令与写服务面（主断言）', () => {
    const hits: string[] = []
    for (const f of files)
      for (const spec of s1HitsIn(readFileSync(f, 'utf-8')))
        hits.push(`${path.relative(DESKTOP, f)} → ${spec}`)
    expect(hits).toEqual([])
  })

  it('可红自证（M-06，同 A5.2 纪律）：违例 import 判红、合法只读面不判红', () => {
    expect(
      s1HitsIn(`import { Delegation } from '../../src/domain/delegation/Delegation.js'`),
    ).toEqual(['../../src/domain/delegation/Delegation.js'])
    expect(s1HitsIn(`import { applyChange } from '../domain/service/applyChange.js'`)).toEqual([
      '../domain/service/applyChange.js',
    ])
    expect(
      s1HitsIn(`import { InMemoryTimelineRepo } from '../domain/repos/memory/timelineRepo.js'`),
    ).toEqual(['../domain/repos/memory/timelineRepo.js'])
    // N4（异构审计 2026-10-05）：动态 import 与 require 同面——只匹配静态 from 则此形逃闸
    expect(
      s1HitsIn(
        `const m = await import('../domain/delegation/Delegation.js'); require('../domain/service/applyChange.js')`,
      ),
    ).toEqual(['../domain/delegation/Delegation.js', '../domain/service/applyChange.js'])
    // 反例：呈现侧允许的只读面
    expect(s1HitsIn(`import { deriveFocus } from '../domain/projection/focus.js'`)).toEqual([])
    expect(s1HitsIn(`import type { TimelineEvent } from '../domain/timeline.js'`)).toEqual([])
  })
})
