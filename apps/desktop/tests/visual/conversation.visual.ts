import { test, expect } from '@playwright/test'
import { installMockBridge } from '../interaction/mockBridge'
import { installVisualBridge } from './visualBridge'

// ticket 04：对话面板视觉基线——Web 形态 mock bridge → 进 workspace → 搭档面板对话 UI
test('对话面板空态（搭档面板）', async ({ page }) => {
  await installVisualBridge(page)
  await page.goto('/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-chat')).toBeVisible()
  await expect(page.locator('.nf-panel--center')).toHaveScreenshot('chat-panel-empty.png')
})

test('对话输入框聚焦态', async ({ page }) => {
  await installVisualBridge(page)
  await page.goto('/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').focus()
  await expect(page.locator('.nf-chat__input textarea')).toHaveScreenshot('chat-input-focus.png')
})

test('断点续做：发送 → reload → 会话恢复', async ({ page }) => {
  await installMockBridge(page, { manualEmit: true })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  const textarea = page.locator('.nf-chat__input textarea')
  await textarea.fill('帮我看看这个文件')
  await textarea.press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const emit = (window as unknown as { __emit: (c: unknown) => void }).__emit
    emit({ type: 'reasoning', text: '分析中' })
    emit({ type: 'content', text: '好的，我来看看' })
    emit({ type: 'done' })
  })
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
  // reload → 会话恢复（localStorage 持久化——断点续做）
  await page.reload()
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-msg--user')).toContainText('帮我看看这个文件')
  await expect(page.locator('.nf-chat')).toContainText('好的，我来看看')
})

test('搭档须知 .neonforge 注入（项目级指令——08d 消费）', async ({ page }) => {
  const handle = await installMockBridge(page, {
    capture: { sentMsgs: true },
    extraInit: `
      bridge.workspace.readNotebook = async () => ({ ok: true, content: '规则：先读需求文档再动手' })
    `,
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('开始任务')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(500)
  // streamChat messages 含 .neonforge 注入 system 消息
  const msgs = await handle.sentMessages()
  const injected = msgs?.find((m) => m.role === 'system' && String(m.content).includes('搭档须知'))
  expect(injected).toBeTruthy()
  expect(String(injected?.content)).toContain('先读需求文档再动手')
})
