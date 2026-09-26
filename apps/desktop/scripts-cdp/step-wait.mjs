// 轮询等待 UI 出现给定文本或超时：node step-wait.mjs "确认目标" 60
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'

await ensureOut()
const needle = process.argv[2] || '确认'
const timeoutSec = Number(process.argv[3] || 60)
const { browser, page } = await connect()
const start = Date.now()
let text = ''
while ((Date.now() - start) / 1000 < timeoutSec) {
  text = await dump(page)
  if (text.includes(needle)) break
  await page.waitForTimeout(3000)
}
console.log(
  'waited(s):',
  Math.round((Date.now() - start) / 1000),
  'matched:',
  text.includes(needle),
)
console.log('--- UI text ---')
console.log(text.split('\n').slice(-90).join('\n'))
await snap(page, `wait-${needle}`)
await browser.close()
