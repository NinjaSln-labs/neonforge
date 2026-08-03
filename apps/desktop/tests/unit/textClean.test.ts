import { describe, it, expect } from 'vitest'
import { stripMarkdown } from '../../src/renderer/textClean'

// 2026-08-03 v33：思考过程 Markdown 清洗——非技术用户看到可读纯文字

describe('stripMarkdown（思考过程清洗）', () => {
  it('去掉行内代码反引号（`代码` → 代码）', () => {
    expect(stripMarkdown('需要调用 `read` 工具')).toBe('需要调用 read 工具')
  })

  it('去掉代码块框，保留内容', () => {
    const md = '分析如下：\n```json\n{"path": "/src/a.ts"}\n```\n继续'
    expect(stripMarkdown(md)).toContain('{"path": "/src/a.ts"}')
    expect(stripMarkdown(md)).not.toContain('```')
  })

  it('去掉加粗/斜体标记（**x** / *x* → x）', () => {
    expect(stripMarkdown('**关键**问题 *次要*')).toBe('关键问题 次要')
  })

  it('去掉标题标记（# 需求 → 需求）', () => {
    expect(stripMarkdown('# 需求\n## 子项')).toBe('需求\n子项')
  })

  it('列表转可读（- x → · x；1. x → x）', () => {
    expect(stripMarkdown('- 读取文件\n- 执行命令')).toBe('· 读取文件\n· 执行命令')
    expect(stripMarkdown('1. 第一步\n2. 第二步')).toBe('第一步\n第二步')
  })

  it('链接只留文字（[x](url) → x）', () => {
    expect(stripMarkdown('见[文档](https://a.b)')).toBe('见文档')
  })

  it('纯文本原样保留', () => {
    const t = '需要先读取 package.json 确认依赖'
    expect(stripMarkdown(t)).toBe(t)
  })
})
