import { describe, it, expect } from 'vitest'
import { decideTurnPolicy, type TurnPolicyInput } from '../../src/renderer/domain/turnPolicy'

// 领域层：轮次执行保障（Conversation BC——2026-08-07 forceTool 领域化，坑 89 根因回归）
// 原语义保留（坑 80）：用户指令轮强制产出 / B 类每轮强制直到产出 / 纯确认不强制 / 工具循环 auto
// 坑 89 修复：阶段推进轮（advance-turn）≠ 用户指令轮——按阶段工作模式（设计=文本方案不强制）

const base: TurnPolicyInput = {
  stage: '设计',
  turnKind: 'user-turn',
  isPureAck: false,
  requirementConfirmed: true,
  produced: true,
  depth: 0,
}

describe('TurnExecutionPolicy（轮次执行保障）', () => {
  // === 坑 89 回归：阶段推进轮按阶段工作模式 ===
  it('设计阶段推进轮（advance-turn 首轮）→ 不强制工具（输出方案文本——坑 89 根因修复）', () => {
    const r = decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '设计' })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toContain('advance')
  })

  it('开发阶段推进轮 → 强制工具（动手产出）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '开发' }).forceTool).toBe(true)
  })

  it('测试/部署阶段推进轮 → 强制工具（验证/发布动作）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '测试' }).forceTool).toBe(true)
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '部署' }).forceTool).toBe(true)
  })

  it('交付阶段推进轮 → 不强制（汇报+验收文本）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '交付' }).forceTool).toBe(false)
  })

  it('需求阶段推进轮 → 不强制（防御——需求阶段不推进）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: '需求' }).forceTool).toBe(false)
  })

  // === 原语义保留（坑 80） ===
  it('用户指令轮首轮（非需求阶段）→ 强制工具（原意：用户下达执行指令必须动手到产出）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', stage: '设计' }).forceTool).toBe(true)
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', stage: '开发' }).forceTool).toBe(true)
  })

  it('用户指令轮首轮 + 需求阶段 → 不强制（问答澄清）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', stage: '需求' }).forceTool).toBe(false)
  })

  it('未进入 0-1 流程（stage=null，demo）→ 不强制', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', stage: null }).forceTool).toBe(false)
    expect(decideTurnPolicy({ ...base, turnKind: 'advance-turn', stage: null }).forceTool).toBe(false)
  })

  it('纯确认 → 不强制（模型在问答）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', isPureAck: true }).forceTool).toBe(false)
  })

  it('B 类（需求已确认 + 无产出）→ 每轮强制直到产出（read 不算产出）', () => {
    const bClass: TurnPolicyInput = { ...base, requirementConfirmed: true, produced: false }
    expect(decideTurnPolicy({ ...bClass, turnKind: 'user-turn' }).forceTool).toBe(true)
    expect(decideTurnPolicy({ ...bClass, turnKind: 'tool-loop' }).forceTool).toBe(true)
    expect(decideTurnPolicy({ ...bClass, turnKind: 'advance-turn' }).forceTool).toBe(true)
    // 有产出后 → 按轮次类型正常决策
    expect(decideTurnPolicy({ ...base, requirementConfirmed: true, produced: true }).forceTool).toBe(true) // user-turn
  })

  it('工具循环轮 → auto（不强制，StuckDetector 兜底）', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'tool-loop' }).forceTool).toBe(false)
  })

  it('非首轮（depth>0）→ auto', () => {
    expect(decideTurnPolicy({ ...base, turnKind: 'user-turn', depth: 1 }).forceTool).toBe(false)
  })
})
