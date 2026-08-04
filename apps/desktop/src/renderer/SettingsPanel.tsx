import { useEffect, useState } from 'react'
import { IconCheck, IconDot, IconSettings } from './icons'

// 设置（ticket 08 / D0 §9 最小集）——2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒无消费方——诚实性优先）
// 保留真实内容：内置插件（真实 IPC 注册表）+ 快捷键表（真实已实现）
// 2026-08-04：L4 委托开关产品入口（原只在 demo TrustLadderPanel——产品运行时不可达）；与 ConversationPanel 同 localStorage key + 事件联动
const DELEGATE_KEY = 'nf-delegate-lowrisk'
const readDelegate = () => { try { return localStorage.getItem(DELEGATE_KEY) === '1' } catch { return false } }

export default function SettingsPanel({ onClose }: { onClose?: () => void }) {
  // 2026-08-04 审计修复（D3）：Esc 关闭设置（页内面板——键盘用户退出路径；点击外部关闭留给后续）
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
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

  // L4 委托（ticket 14）：低危 write/edit 自动授权免确认——产品入口（对话授权行为实时联动）
  const [delegate, setDelegate] = useState(readDelegate)
  const handleDelegate = (v: boolean) => {
    setDelegate(v)
    try { localStorage.setItem(DELEGATE_KEY, v ? '1' : '0') } catch { /* 存储不可用——本次会话仍生效 */ }
    window.dispatchEvent(new Event('nf-delegate-changed'))
  }

  return (
    <div className="nf-settings">
      <div className="nf-flow__head">
        <span className="nf-flow__title"><IconSettings size={14} /> 设置</span>
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">内置插件（暂不支持安装新插件）</span>
        <div className="nf-settings__plugins-list">
          {pluginList.map((p) => (
            <span key={p.name} className="nf-settings__plugin">
              {p.name} <em>{p.active ? <IconCheck size={11} /> : <IconDot size={11} />}</em>
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

      {/* 2026-08-04：L4 委托开关（真实——与对话授权联动；原仅 demo TrustLadderPanel 可开，产品无入口） */}
      <div className="nf-settings__row">
        <span>低风险文件操作自动授权 <em>写入/修改文件不再每次确认——会先备份、可随时关闭；执行命令始终单独确认</em></span>
        <label className="nf-settings__row--switch">
          <input
            type="checkbox"
            checked={delegate}
            onChange={(e) => handleDelegate(e.target.checked)}
            aria-label="低风险文件操作自动授权"
          />
        </label>
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
