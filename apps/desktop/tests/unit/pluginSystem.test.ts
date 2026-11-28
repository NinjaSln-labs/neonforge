import { describe, it, expect } from 'vitest'
import { PluginRegistry, BUILTIN_PLUGINS, setPluginTimelineSink } from '../../src/main/pluginSystem'

describe('PluginRegistry（ticket 08——内置插件注册与生命周期钩子）', () => {
  it('register：init/activate 钩子触发 + active=true', () => {
    const r = new PluginRegistry()
    let initCalled = 0
    let actCalled = 0
    r.register({ name: 'x', version: '1', init: () => initCalled++, activate: () => actCalled++ })
    expect(initCalled).toBe(1)
    expect(actCalled).toBe(1)
    expect(r.list()[0]).toEqual({ name: 'x', version: '1', active: true })
  })

  it('list：返回所有插件信息（name/version/active）', () => {
    const r = new PluginRegistry()
    r.register({ name: 'a', version: '0.1' })
    r.register({ name: 'b', version: '0.2' })
    expect(r.list()).toHaveLength(2)
    expect(r.list().map((p) => p.name)).toEqual(['a', 'b'])
  })

  it('setActive：停用 → deactivate 钩子 + active=false；启用 → activate + true', () => {
    const r = new PluginRegistry()
    let deact = 0
    let act = 0
    r.register({ name: 'x', version: '1', activate: () => act++, deactivate: () => deact++ })
    expect(r.setActive('x', false)).toBe(true)
    expect(deact).toBe(1)
    expect(r.list()[0].active).toBe(false)
    expect(r.setActive('x', true)).toBe(true)
    expect(act).toBe(2)
    expect(r.list()[0].active).toBe(true)
  })

  it('setActive：未注册插件 → false', () => {
    const r = new PluginRegistry()
    expect(r.setActive('nope', true)).toBe(false)
  })

  it('BUILTIN_PLUGINS：5 内置全注册激活', () => {
    expect(BUILTIN_PLUGINS).toHaveLength(5)
    const r = new PluginRegistry()
    for (const p of BUILTIN_PLUGINS) r.register(p)
    expect(r.list()).toHaveLength(5)
    expect(r.list().every((p) => p.active)).toBe(true)
    expect(BUILTIN_PLUGINS.map((p) => p.name)).toContain('code-rag')
    expect(BUILTIN_PLUGINS.map((p) => p.name)).toContain('language-server')
  })

  it('ADR-017：extension.registered 载荷包含 capabilityDigest（授权范围可审计）', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = []
    setPluginTimelineSink((event) => events.push(event))
    const r = new PluginRegistry()
    r.register({
      name: 'ext',
      version: '1',
      capabilities: [
        { id: 'read_file', name: '读取文件', description: '只读项目文件', risk: 'none' },
      ],
    })
    setPluginTimelineSink(() => {})
    const registered = events.find((e) => e.type === 'extension.registered')
    expect(registered?.detail.capabilityDigest).toBe('read_file:none')
  })

  // 2026-11-25 事件语义补课：扩展生命周期事件载荷（激活/停用/能力变更 diff/回收/调用拒绝）
  it('生命周期事件载荷：激活/停用/能力变更/回收/调用拒绝（扩展 id + 能力/原因）', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = []
    setPluginTimelineSink((event) => events.push(event))
    const r = new PluginRegistry()
    r.register({
      name: 'ext',
      version: '1',
      trust: 'user-authorized',
      capabilities: [{ id: 'read_file', name: '读取文件', description: '', risk: 'none' }],
    })
    r.setActive('ext', false)
    r.setActive('ext', true)
    // 能力变更：声明新增 write_file → capabilities_changed（oldDigest/newDigest/added/removed）
    r.register({
      name: 'ext',
      version: '1',
      trust: 'user-authorized',
      capabilities: [
        { id: 'read_file', name: '读取文件', description: '', risk: 'none' },
        { id: 'write_file', name: '写文件', description: '', risk: 'high' },
      ],
    })
    // 调用拒绝：能力不存在
    const denied = r.canInvoke('ext', 'delete_file')
    expect(denied.allowed).toBe(false)
    r.unregister('ext')
    setPluginTimelineSink(() => {})

    const evt = (type: string, nth = 0): Record<string, unknown> | undefined =>
      events.filter((e) => e.type === type)[nth]?.detail
    expect(evt('extension.deactivated')).toEqual({ extensionId: 'ext' })
    expect(evt('extension.activated')).toEqual({ extensionId: 'ext' })
    expect(evt('extension.capabilities_changed')).toMatchObject({
      extensionId: 'ext',
      oldDigest: 'read_file:none',
      added: ['write_file'],
      removed: [],
    })
    expect(evt('extension.capabilities_changed')?.newDigest).toBe('read_file:none|write_file:high')
    expect(evt('extension.invocation_denied')).toEqual({
      extensionId: 'ext',
      capability: 'delete_file',
      reason: '扩展能力不存在：ext/delete_file',
    })
    expect(evt('extension.unregistered')).toEqual({ extensionId: 'ext', kind: 'builtin' })
  })
})
