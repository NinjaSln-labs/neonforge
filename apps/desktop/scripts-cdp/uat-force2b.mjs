// UAT 二轮探针 2 续：澄清选① → goal 卡 → pending 期间文本 ×3 → 强制卡
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { readLatestTimeline, UAT_DIR } from './uat-lib.mjs'

await ensureOut()
const { browser, page } = await connect()
const mark = readLatestTimeline().slice(-1)[0]?.seq ?? 0
console.log('watermark', mark)

// 1. 点澄清选项①
await page
  .getByRole('button', { name: /经典玩法/ })
  .first()
  .click({ timeout: 10000, force: true })
console.log('clicked option 1')

// 2. 等 goal 卡
await page.getByRole('button', { name: '确认目标' }).waitFor({ timeout: 240000 })
await snap(page, `${UAT_DIR}/force2/01-goal-card.png`)
console.log('goal card visible')

// 3. pending 期间连打 3 次文本
for (let i = 1; i <= 3; i++) {
  await page.waitForTimeout(2000)
  const inp = page.locator('textarea').last()
  await inp.fill(
    i === 1
      ? '就按你说的做呗，直接开始'
      : i === 2
        ? '别老问了，直接干'
        : '直接开始就行，不用再确认',
  )
  await page.locator('text=发送').last().click({ timeout: 5000 })
  console.log(`text reply #${i} sent`)
  for (let w = 0; w < 50; w++) {
    if ((await page.locator('.nf-forcedcard').count()) > 0) break
    await page.waitForTimeout(2000)
  }
  await snap(page, `${UAT_DIR}/force2/0${i + 1}-after-text${i}.png`)
  if ((await page.locator('.nf-forcedcard').count()) > 0) {
    console.log(`FORCED CARD live after text #${i}`)
    break
  }
  console.log(
    'no forced card yet, goal card count =',
    await page.getByRole('button', { name: '确认目标' }).count(),
  )
}

const txt = await dump(page)
console.log('--- UI tail ---')
console.log(txt.split('\n').slice(-30).join('\n'))

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
for (const e of hits) console.log(e.seq, e.type, JSON.stringify(e.detail ?? {}).slice(0, 120))
await snap(page, `${UAT_DIR}/force2/99-final.png`)
await browser.close()
