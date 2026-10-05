import { describe, it, expect } from 'vitest'
import {
  applyChange,
  attachEvidenceCollector,
  type ApplyChangeDeps,
  type ChangeInput,
} from '../../src/domain/service/applyChange'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import { Scope } from '../../src/domain/authorization/Scope'
import { HIGH_IMPACT_LIST } from '../../src/domain/authorization/highImpactList'
import type { Operation } from '../../src/domain/spec/requiresApproval'
import type { PayloadOf } from '../../src/domain/timeline'

const scope = Scope.initial('d1', [{ kind: '目录', pattern: 'src/**' }])
const inScope: Operation = {
  category: '资源访问',
  entryKind: '目录',
  resource: 'src/a.ts',
  hits: null,
}
const outScope: Operation = { ...inScope, resource: 'etc/hosts' }

const fresh = (): ApplyChangeDeps => ({
  timeline: new InMemoryTimelineRepo(),
  evidence: new InMemoryEvidenceRepo(),
  scope,
  list: HIGH_IMPACT_LIST,
  changeSets: new Map(),
})
const change = (over: Partial<ChangeInput> = {}): ChangeInput => ({
  delegationId: 'd1',
  turnId: 't1',
  ts: '2026-10-05T00:00:00.000Z',
  changeSet: '-old\n+new',
  op: inScope,
  ...over,
})

describe('ApplyChange 领域服务（C15／详设 §5：变更→证据订阅采集）', () => {
  it('过闸 ⇒ ChangeProduced 先落账、证据域订阅采集 ⇒ EvidenceRecorded（变更集∧系统采集）', () => {
    const deps = fresh()
    attachEvidenceCollector(deps)
    expect(applyChange(change(), deps)?.type).toBe('ChangeProduced')
    const events = deps.timeline.since(1)
    expect(events.map((e) => e.type)).toEqual(['ChangeProduced', 'EvidenceRecorded'])
    expect(events.map((e) => e.seq)).toEqual([1, 2])
    const items = deps.evidence.findByDelegation('d1')
    expect(items).toHaveLength(1)
    expect([items[0].type, items[0].provenance]).toEqual(['变更集', '系统采集'])
    expect(events[1].detail).toMatchObject({ type: '变更集', delegationId: 'd1' })
  })

  it('未过闸 ⇒ 副作用计数＝0（无事件、无证据、返 null）', () => {
    const deps = fresh()
    attachEvidenceCollector(deps)
    expect(applyChange(change({ op: outScope }), deps)).toBeNull()
    expect(deps.timeline.since(1)).toEqual([])
    expect(deps.evidence.findByDelegation('d1')).toEqual([])
    expect(deps.changeSets.size).toBe(0)
  })

  it('同变更重复投递 ⇒ evidenceId 去重（幂等，第二次零副作用）', () => {
    const deps = fresh()
    attachEvidenceCollector(deps)
    applyChange(change(), deps)
    expect(applyChange(change(), deps)).toBeNull()
    expect(deps.timeline.since(1)).toHaveLength(2)
    expect(deps.evidence.findByDelegation('d1')).toHaveLength(1)
  })

  it('不同变更各成一条证据（去重键含内容摘要，非只按轮次）', () => {
    const deps = fresh()
    attachEvidenceCollector(deps)
    applyChange(change(), deps)
    applyChange(change({ changeSet: 'another' }), deps)
    expect(deps.evidence.findByDelegation('d1')).toHaveLength(2)
  })

  it('ChangeProduced 载荷键＝段3 §5 四键闭集（禁增禁减）', () => {
    const deps = fresh()
    applyChange(change(), deps)
    const detail = deps.timeline.since(1)[0].detail as PayloadOf<'ChangeProduced'>
    expect(Object.keys(detail).sort()).toEqual([
      'changeSetRef',
      'delegationId',
      'scopeCheckResult',
      'turnId',
    ])
    expect(detail.changeSetRef).toMatch(/^mem:\/\/evidence\/ev-d1-t1-/)
  })

  it('采集器未接线 ⇒ 服务只发 ChangeProduced（采集归证据域订阅，服务不直写证据）', () => {
    const deps = fresh()
    applyChange(change(), deps)
    expect(deps.timeline.since(1).map((e) => e.type)).toEqual(['ChangeProduced'])
    expect(deps.evidence.findByDelegation('d1')).toEqual([])
  })

  it('退订后不再采集（订阅面可控生命周期）', () => {
    const deps = fresh()
    attachEvidenceCollector(deps)()
    applyChange(change(), deps)
    expect(deps.timeline.since(1).map((e) => e.type)).toEqual(['ChangeProduced'])
  })
})
