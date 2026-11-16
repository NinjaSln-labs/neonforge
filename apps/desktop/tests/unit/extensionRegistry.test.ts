import { describe, it, expect } from 'vitest'
import {
  PluginRegistry,
  BUILTIN_EXTENSIONS,
  setPluginTimelineSink,
} from '../../src/main/pluginSystem'

describe('PluginRegistry（BC-13 扩展注册/生命周期/信任）', () => {
  it('内置扩展：只读能力可直接调用，高风险能力需授权', () => {
    const r = new PluginRegistry()
    for (const ext of BUILTIN_EXTENSIONS) r.register(ext)
    const git = r.getExtension('git')
    expect(git?.kind).toBe('git')
    expect(git?.status).toBe('active')
    expect(r.canInvoke('git', 'status')).toEqual({ allowed: true, requiresApproval: false })
    expect(r.canInvoke('mcp-bridge', 'call')).toEqual({ allowed: true, requiresApproval: true })
    expect(r.canInvoke('nope', 'x')).toMatchObject({ allowed: false })
  })

  it('第三方扩展：未授权拒绝 → authorize 后按风险授权', () => {
    const r = new PluginRegistry()
    r.register({
      name: 'mcp:fs',
      version: '1.0',
      kind: 'mcp',
      capabilities: [{ id: 'read_file', name: 'read', description: '', risk: 'high' }],
    })
    expect(r.canInvoke('mcp:fs', 'read_file')).toMatchObject({
      allowed: false,
      requiresApproval: true,
    })
    expect(r.authorize('mcp:fs')).toBe(true)
    expect(r.canInvoke('mcp:fs', 'read_file')).toEqual({
      allowed: true,
      requiresApproval: true,
    })
    expect(r.getExtension('mcp:fs')?.authorizedAt).toBeTruthy()
  })

  it('生命周期钩子失败隔离：记录 failed，不影响其他扩展', () => {
    const r = new PluginRegistry()
    r.register({
      name: 'boom',
      version: '1',
      init: () => {
        throw new Error('init failed')
      },
    })
    r.register({ name: 'ok', version: '1' })
    expect(r.getExtension('boom')?.status).toBe('failed')
    expect(r.getExtension('boom')?.failureReason).toBe('init failed')
    expect(r.getExtension('ok')?.status).toBe('active')
    expect(r.list().map((p) => p.name)).toEqual(['boom', 'ok'])
  })

  it('幂等注册：不重跑 init/activate；能力可更新', () => {
    const r = new PluginRegistry()
    let init = 0
    let activate = 0
    r.register({ name: 'x', version: '1', init: () => init++, activate: () => activate++ })
    r.register({
      name: 'x',
      version: '1',
      init: () => init++,
      activate: () => activate++,
      capabilities: [{ id: 'a', name: 'a', description: '', risk: 'none' }],
    })
    expect(init).toBe(1)
    expect(activate).toBe(1)
    expect(r.canInvoke('x', 'a').allowed).toBe(true)
  })

  it('setActive：停用后能力不可调用；重新激活恢复', () => {
    const r = new PluginRegistry()
    r.register({
      name: 'g',
      version: '1',
      capabilities: [{ id: 'status', name: 'status', description: '', risk: 'none' }],
    })
    expect(r.setActive('g', false)).toBe(true)
    expect(r.canInvoke('g', 'status')).toMatchObject({ allowed: false, reason: /未激活/ })
    expect(r.setActive('g', true)).toBe(true)
    expect(r.canInvoke('g', 'status').allowed).toBe(true)
  })

  // ADR-017：重复注册能力集合变化 → 已授权范围重审，新增能力不自动可用
  it('能力变化：user-authorized 回退 untrusted 并发 capabilities_changed 事件', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = []
    setPluginTimelineSink((e) => events.push(e))
    try {
      const r = new PluginRegistry()
      r.register({
        name: 'mcp:fs',
        version: '1.0',
        kind: 'mcp',
        capabilities: [{ id: 'read_file', name: 'read', description: '', risk: 'high' }],
      })
      r.authorize('mcp:fs')
      expect(r.canInvoke('mcp:fs', 'read_file')).toMatchObject({ allowed: true })
      r.register({
        name: 'mcp:fs',
        version: '1.0',
        kind: 'mcp',
        capabilities: [
          { id: 'read_file', name: 'read', description: '', risk: 'high' },
          { id: 'write_file', name: 'write', description: '', risk: 'high' },
        ],
      })
      const ext = r.getExtension('mcp:fs')
      expect(ext?.trust).toBe('untrusted')
      expect(r.canInvoke('mcp:fs', 'write_file')).toMatchObject({
        allowed: false,
        requiresApproval: true,
      })
      const event = events.find((e) => e.type === 'extension.capabilities_changed')
      expect(event?.detail).toMatchObject({ extensionId: 'mcp:fs', added: ['write_file'] })
      // 同能力集合重注册保留用户授权
      r.authorize('mcp:fs')
      r.register({
        name: 'mcp:fs',
        version: '1.0',
        kind: 'mcp',
        capabilities: [
          { id: 'read_file', name: 'read', description: '', risk: 'high' },
          { id: 'write_file', name: 'write', description: '', risk: 'high' },
        ],
      })
      expect(r.getExtension('mcp:fs')?.trust).toBe('user-authorized')
    } finally {
      setPluginTimelineSink(() => {})
    }
  })

  it('unregister：移除注册表并发 extension.unregistered', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = []
    setPluginTimelineSink((e) => events.push(e))
    try {
      const r = new PluginRegistry()
      r.register({ name: 'mcp:gone', version: '1', kind: 'mcp' })
      expect(r.unregister('mcp:gone')).toBe(true)
      expect(r.getExtension('mcp:gone')).toBeNull()
      expect(r.unregister('mcp:gone')).toBe(false)
      expect(events.some((e) => e.type === 'extension.unregistered')).toBe(true)
    } finally {
      setPluginTimelineSink(() => {})
    }
  })
})
