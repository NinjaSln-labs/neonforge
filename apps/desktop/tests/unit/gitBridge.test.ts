import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gitBranches, gitDiff, gitLog, gitRead, gitStatus } from '../../src/main/gitBridge'

let root = ''

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' })
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nf-git-'))
  git(['init'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'NF Test'])
  writeFileSync(path.join(root, 'a.txt'), 'one\n')
  git(['add', 'a.txt'])
  git(['commit', '-m', 'first commit'])
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('Git 只读桥（BC-13）', () => {
  it('status：分支/干净；修改后脏', async () => {
    const clean = await gitStatus(root)
    expect(clean.branch).toBeTruthy()
    expect(clean.dirty).toBe(false)
    writeFileSync(path.join(root, 'a.txt'), 'two\n')
    const dirty = await gitStatus(root)
    expect(dirty.dirty).toBe(true)
    expect(dirty.files[0].path).toBe('a.txt')
  })

  it('log：最近提交与字段', async () => {
    const entries = await gitLog(root, 5)
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries[entries.length - 1].subject).toBe('first commit')
  })

  it('diff：路径过滤；项目外路径拒绝', async () => {
    const diff = await gitDiff(root, 'a.txt')
    expect(diff).toContain('-one')
    expect(diff).toContain('+two')
    await expect(() => gitDiff(root, '../../etc/passwd')).rejects.toThrow(/项目内/)
  })

  it('branches：返回当前分支', async () => {
    const branches = await gitBranches(root)
    expect(branches.length).toBeGreaterThanOrEqual(1)
  })

  it('gitRead：未知动作拒绝；非仓库路径报错', async () => {
    await expect(() => gitRead('commit', root)).rejects.toThrow(/不支持/)
    const plain = mkdtempSync(path.join(tmpdir(), 'nf-nogit-'))
    try {
      await expect(gitStatus(plain)).rejects.toThrow(/不是 Git 仓库/)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
