// UAT T1（易）：中性驱动 × 单文件待办 —— resolved + 红线 0
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

const TASK = TASKS.tier1
const OUT = `${UAT_DIR}/T1`
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
await snap(page, 'uat/T1/00-workspace')
console.log('workspace ready')

await page.waitForTimeout(3000)
const body = await page.locator('body').innerText()
if (!taskLandedHints('tier1').some((h) => body.includes(h))) {
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.neutral }
const result = await driveScenario('T1', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 60, pollMs: 5000, shotDir: OUT })
  await snap(page, 'uat/T1/99-final')
  return ap
})

const ev = result.events || []
const violations = result.violations || runRedLines(ev)
const assertions = {
  terminalResolved: result.terminal === 'resolved',
  redLines: violations.length === 0,
}
const pass = Object.values(assertions).every(Boolean)
console.log('--- T1 assertions ---')
console.log(
  JSON.stringify(
    { assertions, terminal: result.terminal, actions: result.actions, violations },
    null,
    2,
  ),
)
console.log(pass ? 'PASS T1' : 'FAIL T1')
await browser.close()
process.exit(pass ? 0 : 1)
