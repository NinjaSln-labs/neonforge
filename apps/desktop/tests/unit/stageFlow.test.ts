import { describe, it, expect } from 'vitest'
import {
  PRODUCT_STAGES,
  PRODUCT_STAGE_DEFS,
  stageByIndex,
  isLastStage,
  buildAdvanceInstruction,
} from '../../src/renderer/domain/stageFlow'

// 领域层：产品阶段流转（AgentChain BC——2026-08-07 advanceChat 领域化，坑 89）
// 产品六阶段此前散落在 DeliveryFlowPanel(FLOW_STAGES)/ConversationPanel(advanceChat)——
// 依据 A0 §2「流水线编排（角色/模板/Stage）→ AgentChain」补建模为 AgentChain 产品级流水线

describe('ProductStage（产品六阶段工作模式）', () => {
  it('六阶段齐全且顺序正确', () => {
    expect(PRODUCT_STAGES).toEqual(['需求', '设计', '开发', '测试', '部署', '交付'])
  })

  it('设计 = text-proposal（输出方案文本，推进不强制工具——坑 89）', () => {
    const d = PRODUCT_STAGE_DEFS['设计']
    expect(d.outputMode).toBe('text-proposal')
    expect(d.forceToolOnAdvance).toBe(false)
  })

  it('开发 = artifacts（动手产出，推进强制工具）', () => {
    const d = PRODUCT_STAGE_DEFS['开发']
    expect(d.outputMode).toBe('artifacts')
    expect(d.forceToolOnAdvance).toBe(true)
  })

  it('需求 = clarify（问答澄清，不调工具）', () => {
    const d = PRODUCT_STAGE_DEFS['需求']
    expect(d.outputMode).toBe('clarify')
    expect(d.forceToolOnAdvance).toBe(false)
  })
})

describe('StageFlow（阶段映射）', () => {
  it('stageByIndex 映射（flowStage 0-5）', () => {
    expect(stageByIndex(0)?.name).toBe('需求')
    expect(stageByIndex(1)?.name).toBe('设计')
    expect(stageByIndex(2)?.name).toBe('开发')
    expect(stageByIndex(5)?.name).toBe('交付')
  })

  it('stageByIndex 越界 → null', () => {
    expect(stageByIndex(-1)).toBeNull()
    expect(stageByIndex(6)).toBeNull()
  })

  it('isLastStage', () => {
    expect(isLastStage(4)).toBe(false)
    expect(isLastStage(5)).toBe(true)
  })
})

describe('AdvanceInstruction（阶段推进指令生成）', () => {
  it('组装阶段切换告知 + hint + 完成提示', () => {
    const instr = buildAdvanceInstruction({ stage: '设计', hint: '确认方案、技术选型。' })
    expect(instr).toContain('【阶段推进】已进入「设计」阶段。')
    expect(instr).toContain('确认方案、技术选型。')
    expect(instr).toContain('本阶段完成时提示用户点「确认推进」')
  })

  it('需求确认摘要注入（requirement 参数）', () => {
    const instr = buildAdvanceInstruction({ stage: '开发', hint: 'h', requirement: '做一个射击游戏' })
    expect(instr).toContain('【需求确认】用户已通过需求确认卡确认需求：做一个射击游戏')
  })

  it('开发阶段 = 动手指令（plan_approval 引导）；其他阶段 = 本阶段不要写代码', () => {
    const dev = buildAdvanceInstruction({ stage: '开发', hint: 'h' })
    expect(dev).toContain('调用 plan_approval 工具')
    const design = buildAdvanceInstruction({ stage: '设计', hint: 'h' })
    expect(design).toContain('本阶段不要写代码')
    expect(design).not.toContain('plan_approval')
  })
})
