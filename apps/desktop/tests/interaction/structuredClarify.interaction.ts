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
      [{ label: '先做静态页', description: '单页静态实现' }],
      ['使用原生 HTML', '数据存 localStorage'],
    ),
    chunk.done(),
  ])
  await expect(page.locator('.nf-assumptioncheck')).toBeVisible({ timeout: 10000 })
  // options 与 assumptions 并存时两者都可见（不得静默丢弃 options）
  await expect(page.locator('.nf-candidates__btn', { hasText: '先做静态页' })).toBeVisible()
  const rows = page.locator('.nf-assumptioncheck__row')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).getByRole('button', { name: '符合', exact: true }).click()
  await rows.nth(1).getByRole('button', { name: '不符合', exact: true }).click()
  await rows.nth(1).locator('input').fill('改用 IndexedDB')
  const submit = page.getByRole('button', { name: '提交回答' })
  await expect(submit).toBeEnabled()
  // 输入框草稿不被结构化回答覆盖（直送 opts.text，不经 inputRef）
  await page.locator('.nf-chat__input textarea').fill('另外要能导出')
  // 双击防护：第一下已提交，第二下不得重复发送
  await submit.dblclick()
  await expect(page.locator('.nf-chat__input textarea')).toHaveValue('另外要能导出')
  const userMsg = page.locator('.nf-msg--user').last()
  await expect(userMsg).toContainText('【澄清回答】', { timeout: 10000 })
  await expect(userMsg).toContainText('"assumption":"使用原生 HTML"')
  await expect(userMsg).toContainText('"choice":"符合"')
  await expect(userMsg).toContainText('"assumption":"数据存 localStorage"')
  await expect(userMsg).toContainText('"choice":"不符合"')
  await expect(userMsg).toContainText('改用 IndexedDB')
  await expect(page.locator('.nf-msg--user').filter({ hasText: '【澄清回答】' })).toHaveCount(1)
  // 已回应 → 卡控件禁用，不能重复提交
  await expect(page.getByRole('button', { name: '已提交' })).toBeDisabled()
  // 来源制裁：确认过的假设保留「你的澄清」；被否认/模型臆断的 source 一律降级模型推断
  await h.emit([
    chunk.tool('propose_goal', {
      statement: '做一个静态待办页',
      assumptions: [
        { text: '使用原生 HTML', source: 'clarification' },
        { text: '数据存 localStorage', source: 'clarification' },
        { text: '先做静态页', source: 'user_choice' },
      ],
    }),
    chunk.done(),
  ])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.nf-assumption__source').filter({ hasText: '你的澄清' })).toHaveCount(
    1,
  )
  await expect(page.locator('.nf-assumption__source').filter({ hasText: '模型推断' })).toHaveCount(
    2,
  )
})

test('ADR-014：方案待确认时提交澄清回答不误拒方案（clarification 直送）', async ({ page }) => {
  const h = await installMockBridge(page, { project: 'none', manualEmit: true })
  await startFromScratch(page)
  await sendChat(page, '做个待办应用')
  await h.emit([chunk.tool('propose_goal', { statement: '做一个待办应用' }), chunk.done()])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  // 同一轮：方案提议置 pending + ask_user 假设核对卡（澄清不置决策点）
  await h.emit([
    chunk.tool('propose_plan', {
      summary: '单页方案',
      files: [{ path: '/test/app.html', reason: '入口' }],
    }),
    toolCall.askUser('核对目标理解', 'risk_confirmation', [], ['使用原生 HTML']),
    chunk.done(),
  ])
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.nf-assumptioncheck')).toBeVisible()
  await page
    .locator('.nf-assumptioncheck__row')
    .getByRole('button', { name: '符合', exact: true })
    .click()
  await page.getByRole('button', { name: '提交回答' }).click()
  // 提交澄清回答不得把待确认方案当成「文本拒绝」——方案卡必须仍在
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
})

test('ADR-014：未经用户操作的来源声明降级为模型推断', async ({ page }) => {
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
  // 模型自报 user_choice/clarification 但没有真实证据 → 全部降级模型推断
  await expect(sources.filter({ hasText: '你的澄清' })).toHaveCount(0)
  await expect(sources.filter({ hasText: '你的选择' })).toHaveCount(0)
  await expect(sources.filter({ hasText: '模型推断' })).toHaveCount(3)
  await expect(page.locator('.nf-confirmcard')).toContainText('用户要单页应用')
  await expect(page.locator('.nf-confirmcard')).toContainText('数据存 localStorage')
})
