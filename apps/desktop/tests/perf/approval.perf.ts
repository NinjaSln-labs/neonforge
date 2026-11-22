import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { installMockBridge, chunk, toolCall } from '../interaction/mockBridge'

// 非人类、mock provider 的渲染器 UI 性能基准：审批卡出现 + 脚本化批准往返。
// 不测真实用户点击、网络/模型首 token；原始样本写入 NF_PERF_OUT。

type PerfState = {
  emitAt: number | null
  cardAt: number | null
  clickAt: number | null
  doneAt: number | null
  cardStartCount: number
  doneStartCount: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function send(page: Page, text: string): Promise<void> {
  const input = page.locator('.nf-chat__input textarea')
  await input.fill(text)
  await input.press('Meta+Enter')
}

async function emit(page: Page, chunks: unknown[]): Promise<void> {
  await page.evaluate((cs) => {
    const global = window as unknown as { __perf?: PerfState; __emit?: (c: unknown) => void }
    if (!global.__perf) {
      global.__perf = {
        emitAt: null,
        cardAt: null,
        clickAt: null,
        doneAt: null,
        cardStartCount: 0,
        doneStartCount: 0,
      }
    }
    global.__perf.emitAt = performance.now()
    if (!global.__emit) throw new Error('__emit missing')
    for (const c of cs) global.__emit(c)
  }, chunks)
}

async function enterWorkspace(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]
}

test('审批卡出现与脚本化批准（mock，非人类）', async ({ page }) => {
  const cycles = Number(process.env.NF_PERF_CYCLES || '20')
  const outPath =
    process.env.NF_PERF_OUT ||
    path.resolve(process.cwd(), '../../.scratch/evals/perf/renderer-ui-approval.json')

  await installMockBridge(page, {
    project: 'open',
    manualEmit: true,
    approval: 'write-edit',
    streamDelay: 20,
  })
  await enterWorkspace(page)

  // 建立目标确认 → 执行确认，之后 write 才会进入 need-approval 卡。
  await send(page, '批量整理文件')
  await sleep(300)
  await emit(page, [toolCall.proposeGoal('批量整理文件'), chunk.done()])
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible()
  await page.getByRole('button', { name: '确认目标' }).click()

  await expect(
    page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: '搭档处理中' }),
  ).toBeVisible({ timeout: 5000 })
  await emit(page, [chunk.content('好的，方案如下，等你确认。'), chunk.done()])
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible()
  await page.getByRole('button', { name: '确认执行' }).click()
  await page.waitForTimeout(300)

  await page.evaluate(() => {
    const state: PerfState & { seen: boolean } = {
      emitAt: null,
      cardAt: null,
      clickAt: null,
      doneAt: null,
      cardStartCount: 0,
      doneStartCount: 0,
      seen: false,
    }
    ;(window as unknown as { __perf: typeof state }).__perf = state
    const observer = new MutationObserver(() => {
      const s = (window as unknown as { __perf: PerfState }).__perf
      if (s.emitAt === null) return
      const cardCount = document.querySelectorAll('.nf-toolcall--need-approval').length
      if (cardCount > s.cardStartCount && s.cardAt === null) s.cardAt = performance.now()
      if (s.clickAt !== null) {
        const doneCount = document.querySelectorAll('.nf-toolcall--done').length
        if (doneCount > s.doneStartCount && s.doneAt === null) s.doneAt = performance.now()
      }
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  })

  const samples: Array<{ cardAppearanceMs: number; approvalRoundtripMs: number }> = []

  for (let i = 0; i < cycles; i++) {
    await send(page, `修改第 ${i} 个文件`)
    await sleep(250)
    const start = await page.evaluate(() => {
      const s = (window as unknown as { __perf: PerfState }).__perf
      s.emitAt = null
      s.cardAt = null
      s.clickAt = null
      s.doneAt = null
      s.cardStartCount = document.querySelectorAll('.nf-toolcall--need-approval').length
      s.doneStartCount = document.querySelectorAll('.nf-toolcall--done').length
      return { cardStartCount: s.cardStartCount, doneStartCount: s.doneStartCount }
    })

    await emit(page, [
      chunk.tool('write', { path: `/test/perf-${i}.txt`, content: `x-${i}` }),
      chunk.done(),
    ])
    await page.waitForFunction(
      (startCount) =>
        document.querySelectorAll('.nf-toolcall--need-approval').length > startCount &&
        (window as unknown as { __perf: PerfState }).__perf.cardAt !== null,
      start.cardStartCount,
      { timeout: 5000 },
    )
    await page.evaluate(() => {
      const s = (window as unknown as { __perf: PerfState }).__perf
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        '.nf-toolcall--need-approval .nf-toolcall__approve',
      )
      const button = buttons[buttons.length - 1]
      if (!button) throw new Error('approval button missing')
      s.doneStartCount = document.querySelectorAll('.nf-toolcall--done').length
      s.clickAt = performance.now()
      button.click()
    })
    await page.waitForFunction(
      (startCount) =>
        document.querySelectorAll('.nf-toolcall--done').length > startCount &&
        (window as unknown as { __perf: PerfState }).__perf.doneAt !== null,
      start.doneStartCount,
      { timeout: 5000 },
    )

    const times = await page.evaluate(() => {
      const s = (window as unknown as { __perf: PerfState }).__perf
      return { emitAt: s.emitAt, cardAt: s.cardAt, clickAt: s.clickAt, doneAt: s.doneAt }
    })
    if (
      times.emitAt === null ||
      times.cardAt === null ||
      times.clickAt === null ||
      times.doneAt === null
    ) {
      throw new Error(`cycle ${i} missing timestamps: ${JSON.stringify(times)}`)
    }
    samples.push({
      cardAppearanceMs: times.cardAt - times.emitAt,
      approvalRoundtripMs: times.doneAt - times.clickAt,
    })
    await sleep(120)
  }

  const cards = samples.map((s) => s.cardAppearanceMs)
  const roundtrips = samples.map((s) => s.approvalRoundtripMs)
  const summary = {
    mode: 'mock-renderer-scripted-approval',
    human: false,
    cycles: samples.length,
    cardAppearanceMs: {
      p50: quantile(cards, 0.5),
      p95: quantile(cards, 0.95),
      min: Math.min(...cards),
      max: Math.max(...cards),
    },
    approvalRoundtripMs: {
      p50: quantile(roundtrips, 0.5),
      p95: quantile(roundtrips, 0.95),
      min: Math.min(...roundtrips),
      max: Math.max(...roundtrips),
    },
    samples,
  }
  expect(samples.length).toBe(cycles)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n')
  console.log('NF_RENDERER_UI_RESULT ' + JSON.stringify({ ...summary, outPath }))
})
