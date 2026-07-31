import { useState } from 'react'
import type { DeliveryPackage } from './types'

// 交付包视图（ticket 05）：产物 + 验收对照 + 下一步/指导——「问题已解决」的可验证呈现
// 视觉：深紫浮面 + 靛紫 accent；验收打勾交互；「确认关闭」= 问题终态（交付 ≠ 解决）
export default function DeliveryPanel({
  pkg,
  onClose,
  onAdjust
}: {
  pkg: DeliveryPackage | null
  onClose: () => void
  onAdjust: () => void
}) {
  const [items, setItems] = useState(pkg?.acceptance ?? [])
  const [status, setStatus] = useState<'delivered' | 'closed'>(pkg?.status === 'closed' ? 'closed' : 'delivered')

  if (!pkg) {
    return <p className="nf-placeholder">还没有交付包——说出你的问题，解决后这里会显示结果</p>
  }

  const allDone = items.length > 0 && items.every((i) => i.done)

  const toggle = (idx: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)))
  }

  return (
    <div className="nf-delivery">
      <div className="nf-delivery__head">
        <span className="nf-delivery__badge">{status === 'closed' ? '✅ 已关闭' : '✅ 已解决'}</span>
      </div>
      <p className="nf-delivery__summary">{pkg.summary}</p>

      {pkg.artifacts.length > 0 && (
        <section className="nf-delivery__block">
          <h4>产物</h4>
          <ul className="nf-delivery__artifacts">
            {pkg.artifacts.map((a) => <li key={a}>📄 {a}</li>)}
          </ul>
        </section>
      )}

      <section className="nf-delivery__block">
        <h4>验收对照</h4>
        <ul className="nf-delivery__acceptance">
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className={`nf-check${it.done ? ' nf-check--done' : ''}`}
                aria-label={it.done ? `取消勾选：${it.label}` : `勾选：${it.label}`}
                onClick={() => toggle(i)}
              >
                {it.done ? '☑' : '☐'}
              </button>
              <span>{it.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {pkg.nextSteps.length > 0 && (
        <section className="nf-delivery__block">
          <h4>下一步 / 指导</h4>
          <ul className="nf-delivery__steps">
            {pkg.nextSteps.map((s, i) => <li key={i}>→ {s}</li>)}
          </ul>
        </section>
      )}

      {pkg.rerunLabel && (
        <button type="button" className="nf-delivery__rerun" onClick={onAdjust}>
          ↻ {pkg.rerunLabel}
        </button>
      )}

      <div className="nf-delivery__actions">
        {status !== 'closed' && (
          <button
            type="button"
            className="nf-delivery__primary"
            disabled={!allDone}
            title={allDone ? '验收全部通过，问题关闭' : '请先勾选全部验收项'}
            onClick={() => setStatus('closed')}
          >
            确认问题关闭
          </button>
        )}
        {status !== 'closed' && (
          <button type="button" className="nf-delivery__ghost" onClick={onAdjust}>继续调整</button>
        )}
      </div>
    </div>
  )
}
