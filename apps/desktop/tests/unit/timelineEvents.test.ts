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
  approvalRequested,
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
    expect(evt?.detail).toEqual({
      point: 'plan',
      action: 'confirm',
      answeredInstanceId: 1, // ADR-015：被应答实例回放键
    })
  })

  it('plan 拒绝 → decision.resolved（point: plan, action: reject + reason——S7 P1-4）', () => {
    const s = setPending(userConfirmed(initialState(), 'goal'), 'plan', {
      proposal: { summary: 'p', files: [], assumptions: [], verificationPlan: [] },
      since: 't',
    })
    const next = userRejected(s, 'plan', { kind: 'scope', target: 'plan' })
    const evt = deriveStateEvents(s, next).find((e) => e.type === 'decision.resolved')
    expect(evt?.detail).toEqual({
      point: 'plan',
      action: 'reject',
      reason: { kind: 'scope', target: 'plan' },
      answeredInstanceId: 1, // ADR-015
    })
  })

  it('approval 允许 → decision.resolved（point: approval, action: confirm）；拒绝 → reject（拒绝记忆 diff 推断）', () => {
    const req = { toolName: 'bash', subject: 'rm -rf /', reason: '高危', risk: 'high' as const }
    // ADR-017 B2 改型：窗记录入窗（approvalRequested）——dc/seq 铺现骨架供 answeredInstanceId 回放；
    // 派生规则本体改窗 diff 属 B3（本案锁定 pending/cleared＋拒绝记忆 diff 推断面不回归）
    const s = approvalRequested(
      setPending(userConfirmed(userConfirmed(initialState(), 'goal'), 'plan'), 'approval', {
        approval: req,
        since: 't',
      }),
      {
        requestId: 'tl-1',
        kind: 'tool',
        toolName: req.toolName,
        subject: req.subject,
        argsFingerprint: 'fp',
        request: req,
      },
      false,
    )
    const allow = deriveStateEvents(s, approvalDecided(s, { requestId: 'tl-1' }, { confirm: true }))
    expect(allow.find((e) => e.type === 'decision.resolved')?.detail).toEqual({
      point: 'approval',
      action: 'confirm',
      answeredInstanceId: 1, // ADR-015
    })
    const deny = deriveStateEvents(
      s,
      approvalDecided(s, { requestId: 'tl-1' }, { confirm: false, reason: { kind: 'direction' } }),
    )
    expect(deny.find((e) => e.type === 'decision.resolved')?.detail).toEqual({
      point: 'approval',
      action: 'reject',
      reason: { kind: 'direction' }, // S7 P1-4：拒绝原因入载荷
      answeredInstanceId: 1, // ADR-015
    })
  })
})

// S7（A0 审校 P1-3）：proposal.goal 事件登记断言（设计 §3.5——statement+assumptions）
describe('proposal.goal 事件（S7——A0 审校 P1-3 补登）', () => {
  it('注册表 schema：domain=proposal + detailKeys statement/?assumptions', () => {
    const spec = TIMELINE_EVENT_SPECS['proposal.goal']
    expect(spec.domain).toBe('proposal')
    expect(spec.role).toBe('assistant')
    expect(spec.detailKeys).toEqual(['statement', '?assumptions'])
  })

  it('validateTimelineEvent：目标提议载荷（statement + assumptions）通过校验', () => {
    const warns = validateTimelineEvent('proposal.goal', {
      statement: '做一个待办应用',
      assumptions: ['使用 React 19'],
    })
    expect(warns).toEqual([])
  })

  it('validateTimelineEvent：缺 statement（必选）→ warn', () => {
    const warns = validateTimelineEvent('proposal.goal', { assumptions: ['x'] })
    expect(warns.some((w) => w.includes('statement'))).toBe(true)
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

// S5 spec TDD 网格：execution.forced/released 事件语义更新（mode/reason 可回放——区分「逼工具」与「逼推进」）
describe('execution.forced/released（S5——mode/reason 事件语义）', () => {
  it('注册表 schema：detailKeys 含 reason + ?mode（S5 语义更新）', () => {
    expect(TIMELINE_EVENT_SPECS['execution.forced'].detailKeys).toEqual(['reason', '?mode'])
    expect(TIMELINE_EVENT_SPECS['execution.released'].detailKeys).toEqual(['reason', '?mode'])
  })

  it('validateTimelineEvent：mode/reason 载荷通过校验（require-action/require-advance/auto 可回放）', () => {
    const warns = validateTimelineEvent('execution.forced', {
      mode: 'require-action',
      reason: 'confirmed-no-progress-tools-available',
    })
    expect(warns).toEqual([])
    const warns2 = validateTimelineEvent('execution.released', {
      mode: 'require-advance',
      reason: 'confirmed-no-progress-no-tools',
    })
    expect(warns2).toEqual([])
  })

  it('validateTimelineEvent：缺 reason（必选）→ warn（schema 有校验价值）', () => {
    const warns = validateTimelineEvent('execution.forced', { mode: 'require-action' })
    expect(warns.some((w) => w.includes('reason'))).toBe(true)
  })
})

// ADR-015：decision.requested 随实例推进（β 命门呈现面补记录）＋ resolved 回放键 ＋ stale 事件登记
describe('ADR-015 决策点实例事件（requested 随 seq 推进/answeredInstanceId/stale 登记）', () => {
  const planP = (files: string[]) => ({
    proposal: {
      summary: 'p',
      files: files.map((f) => ({ path: f, reason: 'r' })),
      assumptions: [],
      verificationPlan: [],
    },
    since: 't',
  })
  it('同 kind 续提议新实例 → 重发 decision.requested(instanceId=2) 且无 session.pending_set；等值重提议不重发', () => {
    const s = setPending(initialState(), 'plan', planP(['a']))
    expect(deriveStateEvents(initialState(), s).map((e) => e.type)).toContain('decision.requested')
    const same = setPending(s, 'plan', planP(['a'])) // 等值重提议＝同实例
    expect(deriveStateEvents(s, same).map((e) => e.type)).not.toContain('decision.requested')
    const b = setPending(same, 'plan', planP(['a', 'b'])) // 实质变＝新实例（pending 未翻转）
    const evts = deriveStateEvents(same, b).map((e) => e.type)
    expect(evts).toContain('decision.requested')
    expect(evts).not.toContain('session.pending_set')
    const req = deriveStateEvents(same, b).find((e) => e.type === 'decision.requested')
    expect(req?.detail.instanceId).toBe(2)
  })
  it('decision.resolved 携 answeredInstanceId（被应答实例回放键）', () => {
    const s = setPending(initialState(), 'plan', planP(['a']))
    const after = userRejected(s, 'plan', { kind: 'scope' })
    const evt = deriveStateEvents(s, after).find((e) => e.type === 'decision.resolved')
    expect(evt?.detail.answeredInstanceId).toBe(1)
  })
  it('conversation.stale_input_discarded 已登记（domain=conversation——Record 双写编译强制）', () => {
    expect(TIMELINE_EVENT_SPECS['conversation.stale_input_discarded'].domain).toBe('conversation')
    expect(TIMELINE_EVENT_SPECS['conversation.stale_input_discarded'].detailKeys).toContain(
      'answers',
    )
  })
})
