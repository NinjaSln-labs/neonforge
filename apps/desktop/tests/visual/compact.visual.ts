import { test, expect } from '@playwright/test'
import { installVisualBridge } from './visualBridge'

// ticket 11：Compaction——超长对话显示压缩提示（策略阈值 24 条）
test('压缩提示（历史超阈值显示）', async ({ page }) => {
  await installVisualBridge(page, { demo: { compactHistory: 30 } })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-compact')).toBeVisible()
  await expect(page.locator('.nf-compact')).toContainText('压缩前 18 条')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('compact-hint.png')
})

test('压缩提示（历史未超阈值不显示）', async ({ page }) => {
  await installVisualBridge(page, { demo: { compactHistory: 10 } })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-compact')).toHaveCount(0)
})
