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

export async function ensureOut() {
  const { mkdirSync } = await import('fs')
  mkdirSync('/tmp/nf-cdp', { recursive: true })
}
