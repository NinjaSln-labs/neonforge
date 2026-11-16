import { describe, it, expect } from 'vitest'
import {
  activateExtension,
  createExtension,
  decideInvocation,
  deactivateExtension,
  grantTrust,
  markExtensionFailed,
  updateCapabilities,
} from '../../src/domain/extension'

const AT = '2026-11-14T00:00:00.000Z'

describe('Extension（A16 领域状态机）', () => {
  it('create：内置默认信任；第三方默认未授权；能力校验', () => {
    const builtin = createExtension({ name: 'git', version: '1.0' }, AT)
    expect(builtin.kind).toBe('builtin')
    expect(builtin.trust).toBe('builtin')
    expect(builtin.status).toBe('registered')
    const third = createExtension({ name: 'mcp:x', version: '1.0', kind: 'mcp' }, AT)
    expect(third.trust).toBe('untrusted')
    expect(() =>
      createExtension(
        {
          name: 'bad',
          version: '1',
          capabilities: [
            { id: 'dup', name: 'a', description: '', risk: 'none' },
            { id: 'dup', name: 'b', description: '', risk: 'none' },
          ],
        },
        AT,
      ),
    ).toThrow(/重复/)
  })

  it('激活/停用幂等；失败不可直接激活，需重新注册', () => {
    const state = createExtension({ name: 'x', version: '1' }, AT)
    const active = activateExtension(state, AT)
    expect(active.status).toBe('active')
    expect(activateExtension(active, AT)).toBe(active) // 幂等返回同一对象
    expect(deactivateExtension(active, AT).status).toBe('inactive')
    expect(deactivateExtension(deactivateExtension(active, AT), AT).status).toBe('inactive')
    const failed = markExtensionFailed(state, 'boom', AT)
    expect(failed.status).toBe('failed')
    expect(failed.failureReason).toBe('boom')
    expect(() => activateExtension(failed, AT)).toThrow(/失败/)
  })

  it('decideInvocation：未激活/未知能力/未授权第三方/风险分级', () => {
    expect(decideInvocation(createExtension({ name: 'x', version: '1' }, AT), 'a').allowed).toBe(
      false,
    )
    const third = activateExtension(
      createExtension(
        {
          name: 'mcp:x',
          version: '1',
          kind: 'mcp',
          capabilities: [{ id: 'call', name: 'call', description: '', risk: 'high' }],
        },
        AT,
      ),
      AT,
    )
    const decision = decideInvocation(third, 'call')
    expect(decision.allowed).toBe(false)
    expect(decision.requiresApproval).toBe(true)
    expect(decideInvocation(third, 'nope').reason).toMatch(/不存在/)
    const authorized = grantTrust(third, AT)
    expect(authorized.trust).toBe('user-authorized')
    expect(decideInvocation(authorized, 'call')).toEqual({
      allowed: true,
      requiresApproval: true,
    })
  })

  it('内置只读能力免授权；低/高风险由 BC-02 授权', () => {
    const builtin = activateExtension(
      createExtension(
        {
          name: 'git',
          version: '1',
          kind: 'git',
          trust: 'builtin',
          capabilities: [
            { id: 'status', name: 'status', description: '', risk: 'none' },
            { id: 'write', name: 'write', description: '', risk: 'high' },
          ],
        },
        AT,
      ),
      AT,
    )
    expect(decideInvocation(builtin, 'status')).toEqual({
      allowed: true,
      requiresApproval: false,
    })
    expect(decideInvocation(builtin, 'write')).toEqual({
      allowed: true,
      requiresApproval: true,
    })
  })

  it('grantTrust：内置保持 builtin；updateCapabilities 更新声明', () => {
    const builtin = createExtension(
      { name: 'git', version: '1', kind: 'git', trust: 'builtin' },
      AT,
    )
    expect(grantTrust(builtin, AT)).toBe(builtin)
    const updated = updateCapabilities(
      builtin,
      [{ id: 'log', name: 'log', description: '', risk: 'none' }],
      AT,
    )
    expect(updated.capabilities.map((c) => c.id)).toEqual(['log'])
  })
})
