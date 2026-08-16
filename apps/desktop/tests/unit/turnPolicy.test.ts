import { describe, it, expect } from 'vitest'
import { decideTurnPolicy, type TurnPolicyInput } from '../../src/domain/turnPolicy'

// 领域层：轮次执行保障（Conversation BC——2026-08-07 无阶段重构 S1）
// 三态判定（目标驱动）：goalConfirmed / executionConfirmed / produced——穷举 3 布尔 = 8 组合
// forceTool 原意保留（坑 80）：目标+执行已确认但无产出 → 强制必须动手到产出（防只说不做）
// produced 后 auto（坑 81 StuckDetector 兜底；避免 required 无限循环/已干活被迫空转）

const base: TurnPolicyInput = {
  goalConfirmed: true,
  executionConfirmed: true,
  produced: true,
}

describe('TurnExecutionPolicy（三态——无阶段重构 S1）', () => {
  // === 核心：goal-exec-until-produced（防只说不做，坑 80 B 类语义延续） ===
  it('目标+执行已确认 + 无产出 → 强制工具（read 不算产出持续强制，直到 write/edit）', () => {
    const r = decideTurnPolicy({ ...base, produced: false })
    expect(r.forceTool).toBe(true)
    expect(r.reason).toBe('goal-exec-until-produced')
  })

  it('目标+执行已确认 + 有产出但未汇报【已达成】→ 仍强制（任务完成度——竞品语义：写 1 文件≠达成）', () => {
    const r = decideTurnPolicy(base)
    expect(r.forceTool).toBe(true)
    expect(r.reason).toBe('goal-exec-until-achieved')
  })

  it('有产出 + 已汇报【已达成】→ auto（收敛到对话结束，StuckDetector 兜底）', () => {
    const r = decideTurnPolicy({ ...base, goalAchieved: true })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('produced-auto')
  })

  // === 目标未确认 → 澄清问答 ===
  it('目标未确认（执行/产出任意）→ auto（澄清问答）', () => {
    const r = decideTurnPolicy({ goalConfirmed: false, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('goal-clarify')
    // 防御：目标未确认但其他状态为 true（状态不一致）——仍按目标未确认处理
    expect(
      decideTurnPolicy({ goalConfirmed: false, executionConfirmed: true, produced: false }).reason,
    ).toBe('goal-clarify')
    expect(
      decideTurnPolicy({ goalConfirmed: false, executionConfirmed: true, produced: true }).reason,
    ).toBe('goal-clarify')
  })

  // === 执行未确认 → 等用户确认执行方案 ===
  it('目标已确认 + 执行未确认 → auto（执行方案已给，等用户确认——不能逼工具）', () => {
    const r = decideTurnPolicy({ goalConfirmed: true, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('awaiting-exec-confirm')
  })

  it('目标已确认 + 执行未确认 + 已有产出（防御——状态不一致）→ awaiting-exec-confirm', () => {
    expect(
      decideTurnPolicy({ goalConfirmed: true, executionConfirmed: false, produced: true }).reason,
    ).toBe('awaiting-exec-confirm')
  })

  // === 已产出优先（状态优先级：produced 生效早于 awaiting——但 reason 按状态机顺序） ===
  it('全部 true + goalAchieved → produced-auto（已产出且已汇报达成收敛）', () => {
    const r = decideTurnPolicy({
      goalConfirmed: true,
      executionConfirmed: true,
      produced: true,
      goalAchieved: true,
    })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('produced-auto')
  })

  it('全部 true 但未达成 → 强制（goal-exec-until-achieved）', () => {
    const r = decideTurnPolicy({ goalConfirmed: true, executionConfirmed: true, produced: true })
    expect(r.forceTool).toBe(true)
    expect(r.reason).toBe('goal-exec-until-achieved')
  })

  it('工具失败优先于任务完成度（lastToolFailed → 释放诊断，即使 produced 未达成）', () => {
    const r = decideTurnPolicy({
      goalConfirmed: true,
      executionConfirmed: true,
      produced: true,
      lastToolFailed: true,
    })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('tool-failed-diagnose')
  })

  // === 2026-08-15 P1（A0 §3.4/§4 补行）：PENDING 期间不强制——pending 下模型不做任何事 ===
  it('PENDING（等用户决策）→ 不强制（reason=pending-user-decision）——强制组合下也释放', () => {
    // 最强制组合（目标+执行确认、无产出）+ pending → 释放（授权卡/确认卡悬挂时 required 会逼模型调工具被拦）
    const r = decideTurnPolicy({
      goalConfirmed: true,
      executionConfirmed: true,
      produced: false,
      pending: true,
    })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('pending-user-decision')
    // pending 优先于其他一切释放条件（含 lastToolFailed——用户在决策时无强制可言）
    expect(
      decideTurnPolicy({
        goalConfirmed: true,
        executionConfirmed: true,
        produced: true,
        lastToolFailed: true,
        pending: true,
      }).reason,
    ).toBe('pending-user-decision')
    expect(
      decideTurnPolicy({
        goalConfirmed: false,
        executionConfirmed: false,
        produced: false,
        pending: true,
      }).reason,
    ).toBe('pending-user-decision')
  })

  it('pending 未传/为 false → 原语义不变（强制组合仍强制）', () => {
    expect(
      decideTurnPolicy({
        goalConfirmed: true,
        executionConfirmed: true,
        produced: false,
        pending: false,
      }).forceTool,
    ).toBe(true)
    expect(
      decideTurnPolicy({ goalConfirmed: true, executionConfirmed: true, produced: false })
        .forceTool,
    ).toBe(true)
  })

  it('全部 false → goal-clarify', () => {
    const r = decideTurnPolicy({ goalConfirmed: false, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('goal-clarify')
  })

  // === 边界：forceTool=true 的唯一条件 ===
  it('forceTool=true 仅当 goalConfirmed && executionConfirmed && (!produced || !goalAchieved) && !pending（唯一强制组合）', () => {
    const cases: TurnPolicyInput[] = [
      { goalConfirmed: false, executionConfirmed: false, produced: false },
      { goalConfirmed: false, executionConfirmed: false, produced: true },
      { goalConfirmed: false, executionConfirmed: true, produced: false },
      { goalConfirmed: false, executionConfirmed: true, produced: true },
      { goalConfirmed: true, executionConfirmed: false, produced: false },
      { goalConfirmed: true, executionConfirmed: false, produced: true },
      { goalConfirmed: true, executionConfirmed: true, produced: false },
      { goalConfirmed: true, executionConfirmed: true, produced: true },
      // 2026-08-15 P1：pending 时任何组合都不强制
      { goalConfirmed: true, executionConfirmed: true, produced: false, pending: true },
      { goalConfirmed: true, executionConfirmed: true, produced: true, pending: true },
      { goalConfirmed: false, executionConfirmed: false, produced: false, pending: true },
    ]
    cases.forEach((c) => {
      const r = decideTurnPolicy(c)
      // 2026-08-07 任务完成度：produced 未达成也强制（goal-exec-until-achieved）；2026-08-15 P1：pending 不强制
      expect(r.forceTool).toBe(
        c.goalConfirmed && c.executionConfirmed && (!c.produced || !c.goalAchieved) && !c.pending,
      )
    })
  })
})
