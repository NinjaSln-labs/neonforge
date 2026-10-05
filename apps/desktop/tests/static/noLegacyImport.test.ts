import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// G-1 归档防回流闸（stage-spec A5.1／A3 判据载体／详设 §8）：全树 src/** 不得 import 归档面。
// 归档面名单＝唯一源 stage-spec DoD A2.1（旧领域）＋A2.2（旧呈现 24）＋A2.5（旧 main 时间线），
// 本测从 stage-spec 现场解析、不复制字面（防第二源漂移）。
// 射程沿革：S1a＝新领域树；t000096 扩 A3 复用面（main/preload/renderer 三件）；S1b Task 9
// 归档批物理 `git rm` 后扩到 **src/** 全树**（承载 stage-spec A5.1 全树判据，堵覆盖空档）。

const HERE = path.dirname(fileURLToPath(import.meta.url)) // apps/desktop/tests/static
const DESKTOP = path.resolve(HERE, '../..') // apps/desktop
const STAGE_SPEC = path.resolve(
  DESKTOP,
  '../../docs/design/stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md',
)

// 从一段文本里抽 `<name>.ts(x)` 反引号名的基名（去扩展名），兼容 `src/domain/x.ts` 前缀与裸 `X.tsx`。
function basenames(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/`(?:[\w./-]*\/)?(\w+)\.tsx?`/g)) out.push(m[1])
  return out
}

function legacyNameSet(): Set<string> {
  const lines = readFileSync(STAGE_SPEC, 'utf-8').split('\n')
  // 锚到 DoD 勾选项本体（`- [ ] A2.x`），避免被正文里出现的 "A2.5" 之类枚举串误命中。
  const pick = (tag: string) => lines.find((l) => new RegExp(`- \\[ \\] ${tag}\\b`).test(l)) ?? ''
  const names = [...basenames(pick('A2.1')), ...basenames(pick('A2.2')), ...basenames(pick('A2.5'))]
  return new Set(names)
}

// 扫一个源文件文本里的 import 说明符基名是否落在归档面名单。
function legacyImportsIn(source: string, legacy: Set<string>): string[] {
  const hits: string[] = []
  for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const base = path.basename(m[1]).replace(/\.[cm]?[jt]sx?$/, '')
    if (legacy.has(base)) hits.push(m[1])
  }
  return hits
}

// 统一收集 .ts/.tsx：root 可为单文件或目录。
function collect(root: string): string[] {
  if (!existsSync(root)) return []
  if (statSync(root).isFile()) return /\.(ts|tsx)$/.test(root) ? [root] : []
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => collect(path.join(root, e.name)))
}

// src/** 全树扫描根（归档批后旧面已不在树，全树命中＝0 即 A5.1 全树判据）。
const SCAN_ROOTS = [
  path.join(DESKTOP, 'src/domain'),
  path.join(DESKTOP, 'src/main'),
  path.join(DESKTOP, 'src/preload'),
  path.join(DESKTOP, 'src/renderer'),
]

describe('G-1 归档防回流（A5.1）', () => {
  const legacy = legacyNameSet()

  it('名单从 stage-spec 现场解析成功（防解析失效静默放行）', () => {
    expect(legacy.has('conversationState')).toBe(true)
    expect(legacy.has('agentLoop')).toBe(true)
    expect(legacy.has('timelineLogger')).toBe(true)
    expect(legacy.has('ConversationPanel')).toBe(true)
    expect(legacy.size).toBeGreaterThanOrEqual(30) // 5 领域＋24 呈现＋1 时间线
  })

  it('src/** 全树零 import 归档面（主断言，A5.1／A3）', () => {
    const files = SCAN_ROOTS.flatMap(collect)
    // 非空守卫：目录移位＝扫不到文件，不得静默放行
    expect(files.length).toBeGreaterThan(60)
    const hits: string[] = []
    for (const f of files)
      hits.push(
        ...legacyImportsIn(readFileSync(f, 'utf-8'), legacy).map(
          (s) => `${path.relative(DESKTOP, f)} → ${s}`,
        ),
      )
    expect(hits).toEqual([])
  })

  it('可红自证（A5.2）：领域侧＋旧呈现侧各一', () => {
    expect(legacyImportsIn(`import { x } from '../conversationState.js'`, legacy)).toEqual([
      '../conversationState.js',
    ])
    expect(legacyImportsIn(`import Panel from './ConversationPanel'`, legacy)).toEqual([
      './ConversationPanel',
    ])
    // 反例：合法新域互不触发
    expect(legacyImportsIn(`import { TimelineLog } from '../timeline.js'`, legacy)).toEqual([])
  })
})
