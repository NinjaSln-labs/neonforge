import { test, expect } from '@playwright/test'

// ticket 05：交付包视觉基线——mock bridge 注入演示交付包 → 产物 Tab → 渲染 + 验收交互
import { installMockBridge } from '../interaction/mockBridge'
import {
  compose,
  goalConfirm,
  planPropose,
  executeWrite,
  enterWorkspace,
  sendChat,
} from '../interaction/scenarios'
async function mockBridge(page: import('@playwright/test').Page, demoDelivery: boolean) {
  await page.addInitScript((withDelivery) => {
    const bridge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        getProvider: async () => 'commandcode',
        setKey: async () => {},
        clearKey: async () => {},
        listProviders: async () => [],
      },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '// x' }),
        updateProjectTitle: async () => ({ ok: true }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: () => () => {},
      },
      demo: withDelivery
        ? {
            delivery: {
              status: 'delivered',
              summary:
                '整理了 Downloads 里的发票和合同：按类型分类、统一命名、重复文件标出（未删除）',
              artifacts: ['发票/2026-08.xlsx', '合同/2026-07-15-服务协议.pdf', '重复文件清单.csv'],
              acceptance: [
                { label: '发票都在「发票」文件夹', done: false },
                { label: '文件名含日期 + 商户', done: false },
                { label: '重复文件已标出（未删，待你确认）', done: false },
              ],
              nextSteps: [
                '重复文件确认后我帮你删（授权后）',
                '需要发布网站？域名/备案超出数字工具能力——源码已给，我指导你发布',
              ],
              rerunLabel: '上次那个整理，再跑一遍',
            },
          }
        : null,
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
  for (let i = 0; i < 3; i++) {
    await checks.nth(i).click()
  }
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
  // V1.5：确认卡门控走 propose_goal / propose_plan；清单内 write 自动执行（无授权卡）
  await installMockBridge(page, {
    project: 'open',
    script: compose(
      goalConfirm('写一个 notes 文件'),
      planPropose(['/test/notes.txt（新建）']),
      executeWrite('/test/notes.txt', 'hello'),
    ),
  })
  await enterWorkspace(page)
  await sendChat(page, '帮我写一个 notes 文件')
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  // 清单内 write 自动落地 → 可回滚
  await expect(page.locator('.nf-toolcall').filter({ hasText: 'write' })).toContainText('已写入', {
    timeout: 10000,
  })
  await page.getByRole('button', { name: '产物' }).click()
  await expect(page.locator('.nf-delivery__summary')).toContainText('写入/修改 1 个文件')
  await expect(page.locator('.nf-delivery__artifacts')).toContainText('/test/notes.txt')
  await expect(page.locator('.nf-delivery__acceptance')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '确认问题关闭' })).toHaveCount(0)
  await expect(page.locator('.nf-output')).toHaveScreenshot('delivery-real-execution.png')
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-delivery__rerun')).toContainText('再跑一遍')
  await page.locator('.nf-delivery__rerun').click()
  await expect(page.locator('.nf-msg--user')).toHaveCount(3, { timeout: 8000 })
  // 复跑 = lastPromptRef 兜底的原始任务（确认卡按钮消息未必都记入 lastPrompt）
  await expect(page.locator('.nf-msg--user').last()).toContainText('帮我写一个 notes 文件')
})
