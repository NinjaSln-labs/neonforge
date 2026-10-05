// S1b Task 5（F1）：时间线视图——纯呈现（只读投影，S-1）。数据源 timeline:query-by-delegation。
import type { TimelineRowDTO } from './useDomainView'

export default function TimelineView({ rows }: { rows: TimelineRowDTO[] }) {
  return (
    <div className="nf-timelineview">
      <div className="nf-timelineview__head">时间线</div>
      {rows.length === 0 ? (
        <div className="nf-timelineview__empty">暂无事件</div>
      ) : (
        rows.map((e) => (
          <div key={e.seq} className="nf-timelineview__row">
            <span className="nf-timelineview__seq">{e.seq}</span>
            <span className="nf-timelineview__type">{e.type}</span>
          </div>
        ))
      )}
    </div>
  )
}
