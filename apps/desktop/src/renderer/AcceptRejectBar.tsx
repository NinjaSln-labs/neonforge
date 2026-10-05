// S1b Task 5（F1）：验收/拒绝——呈现按钮；accept→delegation:accept，reject→delegation:reject（重开挂原单）。
// 与 DecisionCard 同构（都是「按钮＋回一个桥调用」）；此件落委托级收尾，就被测选中委托而言与拍板卡语义不同故分立。
export default function AcceptRejectBar({
  delegationId,
  onAccept,
  onReject,
}: {
  delegationId: string | null
  onAccept: (id: string) => void
  onReject: (id: string) => void
}) {
  if (!delegationId) return null
  return (
    <div className="nf-acceptrejectbar">
      <button
        type="button"
        className="nf-acceptrejectbar__accept"
        onClick={() => onAccept(delegationId)}
      >
        验收
      </button>
      <button
        type="button"
        className="nf-acceptrejectbar__reject"
        onClick={() => onReject(delegationId)}
      >
        拒绝验收
      </button>
    </div>
  )
}
