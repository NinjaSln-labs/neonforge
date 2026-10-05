import { describe, it, expect } from 'vitest'
import { deriveWaitingItems } from '../../src/domain/projection/waitingItems'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'

// 等待项四类（段3 §1 裁定4）：待拍板←DecisionPoint 未决／待核验←Delegation 有效声称／
// 待用户指令←拒绝待决标记（I-15 读侧落 Delegation）／排队中←InstructionQueue 未准入。
const dp = (id: string, over = {}) =>
  DecisionPoint.raise({
    decisionPointId: id,
    delegationId: 'd1',
    turnId: 't1',
    requestReason: { reason: '作用域外', operation: 'x', requestedBy: 'AI 提请' },
    ...over,
  }).decisionPoint
const queue = (...ids: string[]) => {
  const q = new InstructionQueue('q1')
  ids.forEach((id) =>
    q.submitInput({ itemId: id, delegationId: 'd1', inputId: `in-${id}`, origin: '忙转投' }),
  )
  return q
}
const pendingVerify = (id = 'd1') => {
  const repo = new InMemoryEvidenceRepo()
  repo.save(
    EvidenceItem.record({ evidenceId: `e-${id}`, delegationId: id, type: '变更集', content: 'x' }),
  )
  const d = Delegation.create(id, 'intent').delegation
  d.claimCompletion({ claim: 'done', turnId: 't1', evidenceRefs: [`e-${id}`] }, repo)
  return d
}
const deniedPending = (id = 'd2') => {
  const d = Delegation.create(id, 'intent').delegation
  d.markAwaitingUser()
  return d
}

describe('deriveWaitingItems 四类闭集（C7／I-9 无归宿等待＝0）', () => {
  it('四类各出一实例且按类优先级排序（待拍板＞待核验＞待用户指令＞排队中）', () => {
    const items = deriveWaitingItems(
      [pendingVerify('d1'), deniedPending('d2')],
      [dp('dp1')],
      queue('i1'),
    )
    expect(items.map((i) => i.kind)).toEqual(['待拍板', '待核验', '待用户指令', '排队中'])
    expect(items.map((i) => i.sourceId)).toEqual(['dp1', 'd1', 'd2', 'i1'])
  })

  it('待拍板：已决项退出、未决项在列（每实例属且仅属一类）', () => {
    const resolved = dp('dp2')
    resolved.resolve('批准')
    const items = deriveWaitingItems([], [dp('dp1'), resolved], queue())
    expect(items.map((i) => i.sourceId)).toEqual(['dp1'])
  })

  it('待核验：仅有效声称后的委托入列，created/推进中/已收尾皆不入', () => {
    const items = deriveWaitingItems(
      [
        Delegation.create('dA', 'x').delegation,
        pendingVerify('dB'),
        Delegation.create('dC', 'x').delegation,
      ],
      [],
      queue(),
    )
    expect(items.map((i) => i.kind)).toEqual(['待核验'])
    expect(items[0].delegationId).toBe('dB')
  })

  it('待用户指令：拒绝待决标记解除（用户输入开轮成功）即退出该类', () => {
    const d = deniedPending('d3')
    expect(deriveWaitingItems([d], [], queue()).map((i) => i.kind)).toEqual(['待用户指令'])
    d.resumeFromAwaitingUser()
    expect(deriveWaitingItems([d], [], queue())).toEqual([])
  })

  it('排队中：已准入与已撤回项退出该类（FIFO 序＝slot）', () => {
    const q = queue('i1', 'i2', 'i3')
    q.admit('i2', 't9')
    q.markWithdrawn('i3')
    const items = deriveWaitingItems([], [], q)
    expect(items.map((i) => [i.sourceId, i.slot])).toEqual([['i1', 0]])
  })

  it('双归属反例：同一实例在入参里重复出现 ⇒ 投影去重，仍恰一类一条', () => {
    const open = dp('dp1')
    const items = deriveWaitingItems([], [open, open, dp('dp1', { turnId: 't2' })], queue())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: '待拍板', sourceId: 'dp1', delegationId: 'd1', slot: 0 })
  })

  it('无归宿等待计数＝0（I-9 检测式：处于等待态的实例数＝投影条目数）', () => {
    const ins = {
      delegations: [
        pendingVerify('d1'),
        deniedPending('d2'),
        Delegation.create('d3', 'x').delegation,
      ],
      decisionPoints: [dp('dp1'), dp('dp2')],
      queue: queue('i1', 'i2'),
    }
    const items = deriveWaitingItems(ins.delegations, ins.decisionPoints, ins.queue)
    const waitingSources = [
      ...ins.delegations.filter((d) => d.state === 'pendingVerify' || d.awaitingUser),
      ...ins.decisionPoints.filter((p) => p.open),
      ...ins.queue.pending(),
    ]
    expect([items.length, waitingSources.length]).toEqual([6, 6]) // 待拍板2＋待核验1＋待用户指令1＋排队2
    expect(new Set(items.map((i) => i.sourceId)).size).toBe(items.length) // 无重复、无遗漏
  })

  it('空集 ⇒ 空数组（焦点退化由 deriveFocus 承载，不在此预绿）', () => {
    expect(deriveWaitingItems([], [], queue())).toEqual([])
  })

  it.skip('收束态过滤（已收尾/已归档/已放弃不入等待面）⇒ S5（C7 边界，本阶段不预绿）', () => {})
})
