// PluginRegistry（ticket 08 / A0 §2）：内置插件注册与生命周期——V1 无插件市场，仅注册与钩子
// 边界：PluginSystem=注册/生命周期；功能本身由各模块（codeRag/lsp/gateway 等）实现
export interface Plugin {
  name: string
  version: string
  active: boolean
  init?: () => void
  activate?: () => void
  deactivate?: () => void
}

export interface PluginInfo {
  name: string
  version: string
  active: boolean
}

// 5 内置插件（A0 §2 + 05 模块树——功能由对应模块承载，此处仅注册声明）
export const BUILTIN_PLUGINS: Array<{ name: string; version: string }> = [
  { name: 'code-rag', version: '0.1.0' }, // Layer2 关键词检索（codeRag.ts）
  { name: 'mcp-bridge', version: '0.1.0' }, // 外部工具桥（V1 占位）
  { name: 'git', version: '0.1.0' }, // git 集成（V1 占位）
  { name: 'stats', version: '0.1.0' }, // 用量统计（V1 占位）
  { name: 'language-server', version: '0.1.0' } // LSP 连接（lsp.ts）
]

export class PluginRegistry {
  private plugins = new Map<string, Plugin>()

  register(p: Omit<Plugin, 'active'>): Plugin {
    const plugin: Plugin = { ...p, active: false }
    plugin.init?.()
    plugin.active = true
    plugin.activate?.()
    this.plugins.set(plugin.name, plugin)
    return plugin
  }

  list(): PluginInfo[] {
    return [...this.plugins.values()].map(({ name, version, active }) => ({ name, version, active }))
  }

  get(name: string): Plugin | null {
    return this.plugins.get(name) ?? null
  }

  // 激活/停用（生命周期钩子；未注册返回 false）
  setActive(name: string, active: boolean): boolean {
    const p = this.plugins.get(name)
    if (!p) return false
    if (active && !p.active) { p.active = true; p.activate?.() }
    if (!active && p.active) { p.active = false; p.deactivate?.() }
    return true
  }
}

export const pluginRegistry = new PluginRegistry()

// 注册 5 内置（启动时调用）
export function initPlugins(): void {
  for (const p of BUILTIN_PLUGINS) pluginRegistry.register(p)
}
