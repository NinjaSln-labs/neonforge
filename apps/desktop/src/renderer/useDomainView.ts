// S1b Task 5：委托单中心六件的共享取数层（只读投影——只经 window.neonforge 领域桥，零核心聚合 import，S-1 绿）。
// 只读既有通道：delegation:list、evidence:list-by-delegation、queue:pending、timeline:query-by-delegation、scope:chain。
// 待决决策点从时间线派生（DecisionRaised 后未被 DecisionResolved/Denied 收口的最后一个），不新增通道。
import { useEffect, useState } from 'react'
import type { ScopeVersionDTO } from './types'

export interface DelegationDTO {
  delegationId: string
  intent: string
  state: string
  reopenCount: number
}
export interface DecisionDTO {
  decisionPointId: string
  delegationId: string
  turnId: string
  requestReason: { reason: string; operation: string; requestedBy: string }
}
export interface EvidenceDTO {
  evidenceId: string
  type: string
  delegationId: string
  payloadRef: string
  provenance: string
}
export interface QueueItemDTO {
  itemId: string
  delegationId: string
  inputId: string
  origin: string
}
export interface TimelineRowDTO {
  seq: number
  ts: string
  type: string
  delegationId: string
  detail: unknown
}

export interface DomainView {
  delegations: DelegationDTO[]
  decision: DecisionDTO | null
  evidence: EvidenceDTO[]
  queue: QueueItemDTO[]
  timeline: TimelineRowDTO[]
  scopeVersions: ScopeVersionDTO[]
  lastResolution: { value: string; reason?: string } | null
}

const EMPTY: DomainView = {
  delegations: [],
  decision: null,
  evidence: [],
  queue: [],
  timeline: [],
  scopeVersions: [],
  lastResolution: null,
}

/** 从时间线派生待决决策点：DecisionRaised 里未被 resolve/denied 收口的（S1 最简；完整面 S6）。 */
function pendingDecision(timeline: TimelineRowDTO[]): DecisionDTO | null {
  const closed = new Set<string>()
  for (const e of timeline) {
    if (e.type === 'DecisionResolved' || e.type === 'DecisionDenied') {
      const id = (e.detail as { decisionPointId?: string } | null)?.decisionPointId
      if (id) closed.add(id)
    }
  }
  for (const e of [...timeline].reverse()) {
    if (e.type !== 'DecisionRaised') continue
    const d = e.detail as unknown as DecisionDTO | null
    if (d && !closed.has(d.decisionPointId)) return d
  }
  return null
}

/** 从既有时间线派生最近一次已收口决议（不新增通道）；无决议＝null。拒绝理由可缺省（无值不带 reason 键）。 */
function lastResolutionOf(timeline: TimelineRowDTO[]): { value: string; reason?: string } | null {
  const res = [...timeline]
    .reverse()
    .find((r) => r.type === 'DecisionResolved' || r.type === 'DecisionDenied')
  return res
    ? {
        value:
          res.type === 'DecisionResolved'
            ? String((res.detail as { resolution: string }).resolution)
            : '拒绝',
        ...((res.detail as { reason?: string })?.reason === undefined
          ? {}
          : { reason: (res.detail as { reason?: string }).reason }),
      }
    : null
}

/** 取当前选中委托的六个读面；无选中＝空视图。delayMs 供 L3 轮询。 */
export function useDomainView(selectedId: string | null, delayMs = 500): DomainView {
  const [view, setView] = useState<DomainView>(EMPTY)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const nf = window.neonforge
      const delegations = (await nf?.delegation?.list?.()) ?? []
      if (!selectedId) {
        if (alive) setView({ ...EMPTY, delegations })
        return
      }
      const [evidence, queue, timeline, scopeVersions] = await Promise.all([
        nf?.evidence?.listByDelegation?.(selectedId) ?? [],
        nf?.queue?.pending?.() ?? [],
        nf?.timeline?.queryByDelegation?.(selectedId) ?? [],
        nf?.scope?.chain?.(selectedId) ?? [],
      ])
      if (alive)
        setView({
          delegations,
          decision: pendingDecision(timeline),
          evidence,
          queue,
          timeline,
          scopeVersions,
          lastResolution: lastResolutionOf(timeline),
        })
    }
    void load()
    const t = setInterval(() => void load(), delayMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [selectedId, delayMs])
  return view
}
