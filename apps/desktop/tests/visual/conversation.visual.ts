import { test, expect } from '@playwright/test'

// ticket 04：对话面板视觉基线——Web 形态 mock bridge → 进 workspace → 搭档面板对话 UI
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        setKey: async () => {},
        clearKey: async () => {}
      },
      workspace: {
        openFolder: async () => '/workspace/neonforge',
        listDir: async () => [],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: () => () => {}
      }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('对话面板空态（搭档面板）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-chat')).toBeVisible()
  await expect(page.locator('.nf-panel--center')).toHaveScreenshot('chat-panel-empty.png')
})

test('对话输入框聚焦态', async ({ page }) => {
  await mockBridge(page)
  await page.goto('/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').focus()
  await expect(page.locator('.nf-chat__input textarea')).toHaveScreenshot('chat-input-focus.png')
})
