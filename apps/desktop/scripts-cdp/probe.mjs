// 探针：连接 CDP，验证 preload/IPC（window.neonforge），截图 + DOM 文本 dump
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'

await ensureOut()
const { browser, page } = await connect()
console.log('url:', page.url())
const hasBridge = await page.evaluate(() => ({
  neonforge: typeof window.neonforge,
  keys: window.neonforge ? Object.keys(window.neonforge) : [],
}))
console.log('bridge:', JSON.stringify(hasBridge))
const text = await dump(page)
console.log('--- UI text (first 80 lines) ---')
console.log(text.split('\n').slice(0, 80).join('\n'))
await snap(page, 'probe-initial')
await browser.close()
