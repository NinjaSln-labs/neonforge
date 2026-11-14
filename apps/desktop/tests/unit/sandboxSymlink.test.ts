import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { initTools, isInSandboxRealpath, toolRegistry } from '../../src/main/tools'

let base = ''
let root = ''
let outside = ''

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'nf-symlink-'))
  root = path.join(base, 'project')
  outside = path.join(base, 'outside')
  mkdirSync(root, { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(path.join(outside, 'secret.txt'), 'SECRET')
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'))
  symlinkSync(outside, path.join(root, 'escape'))
  // 悬空链接：目标尚不存在（write 不能借此在项目外创建文件）
  symlinkSync(path.join(outside, 'not-yet.txt'), path.join(root, 'dangling.txt'))
  initTools()
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('沙箱符号链接（P1-10）', () => {
  it('isInSandboxRealpath：根内正常文件 true；symlink 逃逸 false', async () => {
    writeFileSync(path.join(root, 'normal.txt'), 'ok')
    expect(await isInSandboxRealpath('normal.txt', root)).toBe(true)
    expect(await isInSandboxRealpath('link.txt', root)).toBe(false)
    expect(await isInSandboxRealpath('escape/new.txt', root)).toBe(false)
    expect(await isInSandboxRealpath('dangling.txt', root)).toBe(false)
  })

  it('read：symlink 逃逸需授权（不再自动放行）', async () => {
    writeFileSync(path.join(root, 'normal.txt'), 'ok')
    const res = await toolRegistry.execute('read', { path: 'link.txt' }, { rootPath: root })
    expect(res).toMatchObject({ ok: false, needApproval: true })
    const normal = await toolRegistry.execute('read', { path: 'normal.txt' }, { rootPath: root })
    expect(normal.ok).toBe(true)
  })

  it('write/edit：即使 approved=true 也拒绝符号链接逃逸', async () => {
    const write = await toolRegistry.execute(
      'write',
      { path: 'link.txt', content: 'PWNED' },
      { rootPath: root, approved: true },
    )
    expect(write.ok).toBe(false)
    expect(write.error).toMatch(/符号链接/)
    expect(readFileSync(path.join(outside, 'secret.txt'), 'utf-8')).toBe('SECRET')

    const writeDir = await toolRegistry.execute(
      'write',
      { path: 'escape/new.txt', content: 'PWNED' },
      { rootPath: root, approved: true },
    )
    expect(writeDir.ok).toBe(false)
    expect(writeDir.error).toMatch(/符号链接/)

    const dangling = await toolRegistry.execute(
      'write',
      { path: 'dangling.txt', content: 'PWNED' },
      { rootPath: root, approved: true },
    )
    expect(dangling.ok).toBe(false)
    expect(dangling.error).toMatch(/符号链接/)
    expect(existsSync(path.join(outside, 'not-yet.txt'))).toBe(false)
  })
})
