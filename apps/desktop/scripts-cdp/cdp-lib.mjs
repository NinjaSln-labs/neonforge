// CDP 驱动公共库（S5 收尾复验用，本机私有不入库）
// 用法：import { connect, snap, dump } from './cdp-lib.mjs'
import { chromium } from 'playwright'

export async function connect() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => !p.url().startsWith('devtools')) || ctx.pages()[0]
  return { browser, ctx, page }
}

export async function snap(page, name) {
  const path = `/tmp/nf-cdp/${name}.png`
  await page.screenshot({ path })
  console.log('shot:', path)
  return path
}

export async function dump(page) {
  return page.evaluate(() => document.body.innerText)
}

// busy 同源（ADR-013.1 / RC1b）：只读状态栏——产品唯一的 busy 事实来源。
// 禁整页 innerText 判 busy：幽灵占位（forced-clarify/depth 裸退遗留的「搭档处理中…」）与
// 模型正文（「正在生成中…」）都会被正则命中 → 永久假 busy → UAT skip-act 死锁。
// innerText 实为「搭档处理中… │ 项目名」，故调用方用子串匹配而非全等。
// 读不到 → 抛错（不静默当 idle）：调用方 fail-closed 保守判 busy，避免选择器失效时
// 在真 busy 期放行动作、污染整批取证。
export async function statusText(page) {
  for (const sel of ['.nf-statusbar__left', '[role="status"]']) {
    try {
      const t = await page.locator(sel).first().innerText({ timeout: 2000 })
      if (t) return t
    } catch {
      /* 试下一个选择器 */
    }
  }
  throw new Error('busy-source-missing: 状态栏不可读')
}

export async function ensureOut() {
  const { mkdirSync } = await import('fs')
  mkdirSync('/tmp/nf-cdp', { recursive: true })
}
