// UAT T2（中）：中性驱动 × 两页小站 —— resolved + ≥2 相关写文件 + 红线 0
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

/** write/edit 路径去重（html 相关）。path 多在 tool.requested.args；executed 常只有 {name}（p000130） */
function producedHtmlFiles(ev) {
  const paths = new Set()
  for (const e of ev) {
    if (e.type !== 'tool.requested' && e.type !== 'tool.executed' && e.type !== 'tool.completed')
      continue
    const name = e.detail?.name
    if (name !== 'write' && name !== 'edit') continue
    const p = String(e.detail?.args?.path ?? e.detail?.file ?? e.detail?.args?.file ?? '')
    if (/\.html?$/i.test(p) || /index|about/i.test(p))
      paths.add(p.replace(/^.*\//, '').toLowerCase())
  }
  return [...paths]
}

if (process.argv.includes('--selfcheck')) {
  const ev = [
    { type: 'tool.requested', detail: { name: 'write', args: { path: '/tmp/p/index.html' } } },
    { type: 'tool.executed', detail: { name: 'write' } },
    { type: 'tool.requested', detail: { name: 'write', args: { path: '/tmp/p/about.html' } } },
    { type: 'tool.executed', detail: { name: 'write' } },
  ]
  const got = producedHtmlFiles(ev)
  if (got.length < 2) throw new Error(`selfcheck fail: ${JSON.stringify(got)}`)
  console.log('PASS T2 selfcheck', got)
  process.exit(0)
}

const TASK = TASKS.tier2
const OUT = `${UAT_DIR}/T2`
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
await snap(page, 'uat/T2/00-workspace')
console.log('workspace ready')

await page.waitForTimeout(3000)
const body = await page.locator('body').innerText()
if (!taskLandedHints('tier2').some((h) => body.includes(h))) {
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.neutral }
const result = await driveScenario('T2', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 70, pollMs: 5000, shotDir: OUT })
  await snap(page, 'uat/T2/99-final')
  return ap
})

const ev = result.events || []
const htmlFiles = producedHtmlFiles(ev)
const violations = result.violations || runRedLines(ev)
const assertions = {
  terminalResolved: result.terminal === 'resolved',
  multiFile: htmlFiles.length >= 2,
  redLines: violations.length === 0,
}
const pass = Object.values(assertions).every(Boolean)
console.log('--- T2 assertions ---')
console.log(
  JSON.stringify(
    { assertions, htmlFiles, terminal: result.terminal, actions: result.actions, violations },
    null,
    2,
  ),
)
console.log(pass ? 'PASS T2' : 'FAIL T2')
await browser.close()
process.exit(pass ? 0 : 1)
