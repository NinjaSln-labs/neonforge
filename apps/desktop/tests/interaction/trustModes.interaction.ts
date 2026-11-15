// ADR-015（GitHub #12）：三档信任模式（strict/standard/delegated）
// 场景：
//   1. 设置页切换三档 → main trust:set 持久化；旧 localStorage 布尔迁移并删除
//   2. delegated：方案确认后清单内 edit 自动放行（approvalSource=delegate），不弹授权卡
//   3. strict：方案确认后清单内 write 不自动放行（仍弹授权卡——谨慎档语义）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { enterWorkspace, sendChat, startFromScratch } from './scenarios'

test('ADR-015：设置页切换三档信任模式 → main 持久化 + 旧开关迁移', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'open',
    capture: { trustSetCalls: true },
  })
  await enterWorkspace(page)
  await page.keyboard.press('Meta+,')
  await expect(page.locator('.nf-settings')).toBeVisible()
  const strict = page.getByRole('radio', { name: '谨慎' })
  const standard = page.getByRole('radio', { name: '标准' })
  const delegated = page.getByRole('radio', { name: '低危委托' })
  await expect(standard).toHaveAttribute('aria-checked', 'true')
  await delegated.click()
  await expect(delegated).toHaveAttribute('aria-checked', 'true')
  await expect(standard).toHaveAttribute('aria-checked', 'false')
  // main 持久化调用（迁移可能先写一次 standard；最终值为 delegated）
  await expect.poll(async () => (await h.trustSetCalls()).at(-1)).toBe('delegated')
  await strict.click()
  await expect.poll(async () => (await h.trustSetCalls()).at(-1)).toBe('strict')
  await page.keyboard.press('Meta+,')
  await page.keyboard.press('Meta+,')
  await expect(strict).toHaveAttribute('aria-checked', 'true')
  // 旧 localStorage 开关已迁移删除（不再有第二持久化副本）
  const legacy = await page.evaluate(() => ({
    marker: localStorage.getItem('nf-trust-v2'),
    old: localStorage.getItem('nf-delegate-lowrisk'),
  }))
  expect(legacy.marker).toBe('1')
  expect(legacy.old).toBeNull()
})

test('ADR-015：delegated——清单内 edit 自动放行（来源 delegate）', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    trustMode: 'delegated',
    capture: { approvalSources: true },
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
  await h.emit([toolCall.edit('/test/app.ts', 'old', 'new'), chunk.done()])
  await expect(page.locator('.nf-toolcall--done').last()).toBeVisible({ timeout: 10000 })
  // 不弹授权卡；工具以 delegate 来源自动批准
  await expect(page.locator('.nf-toolcall__hint')).toHaveCount(0)
  await expect.poll(async () => (await h.approvalSources()).at(-1)).toBe('delegate')
})

test('ADR-015：strict——方案确认后清单内 write 仍需授权（谨慎档不自动放行）', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    trustMode: 'strict',
    capture: { approvalSources: true },
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
  await h.emit([toolCall.write('/test/app.ts', 'x'), chunk.done()])
  await expect(page.locator('.nf-toolcall__hint')).toContainText('需要授权', { timeout: 10000 })
})
