// S1b Task 5（F1）：委托单列表——纯呈现，选中态回父级。只读投影（S-1）。
import type { DelegationDTO } from './useDomainView'

export default function DelegationList({
  delegations,
  selectedId,
  onSelect,
}: {
  delegations: DelegationDTO[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="nf-delegationlist">
      <div className="nf-delegationlist__head">委托单</div>
      {delegations.length === 0 ? (
        <div className="nf-delegationlist__empty">暂无委托</div>
      ) : (
        delegations.map((d) => (
          <button
            key={d.delegationId}
            type="button"
            className={
              'nf-delegationlist__item' +
              (d.delegationId === selectedId ? ' nf-delegationlist__item--active' : '')
            }
            onClick={() => onSelect(d.delegationId)}
          >
            <span className="nf-delegationlist__intent">{d.intent}</span>
            <span className="nf-delegationlist__state">{d.state}</span>
          </button>
        ))
      )}
    </div>
  )
}
