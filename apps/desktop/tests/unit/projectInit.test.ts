import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { slugify, initProjectFiles } from '../../src/main/projectInit'

const TMP = '/tmp/nf-unit-project'

describe('projectInit（ticket 07——0-1 项目初始化）', () => {
  afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

  it('slugify：小写/特殊字符转 -/限长/空回退', () => {
    expect(slugify('My Travel Website!')).toBe('my-travel-website')
    expect(slugify('整理发票工具')).toBe('整理发票工具') // 中文保留
    expect(slugify('')).toBe('untitled')
    expect(slugify('a'.repeat(50)).length).toBeLessThanOrEqual(30)
  })

  it('initProjectFiles：创建 README/package.json/src/index.ts 骨架', () => {
    initProjectFiles(TMP, '旅行手册网站')
    expect(existsSync(`${TMP}/README.md`)).toBe(true)
    expect(readFileSync(`${TMP}/README.md`, 'utf-8')).toContain('旅行手册网站')
    expect(existsSync(`${TMP}/package.json`)).toBe(true)
    expect(readFileSync(`${TMP}/package.json`, 'utf-8')).toContain('"name"')
    expect(existsSync(`${TMP}/src/index.ts`)).toBe(true)
    expect(readFileSync(`${TMP}/src/index.ts`, 'utf-8')).toContain('旅行手册网站')
  })
})
