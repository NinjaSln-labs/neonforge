import { test, expect, type Page } from '@playwright/test'

/** 错误气泡 + 重试按钮 + 状态栏模型名（修改面视觉基线） */
async function mockErrorUi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { neonforge: unknown }).neonforge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        getProvider: async () => 'commandcode',
        setKey: async () => {},
        clearKey: async () => {},
        listProviders: async () => [],
      },
      workspace: {
        openFolder: async () => '/tmp/nf-visual-retry',
        listDir: async () => [],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        updateProjectTitle: async () => ({ ok: true }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        activeModel: async () => ({
          providerId: 'commandcode',
          providerLabel: 'Command Code',
          upstream: 'deepseek/deepseek-v4.1-flash',
          shortName: 'deepseek-v4.1-flash',
        }),
        streamChat: async () => ({
          ok: false,
          error: 'service-error',
          errorType: 'service' as const,
        }),
        onStreamChunk: () => () => {},
      },
      tools: { list: async () => [], execute: async () => ({ ok: true }) },
      chatLog: { log: async () => {} },
    }
  })
}

test('服务失败 + 重试按钮 + 状态栏模型', async ({ page }) => {
  await mockErrorUi(page)
  await page.goto('/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('帮我看看这个报错')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.nf-statusbar__model')).toContainText('Command Code')
  await expect(page.locator('.nf-app')).toHaveScreenshot('retry-error-statusbar.png')
})
