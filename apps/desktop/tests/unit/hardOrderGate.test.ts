// 来源：A-016（stage-review-fixes-2026-08-31 Spec P-5）——硬序门/镜像同步断言

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initTools, toolRegistry, syncPlanConfirmed, type ToolResult } from '../../src/main/tools'
import { PROTOCOL_TOOL_NAMES } from '../../src/domain/protocolTools'

// A-016（stage-review-fixes-2026-08-31 Spec P-5）硬序门 L1 断言——V1.5 Task 1.4：
// approve-files 不在 decideProtocolToolCall 管辖（既有特例——虚拟工具），其硬序门语义由
// 「planConfirmed 镜像」承载：renderer confirm('plan') → session.setPlanConfirmed → main
// planConfirmedRef（tools.ts policy 分支）。
// 分工：
// - 本文件（L1）：main policy 分支（防御纵深——流式路径不可达但保留）+ 协议工具管辖边界
// - renderer 镜像同步（confirm/reject → setPlanConfirmed 调用序列）是 React hook 行为——
//   vitest node 环境无 React 渲染器（无 @testing-library/react/jsdom）→ L1 不可行，
//   转 L3 断言（core.interaction.ts「A-016 硬序门时序」用例内 __nfPlanCalls 序列断言）

// 与 tools.test.ts 同款 electron mock（openExecutor 动态 import——本文件不触发但模块加载需隔离）
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nf-unit-hardorder' },
  shell: { openExternal: vi.fn(async () => {}) },
}))

describe('硬序门时序——协议工具管辖边界（approve-files 是既有特例——不经 decideProtocolToolCall）', () => {
  it('approve-files 不在 PROTOCOL_TOOL_NAMES（硬序门语义由 planConfirmed 镜像承载——非协议分支）', () => {
    expect(PROTOCOL_TOOL_NAMES.has('approve-files')).toBe(false)
  })
})

describe('硬序门时序——main policy 分支硬序门（syncPlanConfirmed 镜像 → approve-files 放行/拦截）', () => {
  // ToolRegistry.execute 把 tool.execute 返回值整体包进 data（外层 ok 恒 true——虚拟工具
  // 的真实语义在外层 data 的内层 ToolResult 里——这正是 IPC 回 renderer 的完整载荷）
  const inner = (r: ToolResult): ToolResult => r.data as ToolResult

  beforeEach(() => {
    syncPlanConfirmed(false) // 基态：方案未确认（每次隔离——模块级布尔镜像）
    initTools()
  })

  it('planConfirmed=false：approve-files 被 policy 拦——「方案未确认」引导文本（非授权请求/非执行失败）', async () => {
    const r = await toolRegistry.execute(
      'approve-files',
      { summary: '抢先授权', files: [{ path: '/test/a.js', reason: 'x' }] },
      {},
    )
    const gate = inner(r)
    expect(gate.ok).toBe(false)
    expect(gate.policy).toBe(true) // 策略引导（renderer 不置 lastToolFailed——模型重走【执行方案】）
    expect(gate.needApproval).toBeUndefined() // 不是授权请求（弹卡由 renderer planConfirmed 门控——不在此处）
    expect(gate.error).toContain('方案未确认')
    expect(gate.error).toContain('【执行方案】')
  })

  it('planConfirmed=true（syncPlanConfirmed 镜像同步后）：approve-files 放行——待批准语义（不假成功）', async () => {
    syncPlanConfirmed(true) // renderer confirm('plan') → session.setPlanConfirmed(true) 的 main 落点
    const r = await toolRegistry.execute(
      'approve-files',
      { summary: '第一批', files: [{ path: '/test/a.js', reason: 'x' }] },
      {},
    )
    const gate = inner(r)
    expect(gate.ok).toBe(true)
    const data = gate.data as { virtual?: boolean; pendingApproval?: boolean }
    expect(data.virtual).toBe(true) // 虚拟工具——不真实执行
    expect(data.pendingApproval).toBe(true) // 等用户点「批准这批文件」——模型不能当已授权
    expect(gate.error).toContain('等待用户')
  })

  it('镜像双向：确认(true) → 拒绝复位(false) → 门重新关上（Spec P-2 reject 同步复位的 main 侧语义）', async () => {
    syncPlanConfirmed(true)
    const open = inner(await toolRegistry.execute('approve-files', {}, {}))
    expect(open.ok).toBe(true)
    syncPlanConfirmed(false) // reject('plan') → setPlanConfirmed(false) 复位
    const closed = inner(await toolRegistry.execute('approve-files', {}, {}))
    expect(closed.ok).toBe(false)
    expect(closed.policy).toBe(true)
    expect(closed.error).toContain('方案未确认')
  })
})
