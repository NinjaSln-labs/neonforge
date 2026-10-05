// S1b Task 5（F1）：委托单中心容器——装配六件＋取数（useDomainView）＋桥调用回投。
// 纯呈现/编排：只经 window.neonforge 领域桥读数并回投命令，零核心聚合 import（S-1 绿）。
import { useEffect, useState } from 'react'
import DelegationList from './DelegationList'
import TimelineView from './TimelineView'
import DecisionCard from './DecisionCard'
import EvidenceList from './EvidenceList'
import AcceptRejectBar from './AcceptRejectBar'
import QueueList from './QueueList'
import StreamBar from './StreamBar'
import { useDomainView } from './useDomainView'

export default function DelegationCenter() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const view = useDomainView(selectedId)
  const nf = window.neonforge

  // 首次取到委托列表即默认选中第一单（避免空选中态）
  useEffect(() => {
    if (selectedId === null && view.delegations.length > 0) {
      setSelectedId(view.delegations[0].delegationId)
    }
  }, [selectedId, view.delegations])

  const resolveDecision = (decisionPointId: string, value: string, reason?: string) => {
    void nf?.decision?.resolve?.({ decisionPointId, value, ...(reason ? { reason } : {}) })
  }
  const inspectEvidence = (evidenceId: string) => {
    void nf?.evidence?.inspect?.(evidenceId)
  }
  const accept = (delegationId: string) => {
    void nf?.delegation?.accept?.(delegationId)
  }
  const reject = (delegationId: string) => {
    void nf?.delegation?.reject?.(delegationId)
  }

  return (
    <div className="nf-delegationcenter">
      <DelegationList
        delegations={view.delegations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="nf-delegationcenter__main">
        <StreamBar />
        <TimelineView rows={view.timeline} />
        <DecisionCard decision={view.decision} onResolve={resolveDecision} />
        <EvidenceList evidence={view.evidence} onInspect={inspectEvidence} />
        <QueueList items={view.queue} />
        <AcceptRejectBar delegationId={selectedId} onAccept={accept} onReject={reject} />
      </div>
    </div>
  )
}
