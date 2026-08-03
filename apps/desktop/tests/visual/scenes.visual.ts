import { test, expect } from '@playwright/test'

// ticket 15a：场景卡片——对话空态零学习成本入口（点击预填问题）
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('场景卡片渲染（对话空态）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-scene')).toHaveCount(4)
  await expect(page.locator('.nf-scene').first()).toHaveText(/整理文件/)
  await expect(page.locator('.nf-scene').nth(3)).toHaveText(/做新项目/)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('scenes-empty.png')
})

test('点击场景卡片预填输入框', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /整理文件/ }).click()
  await expect(page.locator('.nf-chat__input textarea')).toHaveValue(/把 Downloads 里的发票和合同分类整理/)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('scenes-prefilled.png')
})
