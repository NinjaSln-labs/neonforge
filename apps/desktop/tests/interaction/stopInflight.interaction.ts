// S1b Task 7（stage-spec E1）：Stop 在飞——发起流后点 Stop ⇒ 经 gateway.stop(streamId) 转投取消通道。
// 断言口径＝Stop 按钮存在且可点 → __domainCalls 出现 cancel:<streamId>；流停后 Stop 态复位。
import { test, expect, type Page } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { expectVisible } from '../helpers/assertions'

const SEED = `
window.__domainCalls = []
const domainInit = (nf) => {
  nf.delegation = { list: async () => [], create: async () => ({}), accept: async () => ({}), reject: async () => ({}) }
  nf.turn = { start: async () => ({ into: 'turn', turnId: 't' }) }
  nf.decision = { raise: async () => ({}), resolve: async () => ({}) }
  nf.evidence = { listByDelegation: async () => [], inspect: async () => ({}) }
  nf.queue = { pending: async () => [] }
  nf.timeline = { queryByDelegation: async () => [], subscribe: async () => ({}), onEvent: () => () => {} }
  nf.gateway.stop = async (streamId) => { window.__domainCalls.push('cancel:' + streamId); return { ok: true } }
}
if (window.neonforge) domainInit(window.neonforge)
else { let _nf; Object.defineProperty(window, 'neonforge', { configurable: true, get: () => _nf, set: (v) => { _nf = v; domainInit(v) } }) }
`

async function boot(page: Page) {
  await installMockBridge(page, { project: 'open', extraInit: SEED })
  await page.goto('http://localhost:5175/')
  await page.waitForSelector('.nf-app', { timeout: 8000 })
}

test('E1-1：发起流后 Stop 可见且可点 ⇒ 转投 gateway:cancel-stream', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-streambar__start').click()
  await expectVisible(page.locator('.nf-streambar__stop'), 8000)
  await page.locator('.nf-streambar__stop').click()
  const calls = await page.evaluate(
    () => (window as unknown as { __domainCalls: string[] }).__domainCalls,
  )
  expect(calls.some((c) => c.startsWith('cancel:'))).toBe(true)
})

test('E1-2：Stop 后流态复位（Stop 按钮消失）', async ({ page }) => {
  await boot(page)
  await page.locator('.nf-streambar__start').click()
  await page.locator('.nf-streambar__stop').click()
  await expect(page.locator('.nf-streambar__stop')).toBeHidden({ timeout: 8000 })
})
