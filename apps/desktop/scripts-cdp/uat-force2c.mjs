// UAT 二轮探针 2c：强制卡动作——点「确认执行」→ 委派 underlying(goal) 确认 → 流转继续
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { readLatestTimeline, UAT_DIR } from './uat-lib.mjs'

await ensureOut()
const { browser, page } = await connect()
const mark = readLatestTimeline().slice(-1)[0]?.seq ?? 0
console.log('watermark', mark)

// 强制卡还在？（上次探针留下）
if ((await page.locator('.nf-forcedcard').count()) === 0) {
  console.log('forced card not present — abort')
  await browser.close()
  process.exit(1)
}
await snap(page, `${UAT_DIR}/force2/10-forcedcard.png`)

// 点「确认执行」（强制卡的 underlying=goal 委派确认）
await page.locator('.nf-forcedcard__btn--ok').click({ timeout: 10000, force: true })
console.log('clicked 确认执行 on forced card')
await page.waitForTimeout(1500)
await snap(page, `${UAT_DIR}/force2/11-after-confirm.png`)

// 等流转：plan 卡或模型行动（最多 180s）
let outcome = 'timeout'
for (let w = 0; w < 90; w++) {
  if ((await page.getByRole('button', { name: '确认执行' }).count()) > 0) {
    outcome = 'plan-card'
    break
  }
  if ((await page.getByRole('button', { name: '批准这批文件' }).count()) > 0) {
    outcome = 'approve-card'
    break
  }
  if ((await page.locator('.nf-forcedcard').count()) > 0) {
    outcome = 'forced-again'
    break
  }
  await page.waitForTimeout(2000)
}
console.log('outcome:', outcome)

const txt = await dump(page)
console.log('--- UI tail ---')
console.log(txt.split('\n').slice(-28).join('\n'))

await page.waitForTimeout(2000)
const ev = readLatestTimeline().filter((e) => e.seq > mark)
const hits = ev.filter((e) =>
  [
    'session.pending_set',
    'card.resolved',
    'card.rejected',
    'dialogue.forced_clarify',
    'goal.confirmed',
  ].includes(e.type),
)
console.log('--- timeline hits ---')
for (const e of hits) console.log(e.seq, e.type, JSON.stringify(e.detail ?? {}).slice(0, 140))
await snap(page, `${UAT_DIR}/force2/99-final2.png`)
await browser.close()
