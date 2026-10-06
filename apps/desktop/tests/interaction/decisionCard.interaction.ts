// S1b Task 7（stage-spec C6）：拍板卡不可绕过——决策点在场时，除 decision:resolve 外无其他推进出口。
// 断言口径＝点遍非 resolve 控件，__domainCalls 里不出现任何写命令（accept/reject/raise/turn）；且决策卡不含执行按钮。
// S2b Task 7（契约件 E1/E2 呈现面）：E1 缘由三值 → data-cause；E2 决议留痕三值 → nf-decision-resolved（无理由不占位）。
import { test, expect, type Page } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { expectVisible, expectAbsent, expectText, expectCount } from '../helpers/assertions'

const SEED = `
window.__domainCalls = []
const d = {
  delegations: [{ delegationId: 'd1', intent: '高危操作', state: 'pendingDecision', reopenCount: 0 }],
  timeline: {
    d1: [
      { seq: 1, ts: '', type: 'DelegationCreated', delegationId: 'd1', detail: {} },
      { seq: 2, ts: '', type: 'DecisionRaised', delegationId: 'd1', detail: {
        decisionPointId: 'dp1', delegationId: 'd1', turnId: 't1',
        requestReason: { reason: '高影响清单命中', operation: 'rm -rf build', requestedBy: 'AI 提请' },
      } },
    ],
  },
}
const domainInit = (nf) => {
  nf.delegation = {
    list: async () => d.delegations.slice(),
    accept: async (id) => { window.__domainCalls.push('WRITE:accept'); return {} },
    reject: async (id) => { window.__domainCalls.push('WRITE:reject'); return {} },
    create: async () => ({}),
  }
  nf.turn = { start: async () => { window.__domainCalls.push('WRITE:turn'); return { into: 'turn', turnId: 't' } } }
  nf.decision = {
    raise: async () => { window.__domainCalls.push('WRITE:raise'); return {} },
    resolve: async (a) => { window.__domainCalls.push('resolve:' + a.decisionPointId + ':' + a.value); return {} },
  }
  nf.evidence = { listByDelegation: async () => [], inspect: async () => ({}) }
  nf.queue = { pending: async () => [] }
  nf.timeline = { queryByDelegation: async (id) => (d.timeline[id] || []).slice(), subscribe: async () => ({}), onEvent: () => () => {} }
}
if (window.neonforge) domainInit(window.neonforge)
else { let _nf; Object.defineProperty(window, 'neonforge', { configurable: true, get: () => _nf, set: (v) => { _nf = v; domainInit(v) } }) }
`

async function boot(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}

test('C6-1：决策点在场 ⇒ 拍板卡渲染且无执行按钮（不可绕过）', async ({ page }) => {
  await boot(page)
  await expectVisible(page.locator('.nf-decisioncard__btn--ok'), 8000)
  // 决策卡内不得出现任何「执行/继续」类推进按钮（唯一出口是批准/拒绝）
  await expectAbsent(page.locator('.nf-decisioncard .nf-execute'))
})

test('C6-2：未 resolve 前点非拍板控件 ⇒ 不推进决策点（无旁路）', async ({ page }) => {
  await boot(page)
  // 点遍所有可见按钮，唯独不点拍板卡的批准/拒绝（AcceptRejectBar 的验收/拒绝验收是另一条合法收尾面，不算旁路决策）
  const buttons = page.locator('button')
  const n = await buttons.count()
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i)
    const cls = (await b.getAttribute('class')) || ''
    if (cls.includes('nf-decisioncard__btn')) continue
    await b.click({ timeout: 2000 }).catch(() => {})
  }
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  // 决策点推进路径＝resolve/raise/turn：三者皆不得被旁路触发
  expect(
    calls.filter((c) => c.startsWith('resolve:') || c === 'WRITE:raise' || c === 'WRITE:turn'),
  ).toEqual([])
})

test('C6-3：批准经 decision:resolve 单一出口（不产生其他写）', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-decisioncard__btn--ok').click()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls).toContain('resolve:dp1:批准')
  expect(calls.filter((c) => c.startsWith('WRITE:'))).toEqual([])
})

// ── S2b Task 7：E1 缘由三值 ＋ E2 决议留痕三值（六条各自 SEED＋boot，不动上方 C6 的 SEED/boot）──
// seedWith 只拼时间线数组；桥面（delegation/turn/decision/evidence/queue/timeline stub）与 C6 SEED 逐字一致。
const seedWith = (rows: string) => `
window.__domainCalls = []
const d = {
  delegations: [{ delegationId: 'd1', intent: '高危操作', state: 'pendingDecision', reopenCount: 0 }],
  timeline: {
    d1: [
      { seq: 1, ts: '', type: 'DelegationCreated', delegationId: 'd1', detail: {} },
${rows}
    ],
  },
}
const domainInit = (nf) => {
  nf.delegation = {
    list: async () => d.delegations.slice(),
    accept: async (id) => { window.__domainCalls.push('WRITE:accept'); return {} },
    reject: async (id) => { window.__domainCalls.push('WRITE:reject'); return {} },
    create: async () => ({}),
  }
  nf.turn = { start: async () => { window.__domainCalls.push('WRITE:turn'); return { into: 'turn', turnId: 't' } } }
  nf.decision = {
    raise: async () => { window.__domainCalls.push('WRITE:raise'); return {} },
    resolve: async (a) => { window.__domainCalls.push('resolve:' + a.decisionPointId + ':' + a.value); return {} },
  }
  nf.evidence = { listByDelegation: async () => [], inspect: async () => ({}) }
  nf.queue = { pending: async () => [] }
  nf.timeline = { queryByDelegation: async (id) => (d.timeline[id] || []).slice(), subscribe: async () => ({}), onEvent: () => () => {} }
}
if (window.neonforge) domainInit(window.neonforge)
else { let _nf; Object.defineProperty(window, 'neonforge', { configurable: true, get: () => _nf, set: (v) => { _nf = v; domainInit(v) } }) }
`

const raisedRow = (
  reason: string,
) => `      { seq: 2, ts: '', type: 'DecisionRaised', delegationId: 'd1', detail: {
        decisionPointId: 'dp1', delegationId: 'd1', turnId: 't1',
        requestReason: { reason: '${reason}', operation: 'rm -rf build', requestedBy: 'AI 提请' },
      } },`

const SEED_E1_1 = seedWith(raisedRow('作用域外'))
const SEED_E1_2 = seedWith(raisedRow('高影响清单命中'))
const SEED_E1_3 = seedWith(raisedRow('作用域修正'))
const SEED_E2_1 = seedWith(`${raisedRow('高影响清单命中')}
      { seq: 3, ts: '', type: 'DecisionResolved', delegationId: 'd1', detail: {
        decisionPointId: 'dp1', delegationId: 'd1', resolution: '批准',
      } },`)
const SEED_E2_2 = seedWith(`${raisedRow('高影响清单命中')}
      { seq: 3, ts: '', type: 'DecisionDenied', delegationId: 'd1', detail: {
        decisionPointId: 'dp1', delegationId: 'd1', reason: '证据不足，先补测试再动',
      } },`)
const SEED_E2_3 = seedWith(`${raisedRow('作用域修正')}
      { seq: 3, ts: '', type: 'DecisionResolved', delegationId: 'd1', detail: {
        decisionPointId: 'dp1', delegationId: 'd1', resolution: '选项',
      } },`)

async function bootE1_1(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E1_1 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}
async function bootE1_2(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E1_2 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}
async function bootE1_3(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E1_3 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}
async function bootE2_1(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E2_1 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}
async function bootE2_2(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E2_2 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}
async function bootE2_3(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED_E2_3 })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}

test('E1-1：缘由＝作用域外 ⇒ 卡片带 data-cause="作用域外" 可见', async ({ page }) => {
  await bootE1_1(page)
  await expectVisible(page.locator('[data-cause="作用域外"]'), 8000)
})

test('E1-2：缘由＝高影响清单命中 ⇒ 卡片带 data-cause="高影响清单命中" 可见', async ({ page }) => {
  await bootE1_2(page)
  await expectVisible(page.locator('[data-cause="高影响清单命中"]'), 8000)
})

test('E1-3：缘由＝作用域修正 ⇒ 卡片带 data-cause="作用域修正" 可见', async ({ page }) => {
  await bootE1_3(page)
  await expectVisible(page.locator('[data-cause="作用域修正"]'), 8000)
})

test('E2-1：决议＝批准 ⇒ 留痕行呈「决议：批准」且无理由占位', async ({ page }) => {
  await bootE2_1(page)
  const trail = page.locator('[data-testid="nf-decision-resolved"]')
  await expectVisible(trail, 8000)
  await expectText(trail, '决议：批准')
  // 无值不得渲染空占位（先断留痕行已现，再断占位计数＝0，防渲染前假绿）
  await expectCount(page.locator('.nf-decisioncard__deny-reason'), 0)
})

test('E2-2：决议＝拒绝携理由 ⇒ 理由可见', async ({ page }) => {
  await bootE2_2(page)
  await expectText(page.locator('[data-testid="nf-decision-resolved"]'), '决议：拒绝')
  await expectText(page.locator('.nf-decisioncard__deny-reason'), '证据不足，先补测试再动')
})

test('E2-3：决议＝选项 ⇒ 留痕行呈「决议：选项」', async ({ page }) => {
  await bootE2_3(page)
  // 只断值文本（lastResolution 形状＝{ value, reason? }，无 option 字段，不断选项内容）
  await expectText(page.locator('[data-testid="nf-decision-resolved"]'), '决议：选项')
})
