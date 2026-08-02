import { describe, it, expect } from 'vitest'
import { parseDiffLines } from '../../src/renderer/diffRender'

describe('parseDiffLines（目视 diff 行级渲染单元——HANDOFF §3 第一优先剩余项）', () => {
  it('基础 hunk：del + add 分类 + 行号', () => {
    const diff = '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n-hello worl\n+hello world\n context\n'
    const r = parseDiffLines(diff)
    expect(r).toEqual([
      { type: 'hunk', content: '@@ -1,2 +1,2 @@' },
      { type: 'del', content: 'hello worl', oldLine: 1 },
      { type: 'add', content: 'hello world', newLine: 1 },
      { type: 'context', content: 'context', oldLine: 2, newLine: 2 }
    ])
  })

  it('多 hunk：行号各自重置', () => {
    const diff = '@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +10,1 @@\n-old\n+new\n'
    const r = parseDiffLines(diff)
    expect(r).toHaveLength(6) // 2 hunk + 2 del + 2 add
    expect(r[0]).toEqual({ type: 'hunk', content: '@@ -1,1 +1,1 @@' })
    expect(r[3]).toEqual({ type: 'hunk', content: '@@ -10,1 +10,1 @@' })
    expect(r[5]).toEqual({ type: 'add', content: 'new', newLine: 10 })
  })

  it('空 diff → 空数组', () => {
    expect(parseDiffLines('')).toEqual([])
  })

  it('文件头跳过（---/+++ 不渲染）', () => {
    const diff = '--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n'
    const r = parseDiffLines(diff)
    expect(r.every((l) => l.type !== 'context' || l.content !== 'a/x.ts')).toBe(true)
    expect(r[0].type).toBe('hunk')
  })

  it('无 hunk 的文本 → 空（渲染宽容——无内容可显示）', () => {
    expect(parseDiffLines('just some text\nno hunk here')).toEqual([])
  })
})
