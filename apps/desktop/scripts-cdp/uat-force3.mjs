// UAT 二轮探针 3（修复版部署后）：T2 触发强制卡 → 点「确认执行」→ 断言续转（自动 send + 模型继续）
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { readLatestTimeline, UAT_DIR } from './uat-lib.mjs'
import { execSync } from 'child_process'

await ensureOut()
execSync(`mkdir -p ${UAT_DIR}/force3`)
const { browser, page } = await connect()
const mark = readLatestTimeline().slice(-1)[0]?.seq ?? 0
console.log('watermark', mark)

// 1. 若有澄清候选（①②③）点第一个；若已有 goal 卡则跳过
const cand = page.getByRole('button', { name: /^[①②③④]/ }).first()
try {
  await cand.click({ timeout: 15000, force: true })
  console.log('clicked clarify candidate ①')
} catch {
  console.log('no clarify candidate (可能已有卡)')
}

// 2. 等 goal 卡
await page.getByRole('button', { name: '确认目标' }).waitFor({ timeout: 240000 })
await snap(page, `${UAT_DIR}/force3/01-goal-card.png`)
console.log('goal card visible')

// 3. pending 期间连打 3 次文本
for (let i = 1; i <= 3; i++) {
  await page.waitForTimeout(2000)
  const inp = page.locator('textarea').last()
  await inp.fill(i === 1 ? '就按你想的做呗' : i === 2 ? '别问了赶紧开始' : '直接开干，别再确认了')
  await page.locator('text=发送').last().click({ timeout: 5000 })
  console.log(`text #${i} sent`)
  for (let w = 0; w < 50; w++) {
    if ((await page.locator('.nf-forcedcard').count()) > 0) break
    await page.waitForTimeout(2000)
  }
  await snap(page, `${UAT_DIR}/force3/0${i + 1}-after-text${i}.png`)
  if ((await page.locator('.nf-forcedcard').count()) > 0) {
    console.log(`FORCED CARD live after text #${i}`)
    break
  }
}
if ((await page.locator('.nf-forcedcard').count()) === 0) {
  console.log('FAIL: forced card never appeared')
  await browser.close()
  process.exit(1)
}

// 4. 点「确认执行」→ 断言续转：自动 send 确认语 + 模型继续（plan 卡/工具执行/working）
await page.locator('.nf-forcedcard__btn--ok').click({ timeout: 10000, force: true })
console.log('clicked 确认执行')
await page.waitForTimeout(2500)
const bodyText = await page.locator('body').innerText()
const continued = bodyText.includes('确认，目标清楚了')
console.log('continuation message present:', continued)
await snap(page, `${UAT_DIR}/force3/05-after-confirm.png`)

// 等模型回合继续（180s 内出现 plan 卡或其他推进）
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

// 5. timeline 取证
await page.waitForTimeout(2000)
const ev = readLatestTimeline().filter((e) => e.seq > mark)
const hits = ev.filter((e) =>
  [
    'dialogue.loop_guard',
    'dialogue.forced_clarify',
    'session.pending_set',
    'task.goal_confirmed',
    'decision.resolved',
    'conversation.message_sent',
  ].includes(e.type),
)
console.log('--- timeline hits (tail) ---')
for (const e of hits.slice(-14))
  console.log(e.seq, e.type, JSON.stringify(e.detail ?? {}).slice(0, 110))
await snap(page, `${UAT_DIR}/force3/99-final.png`)
await browser.close()
