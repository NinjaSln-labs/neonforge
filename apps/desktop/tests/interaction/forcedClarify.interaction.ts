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
    // UAT 二轮修复：确认后必须续转（自动 send 确认语触发下一模型回合——原缺陷：点完卡流程停滞）
    await expect(page.locator('body')).toContainText('确认，目标清楚了', { timeout: 10000 })
  })

  test('T-FORCE-3：点「我要重新描述」→ 卡消失 + 重述引导续转（rejectStreak 重置）', async ({
    page,
  }) => {
    const h = await installMockBridge(page, {
      project: 'none',
      script: loopScript(),
      extraInit: `
        window.__nfDialog = [];
        bridge.timeline = { log: async (e) => { if (e && ['dialogue.loop_guard', 'dialogue.forced_clarify', 'card.rejected'].includes(e.type)) window.__nfDialog.push(e); } };
      `,
    })
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
    // 点卡 = 新一轮协商（rejectStreak 重置）+ 重述引导自动 send——模型收到反馈重新提交提议
    await expect(page.locator('body')).toContainText('目标需要重新描述一下', { timeout: 10000 })
    // 2026-11-25 事件语义补课：对话健康介入载荷——loop_guard（rounds 计数）、forced_clarify
    // （underlying=goal），以及强制卡拒绝（card.rejected card/action/reason）
    const dialog =
      (await h.readCapture<Array<{ type: string; detail?: Record<string, unknown> }>>(
        '__nfDialog',
      )) ?? []
    const loopGuard = dialog.find((e) => e.type === 'dialogue.loop_guard')
    // rounds = pendingRepeatCount + unresolvedTextReplies（rejectStreak 触发时为 0——C2 形态）
    expect(typeof loopGuard?.detail?.rounds).toBe('number')
    const forced = dialog.find((e) => e.type === 'dialogue.forced_clarify')
    expect(forced?.detail).toEqual({ underlying: 'goal' })
    const rejected = dialog.find((e) => e.type === 'card.rejected')
    expect(rejected?.detail).toEqual({
      card: 'system_clarify',
      action: 'reject',
      reason: 'direction',
    })
  })
})
