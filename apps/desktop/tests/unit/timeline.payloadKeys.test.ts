import { describe, it, expect } from 'vitest'
import { EMIT_EVENT_NAMES } from '../../src/domain/timeline'
import type {
  DelegationCreatedPayload,
  InputAcknowledgedPayload,
  TurnStartedPayload,
  TurnEndedPayload,
  DecisionRaisedPayload,
  DecisionResolvedPayload,
  DecisionDeniedPayload,
  ScopeAmendedPayload,
  ChangeProducedPayload,
  EvidenceRecordedPayload,
  EvidenceInspectedPayload,
  CompletionClaimedPayload,
  DelegationAcceptedPayload,
  DelegationRejectedPayload,
  DelegationReopenedPayload,
  DelegationClosedPayload,
  InstructionQueuedPayload,
  InstructionAdmittedPayload,
  EventDraft,
} from '../../src/domain/timeline'

// B2：已接线 18 事件逐个断言 detail 键集＝段3 §5 快照（禁增禁减，M-09）。
// 样本经 `satisfies` 编译期锁键；运行期 Object.keys 对快照再核一遍（防接线漂移）。
describe('timeline 载荷键（B2，段3 §5 快照）', () => {
  const samples = {
    DelegationCreated: {
      delegationId: 'd1',
      intent: 'i',
      scopeVersion: 1,
    } satisfies DelegationCreatedPayload,
    InputAcknowledged: {
      inputId: 'in1',
      delegationId: 'd1',
      disposition: { into: 'turn', turnId: 't1' },
      silentlyDropped: false,
    } satisfies InputAcknowledgedPayload,
    TurnStarted: {
      turnId: 't1',
      delegationId: 'd1',
      triggerSource: '用户输入',
    } satisfies TurnStartedPayload,
    TurnEnded: { turnId: 't1', terminal: '收口' } satisfies TurnEndedPayload,
    DecisionRaised: {
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: 'r', requestedBy: 'system' },
    } satisfies DecisionRaisedPayload,
    DecisionResolved: {
      decisionPointId: 'dp1',
      resolution: '批准',
    } satisfies DecisionResolvedPayload,
    DecisionDenied: {
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      reason: 'no',
    } satisfies DecisionDeniedPayload,
    ScopeAmended: {
      delegationId: 'd1',
      versionPair: { from: 1, to: 2 },
      decisionPointId: 'dp1',
    } satisfies ScopeAmendedPayload,
    ChangeProduced: {
      delegationId: 'd1',
      turnId: 't1',
      changeSetRef: 'pr1',
      scopeCheckResult: 'ok',
    } satisfies ChangeProducedPayload,
    EvidenceRecorded: {
      evidenceId: 'e1',
      type: '变更集',
      delegationId: 'd1',
      payloadRef: 'pr1',
    } satisfies EvidenceRecordedPayload,
    EvidenceInspected: {
      evidenceId: 'e1',
      delegationId: 'd1',
      inspectAction: 'open',
      firstInspection: true,
    } satisfies EvidenceInspectedPayload,
    CompletionClaimed: {
      delegationId: 'd1',
      turnId: 't1',
      claim: 'c',
      evidenceRefs: ['e1'],
    } satisfies CompletionClaimedPayload,
    DelegationAccepted: {
      delegationId: 'd1',
      closeState: 'closed',
    } satisfies DelegationAcceptedPayload,
    DelegationRejected: {
      delegationId: 'd1',
      outcome: 'dropped',
    } satisfies DelegationRejectedPayload,
    DelegationReopened: { delegationId: 'd1', reopenCount: 1 } satisfies DelegationReopenedPayload,
    DelegationClosed: {
      delegationId: 'd1',
      archivedState: 'archived',
    } satisfies DelegationClosedPayload,
    InstructionQueued: {
      itemId: 'q1',
      delegationId: 'd1',
      origin: 'user',
    } satisfies InstructionQueuedPayload,
    InstructionAdmitted: {
      itemId: 'q1',
      admittedTurnId: 't2',
    } satisfies InstructionAdmittedPayload,
  }

  const snapshot: Record<string, string[]> = {
    DelegationCreated: ['delegationId', 'intent', 'scopeVersion'],
    InputAcknowledged: ['inputId', 'delegationId', 'disposition', 'silentlyDropped'],
    TurnStarted: ['turnId', 'delegationId', 'triggerSource'],
    TurnEnded: ['turnId', 'terminal'],
    DecisionRaised: ['decisionPointId', 'delegationId', 'turnId', 'requestReason'],
    DecisionResolved: ['decisionPointId', 'resolution'],
    DecisionDenied: ['decisionPointId', 'delegationId', 'turnId', 'reason'],
    ChangeProduced: ['delegationId', 'turnId', 'changeSetRef', 'scopeCheckResult'],
    EvidenceRecorded: ['evidenceId', 'type', 'delegationId', 'payloadRef'],
    EvidenceInspected: ['evidenceId', 'delegationId', 'inspectAction', 'firstInspection'],
    CompletionClaimed: ['delegationId', 'turnId', 'claim', 'evidenceRefs'],
    DelegationAccepted: ['delegationId', 'closeState'],
    DelegationRejected: ['delegationId', 'outcome'],
    DelegationReopened: ['delegationId', 'reopenCount'],
    DelegationClosed: ['delegationId', 'archivedState'],
    InstructionQueued: ['itemId', 'delegationId', 'origin'],
    InstructionAdmitted: ['itemId', 'admittedTurnId'],
  }

  it('样本覆盖恰为已接线的 18 事件', () => {
    expect(Object.keys(samples).sort()).toEqual([...EMIT_EVENT_NAMES].sort())
  })

  it('ScopeAmended：手工构造 EventDraft，detail 键集＝§5 快照（禁增禁减）', () => {
    const draft = {
      delegationId: 'd1',
      type: 'ScopeAmended',
      detail: {
        delegationId: 'd1',
        versionPair: { from: 1, to: 2 },
        decisionPointId: 'dp1',
      },
    } satisfies EventDraft
    expect(Object.keys(draft.detail).sort()).toEqual([
      'decisionPointId',
      'delegationId',
      'versionPair',
    ])
  })

  for (const name of Object.keys(snapshot)) {
    it(`${name}：detail 键集＝§5 快照（禁增禁减）`, () => {
      const got = Object.keys(samples[name as keyof typeof samples]).sort()
      expect(got).toEqual([...snapshot[name]].sort())
    })
  }
})
