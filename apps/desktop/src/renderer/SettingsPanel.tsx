import { useState } from 'react'

// 设置（ticket 08 / D0 §9 最小集）：语言 / 默认视图 / 主动提醒开关（原则 6：安静默认）
export default function SettingsPanel() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [view, setView] = useState<'chat' | 'output'>('chat')
  const [remind, setRemind] = useState(false)

  return (
    <div className="nf-settings">
      <div className="nf-flow__head">
        <span className="nf-flow__title">⚙ 设置</span>
        <span className="nf-flow__model">最小集（V1）</span>
      </div>

      <label className="nf-settings__row">
        <span>语言</span>
        <div className="nf-settings__seg">
          {(['zh', 'en'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`nf-settings__seg-btn${lang === v ? ' nf-settings__seg-btn--on' : ''}`}
              onClick={() => setLang(v)}
            >
              {v === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </label>

      <label className="nf-settings__row">
        <span>默认视图</span>
        <div className="nf-settings__seg">
          {([['chat', '对话优先'], ['output', '工程优先']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`nf-settings__seg-btn${view === v ? ' nf-settings__seg-btn--on' : ''}`}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </label>

      <label className="nf-settings__row nf-settings__row--switch">
        <span>长时间不动主动提醒 <em>（默认关——原则：安静不打扰）</em></span>
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
      </label>
    </div>
  )
}
