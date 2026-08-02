import { test, expect } from '@playwright/test'

// 05 执行层 A：diff 审核视图视觉基线（mock 交付包带 diffs）
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      delivery: {
        applyDiff: async () => ({ ok: true, file: '/test/a.txt' }),
        revertDiff: async () => ({ ok: true })
      },
      demo: {
        delivery: {
          status: 'delivered',
          summary: '修复了 a.txt 中的拼写错误',
          artifacts: ['a.txt'],
          acceptance: [{ label: '拼写已修正', done: false }],
          nextSteps: ['重新运行验证'],
          rerunLabel: '上次那个再跑一遍',
          diffs: [
            { path: '/test/a.txt', diff: '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n-hello worl\n+hello world' }
          ]
        }
      }
    }
  })
}

test('diff 审核视图（待审核态）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-diffcard')).toHaveCount(1)
  await expect(page.locator('.nf-diffcard')).toContainText('/test/a.txt')
  await expect(page.locator('.nf-diffcard')).toContainText('待审核')
  await expect(page.locator('.nf-diffcard__accept')).toHaveCount(1)
  // 目视 diff：行级渲染（hunk 标题 + del 红 + add 绿——不再截断纯文本）
  await expect(page.locator('.nf-diffline--hunk')).toHaveCount(1)
  await expect(page.locator('.nf-diffline--del')).toContainText('hello worl')
  await expect(page.locator('.nf-diffline--add')).toContainText('hello world')
  await expect(page.locator('.nf-diffcard')).toHaveScreenshot('diff-pending.png')
})

test('diff 审核视图（接受→确认→已应用）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(500)
  await page.locator('.nf-diffcard__accept').click()
  await expect(page.locator('.nf-diffcard')).toContainText('确认？')
  await page.locator('.nf-diffcard__confirm').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.nf-diffcard')).toContainText('已应用')
  await expect(page.locator('.nf-diffcard')).toHaveScreenshot('diff-applied.png')
})

test('非技术视图主路径：全部接受并写入（D0 §3.8——批量应用所有 diff）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(500)
  // 批量按钮出现（有待审核 diff）
  await expect(page.locator('.nf-diffcard__acceptall')).toBeVisible()
  await expect(page.locator('.nf-diffcard__acceptall')).toContainText('全部接受并写入')
  await page.locator('.nf-diffcard__acceptall-btn').click()
  await page.waitForTimeout(400)
  // 全部已应用（批量按钮消失——无待审核项）+ 单卡状态已应用
  await expect(page.locator('.nf-diffcard__acceptall')).toHaveCount(0)
  await expect(page.locator('.nf-diffcard')).toContainText('已应用')
  await expect(page.locator('.nf-diffcard')).toHaveScreenshot('diff-accept-all.png')
})
