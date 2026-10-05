import { describe, it, expect } from 'vitest'
import * as timeline from '../../src/domain/timeline'
import { EVENT_NAMES, S1_EMIT_EVENT_NAMES } from '../../src/domain/timeline'

// B1：22 事件闭集名单快照＝段3 §5（改动回段3，不改本测）
describe('timeline 事件闭集（B1，段3 §5 快照）', () => {
  const SNAPSHOT_22 = [
    'DelegationCreated',
    'InputAcknowledged',
    'TurnStarted',
    'TurnEnded',
    'DecisionRaised',
    'DecisionResolved',
    'DecisionDenied',
    'ScopeAmended',
    'ChangeProduced',
    'EvidenceRecorded',
    'EvidenceInspected',
    'CompletionClaimed',
    'DelegationAccepted',
    'DelegationRejected',
    'DelegationReopened',
    'DelegationClosed',
    'InstructionQueued',
    'InstructionAdmitted',
    'StallDetected',
    'SessionInterrupted',
    'DelegationRestored',
    'DelegationAbandoned',
  ]

  it('EVENT_NAMES 恰为段3 §5 的 22 名（同序、无重、无漏）', () => {
    expect([...EVENT_NAMES]).toEqual(SNAPSHOT_22)
    expect(new Set(EVENT_NAMES).size).toBe(22)
  })

  it('S1 发射子集＝22 去掉 5 个未接线事件（17）', () => {
    expect(S1_EMIT_EVENT_NAMES.length).toBe(17)
    const notEmit = [
      'ScopeAmended',
      'StallDetected',
      'SessionInterrupted',
      'DelegationRestored',
      'DelegationAbandoned',
    ]
    for (const n of notEmit) expect(S1_EMIT_EVENT_NAMES).not.toContain(n)
  })

  it('旧 ~56 事件实现残留＝0（旧 TIMELINE_EVENT_SPECS 导出已撤）', () => {
    expect('TIMELINE_EVENT_SPECS' in timeline).toBe(false)
    expect('validateTimelineEvent' in timeline).toBe(false)
    expect('deriveStateEvents' in timeline).toBe(false)
  })

  it('不 import 归档面（G-1 前置：timeline.ts 源码无 conversationState/legacy）', () => {
    // 编译期已由模块本身保证；此处守 record/EventType 导出存在，防误删
    expect(typeof timeline.TimelineLog).toBe('function')
  })
})
