import { test, expect } from '@playwright/test'
import { installMockBridge } from '../interaction/mockBridge'
import { installVisualBridge } from './visualBridge'

// ticket 08b：@引用——输入 @ 弹出最近文件浮层 → 点击插入标签
test('@ 引用（输入 @ → 浮层 → 点击插入）', async ({ page }) => {
  await installVisualBridge(page, {
    demo: { recentFiles: ['src/main/gateway.ts', 'src/renderer/App.tsx', 'package.json'] },
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  // 输入 @ → 浮层出现
  await textarea.fill('帮我看看 @')
  await expect(page.locator('.nf-mention')).toBeVisible()
  await expect(page.locator('.nf-mention__item')).toHaveCount(3)
  // 坑 27 缓解（2026-08-04）：mask 浮层标题「引用文件」——常量文本对 App 组件树微小变化敏感（启动页改动后全量负载字形分叉 y=576-588），mask 掉消除基线抖动；标题非测试验证点
  await expect(page.locator('.nf-chat')).toHaveScreenshot('mention-open.png', {
    mask: [page.locator('.nf-mention__title')],
  })
  // 点击文件 → 插入标签
  await page.getByRole('option', { name: /gateway.ts/ }).click()
  await expect(textarea).toHaveValue(/@src\/main\/gateway\.ts /)
  await expect(page.locator('.nf-mention')).toHaveCount(0)
  await expect(page.locator('.nf-chat')).toHaveScreenshot('mention-inserted.png')
})

test('@引用注入（ContextEngine：@文件 → 精准上下文注入 streamChat）', async ({ page }) => {
  const handle = await installMockBridge(page, {
    capture: { sentMsgs: true },
    extraInit: `
      bridge.context.resolve = async (files) => ({
        fragments: [
          { path: '/test/' + files[0], content: 'export const x = 1', truncated: false },
        ],
      })
    `,
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  await textarea.fill('帮我看看 @src/a.ts')
  await textarea.press('Meta+Enter')
  await page.waitForTimeout(500)
  // streamChat 收到的 messages 含注入 system 消息（零 token 确定性上下文）
  const msgs = await handle.sentMessages()
  const injected = msgs?.find(
    (m) => m.role === 'system' && String(m.content).includes('已注入文件上下文'),
  )
  expect(injected).toBeTruthy()
  expect(String(injected?.content)).toContain('export const x = 1')
  expect(String(injected?.content)).toContain('/test/src/a.ts')
})
