import { describe, it, expect } from 'vitest'
import {
  deriveStateEvents,
  validateTimelineEvent,
  dedupeKey,
  detectProposed,
  TIMELINE_EVENT_SPECS,
} from '../../src/domain/timeline'
import {
  initialState,
  userConfirmed,
  userRejected,
  approvalGranted,
  applyToolResult,
  setPending,
  approvalDecided,
} from '../../src/domain/conversationState'

// 2026-08-15 DDD 重建：领域事件派生（Event Sourcing-lite——转换 diff → 事件）
// 锁定：任意状态转换自动产生对应领域事件（06 事件目录对齐——状态机可回放）

describe('deriveStateEvents（转换 diff → 领域事件）', () => {
  it('目标确认/拒绝 → task.goal_*', () => {
    const s = initialState()
    const confirmed = userConfirmed(s, 'goal')
    expect(deriveStateEvents(s, confirmed).map((e) => e.type)).toContain('task.goal_confirmed')
    const rejected = userRejected(confirmed, 'goal', { kind: 'direction' })
    expect(deriveStateEvents(confirmed, rejected).map((e) => e.type)).toContain(
      'task.goal_rejected',
    )
  })

  it('执行/达成确认/拒绝 → task.execution_*/task.achievement_*', () => {
    let s = userConfirmed(initialState(), 'goal')
    const exec = userConfirmed(s, 'plan')
    const t1 = deriveStateEvents(s, exec).map((e) => e.type)
    expect(t1).toContain('task.execution_confirmed')
    s = exec
    const ach = userConfirmed(s, 'resolution')
    expect(deriveStateEvents(s, ach).map((e) => e.type)).toContain('task.achievement_confirmed')
    expect(
      deriveStateEvents(ach, userRejected(ach, 'resolution', { kind: 'scope' })).map((e) => e.type),
    ).toContain('task.achievement_rejected')
  })

  it('pending 置位/清除 → session.pending_set/cleared（含 kind）', () => {
    const s = initialState()
    const pending = setPending(s, 'goal')
    const setEvts = deriveStateEvents(s, pending)
    expect(setEvts).toContainEqual(
      expect.objectContaining({ type: 'session.pending_set', detail: { kind: 'goal' } }),
    )
    const cleared = userConfirmed(pending, 'goal') // 确认清 pending
    const clearEvts = deriveStateEvents(pending, cleared)
    expect(clearEvts).toContainEqual(
      expect.objectContaining({ type: 'session.pending_cleared', detail: { kind: 'goal' } }),
    )
  })

  it('计划清单追加 → plan.approved（files 载荷——追加语义）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const next = approvalGranted(s, ['/test/a.js', '/test/b.js'])
    const evts = deriveStateEvents(s, next)
    expect(evts).toContainEqual(
      expect.objectContaining({
        type: 'plan.approved',
        detail: { files: ['/test/a.js', '/test/b.js'] },
      }),
    )
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
    expect(evts).toContainEqual(
      expect.objectContaining({ type: 'tool.executed', detail: { files: ['/test/a.js'] } }),
    )
  })

  it('无状态变化 → 无事件（幂等）', () => {
    const s = initialState()
    expect(deriveStateEvents(s, s)).toEqual([])
  })
})

describe('validateTimelineEvent（注册表——A2 接入约束）', () => {
  it('已登记事件 + 齐全载荷 → 无警告', () => {
    expect(validateTimelineEvent('task.goal_confirmed', { point: 'goal' })).toEqual([])
    expect(
      validateTimelineEvent('tool.blocked', { name: 'write', gate: 'pending', reason: 'x' }),
    ).toEqual([])
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
    expect(dedupeKey('card.shown', { card: 'goal' })).toBe(
      dedupeKey('card.shown', { card: 'goal' }),
    )
    expect(dedupeKey('card.shown', { card: 'goal' })).not.toBe(
      dedupeKey('card.shown', { card: 'plan' }),
    )
  })
  it('detectProposed：标记 → 提议事件（载荷）', () => {
    expect(detectProposed('好的。【目标确认：做一个游戏】')).toContainEqual({
      type: 'task.goal_proposed',
      detail: { goalText: '做一个游戏' },
    })
    expect(detectProposed('【执行方案】\n- a.js')).toContainEqual({
      type: 'task.execution_proposed',
      detail: expect.objectContaining({}),
    })
    expect(detectProposed('完成【已达成】')).toContainEqual({
      type: 'task.achievement_proposed',
      detail: expect.objectContaining({}),
    })
  })
  it('detectProposed：无标记 → 空', () => {
    expect(detectProposed('我先看看项目结构。')).toEqual([])
    expect(detectProposed('')).toEqual([])
  })
})

// 2026-08-16 意图确认重设计 S1（Q1 审计修复）：decision.requested/resolved 事件派生锁定（三步登记第 3 步）
describe('deriveStateEvents（decision.* 领域决策点事件——设计 §3.5）', () => {
  it('pending_set 同发 decision.requested（kind + since 快照）', () => {
    const s = initialState()
    const next = setPending(s, 'goal', {
      proposal: { statement: 'g', assumptions: [] },
      since: 't1',
    })
    const events = deriveStateEvents(s, next)
    expect(events.map((e) => e.type)).toContain('decision.requested')
    const evt = events.find((e) => e.type === 'decision.requested')
    expect(evt?.detail.kind).toBe('goal')
    expect(evt?.detail.since).toBe('t1')
    // 与 session.pending_set 并存（领域视图 + 会话视图——§3.5 两层语义）
    expect(events.map((e) => e.type)).toContain('session.pending_set')
  })

  it('plan 确认 → decision.resolved（point: plan, action: confirm）', () => {
    const s = setPending(userConfirmed(initialState(), 'goal'), 'plan', {
      proposal: { summary: 'p', files: [], assumptions: [], verificationPlan: [] },
      since: 't',
    })
    const next = userConfirmed(s, 'plan')
    const evt = deriveStateEvents(s, next).find((e) => e.type === 'decision.resolved')
    expect(evt?.detail).toEqual({ point: 'plan', action: 'confirm' })
  })

  it('plan 拒绝 → decision.resolved（point: plan, action: reject）', () => {
    const s = setPending(userConfirmed(initialState(), 'goal'), 'plan', {
      proposal: { summary: 'p', files: [], assumptions: [], verificationPlan: [] },
      since: 't',
    })
    const next = userRejected(s, 'plan', { kind: 'scope' })
    const evt = deriveStateEvents(s, next).find((e) => e.type === 'decision.resolved')
    expect(evt?.detail).toEqual({ point: 'plan', action: 'reject' })
  })

  it('approval 允许 → decision.resolved（point: approval, action: confirm）；拒绝 → reject（拒绝记忆 diff 推断）', () => {
    const req = { toolName: 'bash', subject: 'rm -rf /', reason: '高危', risk: 'high' as const }
    const s = setPending(userConfirmed(userConfirmed(initialState(), 'goal'), 'plan'), 'approval', {
      approval: req,
      since: 't',
    })
    const allow = deriveStateEvents(s, approvalDecided(s, req, { confirm: true }))
    expect(allow.find((e) => e.type === 'decision.resolved')?.detail).toEqual({
      point: 'approval',
      action: 'confirm',
    })
    const deny = deriveStateEvents(
      s,
      approvalDecided(s, req, { confirm: false, reason: { kind: 'direction' } }),
    )
    expect(deny.find((e) => e.type === 'decision.resolved')?.detail).toEqual({
      point: 'approval',
      action: 'reject',
    })
  })
})

// S3 spec TDD 网格：proposal.* 事件断言（A-003 关闭 + A-007 schema 与载荷对齐）
describe('proposal.* 事件（S3 接线断言——A-003/A-007）', () => {
  it('注册表 schema：proposal.plan/completion domain=proposal + detailKeys 两形态表达（? 可选标记）', () => {
    const plan = TIMELINE_EVENT_SPECS['proposal.plan']
    const completion = TIMELINE_EVENT_SPECS['proposal.completion']
    expect(plan.domain).toBe('proposal')
    expect(plan.role).toBe('assistant')
    // A-007：ok 必选 + 形态字段可选（成功 summary/files；失败 reason）
    expect(plan.detailKeys).toEqual(['ok', '?summary', '?files', '?reason'])
    expect(completion.domain).toBe('proposal')
    expect(completion.detailKeys).toEqual(
      expect.arrayContaining(['ok', '?summary', '?verification', '?pendingQuestions']),
    )
  })

  it('validateTimelineEvent：proposal.plan 载荷通过校验（parse 成功载荷——形态字段在场）', () => {
    const warns = validateTimelineEvent('proposal.plan', {
      ok: true,
      summary: '重构',
      files: ['src/a.ts'],
    })
    expect(warns).toEqual([])
  })

  it('validateTimelineEvent：proposal.plan parse-error 载荷（ok:false + reason: malformed——形态字段缺省不 warn）', () => {
    const warns = validateTimelineEvent('proposal.plan', { ok: false, reason: 'malformed' })
    expect(warns).toEqual([])
  })

  it('validateTimelineEvent：proposal.plan 缺 ok（必选字段）→ warn（schema 有校验价值）', () => {
    const warns = validateTimelineEvent('proposal.plan', { summary: '重构' })
    expect(warns.some((w) => w.includes('ok'))).toBe(true)
  })
})

// S4 spec TDD 网格：completion.evidence_missing 事件断言（§3.5——完成声明被拒原因 missing 清单）
describe('completion.evidence_missing 事件（S4 接线断言）', () => {
  it('注册表 schema：domain=completion + detailKeys 含 ok/missing/unverifiable（A-007 ? 可选标记）', () => {
    const spec = TIMELINE_EVENT_SPECS['completion.evidence_missing']
    expect(spec.domain).toBe('completion')
    expect(spec.role).toBe('system')
    expect(spec.detailKeys).toEqual(['ok', '?missing', '?unverifiable'])
  })

  it('validateTimelineEvent：证据不足载荷（ok:false + missing 清单）通过校验', () => {
    const warns = validateTimelineEvent('completion.evidence_missing', {
      ok: false,
      missing: ['verification:ls src'],
      unverifiable: [],
    })
    expect(warns).toEqual([])
  })

  it('validateTimelineEvent：缺 ok（必选字段）→ warn（schema 有校验价值）', () => {
    const warns = validateTimelineEvent('completion.evidence_missing', { missing: ['x'] })
    expect(warns.some((w) => w.includes('ok'))).toBe(true)
  })
})
