// BC-13 扩展与集成：注册表与生命周期（application service；纯状态在 domain/extension.ts）。
// 兼容既有 plugins:* IPC / 设置页：list() 仍返回 {name,version,active}；扩展视图走 listExtensions()。
// 边界：PluginSystem=注册与生命周期；功能本身由各模块（codeRag/lsp/gateway/mcp/git）实现；
// 外部能力不得绕过 BC-02 ToolRegistry 的授权/沙箱。
import {
  activateExtension,
  computeCapabilityDigest,
  createExtension,
  decideInvocation,
  deactivateExtension,
  describeExtension,
  grantTrust,
  markExtensionFailed,
  updateCapabilities,
  type CapabilityDescriptor,
  type ExtensionKind,
  type ExtensionState,
  type InvocationDecision,
  type TrustLevel,
} from '../domain/extension.js'

export interface Plugin {
  name: string
  version: string
  active: boolean
  kind?: ExtensionKind
  trust?: TrustLevel
  capabilities?: CapabilityDescriptor[]
  init?: () => void
  activate?: () => void
  deactivate?: () => void
}

export interface PluginInfo {
  name: string
  version: string
  active: boolean
}

export interface ExtensionInfo extends ExtensionState {
  active: boolean
}

interface Entry {
  plugin: Plugin
  state: ExtensionState
}

export type PluginEventSink = (event: {
  type: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail: Record<string, unknown>
}) => void

let eventSink: PluginEventSink = () => {}
export function setPluginTimelineSink(sink: PluginEventSink): void {
  eventSink = sink
}

function nowIso(): string {
  return new Date().toISOString()
}

function failedState(p: Omit<Plugin, 'active'>, reason: string, at: string): ExtensionState {
  const kind = p.kind ?? 'builtin'
  return {
    id: p.name || 'invalid-extension',
    name: p.name || 'invalid-extension',
    version: p.version || '0.0.0',
    kind,
    status: 'failed',
    trust: p.trust ?? (kind === 'builtin' ? 'builtin' : 'untrusted'),
    capabilities: p.capabilities ?? [],
    capabilityDigest: computeCapabilityDigest(p.capabilities ?? []),
    createdAt: at,
    updatedAt: at,
    failureReason: reason,
  }
}

export class PluginRegistry {
  private plugins = new Map<string, Entry>()

  /**
   * 注册扩展。幂等：已注册且未失败 → 只更新声明/能力，不重跑生命周期钩子。
   * 单个扩展初始化失败被隔离：记录 failed，不抛给调用方（不拖垮应用）。
   */
  register(p: Omit<Plugin, 'active'>): Plugin {
    const at = nowIso()
    const existing = this.plugins.get(p.name)
    if (existing && existing.state.status !== 'failed') {
      const previousDigest = existing.state.capabilityDigest
      const state = updateCapabilities(existing.state, p.capabilities ?? [], at)
      const digestChanged = state.capabilityDigest !== previousDigest
      const plugin: Plugin = {
        ...existing.plugin,
        ...p,
        active: existing.plugin.active,
      }
      this.plugins.set(p.name, { plugin, state })
      if (digestChanged) {
        const oldIds = new Set(existing.state.capabilities.map((c) => c.id))
        const newIds = new Set(state.capabilities.map((c) => c.id))
        eventSink({
          type: 'extension.capabilities_changed',
          role: 'system',
          detail: {
            extensionId: state.id,
            oldDigest: previousDigest,
            newDigest: state.capabilityDigest,
            added: [...newIds].filter((id) => !oldIds.has(id)),
            removed: [...oldIds].filter((id) => !newIds.has(id)),
            ...(state.trust === 'untrusted' ? { reauthorize: true } : {}),
          },
        })
      }
      return plugin
    }

    let state: ExtensionState
    try {
      state = createExtension(
        {
          name: p.name,
          version: p.version,
          kind: p.kind,
          trust: p.trust,
          capabilities: p.capabilities,
        },
        at,
      )
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      const plugin: Plugin = { ...p, active: false }
      const state = failedState(p, reason, at)
      this.plugins.set(p.name, { plugin, state })
      eventSink({
        type: 'extension.registered',
        role: 'system',
        detail: {
          extensionId: state.id,
          kind: state.kind,
          version: state.version,
          failureReason: reason,
        },
      })
      return plugin
    }

    const plugin: Plugin = { ...p, active: false }
    try {
      p.init?.()
      p.activate?.()
      state = activateExtension(state, at)
      plugin.active = true
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      state = markExtensionFailed(state, reason, at)
      plugin.active = false
    }
    this.plugins.set(p.name, { plugin, state })
    eventSink({
      type: 'extension.registered',
      role: 'system',
      detail: {
        extensionId: state.id,
        kind: state.kind,
        version: state.version,
        ...(state.failureReason ? { failureReason: state.failureReason } : {}),
      },
    })
    return plugin
  }

  /** 兼容旧视图：仅 name/version/active（测试与设置页既有契约） */
  list(): PluginInfo[] {
    return [...this.plugins.values()].map(({ plugin, state }) => ({
      name: plugin.name,
      version: plugin.version,
      active: state.status === 'active',
    }))
  }

  /** BC-13 扩展视图：kind/trust/status/capabilities/失败原因 */
  listExtensions(): ExtensionInfo[] {
    return [...this.plugins.values()].map(({ state }) => ({
      ...describeExtension(state),
      active: state.status === 'active',
    }))
  }

  get(name: string): Plugin | null {
    return this.plugins.get(name)?.plugin ?? null
  }

  getExtension(name: string): ExtensionInfo | null {
    const entry = this.plugins.get(name)
    return entry
      ? { ...describeExtension(entry.state), active: entry.state.status === 'active' }
      : null
  }

  /** 激活/停用（幂等；钩子失败 → failed，返回 false；未注册返回 false） */
  setActive(name: string, active: boolean): boolean {
    const entry = this.plugins.get(name)
    if (!entry) return false
    const at = nowIso()
    if (active) {
      if (entry.state.status === 'active') return true
      try {
        entry.state = activateExtension(entry.state, at)
        entry.plugin.activate?.()
        entry.plugin.active = true
        eventSink({
          type: 'extension.activated',
          role: 'system',
          detail: { extensionId: entry.state.id },
        })
        return true
      } catch (e) {
        entry.state = markExtensionFailed(
          entry.state,
          e instanceof Error ? e.message : String(e),
          at,
        )
        entry.plugin.active = false
        return false
      }
    }
    if (entry.state.status === 'inactive' || entry.state.status === 'registered') {
      entry.state = deactivateExtension(entry.state, at)
      entry.plugin.active = false
      return true
    }
    try {
      entry.plugin.deactivate?.()
      entry.state = deactivateExtension(entry.state, at)
      entry.plugin.active = false
      eventSink({
        type: 'extension.deactivated',
        role: 'system',
        detail: { extensionId: entry.state.id },
      })
      return true
    } catch (e) {
      entry.state = markExtensionFailed(entry.state, e instanceof Error ? e.message : String(e), at)
      entry.plugin.active = false
      return false
    }
  }

  /** 用户显式授权第三方扩展（首次调用外部能力前；内置扩展忽略） */
  authorize(name: string): boolean {
    const entry = this.plugins.get(name)
    if (!entry) return false
    entry.state = grantTrust(entry.state, nowIso())
    return true
  }

  /** 移除扩展（MCP 配置删除后回收）；生命周期失败不阻断移除。 */
  unregister(name: string): boolean {
    const entry = this.plugins.get(name)
    if (!entry) return false
    try {
      entry.plugin.deactivate?.()
    } catch {
      /* 停用失败不影响注册表回收 */
    }
    this.plugins.delete(name)
    eventSink({
      type: 'extension.unregistered',
      role: 'system',
      detail: { extensionId: entry.state.id, kind: entry.state.kind },
    })
    return true
  }

  /**
   * 标记扩展失败（连接/刷新失败隔离）。未注册时创建一个 failed 记录，
   * 便于 UI 显示原因且不抛出。
   */
  markFailed(name: string, reason: string, kind: ExtensionKind = 'mcp'): boolean {
    const at = nowIso()
    const entry = this.plugins.get(name)
    if (entry) {
      entry.state = markExtensionFailed(entry.state, reason, at)
      entry.plugin.active = false
      return true
    }
    const state = failedState({ name, version: 'unknown', kind }, reason, at)
    this.plugins.set(name, { plugin: { name, version: 'unknown', kind, active: false }, state })
    return true
  }

  /** 能力调用裁决（BC-02 授权前的领域裁决；未知扩展拒绝） */
  canInvoke(name: string, capabilityId: string): InvocationDecision {
    const entry = this.plugins.get(name)
    if (!entry) {
      eventSink({
        type: 'extension.invocation_denied',
        role: 'system',
        detail: { extensionId: name, capability: capabilityId, reason: '未知扩展' },
      })
      return { allowed: false, requiresApproval: false, reason: `未知扩展：${name}` }
    }
    const decision = decideInvocation(entry.state, capabilityId)
    if (!decision.allowed) {
      eventSink({
        type: 'extension.invocation_denied',
        role: 'system',
        detail: {
          extensionId: entry.state.id,
          capability: capabilityId,
          reason: decision.reason ?? '拒绝',
        },
      })
    }
    return decision
  }
}

export const pluginRegistry = new PluginRegistry()

export const BUILTIN_EXTENSIONS: Array<Omit<Plugin, 'active'>> = [
  {
    name: 'code-rag',
    version: '0.1.0',
    kind: 'builtin',
    capabilities: [
      { id: 'search', name: '代码检索', description: '关键词检索项目代码', risk: 'none' },
    ],
  },
  {
    name: 'mcp-bridge',
    version: '0.1.0',
    kind: 'builtin',
    capabilities: [
      {
        id: 'call',
        name: 'MCP 工具调用',
        description: '调用已配置的 MCP 服务器工具',
        risk: 'high',
      },
    ],
  },
  {
    name: 'git',
    version: '0.1.0',
    kind: 'git',
    trust: 'builtin',
    capabilities: [
      { id: 'status', name: 'git status', description: '工作区状态（只读）', risk: 'none' },
      { id: 'log', name: 'git log', description: '最近提交（只读）', risk: 'none' },
      { id: 'diff', name: 'git diff', description: '工作区差异（只读）', risk: 'none' },
      { id: 'branches', name: 'git branches', description: '分支列表（只读）', risk: 'none' },
    ],
  },
  {
    name: 'stats',
    version: '0.1.0',
    kind: 'builtin',
    capabilities: [
      { id: 'summary', name: '用量统计', description: '会话 token/成本汇总', risk: 'none' },
    ],
  },
  {
    name: 'language-server',
    version: '0.1.0',
    kind: 'builtin',
    capabilities: [
      { id: 'query', name: '语言服务查询', description: '符号/引用/诊断查询', risk: 'none' },
    ],
  },
]

// 兼容旧导出（5 内置）——注册时使用 BUILTIN_EXTENSIONS 以携带能力描述
export const BUILTIN_PLUGINS: Array<{ name: string; version: string }> = BUILTIN_EXTENSIONS.map(
  ({ name, version }) => ({ name, version }),
)

// 注册 5 内置（启动时调用）
export function initPlugins(): void {
  for (const p of BUILTIN_EXTENSIONS) pluginRegistry.register(p)
}
