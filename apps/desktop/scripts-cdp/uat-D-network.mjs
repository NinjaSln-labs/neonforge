// UAT 场景 D——网络抖动（钩子缺口 #8）：chat 路径注入瞬态 400 → 单次重试 → 走完已解决
// 启动要求：NF_FORCE_CHAT_ERROR=400-once（勿设 NF_FORCE_NETWORK_ERROR，否则配置页验证也挂）
// Key：NEONFORGE_COMMANDCODE 或 NF_UAT_KEY_FILE
import { connect, snap, ensureOut, dump } from './cdp-lib.mjs'
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
import { execSync } from 'child_process'

const TASK = TASKS.network
const OUT = `${UAT_DIR}/D-network`
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

function readLiveLog() {
  try {
    return execSync('cat /tmp/nf-live.log 2>/dev/null | tail -c 200000', { encoding: 'utf8' })
  } catch {
    return ''
  }
}

const key = loadKey()
if (!key) throw new Error('empty key')

const { browser, page } = await connect()

if (await page.getByRole('button', { name: '验证并开始' }).count()) {
  await ensureCommandCodeConfigured(page, key)
}

if (await page.getByRole('button', { name: '从零开始' }).count()) {
  await page.getByLabel('想解决的问题').fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/D-network/00-workspace')
console.log('workspace ready')

await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const hints = taskLandedHints('network')
if (!hints.some((h) => body.includes(h))) {
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.silent }
const result = await driveScenario('D-network', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 60, pollMs: 8000, shotDir: OUT })
  await snap(page, 'uat/D-network/99-final')
  return ap
})

const uiFinal = await dump(page).catch(() => result.uiTail || '')
const log = readLiveLog()
const violations = result.violations || runRedLines(result.events || [])

const assertions = {
  terminalResolved: result.terminal === 'resolved',
  // 钩子命中 + 400 单次重试（streamChat 日志）
  chatHookFired: /TEST_HOOK forceChatError=\s*400-once/.test(log),
  chat400Retried: log.includes('http-400 transient — retrying once'),
  // 不误报 key 失效（UI）
  noKeyInvalid: !/key.?invalid|密钥无效|Key 无效|API Key 无效/i.test(uiFinal),
  redLines: violations.length === 0,
}
console.log('--- D-network assertions ---')
console.log(
  JSON.stringify(
    {
      assertions,
      terminal: result.terminal,
      actions: result.actions,
      violations,
      hookLines: log
        .split('\n')
        .filter((l) => /forceChatError|http-400 transient|key-invalid/i.test(l))
        .slice(-20),
    },
    null,
    2,
  ),
)
const pass = Object.values(assertions).every(Boolean)
console.log(pass ? 'PASS D-network' : 'FAIL D-network')
await browser.close()
process.exit(pass ? 0 : 1)
