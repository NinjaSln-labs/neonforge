import { test, expect } from '@playwright/test'

// 基线 1：首次启动（无 Key）→ 配置页（D0 §3.1）
test('首次启动显示配置页', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.nf-config')).toBeVisible()
  await expect(page).toHaveScreenshot('config-page.png')
})

// 基线 2：配置页交互状态（输入框聚焦蓝边）
test('配置页输入框聚焦态', async ({ page }) => {
  await page.goto('/')
  await page.locator('.nf-config__input').focus()
  await expect(page.locator('.nf-config__input')).toHaveCSS('border-color', 'rgb(59, 130, 246)')
  await expect(page.locator('.nf-config__input')).toHaveScreenshot('config-input-focus.png')
})
