// AI 辅助可用性走查（非人类研究）：仅用于启发式评估与截图评审。
// 手动运行：NF_AI_WALKTHROUGH=1 npx playwright test --project=interaction tests/interaction/aiWalkthrough.interaction.ts
// 不进入常规 CI；输出截图到 .scratch/evals/ai-walkthrough-2026-11-19（不入库）。
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { deliveredPackage, enterWorkspace, sendChat, startFromScratch } from './scenarios'

const ENABLED = process.env.NF_AI_WALKTHROUGH === '1'
const OUT = path.resolve(process.cwd(), '../../.scratch/evals/ai-walkthrough-2026-11-19')

async function shot(page: import('@playwright/test').Page, name: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
}

test.describe('AI 辅助可用性走查', () => {
  test.skip(!ENABLED, '设置 NF_AI_WALKTHROUGH=1 才运行')

  test('任务 1：首次配置 Provider/模型', async ({ page }) => {
    await installMockBridge(page, { project: 'none', hasKey: false })
    await page.goto('/')
    await expect(page.locator('.nf-config')).toBeVisible({ timeout: 15000 })
    await shot(page, '01-first-run-config.png')
  })

  test('任务 2-4：目标确认 → 方案确认 → 写入授权', async ({ page }) => {
    const h = await installMockBridge(page, {
      project: 'none',
      manualEmit: true,
      trustMode: 'strict',
      capture: { approvalSources: true },
    })
    await startFromScratch(page)
    await sendChat(page, '做一个待办应用')

    await h.emit([toolCall.proposeGoal('做一个待办应用'), chunk.done()])
    await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
    await shot(page, '02-goal-confirmation.png')
    await page.getByRole('button', { name: '确认目标' }).click()
    await expect(
      page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: '搭档处理中' }),
    ).toBeVisible({ timeout: 5000 })

    await h.emit([
      toolCall.proposePlan('单页方案', [
        { path: 'app.ts', reason: '入口' },
        { path: 'other.ts', reason: '辅助' },
      ]),
      chunk.done(),
    ])
    await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
    await shot(page, '03-plan-confirmation.png')
    await page.getByRole('button', { name: '确认执行' }).click()
    await page.waitForTimeout(300)

    await h.emit([toolCall.write('/test/app.ts', 'export const x = 1'), chunk.done()])
    await expect(page.locator('.nf-toolcall__hint')).toContainText('需要授权', { timeout: 10000 })
    await shot(page, '04-write-approval.png')
    await page.getByRole('button', { name: '允许执行' }).click()
    await expect(page.locator('.nf-toolcall--done').last()).toBeVisible({ timeout: 10000 })
    await shot(page, '04b-write-approved.png')

    // 任务 3 的“不允许”路径：第二次写入拒绝授权，确认未执行。
    // 等批准后的续聊回合创建新的 assistant 消息，避免第二张卡落在上一轮消息上
    // （rejectToolCall 只更新最后一条 assistant 消息；这是测试时序，不是产品断言）。
    await page.waitForTimeout(600)
    await h.emit([toolCall.write('/test/other.ts', 'export const y = 2'), chunk.done()])
    await expect(page.locator('.nf-toolcall__hint')).toContainText('需要授权', { timeout: 10000 })
    const pendingCard = page.locator('.nf-toolcall--need-approval').last()
    await pendingCard.getByRole('button', { name: '拒绝', exact: true }).click()
    await page.waitForTimeout(500)
    await shot(page, '04c-write-rejected.png')
    await expect(page.locator('.nf-toolcall').last()).toContainText('已拒绝授权', {
      timeout: 10000,
    })
  })

  test('任务 5：交付包验收与解决确认', async ({ page }) => {
    await installMockBridge(page, {
      project: 'open',
      demo: { delivery: deliveredPackage() },
    })
    await enterWorkspace(page)
    await page.getByRole('button', { name: '产物' }).click()
    await expect(page.locator('.nf-delivery')).toBeVisible({ timeout: 10000 })
    await shot(page, '05-delivery-package.png')

    await page.getByRole('button', { name: '勾选：拼写已修正' }).click()
    await page.getByRole('button', { name: '确认问题关闭' }).click()
    await expect(page.locator('.nf-delivery__badge--closed')).toBeVisible({ timeout: 10000 })
    await shot(page, '05b-delivery-closed.png')
  })
})
