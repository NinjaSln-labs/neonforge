import { describe, it, expect } from 'vitest'
import { decideTurnPolicy, type TurnPolicyInput } from '../../src/renderer/domain/turnPolicy'

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

  it('目标+执行已确认 + 有产出 → auto（收敛到文本结束，StuckDetector 兜底）', () => {
    const r = decideTurnPolicy(base)
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('produced-auto')
  })

  // === 目标未确认 → 澄清问答 ===
  it('目标未确认（执行/产出任意）→ auto（澄清问答）', () => {
    const r = decideTurnPolicy({ goalConfirmed: false, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('goal-clarify')
    // 防御：目标未确认但其他状态为 true（状态不一致）——仍按目标未确认处理
    expect(decideTurnPolicy({ goalConfirmed: false, executionConfirmed: true, produced: false }).reason).toBe('goal-clarify')
    expect(decideTurnPolicy({ goalConfirmed: false, executionConfirmed: true, produced: true }).reason).toBe('goal-clarify')
  })

  // === 执行未确认 → 等用户确认执行方案 ===
  it('目标已确认 + 执行未确认 → auto（执行方案已给，等用户确认——不能逼工具）', () => {
    const r = decideTurnPolicy({ goalConfirmed: true, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('awaiting-exec-confirm')
  })

  it('目标已确认 + 执行未确认 + 已有产出（防御——状态不一致）→ awaiting-exec-confirm', () => {
    expect(decideTurnPolicy({ goalConfirmed: true, executionConfirmed: false, produced: true }).reason).toBe('awaiting-exec-confirm')
  })

  // === 已产出优先（状态优先级：produced 生效早于 awaiting——但 reason 按状态机顺序） ===
  it('全部 true → produced-auto（已产出收敛）', () => {
    const r = decideTurnPolicy({ goalConfirmed: true, executionConfirmed: true, produced: true })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('produced-auto')
  })

  it('全部 false → goal-clarify', () => {
    const r = decideTurnPolicy({ goalConfirmed: false, executionConfirmed: false, produced: false })
    expect(r.forceTool).toBe(false)
    expect(r.reason).toBe('goal-clarify')
  })

  // === 边界：forceTool=true 的唯一条件 ===
  it('forceTool=true 仅当 goalConfirmed && executionConfirmed && !produced（唯一强制组合）', () => {
    const cases: TurnPolicyInput[] = [
      { goalConfirmed: false, executionConfirmed: false, produced: false },
      { goalConfirmed: false, executionConfirmed: false, produced: true },
      { goalConfirmed: false, executionConfirmed: true, produced: false },
      { goalConfirmed: false, executionConfirmed: true, produced: true },
      { goalConfirmed: true, executionConfirmed: false, produced: false },
      { goalConfirmed: true, executionConfirmed: false, produced: true },
      { goalConfirmed: true, executionConfirmed: true, produced: false },
      { goalConfirmed: true, executionConfirmed: true, produced: true },
    ]
    cases.forEach((c) => {
      const r = decideTurnPolicy(c)
      expect(r.forceTool).toBe(c.goalConfirmed && c.executionConfirmed && !c.produced)
    })
  })
})
