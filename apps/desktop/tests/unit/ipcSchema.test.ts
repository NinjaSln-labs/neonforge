import { describe, it, expect } from 'vitest'
import { IPC_SCHEMAS, validateIpc } from '../../src/main/ipcSchema'

describe('IPC 契约校验（P1-04）', () => {
  it('toolsExecute：必填 name + 类型/长度约束', () => {
    expect(validateIpc({ name: 'read', args: { path: 'a.js' } }, IPC_SCHEMAS.toolsExecute)).toEqual({
      ok: true,
    })
    expect(validateIpc({ args: {} }, IPC_SCHEMAS.toolsExecute).ok).toBe(false)
    expect(validateIpc({ name: '' }, IPC_SCHEMAS.toolsExecute).ok).toBe(false)
    expect(validateIpc({ name: 'read', args: 'nope' }, IPC_SCHEMAS.toolsExecute).ok).toBe(false)
    expect(validateIpc({ name: 'read', approved: 1 }, IPC_SCHEMAS.toolsExecute).ok).toBe(false)
  })

  it('streamChat：messages 数组/role 必填；枚举约束', () => {
    expect(
      validateIpc(
        { apiKey: 'k', messages: [{ role: 'user', content: 'hi' }], level: 'basic' },
        IPC_SCHEMAS.streamChat,
      ).ok,
    ).toBe(true)
    expect(validateIpc({ apiKey: 'k', messages: [] }, IPC_SCHEMAS.streamChat).ok).toBe(true)
    expect(validateIpc({ apiKey: 'k', messages: [{ content: 'x' }] }, IPC_SCHEMAS.streamChat).ok).toBe(
      false,
    )
    expect(
      validateIpc(
        { apiKey: 'k', messages: [], level: 'extreme' },
        IPC_SCHEMAS.streamChat,
      ).ok,
    ).toBe(false)
    expect(
      validateIpc(
        { apiKey: 'k', messages: [], progressMode: 'require-action' },
        IPC_SCHEMAS.streamChat,
      ).ok,
    ).toBe(true)
  })

  it('可选字段缺省通过；未知字段不阻断（allowUnknown 默认）', () => {
    expect(validateIpc({ name: 'read', extra: true }, IPC_SCHEMAS.toolsExecute).ok).toBe(true)
  })
})
