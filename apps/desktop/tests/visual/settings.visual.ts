import { test, expect } from '@playwright/test'

// ticket 08a：设置面板——打开 → 插件列表（真实 IPC）+ 快捷键表
// 2026-08-03 A1 审计修复：移除不生效的假设置（语言/默认视图/主动提醒）——设置面板只含真实内容
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

test('设置面板（打开 + 插件列表 + 快捷键表）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  // 默认隐藏
  await expect(page.locator('.nf-settings')).toHaveCount(0)
  // 打开设置
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.locator('.nf-settings')).toBeVisible()
  await expect(page.locator('.nf-settings')).toContainText('内置插件')
  await expect(page.locator('.nf-settings')).toContainText('快捷键')
  await expect(page.locator('.nf-settings')).toHaveScreenshot('settings-open.png')
})

test('快捷键 ⌘, 打开/关闭设置（D0 §6）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-settings')).toHaveCount(0)
  // ⌘, 打开
  await page.keyboard.press('Meta+,')
  await expect(page.locator('.nf-settings')).toBeVisible()
  // ⌘, 关闭
  await page.keyboard.press('Meta+,')
  await expect(page.locator('.nf-settings')).toHaveCount(0)
})

test('快捷键表完整（D0 §6——只列已实现：⌘, / Enter / ⌘N / ⌘E）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.locator('.nf-settings')).toBeVisible()
  await expect(page.locator('.nf-settings')).toContainText('⌘ + , 打开 / 关闭设置')
  // 2026-08-03 A6：发送改为 Enter（Shift+Enter 换行）
  await expect(page.locator('.nf-settings')).toContainText('Enter 发送消息（Shift+Enter 换行）')
  await expect(page.locator('.nf-settings')).toContainText('⌘ + N 新任务')
  await expect(page.locator('.nf-settings')).toContainText('⌘ + E @引用当前文件')
})
