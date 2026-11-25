// ADR-016（GitHub #16）：机制拒绝事件 gate.denied
// 场景：授权卡拒绝 bash → 拒绝记忆短封 → 模型重试同命令 → 不弹卡、不执行、时间线出现结构化拒绝。
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { startFromScratch, sendChat } from './scenarios'

test('ADR-016：拒绝记忆重试 → gate.denied（结构化来源/属性/风险）', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    approval: 'all',
    extraInit: `
      window.__nfGateDenied = [];
      window.__nfApprovalEvents = [];
      bridge.timeline = { log: async (e) => {
        if (e && e.type === 'gate.denied') window.__nfGateDenied.push(e);
        if (e && ['tool.rejected', 'card.rejected'].includes(e.type)) window.__nfApprovalEvents.push(e);
      } };
    `,
  })
  await startFromScratch(page)
  await sendChat(page, '做个待办应用')
  await h.emit([chunk.tool('propose_goal', { statement: '做一个待办应用' }), chunk.done()])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(
    page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: '搭档处理中' }),
  ).toBeVisible({ timeout: 5000 })
  await h.emit([
    chunk.tool('propose_plan', {
      summary: '单页方案',
      files: [{ path: '/test/app.ts', reason: '入口' }],
    }),
    chunk.done(),
  ])
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  await page.waitForTimeout(300)

  const command = 'rm -rf /tmp/nf-gate-denied'
  await h.emit([toolCall.bash(command), chunk.done()])
  await expect(page.locator('.nf-toolcall__hint')).toContainText('需要授权', { timeout: 10000 })
  // 首次是授权请求（ask）——不得误记机制拒绝
  const before = (await h.readCapture<unknown[]>('__nfGateDenied')) ?? []
  expect(before).toHaveLength(0)

  await page.locator('.nf-toolcall__reject').last().click()
  await sendChat(page, '继续')
  await h.emit([toolCall.bash(command), chunk.done()])

  // 重试被拒绝记忆短封：不执行、不再弹授权卡
  await expect(page.locator('.nf-toolcall--done').last()).toContainText('未执行', {
    timeout: 10000,
  })
  await expect(page.getByRole('button', { name: '拒绝' })).toHaveCount(0)

  await expect
    .poll(async () => ((await h.readCapture<unknown[]>('__nfGateDenied')) ?? []).length)
    .toBe(1)
  const events =
    (await h.readCapture<
      Array<{
        type: string
        detail: {
          name: string
          gate: string
          reason: string
          attribute: { kind: string; basis: string }
          risk: string
        }
      }>
    >('__nfGateDenied')) ?? []
  expect(events[0]?.detail).toMatchObject({
    name: 'bash',
    gate: 'rejection-memory',
    attribute: { kind: 'hazardous', basis: 'command-chain' },
    risk: 'high',
  })
  expect(events[0]?.detail.reason).toContain('拒绝记忆')

  // 2026-11-25 事件语义补课：授权拒绝载荷——tool.rejected（name/args）、card.rejected
  // （card/action/reason——reason 来自默认 direction，调用方未传选择器结果时的旧语义）
  const approvalEvts =
    (await h.readCapture<Array<{ type: string; detail?: Record<string, unknown> }>>(
      '__nfApprovalEvents',
    )) ?? []
  const rejected = approvalEvts.find((e) => e.type === 'tool.rejected')
  expect(rejected?.detail?.name).toBe('bash')
  expect(rejected?.detail?.args).toMatchObject({ command })
  const cardRejected = approvalEvts.find((e) => e.type === 'card.rejected')
  expect(cardRejected?.detail).toEqual({
    card: 'approval',
    action: 'reject',
    name: 'bash',
    reason: 'direction',
  })
})
