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

  it('方案/解决确认/拒绝 → task.plan_*/task.resolution_*（规范名）', () => {
    let s = userConfirmed(initialState(), 'goal')
    const exec = userConfirmed(s, 'plan')
    const t1 = deriveStateEvents(s, exec).map((e) => e.type)
    expect(t1).toContain('task.plan_confirmed')
    s = exec
    const ach = userConfirmed(s, 'resolution')
    expect(deriveStateEvents(s, ach).map((e) => e.type)).toContain('task.resolution_confirmed')
    expect(
      deriveStateEvents(ach, userRejected(ach, 'resolution', { kind: 'scope' })).map((e) => e.type),
    ).toContain('task.resolution_rejected')
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

  it('产出新增 → task.files_produced（files 载荷；不与 tool.executed 重复）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const next = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    const evts = deriveStateEvents(s, next)
    expect(evts).toContainEqual(
      expect.objectContaining({ type: 'task.files_produced', detail: { files: ['/test/a.js'] } }),
    )
    expect(evts.some((e) => e.type === 'tool.executed')).toBe(false)
  })

  it('无状态变化 → 无事件（幂等）', () => {
    const s = initialState()
    expect(deriveStateEvents(s, s)).toEqual([])
  })

  // 2026-11-24 审计：确认位「掉落」不是拒绝——任务边界重置不得误发 *_rejected
  it('解决确认重置 planConfirmed → 不发 task.plan_rejected（只发 resolution_confirmed）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const ach = userConfirmed(s, 'resolution')
    const types = deriveStateEvents(s, ach).map((e) => e.type)
    expect(types).toContain('task.resolution_confirmed')
    expect(types).not.toContain('task.plan_rejected')
  })

  it('新目标确认重置 plan/resolution → 不发 plan_rejected/resolution_rejected', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    s = userConfirmed(s, 'resolution')
    const newGoalPending = setPending(s, 'goal')
    // goalConfirmed 已为 true（重确认）——确认位无「上升」，必须靠转换原因（cause）发事件
    const newGoal = userConfirmed(newGoalPending, 'goal')
    const types = deriveStateEvents(newGoalPending, newGoal, {
      action: 'confirm',
      point: 'goal',
    }).map((e) => e.type)
    expect(types).toContain('task.goal_confirmed')
    expect(types).not.toContain('task.plan_rejected')
    expect(types).not.toContain('task.resolution_rejected')
  })

  it('初始目标/方案的普通拒绝（false→false）仍发对应 rejection 事件', () => {
    const s = initialState()
    const pendingGoal = setPending(s, 'goal')
    const rejectedGoal = userRejected(pendingGoal, 'goal', { kind: 'direction' })
    const goalTypes = deriveStateEvents(pendingGoal, rejectedGoal, {
      action: 'reject',
      point: 'goal',
    }).map((e) => e.type)
    expect(goalTypes).toContain('task.goal_rejected')
    expect(
      deriveStateEvents(pendingGoal, rejectedGoal, { action: 'reject', point: 'goal' }).find(
        (e) => e.type === 'task.goal_rejected',
      )?.detail.reason,
    ).toEqual({ kind: 'direction' })

    const planPending = setPending(userConfirmed(initialState(), 'goal'), 'plan')
    const planRejected = userRejected(planPending, 'plan', { kind: 'scope' })
    expect(
      deriveStateEvents(planPending, planRejected, { action: 'reject', point: 'plan' }).map(
        (e) => e.type,
      ),
    ).toContain('task.plan_rejected')
  })

  it('确认转换不误发拒绝（cause=confirm 即使确认位掉落）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    const ach = userConfirmed(s, 'resolution')
    const types = deriveStateEvents(s, ach, { action: 'confirm', point: 'resolution' }).map(
      (e) => e.type,
    )
    expect(types).toContain('task.resolution_confirmed')
    expect(types).not.toContain('task.plan_rejected')
    expect(types).not.toContain('task.resolution_rejected')
  })

  it('解决卡「还要改」（resolution 仍为 false 的拒绝）发 task.resolution_rejected', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'plan')
    s = userConfirmed(s, 'resolution')
    const pending = setPending(s, 'resolution')
    const rejected = userRejected(pending, 'resolution', { kind: 'scope' })
    const types = deriveStateEvents(pending, rejected, {
      action: 'reject',
      point: 'resolution',
    }).map((e) => e.type)
    expect(types).toContain('task.resolution_rejected')
    expect(types).toContain('decision.resolved')
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
  // ADR-017：扩展能力变化/回收事件登记（能力指纹与授权重审可观测）
  it('extension.capabilities_changed / extension.unregistered 已登记且载荷齐全', () => {
    expect(
      validateTimelineEvent('extension.capabilities_changed', {
        extensionId: 'mcp:fs',
        oldDigest: 'read_file:high',
        newDigest: 'read_file:high|write_file:high',
        added: ['write_file'],
        removed: [],
      }),
    ).toEqual([])
    expect(
      validateTimelineEvent('extension.unregistered', {
        extensionId: 'mcp:fs',
        kind: 'mcp',
      }),
    ).toEqual([])
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
      type: 'task.plan_proposed',
      detail: expect.objectContaining({}),
    })
    expect(detectProposed('完成【已达成】')).toContainEqual({
      type: 'task.resolution_proposed',
      detail: expect.objectContaining({}),
    })
  })
  it('detectProposed：无标记 → 空', () => {
    expect(detectProposed('我先看看项目结构。')).toEqual([])
    expect(detectProposed('')).toEqual([])
  })

  it('事件注册表包含 conversation.auto_continue（自动续跑可断言——审计批次 3）', () => {
    expect(TIMELINE_EVENT_SPECS['conversation.auto_continue']).toMatchObject({
      domain: 'conversation',
      detailKeys: ['errorType', 'reason'],
    })
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
    // 2026-11-24 审计：决策点内容快照随事件入时间线（「用户当时看到了什么」可事后审计）
    expect(evt?.detail.content).toEqual(next.decisionContent)
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
    })
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
      reason: { kind: 'direction' }, // S7 P1-4：拒绝原因入载荷
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
      assumptions: [{ text: '使用 React 19', source: 'model_inference' }],
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

// ADR-015：委托越界事件 + tool.executing 带来源审计
describe('security.trust_delegation_denied / tool.executing（ADR-015）', () => {
  it('注册表：委托拒绝 = domain security + name/path/reason', () => {
    const spec = TIMELINE_EVENT_SPECS['security.trust_delegation_denied']
    expect(spec.domain).toBe('security')
    expect(spec.role).toBe('system')
    expect(spec.detailKeys).toEqual(['name', 'path', 'reason'])
  })

  it('validateTimelineEvent：委托拒绝载荷通过；缺 reason → warn', () => {
    expect(
      validateTimelineEvent('security.trust_delegation_denied', {
        name: 'write',
        path: '/x/out.txt',
        reason: '目标不在已批准方案清单内',
      }),
    ).toEqual([])
    expect(
      validateTimelineEvent('security.trust_delegation_denied', { name: 'write', path: '/x' }).some(
        (w) => w.includes('reason'),
      ),
    ).toBe(true)
  })

  it('tool.executing：approvalSource 可选载荷（自动/用户/委托可回放）', () => {
    expect(TIMELINE_EVENT_SPECS['tool.executing'].detailKeys).toEqual([
      'name',
      'approved',
      '?approvalSource',
    ])
    expect(
      validateTimelineEvent('tool.executing', {
        name: 'edit',
        approved: true,
        approvalSource: 'delegate',
      }),
    ).toEqual([])
    expect(validateTimelineEvent('tool.executing', { name: 'edit', approved: false })).toEqual([])
  })
})

// ADR-016（GitHub #16）：机制拒绝事件 gate.denied
describe('gate.denied（ADR-016——机制拒绝结构化）', () => {
  it('注册表：domain gate + name/gate/reason/attribute/risk', () => {
    const spec = TIMELINE_EVENT_SPECS['gate.denied']
    expect(spec.domain).toBe('gate')
    expect(spec.role).toBe('system')
    expect(spec.detailKeys).toEqual(['name', 'gate', 'reason', 'attribute', 'risk'])
  })

  it('validateTimelineEvent：完整载荷通过；缺 attribute/risk → warn', () => {
    expect(
      validateTimelineEvent('gate.denied', {
        name: 'bash',
        gate: 'rejection-memory',
        reason: '动作已被你拒绝（拒绝记忆——同轮同类短封）',
        attribute: { kind: 'hazardous', basis: 'command-chain' },
        risk: 'high',
      }),
    ).toEqual([])
    const warns = validateTimelineEvent('gate.denied', {
      name: 'bash',
      gate: 'rejection-memory',
      reason: 'x',
    })
    expect(warns.some((w) => w.includes('attribute'))).toBe(true)
    expect(warns.some((w) => w.includes('risk'))).toBe(true)
  })
})

// 2026-11-24 审计批次 6：注册表遍历校验（全部 93 事件 schema 自洽 + 必选载荷强制执行）
// 逐事件断言仍是独立缺口（见覆盖矩阵表 2）；本组锁定「登记本身」的结构契约，防漏字段/畸形键。
describe('TIMELINE_EVENT_SPECS 注册表遍历（事件 schema 自洽）', () => {
  const VALID_DOMAINS = new Set([
    'conversation',
    'task',
    'session',
    'plan',
    'tool',
    'security',
    'capability',
    'execution',
    'stuck',
    'problem',
    'usage',
    'changeset',
    'queue',
    'extension',
    'acceptance',
    'card',
    'decision',
    'proposal',
    'completion',
    'gate',
    'protocol',
  ])
  const VALID_ROLES = new Set(['user', 'assistant', 'system', 'tool'])
  const entries = Object.entries(TIMELINE_EVENT_SPECS)

  it('全部事件登记完整：domain/role 合法、detailKeys 无空项/重复/畸形可选前缀', () => {
    expect(entries.length).toBeGreaterThanOrEqual(90) // 2026-11-24 快照 93
    for (const [type, spec] of entries) {
      expect(type).toMatch(/^[a-z_]+\.[a-z_]+$/)
      expect(VALID_DOMAINS.has(spec.domain)).toBe(true)
      if (spec.role !== undefined) expect(VALID_ROLES.has(spec.role)).toBe(true)
      const keys = spec.detailKeys ?? []
      for (const k of keys) {
        expect(k.startsWith('??')).toBe(false)
        expect(k.replace(/^\?/, '')).toMatch(/^[A-Za-z0-9_]+$/)
      }
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('必选载荷字段被强制执行：齐全 → 无警告；逐项缺失 → 精确警告', () => {
    for (const [type, spec] of entries) {
      const required = (spec.detailKeys ?? []).filter((k) => !k.startsWith('?'))
      const valid: Record<string, string> = Object.fromEntries(required.map((k) => [k, 'x']))
      if (required.length > 0) expect(validateTimelineEvent(type, valid)).toEqual([])
      for (const key of required) {
        const missing = { ...valid }
        delete missing[key]
        expect(validateTimelineEvent(type, missing).some((w) => w.includes(key))).toBe(true)
      }
      if (required.length === 0) expect(validateTimelineEvent(type, {})).toEqual([])
    }
  })

  it('未登记事件被拒绝（防新事件绕过 schema 散落）', () => {
    const warns = validateTimelineEvent('not.registered.example', {})
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('未登记')
  })
})
