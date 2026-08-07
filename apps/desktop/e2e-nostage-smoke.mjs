import { _electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ============================================================================
// NeonForge 无阶段流程 —— 真实 API 冒烟验证（2026-08-07 v50 无阶段重构后）
// ============================================================================
// 观察 5 点（HANDOFF §3 无阶段新流程验证点）：
//   O1 目标确认：模型是否输出【目标确认：】标记（UI 识别目标已确认）
//   O2 能力检查：是否调 check-capability（能力视图）
//   O3 执行方案：是否输出【执行方案】块（含文件清单）
//   O4 动手产出：执行确认后是否真正产出（write/edit done / 文件出现）
//   O5 达成汇报：是否输出【已达成】
// 交互（模拟真实用户）：目标澄清候选点选/打字回答 → 执行确认卡确认 → 授权批准 → 观察产出
// 用法：node e2e-nostage-smoke.mjs   （Key 读 config 或 NF_TEST_KEY）
// ============================================================================

const KEY = process.env.NF_TEST_KEY
  || (() => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/neonforge-desktop/config/neonforge-config.json'), 'utf8'))
      return cfg.apiKeyPlain || ''
    } catch { return '' }
  })()
const WORK_DIR = '/tmp/nf-e2e-test'
const LOCK_DIR = path.join(os.homedir(), 'Library/Application Support/neonforge-desktop')

// ---- 观察点 ----
const obs = {
  O1_goalConfirm: { hit: false, at: '' },
  O2_checkCapability: { hit: false, at: '' },
  O3_execPlan: { hit: false, at: '' },
  O4_produced: { hit: false, at: '' },
  O5_doneReport: { hit: false, at: '' },
}
const log = (tag, msg) => console.log(`  [${tag}] ${msg}`)

// ---- 驱动（精简版——复用 e2e-0to1 基建模式） ----
class Driver {
  constructor(page) { this.page = page }

  async send(text) {
    await this.page.locator('.nf-chat__input textarea').fill(text)
    await this.page.locator('.nf-chat__input textarea').press('Meta+Enter')
  }

  async transcript() {
    const out = []
    const msgs = this.page.locator('.nf-msg')
    const n = await msgs.count()
    for (let i = 0; i < n; i++) {
      const m = msgs.nth(i)
      const cls = await m.getAttribute('class')
      const role = cls.includes('nf-msg--user') ? 'user' : 'assistant'
      const content = (await m.locator('.nf-msg__body').innerText().catch(() => ''))
      const candidates = (await m.locator('.nf-candidates__btn').allInnerTexts().catch(() => []))
      const tools = (await m.locator('.nf-toolcall').allInnerTexts().catch(() => []))
      out.push({ role, content, candidates, tools })
    }
    return out
  }

  async latestAssistant() {
    const t = await this.transcript()
    return [...t].reverse().find((m) => m.role === 'assistant' && m.content.trim()) ?? null
  }

  // 等模型完全空闲（working=0 + 无工具执行 + 就绪稳定 2 轮）返回最后一条模型回复
  async waitSettled(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs
    let last = null
    let sb = ''
    let stableCount = 0
    const settled = async () => {
      await this.page.waitForTimeout(1500)
      const t = await this.transcript()
      const msgs = t.filter((m) => m.content.trim())
      const lastMsg = msgs[msgs.length - 1]
      sb = await this.page.locator('.nf-statusbar').innerText().catch(() => '')
      const working = await this.page.locator('.nf-statusbar__dot--working').count().catch(() => 0)
      const runningTools = await this.page.locator('.nf-toolcall--running, .nf-toolcall--pending').count().catch(() => 0)
      const msgChanged = last && lastMsg && lastMsg.content !== last.content
      if (sb.includes('有操作待你批准') && lastMsg) return lastMsg
      if (sb.includes('说要做但还没动手') && lastMsg && !msgChanged) return lastMsg
      if (lastMsg && lastMsg.content.trim() && working === 0 && runningTools === 0 && sb.includes('就绪') && !msgChanged) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) { last = lastMsg; return null }
        stableCount++
        if (stableCount >= 2) return lastMsg
      } else stableCount = 0
      if (lastMsg) last = lastMsg
      return null
    }
    while (Date.now() < deadline) {
      const r = await settled()
      if (r) return r
    }
    if (sb.includes('就绪')) {
      log('⚠️', `waitSettled 超时但状态就绪——催一次「继续」再等 60s`)
      await this.send('继续')
      const d2 = Date.now() + 60000
      while (Date.now() < d2) {
        const r = await settled()
        if (r) return r
      }
    }
    throw new Error(`waitSettled 超时（状态栏="${sb}"）`)
  }

  async clickCandidate(text) {
    const clean = String(text).replace(/^[①-⑩]\s*\n?\s*/, '').trim()
    let btn = this.page.locator('.nf-candidates__btn').filter({ hasText: clean })
    if (await btn.count() > 0) { await btn.click(); return }
    const core = clean.split(/[：:]/)[0].replace(/[①-⑩\d\s.、]/g, '').slice(0, 4)
    if (core) {
      btn = this.page.locator('.nf-candidates__btn').filter({ hasText: core })
      if (await btn.count() > 0) { await btn.click(); return }
    }
    // 兜底：点第一个候选
    const first = this.page.locator('.nf-candidates__btn').first()
    if (await first.count() > 0) { await first.click(); return }
    throw new Error(`候选按钮「${text}」未找到`)
  }

  async approvePending() {
    const p = this.page
    const plan = p.locator('.nf-toolcall__approve', { hasText: '批准这批文件' })
    if (await plan.count() > 0) { await plan.first().click(); return '批准这批文件' }
    const batch = p.locator('.nf-toolcall__batch-approve')
    if (await batch.count() > 0) { await batch.first().click(); return '全部允许并记住' }
    const remember = p.locator('.nf-toolcall__remember')
    if (await remember.count() > 0) { await remember.first().click(); return '允许并记住' }
    const approve = p.locator('.nf-toolcall__approve')
    if (await approve.count() > 0) { await approve.first().click(); return '允许执行' }
    return null
  }

  async execCardVisible() {
    return (await this.page.locator('.nf-exec-card').count()) > 0
  }
  async clickExecConfirm() {
    const btn = this.page.getByRole('button', { name: /确认，开始执行/ })
    if (await btn.count() > 0) { await btn.click(); return true }
    return false
  }
  async toolCalls() {
    const t = await this.transcript()
    return t.flatMap((m) => m.tools.map((tool) => ({ msg: m.content, tool })))
  }
}

// ---- 观察点检测 ----
function checkObservations(content, toolsText, obs) {
  if (!obs.O1_goalConfirm.hit && /【目标确认/.test(content)) { obs.O1_goalConfirm.hit = true; obs.O1_goalConfirm.at = content.slice(0, 60) }
  if (!obs.O3_execPlan.hit && /【执行方案/.test(content)) { obs.O3_execPlan.hit = true; obs.O3_execPlan.at = content.slice(0, 80) }
  if (!obs.O5_doneReport.hit && /【已达成/.test(content)) { obs.O5_doneReport.hit = true; obs.O5_doneReport.at = content.slice(0, 60) }
  if (!obs.O2_checkCapability.hit && /check-capability/.test(toolsText)) { obs.O2_checkCapability.hit = true; obs.O2_checkCapability.at = toolsText.slice(0, 80) }
  if (!obs.O4_produced.hit && /已写入|已修改|写入|修改.*成功/.test(toolsText) && /write|edit/.test(toolsText)) { obs.O4_produced.hit = true; obs.O4_produced.at = toolsText.slice(0, 80) }
}

// ---- 主流程 ----
async function main() {
  console.log('=== NeonForge 无阶段流程真实 API 冒烟 ===\n')
  if (!KEY) { console.log('❌ 无可用 API Key'); process.exit(1) }
  console.log(`Key: ${KEY.slice(0, 5)}…${KEY.slice(-3)}（脱敏）\n`)
  fs.mkdirSync(WORK_DIR, { recursive: true })
  // 清理单实例锁（坑 15）
  try { for (const f of fs.readdirSync(LOCK_DIR)) { if (f.startsWith('Singleton')) fs.rmSync(path.join(LOCK_DIR, f), { force: true }) } } catch {}

  let app = null
  try {
    app = await _electron.launch({
      args: ['.'],
      env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173', NF_TEST_PROJECT: WORK_DIR, ELECTRON_RUN_AS_NODE: '' }
    })
    const page = await app.firstWindow()
    page.on('console', (m) => { const t = m.text(); if (t.includes('[debug]') || t.includes('[conversation]')) console.log('  [page]', t.slice(0, 150)) })
    await page.waitForSelector('.nf-start', { timeout: 20000 })
    await page.evaluate(() => {
      try { localStorage.removeItem('nf-session'); localStorage.removeItem('nf-problems'); localStorage.removeItem('nf-delegate-lowrisk') } catch {}
    })
    await page.evaluate((k) => window.neonforge.config.setKey(k), KEY)
    // 从零开始 + 输入需求（场景 A：起始页填）
    await page.locator('.nf-start__input').fill('我想做一个3D设计游戏，网页打开就能玩，发给朋友玩，先做个能玩的版本')
    await page.locator('.nf-start__input').press('Enter')
    await page.waitForSelector('.nf-chat__input textarea', { timeout: 20000 })

    const driver = new Driver(page)
    let rounds = 0
    const MAX_ROUNDS = 40
    let execConfirmed = false
    const deadline = Date.now() + 900000 // 15 分钟总超时

    console.log('── 开始无阶段流程（目标确认 → 能力检查 → 执行方案 → 执行确认 → 达成）──\n')
    while (Date.now() < deadline && rounds < MAX_ROUNDS) {
      rounds++
      const msg = await driver.waitSettled(120000)
      if (!msg) { await driver.page.waitForTimeout(2000); continue }
      const toolsText = msg.tools.join(' | ')
      checkObservations(msg.content, toolsText, obs)
      // 打印本轮
      console.log(`\n── 轮 ${rounds} ──`)
      console.log(`  🤖 模型：${msg.content.slice(0, 160).replace(/\n/g, ' ')}${msg.content.length > 160 ? '…' : ''}`)
      if (msg.candidates.length > 0) console.log(`  🔘 候选：${msg.candidates.slice(0, 4).join(' | ')}`)
      if (msg.tools.length > 0) console.log(`  🛠 工具：${msg.tools.slice(0, 3).join(' | ')}`)

      // === 决策（模拟真实用户） ===
      // 0. 授权卡优先（工具卡显示「需要授权」——批准，绝不打断）
      if (/需要授权|允许执行|允许并记住|批准这批文件/.test(toolsText)) {
        const ap = await driver.approvePending()
        log('🔓', `批准授权：${ap ?? '(无按钮)'}`)
        continue
      }
      // 1. 执行确认卡（目标确认后出现——确认执行；仅当模型已输出【目标确认】标记才点——防目标未确认过早确认）
      if (!execConfirmed && obs.O1_goalConfirm.hit && await driver.execCardVisible()) {
        const ok = await driver.clickExecConfirm()
        if (ok) {
          execConfirmed = true
          log('✅', '点击「确认，开始执行」——观察模型是否动手产出（O4）')
          continue
        }
      }
      // 2. 候选按钮（目标澄清）——优先点「射击/网页/朋友/能玩」相关，否则第一个
      if (msg.candidates.length > 0) {
        const pref = msg.candidates.find((o) => /射击|网页|朋友|能玩|简单/.test(o))
        const pick = pref ?? msg.candidates[0]
        log('🧑', `点选候选：「${pick}」`)
        await driver.clickCandidate(pick)
        continue
      }
      // 3. 模型问开放问题（目标澄清）——按问题内容对答（12:21 教训：答非所问会带偏模型「我看你一直重复这句」）
      if (/[?？]/.test(msg.content) && /(做什么|哪种|给谁|在哪儿|算完|什么样|理解|确认|对吗|好吗|行吗|要不要|还是|具体|玩法)/.test(msg.content)) {
        const c = msg.content
        const ans = /(玩法|做什么|哪种|什么样|具体|怎么玩)/.test(c) ? '搭积木玩法，能放方块、拖拽、上色'
          : /(给谁|谁玩|朋友|自己)/.test(c) ? '发给朋友玩'
          : /(在哪儿|哪里|电脑|手机|网页|平台)/.test(c) ? '网页打开就能玩'
          : /(可以吗|确认|对吗|好吗|行吗|点头|同意|方案)/.test(c) ? '可以'
          : execConfirmed ? '可以，继续' : '你按合适的来'
        log('🧑', `回答：「${ans}」`)
        await driver.send(ans)
        continue
      }
      // 4. 模型陈述/汇报——
      if (/【已达成|已达成|全部完成|都完成了|已经完成|做完了|写好了|写完了|部署好了|修好了/.test(msg.content)) {
        log('✅', '模型完成汇报——尝试收尾（O5）')
        checkObservations(msg.content, toolsText, obs)
        if (obs.O5_doneReport.hit || /【已达成/.test(msg.content)) {
          log('🏁', '收到【已达成】——验证完成')
          break
        }
        await driver.send('确认已解决，谢谢')
        await driver.page.waitForTimeout(3000)
        break
      }
      // 5. 模型提示卡住 → 催「继续」
      if (/说要做但还没动手|回复.*继续/.test(msg.content)) {
        log('🧑', '模型提示卡住——回复「继续」')
        await driver.send('继续')
        continue
      }
      // 6. 其他（模型在干活/等授权链）→ 等
      log('⏳', '模型在推进——等下一轮')
      await driver.page.waitForTimeout(2500)
    }

    // === 报告 ===
    console.log('\n\n══════════ 无阶段流程真实 API 验证报告 ══════════')
    const checks = [
      ['O1 目标确认【目标确认：】标记', obs.O1_goalConfirm],
      ['O2 能力检查 check-capability', obs.O2_checkCapability],
      ['O3 执行方案【执行方案】块', obs.O3_execPlan],
      ['O4 执行确认后动手产出（write/edit）', obs.O4_produced],
      ['O5 达成汇报【已达成】', obs.O5_doneReport],
    ]
    let allOk = true
    for (const [name, o] of checks) {
      const ok = o.hit
      if (!ok) allOk = false
      console.log(`  ${ok ? '✅' : '❌'} ${name}${o.at ? `\n      ↳ ${o.at}` : ''}`)
    }
    console.log(`\n${allOk ? '✅ 无阶段流程 5 点全通过' : '⚠️ 有观察点未命中——见上方明细'}（${Math.round((Date.now() - (Date.now() - 0)) / 1000)}s，${rounds} 轮）`)
    return allOk
  } catch (e) {
    console.log(`\n❌ 冒烟异常: ${String(e).slice(0, 300)}`)
    return false
  } finally {
    if (app) {
      try { await app.close() } catch {}
      try {
        for (const f of fs.readdirSync(LOCK_DIR)) { if (f.startsWith('Singleton')) fs.rmSync(path.join(LOCK_DIR, f), { force: true }) }
      } catch {}
    }
  }
}

main().then((ok) => { process.exit(ok ? 0 : 1) })
