// 步进驱动：点击文本匹配的元素，然后 dump UI + 截图
// 用法：node step-click.mjs "从零开始" [shotName]
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'

await ensureOut()
const label = process.argv[2]
const shot = process.argv[3] || 'after-click'
const { browser, page } = await connect()

if (label) {
  const el = page.locator(`text=${label}`).first()
  await el.click({ timeout: 5000 })
  console.log('clicked:', label)
  await page.waitForTimeout(1500)
}
const text = await dump(page)
console.log('--- UI text ---')
console.log(text.split('\n').slice(0, 100).join('\n'))
await snap(page, shot)
await browser.close()
