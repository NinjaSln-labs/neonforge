// 通用人格 UAT：
//   NF_UAT_PERSONA=<legacy personas key> 或 argv[2]
//   --from-pool <id> | NF_UAT_POOL_ID=<id>  → 从 persona-pool.json 适配
import { connect, snap, ensureOut, dump } from './cdp-lib.mjs'
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
  readLatestTimeline,
  timelineWatermark,
} from './uat-lib.mjs'
import { toAutopilotPersona } from './persona-adapt.mjs'
import { assertProfile } from './persona-schema.mjs'
import {
  outsideProjectSideEffects,
  sysPromptLeak,
  boundaryProbeSent,
} from './persona-boundary-assert.mjs'
import { mkdirSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const fromPoolIdx = args.indexOf('--from-pool')
const poolId =
  (fromPoolIdx >= 0 ? args[fromPoolIdx + 1] : null) || process.env.NF_UAT_POOL_ID?.trim() || ''
const personaKey = (process.env.NF_UAT_PERSONA || (!poolId ? args[0] : '') || '').trim()

/** @type {ReturnType<typeof toAutopilotPersona> | null} */
let apPersona = null
/** @type {import('./persona-schema.mjs').PersonaSpec | null} */
let poolSpec = null

if (poolId) {
  const poolPath = join(__dirname, 'persona-pool.json')
  if (!existsSync(poolPath)) {
    console.error('missing persona-pool.json — run generate-persona-pool.mjs')
    process.exit(2)
  }
  const pool = JSON.parse(readFileSync(poolPath, 'utf8'))
  poolSpec = pool.find((p) => p.id === poolId) || null
  if (!poolSpec) {
    console.error('unknown pool id:', poolId)
    process.exit(2)
  }
  apPersona = toAutopilotPersona(poolSpec)
} else if (!personaKey || !PERSONAS[personaKey] || !TASKS[personaKey]) {
  console.error('usage: NF_UAT_PERSONA=<key> node uat-G-persona.mjs')
  console.error('   or: node uat-G-persona.mjs --from-pool <id>')
  console.error('unknown or missing persona:', personaKey || poolId || '(empty)')
  process.exit(2)
}

const label = apPersona?.label || PERSONAS[personaKey]?.label || personaKey || poolId
const TAG = poolId ? `G-pool-${poolId}` : `G-${personaKey}`
const TASK = apPersona?.task || TASKS[personaKey]
const OUT = `${UAT_DIR}/${TAG}`
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
const wantsWeb = Boolean(apPersona?.webAsk || PERSONAS[personaKey]?.webAsk)

if (await page.getByRole('button', { name: '从零开始' }).count()) {
  const ta = page.getByLabel('想解决的问题')
  await ta.fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, `uat/${TAG}/00-workspace`)
console.log('workspace ready')

let webBlocked = false
if (wantsWeb) {
  webBlocked = !(await ensureWebAccessEnabled(page))
  if (webBlocked) console.log('web_env: ensureWebAccess failed — skip autopilot')
}

await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const hints = apPersona?.taskHints || taskLandedHints(personaKey)
if (!hints.some((h) => body.includes(h))) {
  console.log('no auto-send detected — sending task manually')
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = apPersona || {
  ...PERSONAS[personaKey],
  __planRejects: 0,
  __interrupts: 0,
}
const pollMs = apPersona?.pollMs || (personaKey === 'impatient' ? 2500 : 5000)
const maxRounds = apPersona?.maxRounds || 80
const result = await driveScenario(TAG, async () => {
  if (webBlocked) {
    const startSeq = timelineWatermark()
    return {
      terminal: 'web_env',
      actions: ['ensureWebAccess:fail'],
      events: readLatestTimeline().filter((e) => e.seq > startSeq),
      startSeq,
    }
  }
  const ap = await autopilot(page, persona, {
    maxRounds,
    pollMs,
    shotDir: OUT,
    boundary: Boolean(apPersona?.boundary || personaKey === 'boundary'),
  })
  await snap(page, `uat/${TAG}/99-final`)
  return ap
})

const ev = result.events || []
const violations = result.violations || runRedLines(ev)
const planRejects = (result.actions || []).filter((a) => a.includes('reject-plan')).length
const interruptCount = persona.__interrupts || 0
const webToolCount = (() => {
  try {
    return readLatestTimeline().filter(
      (e) =>
        e.type === 'tool.requested' &&
        (e.detail?.name === 'web_search' || e.detail?.name === 'web_fetch'),
    ).length
  } catch {
    return 0
  }
})()

/** @type {Record<string, boolean>} */
const assertions = {
  terminalResolved: result.terminal === 'resolved',
  redLines: violations.length === 0,
  webAccess: wantsWeb ? !webBlocked : true,
}

if (poolSpec) {
  const { require } = assertProfile(poolSpec)
  if (require.planRejectsAtLeast != null) {
    assertions.planRejectsAtLeast =
      planRejects >= /** @type {number} */ (require.planRejectsAtLeast)
  }
  if (require.interruptsAtLeast != null) {
    assertions.interruptsAtLeast =
      interruptCount >= /** @type {number} */ (require.interruptsAtLeast)
  }
  if (require.webToolUsed) {
    assertions.webToolUsed = webToolCount > 0
  }
  if (require.boundaryProbeSent) {
    assertions.boundaryProbeSent = boundaryProbeSent(result.actions)
  }
  if (require.noOutsideWrite) {
    assertions.noOutsideWrite = outsideProjectSideEffects(ev).length === 0
  }
  if (require.noSysPromptLeak) {
    const uiFinal = await dump(page).catch(() => result.uiTail || '')
    assertions.noSysPromptLeak = sysPromptLeak(uiFinal).length === 0
  }
} else {
  if ((PERSONAS[personaKey].rejectPlan || 0) > 0) {
    assertions.planRejectsAtLeast = planRejects >= PERSONAS[personaKey].rejectPlan
  }
  if ((PERSONAS[personaKey].interrupt || 0) > 0) {
    assertions.interruptsAtLeast = interruptCount >= Math.min(4, PERSONAS[personaKey].interrupt)
  }
  if (PERSONAS[personaKey].webAsk) {
    assertions.webToolUsed = webToolCount > 0
  }
  if (personaKey === 'boundary') {
    assertions.boundaryProbeSent = boundaryProbeSent(result.actions)
  }
}

console.log(`--- ${TAG} (${label}) assertions ---`)
console.log(
  JSON.stringify(
    {
      assertions,
      terminal: result.terminal,
      planRejects,
      interruptCount,
      webToolCount,
      actions: result.actions,
      violations,
      poolId: poolId || undefined,
      assertTags: poolSpec ? assertProfile(poolSpec).tags : undefined,
    },
    null,
    2,
  ),
)
const pass = Object.values(assertions).every(Boolean)
console.log(pass ? `PASS ${TAG}` : `FAIL ${TAG}`)
await browser.close()
process.exit(pass ? 0 : 1)
