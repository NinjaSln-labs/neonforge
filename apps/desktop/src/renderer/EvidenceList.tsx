// S1b Task 5（F1）：证据列表——纯呈现；「打开」触发 evidence:inspect（经 main 机制口落 EvidenceInspected）。
import type { EvidenceDTO } from './useDomainView'

export default function EvidenceList({
  evidence,
  onInspect,
}: {
  evidence: EvidenceDTO[]
  onInspect: (evidenceId: string) => void
}) {
  return (
    <div className="nf-evidencelist">
      <div className="nf-evidencelist__head">证据</div>
      {evidence.length === 0 ? (
        <div className="nf-evidencelist__empty">暂无证据</div>
      ) : (
        evidence.map((e) => (
          <div key={e.evidenceId} className="nf-evidencelist__item">
            <span className="nf-evidencelist__id">{e.evidenceId}</span>
            <span className="nf-evidencelist__type">{e.type}</span>
            <button
              type="button"
              className="nf-evidencelist__open"
              onClick={() => onInspect(e.evidenceId)}
            >
              打开
            </button>
          </div>
        ))
      )}
    </div>
  )
}
