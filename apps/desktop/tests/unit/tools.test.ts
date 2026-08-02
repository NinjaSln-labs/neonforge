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
})
