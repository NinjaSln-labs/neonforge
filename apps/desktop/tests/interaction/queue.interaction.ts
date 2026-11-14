// 排队衔接（输入≠打断）回归：多槽 FIFO 不覆盖 + 显式停止把用户草稿回填输入框。
// 2026-11-15 代码审查修复（finding 7/11）：原单槽 pendingSendRef 会让后发消息覆盖先发；
// 停止后排队消息滞留、下一轮才乱序送出。
import { test, expect, type Page } from '@playwright/test'
import { gotoStart } from './scenarios'

/** 首轮慢（可在此期间排队），后续轮快速回显最后一条用户消息 */
async function mockQueueBridge(page: Page, firstTurnMs: number): Promise<void> {
  await page.addInitScript((delay) => {
    const chat = { n: 0, cb: null as null | ((c: unknown) => void), seen: [] as string[] }
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
          chat.n++
          const text = lastUserText(opts?.messages)
          chat.seen.push(text)
          const first = chat.n === 1
          setTimeout(
            () => {
              chat.cb?.({ type: 'content', text: first ? '第一轮完成' : `回复:${text}` })
              chat.cb?.({ type: 'done' })
            },
            first ? delay : 30,
          )
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
    Object.defineProperty(window, '__queueSeen', { get: () => chat.seen })
  }, firstTurnMs)
}

async function enter(page: Page): Promise<void> {
  await gotoStart(page)
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea')
}

async function sendText(page: Page, text: string): Promise<void> {
  await page.locator('.nf-chat__input textarea').fill(text)
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
}

test('连续排队两条消息按序送达（后发不覆盖先发）', async ({ page }) => {
  await mockQueueBridge(page, 1200)
  await enter(page)
  await sendText(page, '第一条')
  await expect(page.getByRole('button', { name: '停止搭档当前工作' })).toBeVisible({
    timeout: 5000,
  })
  // 首轮产出期间连续发送两条 → 都应进入 FIFO 队列
  await sendText(page, '第二条')
  await sendText(page, '第三条')
  await expect(page.locator('.nf-msg--user')).toHaveCount(3)
  await expect(page.getByText('回复:第二条')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('回复:第三条')).toBeVisible({ timeout: 15000 })
  expect(
    await page.evaluate(
      () => (window as unknown as { __queueSeen: string[] }).__queueSeen.slice(0, 3),
    ),
  ).toEqual(['第一条', '第二条', '第三条'])
})

test('显式停止：排队中的用户消息回填输入框（不静默滞留）', async ({ page }) => {
  await mockQueueBridge(page, 3000)
  await enter(page)
  await sendText(page, '第一条')
  await expect(page.getByRole('button', { name: '停止搭档当前工作' })).toBeVisible({
    timeout: 5000,
  })
  await sendText(page, '第二条')
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
  await page.getByRole('button', { name: '停止搭档当前工作' }).click()
  await expect(page.locator('.nf-chat__input textarea')).toHaveValue('第二条')
  await expect(page.locator('.nf-msg--user')).toHaveCount(1)
})
