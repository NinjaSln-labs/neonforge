// ADR-014（GitHub #13）：结构化澄清（AskToAct 式目标假设显式采集）。
// 场景：
//   1. ask_user.assumptions → 假设核对卡逐条「符合/不符合」+ 修正 → 提交结构化回答
//   2. propose_goal 结构化 assumptions → 目标卡显示来源标签（你的澄清/模型推断）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { enterWorkspace, sendChat, startFromScratch } from './scenarios'

test('ADR-014：假设核对卡——逐条选择/修正，提交结构化澄清回答', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'open',
    manualEmit: true,
  })
  await enterWorkspace(page)
  await sendChat(page, '做个网站')
  await h.emit([
    toolCall.askUser(
      '开始前先核对几个理解',
      'risk_confirmation',
      [],
      ['使用原生 HTML', '数据存 localStorage'],
    ),
    chunk.done(),
  ])
  await expect(page.locator('.nf-assumptioncheck')).toBeVisible({ timeout: 10000 })
  const rows = page.locator('.nf-assumptioncheck__row')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).getByRole('button', { name: '符合', exact: true }).click()
  await rows.nth(1).getByRole('button', { name: '不符合', exact: true }).click()
  await rows.nth(1).locator('input').fill('改用 IndexedDB')
  const submit = page.getByRole('button', { name: '提交回答' })
  await expect(submit).toBeEnabled()
  await submit.click()
  const userMsg = page.locator('.nf-msg--user').last()
  await expect(userMsg).toContainText('【澄清回答】', { timeout: 10000 })
  await expect(userMsg).toContainText('使用原生 HTML：符合')
  await expect(userMsg).toContainText('数据存 localStorage：不符合')
  await expect(userMsg).toContainText('改用 IndexedDB')
  // 已回应 → 卡控件禁用，不能重复提交
  await expect(page.getByRole('button', { name: '已提交' })).toBeDisabled()
})

test('ADR-014：目标卡显示假设来源标签（你的澄清/你的选择/模型推断）', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'none',
    manualEmit: true,
  })
  await startFromScratch(page)
  await sendChat(page, '做个待办应用')
  await h.emit([
    chunk.tool('propose_goal', {
      statement: '做一个待办清单应用',
      assumptions: [
        { text: '用户要单页应用', source: 'clarification' },
        { text: '使用 React 19', source: 'user_choice' },
        { text: '数据存 localStorage', source: 'model_inference' },
      ],
    }),
    chunk.done(),
  ])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  const sources = page.locator('.nf-assumption__source')
  await expect(sources.filter({ hasText: '你的澄清' })).toHaveCount(1)
  await expect(sources.filter({ hasText: '你的选择' })).toHaveCount(1)
  await expect(sources.filter({ hasText: '模型推断' })).toHaveCount(1)
  await expect(page.locator('.nf-confirmcard')).toContainText('用户要单页应用')
  await expect(page.locator('.nf-confirmcard')).toContainText('数据存 localStorage')
})
