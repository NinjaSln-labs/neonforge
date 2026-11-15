import { describe, it, expect } from 'vitest'
import { initialState, type ConversationState } from '../../src/domain/conversationState'
import {
  TASK_SNAPSHOT_VERSION,
  fromTaskSnapshot,
  toTaskSnapshot,
} from '../../src/domain/taskSnapshot'

const richState = (): ConversationState => ({
  ...initialState(),
  goalConfirmed: true,
  planConfirmed: true,
  resolutionConfirmed: false,
  pending: 'plan',
  plannedFiles: new Set(['/test/index.html', '/test/style.css']),
  producedFiles: new Set(['/test/index.html']),
  filesApproved: true,
  lastToolFailed: true,
  decisionContent: {
    kind: 'plan',
    since: '2026-11-15T00:00:00.000Z',
    proposal: {
      summary: '写首页',
      files: [{ path: '/test/index.html', reason: '入口' }],
      assumptions: ['原生 HTML'],
      verificationPlan: ['打开页面'],
    },
  },
  deniedApprovals: [{ toolName: 'bash', subject: 'rm -rf build' }],
  rejectStreak: 2,
  lastRejectReason: { kind: 'scope', text: '不要动样式', target: 'style.css' },
  pendingRepeatCount: 3,
  unresolvedTextReplies: 1,
})

describe('taskSnapshot（A1 Task 跨重启快照）', () => {
  it('完整状态 → 快照 → 状态：确认位/集合/pending/决策内容/拒绝记忆全保留', () => {
    const state = richState()
    const snapshot = toTaskSnapshot(state)
    expect(snapshot.version).toBe(TASK_SNAPSHOT_VERSION)
    expect(snapshot.plannedFiles).toEqual(['/test/index.html', '/test/style.css'])
    expect(snapshot.producedFiles).toEqual(['/test/index.html'])
    expect(snapshot.decisionContent?.kind).toBe('plan')
    const restored = fromTaskSnapshot(snapshot)
    expect(restored).not.toBeNull()
    expect(restored?.goalConfirmed).toBe(true)
    expect(restored?.planConfirmed).toBe(true)
    expect(restored?.resolutionConfirmed).toBe(false)
    expect(restored?.pending).toBe('plan')
    expect([...(restored?.plannedFiles ?? [])]).toEqual(['/test/index.html', '/test/style.css'])
    expect([...(restored?.producedFiles ?? [])]).toEqual(['/test/index.html'])
    expect(restored?.filesApproved).toBe(true)
    expect(restored?.lastToolFailed).toBe(true)
    expect(restored?.decisionContent).toEqual(state.decisionContent)
    expect(restored?.deniedApprovals).toEqual(state.deniedApprovals)
    expect(restored?.rejectStreak).toBe(2)
    expect(restored?.lastRejectReason).toEqual(state.lastRejectReason)
    expect(restored?.pendingRepeatCount).toBe(3)
    expect(restored?.unresolvedTextReplies).toBe(1)
  })

  it('JSON 往返（localStorage 路径）后仍可恢复', () => {
    const restored = fromTaskSnapshot(JSON.parse(JSON.stringify(toTaskSnapshot(richState()))))
    expect(restored?.plannedFiles.has('/test/index.html')).toBe(true)
    expect(restored?.decisionContent?.proposal).toBeTruthy()
  })

  it('版本不符 → null（不崩溃）', () => {
    expect(fromTaskSnapshot({ ...toTaskSnapshot(richState()), version: 99 })).toBeNull()
  })

  it('pending 枚举/必填字段类型非法 → null', () => {
    const snapshot = toTaskSnapshot(richState()) as unknown as Record<string, unknown>
    expect(fromTaskSnapshot({ ...snapshot, pending: 'execution' })).toBeNull()
    expect(fromTaskSnapshot({ ...snapshot, goalConfirmed: 'yes' })).toBeNull()
    expect(fromTaskSnapshot({ ...snapshot, plannedFiles: [1] })).toBeNull()
    expect(fromTaskSnapshot({ ...snapshot, deniedApprovals: [{}] })).toBeNull()
  })

  it('合法状态：resolution 确认后 planConfirmed=false 不被拒（A-025 任务边界）', () => {
    const state: ConversationState = {
      ...initialState(),
      goalConfirmed: true,
      planConfirmed: false,
      resolutionConfirmed: true,
      producedFiles: new Set(['/test/x.html']),
    }
    expect(fromTaskSnapshot(toTaskSnapshot(state))?.resolutionConfirmed).toBe(true)
  })

  it('合法状态：目标拒绝后 planConfirmed=true 不被拒（拒绝不回滚方案确认位）', () => {
    const state: ConversationState = {
      ...initialState(),
      goalConfirmed: false,
      planConfirmed: true,
      plannedFiles: new Set(['/test/a.js']),
    }
    expect(fromTaskSnapshot(toTaskSnapshot(state))?.planConfirmed).toBe(true)
  })

  it('可选字段损坏 → 丢弃该字段，不阻断其余快照', () => {
    const snapshot = toTaskSnapshot(richState()) as unknown as Record<string, unknown>
    const restored = fromTaskSnapshot({
      ...snapshot,
      pending: 'none',
      decisionContent: { kind: 'unknown', since: 't' },
      lastRejectReason: { kind: 'nope' },
    })
    expect(restored).not.toBeNull()
    expect(restored?.decisionContent).toBeUndefined()
    expect(restored?.lastRejectReason).toBeUndefined()
    expect(restored?.pending).toBe('none')
  })

  it('非 approval 决策点缺少可渲染内容 → 整快照拒绝（防卡渲染崩溃/卡死）', () => {
    const snapshot = toTaskSnapshot(richState()) as unknown as Record<string, unknown>
    expect(
      fromTaskSnapshot({
        ...snapshot,
        decisionContent: { kind: 'plan', since: 't', proposal: { summary: 'x' } },
      }),
    ).toBeNull()
    expect(fromTaskSnapshot({ ...snapshot, decisionContent: undefined })).toBeNull()
  })

  it('proposal 嵌套字段结构非法 → 拒绝（防止卡渲染 TypeError）', () => {
    const snapshot = toTaskSnapshot(richState()) as unknown as Record<string, unknown>
    const badPlan = {
      kind: 'plan',
      since: 't',
      proposal: { summary: 'x', files: [{ path: 'a' }], assumptions: [], verificationPlan: [] },
    }
    expect(fromTaskSnapshot({ ...snapshot, decisionContent: badPlan })).toBeNull()
  })

  it('非对象/损坏 JSON 值 → null', () => {
    expect(fromTaskSnapshot(null)).toBeNull()
    expect(fromTaskSnapshot('broken')).toBeNull()
    expect(fromTaskSnapshot([])).toBeNull()
  })
})
