// BC-13 MCP 管理器：读取用户配置 → 连接 stdio 服务器 → 工具清单映射为扩展能力。
// 失败隔离：单个服务器失败只标记该扩展 failed，不影响其他服务器与应用。
// 安全：调用入口不在此处直接放行——ToolRegistry/IPC 必须先过授权与信任裁决。
import {
  createStdioTransport,
  McpClient,
  type McpServerConfig,
  type McpToolDescriptor,
} from './mcpClient.js'
import { McpConfigStore } from './mcpConfig.js'
import { pluginRegistry, PluginRegistry } from './pluginSystem.js'

export interface McpClientLike {
  initialize: () => Promise<unknown>
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>
  close: () => void
}

export type McpClientFactory = (config: McpServerConfig) => McpClientLike

export interface McpServerStatus {
  name: string
  ok: boolean
  tools: McpToolDescriptor[]
  error?: string
}

export interface McpRefreshResult {
  servers: McpServerStatus[]
  configError?: string
}

export class McpManager {
  private clients = new Map<string, McpClientLike>()
  private statuses: McpServerStatus[] = []
  private refreshPromise: Promise<McpRefreshResult> | null = null

  constructor(
    private readonly configStore: McpConfigStore,
    private readonly registry: PluginRegistry = pluginRegistry,
    private readonly factory: McpClientFactory = (config) =>
      new McpClient(createStdioTransport(config)),
  ) {}

  configPath(): string {
    return this.configStore.path()
  }

  listServers(): McpServerConfig[] {
    return this.configStore.load().servers
  }

  /** 保存用户配置（仅命令/参数/目录；不存凭据值） */
  saveConfig(
    input: unknown,
  ): { ok: true; servers: McpServerConfig[] } | { ok: false; error: string } {
    return this.configStore.save(input)
  }

  /** 拉取所有服务器工具清单并注册为扩展能力（并发保护：同一时刻只跑一次） */
  refresh(): Promise<McpRefreshResult> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async doRefresh(): Promise<McpRefreshResult> {
    this.closeAll()
    const loaded = this.configStore.load()
    if (loaded.error) return { servers: [], configError: loaded.error }
    const servers: McpServerStatus[] = []
    for (const config of loaded.servers) {
      const extName = `mcp:${config.name}`
      let client: McpClientLike | null = null
      try {
        client = this.factory(config)
        await client.initialize()
        const tools = await client.listTools()
        this.registry.register({
          name: extName,
          version: '0.1.0',
          kind: 'mcp',
          capabilities: tools.map((tool) => ({
            id: tool.name,
            name: tool.name,
            description: tool.description ?? '',
            risk: 'high' as const, // 外部进程能力：每次调用都过 BC-02 授权卡
          })),
        })
        this.clients.set(config.name, client)
        servers.push({ name: config.name, ok: true, tools })
      } catch (e) {
        try {
          client?.close()
        } catch {
          /* ignore */
        }
        const reason = e instanceof Error ? e.message : String(e)
        this.registry.markFailed(extName, reason)
        servers.push({ name: config.name, ok: false, tools: [], error: reason })
      }
    }
    this.statuses = servers
    return { servers }
  }

  status(): McpServerStatus[] {
    return this.statuses
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const client = this.clients.get(serverName)
    if (!client) {
      return {
        ok: false,
        error: `MCP 服务器未连接：${serverName}——请先在设置页刷新 MCP 工具`,
      }
    }
    try {
      return await client.callTool(toolName, args ?? {})
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      try {
        client.close()
      } catch {
        /* ignore */
      }
    }
    this.clients.clear()
  }
}
