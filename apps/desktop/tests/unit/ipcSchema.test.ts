import { describe, it, expect } from 'vitest'
import { IPC_SCHEMAS, validateIpc } from '../../src/main/ipcSchema'

describe('IPC 契约校验（P1-04）', () => {
  it('toolsExecute：必填 name + 类型/长度约束', () => {
    expect(validateIpc({ name: 'read', args: { path: 'a.js' } }, IPC_SCHEMAS.toolsExecute)).toEqual(
      {
        ok: true,
      },
    )
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
    expect(
      validateIpc({ apiKey: 'k', messages: [{ content: 'x' }] }, IPC_SCHEMAS.streamChat).ok,
    ).toBe(false)
    expect(
      validateIpc({ apiKey: 'k', messages: [], level: 'extreme' }, IPC_SCHEMAS.streamChat).ok,
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

  it('必填字段值为 undefined 视为缺失（不能靠 key in value 混过）', () => {
    expect(validateIpc({ name: undefined }, IPC_SCHEMAS.toolsExecute).ok).toBe(false)
  })

  it('可空字符串：nullable 允许 null，非 nullable 拒绝 null', () => {
    expect(
      validateIpc({ enabled: true, searchUrl: null, searchKey: null }, IPC_SCHEMAS.webAccessPatch)
        .ok,
    ).toBe(true)
    expect(validateIpc({ path: null }, IPC_SCHEMAS.toolsRevert).ok).toBe(false)
  })

  it('webAccessPatch：结构/类型/长度约束', () => {
    expect(validateIpc({ enabled: true, probe: true }, IPC_SCHEMAS.webAccessPatch).ok).toBe(true)
    expect(validateIpc({ enabled: 'yes' }, IPC_SCHEMAS.webAccessPatch).ok).toBe(false)
    expect(
      validateIpc({ searchUrl: 'https://x.test/s', searchKey: 'k' }, IPC_SCHEMAS.webAccessPatch).ok,
    ).toBe(true)
    expect(validateIpc({ searchUrl: 42 }, IPC_SCHEMAS.webAccessPatch).ok).toBe(false)
  })

  it('sessionId：空串/非字符串拒绝', () => {
    expect(validateIpc('session-1', IPC_SCHEMAS.sessionId).ok).toBe(true)
    expect(validateIpc('', IPC_SCHEMAS.sessionId).ok).toBe(false)
    expect(validateIpc({ id: 'x' }, IPC_SCHEMAS.sessionId).ok).toBe(false)
  })

  it('queue 命令：entryId/title/reason 必填；reorder position 整数', () => {
    expect(validateIpc({ sessionId: 's', title: 't' }, IPC_SCHEMAS.queueEnqueue).ok).toBe(true)
    expect(validateIpc({ sessionId: 's' }, IPC_SCHEMAS.queueEnqueue).ok).toBe(false)
    expect(validateIpc({ sessionId: 's', title: '' }, IPC_SCHEMAS.queueEnqueue).ok).toBe(false)
    expect(validateIpc({ sessionId: 's', entryId: 'e' }, IPC_SCHEMAS.queueEntry).ok).toBe(true)
    expect(validateIpc({ sessionId: 's' }, IPC_SCHEMAS.queueEntry).ok).toBe(false)
    expect(
      validateIpc(
        { sessionId: 's', entryId: 'e', reason: '等待授权' },
        IPC_SCHEMAS.queueEntryReason,
      ).ok,
    ).toBe(true)
    expect(
      validateIpc({ sessionId: 's', entryId: 'e', reason: '' }, IPC_SCHEMAS.queueEntryReason).ok,
    ).toBe(false)
    expect(
      validateIpc({ sessionId: 's', entryId: 'e', position: 1.5 }, IPC_SCHEMAS.queueReorder).ok,
    ).toBe(false)
    expect(
      validateIpc({ sessionId: 's', entryId: 'e', position: 2 }, IPC_SCHEMAS.queueReorder).ok,
    ).toBe(true)
  })

  it('acceptance：状态枚举与豁免原因必填', () => {
    expect(
      validateIpc({ sessionId: 's', itemId: 'i', status: 'passed' }, IPC_SCHEMAS.acceptanceMark).ok,
    ).toBe(true)
    expect(
      validateIpc({ sessionId: 's', itemId: 'i', status: 'ok' }, IPC_SCHEMAS.acceptanceMark).ok,
    ).toBe(false)
    expect(
      validateIpc({ sessionId: 's', itemId: 'i', reason: 'x' }, IPC_SCHEMAS.acceptanceWaive).ok,
    ).toBe(true)
    expect(validateIpc({ sessionId: 's', itemId: 'i' }, IPC_SCHEMAS.acceptanceWaive).ok).toBe(false)
  })

  it('completionVerify：命令数组元素必须是非空字符串', () => {
    expect(validateIpc({ commands: ['ls'] }, IPC_SCHEMAS.completionVerify).ok).toBe(true)
    expect(validateIpc({ commands: [''] }, IPC_SCHEMAS.completionVerify).ok).toBe(false)
    expect(validateIpc({ commands: 'ls' }, IPC_SCHEMAS.completionVerify).ok).toBe(false)
  })

  it('fileList：只接受字符串数组', () => {
    expect(validateIpc(['a.js', 'b.js'], IPC_SCHEMAS.fileList).ok).toBe(true)
    expect(validateIpc([1], IPC_SCHEMAS.fileList).ok).toBe(false)
    expect(validateIpc('a.js', IPC_SCHEMAS.fileList).ok).toBe(false)
  })
})
