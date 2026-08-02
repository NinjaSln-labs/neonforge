import { describe, it, expect } from 'vitest'
import { PluginRegistry, BUILTIN_PLUGINS } from '../../src/main/pluginSystem'

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
})
