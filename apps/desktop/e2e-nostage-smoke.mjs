import { _electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ============================================================================
// NeonForge 无阶段流程 —— 真实 API 冒烟验证（2026-08-07 v50 无阶段重构后）
// ============================================================================
// 观察 4 点（HANDOFF §3 无阶段新流程验证点；O2 已由环境注入替代——2026-08-08 O2 处理结论：
// envHint 内部预检注入系统提示，模型无需显式调 check-capability（且静默化后工具卡隐藏 DOM 检测不到）——从验证点移除）：
//   O1 目标确认：模型是否输出【目标确认：】标记（UI 识别目标已确认）
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
  // 2026-08-13 同 e2e-0to1 卡死修复三件套：① 进展指纹含工具卡——tool-only 长链持续推进窗口顺延（防固定
  // 120s 窗口误杀合法长链：write 10+ 文件 / npm install 120s+）② 状态栏读取容错（失败/为空不据此判忙）
  // ③ 长空闲兜底：窗口耗尽无进展 → 返回最后一条已知回复（上层去重/推动），不无条件 throw
  async waitSettled(timeoutMs = 120000) {
    let windowEnd = Date.now() + timeoutMs
    const hardDeadline = Date.now() + timeoutMs * 4
    let last = null
    let sb = ''
    let stableCount = 0
    let lastFp = ''
    let idleSince = Date.now()
    const settled = async () => {
      await this.page.waitForTimeout(1500)
      const t = await this.transcript()
      // 2026-08-08 waitSettled bug 修复：只取 assistant 消息——用户消息（如确认按钮 send 的「确认，按方案执行」）
      // 不能当模型回复返回（否则主循环拿到用户消息就 break，模型实际产出被跳过——O4 假 miss）
      const msgs = t.filter((m) => m.role === 'assistant' && m.content.trim())
      const lastMsg = msgs[msgs.length - 1]
      sb = await this.page.locator('.nf-statusbar').innerText().catch(() => '')
      const working = await this.page.locator('.nf-statusbar__dot--working').count().catch(() => 0)
      const runningTools = await this.page.locator('.nf-toolcall--running, .nf-toolcall--pending').count().catch(() => 0)
      const fp = t.map((m) => `${m.role}|${m.content.slice(0, 30)}|${m.tools.length}|${m.tools.join('|').slice(0, 40)}`).join('~')
      if (fp !== lastFp) { lastFp = fp; idleSince = Date.now() }
      const msgChanged = last && lastMsg && lastMsg.content !== last.content
      if (sb.includes('有操作待你批准') && lastMsg) return lastMsg
      if (sb.includes('说要做但还没动手') && lastMsg && !msgChanged) return lastMsg
      const ready = sb === '' ? (working === 0 && runningTools === 0) : sb.includes('就绪')
      if (lastMsg && lastMsg.content.trim() && ready && working === 0 && runningTools === 0 && !msgChanged) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) { last = lastMsg; return null }
        stableCount++
        if (stableCount >= 2) return lastMsg
      } else stableCount = 0
      if (lastMsg) last = lastMsg
      return null
    }
    while (Date.now() < hardDeadline) {
      const r = await settled()
      if (r) return r
      const busy = sb.includes('搭档处理中') || sb.includes('工具执行中')
      const progressing = Date.now() - idleSince < 25000
      if (Date.now() < windowEnd) continue
      if (busy && progressing) { windowEnd = Date.now() + 30000; continue }
      if (last) {
        log('⚠️', `waitSettled 窗口耗尽（${timeoutMs / 1000}s）——返回最后一条已知回复（${last.content.slice(0, 30)}…）`)
        return last
      }
      windowEnd = Date.now() + 30000
    }
    throw new Error(`waitSettled 硬超时 ${(timeoutMs * 4) / 1000}s（状态栏="${sb}"，最后消息="${last?.content.slice(0, 40) ?? ''}"）`)
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
  // 2026-08-14 O1 放宽（模型输出「目标确认：」无【】括号——语义命中，非严格块约定）
  if (!obs.O1_goalConfirm.hit && /【目标确认|目标确认：/.test(content)) { obs.O1_goalConfirm.hit = true; obs.O1_goalConfirm.at = content.slice(0, 60) }
  if (!obs.O3_execPlan.hit && /【执行方案/.test(content)) { obs.O3_execPlan.hit = true; obs.O3_execPlan.at = content.slice(0, 80) }
  if (!obs.O5_doneReport.hit && /【已达成/.test(content)) { obs.O5_doneReport.hit = true; obs.O5_doneReport.at = content.slice(0, 60) }
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
    // 2026-08-14 40 → 150（tool-only 授权链实测：bash 高危逐个批准是产品设计——npm install/起服务/验证链 30-60 轮正常；
    // 40 轮在「写文件 + 装依赖 + 起服务」长链中耗尽——误判流程未收敛）
    const MAX_ROUNDS = 150
    let goalConfirmedClicked = false
    let execConfirmed = false
    const startTime = Date.now()
    const deadline = Date.now() + 900000 // 15 分钟总超时
    // 2026-08-08 waitSettled bug 修复：lastProcessed 去重 + idleStreak 停住判定——
    // 模型停住（每轮返回同一条旧消息——「静止当稳定回复」）→ 连续 2 次同消息 = 无新动作 → break（不再假 40 轮空转）
    let lastProcessed = ''
    let idleStreak = 0
    const MAX_IDLE = 2

    console.log('── 开始无阶段流程（目标确认 → 能力检查 → 执行方案 → 执行确认 → 达成）──\n')
    while (Date.now() < deadline && rounds < MAX_ROUNDS) {
      rounds++
      // 2026-08-13 观察点检测移到循环开头（全 transcript 幂等——obs.hit 防重复）：waitSettled 只返回最后一条
      // 消息，【目标确认】/【执行方案】标记若在中间消息里会被跳过（本轮冒烟实测：O1 标记被后续消息覆盖 → 漏检）
      const fullT = await driver.transcript()
      for (const m of fullT) {
        if (m.role !== 'assistant') continue
        checkObservations(m.content, m.tools.join(' | '), obs)
      }
      // 2026-08-13 卡片优先（同 e2e-0to1 handleCards）：tool-only 链期间确认卡/授权卡出现在**空内容消息**里
      // （assistant-done content:'' + tool-call）——waitSettled 过滤空消息只返回旧消息 → 主循环判「同消息停住」
      // → 授权卡永不被点 → 模型等批准 → 流程提前结束（本轮冒烟实测：write×3 + bash 授权卡全被跳过）。每轮先查卡
      const confirmBtns = ['确认目标', '确认执行', '已解决']
      let cardClicked = false
      for (const name of confirmBtns) {
        const btn = page.getByRole('button', { name })
        if (await btn.count() > 0) { await btn.first().click(); cardClicked = true; log('✅', `点确认卡「${name}」`); break }
      }
      if (!cardClicked) {
        const ap = await driver.approvePending()
        if (ap) { cardClicked = true; log('🔓', `批准授权：${ap}`) }
      }
      if (cardClicked) continue
      const msg = await driver.waitSettled(120000)
      if (!msg) { await driver.page.waitForTimeout(2000); continue }
      // 同消息去重（坑 53 教训——同消息重复处理）：模型停住无新回复 → 连续 MAX_IDLE 次 → 判定流程结束
      if (msg.content === lastProcessed) {
        // 2026-08-13 模型等授权/工具执行中**不算停住**（tool-only 链连续 bash 授权——本轮实测 idleStreak 误判 break）：
        // waitSettled 在「有操作待你批准」时返回旧消息 → 同消息 → 停住判定；但模型在等授权/干活 → 下一轮卡片优先会批准
        const aprox = await page.locator('.nf-toolcall__approve, .nf-toolcall__batch-approve, .nf-toolcall__remember, .nf-toolcall__approveall').count().catch(() => 0)
        const busyDots = await page.locator('.nf-statusbar__dot--working').count().catch(() => 0)
        const runCards = await page.locator('.nf-toolcall--running, .nf-toolcall--pending').count().catch(() => 0)
        if (aprox > 0 || busyDots > 0 || runCards > 0) {
          idleStreak = 0
          log('⏳', '模型在等授权/工具执行中——不算停住，继续等')
          await driver.page.waitForTimeout(2000)
          continue
        }
        idleStreak++
        log('⏳', `模型停住（同一条消息连续 ${idleStreak} 次无新回复）——等待后仍无动作则结束本轮`)
        if (idleStreak >= MAX_IDLE) {
          log('🏁', `模型已停住（${MAX_IDLE} 轮无新回复）——无阶段流程到此结束（剩余观察点未命中）`)
          break
        }
        await driver.page.waitForTimeout(3000)
        continue
      }
      idleStreak = 0
      lastProcessed = msg.content
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
      // 1. 确认卡片（2026-08-07 用户决策——行业共识：结构化确认替代确认词）：
      //    目标确认卡【确认目标】→ 目标确认 + 执行确认卡出现 →【确认执行】→ executionConfirmed → forceTool 强制产出（O4 观察）
      if (!goalConfirmedClicked && obs.O1_goalConfirm.hit) {
        const gc = await page.getByRole('button', { name: '确认目标' }).count()
        if (gc > 0) {
          log('✅', 'O1 命中——点「确认目标」→ 观察是否出现执行确认卡')
          await page.getByRole('button', { name: '确认目标' }).click()
          goalConfirmedClicked = true
          continue
        }
      }
      if (goalConfirmedClicked && !execConfirmed) {
        const ec = await page.getByRole('button', { name: '确认执行' }).count()
        if (ec > 0) {
          log('✅', '执行确认卡——点「确认执行」——观察模型是否动手产出（O4）')
          await page.getByRole('button', { name: '确认执行' }).click()
          execConfirmed = true
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
      // 2.5 2026-08-13 冒烟复验暴露：模型「陈述句等待」（无问号无候选——「我先确认一下你的想法…再动手」）→
      //    真实用户会主动接话（不接 = 模型真停 → idleStreak 误判流程结束）——按画像回复需求范围
      //    2026-08-14 修复：文案中性化（原写死「射击游戏」——与模型已确认的「装修游戏」冲突 → 模型困惑反问 → 需求漂移）
      if (/(确认一下|你的想法|再动手|定下来|先确认|想确认|了解一下|范围定)/.test(msg.content) && !/(【目标确认|【执行方案|【已达成)/.test(msg.content)) {
        log('🧑', '模型陈述等待——回复「对，就按这个来，直接做吧」')
        await driver.send('对，就按这个来，直接做吧')
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
      // 5. 模型提示卡住/承诺要做（2026-08-14 放宽：模型「已批准，现在写入文件」= 说要做没动手——isActionPromise 语义）→ 催「继续」
      if (/说要做但还没动手|回复.*继续|现在写入|马上|这就|直接开写|开始写|准备写/.test(msg.content)) {
        log('🧑', '模型提示卡住/承诺要做——回复「继续」')
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
    console.log(`\n${allOk ? '✅ 无阶段流程 4 点全通过' : '⚠️ 有观察点未命中——见上方明细'}（${Math.round((Date.now() - startTime) / 1000)}s，${rounds} 轮）`)
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
