import { EvidenceItem, digest, evidencePtr, evidenceIdFromPtr } from '../evidence/EvidenceItem.js'
import { admissionCheck } from './admissionCheck.js'
import type { Operation } from '../spec/requiresApproval.js'
import type { HighImpactOperation } from '../authorization/highImpactList.js'
import type { Scope } from '../authorization/Scope.js'
import type { EvidenceRepo, TimelineRepo } from '../repos/index.js'
import type { EventDraft, PayloadOf } from '../timeline.js'

// ApplyChange 领域服务（详设 §5／段3 §6「变更→证据」行／stage-spec C15）。
// ① 前置＝AdmissionCheck，未过闸零副作用（I-7，调用方转 RaiseDecision）；
// ② 经机制口 TimelineRepo.append 发 ChangeProduced（S-1：领域服务亦走唯一写者口）；
// ③ 采集归证据域订阅（attachEvidenceCollector）⇒ EvidenceRecorded（type=变更集、Provenance=系统采集）；
// ④ evidenceId 去重（同变更重复投递＝幂等）。
export interface ApplyChangeDeps {
  timeline: TimelineRepo
  evidence: EvidenceRepo
  scope: Scope
  list: readonly HighImpactOperation[]
  // ponytail: 变更集内容经此表跨订阅面传递（S1 内存态、同步派发，天花板＝同帧多实例）；
  // 真持久化落 S3 后由证据域自取内容，本表撤除。
  changeSets: Map<string, string>
}

export interface ChangeInput {
  delegationId: string
  turnId: string
  ts: string
  changeSet: string
  op: Operation
}

export function applyChange(input: ChangeInput, deps: ApplyChangeDeps): EventDraft | null {
  if (!admissionCheck(input.op, deps.scope, deps.list)) return null
  const evidenceId = `ev-${input.delegationId}-${input.turnId}-${digest(input.changeSet)}`
  if (deps.evidence.findByIds([evidenceId]).length > 0) return null // C15④
  const detail: PayloadOf<'ChangeProduced'> = {
    delegationId: input.delegationId,
    turnId: input.turnId,
    changeSetRef: evidencePtr(evidenceId),
    // 过闸即作用域内（③类作用域修正由 requiresApproval 恒真拦在闸前，走不到产出）。
    scopeCheckResult: '作用域内',
  }
  const draft: EventDraft = { type: 'ChangeProduced', delegationId: input.delegationId, detail }
  deps.changeSets.set(evidenceId, input.changeSet)
  deps.timeline.append({ ts: input.ts, ...draft })
  return draft
}

// 证据域订阅面：ChangeProduced ⇒ 落 EvidenceItem 并经机制口追加 EvidenceRecorded。返回 unsubscribe。
export function attachEvidenceCollector(deps: ApplyChangeDeps): () => void {
  return deps.timeline.subscribe((event) => {
    if (event.type !== 'ChangeProduced') return
    const { delegationId, changeSetRef } = event.detail as PayloadOf<'ChangeProduced'>
    const evidenceId = evidenceIdFromPtr(changeSetRef)
    const content = deps.changeSets.get(evidenceId)
    if (content === undefined) return
    if (deps.evidence.findByIds([evidenceId]).length > 0) return
    const item = EvidenceItem.record({ evidenceId, delegationId, type: '变更集', content })
    const detail: PayloadOf<'EvidenceRecorded'> = {
      evidenceId,
      type: item.type,
      delegationId,
      payloadRef: item.payloadRef.ptr,
    }
    // 证据聚合写入与 EvidenceRecorded 追加同事务（段3 §6；失败⇒回滚且缓冲内容不丢，可重试采集）。
    deps.timeline.append({ ts: event.ts, delegationId, type: 'EvidenceRecorded', detail }, () => {
      deps.evidence.save(item)
      deps.changeSets.delete(evidenceId)
    })
  })
}
