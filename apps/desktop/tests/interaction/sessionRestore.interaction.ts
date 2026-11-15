import { test, expect } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { gotoStart } from './scenarios'

// ADR-013（GitHub #11）：任务状态机跨重启——V2 会话快照里的 task 恢复 pending/确认位/决策内容。
// 消息为空、仅任务快照的极端形态：plan 确认卡必须从快照重建（证明不再依赖消息里的旧 decisionContent）。
test('ADR-013：重启恢复任务快照——pending 方案卡与决策内容来自快照', async ({ page }) => {
  await installMockBridge(page, { project: 'open' })
  await page.addInitScript(() => {
    const plan = {
      summary: '恢复后的方案（来自任务快照）',
      files: [{ path: '/test/restored.html', reason: '重启恢复验证' }],
      assumptions: ['原生 HTML'],
      verificationPlan: ['打开 restored.html'],
    }
    const task = {
      version: 1,
      goalConfirmed: true,
      planConfirmed: false,
      resolutionConfirmed: false,
      pending: 'plan',
      plannedFiles: [],
      producedFiles: [],
      filesApproved: false,
      lastToolFailed: false,
      decisionContent: {
        kind: 'plan',
        since: '2026-11-15T00:00:00.000Z',
        proposal: plan,
      },
      deniedApprovals: [],
      rejectStreak: 0,
      pendingRepeatCount: 0,
      unresolvedTextReplies: 0,
    }
    localStorage.setItem(
      'nf-session',
      JSON.stringify({
        version: 2,
        messages: [
          {
            role: 'assistant',
            content: '执行方案已提交——等待用户确认',
            status: 'done',
            id: 'restored-1',
          },
        ],
        task,
      }),
    )
  })
  await gotoStart(page)
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.nf-confirmcard').filter({ hasText: '重启恢复验证' })).toBeVisible()
  // 应用自身的 V2 持久化路径：确认方案后任务快照必须写回 nf-session（而不只是恢复种子）
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('nf-session')
          if (!raw) return null
          const parsed = JSON.parse(raw) as { task?: { planConfirmed?: boolean } }
          return parsed.task?.planConfirmed ?? null
        }),
      { timeout: 10000 },
    )
    .toBe(true)
})

test('ADR-013：恢复 planConfirmed 同步 main 硬序镜像；启动恢复不伪造决策事件', async ({ page }) => {
  const handle = await installMockBridge(page, {
    project: 'open',
    capture: { planConfirmedCalls: true },
    extraInit: `window.__nfTimeline = []; bridge.timeline = { log: async (e) => { window.__nfTimeline.push(e) } }`,
  })
  await page.addInitScript(() => {
    const task = {
      version: 1,
      goalConfirmed: true,
      planConfirmed: true,
      resolutionConfirmed: false,
      pending: 'none',
      plannedFiles: [],
      producedFiles: [],
      filesApproved: false,
      lastToolFailed: false,
      deniedApprovals: [],
      rejectStreak: 0,
      pendingRepeatCount: 0,
      unresolvedTextReplies: 0,
    }
    localStorage.setItem(
      'nf-session',
      JSON.stringify({
        version: 2,
        messages: [{ role: 'assistant', content: '方案已确认', status: 'done', id: 'restored-2' }],
        task,
      }),
    )
  })
  await gotoStart(page)
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect.poll(() => handle.planConfirmedCalls(), { timeout: 10000 }).toContain(true)
  const timeline = await handle.readCapture<Array<{ type: string }>>('__nfTimeline')
  expect(
    (timeline ?? []).filter(
      (e) => e.type.startsWith('decision.') || e.type.startsWith('session.pending_'),
    ),
  ).toEqual([])
})

test('ADR-013：待授权工具卡跨重启保留，不伪造批准事件', async ({ page }) => {
  const handle = await installMockBridge(page, {
    project: 'open',
    extraInit: `window.__nfTimeline = []; bridge.timeline = { log: async (e) => { window.__nfTimeline.push(e) } }`,
  })
  await page.addInitScript(() => {
    const task = {
      version: 1,
      goalConfirmed: true,
      planConfirmed: true,
      resolutionConfirmed: false,
      pending: 'approval',
      plannedFiles: [],
      producedFiles: [],
      filesApproved: false,
      lastToolFailed: false,
      deniedApprovals: [],
      rejectStreak: 0,
      pendingRepeatCount: 0,
      unresolvedTextReplies: 0,
    }
    localStorage.setItem(
      'nf-session',
      JSON.stringify({
        version: 2,
        messages: [
          {
            role: 'assistant',
            content: '需要你批准后继续',
            status: 'done',
            id: 'restored-3',
            toolCalls: [
              {
                id: 'call-restored',
                name: 'bash',
                args: { command: 'npm install' },
                status: 'need-approval',
              },
            ],
          },
        ],
        task,
      }),
    )
  })
  await gotoStart(page)
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.getByRole('button', { name: '允许执行' })).toBeVisible({ timeout: 10000 })
  await expect(
    page.locator('.nf-toolcall__approve-hint').filter({ hasText: '需要你批准' }),
  ).toBeVisible()
  const timeline = await handle.readCapture<Array<{ type: string }>>('__nfTimeline')
  expect(
    (timeline ?? []).filter(
      (e) => e.type.startsWith('decision.') || e.type.startsWith('session.pending_'),
    ),
  ).toEqual([])
})
