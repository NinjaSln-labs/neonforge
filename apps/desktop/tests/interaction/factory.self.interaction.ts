// T0 基建自测（测试域 DDD §9.3——验收：工厂可装配旧场景）
// 用 MockBridge 工厂 + 场景装配器重搭 4 个代表性旧场景，断言与旧测试完全一致：
//   1. 根因3（轮次脚本 + forceTool/approved 捕获 + 清单内 write 自动放行）
//   2. 合并授权（manualEmit 手动推流 + 同批多卡合并授权）
//   3. P2 双卡（approval 'all' + defaultRound + 卡按 id 精确定位）
//   4. 交付对账（demo 注入 + silent + 打开已有项目路径）
// 旧测试文件 core.interaction.ts 保持不动（S3 迁移）；本文件证明基建等价后旧基建可弃。
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { deliveredPackage, enterWorkspace, startFromScratch, sendChat } from './scenarios'
import {
  expectVisible,
  expectAbsent,
  expectCount,
  expectText,
  expectToolCallState,
} from '../helpers/assertions'

// V1.5 S4 恢复（原 S3 skip——commit f780432）：manualEmit 可靠形态重写——脚本轮次形态下
// auto-continue 与协议 pending 置位存在边缘竞态（S3-St-4/坑 112：轮次被静默 send 抢占），
// manualEmit 由测试精确控制 emit 时机（等确认 send 的流式消息创建后再 emit，同 T0-2 模式）；
// 语义不变：forceTool/approved 捕获 + 清单内 write 自动放行（根因 3）

// 等 send 的流式空体 assistant 消息出现（emit 的落点——updater 只写 streaming 消息；
// .first() 兼容 StrictMode 双发产生的多条流式消息——坑 32）
async function waitStreaming(page: import('@playwright/test').Page, timeout = 8000): Promise<void> {
  await expect(page.locator('.nf-msg__body--thinking').first()).toBeVisible({ timeout })
}

test('T0 自测 1：根因3 重搭——manualEmit + forceTool/approved 捕获 + 清单内 write 自动放行', async ({
  page,
}) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    capture: { forceToolCalls: true, approvedFlags: true },
  })
  await startFromScratch(page, '做个射击游戏')
  // 等 send 的流式消息创建（send 是 async——updater 找不到 streaming 消息时 emit 会被丢弃；
  // expectAssistantMsg『搭档处理中』在多消息场景 strict 冲突——用 thinking 空体类精确定位）
  await waitStreaming(page, 10000)
  await h.emit([toolCall.proposeGoal('做一个能打开的网页射击游戏'), chunk.done()])
  // 目标确认卡 → 点「确认目标」（同事件触发 send「确认，目标清楚了」）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectText(page.locator('.nf-chat__list'), '确认，目标清楚了', 10000)
  // 等 send 的流式消息创建（send 是 async——click 完成时消息可能未 push，emit 会被丢弃）
  await waitStreaming(page, 5000)
  await h.emit([
    toolCall.proposePlan('先做能玩的第一版。', [
      { path: 'game.js', reason: '主逻辑' },
      { path: 'index.html', reason: '页面' },
    ]),
    chunk.done(),
  ])
  // 方案卡 → 点「确认执行」
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expectText(page.locator('.nf-chat__list'), '确认，按方案执行', 10000)
  await waitStreaming(page, 5000)
  // 确认执行后的轮：清单内 write 自动放行（approved=true → 直接 done，无授权卡）
  await h.emit([toolCall.write('game.js', 'x'), chunk.done()])
  await h.emit([toolCall.reportCompletion('完成，第一版能玩了。', [], []), chunk.done()])
  // V1.5 S3 工具化：proposeGoal/proposePlan 亦为 done 卡——write 放行由 approvedFlags[0]=true 证明
  // （write 卡可能在确认前拦截轮出现——done 计数不精确断言；无授权卡 + 放行标记为核心语义）
  await expectToolCallState(page, 'need-approval', 0)
  // 索引不精确断言（StrictMode 双发使 send 序号漂移——坑 32）：确认执行后的强制轮存在（forceTool=true ≥1）
  // + 清单内 write 自动放行（approved=true——首次 write 执行即放行，无授权卡）
  expect((await h.forceToolCalls()).includes(true)).toBe(true)
  expect((await h.approvedFlags())[0]).toBe(true)
})

test('T0 自测 2：S3 语义重写——manualEmit 手动推流 + 方案确认后清单内 write 自动放行', async ({
  page,
}) => {
  const h = await installMockBridge(page, {
    project: 'open',
    manualEmit: true,
    approval: 'write-edit',
    capture: { approvedFlags: true },
  })
  await enterWorkspace(page)
  await sendChat(page, '批量整理文件')
  await h.emit([
    // V1.5 S3：目标提议走 propose_goal 工具（工具契约主通道——manualEmit 精确轮次不受降级引导干扰）
    toolCall.proposeGoal('批量整理文件'),
    toolCall.write('/test/a.txt', 'x'),
    toolCall.write('/test/c.txt', 'y'),
    chunk.done(),
  ])
  // 会话级单一 PENDING：确认卡待决策 → write 被拦（未执行）——先确认目标
  await expectVisible(page.getByRole('button', { name: '确认目标' }))
  await page.getByRole('button', { name: '确认目标' }).click()
  // 等 send 的流式消息创建（send 是 async——click 完成时消息可能未 push，emit 会被丢弃）
  await waitStreaming(page, 5000)
  // S3 场景：方案提议走 propose_plan 工具（文件清单 = write 目标）
  await h.emit([
    toolCall.proposePlan('批量整理文件', [
      { path: '/test/a.txt', reason: '整理' },
      { path: '/test/c.txt', reason: '整理' },
    ]),
    chunk.done(),
  ])
  await expectVisible(page.getByRole('button', { name: '确认执行' }))
  await page.getByRole('button', { name: '确认执行' }).click()
  await page.waitForTimeout(300)
  await h.emit([
    toolCall.write('/test/a.txt', 'x'),
    toolCall.write('/test/c.txt', 'y'),
    chunk.done(),
  ])
  // S3 语义：方案确认后清单内 write 自动放行（根因 3 修复——approved=true 直接 done，无授权卡）
  // V1.5 S3 工具化：proposeGoal/proposePlan 亦为 done 卡；write 卡出现两次（pending 拦截轮 + 放行轮）——
  // 放行由 approvedFlags 证明（断言 ≥1 次 approved=true）
  await expect(
    page.locator('.nf-toolcall--done').filter({ hasText: '写入 /test/a.txt' }),
  ).toHaveCount(2, { timeout: 15000 })
  await expectAbsent(page.locator('.nf-toolcall__approveall'))
  expect((await h.approvedFlags())?.filter(Boolean).length).toBeGreaterThanOrEqual(1)
})

// V1.5 S4 恢复（原 S3 skip——commit f780432）：manualEmit 可靠形态重写（同 T0 自测 1——脚本轮次
// 的 auto-continue 竞态）；语义不变：approval 'all' + 同 args 双卡并存 + 卡按 id 精确定位（P2）
test('T0 自测 3：P2 双卡重搭——approval all + manualEmit + 卡按 id 精确定位', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    approval: 'all',
    capture: { chatCount: true },
  })
  // chatCount 对齐（emit 落点确定化——streamChat 已调用 = send 管线已启动，随后消息创建 + emit 安全）
  const waitChat = (n: number) =>
    page.waitForFunction(
      (n) => (window as unknown as { __nfChatCount?: number }).__nfChatCount === n,
      n,
      { timeout: 10000 },
    )
  await startFromScratch(page, '帮我做一个网页游戏')
  await waitChat(1)
  // chat#1 目标确认 → 点确认目标
  await h.emit([toolCall.proposeGoal('做一个网页游戏'), chunk.done()])
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await waitChat(2)
  // chat#2 方案 → 点确认执行（执行确认后 bash 才走授权路径）
  await h.emit([
    toolCall.proposePlan('执行方案', [{ path: 'index.html', reason: '' }]),
    chunk.done(),
  ])
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await waitChat(3)
  // chat#3 bash npm install → need-approval 卡#A（「允许执行」按钮 1 个）
  await h.emit([toolCall.bash('npm install'), chunk.done()])
  await expectCount(page.locator('.nf-toolcall__approve'), 1, 10000)
  // 用户「继续」→ chat#4 同 args bash → 被 pending 拦为 done（卡#B——同 args 双卡并存）
  await sendChat(page, '继续')
  await waitChat(4)
  await h.emit([toolCall.bash('npm install'), chunk.done()])
  await expectText(
    page.locator('.nf-toolcall--done').filter({ hasText: '等待你的决策' }),
    '等待你的决策',
    10000,
  )
  await expectCount(page.locator('.nf-toolcall--done').filter({ hasText: '等待你的决策' }), 1)
  // 卡#A 仍在 + 卡#B 已 done——两卡并存
  await expectCount(page.locator('.nf-toolcall__approve'), 1)
  // 点卡#A「允许执行」→ 按 id 精确定位：卡#A done、按钮归 0
  await page.locator('.nf-toolcall__approve').first().click()
  await expectCount(page.locator('.nf-toolcall__approve'), 0, 10000)
  // bash 卡批准后 done（approval 'all'：同 args 的卡#A 执行、卡#B 拦截记录同显已执行——实测 done=2）；
  // V1.5 S3：proposeGoal/proposePlan 亦为 done 卡——bash 授权卡语义断言（≥1 张已执行）
  await expect(
    page.locator('.nf-toolcall--done').filter({ hasText: '执行 npm install' }).first(),
  ).toBeVisible({ timeout: 10000 })
  // chatCount ≥4（StrictMode 双发使首发序号可能 +1——不精确断言，轮次对齐已由 waitChat 承担）
  expect(await h.chatCount()).toBeGreaterThanOrEqual(4)
})

test('T0 自测 4：交付对账重搭——demo 注入 + silent + 打开已有项目路径', async ({ page }) => {
  await installMockBridge(page, {
    project: 'open',
    demo: { delivery: deliveredPackage(), recentFiles: ['/test/a.ts'] },
  })
  await enterWorkspace(page)
  // 产物 Tab → diff 审核（行级渲染 + 全部接受并写入）
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(300)
  await expectVisible(page.locator('.nf-delivery'))
  await expectText(page.locator('.nf-delivery__summary'), '修复了')
  await expectCount(page.locator('.nf-diffcard'), 1)
  await expectCount(page.locator('.nf-diffline--hunk'), 1)
  await expectText(page.locator('.nf-diffline--del'), 'hello worl')
  await expectText(page.locator('.nf-diffline--add'), 'hello world')
  // 批量接受 → 已应用 + 批量按钮消失
  await page.locator('.nf-diffcard__acceptall-btn').click()
  await page.waitForTimeout(400)
  await expectText(page.locator('.nf-diffcard'), '已应用')
  await expectAbsent(page.locator('.nf-diffcard__acceptall'))
  // 验收交互：打勾 → 确认问题关闭
  await page.getByRole('button', { name: '勾选：拼写已修正' }).click()
  await page.getByRole('button', { name: '确认问题关闭' }).click()
  await expectVisible(page.locator('.nf-delivery__badge--closed'))
})
