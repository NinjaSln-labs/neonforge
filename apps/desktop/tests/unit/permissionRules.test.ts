import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { matchesRule, isInSandbox, toolRegistry, initTools } from '../../src/main/tools.js'

// ADR-017 B7 execute 层用例需要（bash 落 PID 记录路径——mock 到独立 tmp，同 tools.test 模式）
const { openExternalMock } = vi.hoisted(() => ({ openExternalMock: vi.fn(async () => {}) }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nf-unit-permrules' },
  shell: { openExternal: openExternalMock },
}))

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

// ============================================================================
// ADR-017 B7：规则显式序——两趟扫描（先 deny 命中即拒，再 allow）execute 层断言。
// 旧单趟 first-match 依赖规则数组声明序：deny+allow 同 specifier 时 allow 排前即穿透。
// 新语义＝deny > allow > ask 与声明序无关。
// ============================================================================
describe('execute 显式序两趟扫描（B7——deny 恒胜，allow 压 ask）', () => {
  const cmd = 'echo nf-conflict'
  beforeEach(() => {
    initTools()
  })
  afterEach(() => {
    toolRegistry.setRules([])
  })

  it('allow 在前 deny 在后（旧 first-match 会穿透执行）→ deny 胜：policy 拒', async () => {
    toolRegistry.setRules([
      { action: 'allow', tool: 'bash', specifier: 'echo nf-conflict' },
      { action: 'deny', tool: 'bash', specifier: 'echo nf-conflict' },
    ])
    const r = await toolRegistry.execute('bash', { command: cmd }, {})
    expect(r.ok).toBe(false)
    expect(r.policy).toBe(true)
    expect(r.error).toContain('已阻止')
    expect(r.error).toContain('deny 规则')
  })

  it('deny 在前 allow 在后 → 同 deny 胜（声明序无关性锁定）', async () => {
    toolRegistry.setRules([
      { action: 'deny', tool: 'bash', specifier: 'echo nf-conflict' },
      { action: 'allow', tool: 'bash', specifier: 'echo nf-conflict' },
    ])
    const r = await toolRegistry.execute('bash', { command: cmd }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已阻止')
  })

  it('宽 deny + 窄 allow 同工具 → deny 命中范围仍胜', async () => {
    toolRegistry.setRules([
      { action: 'allow', tool: 'bash', specifier: 'echo nf-conflict' },
      { action: 'deny', tool: 'bash', specifier: '' }, // 全部
    ])
    const r = await toolRegistry.execute('bash', { command: cmd }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已阻止')
  })

  it('allow 单独（无 deny）→ 放行执行（两趟后 allow 通道语义不变）', async () => {
    toolRegistry.setRules([{ action: 'allow', tool: 'bash', specifier: 'echo nf-conflict' }])
    const r = await toolRegistry.execute('bash', { command: cmd }, {})
    expect(r.ok).toBe(true)
    expect(String(JSON.stringify(r.data))).toContain('nf-conflict')
  })

  it('ask 不吞 allow（显式序 allow > ask）：ask 排前 allow 排后 → 放行', async () => {
    toolRegistry.setRules([
      { action: 'ask', tool: 'bash', specifier: 'echo nf-conflict' },
      { action: 'allow', tool: 'bash', specifier: 'echo nf-conflict' },
    ])
    const r = await toolRegistry.execute('bash', { command: cmd }, {})
    expect(r.ok).toBe(true)
  })
})
