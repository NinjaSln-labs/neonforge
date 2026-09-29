import { test, expect } from '@playwright/test'
import { installVisualBridge } from './visualBridge'

// ticket 15a：场景卡片——对话空态零学习成本入口（点击预填问题）
test('场景卡片渲染（对话空态）', async ({ page }) => {
  await installVisualBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-scene')).toHaveCount(5)
  await expect(page.locator('.nf-scene').first()).toHaveText(/整理文件/)
  // 2026-08-04：新增「做游戏」场景卡（引导精确需求——类型/风格）
  await expect(page.locator('.nf-scene').nth(3)).toHaveText(/做游戏/)
  await expect(page.locator('.nf-scene').nth(4)).toHaveText(/做新项目/)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('scenes-empty.png')
})

test('点击场景卡片预填输入框', async ({ page }) => {
  await installVisualBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /整理文件/ }).click()
  await expect(page.locator('.nf-chat__input textarea')).toHaveValue(
    /把 Downloads 里的发票和合同分类整理/,
  )
  await expect(page.locator('.nf-chat')).toHaveScreenshot('scenes-prefilled.png')
})
