import { useEffect, useState } from 'react'
import { IconCheck, IconDot, IconSettings } from './icons'
import type { ApiKeyStatusView, ExtensionInfo, McpServerStatus } from './types'

// 设置（ticket 08 / D0 §9 最小集）——2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒无消费方——诚实性优先）
// 保留真实内容：内置插件（真实 IPC 注册表）+ 快捷键表（真实已实现）
// 2026-08-04：L4 委托开关产品入口（原只在 demo TrustLadderPanel——产品运行时不可达）；与 ConversationPanel 同 localStorage key + 事件联动
const DELEGATE_KEY = 'nf-delegate-lowrisk'
const KEY_SOURCE_LABEL: Record<ApiKeyStatusView['source'], string> = {
  env: '环境变量（不落盘）',
  file: '凭据文件（不落盘）',
  encrypted: '系统安全存储（加密）',
  plaintext: '本机明文（已显式允许）',
  none: '未配置',
}
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

  // BC-13 扩展与集成：扩展视图 + MCP 配置（只存命令/参数，不存凭据值）
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null)
  const refreshExtensions = () => {
    void window.neonforge.extensions?.list?.().then(setExtensions)
  }
  useEffect(() => {
    refreshExtensions()
  }, [])
  const toggleExtension = (name: string, active: boolean) => {
    void window.neonforge.extensions?.toggle?.(name, active).then((r) => {
      if (r?.ok) refreshExtensions()
    })
  }
  const authorizeExtension = (name: string) => {
    void window.neonforge.extensions?.authorize?.(name).then(() => refreshExtensions())
  }

  const [mcpPath, setMcpPath] = useState<string>('')
  const [mcpDraft, setMcpDraft] = useState<string>('{\n  "servers": []\n}')
  const [mcpMsg, setMcpMsg] = useState<string | null>(null)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus[]>([])
  useEffect(() => {
    void window.neonforge.mcp?.config?.().then((config) => {
      setMcpPath(config.path)
      setMcpDraft(JSON.stringify({ servers: config.servers }, null, 2))
    })
  }, [])
  const saveMcpConfig = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(mcpDraft)
    } catch {
      setMcpMsg('JSON 格式错误——请检查逗号/引号')
      return
    }
    void window.neonforge.mcp?.save?.(parsed).then((r) => {
      if (r?.ok) {
        setMcpMsg('已保存（尚未连接——点「刷新工具」建立连接）')
        setMcpDraft(JSON.stringify({ servers: r.servers ?? [] }, null, 2))
        refreshExtensions()
      } else {
        setMcpMsg(r?.error ?? '保存失败')
      }
    })
  }
  const refreshMcp = () => {
    setMcpMsg('正在连接 MCP 服务器…')
    void window.neonforge.mcp?.refresh?.().then((r) => {
      setMcpStatus(r?.servers ?? [])
      setMcpMsg(r?.configError ?? null)
      refreshExtensions()
    })
  }

  // BC-12 预算：阈值提醒 + 可选达阈值暂停（不打断进行中的工具调用）
  const [budgetLimit, setBudgetLimit] = useState('')
  const [budgetPause, setBudgetPause] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null)
  useEffect(() => {
    void window.neonforge.budget?.get?.().then((b) => {
      setBudgetLimit(b.state.limit === null ? '' : String(b.state.limit))
      setBudgetPause(b.settings.pauseOnReach)
    })
  }, [])
  const saveBudget = () => {
    const trimmed = budgetLimit.trim()
    const limitUsd = trimmed === '' ? null : Number(trimmed)
    if (limitUsd !== null && (!Number.isFinite(limitUsd) || limitUsd < 0)) {
      setBudgetMsg('预算必须是非负数字（留空 = 不设置）')
      return
    }
    void window.neonforge.budget?.set?.({ limitUsd, pauseOnReach: budgetPause }).then((r) => {
      if (r?.ok) {
        setBudgetMsg('已保存')
        if (r.settings) {
          setBudgetLimit(r.settings.limitUsd === null ? '' : String(r.settings.limitUsd))
          setBudgetPause(r.settings.pauseOnReach)
        }
      } else {
        setBudgetMsg(r?.error ?? '保存失败')
      }
    })
  }

  // BC-12 价格表：未配置时成本诚实为 unknown（预算无法累计）
  const [priceDraft, setPriceDraft] = useState(
    '{\n  "version": "configured-v1",\n  "models": {}\n}',
  )
  const [priceMsg, setPriceMsg] = useState<string | null>(null)
  useEffect(() => {
    void window.neonforge.pricing?.get?.().then((table) => {
      setPriceDraft(JSON.stringify(table, null, 2))
    })
  }, [])
  const savePricing = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(priceDraft)
    } catch {
      setPriceMsg('JSON 格式错误——请检查逗号/引号')
      return
    }
    void window.neonforge.pricing?.set?.(parsed as never).then((r) => {
      if (r?.ok) {
        setPriceMsg('已保存；后续请求按新价格计算')
        if (r.table) setPriceDraft(JSON.stringify(r.table, null, 2))
      } else {
        setPriceMsg(r?.error ?? '保存失败')
      }
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

  // P1-09：密钥来源/轮换提醒（只读，不回传密钥值）
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatusView | null>(null)
  useEffect(() => {
    void window.neonforge.config.getKeyStatus?.().then((s) => setKeyStatus(s ?? null))
  }, [])

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
    try {
      const res = await window.neonforge.config.setWebAccess?.({
        enabled,
        searchUrl: webUrl.trim() || null,
        searchKey: webKey.trim() || null,
        keenableApiKey: keenableKey.trim() || null,
        keenablePublicTrial: trial,
        probe: enabled,
      })
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
    } catch (e) {
      // P1-09：安全存储不可用且未显式 opt-in 时拒绝落盘明文（不留下半更新配置）
      setWebMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setWebBusy(false)
    }
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
        <span className="nf-settings__plugins-title">API Key 存储</span>
        {keyStatus ? (
          <>
            <p className="nf-settings__export-msg">
              来源：{KEY_SOURCE_LABEL[keyStatus.source]}
              {keyStatus.storedAt
                ? `；最近保存：${new Date(keyStatus.storedAt).toLocaleDateString()}`
                : ''}
            </p>
            {keyStatus.plaintextCopy && (
              <p className="nf-settings__export-msg">
                配置中仍存在明文副本——建议重新保存以清除，或改用环境变量/凭据文件
              </p>
            )}
            {keyStatus.rotateRecommended && (
              <p className="nf-settings__export-msg">密钥已保存超过 90 天，建议轮换</p>
            )}
          </>
        ) : (
          <p className="nf-settings__export-msg">未获取到密钥状态</p>
        )}
      </div>

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
        <span className="nf-settings__plugins-title">
          扩展（内置 / Git 只读 / MCP 外部工具——能力调用统一经授权与沙箱）
        </span>
        <div className="nf-settings__plugins-list">
          {extensions
            ? extensions.map((ext) => (
                <span key={ext.name} className="nf-settings__plugin">
                  {ext.name} · {ext.kind} · {ext.status === 'active' ? '已启用' : ext.status}
                  {ext.kind !== 'builtin'
                    ? ` · ${ext.trust === 'builtin' ? '内置信任' : ext.trust === 'user-authorized' ? '已授权' : '未授权'}`
                    : ''}
                  {ext.failureReason ? ` · 失败：${ext.failureReason}` : ''}
                  {ext.capabilities.length > 0 ? ` · ${ext.capabilities.length} 项能力` : ''}
                  <button
                    type="button"
                    className="nf-settings__plugin-toggle"
                    aria-label={`${ext.active ? '停用' : '启用'} ${ext.name}`}
                    onClick={() => toggleExtension(ext.name, !ext.active)}
                  >
                    {ext.active ? '停用' : '启用'}
                  </button>
                  {ext.kind === 'mcp' && ext.status === 'active' && ext.trust === 'untrusted' ? (
                    <button
                      type="button"
                      className="nf-settings__plugin-toggle"
                      onClick={() => authorizeExtension(ext.name)}
                    >
                      授权
                    </button>
                  ) : null}
                </span>
              ))
            : pluginList.map((p) => (
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

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">
          MCP 服务器（外部工具；配置只存命令/参数，不存凭据——凭据请用环境变量）
        </span>
        {mcpPath ? <p className="nf-settings__export-msg">配置：{mcpPath}</p> : null}
        <textarea
          className="nf-settings__mcp-editor"
          rows={6}
          spellCheck={false}
          value={mcpDraft}
          onChange={(e) => setMcpDraft(e.target.value)}
          aria-label="MCP 服务器配置（JSON）"
        />
        <div className="nf-settings__mcp-actions">
          <button type="button" onClick={saveMcpConfig}>
            保存配置
          </button>
          <button type="button" onClick={refreshMcp}>
            刷新工具
          </button>
        </div>
        {mcpMsg ? <p className="nf-settings__export-msg">{mcpMsg}</p> : null}
        {mcpStatus.map((s) => (
          <p key={s.name} className="nf-settings__export-msg">
            {s.ok ? '✓' : '✗'} {s.name}
            {s.ok ? `：${s.tools.map((t) => t.name).join('、') || '（无工具）'}` : `：${s.error}`}
          </p>
        ))}
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">
          预算（USD/自然月；未知价格条目不参与计算——留空 = 不设置）
        </span>
        <div className="nf-settings__mcp-actions">
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetLimit}
            placeholder="周期预算，如 5"
            onChange={(e) => setBudgetLimit(e.target.value)}
            aria-label="周期预算（USD）"
          />
          <label className="nf-settings__row--switch">
            <input
              type="checkbox"
              checked={budgetPause}
              onChange={(e) => setBudgetPause(e.target.checked)}
            />
            达阈值后下一轮暂停
          </label>
          <button type="button" onClick={saveBudget}>
            保存预算
          </button>
        </div>
        {budgetMsg ? <p className="nf-settings__export-msg">{budgetMsg}</p> : null}
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">
          价格表（provider:model → 每百万 token 单价，USD；未配置 = 成本 unknown，预算不累计）
        </span>
        <textarea
          className="nf-settings__mcp-editor"
          rows={7}
          spellCheck={false}
          value={priceDraft}
          onChange={(e) => setPriceDraft(e.target.value)}
          aria-label="价格表配置（JSON）"
        />
        <div className="nf-settings__mcp-actions">
          <button type="button" onClick={savePricing}>
            保存价格表
          </button>
        </div>
        {priceMsg ? <p className="nf-settings__export-msg">{priceMsg}</p> : null}
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
