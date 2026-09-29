// UAT G-impatient 全流程（Mac 本机）：读 Key → 验证 → 从零开始 → autopilot 急躁人格
// Key：环境变量 NEONFORGE_COMMANDCODE，或文件路径 NF_UAT_KEY_FILE（用后删除文件）
// 专属预期：插话 ≥6；forceTool 无死锁；相邻 message_sent 无同文双发；红线 0；已解决
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

const TASK = TASKS.impatient
const OUT = `${UAT_DIR}/G-impatient`
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

/** 同 reason 连续强制且中间无工具：≥3 次重逼才算死锁（偶发重逼允许） */
function forceToolDeadlocks(ev) {
  const forced = ev.filter((e) => e.type === 'execution.forced')
  const hits = []
  let streak = 1
  for (let i = 1; i < forced.length; i++) {
    const a = forced[i - 1]
    const b = forced[i]
    const sameReason = String(a.detail?.reason ?? '') === String(b.detail?.reason ?? '')
    // 仅 tool.requested 算推进（executed 空转不能洗死锁——A-027）
    const mid = ev.filter((e) => e.seq > a.seq && e.seq < b.seq && e.type === 'tool.requested')
    if (sameReason && mid.length === 0) {
      streak++
      if (streak >= 3)
        hits.push(`deadlock:forced@${a.seq}-${b.seq} reason=${a.detail?.reason} streak=${streak}`)
    } else {
      streak = 1
    }
  }
  return hits
}

/** 相邻 conversation.message_sent 同文本 = 双请求 */
function duplicateAdjacentSends(ev) {
  const sends = ev.filter((e) => e.type === 'conversation.message_sent')
  const hits = []
  for (let i = 1; i < sends.length; i++) {
    const a = String(sends[i - 1].detail?.content ?? '')
    const b = String(sends[i].detail?.content ?? '')
    if (a && a === b)
      hits.push(`dup-send seq=${sends[i - 1].seq}/${sends[i].seq} text=${a.slice(0, 40)}`)
  }
  return hits
}

const key = loadKey()
if (!key) throw new Error('empty key')

const { browser, page } = await connect()

// 从零：空 userData → 必须先过钥匙配置页（选源 + 填 Key + 验证）
await ensureCommandCodeConfigured(page, key)

if (await page.getByRole('button', { name: '从零开始' }).count()) {
  const ta = page.getByLabel('想解决的问题')
  await ta.fill(TASK)
  await page.getByRole('button', { name: '从零开始' }).click()
  console.log('clicked 从零开始')
}

await page.getByRole('button', { name: '发送' }).waitFor({ timeout: 120000 })
await snap(page, 'uat/G-impatient/00-workspace')
console.log('workspace ready')

await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const hints = taskLandedHints('impatient')
if (!hints.some((h) => body.includes(h))) {
  console.log('no auto-send detected — sending task manually')
  await page.locator('textarea').last().fill(TASK)
  await page.getByRole('button', { name: '发送' }).click()
}

const persona = { ...PERSONAS.impatient, __interrupts: 0 }
// 急躁：短轮询，捕捉「搭档处理中」窗口
const result = await driveScenario('G-impatient', async () => {
  const ap = await autopilot(page, persona, { maxRounds: 80, pollMs: 2500, shotDir: OUT })
  await snap(page, 'uat/G-impatient/99-final')
  return ap
})

const ev = result.events || []
const interruptActions = (result.actions || []).filter((a) => a.includes('interrupt#'))
// 动作串形如 interrupt#4x2 —— 用最终计数器或解析
const interruptCount =
  persona.__interrupts ||
  interruptActions.reduce((n, a) => {
    const m = a.match(/interrupt#(\d+)/)
    return m ? Math.max(n, Number(m[1])) : n
  }, 0)
const deadlocks = forceToolDeadlocks(ev)
const dups = duplicateAdjacentSends(ev)
const violations = result.violations || runRedLines(ev)

const assertions = {
  terminalResolved: result.terminal === 'resolved',
  interruptsAtLeast6: interruptCount >= 6,
  noForceToolDeadlock: deadlocks.length === 0,
  noDupAdjacentSend: dups.length === 0,
  redLines: violations.length === 0,
}
console.log('--- G-impatient assertions ---')
console.log(
  JSON.stringify(
    {
      assertions,
      interruptCount,
      interruptActions,
      deadlocks,
      dups,
      terminal: result.terminal,
      actions: result.actions,
      violations,
    },
    null,
    2,
  ),
)
const pass = Object.values(assertions).every(Boolean)
console.log(pass ? 'PASS G-impatient' : 'FAIL G-impatient')
await browser.close()
process.exit(pass ? 0 : 1)
