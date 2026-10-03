import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { compose, goalConfirm, startFromScratch, sendChat } from './scenarios'
import { expectChatReady } from '../helpers/assertions'

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
    // 点卡 = 新一轮协商（rejectStreak 重置）+ 重述引导自动 send——模型收到反馈重新提交提议
    await expect(page.locator('body')).toContainText('目标需要重新描述一下', { timeout: 10000 })
  })

  // RC1a（关单复测簇1）：强制卡裸退前必须收尾本轮流式占位——否则「搭档处理中…」幽灵永久残留，
  // 而状态栏已「就绪」→ 用户看到假忙、UAT busy 判定（读 DOM）被毒化死锁。
  test('T-FORCE-4：强制卡弹出后不得残留流式占位（RC1a 幽灵）', async ({ page }) => {
    installMockBridge(page, { project: 'none', script: loopScript() })
    await startFromScratch(page, '做一个番茄钟页面')
    await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
    await sendChat(page, '就按你想的做')
    await page.waitForTimeout(2500)
    await sendChat(page, '你看着定吧')
    await page.waitForTimeout(2500)
    await sendChat(page, '行行行，快做吧')
    await expect(page.locator('.nf-forcedcard')).toBeVisible({ timeout: 15000 })
    await expectChatReady(page) // 状态栏「就绪」（helpers L74-76）
    // 收尾断言：不得残留空 streaming 占位（幽灵）——body--thinking（L2840）+ 呼吸点（L2837）双清
    await expect(page.locator('.nf-msg--assistant .nf-msg__body--thinking')).toHaveCount(0)
    await expect(page.locator('.nf-msg--assistant .nf-breath')).toHaveCount(0)
  })

  // RC1a 同族的另一裸退位：网关 ok 却整轮零 chunk（连 done 都没发）＝静默轮——链尾同样要收尾占位，
  // 否则永久留「搭档处理中」幽灵而状态栏已「就绪」。判据必须窄（本轮 chunk 数为 0）：
  // 链尾跑在 React 提交之前，无条件收尾会把承载确认卡的信号消息当空占位丢弃（实测踩过）。
  test('T-FORCE-5：静默轮（零 chunk／无 done）不得残留流式占位', async ({ page }) => {
    installMockBridge(page, { project: 'none', script: [[]], defaultRound: [] })
    await startFromScratch(page, '做个待办应用')
    // 先确认本轮确实进门（启动页自动发送有 ≈50ms 延后）——否则「就绪」会被发送前的初始就绪态先满足，
    // 慢负载轮里就在占位仍在流时断言（本用例首轮整项目冷启即为此误红）
    await expect(page.locator('.nf-msg--user')).toHaveCount(1)
    await expectChatReady(page)
    await expect(page.locator('.nf-msg--assistant .nf-msg__body--thinking')).toHaveCount(0)
    await expect(page.locator('.nf-msg--assistant .nf-breath')).toHaveCount(0)
  })
})
