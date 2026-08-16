import { describe, it, expect } from 'vitest'
import {
  initialState,
  userConfirmed,
  userDecided,
  setPending,
  decideProgressGuarantee,
  isConsumedProposal,
  isStructuredProposal,
  type ConversationState,
  type TurnProgress,
} from '../../src/domain/conversationState'

// S5 spec TDD 网格：decideProgressGuarantee 唯一推进判定器（吸收 turnPolicy 状态空间——坑 80/81/93/12
// 冒烟 11/12 完成度语义 + S5 扩展 proposed/providedEvidence/toolsAvailable）
// 红阶段（spec-first）：turnPolicy.test.ts 语义迁移（decideTurnPolicy 随 turnPolicy.ts 移除）+ 累积完成度判定新增

const confirmed = (): ConversationState =>
  userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')

const turn = (p: Partial<TurnProgress> = {}): TurnProgress => ({
  produced: false,
  proposed: false,
  providedEvidence: false,
  toolsAvailable: true,
  ...p,
})

describe('decideProgressGuarantee（S5 唯一推进判定器——turnPolicy 语义继承 + 推进维度）', () => {
  // === 继承：pending 恒 auto（P1——最强制组合也释放） ===
  it('pending 非 none → auto（pending-user-decision——授权卡/确认卡悬挂时不逼工具）', () => {
    const s = setPending(confirmed(), 'plan')
    expect(decideProgressGuarantee(s, turn()).mode).toBe('auto')
    expect(
      decideProgressGuarantee(setPending(confirmed(), 'plan'), turn({ toolsAvailable: false }))
        .mode,
    ).toBe('auto')
  })

  // === 继承：未确认 → auto ===
  it('目标未确认 → auto（goal-clarify——澄清问答）', () => {
    expect(decideProgressGuarantee(initialState(), turn()).mode).toBe('auto')
  })

  it('目标已确认 + 方案未确认 → auto（awaiting-exec-confirm——等用户确认方案不逼工具）', () => {
    expect(decideProgressGuarantee(userConfirmed(initialState(), 'goal'), turn()).mode).toBe('auto')
  })

  // === 继承：lastToolFailed → auto（失败诊断优先——坑 93：失败时释放强制让模型看 stderr 修正） ===
  it('lastToolFailed → auto（tool-failed-diagnose——错误要抛出来模型自己修正）', () => {
    const s: ConversationState = { ...confirmed(), lastToolFailed: true }
    const r = decideProgressGuarantee(s, turn({ toolsAvailable: true }))
    expect(r.mode).toBe('auto')
  })

  // === 继承：goal-exec-until-produced（无产出无推进 + 工具可用 → 逼工具——防只说不做坑 80） ===
  it('确认后无产出无推进 + 工具可用 → require-action（逼工具产出——read 不算产出持续强制）', () => {
    const r = decideProgressGuarantee(confirmed(), turn())
    expect(r.mode).toBe('require-action')
  })

  // === 继承：goal-exec-until-achieved（累积完成度——写 1 文件 ≠ 任务达成，坑 12 冒烟 11） ===
  it('已有产出 + 计划未完成 + 未确认达成 → require-action（任务完成度——继续完成计划文件）', () => {
    const s: ConversationState = {
      ...confirmed(),
      producedFiles: new Set(['/test/a.js']),
      plannedFiles: new Set(['/test/a.js', '/test/b.js']),
    }
    const r = decideProgressGuarantee(s, turn())
    expect(r.mode).toBe('require-action')
  })

  // === 继承：plannedComplete 释放（写完计划收敛——冒烟 12：写完计划文件仍强制会重复写死循环） ===
  it('已有产出 + 计划全部完成 → auto（写完计划收敛——模型可输出达成汇报）', () => {
    const s: ConversationState = {
      ...confirmed(),
      producedFiles: new Set(['/test/a.js', '/test/b.js']),
      plannedFiles: new Set(['/test/a.js', '/test/b.js']),
    }
    const r = decideProgressGuarantee(s, turn())
    expect(r.mode).toBe('auto')
  })

  // === 继承：达成确认释放（resolutionConfirmed → 收敛到对话结束） ===
  it('已有产出 + 已确认达成 → auto（resolutionConfirmed——收敛）', () => {
    const s: ConversationState = {
      ...confirmed(),
      producedFiles: new Set(['/test/a.js']),
      resolutionConfirmed: true,
    }
    const r = decideProgressGuarantee(s, turn())
    expect(r.mode).toBe('auto')
  })

  // === 扩展：推进维度（S5——proposed/providedEvidence/produced 本轮算推进） ===
  it('本轮输出结构化提议（proposed——【目标确认】/【执行方案】/【已达成】）→ auto（模型在走决策点流程）', () => {
    const r = decideProgressGuarantee(confirmed(), turn({ proposed: true }))
    expect(r.mode).toBe('auto')
  })

  it('本轮输出完成声明带证据（providedEvidence）→ auto（证据对账流程中不逼工具）', () => {
    const r = decideProgressGuarantee(confirmed(), turn({ providedEvidence: true }))
    expect(r.mode).toBe('auto')
  })

  it('本轮有产出（produced）→ auto（本轮推进——不强制）', () => {
    const r = decideProgressGuarantee(confirmed(), turn({ produced: true }))
    expect(r.mode).toBe('auto')
  })

  // === 扩展：require-advance（工具不可用——不逼调工具，允许输出推进） ===
  it('确认后无推进 + 工具不可用 → require-advance（逼「推进」——允许提议/证据/提问，不逼调工具）', () => {
    const r = decideProgressGuarantee(confirmed(), turn({ toolsAvailable: false }))
    expect(r.mode).toBe('require-advance')
  })
})

// S5 复审（Standards 坑 97 单源——renderer proposalConsumed 下沉领域层）：已确认决策点的已消费提议判定
describe('isConsumedProposal / isStructuredProposal（S5 复审——单源探测）', () => {
  it('isStructuredProposal：三种结构化标记命中；纯文本不命中（evaluateTurnProgress 与 renderer 共用唯一探测）', () => {
    expect(isStructuredProposal('好的。【目标确认：做个游戏】')).toBe(true)
    expect(isStructuredProposal('【执行方案】\n- a.js')).toBe(true)
    expect(isStructuredProposal('【已达成】\n完成。')).toBe(true)
    expect(isStructuredProposal('我马上就去改。')).toBe(false)
    expect(isStructuredProposal('')).toBe(false)
  })

  it('已确认决策点的提议 = 已消费（goal/plan/resolution 各自）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    expect(isConsumedProposal('好的。【目标确认：做个游戏】', s)).toBe(true) // goal 已确认
    expect(isConsumedProposal('【执行方案】\n- a.js', s)).toBe(true) // plan 已确认
    expect(isConsumedProposal('【已达成】\n完成。', s)).toBe(false) // resolution 未确认——不算消费
    const done = userDecided(s, 'resolution', { confirm: true })
    expect(isConsumedProposal('【已达成】\n完成。', done)).toBe(true) // 达成已确认——收敛态消费
  })

  it('未确认的提议 → 不算已消费（pending 期/拒绝后重提议轮仍算推进——auto）', () => {
    const onlyGoal = userConfirmed(initialState(), 'goal')
    expect(isConsumedProposal('【执行方案】\n- a.js', onlyGoal)).toBe(false) // plan 未确认
    expect(isConsumedProposal('好的。【目标确认：做个游戏】', onlyGoal)).toBe(true) // goal 已确认仍消费
  })

  it('纯文本 → 恒非已消费（isStructuredProposal 前置——与「只说不做」判定不冲突）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    expect(isConsumedProposal('我马上就去改。', s)).toBe(false)
  })
})
