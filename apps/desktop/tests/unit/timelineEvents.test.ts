import { describe, it, expect } from 'vitest'
import { deriveStateEvents, validateTimelineEvent, dedupeKey, detectProposed } from '../../src/domain/timeline'
import { initialState, userConfirmed, userRejected, approvalGranted, applyToolResult, setPending } from '../../src/domain/conversationState'

// 2026-08-15 DDD 重建：领域事件派生（Event Sourcing-lite——转换 diff → 事件）
// 锁定：任意状态转换自动产生对应领域事件（06 事件目录对齐——状态机可回放）

describe('deriveStateEvents（转换 diff → 领域事件）', () => {
  it('目标确认/拒绝 → task.goal_*', () => {
    const s = initialState()
    const confirmed = userConfirmed(s, 'goal')
    expect(deriveStateEvents(s, confirmed).map((e) => e.type)).toContain('task.goal_confirmed')
    const rejected = userRejected(confirmed, 'goal')
    expect(deriveStateEvents(confirmed, rejected).map((e) => e.type)).toContain('task.goal_rejected')
  })

  it('执行/达成确认/拒绝 → task.execution_*/task.achievement_*', () => {
    let s = userConfirmed(initialState(), 'goal')
    const exec = userConfirmed(s, 'plan')
    const t1 = deriveStateEvents(s, exec).map((e) => e.type)
    expect(t1).toContain('task.execution_confirmed')
    s = exec
    const ach = userConfirmed(s, 'resolution')
    expect(deriveStateEvents(s, ach).map((e) => e.type)).toContain('task.achievement_confirmed')
    expect(deriveStateEvents(ach, userRejected(ach, 'resolution')).map((e) => e.type)).toContain('task.achievement_rejected')
  })

  it('pending 置位/清除 → session.pending_set/cleared（含 kind）', () => {
    const s = initialState()
    const pending = setPending(s, 'goal')
    const setEvts = deriveStateEvents(s, pending)
    expect(setEvts).toContainEqual(expect.objectContaining({ type: 'session.pending_set', detail: { kind: 'goal' } }))
    const cleared = userConfirmed(pending, 'goal') // 确认清 pending
    const clearEvts = deriveStateEvents(pending, cleared)
    expect(clearEvts).toContainEqual(expect.objectContaining({ type: 'session.pending_cleared', detail: { kind: 'goal' } }))
  })

  it('计划清单追加 → plan.approved（files 载荷——追加语义）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const next = approvalGranted(s, ['/test/a.js', '/test/b.js'])
    const evts = deriveStateEvents(s, next)
    expect(evts).toContainEqual(expect.objectContaining({ type: 'plan.approved', detail: { files: ['/test/a.js', '/test/b.js'] } }))
    // 追加不重复派发已存在文件
    const next2 = approvalGranted(next, ['/test/b.js', '/test/c.js'])
    const evts2 = deriveStateEvents(next, next2)
    const approved2 = evts2.find((e) => e.type === 'plan.approved')
    expect(approved2?.detail.files).toEqual(['/test/c.js'])
  })

  it('产出新增 → tool.executed（files 载荷）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const next = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    const evts = deriveStateEvents(s, next)
    expect(evts).toContainEqual(expect.objectContaining({ type: 'tool.executed', detail: { files: ['/test/a.js'] } }))
  })

  it('无状态变化 → 无事件（幂等）', () => {
    const s = initialState()
    expect(deriveStateEvents(s, s)).toEqual([])
  })
})

describe('validateTimelineEvent（注册表——A2 接入约束）', () => {
  it('已登记事件 + 齐全载荷 → 无警告', () => {
    expect(validateTimelineEvent('task.goal_confirmed', { point: 'goal' })).toEqual([])
    expect(validateTimelineEvent('tool.blocked', { name: 'write', gate: 'pending', reason: 'x' })).toEqual([])
  })
  it('未登记事件 → 警告（防散落——A2 三步登记）', () => {
    const warns = validateTimelineEvent('custom-random-event', {})
    expect(warns.some((w) => w.includes('未登记'))).toBe(true)
  })
  it('缺关键载荷字段 → 警告', () => {
    const warns = validateTimelineEvent('conversation.message_sent', {})
    expect(warns.some((w) => w.includes('content'))).toBe(true)
  })
})

describe('dedupeKey / detectProposed（2026-08-15 补齐）', () => {
  it('dedupeKey：type + detail 签名（同内容同 key，不同内容异 key）', () => {
    expect(dedupeKey('card.shown', { card: 'goal' })).toBe(dedupeKey('card.shown', { card: 'goal' }))
    expect(dedupeKey('card.shown', { card: 'goal' })).not.toBe(dedupeKey('card.shown', { card: 'plan' }))
  })
  it('detectProposed：标记 → 提议事件（载荷）', () => {
    expect(detectProposed('好的。【目标确认：做一个游戏】')).toContainEqual({ type: 'task.goal_proposed', detail: { goalText: '做一个游戏' } })
    expect(detectProposed('【执行方案】\n- a.js')).toContainEqual({ type: 'task.execution_proposed', detail: expect.objectContaining({}) })
    expect(detectProposed('完成【已达成】')).toContainEqual({ type: 'task.achievement_proposed', detail: expect.objectContaining({}) })
  })
  it('detectProposed：无标记 → 空', () => {
    expect(detectProposed('我先看看项目结构。')).toEqual([])
    expect(detectProposed('')).toEqual([])
  })
})
