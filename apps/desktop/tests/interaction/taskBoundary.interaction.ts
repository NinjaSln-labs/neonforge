// 2026-11-17 审查修复回归：新任务边界重置 + 会话 ID 跨重启保留
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk } from './mockBridge'
import { enterWorkspace, sendChat, startFromScratch } from './scenarios'

test('新任务：清空目标/方案确认位与主进程计划门，重新弹确认卡', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    capture: { planConfirmedCalls: true },
    extraInit: `
      window.__nfCreated = [];
      window.__nfCards = [];
      window.__nfBoundary = [];
      bridge.timeline = { log: async (e) => {
        if (e && e.type === 'conversation.created') window.__nfCreated.push(e);
        if (e && (e.type === 'card.resolved' || e.type === 'card.rejected')) window.__nfCards.push(e);
        if (e && ['problem.created', 'problem.snapshot_updated', 'environment.injected',
                    'conversation.assistant_start', 'conversation.assistant_done',
                    'conversation.status_change', 'conversation.message_sent',
                    'execution.force_input', 'execution.forced', 'execution.released',
                    'proposal.goal', 'proposal.plan'].includes(e.type)) {
          window.__nfBoundary.push(e);
        }
      } };
    `,
  })
  await startFromScratch(page)
  await sendChat(page, '做个待办应用')
  await h.emit([chunk.tool('propose_goal', { statement: '做一个待办应用' }), chunk.done()])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(
    page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: '搭档处理中' }),
  ).toBeVisible({ timeout: 5000 })
  await h.emit([
    chunk.tool('propose_plan', {
      summary: '单页方案',
      files: [{ path: '/test/app.ts', reason: '入口' }],
    }),
    chunk.done(),
  ])
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  await page.waitForTimeout(300)

  // 新问题 = 新任务边界（原实现只换 sessionId/清消息，确认位与主进程计划清单残留）
  await page.getByRole('button', { name: '新问题' }).click()
  await expect.poll(async () => (await h.planConfirmedCalls()).at(-1)).toBe(false)

  await sendChat(page, '换一个新目标')
  await h.emit([chunk.tool('propose_goal', { statement: '换一个新目标' }), chunk.done()])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(
    page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: '搭档处理中' }),
  ).toBeVisible({ timeout: 5000 })
  await h.emit([
    chunk.tool('propose_plan', {
      summary: '新方案',
      files: [{ path: '/test/new.ts', reason: '入口' }],
    }),
    chunk.done(),
  ])
  // 方案确认位已复位 → 新方案卡必须重新出现
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })

  // 2026-11-25 事件语义补课：conversation.created 携带会话 id（两次新问题 → 两个不同会话），
  // card.resolved 携带卡类型 + action（目标/方案确认的 UI 生命周期可回放）。
  const created =
    (await h.readCapture<Array<{ detail?: { session?: string } }>>('__nfCreated')) ?? []
  expect(created.length).toBeGreaterThanOrEqual(2)
  expect(created.every((e) => typeof e.detail?.session === 'string')).toBe(true)
  expect(new Set(created.map((e) => e.detail?.session)).size).toBeGreaterThanOrEqual(2)
  const cards =
    (await h.readCapture<Array<{ detail?: { card?: string; action?: string } }>>('__nfCards')) ?? []
  expect(cards.some((e) => e.detail?.card === 'goal' && e.detail?.action === 'confirm')).toBe(true)
  expect(cards.some((e) => e.detail?.card === 'execution' && e.detail?.action === 'confirm')).toBe(
    true,
  )
  // 2026-11-25 事件语义补课：任务边界事件载荷——problem.created（problemId/title 与用户首条消息
  // 一致）、assistant_start（forceTool/mode 可回放）、assistant_done（content）；environment.injected
  // 在 mock 的 check-capability 返回空数据时仍会发出（runtime 缺省被序列化丢弃——只校验根路径与能力表）
  const boundary =
    (await h.readCapture<Array<{ type: string; detail?: Record<string, unknown> }>>(
      '__nfBoundary',
    )) ?? []
  const createdProblem = boundary.find((e) => e.type === 'problem.created')
  expect(createdProblem?.detail).toMatchObject({ title: '做个待办应用' })
  expect(typeof createdProblem?.detail?.problemId).toBe('string')
  const starts = boundary.filter((e) => e.type === 'conversation.assistant_start')
  expect(starts.length).toBeGreaterThanOrEqual(1)
  expect(starts.every((e) => typeof e.detail?.forceTool === 'boolean')).toBe(true)
  expect(starts.every((e) => typeof e.detail?.progressMode === 'string')).toBe(true)
  const done = boundary.find((e) => e.type === 'conversation.assistant_done')
  expect(typeof done?.detail?.content).toBe('string')
  const env = boundary.find((e) => e.type === 'environment.injected')
  if (env) {
    expect(typeof env.detail?.rootPath).toBe('string')
    expect(Array.isArray(env.detail?.caps)).toBe(true)
  }
  // conversation.status_change：working/ready 状态切换载荷（值域三态）
  const statuses = boundary.filter((e) => e.type === 'conversation.status_change')
  expect(statuses.length).toBeGreaterThanOrEqual(1)
  expect(
    statuses.every((e) =>
      ['working', 'approval-pending', 'ready'].includes(String(e.detail?.status)),
    ),
  ).toBe(true)
  // 2026-11-25 事件语义补课（批次 13）：提议/推进/消息事件产线载荷——
  // proposal.goal（statement；无假设时 assumptions 键不上报）、proposal.plan（ok+summary+files 路径清单）、
  // execution.forced/released（mode/reason 可回放）、execution.force_input（planned/produced/projectFiles
  // 三集合快照 + goalAchieved）、conversation.message_sent（用户原文，按钮确认文本亦为一次 send）、
  // problem.snapshot_updated（目标确认回写台账——field=goal）
  const goalProps = boundary.filter((e) => e.type === 'proposal.goal')
  expect(goalProps.map((e) => e.detail?.statement)).toEqual(['做一个待办应用', '换一个新目标'])
  expect(goalProps.every((e) => !('assumptions' in (e.detail ?? {})))).toBe(true)
  const planProps = boundary.filter((e) => e.type === 'proposal.plan')
  expect(planProps.map((e) => e.detail?.summary)).toEqual(['单页方案', '新方案'])
  expect(planProps.map((e) => e.detail?.files)).toEqual([['/test/app.ts'], ['/test/new.ts']])
  expect(planProps.every((e) => e.detail?.ok === true)).toBe(true)
  const textMsgs = boundary.filter((e) => e.type === 'conversation.message_sent')
  expect(textMsgs.every((e) => typeof e.detail?.content === 'string')).toBe(true)
  expect(textMsgs.some((e) => e.detail?.content === '做个待办应用')).toBe(true)
  expect(textMsgs.some((e) => e.detail?.content === '换一个新目标')).toBe(true)
  expect(textMsgs.some((e) => e.detail?.content === '确认，目标清楚了')).toBe(true)
  expect(textMsgs.some((e) => e.detail?.content === '确认，按方案执行')).toBe(true)
  const forceInputs = boundary.filter((e) => e.type === 'execution.force_input')
  expect(forceInputs.length).toBeGreaterThanOrEqual(1)
  expect(
    forceInputs.every(
      (e) =>
        Array.isArray(e.detail?.planned) &&
        Array.isArray(e.detail?.produced) &&
        Array.isArray(e.detail?.projectFiles) &&
        typeof e.detail?.goalAchieved === 'boolean',
    ),
  ).toBe(true)
  const guarantees = boundary.filter(
    (e) => e.type === 'execution.forced' || e.type === 'execution.released',
  )
  expect(guarantees.length).toBeGreaterThanOrEqual(1)
  expect(
    guarantees.every((e) =>
      ['require-action', 'require-advance', 'auto'].includes(String(e.detail?.mode)),
    ),
  ).toBe(true)
  expect(guarantees.every((e) => typeof e.detail?.reason === 'string')).toBe(true)
  const goalSnapshots = boundary.filter((e) => e.type === 'problem.snapshot_updated')
  expect(
    goalSnapshots.some(
      (e) => e.detail?.field === 'goal' && typeof e.detail?.problemId === 'string',
    ),
  ).toBe(true)
})

test('会话 ID 跨重启保留（queue/acceptance/changeset 记录可再定位）', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'open',
    manualEmit: true,
    extraInit: `
      window.__nfTimeline = [];
      bridge.timeline = { log: async (e) => { window.__nfTimeline.push(e) } };
    `,
  })
  await enterWorkspace(page)
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('nf-session-id:/test')))
    .toBeTruthy()
  const sid = await page.evaluate(() => localStorage.getItem('nf-session-id:/test'))
  expect(sid).toBeTruthy()

  await page.reload()
  await enterWorkspace(page)
  await sendChat(page, '重启后继续')
  await h.emit([chunk.content('ok'), chunk.done()])
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const list = (window as unknown as { __nfTimeline?: Array<{ session?: string }> })
          .__nfTimeline
        return list?.some((e) => e.session === localStorage.getItem('nf-session-id:/test')) ?? false
      }),
    )
    .toBe(true)
  const events = await page.evaluate(() => {
    const list = (window as unknown as { __nfTimeline?: Array<{ session?: string }> }).__nfTimeline
    return list ?? []
  })
  expect(events.some((e) => e.session === sid)).toBe(true)
})
