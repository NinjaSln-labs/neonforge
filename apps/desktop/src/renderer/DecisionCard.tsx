// S1b Task 5（F1/C6）：拍板卡——呈现待决决策点；批准/拒绝经 decision:resolve。
// C6 不可绕过＝本件不含任何推进副作用，唯一出口是 resolve；不动领域状态（S-1）。
import { useState } from 'react'
import type { DecisionDTO } from './useDomainView'

export default function DecisionCard({
  decision,
  onResolve,
}: {
  decision: DecisionDTO | null
  onResolve: (decisionPointId: string, value: string, reason?: string) => void
}) {
  const [reason, setReason] = useState('')
  if (!decision) {
    return (
      <div className="nf-decisioncard nf-decisioncard--empty">
        <div className="nf-decisioncard__empty">无待拍板事项</div>
      </div>
    )
  }
  const reason0 = decision.requestReason
  return (
    <div className="nf-decisioncard">
      <div className="nf-decisioncard__head">待拍板</div>
      <div className="nf-decisioncard__body">
        <div className="nf-decisioncard__reason-text">{reason0?.reason ?? ''}</div>
        <div className="nf-decisioncard__operation">{reason0?.operation ?? ''}</div>
      </div>
      <input
        className="nf-decisioncard__reason"
        placeholder="拒绝理由（可选）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="nf-decisioncard__actions">
        <button
          type="button"
          className="nf-decisioncard__btn nf-decisioncard__btn--ok"
          onClick={() => onResolve(decision.decisionPointId, '批准')}
        >
          批准
        </button>
        <button
          type="button"
          className="nf-decisioncard__btn nf-decisioncard__btn--no"
          onClick={() => onResolve(decision.decisionPointId, '拒绝', reason || undefined)}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}
