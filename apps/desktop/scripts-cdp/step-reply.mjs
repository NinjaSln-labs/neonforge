// 打字回复：填入输入框并点发送，等待模型回合结束（状态栏回到 就绪）后再 dump
import { connect, snap, dump, statusText, ensureOut } from './cdp-lib.mjs'

await ensureOut()
const text = process.argv[2]
const waitSec = Number(process.argv[3] || 60)
const { browser, page } = await connect()
const input = page.locator('textarea').last()
await input.fill(text)
await page.locator('text=发送').last().click({ timeout: 5000 })
console.log('sent:', text)
const start = Date.now()
let ui = ''
while ((Date.now() - start) / 1000 < waitSec) {
  ui = await dump(page)
  // RC1b：回合结束＝状态栏不再「搭档处理中」（同源；勿整页扫——幽灵占位会伪装成忙让本工具空等到超时）
  const busy = await statusText(page)
    .then((t) => /搭档处理中/.test(t))
    .catch(() => false)
  if (!busy) break
  await page.waitForTimeout(3000)
}
console.log('--- UI tail ---')
console.log(ui.split('\n').slice(-60).join('\n'))
await snap(page, 'typed-reply')
await browser.close()
