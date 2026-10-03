// flake 治理 L2 预热（setup project——playwright.config.ts projects.warmup）：
// vite 按需编译发生在首个浏览器页面（webServer 探活只测端口）——冷编译类 `.nf-start` 超时在此一次性吸收。
// 必须带桥桩：App.tsx:21-25 无 window.neonforge.config.hasKey 时落 config 页、.nf-start 永不挂载
//（裸 globalSetup 预热必炸——终审 D1）；进工作区把 ConversationPanel 大模块图一并 warm。
import { test } from '@playwright/test'
import { installMockBridge } from './mockBridge'

test('warmup: vite 模块图预热', async ({ page }) => {
  await installMockBridge(page, { project: 'open' })
  await page.goto('/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').waitFor({ timeout: 30000 })
})
