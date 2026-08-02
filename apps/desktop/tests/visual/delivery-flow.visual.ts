import { test, expect } from '@playwright/test'

// ticket 07：0-1 交付流视觉基线——mock deliveryFlow → 阶段机 + 模型选择 + 分步推进
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: { deliveryFlow: true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('0-1 交付流（阶段机 + 模型选择）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-flow')).toBeVisible()
  await expect(page.locator('.nf-flow__stage')).toHaveCount(6)
  await expect(page.locator('.nf-flow__stage--active')).toContainText('需求')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-init.png')
})

test('选敏捷 → 分步推进到交付', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /敏捷开发/ }).click()
  await expect(page.locator('.nf-flow')).toContainText('模型：敏捷（迭代）')
  // 推进 6 步到交付完成
  for (let i = 0; i < 6; i++) {
    const btn = page.locator('.nf-flow__advance button')
    if (await btn.count()) { await btn.click() }
  }
  await expect(page.locator('.nf-flow')).toContainText('交付完成')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-done.png')
})

test('0-1 从零开始 → 发送需求 → 创建真实项目（ticket 07 执行地基）', async ({ page }) => {
  await page.addInitScript(() => {
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [{ name: 'README.md', path: '/tmp/nf-proj/travel-site/README.md', kind: 'file' }],
        readFile: async () => ({ ok: true, content: '# x' }),
        initProject: async (title: string) => ({ ok: true, path: '/tmp/nf-proj/travel-site', title })
      },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} }
    }
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 0-1 模式：交付流面板 + 状态栏「从零开始」
  await expect(page.locator('.nf-flow')).toBeVisible()
  await expect(page.locator('.nf-statusbar')).toContainText('从零开始')
  // 发送需求 → initProject → rootPath 更新（状态栏显示项目 slug + 0-1 面板退场——真实项目就绪）
  await page.locator('.nf-chat__input textarea').fill('做一个旅行手册网站')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  await expect(page.locator('.nf-statusbar')).toContainText('travel-site')
  await expect(page.locator('.nf-flow')).toHaveCount(0)
})
