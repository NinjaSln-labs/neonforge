import { test, expect } from '@playwright/test'

// 启动页（2026-08-04 方案 A——D0 §3.2/屏幕1）：真实输入框（占位轮播）+ 场景卡（点击预填）+ 二选一芯片
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
        initProject: async () => ({ ok: true, path: '/test', title: 't' }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: () => () => {},
      },
      chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/nf-test.md' }) },
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('启动页（方案 A：输入框 + 5 场景卡 + 二选一芯片）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start__brand')).toBeVisible()
  await expect(page.locator('.nf-start__input')).toBeVisible()
  await expect(page.locator('.nf-start__scene')).toHaveCount(5)
  // 二选一芯片（从零开始 primary + 打开已有项目 ghost）
  await expect(page.getByRole('button', { name: '从零开始' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开已有项目' })).toBeVisible()
  // 占位轮播首帧（确定性：3s 内截图，phIdx=0）
  await expect(page.locator('.nf-start__input')).toHaveAttribute('placeholder', /想解决什么/)
  await expect(page.locator('.nf-start')).toHaveScreenshot('start-compose.png')
})

test('启动页场景卡点击 → 预填输入框', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.locator('.nf-start__scene', { hasText: '做小工具' }).click()
  await expect(page.locator('.nf-start__input')).toHaveValue(/每周记账/)
  await expect(page.locator('.nf-start')).toHaveScreenshot('start-prefilled.png')
})
