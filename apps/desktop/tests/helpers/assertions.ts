// L3 断言词汇统一（测试域 DDD §9.3——断言 helper）
// 约定：可见性 / 计数 / 文本 / 状态就绪 四类断言各自走统一 helper——测试不再混用
// toHaveCount/toContainText/toBeVisible，避免同一语义多种写法。
// ⚠️ 必须 async + await matcher——Playwright expect 是异步轮询断言，不 await 等于
// fire-and-forget：测试继续执行 → 后续点击竞态（T0 实测：自测 1 由 8/8 挂 → 修复后稳定）。
import { expect, type Locator, type Page } from '@playwright/test'

// ── 可见性 ────────────────────────────────────────────────────────────────

/** 元素可见（默认超时 8s——交互测试通用节奏） */
export async function expectVisible(locator: Locator, timeout = 8000): Promise<void> {
  await expect(locator).toBeVisible({ timeout })
}

/** 元素不存在（严格——期望完全不渲染，而非隐藏） */
export async function expectAbsent(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(0)
}

/** 元素隐藏（渲染但不可见） */
export async function expectHidden(locator: Locator): Promise<void> {
  await expect(locator).toBeHidden()
}

// ── 计数 ─────────────────────────────────────────────────────────────────

/** 匹配元素数量 */
export async function expectCount(locator: Locator, count: number, timeout = 8000): Promise<void> {
  await expect(locator).toHaveCount(count, { timeout })
}

/** 至少 N 个匹配元素 */
export async function expectAtLeast(locator: Locator, count: number, timeout = 8000): Promise<void> {
  await expect.poll(async () => (await locator.count()) >= count, { timeout, message: `期望至少 ${count} 个匹配元素` }).toBe(true)
}

// ── 文本 ─────────────────────────────────────────────────────────────────

/** 元素包含文本（子串） */
export async function expectText(locator: Locator, text: string | RegExp, timeout = 8000): Promise<void> {
  await expect(locator).toContainText(text, { timeout })
}

/** 元素不含文本 */
export async function expectNoText(locator: Locator, text: string | RegExp): Promise<void> {
  await expect(locator).not.toContainText(text)
}

/** 输入框值匹配 */
export async function expectValue(locator: Locator, value: string | RegExp, timeout = 8000): Promise<void> {
  await expect(locator).toHaveValue(value, { timeout })
}

// ── 会话状态 ──────────────────────────────────────────────────────────────

/** 搭档就绪（statusbar「就绪」——working 已释放；坑 63 时序：流 done 后 send 守卫窗口已过） */
export async function expectChatReady(page: Page, timeout = 8000): Promise<void> {
  await expectText(page.locator('.nf-statusbar'), '就绪', timeout)
}

/** 最近一条用户消息包含文本 */
export async function expectLastUserMsg(page: Page, text: string | RegExp, timeout = 8000): Promise<void> {
  await expectText(page.locator('.nf-msg--user').last(), text, timeout)
}

/** 存在用户消息包含文本 */
export async function expectUserMsg(page: Page, text: string | RegExp, timeout = 8000): Promise<void> {
  await expectText(page.locator('.nf-msg--user'), text, timeout)
}

/** 存在助手消息包含文本（filter——避免命中多条时误报） */
export async function expectAssistantMsg(page: Page, text: string | RegExp, timeout = 8000): Promise<void> {
  await expectText(page.locator('.nf-msg--assistant .nf-msg__body').filter({ hasText: text }), text, timeout)
}

// ── 工具卡 ────────────────────────────────────────────────────────────────

/** 工具卡状态计数（done / need-approval / plan-approval 等） */
export async function expectToolCallState(page: Page, state: 'done' | 'need-approval' | 'plan-approval', count: number, timeout = 15000): Promise<void> {
  await expectCount(page.locator(`.nf-toolcall--${state}`), count, timeout)
}

/** 页面内读取测试注入的捕获值（window.__xxx——工厂捕获通道） */
export async function readCapture<T>(page: Page, name: string): Promise<T | undefined> {
  return page.evaluate((n) => (window as unknown as Record<string, unknown>)[n] as T | undefined, name)
}
