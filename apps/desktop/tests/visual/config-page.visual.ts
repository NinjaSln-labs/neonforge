import { test, expect } from '@playwright/test'

// 基线：首次启动（无 Key）→ 配置页（D0 §3.1）——mock hasKey=false，避免缺 bridge 时 ConfigPage 读 window.neonforge 崩
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: {
        hasKey: async () => false,
        getKey: async () => null,
        getProvider: async () => 'commandcode',
        getModel: async () => null,
        setKey: async () => {},
        clearKey: async () => {},
        listProviders: async () => [
          {
            id: 'deepseek',
            label: 'DeepSeek 官方',
            howToGetKey: { zh: '在 platform.deepseek.com 创建 API Key', en: '' },
            docsUrl: 'https://platform.deepseek.com',
          },
          {
            id: 'commandcode',
            label: 'Command Code',
            howToGetKey: { zh: '在 Command Code 控制台创建 Key', en: '' },
          },
        ],
      },
      gateway: {
        validate: async () => ({ ok: true }),
      },
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('首次启动显示配置页', async ({ page }) => {
  await mockBridge(page)
  await page.goto('/')
  await expect(page.locator('.nf-config')).toBeVisible()
  await expect(page.getByLabel('接入方')).toBeVisible()
  await expect(page.getByLabel('API Key')).toBeVisible()
  await expect(page.getByRole('button', { name: '验证并开始' })).toBeVisible()
  await expect(page).toHaveScreenshot('config-page.png')
})

test('配置页输入框聚焦态', async ({ page }) => {
  await mockBridge(page)
  await page.goto('/')
  const keyInput = page.getByLabel('API Key')
  await expect(keyInput).toBeVisible()
  await keyInput.focus()
  await expect(keyInput).toHaveCSS('background-image', /linear-gradient/)
  await expect(keyInput).toHaveScreenshot('config-input-focus.png')
})
