import { test, expect } from '@playwright/test'

// ticket 08a：设置面板——状态栏 ⚙ 打开 → 语言/默认视图/提醒开关
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

test('设置面板（⚙ 打开 + 语言/视图/提醒）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  // 默认隐藏
  await expect(page.locator('.nf-settings')).toHaveCount(0)
  // 打开设置
  await page.getByRole('button', { name: '⚙ 设置' }).click()
  await expect(page.locator('.nf-settings')).toBeVisible()
  await expect(page.locator('.nf-settings')).toContainText('语言')
  await expect(page.locator('.nf-settings')).toContainText('默认视图')
  await expect(page.locator('.nf-settings')).toContainText('主动提醒')
  await expect(page.locator('.nf-settings')).toHaveScreenshot('settings-open.png')
  // 切换语言 → English 选中
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('.nf-settings__seg-btn--on').first()).toHaveText('English')
  await expect(page.locator('.nf-settings')).toHaveScreenshot('settings-lang-en.png')
})
