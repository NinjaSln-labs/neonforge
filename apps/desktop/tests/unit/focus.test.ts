import { describe, it, expect } from 'vitest'
import { deriveFocus, type FocusCandidate } from '../../src/domain/projection/focus'
import { deriveWaitingItems } from '../../src/domain/projection/waitingItems'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DecisionPoint } from '../../src/domain/authorization/DecisionPoint'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'

const dp = (id: string, turnId: string) =>
  DecisionPoint.raise({
    decisionPointId: id,
    delegationId: 'd1',
    turnId,
    requestReason: { reason: '作用域外', operation: 'x', requestedBy: 'AI 提请' },
  }).decisionPoint
const pendingVerify = (id: string) => {
  const repo = new InMemoryEvidenceRepo()
  repo.save(
    EvidenceItem.record({ evidenceId: `e-${id}`, delegationId: id, type: '变更集', content: 'x' }),
  )
  const d = Delegation.create(id, 'intent').delegation
  d.claimCompletion({ claim: 'done', turnId: 't1', evidenceRefs: [`e-${id}`] }, repo)
  return d
}
const item = (over: Partial<FocusCandidate>): FocusCandidate => ({
  kind: '待拍板',
  sourceId: 'x',
  slot: 0,
  ...over,
})

describe('deriveFocus 唯一投影入口（F3 领域面）', () => {
  it('类优先级：待拍板＞待核验＞待用户指令（排队不参选）', () => {
    const focus = deriveFocus([
      item({ kind: '待用户指令', sourceId: 'd2' }),
      item({ kind: '待核验', sourceId: 'd1' }),
      item({ kind: '排队中', sourceId: 'i1' }),
      item({ kind: '待拍板', sourceId: 'dp1' }),
    ])
    expect(focus?.sourceId).toBe('dp1')
  })

  it('同类取创建序最早者（slot 小者先）', () => {
    const focus = deriveFocus([
      item({ kind: '待核验', sourceId: 'later', slot: 1 }),
      item({ kind: '待核验', sourceId: 'earlier', slot: 0 }),
    ])
    expect(focus?.sourceId).toBe('earlier')
  })

  it('只有排队中 ⇒ 焦点为空（等的是系统空槽非用户动作，不退化指排队）', () => {
    expect(deriveFocus([item({ kind: '排队中', sourceId: 'i1' })])).toBeNull()
  })

  it('三类皆空 ⇒ null（焦点为空，非首项兜底）', () => {
    expect(deriveFocus([])).toBeNull()
  })

  it('焦点只指向、不带动作类型（动作由呈现侧按 kind 决定）', () => {
    const focus = deriveFocus(
      deriveWaitingItems([pendingVerify('d1')], [], new InstructionQueue('q1')),
    )
    expect(Object.keys(focus ?? {}).sort()).toEqual(['delegationId', 'kind', 'slot', 'sourceId'])
  })

  it('与 deriveWaitingItems 同源：混合入参下焦点＝最优先类的最早实例', () => {
    const q = new InstructionQueue('q1')
    q.submitInput({ itemId: 'i1', delegationId: 'd1', inputId: 'in-1', origin: '忙转投' })
    q.submitInput({ itemId: 'i2', delegationId: 'd1', inputId: 'in-2', origin: '忙转投' })
    const late = dp('dp-late', 't1')
    late.resolve('批准')
    const items = deriveWaitingItems([pendingVerify('dV')], [dp('dp-early', 't1'), late], q)
    expect(items.map((i) => i.kind)).toEqual(['待拍板', '待核验', '排队中', '排队中'])
    expect(deriveFocus(items)?.sourceId).toBe('dp-early')
  })
})
