import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconDot, IconSettings } from './icons'
import type {
  ApiKeyStatusView,
  ExtensionInfo,
  McpServerStatus,
  PermissionRuleView,
  ProblemSyncStatus,
} from './types'
import { useTrustPolicy } from './useTrustPolicy'
import type { TrustMode } from '../domain/trustMode'

// 设置（ticket 08 / D0 §9 最小集）——2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒无消费方——诚实性优先）
// 保留真实内容：内置插件（真实 IPC 注册表）+ 快捷键表（真实已实现）
// 2026-08-04：L4 委托开关产品入口（原只在 demo TrustLadderPanel——产品运行时不可达）
// 2026-08-16 ADR-015：localStorage 布尔开关升级为三档信任模式（main 持久化 + 旧值一次性迁移）
const TRUST_MODE_OPTIONS: Array<{ mode: TrustMode; label: string; hint: string }> = [
  { mode: 'strict', label: '谨慎', hint: '每次写入/修改都授权；方案确认本身不放行文件' },
  { mode: 'standard', label: '标准', hint: '方案确认后清单内新建文件自动放行；修改仍逐次授权' },
  {
    mode: 'delegated',
    label: '低危委托',
    hint: '清单内新建/修改都自动放行；执行命令与清单外文件仍单独授权',
  },
]
const KEY_SOURCE_LABEL: Record<ApiKeyStatusView['source'], string> = {
  env: '环境变量（不落盘）',
  file: '凭据文件（不落盘）',
  encrypted: '系统安全存储（加密）',
  plaintext: '本机明文（已显式允许）',
  none: '未配置',
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
    setMcpMsg('正在连接外部工具…')
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

  // ADR-015：三档信任模式（main 持久化；旧 localStorage 开关由 useTrustPolicy 迁移）
  const { mode: trustMode, error: trustError, setMode: setTrustMode } = useTrustPolicy()
  const [trustMsg, setTrustMsg] = useState<string | null>(null)
  const handleTrustMode = (mode: TrustMode) => {
    void setTrustMode(mode).then((r) => {
      setTrustMsg(
        r.ok
          ? `已切换为「${TRUST_MODE_OPTIONS.find((o) => o.mode === mode)?.label}」模式`
          : (r.error ?? '保存失败'),
      )
    })
  }

  // BC-02 权限规则（持久化到 main userData；deny > allow > ask，specifier 留空 = 该工具全部）
  const [permRules, setPermRules] = useState<PermissionRuleView[]>([])
  const [permAction, setPermAction] = useState<'allow' | 'deny' | 'ask'>('allow')
  const [permTool, setPermTool] = useState('bash')
  const [permSpec, setPermSpec] = useState('')
  const [permMsg, setPermMsg] = useState<string | null>(null)
  // 保存竞态：全量 set 由 ref 串行化（双击 Add / 删除与保存交错不得覆盖新规则）；
  // 初次 list 完成前禁止写（否则空数组会覆盖已持久化的 deny 规则）
  const permBusyRef = useRef(false)
  const [permBusy, setPermBusy] = useState(false)
  const [permLoaded, setPermLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    const list = window.neonforge.permissions?.list
    if (!list) {
      setPermLoaded(true)
      return
    }
    void list
      .call(window.neonforge.permissions)
      .then((rules) => {
        if (alive) setPermRules(rules ?? [])
      })
      .catch(() => {
        /* 读取失败保持空规则——保存前用户仍可重试 */
      })
      .finally(() => {
        if (alive) setPermLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  const savePermissionRules = (next: PermissionRuleView[], onSaved?: () => void) => {
    if (permBusyRef.current) return
    permBusyRef.current = true
    setPermBusy(true)
    setPermMsg(null)
    const finish = () => {
      permBusyRef.current = false
      setPermBusy(false)
    }
    const set = window.neonforge.permissions?.set
    if (!set) {
      setPermMsg('权限规则通道未就绪')
      finish()
      return
    }
    void set
      .call(window.neonforge.permissions, next)
      .then((r) => {
        if (r?.ok) {
          setPermRules(r.rules)
          setPermMsg('已保存（对后续工具调用立即生效）')
          onSaved?.()
        } else {
          setPermMsg(r?.error ?? '保存失败')
        }
      })
      .catch((e) => setPermMsg(e instanceof Error ? e.message : String(e)))
      .finally(finish)
  }
  const addPermissionRule = () => {
    if (!permLoaded || permBusyRef.current) return
    const tool = permTool.trim()
    if (!tool) {
      setPermMsg('工具名不能为空（如 bash / write / edit）')
      return
    }
    savePermissionRules([...permRules, { action: permAction, tool, specifier: permSpec }], () =>
      setPermSpec(''),
    )
  }
  const removePermissionRule = (index: number) => {
    if (permBusyRef.current) return
    savePermissionRules(permRules.filter((_, i) => i !== index))
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

  // ADR-017：当前接入方模型选择（显式模型优先；空 = 自动 flash 档）
  const [activeModel, setActiveModel] = useState<{
    providerId: string
    providerLabel: string
    upstream: string
    shortName: string
  } | null>(null)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelBusy, setModelBusy] = useState(false)
  const [modelMsg, setModelMsg] = useState<string | null>(null)
  const loadModels = () => {
    setModelBusy(true)
    void window.neonforge.gateway
      ?.listModels?.()
      .then((r) => {
        if (r?.ok) {
          setModelOptions(r.models ?? [])
          setModelMsg(null)
        } else {
          setModelMsg(r?.error === 'no-key' ? '未配置 Key，无法拉取模型列表' : '模型列表获取失败')
        }
      })
      .finally(() => setModelBusy(false))
  }
  useEffect(() => {
    void window.neonforge.gateway?.activeModel?.().then((m) => setActiveModel(m ?? null))
    loadModels()
  }, [])
  const changeModel = (modelId: string) => {
    setModelBusy(true)
    void window.neonforge.gateway
      ?.setModel?.(modelId || null)
      .then((r) => {
        if (r?.ok) {
          setActiveModel(r.active ?? null)
          setModelMsg(null)
        } else {
          setModelMsg(r?.error ?? '模型切换失败')
        }
      })
      .finally(() => setModelBusy(false))
  }
  const modelChoices = Array.from(
    new Set([...modelOptions, ...(activeModel?.upstream ? [activeModel.upstream] : [])]),
  )

  // ADR-018：问题台账同步（目录 + 口令来源；口令值只在环境/凭据文件）
  const [problemSync, setProblemSync] = useState<ProblemSyncStatus | null>(null)
  const [problemSyncBusy, setProblemSyncBusy] = useState(false)
  const [problemSyncMsg, setProblemSyncMsg] = useState<string | null>(null)
  const refreshProblemSync = () => {
    void window.neonforge.problems?.syncStatus?.().then((s) => setProblemSync(s ?? null))
  }
  useEffect(() => {
    refreshProblemSync()
  }, [])
  const chooseProblemSyncFolder = () => {
    setProblemSyncBusy(true)
    void window.neonforge.problems
      ?.chooseSyncFolder?.()
      .then((r) => {
        if (r?.canceled) return
        if (r?.ok && r.status) {
          setProblemSync(r.status)
          setProblemSyncMsg('同步目录已保存')
        } else {
          setProblemSyncMsg(r?.error ?? '目录设置失败')
        }
      })
      .finally(() => setProblemSyncBusy(false))
  }
  const clearProblemSyncFolder = () => {
    setProblemSyncBusy(true)
    void window.neonforge.problems
      ?.setSyncFolder?.(null)
      .then((r) => {
        if (r?.ok && r.status) {
          setProblemSync(r.status)
          setProblemSyncMsg('已关闭同步目录')
        } else {
          setProblemSyncMsg(r?.error ?? '关闭失败')
        }
      })
      .finally(() => setProblemSyncBusy(false))
  }
  const syncProblemsNow = () => {
    setProblemSyncBusy(true)
    setProblemSyncMsg('正在同步…')
    void window.neonforge.problems
      ?.syncNow?.()
      .then((r) => {
        if (r?.ok) {
          setProblemSyncMsg(
            `同步完成：${r.total ?? 0} 条（冲突 ${r.conflicts ?? 0}；本地独有 ${r.localOnly ?? 0} / 远端独有 ${r.remoteOnly ?? 0}）`,
          )
          refreshProblemSync()
        } else {
          setProblemSyncMsg(
            r?.error === 'passphrase-missing'
              ? (r.message ?? '未配置同步口令')
              : (r?.message ?? r?.error ?? '同步失败'),
          )
        }
      })
      .finally(() => setProblemSyncBusy(false))
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
  // 2026-11-15 审查修复：Key 只在**用户实际编辑**时随 patch 提交——设置页其它字段的保存
  // （开关/URL/试用/探测）不得把回填值（含 env/文件来源）写回本地配置或误删已有 Key。
  const [webKeySource, setWebKeySource] = useState<'env' | 'file' | 'config' | 'none'>('none')
  const [keenableKeySource, setKeenableKeySource] = useState<'env' | 'file' | 'config' | 'none'>(
    'none',
  )
  const [webKeyDirty, setWebKeyDirty] = useState(false)
  const [keenableKeyDirty, setKeenableKeyDirty] = useState(false)
  useEffect(() => {
    void window.neonforge.config.getWebAccess?.().then((w) => {
      if (!w) return
      setWebEnabled(w.enabled)
      setWebProbeOk(w.probeOk)
      setWebUrl(w.searchUrl ?? '')
      // env/file 来源不回传值（ipc 已脱敏）——只按来源回填本地可编辑值
      const searchSrc = w.searchKeySource ?? (w.searchKey ? 'config' : 'none')
      const keenSrc = w.keenableApiKeySource ?? (w.keenableApiKey ? 'config' : 'none')
      setWebKeySource(searchSrc)
      setKeenableKeySource(keenSrc)
      setWebKey(searchSrc === 'config' ? (w.searchKey ?? '') : '')
      setKeenableKey(keenSrc === 'config' ? (w.keenableApiKey ?? '') : '')
      setWebKeyDirty(false)
      setKeenableKeyDirty(false)
      setKeenableTrial(w.keenablePublicTrial)
    })
  }, [])

  const saveWebAccess = async (enabled: boolean, opts?: { keenablePublicTrial?: boolean }) => {
    setWebBusy(true)
    setWebMsg(null)
    const trial = opts?.keenablePublicTrial ?? keenableTrial
    const sentWebKey = webKeyDirty
    const sentKeenKey = keenableKeyDirty
    const patch: {
      enabled?: boolean
      searchUrl?: string | null
      searchKey?: string | null
      keenableApiKey?: string | null
      keenablePublicTrial?: boolean
      probe?: boolean
    } = {
      enabled,
      searchUrl: webUrl.trim() || null,
      keenablePublicTrial: trial,
      probe: enabled,
    }
    if (sentWebKey) patch.searchKey = webKey.trim() || null
    if (sentKeenKey) patch.keenableApiKey = keenableKey.trim() || null
    try {
      const res = await window.neonforge.config.setWebAccess?.(patch)
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
      setWebKeyDirty(false)
      setKeenableKeyDirty(false)
      setWebKeySource(res.config.searchKeySource ?? 'none')
      setKeenableKeySource(res.config.keenableApiKeySource ?? 'none')
      setWebEnabled(res.config.enabled)
      setWebProbeOk(res.config.probeOk)
      const envSource = (s?: string) => s === 'env' || s === 'file'
      const envNote =
        (sentWebKey && envSource(res.config.searchKeySource)) ||
        (sentKeenKey && envSource(res.config.keenableApiKeySource))
          ? '；环境变量/凭据文件优先——新 Key 暂不生效'
          : ''
      setWebMsg(
        (res.config.enabled
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
          : '已关闭外网检索') + envNote,
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
            <p className="nf-settings__key-status">
              来源：{KEY_SOURCE_LABEL[keyStatus.source]}
              {keyStatus.storedAt
                ? `；最近保存：${new Date(keyStatus.storedAt).toLocaleDateString()}`
                : ''}
            </p>
            {keyStatus.plaintextCopy && (
              <p className="nf-settings__key-status">
                配置中仍存在明文副本——建议重新保存以清除，或改用环境变量/凭据文件
              </p>
            )}
            {keyStatus.rotateRecommended && (
              <p className="nf-settings__key-status">密钥已保存超过 90 天，建议轮换</p>
            )}
          </>
        ) : (
          <p className="nf-settings__key-status">未获取到密钥状态</p>
        )}
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">模型</span>
        <p className="nf-settings__key-status">
          {activeModel
            ? `当前：${activeModel.providerLabel} · ${activeModel.upstream}`
            : '未获取到当前模型'}
        </p>
        <div className="nf-settings__row">
          <select
            className="nf-settings__select"
            aria-label="选择模型"
            value={activeModel?.upstream ?? ''}
            disabled={modelBusy || !activeModel}
            onChange={(e) => changeModel(e.target.value)}
          >
            <option value="">自动（flash 档）</option>
            {modelChoices.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="nf-settings__plugin-toggle"
            onClick={loadModels}
            disabled={modelBusy}
          >
            刷新列表
          </button>
        </div>
        {modelMsg ? <p className="nf-settings__export-msg">{modelMsg}</p> : null}
      </div>

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">问题台账同步</span>
        <p className="nf-settings__key-status">
          目录：{problemSync?.folder ?? '未选择（可选 iCloud/Dropbox/OneDrive 同步目录）'}
        </p>
        <p className="nf-settings__key-status">
          口令来源：
          {problemSync?.passphraseSource === 'env'
            ? '环境变量'
            : problemSync?.passphraseSource === 'file'
              ? '凭据文件'
              : '未配置（NEONFORGE_SYNC_PASSPHRASE 或 _FILE）'}
          {problemSync?.lastSyncAt
            ? `；上次同步：${new Date(problemSync.lastSyncAt).toLocaleString()}`
            : ''}
        </p>
        <div className="nf-settings__mcp-actions">
          <button
            type="button"
            className="nf-settings__plugin-toggle"
            onClick={chooseProblemSyncFolder}
            disabled={problemSyncBusy}
          >
            {problemSync?.folder ? '更换目录' : '选择同步目录'}
          </button>
          <button
            type="button"
            className="nf-settings__plugin-toggle"
            onClick={syncProblemsNow}
            disabled={problemSyncBusy || !problemSync?.folder}
          >
            立即同步
          </button>
          {problemSync?.folder ? (
            <button
              type="button"
              className="nf-settings__plugin-toggle"
              onClick={clearProblemSyncFolder}
              disabled={problemSyncBusy}
            >
              关闭同步
            </button>
          ) : null}
        </div>
        {problemSyncMsg ? <p className="nf-settings__export-msg">{problemSyncMsg}</p> : null}
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
          <span>
            自有搜索 Key（可选 Bearer）
            {(webKeySource === 'env' || webKeySource === 'file') && (
              <em>
                当前由{webKeySource === 'env' ? '环境变量' : '凭据文件'}提供（优先于应用内保存）
              </em>
            )}
          </span>
          <input
            type="password"
            className="nf-config__input"
            placeholder={
              webKeySource === 'env'
                ? '已由环境变量提供（应用内保存不覆盖）'
                : webKeySource === 'file'
                  ? '已由凭据文件提供（应用内保存不覆盖）'
                  : '留空则不带 Authorization'
            }
            value={webKey}
            onChange={(e) => {
              setWebKey(e.target.value)
              setWebKeyDirty(true)
            }}
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
            {(keenableKeySource === 'env' || keenableKeySource === 'file') && (
              <em>
                {' '}
                当前由{keenableKeySource === 'env' ? '环境变量' : '凭据文件'}
                提供（优先于应用内保存）
              </em>
            )}
          </span>
          <input
            type="password"
            className="nf-config__input"
            placeholder={
              keenableKeySource === 'env'
                ? '已由环境变量提供（应用内保存不覆盖）'
                : keenableKeySource === 'file'
                  ? '已由凭据文件提供（应用内保存不覆盖）'
                  : 'keen_…'
            }
            value={keenableKey}
            onChange={(e) => {
              setKeenableKey(e.target.value)
              setKeenableKeyDirty(true)
            }}
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
                  {ext.capabilities.length > 0
                    ? ` · 能力：${ext.capabilities
                        .map((c) => `${c.name || c.id}(${c.risk})`)
                        .join('、')}`
                    : ''}
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
          外部工具服务器（MCP）——配置只存命令/参数/环境变量名，不存凭据值；子进程默认只继承安全基础变量，需要额外凭据时用
          envFrom: ["NAME"]（只列名称，值由宿主环境提供）
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
          预算（美元/自然月；未配置价格的用量不参与计算——留空 = 不设置）
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
          计费表（按“接入方:模型”填写每百万 token
          单价，美元；未配置时成本显示为“未设置”，预算不累计）
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

      <div className="nf-settings__plugins">
        <span className="nf-settings__plugins-title">
          权限规则（全局持久化；拒绝优先于允许；匹配前缀留空 = 该工具全部）
        </span>
        {!permLoaded ? (
          <p className="nf-settings__key-status">正在读取已保存规则…</p>
        ) : permRules.length === 0 ? (
          <p className="nf-settings__key-status">暂无规则——未匹配调用仍按授权卡 / 只读预授权处理</p>
        ) : (
          <div className="nf-settings__plugins-list">
            {permRules.map((rule, i) => (
              <span
                key={`${rule.action}:${rule.tool}:${rule.specifier}:${i}`}
                className="nf-settings__plugin"
              >
                {rule.action} · {rule.tool} · {rule.specifier || '（全部）'}
                <button
                  type="button"
                  className="nf-settings__plugin-toggle"
                  aria-label={`删除规则 ${rule.tool}（${rule.specifier || '全部'}）`}
                  disabled={permBusy}
                  onClick={() => removePermissionRule(i)}
                >
                  删除
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="nf-settings__mcp-actions">
          <select
            value={permAction}
            disabled={!permLoaded || permBusy}
            onChange={(e) => setPermAction(e.target.value as 'allow' | 'deny' | 'ask')}
            aria-label="规则动作"
          >
            <option value="allow">允许</option>
            <option value="deny">拒绝</option>
            <option value="ask">每次询问</option>
          </select>
          <input
            className="nf-config__input"
            value={permTool}
            disabled={!permLoaded || permBusy}
            onChange={(e) => setPermTool(e.target.value)}
            placeholder="工具（bash / write / edit）"
            aria-label="规则工具"
          />
          <input
            className="nf-config__input"
            value={permSpec}
            disabled={!permLoaded || permBusy}
            onChange={(e) => setPermSpec(e.target.value)}
            placeholder="匹配前缀（留空 = 全部）"
            aria-label="规则匹配前缀"
          />
          <button type="button" disabled={!permLoaded || permBusy} onClick={addPermissionRule}>
            添加规则
          </button>
        </div>
        {permMsg ? <p className="nf-settings__export-msg">{permMsg}</p> : null}
      </div>

      <div className="nf-settings__row">
        <span>
          信任模式 <em>{TRUST_MODE_OPTIONS.find((o) => o.mode === trustMode)?.hint}</em>
        </span>
        <div className="nf-settings__seg" role="radiogroup" aria-label="信任模式">
          {TRUST_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={trustMode === option.mode}
              className={`nf-settings__seg-btn${trustMode === option.mode ? ' nf-settings__seg-btn--on' : ''}`}
              onClick={() => handleTrustMode(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {(trustMsg ?? trustError) ? (
        <p className="nf-settings__export-msg">{trustMsg ?? trustError}</p>
      ) : null}

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
