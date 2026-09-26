// UAT 二轮探针 1 续：澄清选① → 等 goal 卡 → 连拒 2 次 → 断言强制卡
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { readLatestTimeline, UAT_DIR } from './uat-lib.mjs'

await ensureOut()
const { browser, page } = await connect()
const mark = readLatestTimeline().slice(-1)[0]?.seq ?? 0
console.log('watermark', mark)

// 1. 点澄清选项①（button role 精确点击——text= 定位卡片按钮不可靠）
const opt = page.getByRole('button', { name: /单个 HTML 文件/ }).first()
try {
  await opt.click({ timeout: 10000, force: true })
  console.log('clicked option 1')
} catch {
  console.log('option button not found, dump:')
  console.log((await dump(page)).slice(0, 2000))
}

// 2. 等 goal 卡
await page.getByRole('button', { name: '确认目标' }).waitFor({ timeout: 240000 })
await snap(page, `${UAT_DIR}/force1/01-goal-card.png`)
console.log('goal card visible')

// 3. 拒绝 ×2
const rejectBtn = page.getByRole('button', { name: '重新描述' })
for (let i = 1; i <= 2; i++) {
  await rejectBtn.click({ timeout: 10000, force: true })
  console.log(`reject #${i} clicked`)
  let forced = false
  for (let w = 0; w < 75; w++) {
    if ((await page.locator('.nf-forcedcard').count()) > 0) {
      forced = true
      break
    }
    // 卡重现（模型重提议）→ 继续下一轮拒绝
    if (i === 1 && (await page.getByRole('button', { name: '确认目标' }).count()) > 0) break
    await page.waitForTimeout(2000)
  }
  await snap(page, `${UAT_DIR}/force1/0${i + 1}-after-reject${i}.png`)
  if (forced) {
    console.log(`FORCED CARD live after reject #${i}`)
    break
  }
  if (i === 1) console.log('goal card re-proposed, rejecting again')
}
const txt = await dump(page)
console.log('--- UI ---')
console.log(txt.split('\n').slice(0, 40).join('\n'))

// 4. timeline 取证
await page.waitForTimeout(2000)
const ev = readLatestTimeline().filter((e) => e.seq > mark)
const hits = ev.filter((e) =>
  [
    'dialogue.loop_guard',
    'dialogue.forced_clarify',
    'card.rejected',
    'session.pending_set',
  ].includes(e.type),
)
console.log('--- timeline hits ---')
for (const e of hits) console.log(e.seq, e.type, JSON.stringify(e.detail ?? {}).slice(0, 140))
await snap(page, `${UAT_DIR}/force1/99-final.png`)
await browser.close()
