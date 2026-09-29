// UAT G-contradictory：矛盾——深色/浅色目标摇摆，方案确认前改口
import { connect, snap, ensureOut } from './cdp-lib.mjs'
import {
  PERSONAS,
  autopilot,
  driveScenario,
  runRedLines,
  UAT_DIR,
  ensureCommandCodeConfigured,
  TASKS,
  taskLandedHints,
} from './uat-lib.mjs'
import { mkdirSync, readFileSync, unlinkSync, existsSync } from 'fs'

const TASK = TASKS.contradictory
const OUT = `${UAT_DIR}/G-contradictory`
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
  const ta = page.getByLabel('想解决的问题')
  await ta.fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/G-contradictory/00-workspace')
console.log('workspace ready')

await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const hints = taskLandedHints('contradictory')
if (!hints.some((h) => body.includes(h))) {
  console.log('no auto-send detected — sending task manually')
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.contradictory }
const result = await driveScenario('G-contradictory', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 70, pollMs: 5000, shotDir: OUT })
  await snap(page, 'uat/G-contradictory/99-final')
  return ap
})

const ev = result.events || []
const violations = result.violations || runRedLines(ev)
const assertions = {
  terminalResolved: result.terminal === 'resolved',
  redLines: violations.length === 0,
}
console.log('--- G-contradictory assertions ---')
console.log(
  JSON.stringify(
    { assertions, terminal: result.terminal, actions: result.actions, violations },
    null,
    2,
  ),
)
const pass = Object.values(assertions).every(Boolean)
console.log(pass ? 'PASS G-contradictory' : 'FAIL G-contradictory')
await browser.close()
process.exit(pass ? 0 : 1)
