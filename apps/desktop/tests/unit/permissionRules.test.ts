import { describe, it, expect } from 'vitest'
import { matchesRule, isInSandbox } from '../../src/main/tools.js'

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
