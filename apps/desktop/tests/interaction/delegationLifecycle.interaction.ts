// S1b Task 5（stage-spec F1）：委托单中心六件 L3 交互。
// 装配＝installMockBridge 的 extraInit 逃生舱注入领域桥（内存态假数据，不走真 IPC）＋App 挂六件后断言。
// 覆盖：委托单列表／时间线视图／拍板卡（含拒绝理由）／证据打开（EvidenceInspected）／验收与拒绝（拒绝→重开可见）／排队可见。
import { test, expect, type Page } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { expectVisible, expectText, expectCount } from '../helpers/assertions'

// 领域桥假数据（内存态）——注入 window.neonforge 六命名空间，App 启动即取数
// seedExtra：单针覆盖默认表用（在 d 定义之后、domainInit 之前求值；函数不能走 extra——JSON 会吃掉）
const DOMAIN_SEED = (seedExtra = '') => `
window.__domainCalls = []
const d = {
  delegations: [
    { delegationId: 'd1', intent: '把 Stop 做对', state: 'pendingDecision', reopenCount: 0 },
    { delegationId: 'd2', intent: '接真网关', state: 'accepted', reopenCount: 0 },
  ],
  decisions: [
    {
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '高影响清单命中', operation: 'rm -rf build', requestedBy: 'AI 提请' },
    },
  ],
  evidence: [
    { evidenceId: 'e1', type: '变更集', delegationId: 'd1', payloadRef: 'mem://evidence/e1', provenance: '系统采集' },
  ],
  queue: [
    { itemId: 'q1', delegationId: 'd1', inputId: 'in2', origin: 'StartTurn 忙转投' },
  ],
  scopeVersions: [{ seq: 1, entries: [{ kind: '仓库', pattern: 'src/**' }], amendmentRef: null }],
  timeline: {
    d1: [
      { seq: 1, ts: '2026-10-05T00:00:00Z', type: 'DelegationCreated', delegationId: 'd1', detail: {} },
      { seq: 2, ts: '2026-10-05T00:00:01Z', type: 'TurnStarted', delegationId: 'd1', detail: {} },
      {
        seq: 3,
        ts: '2026-10-05T00:00:02Z',
        type: 'DecisionRaised',
        delegationId: 'd1',
        detail: {
          decisionPointId: 'dp1',
          delegationId: 'd1',
          turnId: 't1',
          requestReason: { reason: '高影响清单命中', operation: 'rm -rf build', requestedBy: 'AI 提请' },
        },
      },
    ],
  },
}
${seedExtra}
// 认领 patch：mockBridge 的 extraInit 排在 neonforge 赋值之前——须等就绪再补。
// 用 defineProperty 拦截 neonforge 赋值，一旦建立立即把六命名空间挂上（早于 React 首帧取数）。
const domainInit = (nf) => {
nf.delegation = {
  list: async () => { window.__domainCalls.push('delegation:list'); return d.delegations.slice() },
  create: async () => { window.__domainCalls.push('delegation:create'); return { delegationId: 'new', state: 'created' } },
  accept: async (id) => { window.__domainCalls.push('delegation:accept:' + id); return { delegationId: id, state: 'accepted', reopenCount: 0 } },
  reject: async (id) => {
    window.__domainCalls.push('delegation:reject:' + id)
    d.delegations = d.delegations.map((x) => x.delegationId === id ? { ...x, state: 'reopened', reopenCount: x.reopenCount + 1 } : x)
    return { delegationId: id, state: 'reopened', reopenCount: 1 }
  },
}
nf.turn = { start: async () => { window.__domainCalls.push('turn:start'); return { into: 'turn', turnId: 't9' } } }
nf.decision = {
  raise: async () => ({ decisionPointId: 'dp9', open: true }),
  resolve: async (a) => { window.__domainCalls.push('decision:resolve:' + a.decisionPointId + ':' + a.value + (a.reason ? ':' + a.reason : '')); return { resolved: a.value } },
}
nf.evidence = {
  listByDelegation: async (id) => { window.__domainCalls.push('evidence:list:' + id); return d.evidence.slice() },
  inspect: async (id) => { window.__domainCalls.push('evidence:inspect:' + id); return { firstInspection: true } },
}
nf.queue = { pending: async () => { window.__domainCalls.push('queue:pending'); return d.queue.slice() } }
nf.scope = {
  chain: async () => { window.__domainCalls.push('scope:chain'); return d.scopeVersions || [] },
  amend: async (a) => { window.__domainCalls.push('scope:amend'); return d.amendResult || { rejected: true, why: '夹具默认拒' } },
}
nf.timeline = {
  queryByDelegation: async (id) => { window.__domainCalls.push('timeline:query:' + id); return (d.timeline[id] || []).slice() },
  subscribe: async () => ({ subscribed: true }),
  onEvent: () => () => {},
}
}
// neonforge 赋值前后都可能被读：先试直挂，未就绪则用 setter 拦截。
if (window.neonforge) domainInit(window.neonforge)
else {
  let _nf
  Object.defineProperty(window, 'neonforge', {
    configurable: true,
    get: () => _nf,
    set: (v) => { _nf = v; domainInit(v) },
  })
}
`

async function boot(page: Page, seedExtra = '') {
  await installMockBridge(page, { project: 'open', extraInit: DOMAIN_SEED(seedExtra) })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}

test('F1-1：委托单列表渲染全部在案委托', async ({ page }) => {
  await boot(page)
  await expectText(page.locator('.nf-delegationlist'), '把 Stop 做对', 8000)
  await expectText(page.locator('.nf-delegationlist'), '接真网关', 8000)
  await expectCount(page.locator('.nf-delegationlist__item'), 2)
})

test('F1-2：时间线视图渲染该委托事件序列', async ({ page }) => {
  await boot(page)
  await expectText(page.locator('.nf-timelineview'), 'DelegationCreated', 8000)
  await expectText(page.locator('.nf-timelineview'), 'DecisionRaised', 8000)
  await expectCount(page.locator('.nf-timelineview__row'), 3)
})

test('F1-3：拍板卡渲染待决决策点＋拒绝理由输入', async ({ page }) => {
  await boot(page)
  await expectText(page.locator('.nf-decisioncard'), 'rm -rf build', 8000)
  await expectVisible(page.locator('.nf-decisioncard__reason'), 8000)
})

test('F1-4：拍板卡拒绝——理由随 decision:resolve 送出', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-decisioncard__reason').fill('不许删')
  await page.locator('.nf-decisioncard__btn--no').click()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls).toContain('decision:resolve:dp1:拒绝:不许删')
})

test('F1-5：证据打开——触发 evidence:inspect', async ({ page }) => {
  await boot(page)
  await expectText(page.locator('.nf-evidencelist'), 'e1', 8000)
  await page.getByRole('button', { name: '打开' }).click()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls).toContain('evidence:inspect:e1')
})

test('F1-6：验收与拒绝按钮——拒绝后原单重开可见', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-acceptrejectbar__reject').click()
  await expectText(page.locator('.nf-delegationlist'), 'reopened', 8000)
})

test('F1-7：排队可见——待处理项有位置', async ({ page }) => {
  await boot(page)
  await expectText(page.locator('.nf-queuelist'), 'q1', 8000)
  await expectText(page.locator('.nf-queuelist'), '忙转投', 8000)
})

test('F1-8：验收按钮——触发 delegation:accept', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-acceptrejectbar__accept').click()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls.some((c) => c.startsWith('delegation:accept'))).toBe(true)
})

test('E3-1：修正后当前版本可读、旧版本只读可溯，且未持久化提示仍在', async ({ page }) => {
  await boot(
    page,
    `d.scopeVersions = [
  { seq: 1, entries: [{ kind: '仓库', pattern: 'src/**' }], amendmentRef: null },
  { seq: 2, entries: [{ kind: '目录', pattern: 'docs/**' }], amendmentRef: 'dp9' },
]`,
  )
  const current = page.locator('[data-testid="nf-scope-current"]')
  await expectText(current, 'docs/**', 8000)

  const history = page.locator('[data-testid="nf-scope-history"]')
  await expectText(history.locator('.nf-scope-history__item').first(), '1', 8000)
  await expectText(history.locator('.nf-scope-history__item').first(), '首版本', 8000)
  await expectCount(history.locator('button'), 0)

  await expectText(page.locator('.nf-unpersisted'), '未持久化', 8000)
})

// ── 码审 CR6 采纳针：两步流的呈现闸门此前无任何测试 ──
// 变异实测（审查者与我各自复现同果）＝摘掉 ScopePanel 的 `!approved` 判据后，17 条单测＋18 条 L3 全绿。
// 承的是契约件 A5（批准本身不自额推进版本）与 E2 后半句（版本随「批准 ∧ 用户提交修正」推进）。
// 时间线必须带 turnId：否则面板走「无在飞轮」blocked 支，闸门根本到不了＝测的就不是这件事。
const TL_NO_APPROVAL = `d.timeline.d1 = [
  { seq: 1, ts: 'x', type: 'DelegationCreated', delegationId: 'd1', detail: {} },
  { seq: 2, ts: 'x', type: 'TurnStarted', delegationId: 'd1', detail: { turnId: 't1' } },
]`
const TL_APPROVED = `d.timeline.d1 = [
  { seq: 1, ts: 'x', type: 'DelegationCreated', delegationId: 'd1', detail: {} },
  { seq: 2, ts: 'x', type: 'TurnStarted', delegationId: 'd1', detail: { turnId: 't1' } },
  { seq: 3, ts: 'x', type: 'DecisionRaised', delegationId: 'd1', detail: {
    decisionPointId: 'dp9', delegationId: 'd1', turnId: 't1',
    requestReason: { reason: '作用域修正', operation: '扩到 docs', requestedBy: '用户提请' },
  } },
  { seq: 4, ts: 'x', type: 'DecisionResolved', delegationId: 'd1', detail: {
    decisionPointId: 'dp9', resolution: '批准',
  } },
]
d.amendResult = { version: 2 }`

test('E3-2：提请后未获批准 ⇒「提交修正」始终 disabled（案 A 第二步不许跳过）', async ({ page }) => {
  await boot(page, TL_NO_APPROVAL)
  const amend = page.locator('[data-testid="nf-scope-amend"]')
  await expectText(page.locator('[data-testid="nf-scope-raise"]'), '提出修正', 8000)
  await expect(amend).toBeDisabled()
  await page.locator('[data-testid="nf-scope-entries"]').fill('仓库\tdocs/**')
  await expect(amend).toBeDisabled()
  await page.locator('[data-testid="nf-scope-raise"]').click()
  await expect(amend).toBeDisabled()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls).not.toContain('scope:amend')
})

test('E3-3：批准决议在场时提交 ⇒ 走 scope:amend 并呈现版本推进（两步流走通）', async ({ page }) => {
  await boot(page, TL_APPROVED)
  await page.locator('[data-testid="nf-scope-entries"]').fill('仓库\tdocs/**')
  await page.locator('[data-testid="nf-scope-raise"]').click()
  const amend = page.locator('[data-testid="nf-scope-amend"]')
  await expect(amend).toBeEnabled()
  await amend.click()
  await expectText(page.locator('.nf-scopepanel__advanced'), '版本已推进至', 8000)
  await expectCount(page.locator('[data-testid="nf-scope-rejected"]'), 0)
})
