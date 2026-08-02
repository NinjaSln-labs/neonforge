import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { initTools, toolRegistry, revertToolFile } from '../../src/main/tools'

const TMP = '/tmp/nf-unit-tools'

describe('ToolRegistry 真实执行安全闭环（L3 授权 + 先备份后写 + 回滚）', () => {
  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    initTools()
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('write：未授权拒绝（L3）——不写文件', async () => {
    const file = path.join(TMP, 'a.txt')
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('授权')
    expect(existsSync(file)).toBe(false)
  })

  it('write：授权后写文件 + 写前快照 .nf-bak + 回滚恢复原样', async () => {
    const file = path.join(TMP, 'b.txt')
    writeFileSync(file, 'old-content\n', 'utf-8')
    const r = await toolRegistry.execute('write', { path: file, content: 'new-content\n' }, { approved: true })
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('new-content\n')
    expect(existsSync(file + '.nf-bak')).toBe(true)
    const rv = revertToolFile(file)
    expect(rv.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('old-content\n')
  })

  it('edit：替换 + 写前快照 + 回滚', async () => {
    const file = path.join(TMP, 'c.txt')
    writeFileSync(file, 'alpha\nbeta\n', 'utf-8')
    const r = await toolRegistry.execute('edit', { path: file, old: 'beta', new: 'BETA' }, { approved: true })
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nBETA\n')
    expect(existsSync(file + '.nf-bak')).toBe(true)
    const rv = revertToolFile(file)
    expect(rv.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nbeta\n')
  })

  it('read：只读无需授权（L1）', async () => {
    const file = path.join(TMP, 'd.txt')
    writeFileSync(file, 'hello', 'utf-8')
    const r = await toolRegistry.execute('read', { path: file }, {})
    expect(r.ok).toBe(true)
    expect(r.data).toBe('hello')
  })

  it('回滚：无快照 → 错误提示（新写入文件无可恢复内容）', async () => {
    const file = path.join(TMP, 'e.txt')
    const r = revertToolFile(file)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('无快照')
  })

  it('search：关键词检索（Layer2 CodeRAG——agentic grep 模式）返回命中+行号+片段', async () => {
    const src = path.join(TMP, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(path.join(src, 'a.ts'), 'export function greet() {}\nconst TODO = 1\n', 'utf-8')
    writeFileSync(path.join(src, 'b.ts'), 'import { greet } from "./a"\n', 'utf-8')
    const r = await toolRegistry.execute('search', { query: 'greet' }, { rootPath: TMP })
    expect(r.ok).toBe(true)
    const hits = (r.data as { hits: Array<{ path: string; line: number; snippet: string }> }).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].path).toContain('a.ts')
    expect(hits[0].line).toBe(1)
    expect(hits[0].snippet).toContain('greet')
  })

  it('search：无 rootPath → 提示无项目；空 query → 无有效关键词', async () => {
    const r1 = await toolRegistry.execute('search', { query: 'x' }, {})
    expect((r1.data as { hits: unknown[]; note?: string }).hits).toEqual([])
    const r2 = await toolRegistry.execute('search', { query: '' }, { rootPath: TMP })
    expect((r2.data as { hits: unknown[]; note?: string }).note).toContain('无有效关键词')
  })
})
