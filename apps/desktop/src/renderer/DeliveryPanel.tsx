import { useEffect, useRef, useState } from 'react'
import type { AcceptanceRecord, DeliveryPackage, GateResult } from './types'
import { parseDiffLines, type DiffLine } from './diffRender'
import { IconCheck, IconClock, IconFile, IconRotateCcw, IconX } from './icons'

// 交付包视图（ticket 05）：产物 + 验收对照 + 下一步/指导——「问题已解决」的可验证呈现
// 视觉：深紫浮面 + 靛紫 accent；验收打勾交互；「确认关闭」= 问题终态（交付 ≠ 解决）
export default function DeliveryPanel({
  pkg,
  sessionId,
  rootPath,
  onAdjust,
  onRerun,
  onConfirmed,
}: {
  pkg: DeliveryPackage | null
  sessionId?: string
  rootPath?: string
  onAdjust: () => void
  onRerun: (prompt: string) => void
  onConfirmed?: () => void // 2026-08-03 A5 审计修复：确认问题关闭 → 通知上层同步台账状态（closed）
}) {
  const [items, setItems] = useState(pkg?.acceptance ?? [])
  const [status, setStatus] = useState<'delivered' | 'closed'>(
    pkg?.status === 'closed' ? 'closed' : 'delivered',
  )
  // BC-14：main 权威验收记录 + 门禁结论
  const [record, setRecord] = useState<AcceptanceRecord | null>(null)
  const [gate, setGate] = useState<GateResult | null>(null)
  const [acceptEmpty, setAcceptEmpty] = useState(false)
  // 2026-11-17 审查修复：只有 acceptance:list 成功且确认无记录后，才允许勾选「无验收来源」
  const [acceptanceReady, setAcceptanceReady] = useState(false)
  // BC-10：变更集（真实变更的基线/状态/整集回滚）
  const [changeSet, setChangeSet] = useState<{
    status: string
    items: Array<{ id: string; path: string; status: string }>
  } | null>(null)
  // 2026-08-03 A3 审计修复：操作失败内联错误条（替代原生 alert——深色 UI 割裂 + 阻断式）
  const [error, setError] = useState<string | null>(null)
  const refreshChangeSet = async (sid?: string) => {
    if (!sid) return
    try {
      const c = await window.neonforge.changeset?.list(sid)
      if (sessionIdRef.current !== sid) return
      setChangeSet(c ? { status: c.status, items: c.items } : null)
    } catch (e) {
      if (sessionIdRef.current === sid) setError(e instanceof Error ? e.message : String(e))
    }
  }
  const revertChangeSetAll = async () => {
    if (!sessionId) return
    setError(null)
    try {
      const r = await window.neonforge.changeset?.revert(sessionId)
      if (!r) return
      if (!r.ok) setError(r.error ?? '回滚失败')
      // P1 修复：只移除成功回滚的文件；失败/冲突文件仍保持 applied，避免重新作为待审核 diff 被二次应用
      setApplied((prev) => {
        const next = new Set(prev)
        for (const p of r.reverted) next.delete(p)
        return next
      })
      setReverted(new Set(r.reverted))
      await refreshChangeSet(sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  // P1 修复：异步响应必须属于当前会话（旧会话迟到响应不得覆盖新会话状态）
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  const refreshAcceptance = async (sid?: string) => {
    if (!sid) {
      setAcceptanceReady(false)
      return
    }
    setAcceptanceReady(false)
    try {
      const api = window.neonforge.acceptance
      if (!api?.list) return
      const r = await api.list(sid)
      if (sessionIdRef.current !== sid) return
      setRecord(r ?? null)
      const g = await api.evaluate?.(sid)
      if (sessionIdRef.current !== sid) return
      setGate(g ?? null)
      setAcceptanceReady(true)
    } catch (e) {
      if (sessionIdRef.current === sid) {
        setError(e instanceof Error ? e.message : String(e))
        setAcceptanceReady(false)
      }
    }
  }
  const markAcceptance = async (itemId: string) => {
    if (!sessionId) return
    try {
      const r = await window.neonforge.acceptance?.mark(sessionId, itemId, 'passed', {
        manualReason: '用户在交付面板手工确认',
      })
      if (sessionIdRef.current !== sessionId) return
      if (r) {
        setRecord(r)
        const g = await window.neonforge.acceptance?.evaluate(sessionId)
        if (sessionIdRef.current !== sessionId) return
        setGate(g ?? null)
      }
    } catch (e) {
      if (sessionIdRef.current === sessionId) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }
  const acceptNoAcceptance = async () => {
    if (!sessionId) {
      setAcceptEmpty(false)
      return
    }
    try {
      const r = await window.neonforge.acceptance?.acceptEmpty?.(sessionId)
      if (!r) {
        setAcceptEmpty(false)
        setError('无法确认无验收来源（验收记录读取失败或已有记录）——请稍后重试')
        return
      }
      setRecord(r)
      const g = await window.neonforge.acceptance?.evaluate?.(sessionId)
      setGate(g ?? null)
    } catch (e) {
      setAcceptEmpty(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  // 双渲染保活：pkg 延迟更新（如 07 阶段推进/真实执行后）→ 同步 items/status（useState 不随 prop 变）
  useEffect(() => {
    if (pkg) {
      setItems(pkg.acceptance ?? [])
      if (pkg.status === 'closed') setStatus('closed')
    }
  }, [pkg])
  useEffect(() => {
    void refreshAcceptance(sessionId) // BC-14：会话切换/交付包变化时重取验收记录与门禁
    void refreshChangeSet(sessionId) // BC-10：重取变更集
  }, [sessionId, pkg])
  // 05 执行层 A：diff 审核状态（applied: Set<路径>——已应用；reverted: Set<路径>）
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [reverted, setReverted] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null) // 待二次确认的 diff 路径

  const applyDiff = async (d: { path: string; diff: string }) => {
    setError(null)
    const res = await window.neonforge.delivery.applyDiff(d.path, d.diff, true, sessionId, rootPath)
    if (res.ok) {
      setApplied((s) => new Set(s).add(d.path))
      setConfirming(null)
      void refreshChangeSet(sessionId)
    } else {
      setConfirming(null)
      setError(`应用失败：${res.error ?? '未知错误'}`)
    }
  }
  const revertDiff = async (d: { path: string }) => {
    setError(null)
    const res = await window.neonforge.delivery.revertDiff(d.path, sessionId, rootPath)
    if (res.ok) {
      setReverted((s) => new Set(s).add(d.path))
      setApplied((s) => {
        const n = new Set(s)
        n.delete(d.path)
        return n
      })
      void refreshChangeSet(sessionId)
    } else {
      setError(`回滚失败：${res.error ?? '未知错误'}`)
    }
  }

  // 非技术视图主路径（D0 §3.8）：全部接受并写入（批量应用所有待审核 diff——逐条成功/失败记录）
  const [acceptAllBusy, setAcceptAllBusy] = useState(false)
  const acceptAll = async (diffs: Array<{ path: string; diff: string }>) => {
    const pending = diffs.filter((d) => !applied.has(d.path) && !reverted.has(d.path))
    if (pending.length === 0) return
    setAcceptAllBusy(true)
    setError(null)
    const ok: string[] = []
    const fail: Array<{ path: string; error: string }> = []
    for (const d of pending) {
      const res = await window.neonforge.delivery.applyDiff(
        d.path,
        d.diff,
        true,
        sessionId,
        rootPath,
      )
      if (res.ok) ok.push(d.path)
      else fail.push({ path: d.path, error: res.error ?? '未知错误' })
    }
    setApplied((s) => {
      const n = new Set(s)
      ok.forEach((p) => n.add(p))
      return n
    })
    setAcceptAllBusy(false)
    void refreshChangeSet(sessionId)
    if (fail.length > 0)
      setError(
        `有 ${fail.length} 个改动未应用：${fail.map((f) => `${f.path}（${f.error}）`).join('；')}`,
      )
  }

  // 目视 diff：展开/折叠（默认展开小 diff，大 diff 折叠——>80 行收起）
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const diffLineClass = (l: DiffLine) =>
    l.type === 'hunk'
      ? 'nf-diffline nf-diffline--hunk'
      : l.type === 'add'
        ? 'nf-diffline nf-diffline--add'
        : l.type === 'del'
          ? 'nf-diffline nf-diffline--del'
          : 'nf-diffline nf-diffline--ctx'
  const renderDiffLines = (d: { path: string; diff: string }, isExpanded: boolean) => {
    const lines = parseDiffLines(d.diff)
    if (lines.length === 0) return <pre className="nf-diffcard__body">{d.diff.slice(0, 400)}</pre> // 解析失败 fallback
    const shown = isExpanded ? lines : lines.slice(0, 80)
    return (
      <pre className="nf-diffcard__body nf-diffcard__body--lines">
        {shown.map((l, i) => (
          <div key={i} className={diffLineClass(l)}>
            <span className="nf-diffline__ln">
              {l.type === 'hunk' ? '' : (l.oldLine ?? '·')}{' '}
              {l.type === 'hunk' ? '' : (l.newLine ?? '·')}
            </span>
            <span className="nf-diffline__mark">
              {l.type === 'add' ? '+' : l.type === 'del' ? '−' : l.type === 'hunk' ? '@@' : ' '}
            </span>
            <span className="nf-diffline__text">{l.content || ' '}</span>
          </div>
        ))}
      </pre>
    )
  }

  if (!pkg) {
    return <p className="nf-placeholder">还没有交付包——说出你的问题，解决后这里会显示结果</p>
  }

  const recordItems = record?.items ?? []
  const hasRecord = recordItems.length > 0
  const gatePassed = gate
    ? gate.verdict === 'passed' || gate.verdict === 'passed-with-waivers'
    : false
  const allDone = hasRecord
    ? gatePassed
    : items.length === 0
      ? acceptEmpty
      : items.every((i) => i.done)
  const gateLabel = gate
    ? {
        passed: '验收通过',
        'passed-with-waivers': '验收通过（含豁免）',
        failed: '验收未通过',
        incomplete: '验收未完成',
      }[gate.verdict]
    : null
  const blockingLabels = (gate?.blocking ?? [])
    .map((id) => recordItems.find((i) => i.id === id)?.label ?? id)
    .filter(Boolean)
  const changeSetLabel = changeSet
    ? ({
        proposed: '待审核',
        reviewed: '已审核',
        applied: '已应用',
        reverted: '已回滚',
        conflicted: '有冲突',
        superseded: '已替代',
      }[changeSet.status as 'proposed'] ?? changeSet.status)
    : null

  const toggle = (idx: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)))
  }

  return (
    <div className="nf-delivery">
      <div className="nf-delivery__head">
        <span
          className={`nf-delivery__badge${status === 'closed' ? ' nf-delivery__badge--closed' : ''}`}
        >
          {status === 'closed' ? (
            <>
              <IconCheck size={12} /> 已关闭
            </>
          ) : (
            <>
              <IconCheck size={12} /> 已解决
            </>
          )}
        </span>
      </div>
      <p className="nf-delivery__summary">{pkg.summary}</p>
      {error && (
        <div className="nf-delivery__error" role="alert">
          <IconX size={14} /> {error}
        </div>
      )}

      {pkg.artifacts.length > 0 && (
        <section className="nf-delivery__block">
          <h4>产物</h4>
          <ul className="nf-delivery__artifacts">
            {pkg.artifacts.map((a) => (
              <li key={a}>
                <IconFile size={12} /> {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(hasRecord || items.length > 0) && (
        <section className="nf-delivery__block">
          <h4>
            验收对照
            {gateLabel && <span className="nf-meta"> · {gateLabel}</span>}
          </h4>
          {hasRecord ? (
            <ul className="nf-delivery__acceptance">
              {recordItems.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`nf-check${it.status === 'passed' ? ' nf-check--done' : ''}`}
                    aria-label={it.label}
                    disabled={it.status === 'passed'}
                    onClick={() => void markAcceptance(it.id)}
                  >
                    {it.status === 'passed' ? (
                      <IconCheck size={13} />
                    ) : (
                      <span className="nf-check__empty" />
                    )}
                  </button>
                  <span>{it.label}</span>
                  <span className="nf-meta">
                    {it.status === 'passed'
                      ? '已通过'
                      : it.status === 'failed'
                        ? '未通过'
                        : it.status === 'waived'
                          ? `已豁免：${it.waivedReason ?? ''}`
                          : '待确认'}
                    {it.evidenceRef ? ` · ${it.evidenceRef}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="nf-delivery__acceptance">
              {items.map((it, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={`nf-check${it.done ? ' nf-check--done' : ''}`}
                    aria-label={it.done ? `取消勾选：${it.label}` : `勾选：${it.label}`}
                    onClick={() => toggle(i)}
                  >
                    {it.done ? <IconCheck size={13} /> : <span className="nf-check__empty" />}
                  </button>
                  <span>{it.label}</span>
                </li>
              ))}
            </ul>
          )}
          {blockingLabels.length > 0 && (
            <p className="nf-delivery__hint">阻塞项：{blockingLabels.join('、')}</p>
          )}
        </section>
      )}

      {acceptanceReady && !hasRecord && items.length === 0 && status !== 'closed' && (
        <label className="nf-delivery__hint">
          <input
            type="checkbox"
            checked={acceptEmpty}
            onChange={(e) => {
              const v = e.target.checked
              setAcceptEmpty(v)
              if (v) void acceptNoAcceptance()
            }}
          />{' '}
          我确认本次没有验收来源，按交付结果关闭
        </label>
      )}

      {changeSet && changeSet.items.length > 0 && (
        <section className="nf-delivery__block">
          <h4>变更集 · {changeSetLabel}</h4>
          <ul className="nf-delivery__artifacts">
            {changeSet.items.map((it) => (
              <li key={it.id}>
                <IconFile size={12} /> {it.path}
                <span className="nf-meta"> · {it.status}</span>
              </li>
            ))}
          </ul>
          {changeSet.status !== 'reverted' && (
            <button
              type="button"
              className="nf-diffcard__revert"
              onClick={() => void revertChangeSetAll()}
            >
              <IconRotateCcw size={12} /> 回滚整个变更集
            </button>
          )}
        </section>
      )}

      {pkg.diffs && pkg.diffs.length > 0 && (
        <section className="nf-delivery__block">
          <h4>开发者视图 · 改动审核（需授权）</h4>
          {/* 非技术视图主路径（D0 §3.8）：改动说明先行，全部接受为默认操作——免逐条确认 */}
          {pkg.diffs.some((d) => !applied.has(d.path) && !reverted.has(d.path)) && (
            <div className="nf-diffcard__acceptall">
              <span className="nf-diffcard__hint">
                以上改动已审阅——全部接受并写入（已备份，可逐条还原）
              </span>
              <button
                type="button"
                className="nf-diffcard__acceptall-btn"
                disabled={acceptAllBusy}
                onClick={() => void acceptAll(pkg.diffs ?? [])}
              >
                {acceptAllBusy ? '写入中…' : '全部接受并写入'}
              </button>
            </div>
          )}
          {pkg.diffs.map((d, i) => {
            const isApplied = applied.has(d.path)
            const isReverted = reverted.has(d.path)
            const isConfirming = confirming === d.path
            const isExpanded = expanded.has(d.path)
            const totalLines = parseDiffLines(d.diff).length
            const canExpand = totalLines > 80
            return (
              <div key={i} className="nf-diffcard">
                <div className="nf-diffcard__head">
                  <span className="nf-diffcard__path">
                    <IconFile size={12} /> {d.path}
                  </span>
                  <span className="nf-diffcard__state">
                    {isReverted ? (
                      <>
                        <IconRotateCcw size={12} /> 已回滚
                      </>
                    ) : isApplied ? (
                      <>
                        <IconCheck size={12} /> 已应用
                      </>
                    ) : (
                      <>
                        <IconClock size={12} /> 待审核
                      </>
                    )}
                  </span>
                </div>
                {renderDiffLines(d, isExpanded || !canExpand)}
                {canExpand && (
                  <button
                    type="button"
                    className="nf-diffcard__expand"
                    onClick={() =>
                      setExpanded((s) => {
                        const n = new Set(s)
                        if (n.has(d.path)) n.delete(d.path)
                        else n.add(d.path)
                        return n
                      })
                    }
                  >
                    {isExpanded ? '▲ 收起' : `▼ 展开全部（${totalLines} 行）`}
                  </button>
                )}
                {isConfirming ? (
                  <div className="nf-diffcard__actions">
                    <span className="nf-diffcard__hint">
                      将写入 {d.path}（已备份可还原）——确认？
                    </span>
                    <button
                      type="button"
                      className="nf-diffcard__confirm"
                      onClick={() => void applyDiff(d)}
                    >
                      确认写入
                    </button>
                    <button
                      type="button"
                      className="nf-diffcard__cancel"
                      onClick={() => setConfirming(null)}
                    >
                      取消
                    </button>
                  </div>
                ) : isApplied ? (
                  <div className="nf-diffcard__actions">
                    <button
                      type="button"
                      className="nf-diffcard__revert"
                      onClick={() => void revertDiff(d)}
                    >
                      <IconRotateCcw size={12} /> 回滚
                    </button>
                  </div>
                ) : (
                  <div className="nf-diffcard__actions">
                    <button
                      type="button"
                      className="nf-diffcard__accept"
                      onClick={() => setConfirming(d.path)}
                    >
                      接受并写入
                    </button>
                    <button
                      type="button"
                      className="nf-diffcard__reject"
                      onClick={() => setReverted((s) => new Set(s).add(d.path))}
                    >
                      拒绝
                    </button>
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
            {/* 2026-08-04 重审：`→` 移出文本节点 → CSS ::before（读屏不读伪元素——符号清零 + 无障碍） */}
            {pkg.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {pkg.rerunLabel && (
        <button
          type="button"
          className="nf-delivery__rerun"
          onClick={() => (pkg.rerunPrompt ? onRerun(pkg.rerunPrompt) : onAdjust())}
        >
          <IconRotateCcw size={12} /> {pkg.rerunLabel}
        </button>
      )}

      <div className="nf-delivery__actions">
        {status !== 'closed' && (
          <>
            <button
              type="button"
              className="nf-delivery__primary"
              disabled={!allDone}
              title={
                allDone
                  ? '验收通过，问题关闭'
                  : hasRecord
                    ? '请先完成全部验收项'
                    : '请先勾选上方“无验收来源”确认'
              }
              onClick={() => {
                setStatus('closed')
                onConfirmed?.()
              }}
            >
              确认问题关闭
            </button>
            {!allDone && (
              <span className="nf-delivery__hint">
                {hasRecord ? '请先完成全部验收项' : '请先确认无验收来源'}
              </span>
            )}
          </>
        )}
        {status !== 'closed' && (
          <button type="button" className="nf-delivery__ghost" onClick={onAdjust}>
            继续调整
          </button>
        )}
      </div>
    </div>
  )
}
