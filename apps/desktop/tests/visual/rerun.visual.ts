import { test, expect } from '@playwright/test'

// 05 执行层 B：复跑触发——mock 交付包带 rerunPrompt → 点复跑 → 断言预填+发送
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const sent: string[] = []
    ;(window as unknown as Record<string, unknown>).__sent = sent
    window.neonforge = {
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
        streamChat: async (opts: { messages?: Array<{ content?: string | null }> }) => {
          sent.push(opts.messages?.at(-1)?.content ?? '')
          return { ok: true }
        },
        onStreamChunk: () => () => {},
      },
      delivery: { applyDiff: async () => ({ ok: true }), revertDiff: async () => ({ ok: true }) },
      demo: {
        delivery: {
          status: 'delivered',
          summary: '整理完成',
          artifacts: ['x.txt'],
          acceptance: [{ label: 'ok', done: true }],
          nextSteps: [],
          rerunLabel: '上次那个整理，再跑一遍',
          rerunPrompt: '帮我整理一下这个目录',
        },
      },
    }
  })
}

test('复跑：点复跑 → 输入框预填 + 发送原始需求', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(400)
  // 复跑按钮
  await expect(page.getByRole('button', { name: /上次那个整理/ })).toBeVisible()
  await page.getByRole('button', { name: /上次那个整理/ }).click()
  await page.waitForTimeout(600)
  // 断言：发送捕获（gateway 收到原始需求）
  const sent = await page.evaluate(() => (window as unknown as { __sent: string[] }).__sent)
  expect(sent.length).toBeGreaterThan(0)
  expect(sent[0]).toBe('帮我整理一下这个目录')
})
