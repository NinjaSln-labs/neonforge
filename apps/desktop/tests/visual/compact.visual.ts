import { test, expect } from '@playwright/test'

// ticket 11：Compaction——超长对话显示压缩提示（策略阈值 24 条）
async function mockBridge(page: import('@playwright/test').Page, history: number) {
  await page.addInitScript((h) => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: { compactHistory: h }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  }, history)
}

test('压缩提示（历史超阈值显示）', async ({ page }) => {
  await mockBridge(page, 30)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-compact')).toBeVisible()
  await expect(page.locator('.nf-compact')).toContainText('压缩前 18 条')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('compact-hint.png')
})

test('压缩提示（历史未超阈值不显示）', async ({ page }) => {
  await mockBridge(page, 10)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-compact')).toHaveCount(0)
})
