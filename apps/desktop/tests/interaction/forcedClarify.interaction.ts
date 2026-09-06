import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { compose, goalConfirm, startFromScratch, sendChat } from './scenarios'

// ADR-010：强制澄清卡——无进展对话二级介入（UAT-Sim A-024/A-025）
// 触发：T2 pending 期间用户连续文本回复 ≥3（「你看着定吧」式文字确认不被认 → 用户反复尝试）
// → detectUnproductiveDialogue 'forced-clarify' → setPendingState('system_clarify') → .nf-forcedcard
// 三选项：确认执行（委派 underlying）/ 我要重新描述（reject direction）/ 由搭档全权决定

// A-024 真机循环形态：用户文本 → C2 隐式 reject(direction) → 模型重提议 propose_goal → 用户再文本 → …
const reProposeRound = (): ReturnType<typeof goalConfirm> => [
  [toolCall.proposeGoal('做一个番茄钟页面'), chunk.done()],
]

const loopScript = () =>
  compose(goalConfirm('做一个番茄钟页面'), reProposeRound(), reProposeRound(), reProposeRound())

test.describe('ADR-010 强制澄清卡', () => {
  test('T-FORCE-1：pending 期间用户文本回复 ×3 → 强制卡渲染（T2 路径）', async ({ page }) => {
    installMockBridge(page, { project: 'none', script: loopScript() })
    await startFromScratch(page, '做一个番茄钟页面')
    await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
    // 用户连续文本回复（pending='goal' 期间）——T2 计数 1→2→3
    await sendChat(page, '就按你想的做')
    await page.waitForTimeout(2500)
    await sendChat(page, '你看着定吧')
    await page.waitForTimeout(2500)
    await sendChat(page, '行行行，快做吧')
    await expect(page.locator('.nf-forcedcard')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.nf-forcedcard__head')).toContainText('对话出现循环')
    await expect(page.locator('.nf-forcedcard__btn--ok')).toContainText('确认执行')
  })

  test('T-FORCE-2：点「确认执行」→ 卡消失（underlying=goal 委派确认）', async ({ page }) => {
    installMockBridge(page, { project: 'none', script: loopScript() })
    await startFromScratch(page, '做一个番茄钟页面')
    await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
    await sendChat(page, '就按你想的做')
    await page.waitForTimeout(2500)
    await sendChat(page, '你看着定吧')
    await page.waitForTimeout(2500)
    await sendChat(page, '行行行，快做吧')
    await expect(page.locator('.nf-forcedcard')).toBeVisible({ timeout: 15000 })
    await page.locator('.nf-forcedcard__btn--ok').click()
    await expect(page.locator('.nf-forcedcard')).toHaveCount(0)
  })

  test('T-FORCE-3：点「我要重新描述」→ 卡消失（reject direction）', async ({ page }) => {
    installMockBridge(page, { project: 'none', script: loopScript() })
    await startFromScratch(page, '做一个番茄钟页面')
    await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
    await sendChat(page, '就按你想的做')
    await page.waitForTimeout(2500)
    await sendChat(page, '你看着定吧')
    await page.waitForTimeout(2500)
    await sendChat(page, '行行行，快做吧')
    await expect(page.locator('.nf-forcedcard')).toBeVisible({ timeout: 15000 })
    await page.locator('.nf-forcedcard__btn', { hasText: '我要重新描述' }).click()
    await expect(page.locator('.nf-forcedcard')).toHaveCount(0)
  })
})
