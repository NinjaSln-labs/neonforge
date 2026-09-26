// 打字回复：填入输入框并点发送，等待模型回合结束（状态回到 就绪）后再 dump
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'

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
  // 就绪且不出现「搭档处理中」视为回合结束
  if (!ui.includes('搭档处理中') && ui.includes('已发送')) {
    const tail = ui.slice(-400)
    if (tail.includes('就绪')) break
  }
  await page.waitForTimeout(3000)
}
console.log('--- UI tail ---')
console.log(ui.split('\n').slice(-60).join('\n'))
await snap(page, 'typed-reply')
await browser.close()
