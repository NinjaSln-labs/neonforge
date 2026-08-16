import { describe, it, expect } from 'vitest'
import {
  initialState,
  userConfirmed,
  userRejected,
  setPending,
  type ConversationState,
} from '../../src/domain/conversationState'
import { deriveStateEvents } from '../../src/domain/timeline'

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
