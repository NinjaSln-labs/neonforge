// 2026-11-25 审计批次 13：渲染层 tlog 事件载荷补课（覆盖矩阵缺口清单余项中的 L3 可断言集）
// 范围：tool.requested / tool.executed / tool.failed / capability.checked / problem.rerun。
// 不在本批：usage.recorded/budget_threshold_reached（main 入账路径，需 Electron 主进程 harness）、
// capability.ledger_updated（main tools.ts 侧）、stuck.needs_human（6 轮升级时序——决策逻辑在
// agentLoop L1 覆盖，L3 时序未建）、execution.force_input/forced/released/proposal.*/message_sent
// （并入既有 taskBoundary / queue / factory.self 流程断言）。
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { startFromScratch, sendChat } from './scenarios'

test('渲染层工具事件载荷：tool.requested / capability.checked / tool.executed / tool.failed', async ({
  page,
}) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
    // read 执行失败 → 渲染层 tool.failed（mock execute 覆盖——非授权拦截路径）；
    // check-capability 成功 → capability.checked（且必须恰好一次——见下方 StrictMode 回归断言）
    executeResults: { read: { ok: false, error: 'boom' } },
    extraInit: `
      window.__nfToolTlog = [];
      bridge.timeline = { log: async (e) => {
        if (e && ['tool.requested', 'tool.executed', 'tool.failed', 'capability.checked'].includes(e.type)) {
          window.__nfToolTlog.push(e);
        }
      } };
    `,
  })
  await startFromScratch(page)
  await sendChat(page, '检查环境能力')
  // 等 send 的流式消息创建后再 emit（updater 只写 streaming 消息——坑 32/112 同一约定）
  await expect(page.locator('.nf-msg__body--thinking').first()).toBeVisible({ timeout: 10000 })
  await h.emit([toolCall.checkCapability(), toolCall.read('/test/boom.ts'), chunk.done()])

  // 两个工具调用各自异步执行、各自在 .then 里打点——只等 tool.failed 会在 capability.checked
  // 尚未落地时读取快照（CI 慢机上更易命中）。等三类事件都到齐再统计。
  await expect
    .poll(
      async () =>
        ((await h.readCapture<Array<{ type: string }>>('__nfToolTlog')) ?? []).filter((e) =>
          ['capability.checked', 'tool.executed', 'tool.failed'].includes(e.type),
        ).length,
      { timeout: 10000 },
    )
    .toBe(3)

  const evts =
    (await h.readCapture<Array<{ type: string; detail?: Record<string, unknown> }>>(
      '__nfToolTlog',
    )) ?? []
  // tool.requested：chunk 到达即打点，args 为原始参数（名称与顺序与流一致）
  const requested = evts.filter((e) => e.type === 'tool.requested')
  expect(requested.map((e) => e.detail?.name)).toEqual(['check-capability', 'read'])
  expect(requested[0]?.detail?.args).toEqual({ dir: '/test' })
  expect(requested[1]?.detail?.args).toEqual({ path: '/test/boom.ts' })
  // check-capability 执行成功 → tool.executed（needApproval/error 缺省——成功路径载荷只剩 name）
  const executed = evts.filter((e) => e.type === 'tool.executed')
  expect(executed.map((e) => e.detail?.name)).toEqual(['check-capability'])
  // 能力检测结果打点：mock 默认空能力表 + 无缺失（missing=false → 工具卡隐藏）。
  // StrictMode 回归：打点曾写在 setMessages updater 内 → React 开发构建双调 updater → 事件双发
  // （1 次 execute / 2 次 capability.checked）。此处断言恰好 1 条。
  const cap = evts.filter((e) => e.type === 'capability.checked')
  expect(cap).toHaveLength(1)
  expect(cap[0]?.detail).toEqual({ capabilities: [], missing: false })
  // execute 失败 → tool.failed 携带 name + error（诊断可回放）
  const failed = evts.find((e) => e.type === 'tool.failed')
  expect(failed?.detail).toMatchObject({ name: 'read', error: 'boom' })
})

test('问题台账复跑载荷：同标题再次发送 → problem.rerun（复用 problemId——不新增台账）', async ({
  page,
}) => {
  const h = await installMockBridge(page, {
    project: 'none',
    script: [
      [chunk.content('好的。'), chunk.done()],
      [chunk.content('继续做。'), chunk.done()],
    ],
    extraInit: `
      window.__nfProblemTlog = [];
      bridge.timeline = { log: async (e) => {
        if (e && ['problem.created', 'problem.rerun'].includes(e.type)) window.__nfProblemTlog.push(e);
      } };
    `,
  })
  await startFromScratch(page, '做个待办应用')
  await expect
    .poll(
      async () =>
        ((await h.readCapture<Array<{ type: string }>>('__nfProblemTlog')) ?? []).filter(
          (e) => e.type === 'problem.created',
        ).length,
      { timeout: 10000 },
    )
    .toBe(1)
  // 等 React 提交台账状态（handleUserMessage 的 problems 闭包需含首条——否则同标题被判新问题）
  await page.waitForTimeout(400)
  await sendChat(page, '做个待办应用')
  await expect
    .poll(
      async () =>
        ((await h.readCapture<Array<{ type: string }>>('__nfProblemTlog')) ?? []).filter(
          (e) => e.type === 'problem.rerun',
        ).length,
      { timeout: 10000 },
    )
    .toBe(1)

  const evts =
    (await h.readCapture<Array<{ type: string; detail?: Record<string, unknown> }>>(
      '__nfProblemTlog',
    )) ?? []
  const created = evts.find((e) => e.type === 'problem.created')
  expect(created?.detail).toMatchObject({ title: '做个待办应用' })
  expect(typeof created?.detail?.problemId).toBe('string')
  // 复跑事件载荷与创建同构（problemId 复用 + title 原文）——台账不新增、快照保留
  const rerun = evts.find((e) => e.type === 'problem.rerun')
  expect(rerun?.detail).toEqual({
    problemId: created?.detail?.problemId,
    title: '做个待办应用',
  })
})
