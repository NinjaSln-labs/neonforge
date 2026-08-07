import { test, expect } from '@playwright/test'

// ticket 05：交付包视觉基线——mock bridge 注入演示交付包 → 产物 Tab → 渲染 + 验收交互
async function mockBridge(page: import('@playwright/test').Page, demoDelivery: boolean) {
  await page.addInitScript((withDelivery) => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: withDelivery ? {
        delivery: {
          status: 'delivered',
          summary: '整理了 Downloads 里的发票和合同：按类型分类、统一命名、重复文件标出（未删除）',
          artifacts: ['发票/2026-08.xlsx', '合同/2026-07-15-服务协议.pdf', '重复文件清单.csv'],
          acceptance: [
            { label: '发票都在「发票」文件夹', done: false },
            { label: '文件名含日期 + 商户', done: false },
            { label: '重复文件已标出（未删，待你确认）', done: false }
          ],
          nextSteps: [
            '重复文件确认后我帮你删（授权后）',
            '需要发布网站？域名/备案超出数字工具能力——源码已给，我指导你发布'
          ],
          rerunLabel: '上次那个整理，再跑一遍'
        }
      } : null
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  }, demoDelivery)
}

test('交付包视图（产物 Tab 渲染）', async ({ page }) => {
  await mockBridge(page, true)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: '产物' }).click()
  await expect(page.locator('.nf-delivery__badge')).toHaveText('已解决')
  await expect(page.locator('.nf-delivery__summary')).toContainText('整理了 Downloads')
  await expect(page.locator('.nf-delivery__acceptance li')).toHaveCount(3)
  await expect(page.locator('.nf-output')).toHaveScreenshot('delivery-package.png')
})

test('验收交互：打勾 → 确认问题关闭', async ({ page }) => {
  await mockBridge(page, true)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: '产物' }).click()
  // 未全勾：确认按钮禁用
  await expect(page.getByRole('button', { name: '确认问题关闭' })).toBeDisabled()
  // 逐项打勾
  const checks = page.locator('.nf-check')
  for (let i = 0; i < 3; i++) { await checks.nth(i).click() }
  await expect(page.getByRole('button', { name: '确认问题关闭' })).toBeEnabled()
  await page.getByRole('button', { name: '确认问题关闭' }).click()
  await expect(page.locator('.nf-delivery__badge')).toHaveText('已关闭')
  await expect(page.locator('.nf-output')).toHaveScreenshot('delivery-closed.png')
})

test('交付包空态（无交付时）', async ({ page }) => {
  await mockBridge(page, false)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: '产物' }).click()
  await expect(page.locator('.nf-output')).toContainText('还没有交付包')
  await expect(page.locator('.nf-output')).toHaveScreenshot('delivery-empty.png')
})

test('真实执行 → 产物区交付包联动（write 授权后）', async ({ page }) => {
  await page.addInitScript(() => {
    window.__emit = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: (cb: (c: unknown) => void) => { window.__emit = cb; return () => {} }
      },
      tools: {
        list: async () => [],
        execute: async (name: string, _args: Record<string, unknown>, opts?: { approved?: boolean }) =>
          name === 'write' && opts?.approved
            ? { ok: true, data: { file: '/test/notes.txt', snapshot: true } }
            // 2026-08-07 T2（regex-todo）：needApproval 结构化字段
            : { ok: false, needApproval: true, error: `「${name}」需要授权（L3）——approved=true 后执行` },
        revert: async () => ({ ok: true })
      }
    }
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('帮我写一个 notes 文件')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '需要写入文件' })
    window.__emit({ type: 'tool-call', toolCall: { name: 'write', args: { path: '/test/notes.txt', content: 'hello' } } })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(500)
  await page.locator('.nf-toolcall__approve').click()
  await page.waitForTimeout(600)
  // 产物 Tab → 真实交付包联动（变更说明 + 产物清单；无验收项——不显示验收对照/确认关闭）
  await page.getByRole('button', { name: '产物' }).click()
  await expect(page.locator('.nf-delivery__summary')).toContainText('写入/修改 1 个文件')
  await expect(page.locator('.nf-delivery__artifacts')).toContainText('/test/notes.txt')
  await expect(page.locator('.nf-delivery__acceptance')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '确认问题关闭' })).toHaveCount(0)
  await expect(page.locator('.nf-output')).toHaveScreenshot('delivery-real-execution.png')
  // 复跑入口：rerunPrompt = 最近用户输入 → 点击 → 对话预填并重发（用户消息 +1）
  // 等首次会话完全结束（working false——maybeContinue 续聊链 ~1.5s）再复跑
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-delivery__rerun')).toContainText('再跑一遍')
  await page.locator('.nf-delivery__rerun').click()
  await page.waitForTimeout(400)
  await expect(page.locator('.nf-msg--user')).toHaveCount(2)
  await expect(page.locator('.nf-msg--user').last()).toContainText('帮我写一个 notes 文件')
})
