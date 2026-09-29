// UAT T3（难）：中性+webAsk × 须外网调研作品集 —— webTool + 外网开 + 红线 0；
// 终点：resolved，或超时但仍有用户决策卡可点
import { connect, snap, ensureOut } from './cdp-lib.mjs'
import {
  PERSONAS,
  autopilot,
  driveScenario,
  runRedLines,
  UAT_DIR,
  ensureCommandCodeConfigured,
  ensureWebAccessEnabled,
  TASKS,
  taskLandedHints,
} from './uat-lib.mjs'
import { mkdirSync, readFileSync, unlinkSync, existsSync } from 'fs'

const TASK = TASKS.tier3
const OUT = `${UAT_DIR}/T3`
mkdirSync(OUT, { recursive: true })
await ensureOut()

function loadKey() {
  const fromEnv = process.env.NEONFORGE_COMMANDCODE?.trim()
  if (fromEnv) return fromEnv
  const f = process.env.NF_UAT_KEY_FILE
  if (f && existsSync(f)) {
    const k = readFileSync(f, 'utf8').trim()
    try {
      unlinkSync(f)
    } catch {
      /* ignore */
    }
    return k
  }
  throw new Error('missing NEONFORGE_COMMANDCODE / NF_UAT_KEY_FILE')
}

const key = loadKey()
if (!key) throw new Error('empty key')

const { browser, page } = await connect()
await ensureCommandCodeConfigured(page, key)

if (await page.getByRole('button', { name: '从零开始' }).count()) {
  await page.getByLabel('想解决的问题').fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/T3/00-workspace')
console.log('workspace ready')

const webOk = await ensureWebAccessEnabled(page)
console.log('web access enabled:', webOk)

await page.waitForTimeout(2000)
const body = await page.locator('body').innerText()
if (!taskLandedHints('tier3').some((h) => body.includes(h))) {
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.neutral, webAsk: true }
const result = await driveScenario('T3', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 80, pollMs: 4000, shotDir: OUT })
  await snap(page, 'uat/T3/99-final')
  return ap
})

const ev = result.events || []
const webToolReqs = ev.filter(
  (e) =>
    e.type === 'tool.requested' &&
    (e.detail?.name === 'web_search' || e.detail?.name === 'web_fetch'),
)
const researchProposeNudges = ev.filter(
  (e) =>
    e.type === 'conversation.system_nudge' &&
    (e.detail?.kind === 'protocol' || String(e.detail?.content ?? '').includes('propose_goal')),
)
const violations = result.violations || runRedLines(ev)
const decisionBtn =
  (await page.getByRole('button', { name: '确认执行' }).count()) +
  (await page.getByRole('button', { name: '已解决' }).count()) +
  (await page.getByRole('button', { name: '修改方案' }).count()) +
  (await page.getByRole('button', { name: '确认目标' }).count())
const stuckAtUser = result.terminal !== 'resolved' && decisionBtn > 0

const assertions = {
  terminalOk: result.terminal === 'resolved' || stuckAtUser,
  webAccessUiOk: webOk,
  webToolUsed: webToolReqs.length > 0,
  redLines: violations.length === 0,
}
const pass = Object.values(assertions).every(Boolean)
console.log('--- T3 assertions ---')
console.log(
  JSON.stringify(
    {
      assertions,
      stuckAtUser,
      webToolCount: webToolReqs.length,
      researchProposeNudgeCount: researchProposeNudges.length,
      terminal: result.terminal,
      actions: result.actions,
      violations,
    },
    null,
    2,
  ),
)
console.log(pass ? 'PASS T3' : 'FAIL T3')
await browser.close()
process.exit(pass ? 0 : 1)
