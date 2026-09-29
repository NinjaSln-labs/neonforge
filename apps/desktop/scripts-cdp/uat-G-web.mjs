// UAT G-web 全流程（Mac 本机）：真实用户「会查资料」——要网页前先上网查 CDN/配色
// 前置：设置开启外网检索；断言 web_search 或 web_fetch 被请求；红线 0；已解决
// Key：NEONFORGE_COMMANDCODE 或 NF_UAT_KEY_FILE
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
  readLatestTimeline,
} from './uat-lib.mjs'
import { mkdirSync, readFileSync, unlinkSync, existsSync } from 'fs'

const TASK = TASKS.webcurious
const OUT = `${UAT_DIR}/G-web`
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

// 从零：空 userData → 必须先过钥匙配置页
await ensureCommandCodeConfigured(page, key)

if (await page.getByRole('button', { name: '从零开始' }).count()) {
  const ta = page.getByLabel('想解决的问题')
  await ta.fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/G-web/00-workspace')
console.log('workspace ready')

const webOk = await ensureWebAccessEnabled(page)
console.log('web access enabled:', webOk)

await page.waitForTimeout(2000)
const body = await page.locator('body').innerText()
const hints = taskLandedHints('webcurious')
if (!hints.some((h) => body.includes(h))) {
  console.log('no auto-send — sending task manually')
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.webcurious }
const result = await driveScenario('G-web', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 80, pollMs: 4000, shotDir: OUT })
  await snap(page, 'uat/G-web/99-final')
  return ap
})

const ev = result.events || []
// web 工具常在 ensureWebAccess / 水位前已发出（任务 auto-send 竞态）——用整段 UD timeline 计，勿仅水位切片
const webToolReqs = readLatestTimeline().filter(
  (e) =>
    e.type === 'tool.requested' &&
    (e.detail?.name === 'web_search' || e.detail?.name === 'web_fetch'),
)
const webAskActed = (result.actions || []).some((a) => String(a).includes('web-ask'))
const violations = result.violations || runRedLines(ev)

const assertions = {
  terminalResolved: result.terminal === 'resolved',
  webAccessUiOk: webOk,
  webToolUsed: webToolReqs.length > 0,
  webAskSent: webAskActed,
  redLines: violations.length === 0,
}

const pass =
  assertions.terminalResolved &&
  assertions.webAccessUiOk &&
  assertions.webToolUsed &&
  assertions.redLines

console.log('--- G-web assertions ---')
console.log(
  JSON.stringify(
    {
      assertions,
      webToolCount: webToolReqs.length,
      webTools: webToolReqs.map((e) => ({
        seq: e.seq,
        name: e.detail?.name,
        args: e.detail?.args,
      })),
      terminal: result.terminal,
      actions: result.actions,
      violations,
    },
    null,
    2,
  ),
)
console.log(pass ? 'PASS G-web' : 'FAIL G-web')
process.exit(pass ? 0 : 1)
