import { describe, it, expect } from 'vitest'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import type { EventDraft } from '../../src/domain/timeline'

// C9／I-11 S1 面＝两事件：DecisionDenied 与 DelegationRejected 一旦发生，timeline 条目计数 ≥1。
// 留痕机制面（谁发射）＝聚合出草稿、经 TimelineRepo.append 唯一机制口落账；不落账＝判红（见非空跑用例）。

const TS = '2026-10-05T00:00:00.000Z'
const appendAll = (repo: InMemoryTimelineRepo, drafts: EventDraft[]): void => {
  for (const d of drafts)
    repo.append({ ts: TS, delegationId: d.delegationId, type: d.type, detail: d.detail })
}
const raiseDeny = (repo: InMemoryTimelineRepo): void => {
  const dp = DecisionPoint.raise({
    decisionPointId: 'dp1',
    delegationId: 'd1',
    turnId: 't1',
    requestReason: { reason: '高影响清单命中', operation: '删除文件', requestedBy: 'AI 提请' },
  }).decisionPoint
  appendAll(repo, dp.resolve('拒绝', { reason: '不许删' }))
}
const evidence = (): InMemoryEvidenceRepo => {
  const r = new InMemoryEvidenceRepo()
  r.save(
    EvidenceItem.record({ evidenceId: 'e1', delegationId: 'd1', type: '变更集', content: 'x' }),
  )
  return r
}

describe('否定事实必留痕（C9／I-11，S1 面＝两事件）', () => {
  it('DecisionDenied 落账 ⇒ 该委托 timeline 恰一条否定条目（含理由读数）', () => {
    const repo = new InMemoryTimelineRepo()
    raiseDeny(repo)
    const denied = repo.findByDelegation('d1').filter((e) => e.type === 'DecisionDenied')
    expect(denied).toHaveLength(1)
    expect(denied[0].detail).toMatchObject({ decisionPointId: 'dp1', reason: '不许删' })
    // 批准与拒绝同帧留痕（Resolution 三值走 DecisionResolved，拒绝另出 Denied）
    expect(repo.findByDelegation('d1').map((e) => e.type)).toEqual([
      'DecisionResolved',
      'DecisionDenied',
    ])
  })

  it('DelegationRejected 落账 ⇒ 条目 ≥1 且与 DelegationReopened 同批（重开挂原单 I-14）', () => {
    const repo = new InMemoryTimelineRepo()
    const d = Delegation.create('d1', 'intent').delegation
    appendAll(repo, [Delegation.create('d2', 'x').event]) // 干扰项：另一委托的条目不得计入
    const claim = d.claimCompletion(
      { claim: 'done', turnId: 't1', evidenceRefs: ['e1'] },
      evidence(),
    )
    const pair = d.reject('证据不足')
    appendAll(repo, [claim, pair.rejected, pair.reopened])
    expect(repo.findByDelegation('d1').filter((e) => e.type === 'DelegationRejected')).toHaveLength(
      1,
    )
    expect(repo.findByDelegation('d1').map((e) => e.type)).toEqual([
      'CompletionClaimed',
      'DelegationRejected',
      'DelegationReopened',
    ])
    expect(repo.findByDelegation('d2').map((e) => e.type)).toEqual(['DelegationCreated'])
  })

  it('判据非空跑：草稿存在而未落账 ⇒ 计数＝0（缺即判红的自证）', () => {
    const repo = new InMemoryTimelineRepo()
    const dp = DecisionPoint.raise({
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '作用域外', operation: '读 etc/hosts', requestedBy: 'AI 提请' },
    }).decisionPoint
    expect(dp.resolve('拒绝')).toHaveLength(2)
    expect(repo.findByDelegation('d1').filter((e) => e.type === 'DecisionDenied')).toHaveLength(0)
    expect(repo.since(1)).toEqual([]) // 唯一机制口未走＝整条时间线空，主断言当场判红而非静默通过
  })

  it.skip('SessionInterrupted／StallDetected 入否定事实四事件闭集 ⇒ S3／S5（本阶段不预绿，C9 括注）', () => {})
})
