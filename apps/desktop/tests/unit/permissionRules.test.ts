import { describe, it, expect } from 'vitest'
import { matchesRule, selectRule, isInSandbox } from '../../src/main/tools.js'

// 2026-08-04 授权架构 v4：规则引擎（deny > allow > ask，Tool(specifier) 格式对齐 Claude/Codex/Cursor）+ 沙箱判定

describe('matchesRule（Tool(specifier) 匹配）', () => {
  it('tool 名不匹配 → false', () => {
    expect(
      matchesRule('write', { path: '/a/b.ts' }, { action: 'allow', tool: 'edit', specifier: '' }),
    ).toBe(false)
  })
  it('specifier 空 = 该工具全部匹配', () => {
    expect(
      matchesRule('bash', { command: 'rm -rf /' }, { action: 'deny', tool: 'bash', specifier: '' }),
    ).toBe(true)
  })
  it('路径前缀匹配（path）', () => {
    expect(
      matchesRule(
        'write',
        { path: '/proj/src/main.ts' },
        { action: 'allow', tool: 'write', specifier: '/proj/src/' },
      ),
    ).toBe(true)
  })
  it('命令前缀匹配（command）', () => {
    expect(
      matchesRule(
        'bash',
        { command: 'npm run test' },
        { action: 'allow', tool: 'bash', specifier: 'npm run ' },
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'bash',
        { command: 'git push' },
        { action: 'allow', tool: 'bash', specifier: 'npm run ' },
      ),
    ).toBe(false)
  })
  it('filePath/file 参数也能匹配', () => {
    expect(
      matchesRule(
        'edit',
        { filePath: '/proj/a.ts' },
        { action: 'allow', tool: 'edit', specifier: '/proj/' },
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'write',
        { file: '/proj/b.ts' },
        { action: 'allow', tool: 'write', specifier: '/proj/' },
      ),
    ).toBe(true)
  })
})

describe('selectRule（裁决优先级 deny > allow > ask）', () => {
  const allow = { action: 'allow' as const, tool: 'bash', specifier: 'npm run ' }
  const deny = { action: 'deny' as const, tool: 'bash', specifier: 'npm run ' }
  const ask = { action: 'ask' as const, tool: 'bash', specifier: 'npm run ' }

  it('deny 优先于列表更早的 allow', () => {
    expect(selectRule([allow, deny], 'bash', { command: 'npm run test' })?.action).toBe('deny')
  })
  it('deny 优先于列表更晚的 allow', () => {
    expect(selectRule([deny, allow], 'bash', { command: 'npm run test' })?.action).toBe('deny')
  })
  it('allow 优先于 ask（与顺序无关）', () => {
    expect(selectRule([ask, allow], 'bash', { command: 'npm run test' })?.action).toBe('allow')
    expect(selectRule([allow, ask], 'bash', { command: 'npm run test' })?.action).toBe('allow')
  })
  it('无匹配 → undefined（fail-closed）', () => {
    expect(selectRule([allow], 'bash', { command: 'git push' })).toBeUndefined()
    expect(selectRule([allow], 'write', { path: '/a.ts' })).toBeUndefined()
  })
})

describe('isInSandbox（沙箱内外——项目根）', () => {
  const root = '/Users/tester/Projects/game'
  it('项目根自身 = 沙箱内', () => {
    expect(isInSandbox('/Users/tester/Projects/game', root)).toBe(true)
  })
  it('项目根下子路径 = 沙箱内', () => {
    expect(isInSandbox('/Users/tester/Projects/game/src/main.js', root)).toBe(true)
  })
  it('项目根外 = 沙箱外', () => {
    expect(isInSandbox('/Users/tester/Downloads/other.js', root)).toBe(false)
    expect(isInSandbox('/Users/tester/Projects/game2/src/x.js', root)).toBe(false) // 前缀相似但非同一根
  })
  it('无 rootPath 或空路径 → 沙箱外', () => {
    expect(isInSandbox('/a/b.ts', undefined)).toBe(false)
    expect(isInSandbox('', root)).toBe(false)
  })
  it('相对路径以 rootPath 解析', () => {
    expect(isInSandbox('src/main.js', root)).toBe(true)
  })
})
