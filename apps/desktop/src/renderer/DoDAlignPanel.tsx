import { useState } from 'react'
import { IconCheck } from './icons'

// DoD 对齐（ticket 15b）：动手前用用户的话复述问题 + 验收标准——"什么叫解决"前置
export default function DoDAlignPanel() {
  const [accepted, setAccepted] = useState<boolean[]>([]) // 验收项确认状态
  const [confirmed, setConfirmed] = useState(false)

  const dod = [
    '打开这个链接能看到我的照片和介绍',
    '手机和电脑上都能正常打开',
    '别人点链接也能访问（源码已交付 + 发布指导）'
  ]

  const allAccepted = accepted.length === dod.length && accepted.every(Boolean)

  const toggle = (i: number) => {
    setAccepted((prev) => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })
  }

  return (
    <div className="nf-dod">
      <div className="nf-flow__head">
        <span className="nf-flow__title">🎯 对齐：什么叫「解决」</span>
        {confirmed && <span className="nf-flow__model">已确认 ✓</span>}
      </div>

      <p className="nf-dod__restate">
        你的问题我理解为：<strong>「做一个能发给朋友的旅行手册网页」</strong>——做成这样算解决：
      </p>

      <ul className="nf-dod__list">
        {dod.map((d, i) => (
          <li key={i}>
            <button
              type="button"
              className={`nf-check${accepted[i] ? ' nf-check--done' : ''}`}
              aria-label={accepted[i] ? `取消：${d}` : `确认：${d}`}
              onClick={() => toggle(i)}
            >
              {accepted[i] ? '☑' : '☐'}
            </button>
            <span>{d}</span>
          </li>
        ))}
      </ul>

      {!confirmed && (
        <div className="nf-dod__actions">
          <button
            type="button"
            className="nf-delivery__primary"
            disabled={!allAccepted}
            onClick={() => setConfirmed(true)}
          >
            确认，开始解决
          </button>
          <button type="button" className="nf-delivery__ghost">调整理解</button>
        </div>
      )}
      {confirmed && <p className="nf-flow__done"><IconCheck size={12} /> 验收标准已对齐——开始解决（按此对照交付）</p>}
    </div>
  )
}
