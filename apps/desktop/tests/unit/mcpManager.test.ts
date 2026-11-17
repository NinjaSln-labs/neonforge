import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { McpConfigStore } from '../../src/main/mcpConfig'
import { McpManager, type McpClientFactory, type McpClientLike } from '../../src/main/mcpManager'
import { PluginRegistry, setPluginTimelineSink } from '../../src/main/pluginSystem'

class FakeClient implements McpClientLike {
  initialized = false
  closed = false
  calls: Array<{ tool: string; args: unknown }> = []
  constructor(
    readonly tools: Array<{ name: string; description?: string }>,
    private readonly failOnInit = false,
  ) {}
  async initialize(): Promise<unknown> {
    if (this.failOnInit) throw new Error('初始化失败')
    this.initialized = true
    return {}
  }
  async listTools() {
    return this.tools
  }
  async callTool(name: string, args: Record<string, unknown>) {
    this.calls.push({ tool: name, args })
    return { ok: true, data: { echoed: name } }
  }
  close(): void {
    this.closed = true
  }
}

let dir = ''
let registry: PluginRegistry
let manager: McpManager
let clients: FakeClient[]
let store: McpConfigStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-mcp-mgr-'))
  store = new McpConfigStore(path.join(dir, 'mcp-servers.json'))
  store.save([
    { name: 'fs', command: 'fake-server' },
    { name: 'broken', command: 'fake-broken' },
  ])
  registry = new PluginRegistry()
  clients = []
  const factory: McpClientFactory = (config) => {
    const client =
      config.name === 'broken'
        ? new FakeClient([], true)
        : new FakeClient([{ name: 'read_file', description: '读文件' }])
    clients.push(client)
    return client
  }
  manager = new McpManager(store, registry, factory)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('McpManager（BC-13 集成编排）', () => {
  it('refresh：成功服务器注册扩展能力；第三方默认未授权', async () => {
    const result = await manager.refresh()
    expect(result.servers.map((s) => s.name)).toEqual(['fs', 'broken'])
    const fsStatus = result.servers.find((s) => s.name === 'fs')
    expect(fsStatus?.ok).toBe(true)
    expect(fsStatus?.tools).toHaveLength(1)
    const ext = registry.getExtension('mcp:fs')
    expect(ext?.kind).toBe('mcp')
    expect(ext?.status).toBe('active')
    expect(ext?.trust).toBe('untrusted')
    expect(ext?.capabilities.map((c) => c.id)).toEqual(['read_file'])
    expect(ext?.capabilities[0].risk).toBe('high')
  })

  it('失败隔离：一个服务器失败 → 标记 failed，另一服务器仍可用', async () => {
    const result = await manager.refresh()
    const broken = result.servers.find((s) => s.name === 'broken')
    expect(broken?.ok).toBe(false)
    expect(broken?.error).toMatch(/初始化失败/)
    expect(registry.getExtension('mcp:broken')?.status).toBe('failed')
    expect(registry.getExtension('mcp:fs')?.status).toBe('active')
  })

  it('callTool：路由到对应客户端；未连接返回错误', async () => {
    await manager.refresh()
    const result = await manager.callTool('fs', 'read_file', { path: 'a.txt' })
    expect(result).toMatchObject({ ok: true })
    const fsClient = clients.find((c) => c.calls.length > 0)
    expect(fsClient?.calls[0]).toEqual({ tool: 'read_file', args: { path: 'a.txt' } })
    expect(await manager.callTool('nope', 'x', {})).toMatchObject({ ok: false })
  })

  // ADR-017：配置删除服务器 → 扩展回收（不残留可调用能力）
  it('刷新回收：移除配置的服务器扩展被 unregister 并记录事件', async () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = []
    setPluginTimelineSink((e) => events.push(e))
    try {
      await manager.refresh()
      expect(registry.getExtension('mcp:broken')).not.toBeNull()
      store.save([{ name: 'fs', command: 'fake-server' }])
      const result = await manager.refresh()
      expect(result.servers.map((s) => s.name)).toEqual(['fs'])
      expect(registry.getExtension('mcp:broken')).toBeNull()
      expect(events.some((e) => e.type === 'extension.unregistered')).toBe(true)
    } finally {
      setPluginTimelineSink(() => {})
    }
  })

  it('配置错误：不启动任何服务器并返回原因', async () => {
    const badPath = path.join(dir, 'bad.json')
    writeFileSync(badPath, '{invalid', { mode: 0o600 })
    const badStore = new McpConfigStore(badPath)
    const badManager = new McpManager(badStore, registry, () => new FakeClient([]))
    const result = await badManager.refresh()
    expect(result.servers).toEqual([])
    expect(result.configError).toMatch(/读取失败/)
  })
})
