import { test, expect, type Page } from '@playwright/test'

/** 服务失败 → 点「重试」→ 同回合重放（不追加用户消息） */
async function mockRetryBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const chat = { n: 0, cb: null as null | ((c: unknown) => void) }
    ;(window as unknown as { neonforge: unknown }).neonforge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        getProvider: async () => 'commandcode',
        setKey: async () => {},
        clearKey: async () => {},
        listProviders: async () => [],
      },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        updateProjectTitle: async () => ({ ok: true }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        activeModel: async () => ({
          providerId: 'commandcode',
          providerLabel: 'Command Code',
          upstream: 'deepseek/deepseek-v4.1-flash',
          shortName: 'deepseek-v4.1-flash',
        }),
        streamChat: async () => {
          chat.n++
          if (chat.n === 1) {
            return { ok: false, error: 'service-error', errorType: 'service' as const }
          }
          setTimeout(() => {
            chat.cb?.({ type: 'content', text: '重试后回来了' })
            chat.cb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: unknown) => void) => {
          chat.cb = cb
          return () => {
            chat.cb = null
          }
        },
      },
      tools: { list: async () => [], execute: async () => ({ ok: true }) },
      chatLog: { log: async () => {} },
      session: { setPlanConfirmed: async () => ({ ok: true }) },
      plannedFiles: {
        load: async () => ({ files: [], approved: false }),
        add: async () => ({ files: [], approved: true }),
        reset: async () => ({ files: [], approved: false }),
      },
    }
  })
}

/** goal→plan 确认后首击 service → 自动续跑；闸门用尽后再发含「再改一下」才二次 service */
async function mockAutoRetryAfterPlan(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const chat = { n: 0, cb: null as null | ((c: unknown) => void) }
    const emit = (chunks: unknown[]) => {
      setTimeout(() => {
        for (const c of chunks) chat.cb?.(c)
      }, 40)
    }
    const lastUserText = (msgs: { role?: string; content?: string }[] | undefined) => {
      if (!msgs) return ''
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'user') return String(msgs[i].content ?? '')
      }
      return ''
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        getProvider: async () => 'commandcode',
        setKey: async () => {},
        clearKey: async () => {},
        listProviders: async () => [],
      },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        updateProjectTitle: async () => ({ ok: true }),
        initProject: async (title: string) => ({ ok: true, path: '/test', title }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        activeModel: async () => ({
          providerId: 'commandcode',
          providerLabel: 'Command Code',
          upstream: 'deepseek/deepseek-v4.1-flash',
          shortName: 'deepseek-v4.1-flash',
        }),
        streamChat: async (opts?: { messages?: { role?: string; content?: string }[] }) => {
          // A-029：用户第二轮「再改一下」→ service，不自动成功
          if (lastUserText(opts?.messages).includes('再改一下')) {
            return { ok: false, error: 'service-error', errorType: 'service' as const }
          }
          chat.n++
          if (chat.n === 1) {
            emit([
              {
                type: 'tool-call',
                toolCall: {
                  name: 'propose_goal',
                  args: { statement: '做个待办页', assumptions: ['单文件'] },
                },
              },
              { type: 'done' },
            ])
            return { ok: true }
          }
          if (chat.n === 2) {
            emit([
              {
                type: 'tool-call',
                toolCall: {
                  name: 'propose_plan',
                  args: {
                    summary: '写 index.html',
                    files: [{ path: 'index.html', reason: '主页' }],
                    assumptions: ['原生 HTML'],
                    verification_plan: ['ls index.html'],
                  },
                },
              },
              { type: 'done' },
            ])
            return { ok: true }
          }
          if (chat.n === 3) {
            return { ok: false, error: 'service-error', errorType: 'service' as const }
          }
          // 自动续跑及 StrictMode 多余序号：一律成功（与首版 interaction 一致）
          emit([{ type: 'content', text: '自动续跑成功' }, { type: 'done' }])
          return { ok: true }
        },
        onStreamChunk: (cb: (c: unknown) => void) => {
          chat.cb = cb
          return () => {
            chat.cb = null
          }
        },
      },
      tools: { list: async () => [], execute: async () => ({ ok: true }) },
      chatLog: { log: async () => {} },
      session: { setPlanConfirmed: async () => ({ ok: true }) },
      plannedFiles: {
        load: async () => ({ files: [], approved: false }),
        add: async (files: string[]) => ({ files: files ?? [], approved: true }),
        reset: async () => ({ files: [], approved: false }),
      },
      timeline: { log: async () => {} },
    }
  })
}

async function enter(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea')
}

test('服务失败气泡显示「重试」→ 点击后不追加用户消息且恢复回复', async ({ page }) => {
  await mockRetryBridge(page)
  await enter(page)
  await page.locator('.nf-chat__input textarea').fill('帮我看下')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.nf-msg--assistant')).toContainText('服务暂时不可用')
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
  await expect(page.locator('.nf-msg--assistant')).toContainText('重试后回来了', { timeout: 5000 })
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0)
})

test('计划确认后 service 自动续跑一次；第二次 service 须点重试', async ({ page }) => {
  await mockAutoRetryAfterPlan(page)
  await page.goto('/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByLabel('想解决的问题').fill('做个待办')
  await page.getByRole('button', { name: '从零开始' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 15000 })
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('自动续跑成功')).toBeVisible({ timeout: 15000 })
  // A-029：闸门用尽 → 再 service 只出「重试」，不自动成功
  await page.locator('.nf-chat__input textarea').fill('再改一下')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.getByText('自动续跑成功')).toHaveCount(1)
})
