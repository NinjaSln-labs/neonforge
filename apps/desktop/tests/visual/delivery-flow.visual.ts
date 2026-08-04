import { test, expect } from '@playwright/test'

// ticket 07：0-1 交付流视觉基线——mock deliveryFlow → 阶段机 + 模型选择 + 分步推进
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      demo: { deliveryFlow: true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

test('0-1 交付流（阶段机 + 模型选择）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await expect(page.locator('.nf-flow')).toBeVisible()
  await expect(page.locator('.nf-flow__stage')).toHaveCount(6)
  await expect(page.locator('.nf-flow__stage--active')).toContainText('需求')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-init.png')
})

test('选敏捷 → 分步推进到交付', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.getByRole('button', { name: /快速迭代/ }).click()
  await expect(page.locator('.nf-flow')).toContainText('方式：快速迭代')
  // 推进 6 步到交付完成
  for (let i = 0; i < 6; i++) {
    const btn = page.locator('.nf-flow__advance button')
    if (await btn.count()) { await btn.click() }
  }
  await expect(page.locator('.nf-flow')).toContainText('交付完成')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('flow-done.png')
})

test('0-1 从零开始 → 发送需求 → 创建真实项目（ticket 07 执行地基）', async ({ page }) => {
  await page.addInitScript(() => {
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [{ name: 'README.md', path: '/tmp/nf-proj/travel-site/README.md', kind: 'file' }],
        readFile: async () => ({ ok: true, content: '# x' }),
        initProject: async (title: string) => ({ ok: true, path: '/tmp/nf-proj/travel-site', title })
      },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} }
    }
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 0-1 模式：交付流面板 + 状态栏「从零开始」
  await expect(page.locator('.nf-flow')).toBeVisible()
  await expect(page.locator('.nf-statusbar')).toContainText('从零开始')
  // 发送需求 → initProject → rootPath 更新（状态栏显示项目 slug）——0-1 阶段机保持（zeroToOneMode 会话级）
  await page.locator('.nf-chat__input textarea').fill('做一个旅行手册网站')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  await expect(page.locator('.nf-statusbar')).toContainText('travel-site')
  await expect(page.locator('.nf-flow')).toBeVisible()
})

test('0-1 阶段指引注入（选模型 → 发送 → streamChat 含阶段提示）', async ({ page }) => {
  await page.addInitScript(() => {
    window.__lastMsgs = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '// x' }),
        initProject: async () => ({ ok: true, path: '/tmp/nf-proj/demo-site', title: 'demo' })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async (opts: { messages: Array<{ role: string; content: string | null }> }) => { window.__lastMsgs = opts.messages; return { ok: true } },
        onStreamChunk: () => () => {}
      }
    }
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 选敏捷 → 发送需求 → streamChat messages 含阶段指引（需求阶段）
  await page.getByRole('button', { name: /快速迭代/ }).click()
  await page.locator('.nf-chat__input textarea').fill('做一个记账工具')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  const msgs = await page.evaluate(() => (window as unknown as { __lastMsgs: Array<{ role: string; content: string | null }> | null }).__lastMsgs)
  const hint = msgs?.find((m) => m.role === 'system' && String(m.content).includes('0-1 交付'))
  expect(hint).toBeTruthy()
  expect(String(hint?.content)).toContain('需求')
  expect(String(hint?.content)).toContain('敏捷')
})

test('阶段推进 → 交付包阶段验收项（07 编排）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string }) => void) | null = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '// x' }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/tmp/nf-proj/demo-site', title: 'demo' }),
        updateProjectTitle: async () => ({ ok: true })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        // 2026-08-04 P0：需求阶段模型输出【需求确认】→ 解锁推进门控
        streamChat: async () => { setTimeout(() => { streamCb?.({ type: 'content', text: '好的，做记账工具。【需求确认：记账工具】' }); streamCb?.({ type: 'done' }) }, 30); return { ok: true } },
        onStreamChunk: (cb: (c: { type: string; text?: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  await page.getByRole('button', { name: /快速迭代/ }).click()
  await page.locator('.nf-chat__input textarea').fill('做一个记账工具')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  // 需求已确认（模型【需求确认】）→ 推进按钮解锁 → 推进 2 阶段（确认需求 → 确认设计）
  await expect(page.locator('.nf-flow__advance button')).toBeEnabled()
  await page.locator('.nf-flow__advance button').click()
  await page.waitForTimeout(200)
  await page.locator('.nf-flow__advance button').click()
  await page.waitForTimeout(200)
  // 产物 Tab → 交付包阶段验收项（6 条——前 2 完成）
  await page.getByRole('button', { name: '产物' }).click()
  await expect(page.locator('.nf-delivery__acceptance li')).toHaveCount(6)
  await expect(page.locator('.nf-delivery__acceptance li').first()).toContainText('需求 阶段已完成')
  await expect(page.locator('.nf-delivery__acceptance li').nth(1)).toContainText('设计 阶段已完成')
  await expect(page.locator('.nf-delivery__acceptance li').nth(2)).toContainText('开发 阶段进行中')
})
