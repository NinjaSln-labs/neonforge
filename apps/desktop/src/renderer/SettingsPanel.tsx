import { useEffect, useState } from 'react'
import { IconCheck, IconDot, IconSettings } from './icons'

// 设置（ticket 08 / D0 §9 最小集）——2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒无消费方——诚实性优先）
// 保留真实内容：内置插件（真实 IPC 注册表）+ 快捷键表（真实已实现）
// 2026-08-04：L4 委托开关产品入口（原只在 demo TrustLadderPanel——产品运行时不可达）；与 ConversationPanel 同 localStorage key + 事件联动
const DELEGATE_KEY = 'nf-delegate-lowrisk'
const readDelegate = () => {
  try {
    return localStorage.getItem(DELEGATE_KEY) === '1'
  } catch {
    return false
  }
}

export default function SettingsPanel({ onClose }: { onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [plugins, setPlugins] = useState<Array<{ name: string; active: boolean }> | null>(null)
  useEffect(() => {
    void window.neonforge.plugins?.list?.().then(setPlugins)
  }, [])
  const pluginList =
    plugins ??
    ['code-rag', 'mcp-bridge', 'git', 'stats', 'language-server'].map((name) => ({
      name,
      active: true,
    }))

  const togglePlugin = (name: string, active: boolean) => {
    void window.neonforge.plugins?.toggle?.(name, active).then((ok) => {
      if (ok)
        setPlugins((prev) => prev?.map((p) => (p.name === name ? { ...p, active } : p)) ?? null)
    })
  }

  const [delegate, setDelegate] = useState(readDelegate)
  const handleDelegate = (v: boolean) => {
    setDelegate(v)
    try {
      localStorage.setItem(DELEGATE_KEY, v ? '1' : '0')
    } catch {
      /* 存储不可用——本次会话仍生效 */
    }
    window.dispatchEvent(new Event('nf-delegate-changed'))
  }

  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const handleExport = () => {
    setExportMsg(null)
    void window.neonforge.chatLog?.export?.().then((r) => {
      setExportMsg(r.ok ? `已导出：${r.path ?? ''}` : (r.error ?? '导出失败'))
    })
  }

  // 外网检索（web_search / web_fetch）
  const [webEnabled, setWebEnabled] = useState(false)
  const [webProbeOk, setWebProbeOk] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [webKey, setWebKey] = useState('')
  const [keenableKey, setKeenableKey] = useState('')
  const [keenableTrial, setKeenableTrial] = useState(false)
  const [webBusy, setWebBusy] = useState(false)
  const [webMsg, setWebMsg] = useState<string | null>(null)
  useEffect(() => {
    void window.neonforge.config.getWebAccess?.().then((w) => {
      if (!w) return
      setWebEnabled(w.enabled)
      setWebProbeOk(w.probeOk)
      setWebUrl(w.searchUrl ?? '')
      setWebKey(w.searchKey ?? '')
      setKeenableKey(w.keenableApiKey ?? '')
      setKeenableTrial(w.keenablePublicTrial)
    })
  }, [])

  const saveWebAccess = async (enabled: boolean, opts?: { keenablePublicTrial?: boolean }) => {
    setWebBusy(true)
    setWebMsg(null)
    const trial = opts?.keenablePublicTrial ?? keenableTrial
    const res = await window.neonforge.config.setWebAccess?.({
      enabled,
      searchUrl: webUrl.trim() || null,
      searchKey: webKey.trim() || null,
      keenableApiKey: keenableKey.trim() || null,
      keenablePublicTrial: trial,
      probe: enabled,
    })
    setWebBusy(false)
    if (!res) {
      setWebMsg('当前环境不支持外网设置')
      return
    }
    if (!res.ok) {
      setWebEnabled(false)
      setWebProbeOk(false)
      setWebMsg(res.error ?? '外网探测失败')
      return
    }
    setWebEnabled(res.config.enabled)
    setWebProbeOk(res.config.probeOk)
    setWebMsg(
      res.config.enabled
        ? res.config.searchUrl
          ? '已开启（使用自有搜索端点）'
          : res.config.builtinProvider === 'keenable'
            ? res.config.hasKeenableKey
              ? '已开启（内置：Keenable，已配置 Key）'
              : res.config.keenablePublicTrial
                ? '已开启（内置：Keenable 公共试用）'
                : '已开启（Keenable 可达；搜索前请配置 Key 或开启试用）'
            : res.config.builtinProvider === 'ddg'
              ? '已开启（内置：DuckDuckGo）'
              : '已开启（外网探测通过）'
        : '已关闭外网检索',
    )
  }

  return (
    <div className="nf-settings">
      <div className="nf-flow__head">
        <span className="nf-flow__title">
          <IconSettings size={14} /> 设置
        </span>
      </div>

      <div className="nf-settings__row">
        <span>
          导出对话记录{' '}
          <em>把最近对话导出为 .md 文件（保存到 下载 文件夹），方便反馈时发给搭档看实际情况</em>
        </span>
        <button type="button" className="nf-settings__export" onClick={handleExport}>
          导出
        </button>
      </div>
      {exportMsg && <p className="nf-settings__export-msg">{exportMsg}</p>}

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">外网检索（web_search / web_fetch）</span>
        <div className="nf-settings__row">
          <span>
            允许外网检索{' '}
            <em>
              开启时探测外网；可填自有搜索 URL（POST {'{'}query{'}'}）覆盖内置。探测状态：
              {webProbeOk ? '通过' : '未通过/未测'}
            </em>
          </span>
          <label className="nf-settings__row--switch">
            <input
              type="checkbox"
              checked={webEnabled}
              disabled={webBusy}
              onChange={(e) => void saveWebAccess(e.target.checked)}
              aria-label="允许外网检索"
            />
          </label>
        </div>
        <label className="nf-settings__row">
          <span>自有搜索端点 URL（可选）</span>
          <input
            type="url"
            className="nf-config__input"
            placeholder="https://example.com/search"
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            onBlur={() => {
              if (webEnabled) void saveWebAccess(true)
            }}
          />
        </label>
        <label className="nf-settings__row">
          <span>自有搜索 Key（可选 Bearer）</span>
          <input
            type="password"
            className="nf-config__input"
            placeholder="留空则不带 Authorization"
            value={webKey}
            onChange={(e) => setWebKey(e.target.value)}
            onBlur={() => {
              if (webEnabled) void saveWebAccess(true)
            }}
          />
        </label>
        <label className="nf-settings__row">
          <span>
            Keenable API Key{' '}
            <em>
              DDG 不可达时使用；查询由 Keenable 在美国处理。免费额度见 keenable.ai（需账号）。
            </em>
          </span>
          <input
            type="password"
            className="nf-config__input"
            placeholder="keen_…"
            value={keenableKey}
            onChange={(e) => setKeenableKey(e.target.value)}
            onBlur={() => {
              if (webEnabled) void saveWebAccess(true)
            }}
            aria-label="Keenable API Key"
          />
        </label>
        <div className="nf-settings__row">
          <span>
            允许无 Key 公共试用 <em>每 IP 约 1000 次/小时，共享池，仅评估</em>
          </span>
          <label className="nf-settings__row--switch">
            <input
              type="checkbox"
              checked={keenableTrial}
              disabled={webBusy}
              onChange={(e) => {
                const v = e.target.checked
                setKeenableTrial(v)
                if (webEnabled) void saveWebAccess(true, { keenablePublicTrial: v })
              }}
              aria-label="允许无 Key 公共试用"
            />
          </label>
        </div>
        {webMsg && <p className="nf-settings__export-msg">{webMsg}</p>}
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

      <div className="nf-settings__row">
        <span>
          低风险文件操作自动授权{' '}
          <em>写入/修改文件不再每次确认——会先备份、可随时关闭；执行命令始终单独确认</em>
        </span>
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
