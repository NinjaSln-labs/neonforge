// S1b Task 5（F1）：排队列表——纯呈现（只读投影，S-1）。数据源 queue:pending。
import type { QueueItemDTO } from './useDomainView'

export default function QueueList({ items }: { items: QueueItemDTO[] }) {
  return (
    <div className="nf-queuelist">
      <div className="nf-queuelist__head">排队</div>
      {items.length === 0 ? (
        <div className="nf-queuelist__empty">无排队</div>
      ) : (
        items.map((i) => (
          <div key={i.itemId} className="nf-queuelist__item">
            <span className="nf-queuelist__id">{i.itemId}</span>
            <span className="nf-queuelist__origin">{i.origin}</span>
          </div>
        ))
      )}
    </div>
  )
}
