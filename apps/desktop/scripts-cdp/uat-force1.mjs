// UAT 二轮探针 1：强制澄清卡 live 触发（ADR-010 rejectStreak 2 阈值——e68fc7f 对齐后的产品行为）
// 流程：从零开始 → 发任务 → 等 goal 卡 → 连点 2 次「重新描述」→ 断言 .nf-forcedcard 出现
// 取证：截图 + timeline 切片（dialogue.loop_guard / dialogue.forced_clarify / card.rejected）
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { timelineWatermark, readLatestTimeline, UAT_DIR } from './uat-lib.mjs'
import { execSync } from 'child_process'

await ensureOut()
execSync(`mkdir -p ${UAT_DIR}/force1`)

const { browser, page } = await connect()
const mark = timelineWatermark()
console.log('timeline watermark seq =', mark)

// 1. 从零开始
await page.locator('text=从零开始').first().click({ timeout: 8000 })
await page.waitForTimeout(1500)
const input = page.locator('textarea').last()
await input.fill('帮我弄个待办网页呗，能加点事、勾掉完成的那种，越简单越好')
await page.locator('text=发送').last().click({ timeout: 5000 })
console.log('task sent')

// 2. 等 goal 卡出现（真机模型轮次较慢）
const goalBtn = page.getByRole('button', { name: '确认目标' })
await goalBtn.waitFor({ timeout: 180000 })
await snap(page, `${UAT_DIR}/force1/01-goal-card.png`)
console.log('goal card visible')

// 3. 拒绝 ×2（每次自动 send；第 2 次拒绝后下一回合系统应直接置 system_clarify 卡）
const rejectBtn = page.getByRole('button', { name: '重新描述' })
for (let i = 1; i <= 2; i++) {
  await rejectBtn.click({ timeout: 10000, force: true })
  console.log(`reject #${i} clicked`)
  // 等下一张卡（模型重提议或强制卡）——最长 120s
  await page.waitForTimeout(1000)
  for (let w = 0; w < 60; w++) {
    const forced = await page.locator('.nf-forcedcard').count()
    if (forced > 0) break
    const anyCard = await page.locator('.nf-confirmcard').count()
    const busy =
      (await page.locator('text=思考中').count()) + (await page.locator('.nf-working').count())
    if (anyCard > 0 || busy === 0) break
    await page.waitForTimeout(2000)
  }
  const forced = await page.locator('.nf-forcedcard').count()
  await snap(page, `${UAT_DIR}/force1/0${i + 1}-after-reject${i}.png`)
  if (forced > 0) {
    console.log(`FORCED CARD live after reject #${i}`)
    const txt = await dump(page)
    console.log(txt.split('\n').slice(0, 60).join('\n'))
    break
  }
}

// 4. timeline 取证切片
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
await snap(page, `${UAT_DIR}/force1/99-final.png`)
await browser.close()
console.log('done. evidence: ' + UAT_DIR + '/force1/')
