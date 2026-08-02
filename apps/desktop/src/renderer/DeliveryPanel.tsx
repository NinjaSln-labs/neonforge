import { useEffect, useState } from 'react'
import type { DeliveryPackage } from './types'

// 交付包视图（ticket 05）：产物 + 验收对照 + 下一步/指导——「问题已解决」的可验证呈现
// 视觉：深紫浮面 + 靛紫 accent；验收打勾交互；「确认关闭」= 问题终态（交付 ≠ 解决）
export default function DeliveryPanel({
  pkg,
  onClose,
  onAdjust,
  onRerun
}: {
  pkg: DeliveryPackage | null
  onClose: () => void
  onAdjust: () => void
  onRerun: (prompt: string) => void
}) {
  const [items, setItems] = useState(pkg?.acceptance ?? [])
  const [status, setStatus] = useState<'delivered' | 'closed'>(pkg?.status === 'closed' ? 'closed' : 'delivered')
  // 双渲染保活：pkg 延迟更新（如 07 阶段推进/真实执行后）→ 同步 items/status（useState 不随 prop 变）
  useEffect(() => {
    if (pkg) {
      setItems(pkg.acceptance ?? [])
      if (pkg.status === 'closed') setStatus('closed')
    }
  }, [pkg])
  // 05 执行层 A：diff 审核状态（applied: Set<路径>——已应用；reverted: Set<路径>）
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [reverted, setReverted] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null) // 待二次确认的 diff 路径

  const applyDiff = async (d: { path: string; diff: string }) => {
    const res = await window.neonforge.delivery.applyDiff(d.path, d.diff, true)
    if (res.ok) {
      setApplied((s) => new Set(s).add(d.path))
      setConfirming(null)
    } else {
      setConfirming(null)
      alert('应用失败: ' + (res.error ?? '未知错误'))
    }
  }
  const revertDiff = async (d: { path: string }) => {
    const res = await window.neonforge.delivery.revertDiff(d.path)
    if (res.ok) {
      setReverted((s) => new Set(s).add(d.path))
      setApplied((s) => { const n = new Set(s); n.delete(d.path); return n })
    } else {
      alert('回滚失败: ' + (res.error ?? '未知错误'))
    }
  }

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
        <span className={`nf-delivery__badge${status === 'closed' ? ' nf-delivery__badge--closed' : ''}`}>
          {status === 'closed' ? '✅ 已关闭' : '✅ 已解决'}
        </span>
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

      {items.length > 0 && (
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
      )}

      {pkg.diffs && pkg.diffs.length > 0 && (
        <section className="nf-delivery__block">
          <h4>开发者视图 · diff 审核（L3 授权）</h4>
          {pkg.diffs.map((d, i) => {
            const isApplied = applied.has(d.path)
            const isReverted = reverted.has(d.path)
            const isConfirming = confirming === d.path
            return (
              <div key={i} className="nf-diffcard">
                <div className="nf-diffcard__head">
                  <span className="nf-diffcard__path">📄 {d.path}</span>
                  <span className="nf-diffcard__state">
                    {isReverted ? '↩️ 已回滚' : isApplied ? '✅ 已应用' : '⏳ 待审核'}
                  </span>
                </div>
                <pre className="nf-diffcard__body">{d.diff.slice(0, 400)}</pre>
                {isConfirming ? (
                  <div className="nf-diffcard__actions">
                    <span className="nf-diffcard__hint">将写入 {d.path}（快照可回滚）——确认？</span>
                    <button type="button" className="nf-diffcard__confirm" onClick={() => void applyDiff(d)}>确认写入</button>
                    <button type="button" className="nf-diffcard__cancel" onClick={() => setConfirming(null)}>取消</button>
                  </div>
                ) : isApplied ? (
                  <div className="nf-diffcard__actions">
                    <button type="button" className="nf-diffcard__revert" onClick={() => void revertDiff(d)}>↩️ 回滚</button>
                  </div>
                ) : (
                  <div className="nf-diffcard__actions">
                    <button type="button" className="nf-diffcard__accept" onClick={() => setConfirming(d.path)}>接受并写入</button>
                    <button type="button" className="nf-diffcard__reject" onClick={() => setReverted((s) => new Set(s).add(d.path))}>拒绝</button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {pkg.nextSteps.length > 0 && (
        <section className="nf-delivery__block">
          <h4>下一步 / 指导</h4>
          <ul className="nf-delivery__steps">
            {pkg.nextSteps.map((s, i) => <li key={i}>→ {s}</li>)}
          </ul>
        </section>
      )}

      {pkg.rerunLabel && (
        <button
          type="button"
          className="nf-delivery__rerun"
          onClick={() => (pkg.rerunPrompt ? onRerun(pkg.rerunPrompt) : onAdjust())}
        >
          ↻ {pkg.rerunLabel}
        </button>
      )}

      <div className="nf-delivery__actions">
        {status !== 'closed' && items.length > 0 && (
          <>
            <button
              type="button"
              className="nf-delivery__primary"
              disabled={!allDone}
              title={allDone ? '验收全部通过，问题关闭' : '请先勾选全部验收项'}
              onClick={() => setStatus('closed')}
            >
              确认问题关闭
            </button>
            {!allDone && <span className="nf-delivery__hint">请先勾选全部验收项</span>}
          </>
        )}
        {status !== 'closed' && (
          <button type="button" className="nf-delivery__ghost" onClick={onAdjust}>继续调整</button>
        )}
      </div>
    </div>
  )
}
