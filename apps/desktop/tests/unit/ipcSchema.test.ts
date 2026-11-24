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
    expect(validateIpc({ name: 'read', approvalSource: 'auto' }, IPC_SCHEMAS.toolsExecute).ok).toBe(
      true,
    )
    expect(validateIpc({ name: 'read', approvalSource: 'user' }, IPC_SCHEMAS.toolsExecute).ok).toBe(
      true,
    )
    expect(
      validateIpc({ name: 'read', approvalSource: 'delegate' }, IPC_SCHEMAS.toolsExecute).ok,
    ).toBe(true) // ADR-015：委托来源是合法枚举
    expect(validateIpc({ name: 'read', approvalSource: 'bad' }, IPC_SCHEMAS.toolsExecute).ok).toBe(
      false,
    )
  })

  it('trustSet：三档枚举 + mode 必填（ADR-015）', () => {
    for (const mode of ['strict', 'standard', 'delegated']) {
      expect(validateIpc({ mode }, IPC_SCHEMAS.trustSet).ok).toBe(true)
    }
    expect(validateIpc({ mode: 'auto' }, IPC_SCHEMAS.trustSet).ok).toBe(false)
    expect(validateIpc({}, IPC_SCHEMAS.trustSet).ok).toBe(false)
    expect(validateIpc({ mode: 'delegated', extra: 1 }, IPC_SCHEMAS.trustSet).ok).toBe(true)
  })

  it('problemsSave：数组必填且上限 20（ADR-018）', () => {
    const item = (i: number) => ({ id: `p${i}` })
    expect(validateIpc({ problems: [] }, IPC_SCHEMAS.problemsSave).ok).toBe(true)
    expect(
      validateIpc(
        { problems: Array.from({ length: 20 }, (_, i) => item(i)) },
        IPC_SCHEMAS.problemsSave,
      ).ok,
    ).toBe(true)
    expect(
      validateIpc(
        { problems: Array.from({ length: 21 }, (_, i) => item(i)) },
        IPC_SCHEMAS.problemsSave,
      ).ok,
    ).toBe(false)
    expect(validateIpc({ problems: 'nope' }, IPC_SCHEMAS.problemsSave).ok).toBe(false)
    expect(validateIpc({}, IPC_SCHEMAS.problemsSave).ok).toBe(false)
  })

  it('problemsSyncFolder：目录必填，可为 null（关闭同步）', () => {
    expect(validateIpc({ folder: '/tmp/nf-sync' }, IPC_SCHEMAS.problemsSyncFolder).ok).toBe(true)
    expect(validateIpc({ folder: null }, IPC_SCHEMAS.problemsSyncFolder).ok).toBe(true)
    expect(validateIpc({ folder: '' }, IPC_SCHEMAS.problemsSyncFolder).ok).toBe(false)
    expect(validateIpc({}, IPC_SCHEMAS.problemsSyncFolder).ok).toBe(false)
  })

  it('streamChat：messages 数组/role 必填；枚举约束；Key 不再必填（main 读取）', () => {
    expect(
      validateIpc(
        { apiKey: 'k', messages: [{ role: 'user', content: 'hi' }], level: 'basic' },
        IPC_SCHEMAS.streamChat,
      ).ok,
    ).toBe(true)
    expect(validateIpc({ apiKey: 'k', messages: [] }, IPC_SCHEMAS.streamChat).ok).toBe(true)
    // 2026-11-24 审计：renderer 不传 Key 为正常载荷（main 从 configStore 读取）
    expect(validateIpc({ messages: [] }, IPC_SCHEMAS.streamChat).ok).toBe(true)
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

  it('workspace/gateway/log 入口：结构、枚举与可空字段', () => {
    expect(validateIpc({ apiKey: 'k' }, IPC_SCHEMAS.gatewayValidate).ok).toBe(true)
    expect(validateIpc({ apiKey: 'k', modelId: null }, IPC_SCHEMAS.gatewayValidate).ok).toBe(true)
    expect(validateIpc({}, IPC_SCHEMAS.gatewayValidate).ok).toBe(false)
    expect(validateIpc('a.js', IPC_SCHEMAS.workspacePath).ok).toBe(true)
    expect(validateIpc('', IPC_SCHEMAS.workspacePath).ok).toBe(false)
    expect(validateIpc('长'.repeat(1000), IPC_SCHEMAS.workspaceTitle).ok).toBe(true)
    expect(validateIpc('长'.repeat(4001), IPC_SCHEMAS.workspaceTitle).ok).toBe(false)
    expect(validateIpc({ path: 'a.js', title: '标题' }, IPC_SCHEMAS.workspaceUpdateTitle).ok).toBe(
      true,
    )
    expect(validateIpc({ path: 'a.js' }, IPC_SCHEMAS.workspaceUpdateTitle).ok).toBe(false)
    expect(validateIpc(null, IPC_SCHEMAS.notebookRoot).ok).toBe(true)
    expect(validateIpc(undefined, IPC_SCHEMAS.notebookRoot).ok).toBe(false)
    expect(validateIpc({ ts: 't', role: 'user' }, IPC_SCHEMAS.chatLogEntry).ok).toBe(true)
    expect(validateIpc({ ts: 't', role: 'system' }, IPC_SCHEMAS.chatLogEntry).ok).toBe(false)
    expect(validateIpc({ type: 'task.goal_confirmed' }, IPC_SCHEMAS.timelineLogEvent).ok).toBe(true)
    expect(validateIpc({ type: 'x', role: 'bad' }, IPC_SCHEMAS.timelineLogEvent).ok).toBe(false)
    expect(validateIpc({}, IPC_SCHEMAS.timelineQuery).ok).toBe(true)
    expect(validateIpc({ limit: 1.5 }, IPC_SCHEMAS.timelineQuery).ok).toBe(false)
  })

  it('permissionsSet：规则数组结构/枚举/数量边界', () => {
    const rule = { action: 'allow', tool: 'bash', specifier: 'npm run ' }
    expect(validateIpc({ rules: [rule] }, IPC_SCHEMAS.permissionsSet).ok).toBe(true)
    expect(validateIpc({ rules: [{ ...rule, action: 'ok' }] }, IPC_SCHEMAS.permissionsSet).ok).toBe(
      false,
    )
    expect(
      validateIpc(
        { rules: [{ action: 'allow', tool: '', specifier: '' }] },
        IPC_SCHEMAS.permissionsSet,
      ).ok,
    ).toBe(false)
    expect(
      validateIpc({ rules: [{ action: 'allow', tool: 'bash' }] }, IPC_SCHEMAS.permissionsSet).ok,
    ).toBe(false)
    expect(validateIpc({}, IPC_SCHEMAS.permissionsSet).ok).toBe(false)
    expect(
      validateIpc({ rules: Array.from({ length: 201 }, () => rule) }, IPC_SCHEMAS.permissionsSet)
        .ok,
    ).toBe(false)
    expect(
      validateIpc({ rules: Array.from({ length: 200 }, () => rule) }, IPC_SCHEMAS.permissionsSet)
        .ok,
    ).toBe(true)
  })
})
