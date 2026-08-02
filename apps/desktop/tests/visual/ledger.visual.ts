import { test, expect } from '@playwright/test'

// ticket 06：问题台账视觉基线——mock 注入问题列表 → 渲染 + 选中交互
async function mockBridge(page: import('@playwright/test').Page, withProblems: boolean) {
  await page.addInitScript((hasProblems) => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: hasProblems ? {
        problems: [
          { id: 'p1', title: '整理 Downloads 里的发票和合同', status: 'closed', updatedAt: '10:20' },
          { id: 'p2', title: '做一个能发给朋友的旅行手册网页', status: 'awaiting-plan', updatedAt: '11:05' },
          { id: 'p3', title: '把销售表合并出月度图表', status: 'executing', updatedAt: '11:12' },
          { id: 'p4', title: '网站打不开了，帮我看看', status: 'failed-recoverable', updatedAt: '11:30' }
        ]
      } : null
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  }, withProblems)
}

test('问题台账（多状态渲染）', async ({ page }) => {
  await mockBridge(page, true)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-ledger__item')).toHaveCount(4)
  await expect(page.locator('.nf-session')).toContainText('已关闭 · 可复开')
  await expect(page.locator('.nf-session')).toContainText('方案待确认')
  await expect(page.locator('.nf-session')).toContainText('失败可恢复')
  await expect(page.locator('.nf-session')).toHaveScreenshot('ledger-list.png')
})

test('选中问题高亮', async ({ page }) => {
  await mockBridge(page, true)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /把销售表合并出月度图表/ }).click()
  await expect(page.locator('.nf-ledger__item--active')).toContainText('把销售表合并出月度图表')
  await expect(page.locator('.nf-session')).toHaveScreenshot('ledger-active.png')
})

test('台账空态（无问题）', async ({ page }) => {
  await mockBridge(page, false)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-session')).toContainText('还没有问题')
  await expect(page.locator('.nf-session')).toHaveScreenshot('ledger-empty.png')
})

test('发送问题 → 台账创建实例（问题 = 一等公民）', async ({ page }) => {
  await mockBridge(page, false)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-session')).toContainText('还没有问题')
  const textarea = page.locator('.nf-chat__input textarea')
  await textarea.fill('帮我整理发票文件')
  await textarea.press('Meta+Enter')
  await page.waitForTimeout(600)
  await expect(page.locator('.nf-ledger__item')).toHaveCount(1)
  await expect(page.locator('.nf-ledger__item')).toContainText('帮我整理发票文件')
  await expect(page.locator('.nf-ledger__item')).toContainText('执行中')
})

test('closed 问题复开 → 复跑（上次那个再跑一遍）', async ({ page }) => {
  await mockBridge(page, true)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-ledger__item')).toHaveCount(4)
  // 点击 closed 问题（p1 整理 Downloads）→ 复开复跑
  await page.getByRole('button', { name: /整理 Downloads 里的发票和合同/ }).click()
  await page.waitForTimeout(600)
  await expect(page.locator('.nf-msg--user')).toContainText('整理 Downloads 里的发票和合同')
})
