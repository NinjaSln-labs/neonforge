import { test, expect } from '@playwright/test'
import { installVisualBridge } from './visualBridge'

// ticket 14 / ADR-015：信任阶梯视觉基线——真实 trustMode 映射 L3/L4 + 授权记录 + 委托规则
// 注：L5 像素基线在 macOS 宿主单独更新（本阶段只改交互断言，不在此环境重建截图）
test('信任阶梯（真实模式 L3/L4 + 授权记录 + 委托）', async ({ page }) => {
  await installVisualBridge(page, { demo: { trustLadder: true } })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-trust')).toBeVisible()
  await expect(page.locator('.nf-trust__level')).toHaveCount(4)
  // 默认 standard → L3（不再有演示从 L1 起步的假状态）
  await expect(page.locator('.nf-trust')).toContainText('当前：L3')
  await expect(page.locator('.nf-trust')).toContainText('标准')
  await expect(page.locator('.nf-trust')).toContainText('授权记录')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('trust-init.png')
  // 低危委托开关 → delegated → L4
  await page.getByRole('checkbox', { name: '低危委托模式' }).check()
  await expect(page.locator('.nf-trust')).toContainText('当前：L4')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('trust-upgraded.png')
})
