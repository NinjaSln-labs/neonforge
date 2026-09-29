// UAT G-picky 全流程（Mac 本机）：读 Key → 验证 → 从零开始 → autopilot 挑剔人格
// Key：环境变量 NEONFORGE_COMMANDCODE，或文件路径 NF_UAT_KEY_FILE（用后删除文件）
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

const TASK = TASKS.picky
const OUT = `${UAT_DIR}/G-picky`
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

// —— 启动页：预填任务 + 从零开始（initialPrompt 会自动发送） ——
if (await page.getByRole('button', { name: '从零开始' }).count()) {
  const ta = page.getByLabel('想解决的问题')
  await ta.fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

// 等对话区发送按钮
await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/G-picky/00-workspace')
console.log('workspace ready')

// 若 auto-send 未发生（输入框仍空闲且无消息），补发一次
await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const hints = taskLandedHints('picky')
if (!hints.some((h) => body.includes(h))) {
  console.log('no auto-send detected — sending task manually')
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.picky, __planRejects: 0 }
const result = await driveScenario('G-picky', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 60, pollMs: 8000, shotDir: OUT })
  await snap(page, 'uat/G-picky/99-final')
  return ap
})

const ev = result.events || []
const planRejects = (result.actions || []).filter((a) => a.includes('reject-plan')).length
const rounds = (result.actions || []).length
const violations = result.violations || runRedLines(ev)
const assertions = {
  terminalResolved: result.terminal === 'resolved',
  planRejectsAtLeast2: planRejects >= 2,
  roundsLe30: rounds <= 30,
  redLines: violations.length === 0,
}
console.log('--- G-picky assertions ---')
console.log(
  JSON.stringify(
    {
      assertions,
      planRejects,
      rounds,
      terminal: result.terminal,
      actions: result.actions,
      violations,
    },
    null,
    2,
  ),
)
const pass = Object.values(assertions).every(Boolean)
console.log(pass ? 'PASS G-picky' : 'FAIL G-picky')
await browser.close()
process.exit(pass ? 0 : 1)
