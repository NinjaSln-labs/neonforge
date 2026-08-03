import { useEffect, useState } from 'react'
import { IconSettings } from './icons'

// 设置（ticket 08 / D0 §9 最小集）——2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒无消费方——诚实性优先）
// 保留真实内容：内置插件（真实 IPC 注册表）+ 快捷键表（真实已实现）
export default function SettingsPanel() {
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
        <span className="nf-flow__title"><IconSettings size={14} /> 设置</span>
        <span className="nf-flow__model">基础版</span>
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">内置插件（暂不支持安装新插件）</span>
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
        <span className="nf-settings__plugins-title">快捷键（只列已实现）</span>
        <div className="nf-settings__shortcuts-list">
          <span>⌘ + , 打开 / 关闭设置</span>
          <span>Enter 发送消息 · Shift+Enter 换行</span>
          <span>⌘ + N 新任务</span>
          <span>⌘ + E @引用当前文件</span>
        </div>
      </div>
    </div>
  )
}
