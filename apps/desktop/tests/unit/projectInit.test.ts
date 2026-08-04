import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { slugify, initProjectFiles, updateProjectTitle } from '../../src/main/projectInit'

const TMP = '/tmp/nf-unit-project'

describe('projectInit（ticket 07——0-1 项目初始化）', () => {
  afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

  it('slugify：小写/特殊字符转 -/限长/空回退', () => {
    expect(slugify('My Travel Website!')).toBe('my-travel-website')
    expect(slugify('整理发票工具')).toBe('整理发票工具') // 中文保留
    expect(slugify('')).toBe('untitled')
    expect(slugify('a'.repeat(50)).length).toBeLessThanOrEqual(20)
  })

  // 2026-08-04：目录名去口语前缀（整句需求 → 简洁可识别目录名）
  it('slugify：去开头语气词（我想做一个/我要做一个/帮我做一个…）', () => {
    expect(slugify('我想做一个3d设计小游戏')).toBe('3d设计小游戏')
    expect(slugify('我要做一个射击类的小游戏')).toBe('射击类的小游戏')
    expect(slugify('帮我做一个每周记账的工具')).toBe('每周记账的工具')
    expect(slugify('做一个旅行手册网站')).toBe('旅行手册网站')
    expect(slugify('请整理桌面文件')).toBe('整理桌面文件')
  })

  // 2026-08-04：骨架仅 README（需求/技术栈未定时不创建工程文件——用户反馈）
  it('initProjectFiles：仅创建 README（不预建 package.json/src）', () => {
    initProjectFiles(TMP, '旅行手册网站')
    expect(existsSync(`${TMP}/README.md`)).toBe(true)
    expect(readFileSync(`${TMP}/README.md`, 'utf-8')).toContain('旅行手册网站')
    expect(existsSync(`${TMP}/package.json`)).toBe(false)
    expect(existsSync(`${TMP}/src`)).toBe(false)
  })

  // 2026-08-04：需求确认回写项目标题（README 首行——package.json 未创建时静默跳过不报错）
  it('updateProjectTitle：README 首行标题跟随确认需求（无 package.json 不报错）', () => {
    initProjectFiles(TMP, '3d设计小游戏')
    updateProjectTitle(TMP, '3D射击小游戏')
    const readme = readFileSync(`${TMP}/README.md`, 'utf-8')
    expect(readme.startsWith('# 3D射击小游戏')).toBe(true)
    expect(readme).toContain('NeonForge 0-1 项目') // 保留正文
    expect(existsSync(`${TMP}/package.json`)).toBe(false)
  })
})
