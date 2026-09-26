// UAT 二轮探针 2：强制卡 live 触发——T2 路径（goal 卡 pending 期间用户文本回复 ×3）
// 流程：新问题 → 发任务 → 等 goal 卡 → 不点卡、连打 3 次文本 → 断言 .nf-forcedcard
import { connect, snap, dump, ensureOut } from './cdp-lib.mjs'
import { readLatestTimeline, UAT_DIR } from './uat-lib.mjs'
import { execSync } from 'child_process'

await ensureOut()
execSync(`mkdir -p ${UAT_DIR}/force2`)
const { browser, page } = await connect()
const mark = readLatestTimeline().slice(-1)[0]?.seq ?? 0
console.log('watermark', mark)

// 1. 新问题入口
await page.getByRole('button', { name: '新问题' }).click({ timeout: 8000, force: true })
await page.waitForTimeout(1200)
const input = page.locator('textarea').last()
await input.fill('写一个猜数字小游戏网页')
await page.locator('text=发送').last().click({ timeout: 5000 })
console.log('task sent')

// 2. 等 goal 卡
await page.getByRole('button', { name: '确认目标' }).waitFor({ timeout: 240000 })
await snap(page, `${UAT_DIR}/force2/01-goal-card.png`)
console.log('goal card visible（pending=goal，开始 T2 文本循环）')

// 3. pending 期间连打 3 次文本（不点卡——A-024 循环形态）
for (let i = 1; i <= 3; i++) {
  await page.waitForTimeout(2500)
  const inp = page.locator('textarea').last()
  await inp.fill(
    i === 1
      ? '就按你说的做，直接开始'
      : i === 2
        ? '别问了，直接确认开始'
        : '我说了直接开始，别再确认了',
  )
  await page.locator('text=发送').last().click({ timeout: 5000 })
  console.log(`text reply #${i} sent`)
  // 等本回合模型回复（最多 100s）
  for (let w = 0; w < 50; w++) {
    if ((await page.locator('.nf-forcedcard').count()) > 0) break
    await page.waitForTimeout(2000)
  }
  await snap(page, `${UAT_DIR}/force2/0${i + 1}-after-text${i}.png`)
  if ((await page.locator('.nf-forcedcard').count()) > 0) {
    console.log(`FORCED CARD live after text #${i}`)
    break
  }
}

const txt = await dump(page)
console.log('--- UI tail ---')
console.log(txt.split('\n').slice(-35).join('\n'))

// 4. timeline 取证
await page.waitForTimeout(2000)
const ev = readLatestTimeline().filter((e) => e.seq > mark)
const hits = ev.filter((e) =>
  [
    'dialogue.loop_guard',
    'dialogue.forced_clarify',
    'card.rejected',
    'session.pending_set',
    'message.user_sent',
  ].includes(e.type),
)
console.log('--- timeline hits ---')
for (const e of hits) console.log(e.seq, e.type, JSON.stringify(e.detail ?? {}).slice(0, 120))
await snap(page, `${UAT_DIR}/force2/99-final.png`)
await browser.close()
