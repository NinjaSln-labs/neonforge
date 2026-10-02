import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  initialState,
  userConfirmed,
  userRejected,
  setPending,
  type ConversationState,
} from '../../src/domain/conversationState'
import { deriveStateEvents } from '../../src/domain/timeline'
import { useConversationState } from '../../src/renderer/useConversationState'

// ADR-017 B4.1：hook 窗口面真实执行（node 环境无 jsdom/RTL——mock react 的 useRef/useState
// 为单帧壳，hook 函数体直调；transition/emit 语义为真身）
vi.mock('react', () => ({
  useRef: <T>(v: T) => ({ current: v }),
  useState: <T>(v: T) => [v, () => {}],
}))

// S3 spec TDD 网格：useConversationState 的转换语义（A-006——reject reason 必传——不变量 8）
// hook 是 useRef + transition 薄封装（纯函数转换 + diff 事件派生）——L1 直接测底层转换与事件，
// 语义与 hook 完全一致（hook 不引入额外逻辑——见 useConversationState.ts transition 实现）

const planPending = (s: ConversationState, summary = 'p'): ConversationState =>
  setPending(s, 'plan', {
    proposal: { summary, files: [], assumptions: [], verificationPlan: [] },
    since: 't',
  })

describe('useConversationState 转换语义（A-006：reject reason 必传——不变量 8）', () => {
  it('reject 带 reason → 状态回退 + rejectStreak 递增 + decision.resolved 事件', () => {
    let s = userConfirmed(initialState(), 'goal')
    s = planPending(s)
    const before = s
    const after = userRejected(s, 'plan', { kind: 'scope', target: 'plan' })
    expect(after.planConfirmed).toBe(false) // 回退
    expect(after.pending).toBe('none') // 决策点清除
    expect(after.rejectStreak).toBe(before.rejectStreak + 1) // 连续拒绝计数
    expect(after.decisionContent).toBeUndefined() // 快照清除
    // 事件派生（transition diff → decision.resolved reject）
    const evts = deriveStateEvents(before, after)
    expect(evts.some((e) => e.type === 'decision.resolved' && e.detail.action === 'reject')).toBe(
      true,
    )
  })

  it('reject 无 reason → throw（不变量 8 真身——缺省不再掩盖漏传）', () => {
    const s = planPending(userConfirmed(initialState(), 'goal'))
    expect(() => userRejected(s, 'plan', undefined as unknown as { kind: 'scope' })).toThrow(
      TypeError,
    )
  })

  it('确认后 rejectStreak 重置（§4.1 C8）+ decision.resolved confirm 事件', () => {
    let s = userConfirmed(initialState(), 'goal')
    s = planPending(s)
    s = userRejected(s, 'plan', { kind: 'scope' }) // streak 1
    s = planPending(s, 'p2')
    const before = s
    const after = userConfirmed(s, 'plan')
    expect(after.planConfirmed).toBe(true)
    expect(after.rejectStreak).toBe(0) // 确认重置
    const evts = deriveStateEvents(before, after)
    expect(evts.some((e) => e.type === 'decision.resolved' && e.detail.action === 'confirm')).toBe(
      true,
    )
  })
})

// ============================================================================
// ADR-017 B4.1：hook 窗口面装配（requestApproval/decideApproval 打点＋五委托＋B5.5 让位回槽）
// ============================================================================

const mkHook = () => {
  const events: Array<{ type: string; detail: Record<string, unknown> }> = []
  // 测试壳（react 已 mock 为单帧实现）：hook 函数体按普通函数直调——非渲染语境，lint 规则豁免
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const h = useConversationState({
    emit: (type, detail) => events.push({ type, detail }),
  })
  return { h, events }
}

const rec = (requestId: string, argsFingerprint = 'fp1') => ({
  requestId,
  kind: 'tool' as const,
  toolName: 'bash',
  subject: 'rm -rf /tmp/x',
  argsFingerprint,
  request: { toolName: 'bash', subject: 'rm -rf /tmp/x', reason: '危险', risk: 'high' as const },
})

describe('ADR-017 B4.1 hook 窗口面装配', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requestApproval 首次 true（开窗置槽）；同 id 再入 false＋approval.duplicate_ingress（fingerprintMatch）', () => {
    const { h, events } = mkHook()
    expect(h.requestApproval(rec('apr_1'), false)).toBe(true)
    expect(h.stateRef.current.pending).toBe('approval')
    // 同 id 重复入窗（异指纹）→ false＋打点 fingerprintMatch:false（签发唯一性违背信号）
    expect(h.requestApproval(rec('apr_1', 'fp2'), false)).toBe(false)
    const dup = events.find((e) => e.type === 'approval.duplicate_ingress')
    expect(dup?.detail.requestId).toBe('apr_1')
    expect(dup?.detail.fingerprintMatch).toBe(false)
    // 窗内记录不重复
    expect(h.stateRef.current.approvalWindow.requests).toHaveLength(1)
  })

  it('decideApproval 闸 miss（id∉窗）→ false＋conversation.stale_input_discarded（answers×窗态摘要）', () => {
    const { h, events } = mkHook()
    h.requestApproval(rec('apr_1'), false)
    expect(h.decideApproval({ requestId: 'nope' }, { confirm: true })).toBe(false)
    const stale = events.find((e) => e.type === 'conversation.stale_input_discarded')
    expect(stale?.detail.answers).toBe('nope')
    expect(stale?.detail.window).toEqual([{ requestId: 'apr_1', state: 'pending' }])
    // 窗未被误动
    expect(h.stateRef.current.approvalWindow.requests[0].state).toBe('pending')
  })

  it('委托族正确性：decide→settle(failed)→reconcile→expire→resolveUncertain→drain 各归其位', () => {
    const { h } = mkHook()
    // decide 进门（true）→ approved＋decidedBy user
    h.requestApproval(rec('apr_1'), false)
    expect(h.decideApproval({ requestId: 'apr_1' }, { confirm: true })).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[0]).toMatchObject({
      state: 'approved',
      decidedBy: 'user',
    })
    // settle failed → 记录收敛 failed（done 幂等 no-op）
    expect(h.settleApproval('apr_1', 'failed')).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[0].state).toBe('failed')
    expect(h.settleApproval('apr_1', 'done')).toBe(false)
    // reconcile：started → uncertain；resolveUncertain 唯一出口 → approved
    h.requestApproval(rec('apr_2'), false)
    expect(h.reconcileWindow([{ requestId: 'apr_2', phase: 'started' }])).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[1].state).toBe('uncertain')
    expect(h.resolveUncertainFn('apr_2', 'settled-done')).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[1].state).toBe('approved')
    // expire：legacy 到期——approved∧未 settled 记录 → failed（"批了没跑"＝失败可重批）
    expect(h.expireWindowFn('legacy')).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[1].state).toBe('failed')
    expect(h.stateRef.current.pending).toBe('none')
    // drain：queued 顶上（先入 queued——slotBusy=true 且槽空但无可见？slotBusy 真→queued）
    h.requestApproval(rec('apr_3'), true)
    expect(h.stateRef.current.approvalWindow.requests[2].state).toBe('queued')
    expect(h.drainWindow()).toBe(true)
    expect(h.stateRef.current.approvalWindow.requests[2].state).toBe('pending')
    expect(h.stateRef.current.pending).toBe('approval')
  })

  it('B5.5 双向案：goal 卡接管槽 → confirm 释放 → 窗有可见 pending 记录则槽回 approval', () => {
    vi.stubGlobal('window', { neonforge: {} }) // confirm 的 main 镜像通道（goal → setPlanConfirmed）
    const { h } = mkHook()
    h.requestApproval(rec('apr_1'), false) // 开窗：记录 pending＋槽 approval
    // 确认卡接管：setPending('goal') 覆盖槽值——窗记录保持呈现态
    h.setPending('goal', {
      proposal: { statement: 'g', assumptions: [] },
      since: 't',
    })
    expect(h.stateRef.current.pending).toBe('goal')
    // confirm 释放槽 → windowResolved 回拨 approval（卡呈现记录不变）
    expect(h.confirm('goal')).toBe(true)
    expect(h.stateRef.current.pending).toBe('approval')
    expect(h.stateRef.current.approvalWindow.requests[0].state).toBe('pending')
  })
})
