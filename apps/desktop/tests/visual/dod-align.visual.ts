import { test, expect } from '@playwright/test'
import { installVisualBridge } from './visualBridge'

// ticket 15b：DoD 对齐——复述问题 + 验收标准确认 → 开始解决
test('DoD 对齐（复述 + 验收标准确认）', async ({ page }) => {
  await installVisualBridge(page, { demo: { dodAlign: true } })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-dod')).toBeVisible()
  await expect(page.locator('.nf-dod')).toContainText('旅行手册网页')
  await expect(page.getByRole('button', { name: '确认，开始解决' })).toBeDisabled()
  await expect(page.locator('.nf-chat')).toHaveScreenshot('dod-init.png')
  // 全确认 → 开始解决
  const checks = page.locator('.nf-dod .nf-check')
  for (let i = 0; i < 3; i++) {
    await checks.nth(i).click()
  }
  await expect(page.getByRole('button', { name: '确认，开始解决' })).toBeEnabled()
  await page.getByRole('button', { name: '确认，开始解决' }).click()
  await expect(page.locator('.nf-dod')).toContainText('验收标准已对齐')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('dod-confirmed.png')
})
