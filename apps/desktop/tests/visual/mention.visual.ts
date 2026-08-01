import { test, expect } from '@playwright/test'

// ticket 08b：@引用——输入 @ 弹出最近文件浮层 → 点击插入标签
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: { recentFiles: ['src/main/gateway.ts', 'src/renderer/App.tsx', 'package.json'] }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('@ 引用（输入 @ → 浮层 → 点击插入）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  // 输入 @ → 浮层出现
  await textarea.fill('帮我看看 @')
  await expect(page.locator('.nf-mention')).toBeVisible()
  await expect(page.locator('.nf-mention__item')).toHaveCount(3)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('mention-open.png')
  // 点击文件 → 插入标签
  await page.getByRole('button', { name: /gateway.ts/ }).click()
  await expect(textarea).toHaveValue(/@src\/main\/gateway\.ts /)
  await expect(page.locator('.nf-mention')).toHaveCount(0)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('mention-inserted.png')
})
