import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { context } from '../../src/main/context'

const TMP = '/tmp/nf-unit-context'

describe('ContextEngine.resolve（@引用文件 → 精准上下文片段）', () => {
  beforeEach(() => {
    mkdirSync(`${TMP}/src`, { recursive: true })
    writeFileSync(`${TMP}/package.json`, '{\n  "name": "demo"\n}\n')
    writeFileSync(`${TMP}/src/a.ts`, 'export const a = 1\n'.repeat(200)) // 200 行——触发截断
    writeFileSync(`${TMP}/src/b.ts`, 'export const b = 2\n')
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('相对路径 @引用（rootPath 基准）→ 读取片段', () => {
    const r = context.resolve(TMP, ['src/b.ts'])
    expect(r.fragments).toHaveLength(1)
    expect(r.fragments[0].path).toBe(`${TMP}/src/b.ts`)
    expect(r.fragments[0].content).toContain('export const b = 2')
    expect(r.fragments[0].truncated).toBe(false)
  })

  it('无扩展名 @引用 → 尝试常见后缀', () => {
    const r = context.resolve(TMP, ['src/a'])
    expect(r.fragments).toHaveLength(1)
    expect(r.fragments[0].path).toBe(`${TMP}/src/a.ts`)
  })

  it('绝对路径直接用（真实存在）', () => {
    const r = context.resolve(TMP, [`${TMP}/package.json`])
    expect(r.fragments).toHaveLength(1)
    expect(r.fragments[0].content).toContain('name')
  })

  it('超过 150 行 → truncated 标记', () => {
    const r = context.resolve(TMP, ['src/a.ts'])
    expect(r.fragments[0].truncated).toBe(true)
    expect(r.fragments[0].content.split('\n')).toHaveLength(150)
  })

  it('缺失/不可读文件 → 跳过', () => {
    const r = context.resolve(TMP, ['src/missing.ts', 'nope/x.ts'])
    expect(r.fragments).toHaveLength(0)
  })

  it('超过 5 文件上限 → 截取前 5', () => {
    for (let i = 0; i < 7; i++) writeFileSync(`${TMP}/f${i}.ts`, `// f${i}\n`)
    const r = context.resolve(TMP, ['f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts'])
    expect(r.fragments).toHaveLength(5)
  })
})
