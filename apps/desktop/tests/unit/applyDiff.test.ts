import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseUnifiedDiff, applyDiffToFile, snapshot, revert } from '../../src/main/applyDiff'

const TMP = '/tmp/nf-unit-test'

describe('applyDiff（L1 领域逻辑——纯函数不变量）', () => {
  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('解析：替换（del+add 同行）+ 新增', () => {
    const diff = `--- a/t
+++ b/t
@@ -1,4 +1,5 @@
 line1
-line2
+LINE2
 line3
 line4
+line5`
    const changes = parseUnifiedDiff(diff)
    expect(changes).toEqual([
      { line: 2, type: 'del', content: '' },
      { line: 2, type: 'add', content: 'LINE2' },
      { line: 5, type: 'add', content: 'line5' }
    ])
  })

  it('解析：多 hunk 支持（第二个 hunk 行号独立）', () => {
    const diff = `--- a/t
+++ b/t
@@ -1,2 +1,2 @@
 a
-b
+B
@@ -5,1 +5,1 @@
 e
-f
+F`
    const changes = parseUnifiedDiff(diff)
    expect(changes).toEqual([
      { line: 2, type: 'del', content: '' },
      { line: 2, type: 'add', content: 'B' },
      { line: 6, type: 'del', content: '' },
      { line: 6, type: 'add', content: 'F' }
    ])
  })

  it('应用：替换+新增（从后往前——行号不偏移）', () => {
    const file = path.join(TMP, 'a.txt')
    writeFileSync(file, 'line1\nline2\nline3\nline4\n', 'utf-8')
    const diff = `--- a/t
+++ b/t
@@ -1,4 +1,5 @@
 line1
-line2
+LINE2
 line3
 line4
+line5`
    const r = applyDiffToFile(file, parseUnifiedDiff(diff))
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('line1\nLINE2\nline3\nline4\nline5\n')
  })

  it('应用：文件不存在 → 错误（不崩）', () => {
    const r = applyDiffToFile(path.join(TMP, 'missing.txt'), [{ line: 1, type: 'add', content: 'x' }])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('文件不存在')
  })

  it('快照/回滚：apply 后 revert 恢复原样', () => {
    const file = path.join(TMP, 'b.txt')
    writeFileSync(file, 'alpha\nbeta\n', 'utf-8')
    const bak = snapshot(file)
    expect(bak).toBe(file + '.nf-bak')
    expect(existsSync(bak)).toBe(true)
    applyDiffToFile(file, [{ line: 3, type: 'add', content: 'gamma' }])
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nbeta\ngamma\n')
    const rv = revert(file)
    expect(rv.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nbeta\n')
  })

  it('回滚：无快照 → 错误提示', () => {
    const r = revert(path.join(TMP, 'no-snapshot.txt'))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('无快照')
  })
})
