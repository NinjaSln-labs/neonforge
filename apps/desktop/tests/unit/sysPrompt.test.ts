import { describe, it, expect } from 'vitest'
import { buildSysHint } from '../../src/renderer/sysPrompt'

// 2026-08-15 Q6：系统提示词外置——完整性锁定（防外置搬运丢规则）
describe('buildSysHint（提示词外置——完整性）', () => {
  it('核心规则齐全 + 变量注入', () => {
    const h = buildSysHint('【当前环境】node v20', '【已批准文件清单】a.js', '用中文回复用户')
    expect(h.role).toBe('system')
    expect(h.content).toContain('你是 NeonForge 搭档')
    expect(h.content).toContain('【当前环境】node v20') // envHint 注入
    expect(h.content).toContain('【已批准文件清单】a.js') // planHint 注入
    expect(h.content).toContain('用中文回复用户') // langRule 注入
    // 关键协议规则（防外置搬运遗漏）：
    expect(h.content).toContain('【目标确认')
    expect(h.content).toContain('【执行方案】')
    expect(h.content).toContain('【已达成】')
    expect(h.content).toContain('approve-files')
    expect(h.content).toContain('</candidates>')
    expect(h.content).toContain('5173/5175')
    expect(h.content).toContain('start-server')
    expect(h.content).toContain('npm init')
  })
})
