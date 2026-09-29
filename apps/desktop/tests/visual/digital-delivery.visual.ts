import { test, expect } from '@playwright/test'
import { installVisualBridge } from './visualBridge'

// ticket 13：数字产物交付视觉基线——mock digitalDelivery → 文件清单 + 任务选择 + 变更预览 + 交付
test('数字交付（文件清单 + 任务选择 + 变更预览）', async ({ page }) => {
  await installVisualBridge(page, { demo: { digitalDelivery: true } })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-digital')).toBeVisible()
  await expect(page.locator('.nf-digital__files li')).toHaveCount(6)
  await expect(page.locator('.nf-digital')).toContainText('按类型整理分类')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('digital-init.png')
  // 选任务 → 变更预览（L3 授权）
  await page.getByRole('button', { name: /按类型整理分类/ }).click()
  await expect(page.locator('.nf-digital')).toContainText('开始处理（需授权）')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('digital-preview.png')
  // 确认 → 处理中 → 交付完成
  await page.getByRole('button', { name: '开始处理（需授权）' }).click()
  await expect(page.locator('.nf-digital')).toContainText('变更预览')
  await page.getByRole('button', { name: '确认并交付' }).click()
  await expect(page.locator('.nf-digital')).toContainText('交付包已在「产物」区')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('digital-done.png')
})
