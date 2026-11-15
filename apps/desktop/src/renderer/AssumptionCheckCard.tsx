// ADR-014（GitHub #13）：假设核对卡——ask_user.assumptions 的结构化采集。
// 用户逐条选择「符合/不符合」并可写修正；点「提交回答」把核对结果作为一条用户消息发送。
// 与自由文本输入等价（输入框仍是主通道）；已回应后控件禁用（按后续用户消息判定，同 CandidateButtons）。
import { useState } from 'react'

const CHOICES = ['符合', '不符合'] as const
type Choice = (typeof CHOICES)[number]

export interface AssumptionCheckCardProps {
  question: string
  assumptions: string[]
  replied: boolean
  onSubmit: (answer: string) => void
}

export function AssumptionCheckCard({
  question,
  assumptions,
  replied,
  onSubmit,
}: AssumptionCheckCardProps) {
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [corrections, setCorrections] = useState<Record<number, string>>({})

  const allChosen = assumptions.every((_, i) => choices[i] !== undefined)
  const submit = (): void => {
    const lines = assumptions.map((text, i) => {
      const choice = choices[i]
      const correction = (corrections[i] ?? '').trim()
      return `- ${text}：${choice}${correction ? `（补充：${correction}）` : ''}`
    })
    onSubmit(`【澄清回答】\n问题：${question}\n${lines.join('\n')}`)
  }

  return (
    <div className="nf-assumptioncheck" role="group" aria-label="假设核对">
      <div className="nf-assumptioncheck__question">{question}</div>
      {assumptions.map((text, i) => (
        <div key={i} className="nf-assumptioncheck__row">
          <div className="nf-assumptioncheck__text">{text}</div>
          <div className="nf-assumptioncheck__choices">
            {CHOICES.map((choice) => {
              const active = choices[i] === choice
              return (
                <button
                  key={choice}
                  type="button"
                  className={`nf-assumptioncheck__choice${active ? ' nf-assumptioncheck__choice--active' : ''}${replied ? ' nf-assumptioncheck__choice--disabled' : ''}`}
                  disabled={replied}
                  aria-pressed={active}
                  onClick={() => setChoices((prev) => ({ ...prev, [i]: choice }))}
                >
                  {choice}
                </button>
              )
            })}
          </div>
          <input
            className="nf-assumptioncheck__input"
            type="text"
            placeholder="补充或修正（可选）"
            value={corrections[i] ?? ''}
            disabled={replied}
            onChange={(e) => setCorrections((prev) => ({ ...prev, [i]: e.target.value }))}
          />
        </div>
      ))}
      <button
        type="button"
        className="nf-assumptioncheck__submit"
        disabled={replied || !allChosen}
        onClick={submit}
      >
        {replied ? '已提交' : '提交回答'}
      </button>
    </div>
  )
}
