import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { codeRag } from '../../src/main/codeRag'

const TMP = '/tmp/nf-unit-rag'

describe('CodeRAG（Layer2 V1 降级——关键词检索兜底）', () => {
  beforeEach(() => {
    mkdirSync(`${TMP}/src`, { recursive: true })
    writeFileSync(`${TMP}/src/auth.ts`, 'export function login(user, pass) {\n  // 认证逻辑\n  return true\n}\n')
    writeFileSync(`${TMP}/src/report.ts`, 'export function buildReport(data) {\n  return data.map((x) => x.name)\n}\n')
    writeFileSync(`${TMP}/README.md`, '# NeonForge\n认证与报告模块说明\n')
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('关键词命中 → 返回片段（path/line/snippet）', () => {
    const r = codeRag.search(TMP, 'login')
    expect(r.hits.length).toBeGreaterThan(0)
    const hit = r.hits.find((h) => h.path.endsWith('auth.ts'))
    expect(hit).toBeTruthy()
    expect(hit?.line).toBe(1)
    expect(hit?.snippet).toContain('login')
  })

  it('大小写不敏感匹配', () => {
    const r = codeRag.search(TMP, 'REPORT')
    expect(r.hits.some((h) => h.path.endsWith('report.ts'))).toBe(true)
  })

  it('无匹配 → 空 hits（不崩）', () => {
    const r = codeRag.search(TMP, 'zzz_nonexistent')
    expect(r.hits).toEqual([])
  })

  it('无项目/无关键词 → note 提示', () => {
    expect(codeRag.search(null, 'x').note).toContain('无项目')
    expect(codeRag.search(TMP, 'a').note).toContain('无有效关键词') // 单字符忽略
  })

  it('node_modules 忽略（不进索引）', () => {
    mkdirSync(`${TMP}/node_modules/pkg`, { recursive: true })
    writeFileSync(`${TMP}/node_modules/pkg/index.ts`, 'export const login = 1\n')
    const r = codeRag.search(TMP, 'login')
    expect(r.hits.some((h) => h.path.includes('node_modules'))).toBe(false)
  })
})
