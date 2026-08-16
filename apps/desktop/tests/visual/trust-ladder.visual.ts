import { test, expect } from '@playwright/test'

// ticket 14：信任阶梯视觉基线——mock trustLadder → L1-L4 阶梯 + 授权记录 + 委托规则
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        setKey: async () => {},
        clearKey: async () => {},
      },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '// x' }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: () => () => {},
      },
      demo: { trustLadder: true },
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('信任阶梯（L1-L4 + 授权记录 + 委托）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-trust')).toBeVisible()
  await expect(page.locator('.nf-trust__level')).toHaveCount(4)
  await expect(page.locator('.nf-trust')).toContainText('当前：L1')
  await expect(page.locator('.nf-trust')).toContainText('授权记录')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('trust-init.png')
  // 提升信任等级 + 委托开关
  await page.getByRole('button', { name: '提升信任等级' }).click()
  await expect(page.locator('.nf-trust')).toContainText('当前：L2')
  await page.getByRole('checkbox').check()
  await expect(page.locator('.nf-chat')).toHaveScreenshot('trust-upgraded.png')
})
