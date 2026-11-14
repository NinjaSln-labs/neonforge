// P1-05 阶段 2：确认卡展示组件（目标/执行/达成）。
// 只接收领域快照与回调，不读写 stateRef——决策状态仍由 ConversationPanel/状态机持有。
import type { PlanProposal } from '../domain/conversationState'
import { AssumptionList } from './conversationFormat'

export function GoalConfirmCard({
  statement,
  assumptions,
  onConfirm,
  onReject,
}: {
  statement: string
  assumptions: string[]
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认目标">
      <div className="nf-confirmcard__head">目标确认——需要你确认</div>
      <div className="nf-confirmcard__goal">{statement}</div>
      <AssumptionList items={assumptions} />
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
          onClick={onReject}
        >
          重新描述
        </button>
      </div>
    </div>
  )
}

export function PlanConfirmCard({
  proposal,
  onConfirm,
  onReject,
}: {
  proposal: PlanProposal | null
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认执行方案">
      <div className="nf-confirmcard__head">执行方案——需要你确认后动手</div>
      {proposal && (
        <div className="nf-confirmcard__plan">
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
          onClick={onReject}
        >
          修改方案
        </button>
      </div>
    </div>
  )
}

export function ResolutionConfirmCard({
  pendingQuestions,
  onConfirm,
  onReject,
}: {
  pendingQuestions: string[]
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <div className="nf-confirmcard" role="group" aria-label="确认达成">
      <div className="nf-confirmcard__head">搭档已完成——你确认解决了没有</div>
      {pendingQuestions.length > 0 && (
        <div className="nf-confirmcard__questions" style={{ margin: '6px 0' }}>
          {pendingQuestions.map((q, qi) => (
            <div key={qi} style={{ fontSize: 12, color: 'var(--dim, #8b9bb0)' }}>
              遗留：{q}
            </div>
          ))}
        </div>
      )}
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
          onClick={onReject}
        >
          还要改
        </button>
      </div>
    </div>
  )
}
