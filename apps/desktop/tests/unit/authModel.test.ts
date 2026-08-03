import { describe, it, expect } from 'vitest'
import { toolRisk, toolLevel, buildAuthHint, canMergeApprove } from '../../src/renderer/authModel'

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
  it('buildAuthHint：write/edit 明示「需要授权·写入文件」+ 影响路径 + 快照提示', () => {
    const h = buildAuthHint('write', { path: '/tmp/a.txt', content: 'x' })
    expect(h.level).toContain('需要授权')
    expect(h.level).toContain('写入文件')
    expect(h.impact).toBe('/tmp/a.txt')
    expect(h.note).toContain('快照')
    expect(h.note).toContain('回滚')
  })

  it('buildAuthHint：bash 明示「需要授权·执行命令」+ 命令截断 + 本机执行风险', () => {
    const h = buildAuthHint('bash', { command: 'rm -rf /tmp/x && echo done' })
    expect(h.level).toContain('需要授权')
    expect(h.level).toContain('执行命令')
    expect(h.impact).toContain('rm -rf')
    expect(h.note).toContain('本机进程执行')
  })

  it('buildAuthHint：bash 超长命令截断（>60 字符加 …）', () => {
    const long = 'echo ' + 'a'.repeat(80)
    const h = buildAuthHint('bash', { command: long })
    expect(h.impact.length).toBeLessThanOrEqual(61)
    expect(h.impact.endsWith('…')).toBe(true)
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
