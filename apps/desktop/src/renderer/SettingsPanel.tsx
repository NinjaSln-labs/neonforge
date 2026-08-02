import { useEffect, useState } from 'react'

// 设置（ticket 08 / D0 §9 最小集）：语言 / 默认视图 / 主动提醒开关（原则 6：安静默认）
export default function SettingsPanel() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [view, setView] = useState<'chat' | 'output'>('chat')
  const [remind, setRemind] = useState(false)
  // 08 内置插件：真实注册表状态（mock/无通道 → null → 静态占位）
  const [plugins, setPlugins] = useState<Array<{ name: string; active: boolean }> | null>(null)
  useEffect(() => {
    void window.neonforge.plugins?.list?.().then(setPlugins)
  }, [])
  const pluginList = plugins ?? ['code-rag', 'mcp-bridge', 'git', 'stats', 'language-server'].map((name) => ({ name, active: true }))

  const togglePlugin = (name: string, active: boolean) => {
    void window.neonforge.plugins?.toggle?.(name, active).then((ok) => {
      if (ok) setPlugins((prev) => prev?.map((p) => (p.name === name ? { ...p, active } : p)) ?? null)
    })
  }

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

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">内置插件（V1 无市场，仅注册）</span>
        <div className="nf-settings__plugins-list">
          {pluginList.map((p) => (
            <span key={p.name} className="nf-settings__plugin">
              {p.name} <em>{p.active ? '✓' : '○'}</em>
              <button
                type="button"
                className="nf-settings__plugin-toggle"
                aria-label={`${p.active ? '停用' : '启用'} ${p.name}`}
                onClick={() => togglePlugin(p.name, !p.active)}
              >
                {p.active ? '停用' : '启用'}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="nf-settings__shortcuts">
        <span className="nf-settings__plugins-title">快捷键</span>
        <div className="nf-settings__shortcuts-list">
          <span>⌘ + , 打开 / 关闭设置</span>
          <span>⌘ + Enter 发送消息</span>
        </div>
      </div>
    </div>
  )
}
