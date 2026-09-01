import { describe, it, expect } from 'vitest'
import { buildSysHint } from '../../src/renderer/sysPrompt'
import { parsePlanProposal } from '../../src/domain/planProposalParser'
import { parseCompletionClaim } from '../../src/domain/completionClaimParser'

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
    // V1.5 S3：协议工具契约锚点（ask_user/propose_goal/propose_plan/report_completion——主通道）
    expect(h.content).toContain('ask_user')
    expect(h.content).toContain('propose_goal')
    expect(h.content).toContain('propose_plan')
    expect(h.content).toContain('report_completion')
    expect(h.content).toContain('降级通道') // 文本标记降级声明（仅工具调用不可用时）
    expect(h.content).toContain('5173/5175')
    expect(h.content).toContain('start-server')
    expect(h.content).toContain('npm init')
  })
})

// S2 spec TDD 网格：sysPrompt ⑬⑭⑮ 与解析器格式契约互锁（§8.1 C）
// 提示词要求的输出格式锚点 ↔ 解析器输入格式——同 commit 同步防漂移
describe('sysPrompt ↔ 解析器格式契约互锁（S2——§8.1 C）', () => {
  const hint = buildSysHint('env', 'plan', 'lang').content

  it('⑭ 方案提议格式：提示词要求文件清单含理由 + 假设 + 验证计划——解析器可消费该格式', () => {
    // 提示词锚点（格式契约——模型按此输出，解析器按此输入）：
    expect(hint).toContain('关键假设') // 方案假设行要求
    expect(hint).toContain('验证计划') // 验证计划行要求
    expect(hint).toContain('文件路径（原因）') // 文件清单含理由
    // 互锁验证：按提示词要求格式生成的样例 → 解析器成功解析
    const sample = `【执行方案】
- src/a.ts（原因）
关键假设：
- 假设
验证计划：
- npm test
`
    const r = parsePlanProposal(sample)
    expect(r.ok).toBe(true)
  })

  it('⑮ 完成声明格式：提示词要求声明 + 验证证据 + 遗留问题——解析器可消费该格式', () => {
    expect(hint).toContain('验证证据') // 证据要求
    expect(hint).toContain('遗留问题') // 遗留问题要求
    const sample = `【已达成】
完成。
验证证据：
- npm test
遗留问题：
- 无
`
    const claim = parseCompletionClaim(sample)
    expect(claim).not.toBeNull()
  })

  it('⑬ 目标提议格式：提示词要求「关键假设」行（目标提议含假设）', () => {
    expect(hint).toContain('关键假设')
  })
})
