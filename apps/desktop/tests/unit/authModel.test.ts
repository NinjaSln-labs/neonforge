import { describe, it, expect } from 'vitest'
import {
  toolRisk,
  toolLevel,
  buildAuthHint,
  canMergeApprove,
  canTaskTrust,
  shouldAutoApproveTool,
  autoApprovalSource,
  isInPlan,
} from '../../src/renderer/authModel'

// ticket 14 信任阶梯 · 授权执行模型（renderer 纯函数）：
// L1 观察无需授权 / L3 操作逐项授权（low 文件操作 + high 命令执行）/ 疲劳防护合并判定

describe('authModel 授权执行模型（ticket 14）', () => {
  it('toolRisk：write/edit=low（文件操作），bash=high（命令执行），read/search/LSP=none（只读）', () => {
    expect(toolRisk('write')).toBe('low')
    expect(toolRisk('edit')).toBe('low')
    expect(toolRisk('bash')).toBe('high')
    expect(toolRisk('read')).toBe('none')
    expect(toolRisk('search')).toBe('none')
    expect(toolRisk('find_definition')).toBe('none')
  })

  it('toolLevel：只读=L1，操作=L3（L2 建议为模型文本无工具）', () => {
    expect(toolLevel('read')).toBe('L1')
    expect(toolLevel('write')).toBe('L3')
    expect(toolLevel('bash')).toBe('L3')
  })

  // 2026-08-03 v31 B1：授权卡术语人类化——去内部「L3」用「需要授权 · 操作」（非技术用户优先）
  it('buildAuthHint：write/edit 明示「需要授权·写入文件」+ 影响路径 + 备份提示', () => {
    const h = buildAuthHint('write', { path: '/tmp/a.txt', content: 'x' })
    expect(h.level).toContain('需要授权')
    expect(h.level).toContain('写入文件')
    expect(h.impact).toBe('/tmp/a.txt')
    expect(h.note).toContain('备份')
    expect(h.note).toContain('还原')
  })

  it('buildAuthHint：bash 明示「需要授权·执行命令」+ 命令截断 + 本机执行风险', () => {
    const h = buildAuthHint('bash', { command: 'rm -rf /tmp/x && echo done' })
    expect(h.level).toContain('需要授权')
    expect(h.level).toContain('执行命令')
    expect(h.impact).toContain('rm -rf')
    expect(h.note).toContain('你的电脑上运行')
  })

  // 2026-08-06 用户反馈「命令失败了但先让我授权，不确认是不是有问题」：授权卡 bash 显示完整命令（不截断——用户要看完整命令判断）+ note 加「看不懂可拒绝」引导
  it('buildAuthHint：bash 显示完整命令（不截断）+ 风险判断引导', () => {
    const long = 'cd /Users/x/项目 && ls -la && ech'
    const h = buildAuthHint('bash', { command: long })
    expect(h.impact).toBe(long)
    expect(h.impact.endsWith('…')).toBe(false)
    expect(h.note).toContain('你的电脑上运行')
    expect(h.note).toContain('拒绝')
  })

  it('canMergeApprove：同批 ≥2 低危文件操作 → 可合并授权（疲劳防护）', () => {
    expect(canMergeApprove([{ name: 'write' }, { name: 'edit' }])).toBe(true)
    expect(canMergeApprove([{ name: 'write' }, { name: 'write' }])).toBe(true)
  })

  it('canMergeApprove：含 bash（高危）→ 永不合并；单卡 → 不合并（低频高危单独确认）', () => {
    expect(canMergeApprove([{ name: 'write' }, { name: 'bash' }])).toBe(false)
    expect(canMergeApprove([{ name: 'bash' }])).toBe(false)
    expect(canMergeApprove([{ name: 'write' }])).toBe(false)
    expect(canMergeApprove([])).toBe(false)
  })
})

// ADR-015：三档信任模式自动授权判定（renderer 单源——strict/standard/delegated）
describe('authModel 信任模式判定（ADR-015）', () => {
  const base = {
    path: '/test/app.ts',
    planConfirmed: true,
    plannedFiles: ['/test/app.ts'],
    trusted: false,
    rootPath: '/test',
  }

  it('isInPlan：只做绝对路径精确比较（相对清单必须由调用方绝对化——禁止末段匹配绕过）', () => {
    expect(isInPlan('/test/src/a.ts', ['/test/src/a.ts'])).toBe(true)
    expect(isInPlan('/test/src/./a.ts', ['/test/src/a.ts'])).toBe(true)
    expect(isInPlan('/test/b.ts', ['/test/a.ts'])).toBe(false)
    // 旧实现的 p.endsWith('/'+f) 漏洞：绝对 /tmp/game.js 会被相对 game.js 误判在计划内
    expect(isInPlan('/tmp/game.js', ['game.js'])).toBe(false)
    expect(isInPlan('/test/src/a.ts', ['src/a.ts'])).toBe(false)
  })

  it('trusted（允许并记住/单次批准文件）只对 write/edit 恒自动——bash/MCP 不得借路径搭车', () => {
    for (const mode of ['strict', 'standard', 'delegated'] as const) {
      expect(shouldAutoApproveTool({ ...base, mode, name: 'write', trusted: true })).toBe(true)
      expect(shouldAutoApproveTool({ ...base, mode, name: 'edit', trusted: true })).toBe(true)
      expect(shouldAutoApproveTool({ ...base, mode, name: 'bash', trusted: true })).toBe(false)
      expect(shouldAutoApproveTool({ ...base, mode, name: 'mcp__danger', trusted: true })).toBe(
        false,
      )
    }
  })

  it('strict：方案确认不自动放行任何文件操作（write/edit 都需授权）', () => {
    expect(shouldAutoApproveTool({ ...base, mode: 'strict', name: 'write' })).toBe(false)
    expect(shouldAutoApproveTool({ ...base, mode: 'strict', name: 'edit' })).toBe(false)
  })

  it('standard：清单内 write 自动；edit 仍需授权；清单外/未确认 plan 不自动', () => {
    expect(shouldAutoApproveTool({ ...base, mode: 'standard', name: 'write' })).toBe(true)
    expect(shouldAutoApproveTool({ ...base, mode: 'standard', name: 'edit' })).toBe(false)
    expect(
      shouldAutoApproveTool({ ...base, mode: 'standard', name: 'write', path: '/test/other.ts' }),
    ).toBe(false)
    expect(
      shouldAutoApproveTool({ ...base, mode: 'standard', name: 'write', planConfirmed: false }),
    ).toBe(false)
  })

  it('delegated：清单内 write/edit 自动；清单外/未确认/bash 永不自动', () => {
    expect(shouldAutoApproveTool({ ...base, mode: 'delegated', name: 'write' })).toBe(true)
    expect(shouldAutoApproveTool({ ...base, mode: 'delegated', name: 'edit' })).toBe(true)
    expect(
      shouldAutoApproveTool({ ...base, mode: 'delegated', name: 'edit', path: '/test/other.ts' }),
    ).toBe(false)
    expect(
      shouldAutoApproveTool({ ...base, mode: 'delegated', name: 'edit', planConfirmed: false }),
    ).toBe(false)
    expect(shouldAutoApproveTool({ ...base, mode: 'delegated', name: 'bash', path: '' })).toBe(
      false,
    )
  })

  it('autoApprovalSource：任务信任/标准 write = auto；delegated write/edit = delegate；拒绝 = null', () => {
    expect(autoApprovalSource({ ...base, mode: 'standard', name: 'write' })).toBe('auto')
    // 委托模式下 write/edit 都走 main 执行边界二次校验（审计来源 delegate）
    expect(autoApprovalSource({ ...base, mode: 'delegated', name: 'write' })).toBe('delegate')
    expect(autoApprovalSource({ ...base, mode: 'delegated', name: 'edit' })).toBe('delegate')
    expect(autoApprovalSource({ ...base, mode: 'strict', name: 'write' })).toBeNull()
    expect(
      autoApprovalSource({ ...base, mode: 'delegated', name: 'write', path: '/test/other.ts' }),
    ).toBeNull()
    expect(autoApprovalSource({ ...base, mode: 'delegated', name: 'write', trusted: true })).toBe(
      'auto',
    )
  })

  it('根外路径在计划/委托判定下永不自动放行（V2：清单外/根外始终弹卡）', () => {
    const outside = { path: '/test/../escaped.txt', plannedFiles: ['/test/../escaped.txt'] }
    expect(shouldAutoApproveTool({ ...base, ...outside, mode: 'standard', name: 'write' })).toBe(
      false,
    )
    expect(shouldAutoApproveTool({ ...base, ...outside, mode: 'delegated', name: 'edit' })).toBe(
      false,
    )
    // 2026-11-24 审计：根检查先于 trusted——显式「允许并记住」的根外绑定也不得自动放行
    //（04-tactical-design §316「沙箱外永不进入信任」；原实现 trusted 先行，词法前缀碰撞路径可免卡）
    for (const mode of ['strict', 'standard', 'delegated'] as const) {
      expect(
        shouldAutoApproveTool({ ...base, ...outside, mode, name: 'edit', trusted: true }),
      ).toBe(false)
      expect(
        autoApprovalSource({ ...base, ...outside, mode, name: 'edit', trusted: true }),
      ).toBeNull()
    }
    expect(autoApprovalSource({ ...base, ...outside, mode: 'standard', name: 'write' })).toBeNull()
    // 未提供 rootPath（旧调用）→ 维持既有清单精确匹配语义
    expect(
      shouldAutoApproveTool({
        path: '/test/../escaped.txt',
        planConfirmed: true,
        plannedFiles: ['/test/../escaped.txt'],
        trusted: false,
        mode: 'standard',
        name: 'write',
      }),
    ).toBe(true)
  })

  it('词法前缀碰撞的兄弟目录视为根外（/test-evil ≠ /test 内）——trusted 也不放行', () => {
    const sibling = { path: '/test-evil/passwd', plannedFiles: ['/test-evil/passwd'] }
    for (const mode of ['strict', 'standard', 'delegated'] as const) {
      expect(shouldAutoApproveTool({ ...base, ...sibling, mode, name: 'write' })).toBe(false)
      expect(
        shouldAutoApproveTool({ ...base, ...sibling, mode, name: 'write', trusted: true }),
      ).toBe(false)
    }
    // 真正根内路径不受影响（含根自身）
    expect(shouldAutoApproveTool({ ...base, mode: 'standard', name: 'write', trusted: true })).toBe(
      true,
    )
  })

  it('canTaskTrust：任务信任集合只收根内路径（前缀碰撞兄弟目录 / 根外 / 无根 均拒绝）', () => {
    expect(canTaskTrust('/test/app.ts', '/test')).toBe(true)
    expect(canTaskTrust('/test', '/test')).toBe(true)
    // 审计回归：字符串前缀碰撞曾让 /test-evil/passwd 进入信任集合
    expect(canTaskTrust('/test-evil/passwd', '/test')).toBe(false)
    expect(canTaskTrust('/test/../escaped.txt', '/test')).toBe(false)
    expect(canTaskTrust('/other/app.ts', '/test')).toBe(false)
    expect(canTaskTrust('/test/app.ts', '')).toBe(false)
    expect(canTaskTrust('/test/app.ts', null)).toBe(false)
    expect(canTaskTrust('', '/test')).toBe(false)
  })
})
