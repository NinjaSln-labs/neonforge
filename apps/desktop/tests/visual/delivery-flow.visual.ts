import { test, expect } from '@playwright/test'

// ticket 07：0-1 交付流视觉基线——mock deliveryFlow → 阶段机 + 模型选择 + 分步推进
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: { deliveryFlow: true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('0-1 交付流（阶段机 + 模型选择）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-flow')).toBeVisible()
  await expect(page.locator('.nf-flow__stage')).toHaveCount(6)
  await expect(page.locator('.nf-flow__stage--active')).toContainText('需求')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-init.png')
})

test('选敏捷 → 分步推进到交付', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /敏捷开发/ }).click()
  await expect(page.locator('.nf-flow')).toContainText('模型：敏捷（迭代）')
  // 推进 6 步到交付完成
  for (let i = 0; i < 6; i++) {
    const btn = page.locator('.nf-flow__advance button')
    if (await btn.count()) { await btn.click() }
  }
  await expect(page.locator('.nf-flow')).toContainText('交付完成')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-done.png')
})
