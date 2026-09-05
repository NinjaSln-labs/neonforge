// A-019（S4-St-1/2——stage-review-V1.5-S4）：候选按钮共享组件——单源
// 消费方：① <candidates> 文本标记降级通道（ConversationPanel 消息渲染）② ask_user 工具选项按钮
// 共享：序号表 / 已选·已回复态（点选 chosen + 输入 replied 双路径）/ .nf-candidates 标记结构
export interface CandidateOption {
  label: string
  description?: string
}

const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

export function CandidateButtons(props: {
  options: CandidateOption[]
  // 回应判定归调用方（两处语义相同——「本消息之后出现用户消息」，但闭包上下文不同）
  replied: boolean
  // 点选路径的已选标记（candidates 独有——chosenCandidates 记忆；ask_user 无点选记忆）
  chosen?: number
  onPick: (label: string, j: number) => void
  ariaLabel?: string
}) {
  return (
    <div className="nf-candidates" role="group" aria-label={props.ariaLabel ?? '选择一项'}>
      {props.options.map((o, j) => {
        const chosen = props.chosen === j
        const done = chosen || props.replied
        return (
          <button
            key={j}
            type="button"
            disabled={done}
            className={`nf-candidates__btn${done ? ' nf-candidates__btn--chosen' : ''}`}
            onClick={() => props.onPick(o.label, j)}
          >
            <span className="nf-candidates__idx" aria-hidden="true">
              {chosen ? '✓' : props.replied ? '·' : (NUMS[j] ?? `${j + 1}.`)}
            </span>
            <span>
              {chosen ? `${o.label}（已选）` : props.replied ? `${o.label}（已回复）` : o.label}
              {o.description ? `：${o.description}` : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
