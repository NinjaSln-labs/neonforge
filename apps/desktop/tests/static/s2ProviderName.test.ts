import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// S-2 核心域零 provider 专名闸（段3 S-2／详设 §8 L-08／stage-spec D2）。
// 专名清单唯一源＝现 src/main/providers/types.ts 的 ProviderId 字面联合，本测现场解析、不复制字面（防第二源漂移）。
// 扫描面＝src/domain/** 全树（含 S1a 期未归档的旧领域文件，其现况实测零命中，故 S1a 即走全树、不缩范围）。

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(HERE, '../..')
const TYPES = path.join(DESKTOP, 'src/main/providers/types.ts')
const DOMAIN = path.join(DESKTOP, 'src/domain')

// 声明段锚定取联合成员：起始行锚 `^export type <name> =`，吃到续行成员，止于下一顶层声明或空行。
// 两头的坑都踩过：跨行贪婪会把 ModelTier/ThinkingLevel 的字面吞进来＝假清单（p000170）；
// 只取一行则续行成员逃闸＝假清单（异构审计 N5，2026-10-05）。
function unionMembers(src: string, name: string): string[] {
  const lines = src.split('\n')
  const i = lines.findIndex((l) => new RegExp(`^export type ${name}\\s*=`).test(l))
  if (i < 0) return []
  const seg = [lines[i]]
  for (let j = i + 1; j < lines.length && /^\s*\|/.test(lines[j]); j++) seg.push(lines[j])
  return [...seg.join('\n').matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const providerIds = (): string[] => unionMembers(readFileSync(TYPES, 'utf-8'), 'ProviderId')

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
function hitsIn(source: string, names: string[]): string[] {
  const lower = source.toLowerCase()
  return names.filter((n) => lower.includes(n.toLowerCase()))
}

describe('S-2 核心域零 provider 专名（D2）', () => {
  const names = providerIds()

  it('清单从 providers 现存标识现场解析成功（防解析失效静默放行）', () => {
    expect(names.length).toBeGreaterThanOrEqual(4)
    expect(names).toContain('deepseek')
    expect(names).not.toContain('pro') // 逐行锚定生效（防吞相邻类型的字面）
    expect(hitsIn(`// sample provider=opencode-zen`, names)).not.toEqual([])
  })

  it('解析器可证伪：单行与续行两形都取全、相邻类型字面不吞（N5）', () => {
    const one = `export type ProviderId = 'a' | 'b'\n\nexport type ModelTier = 'pro' | 'max'`
    const wrapped = `export type ProviderId = 'a' | 'b'\n  | 'gemini'\n\nexport type ModelTier = 'pro'`
    expect(unionMembers(one, 'ProviderId')).toEqual(['a', 'b'])
    expect(unionMembers(wrapped, 'ProviderId')).toEqual(['a', 'b', 'gemini'])
  })

  it('核心域目录专名命中数＝0（主断言，大小写不敏感）', () => {
    const files = collect(DOMAIN)
    expect(files.length).toBeGreaterThan(10)
    const hits: string[] = []
    for (const f of files)
      for (const n of hitsIn(readFileSync(f, 'utf-8'), names))
        hits.push(`${path.relative(DESKTOP, f)} → ${n}`)
    expect(hits).toEqual([])
  })

  it('可红自证（A5.2 同族）：注入一专名⇒判红，域内中性词⇒不判红', () => {
    expect(hitsIn(`const tier = '${names[0]}' as const`, names)).toEqual([names[0]])
    expect(hitsIn(`const evidenceType = '变更集'`, names)).toEqual([])
  })
})
