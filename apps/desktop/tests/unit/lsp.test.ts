import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { lsp, extractImports } from '../../src/main/lsp'

const TMP = '/tmp/nf-unit-lsp'

describe('extractImports（本地文本扫描——零成本确定性）', () => {
  it('ESM import 提取（具名/默认/type/副作用）', () => {
    const src = `import React from 'react'\nimport { useState, useEffect } from 'react'\nimport type { FC } from 'react'\nimport './styles.css'\n`
    expect(extractImports(src)).toEqual([
      { from: 'react', names: ['React'] },
      { from: 'react', names: ['useState', 'useEffect'] },
      { from: 'react', names: ['FC'] },
      { from: './styles.css', names: [] }
    ])
  })

  it('空文件 → 空数组', () => {
    expect(extractImports('')).toEqual([])
  })
})

describe('LSP 真实连接（typescript-language-server）', () => {
  beforeAll(async () => {
    // 临时 TS 项目：a.ts 定义 greet，b.ts 引用
    mkdirSync(`${TMP}/src`, { recursive: true })
    writeFileSync(`${TMP}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, module: 'esnext', target: 'es2020', moduleResolution: 'bundler' } }))
    writeFileSync(`${TMP}/src/a.ts`, 'export function greet(name: string): string {\n  return `hi ${name}`\n}\n')
    writeFileSync(`${TMP}/src/b.ts`, "import { greet } from './a'\nconst msg = greet('Neon')\n")
    await lsp.connect(TMP)
  }, 30000)

  afterAll(async () => {
    await lsp.disconnect()
    rmSync(TMP, { recursive: true, force: true })
  })

  it('find_definition：b.ts 引用 greet → 跳到 a.ts 定义行', async () => {
    const r = (await lsp.query('find_definition', { path: `${TMP}/src/b.ts`, line: 1, character: 13 })) as Array<{ uri?: string; range?: { start: { line: number } } }>
    expect(Array.isArray(r)).toBe(true)
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].uri).toContain('a.ts')
    expect(r[0].range?.start.line).toBe(0)
  }, 30000)

  it('get_diagnostics：合法 TS 无错误', async () => {
    const r = (await lsp.query('get_diagnostics', { path: `${TMP}/src/b.ts` })) as unknown[]
    expect(Array.isArray(r)).toBe(true)
  }, 30000)

  it('get_imports：b.ts 提取 import', async () => {
    const r = (await lsp.query('get_imports', { path: `${TMP}/src/b.ts` })) as { imports: Array<{ from: string; names: string[] }> }
    expect(r.imports).toEqual([{ from: './a', names: ['greet'] }])
  }, 30000)
})
