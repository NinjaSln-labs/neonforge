// 输入任务并发送：node step-send.mjs "任务文本"
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'

await ensureOut()
const task = process.argv[2]
const { browser, page } = await connect()
const input = page.locator('textarea, [contenteditable=true], input[type=text]').last()
await input.fill(task)
await page.waitForTimeout(300)
// 点发送按钮
await page.locator('text=发送').last().click({ timeout: 5000 })
console.log('sent:', task)
await page.waitForTimeout(3000)
const text = await dump(page)
console.log('--- UI text ---')
console.log(text.split('\n').slice(0, 120).join('\n'))
await snap(page, 'step2-sent')
await browser.close()
