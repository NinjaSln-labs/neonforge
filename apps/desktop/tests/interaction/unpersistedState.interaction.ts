// S1b Task 6（stage-spec F2）：未持久化态显式呈现——S1 内存态重启即失，UI 须显式告知（不得静默装作已保存）。
import { test } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { expectVisible, expectText } from '../helpers/assertions'

const DOMAIN_SEED = `
window.__domainCalls = []
window.__nfDelegation = { list: async () => [], create: async () => ({}), accept: async () => ({}), reject: async () => ({}) }
window.__nfTurn = { start: async () => ({ into: 'turn', turnId: 't' }) }
window.__nfDecision = { raise: async () => ({}), resolve: async () => ({}) }
window.__nfEvidence = { listByDelegation: async () => [], inspect: async () => ({}) }
window.__nfQueue = { pending: async () => [] }
window.__nfTimeline = { queryByDelegation: async () => [], subscribe: async () => ({ subscribed: true }), onEvent: () => () => {} }
;((nf) => {
  nf.delegation = window.__nfDelegation; nf.turn = window.__nfTurn; nf.decision = window.__nfDecision
  nf.evidence = window.__nfEvidence; nf.queue = window.__nfQueue; nf.timeline = window.__nfTimeline
})(window.neonforge)
`

test('F2-1：未持久化态显式呈现（内存态·重启即失）且不挂旧对话中心', async ({ page }) => {
  await installMockBridge(page, { project: 'open', extraInit: DOMAIN_SEED })
  await page.goto('http://localhost:5175/')
  await expectVisible(page.locator('.nf-unpersisted'), 8000)
  await expectText(page.locator('.nf-unpersisted'), '未持久化', 8000)
  await expectText(page.locator('.nf-unpersisted'), '重启即失', 8000)
  // 旧对话中心不挂载（App 已重写为委托单中心）
  await expectVisible(page.locator('.nf-delegationcenter'), 8000)
})
