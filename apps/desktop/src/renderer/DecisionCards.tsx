// P1-05 阶段 2：确认卡展示组件（目标/执行/达成）。
// 只接收领域快照与回调，不读写 stateRef——决策状态仍由 ConversationPanel/状态机持有。
// 2026-11-24 审计补全：解决卡证据呈现、PlanCard summary/重出、RejectReasonPicker（设计 §02）。
import { useState } from 'react'
import type {
  Assumption,
  CompletionClaim,
  PlanProposal,
  RejectKind,
  RejectReason,
} from '../domain/conversationState'
import { AssumptionList } from './conversationFormat'

const REJECT_OPTIONS: Array<{ kind: RejectKind; label: string }> = [
  { kind: 'direction', label: '方向不对（不是我要的）' },
  { kind: 'scope', label: '范围太大/太小' },
  { kind: 'complexity', label: '太复杂（换个简单做法）' },
  { kind: 'missing-info', label: '信息不全（还有没说的）' },
  { kind: 'other', label: '其他' },
]

/** 拒绝原因选择器（设计 02 §RejectReasonPicker）：非模态、卡内展开；必选 kind 或填写「其他」。
 * 2026-11-24 审计：原拒绝按钮一次点击硬编码 kind——方案修改率/拒绝原因审计不可用。 */
export function RejectReasonPicker({
  onSubmit,
  onCancel,
  ariaLabel = '拒绝原因',
}: {
  onSubmit: (reason: RejectReason) => void
  onCancel: () => void
  ariaLabel?: string
}) {
  const [kind, setKind] = useState<RejectKind | null>(null)
  const [text, setText] = useState('')
  const other = kind === 'other'
  const valid = kind !== null && (!other || text.trim().length > 0)
  return (
    <div className="nf-rejectpicker" role="group" aria-label={ariaLabel}>
      <div className="nf-rejectpicker__title">为什么不行？（可选原因）</div>
      <div className="nf-rejectpicker__options">
        {REJECT_OPTIONS.map((o) => (
          <label key={o.kind} className="nf-rejectpicker__option">
            <input
              type="radio"
              name={`nf-reject-${ariaLabel}`}
              value={o.kind}
              checked={kind === o.kind}
              onChange={() => setKind(o.kind)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {other && (
        <textarea
          className="nf-rejectpicker__text"
          aria-label="其他原因"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="说说哪里不对…"
        />
      )}
      <div className="nf-rejectpicker__actions">
        <button
          type="button"
          className="nf-rejectpicker__submit"
          disabled={!valid}
          onClick={() => {
            if (!valid || !kind) return
            onSubmit({ kind, ...(text.trim() ? { text: text.trim() } : {}) })
          }}
        >
          确认拒绝
        </button>
        <button type="button" className="nf-rejectpicker__cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

export function GoalConfirmCard({
  statement,
  assumptions,
  onConfirm,
  onReject,
}: {
  statement: string
  assumptions: Array<Assumption | string>
  onConfirm: () => void
  /** 2026-11-24 审计：拒绝先展开原因选择器（RejectReasonPicker）——kind 由用户选择 */
  onReject: (reason: RejectReason) => void
  onCancelReject?: () => void
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认目标">
      <div className="nf-confirmcard__head">目标确认——需要你确认</div>
      <div className="nf-confirmcard__goal">{statement}</div>
      <AssumptionList items={assumptions} />
      {picking ? (
        <RejectReasonPicker
          ariaLabel="目标拒绝原因"
          onSubmit={(r) => {
            setPicking(false)
            onReject(r)
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="nf-confirmcard__actions">
          <button
            type="button"
            className="nf-confirmcard__btn nf-confirmcard__btn--ok"
            onClick={onConfirm}
          >
            确认目标
          </button>
          <button
            type="button"
            className="nf-confirmcard__btn nf-confirmcard__btn--no"
            onClick={() => setPicking(true)}
          >
            重新描述
          </button>
        </div>
      )}
    </div>
  )
}

export function PlanConfirmCard({
  proposal,
  onConfirm,
  onReject,
  onRepropose,
}: {
  proposal: PlanProposal | null
  onConfirm: () => void
  /** 「修改方案」= modify（设计：modify 由该类按钮直接触发，不经选择器） */
  onReject: (reason: RejectReason) => void
  /** 「重出」：要求模型重新给方案（reject kind=modify + 明确重出文本） */
  onRepropose?: (reason: RejectReason) => void
}) {
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认执行方案">
      <div className="nf-confirmcard__head">执行方案——需要你确认后动手</div>
      {proposal && (
        <div className="nf-confirmcard__plan">
          {/* 2026-11-24 审计：summary 是设计三要素之一——原先漏渲染 */}
          {proposal.summary && (
            <div className="nf-confirmcard__plan-summary">{proposal.summary}</div>
          )}
          {proposal.files.length > 0 && (
            <ul className="nf-confirmcard__plan-files">
              {proposal.files.map((f) => (
                <li key={f.path}>
                  {f.path}
                  {f.reason ? `（${f.reason}）` : ''}
                </li>
              ))}
            </ul>
          )}
          {proposal.assumptions.length > 0 && <AssumptionList items={proposal.assumptions} />}
          {proposal.verificationPlan.length > 0 && (
            <div className="nf-confirmcard__plan-section">
              <div className="nf-confirmcard__plan-label">验证计划</div>
              <ul>
                {proposal.verificationPlan.map((v, idx) => (
                  <li key={idx}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="nf-confirmcard__actions">
        <button
          type="button"
          className="nf-confirmcard__btn nf-confirmcard__btn--ok"
          onClick={onConfirm}
        >
          确认执行
        </button>
        <button
          type="button"
          className="nf-confirmcard__btn nf-confirmcard__btn--no"
          onClick={() => onReject({ kind: 'modify', target: 'plan' })}
        >
          修改方案
        </button>
        {onRepropose && (
          <button
            type="button"
            className="nf-confirmcard__btn nf-confirmcard__btn--rerun"
            onClick={() => onRepropose({ kind: 'modify', target: 'plan', text: '请重新给出方案' })}
          >
            重出
          </button>
        )}
      </div>
    </div>
  )
}

export function ResolutionConfirmCard({
  claim,
  verificationResults,
  pendingQuestions,
  onConfirm,
  onReject,
}: {
  /** 完成声明（summary + evidence）；audit 2026-11-24：原只显示 pendingQuestions，证据不落地到 UI */
  claim?: CompletionClaim | null
  /** 系统代跑结果（command → ok/output）；缺失 = 仅展示模型自报 */
  verificationResults?: Record<string, { ok: boolean; output?: string }>
  pendingQuestions: string[]
  onConfirm: () => void
  /** 2026-11-24 审计：拒绝先展开原因选择器（RejectReasonPicker） */
  onReject: (reason: RejectReason) => void
}) {
  const [picking, setPicking] = useState(false)
  const items = claim?.evidence.verification ?? []
  const verified = items.filter((v) => v.passed !== false && verificationResults?.[v.command]?.ok)
  const unverified = items.filter((v) => !verified.includes(v))
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认达成">
      <div className="nf-confirmcard__head">搭档已完成——你确认解决了没有</div>
      {claim?.summary && <div className="nf-confirmcard__claim">声明：{claim.summary}</div>}
      {verified.length > 0 && (
        <div className="nf-confirmcard__evidence">
          <div className="nf-confirmcard__plan-label">证据（系统核验 ✓）</div>
          <ul>
            {verified.map((v, i) => (
              <li key={i}>
                {v.command}
                {verificationResults?.[v.command]?.output
                  ? ` → ${String(verificationResults[v.command]?.output).slice(0, 80)}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unverified.length > 0 && (
        <div className="nf-confirmcard__evidence nf-confirmcard__evidence--unverified">
          <div className="nf-confirmcard__plan-label">未经系统核验（需你确认）</div>
          <ul>
            {unverified.map((v, i) => (
              <li key={i}>
                {v.command}
                {v.output ? ` → ${v.output.slice(0, 80)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendingQuestions.length > 0 && (
        <div className="nf-confirmcard__questions" style={{ margin: '6px 0' }}>
          {pendingQuestions.map((q, qi) => (
            <div key={qi} style={{ fontSize: 12, color: 'var(--dim, #8b9bb0)' }}>
              遗留：{q}
            </div>
          ))}
        </div>
      )}
      {picking ? (
        <RejectReasonPicker
          ariaLabel="解决拒绝原因"
          onSubmit={(r) => {
            setPicking(false)
            onReject(r)
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="nf-confirmcard__actions">
          <button
            type="button"
            className="nf-confirmcard__btn nf-confirmcard__btn--ok"
            onClick={onConfirm}
          >
            已解决
          </button>
          <button
            type="button"
            className="nf-confirmcard__btn nf-confirmcard__btn--no"
            onClick={() => setPicking(true)}
          >
            还要改
          </button>
        </div>
      )}
    </div>
  )
}
