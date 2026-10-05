import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// G-1 归档防回流闸（stage-spec A5.1 / 详设 §8）：新领域树不得 import 归档面。
// 归档面名单＝唯一源 stage-spec DoD A2.1（旧领域）＋A2.2（旧呈现 24）＋A2.5（旧 main 时间线），
// 本测从 stage-spec 现场解析、不复制字面（防第二源漂移）。
// S1a 扫描范围＝新领域树子目录 + src/domain/timeline.ts（renderer 新六件归 S1b）。

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

// S1a 新领域树扫描根（详设 §1 切分）；不存在的目录跳过。
const SCAN_ROOTS = [
  path.join(DESKTOP, 'src/domain/timeline.ts'),
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
  ].map((d) => path.join(DESKTOP, 'src/domain', d)),
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

  it('新领域树零 import 归档面（主断言）', () => {
    const scanned = SCAN_ROOTS.flatMap(collect)
    expect(scanned.length).toBeGreaterThan(10) // 空跑守卫（N7：目录整体缺位不得静默放行）
    const hits: string[] = []
    for (const f of scanned) hits.push(...legacyImportsIn(readFileSync(f, 'utf-8'), legacy))
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
