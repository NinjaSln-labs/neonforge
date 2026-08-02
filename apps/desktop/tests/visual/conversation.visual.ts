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
        openFolder: async () => '/Volumes/NinjaSin/myself/neonforge',
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

test('断点续做：发送 → reload → 会话恢复', async ({ page }) => {
  await page.addInitScript(() => {
    window.__emit = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: (cb: (c: unknown) => void) => { window.__emit = cb; return () => {} }
      }
    }
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  await textarea.fill('帮我看看这个文件')
  await textarea.press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '分析中' })
    window.__emit({ type: 'content', text: '好的，我来看看' })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
  // reload → 会话恢复（localStorage 持久化——断点续做）
  await page.reload()
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-msg--user')).toContainText('帮我看看这个文件')
  await expect(page.locator('.nf-chat')).toContainText('好的，我来看看')
})
