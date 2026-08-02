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

test('@引用注入（ContextEngine：@文件 → 精准上下文注入 streamChat）', async ({ page }) => {
  await page.addInitScript(() => {
    window.__lastMsgs = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async (opts: { messages: Array<{ role: string; content: string | null }> }) => { window.__lastMsgs = opts.messages; return { ok: true } },
        onStreamChunk: () => () => {}
      },
      context: { resolve: async (files: string[]) => ({ fragments: [{ path: '/test/' + files[0], content: 'export const x = 1', truncated: false }] }) }
    }
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  await textarea.fill('帮我看看 @src/a.ts')
  await textarea.press('Meta+Enter')
  await page.waitForTimeout(500)
  // streamChat 收到的 messages 含注入 system 消息（零 token 确定性上下文）
  const msgs = await page.evaluate(() => (window as unknown as { __lastMsgs: Array<{ role: string; content: string | null }> | null }).__lastMsgs)
  const injected = msgs?.find((m) => m.role === 'system' && String(m.content).includes('已注入文件上下文'))
  expect(injected).toBeTruthy()
  expect(String(injected?.content)).toContain('export const x = 1')
  expect(String(injected?.content)).toContain('/test/src/a.ts')
})
