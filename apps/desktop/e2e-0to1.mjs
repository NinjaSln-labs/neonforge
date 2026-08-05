import { _electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ============================================================================
// NeonForge 0-1 完整流程 E2E —— 真实用户模拟（领域模型驱动 · 逐步构建）
// ============================================================================
// 设计原则（用户 2026-08-05 指示）：
// ① 模拟真实用户：每一步 = 【读完整内容 → 理解模型在说什么 → 思考 → 决策（含理由）→ 操作 → 验证模型正常回复】
//    ——用户会看内容、思考、才决定，不会一通猛点。
// ② 不追求一次跑通全部：分阶段构建（PHASE=req|design|dev|test|deploy|all），
//    每个阶段先单独验证交互正确，再扩展下一阶段。
// ③ 可复现：这套测试用于以后还原用户实际操作、复现 bug（配合日志定位）。
// ④ 防假阳性：每阶段验证真实产出（设计有方案/开发有文件/测试有验证/部署有交付）。
//
// 用法：
//   PHASE=req  node e2e-0to1.mjs   # 只跑需求阶段（逐步验证）
//   PHASE=all  node e2e-0to1.mjs   # 完整流程
//   MODE=A/B   node e2e-0to1.mjs   # 场景（起始页填/不填）
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

// ============================================================================
// 领域模型
// ============================================================================

/** 对话消息（UI → 领域）：完整内容 + 候选按钮 + 工具卡 */
/** @typedef {{ role: 'user'|'assistant', content: string, candidates: string[], tools: string[] }} Msg */

/** 问题类别（需求阶段领域分类） */
const Q = { WHAT: '做什么', AUDIENCE: '给谁玩', PLATFORM: '在哪儿玩', DONE: '做成什么样', UNKNOWN: '?' }

/** 用户决策（领域 → UI 动作）：每个决策带理解与理由（模拟真人） */
/** @typedef {{ action: 'click-option'|'type'|'advance'|'approve'|'continue'|'wait', text?: string, understanding: string, reason: string }} Decision */

const cleanOpt = (o) => String(o).replace(/^[①-⑩]\s*\n?\s*/, '').trim()

// ============================================================================
// UserAgent —— 模拟真实用户（读 → 理解 → 思考 → 决策）
// ============================================================================

class UserAgent {
  constructor() {
    this.profile = {}   // 用户画像（我的选择）
    this.steps = []     // 逐步决策记录（可复现）
  }

  // 理解模型消息：这轮模型在说什么？（供打印 + 决策）
  understand(msg) {
    const c = msg.content ?? ''
    if (msg.candidates.length > 0) {
      return `模型给了 ${msg.candidates.length} 个候选选项让我选（同音/理解确认）`
    }
    if (/(【需求确认|需求确认|确认完毕|点.*确认推进)/.test(c)) return '模型总结并确认需求，等我点「确认推进」'
    if (/(说要做但还没动手|回复.*继续)/.test(c)) return '模型提示：它说了要做但还没动手，让我回复「继续」'
    if (/[?？]/.test(c)) return '模型在向我提问'
    return '模型在陈述/说明'
  }

  // 思考：模型这个问题/内容，我的意图是什么 → 决策（含理由）
  decide(msg) {
    const c = msg.content ?? ''
    // —— 需求确认完成 → 推进 ——
    if (/(【需求确认|需求确认|确认完毕|点.*「?确认推进|确认无误|就这样定)/.test(c)) {
      return { action: 'advance', understanding: '模型已确认需求', reason: '需求确认完成——点「确认推进」进入设计' }
    }
    // —— 有候选按钮 → 语义理解后选择 ——
    if (msg.candidates.length > 0) {
      const qClass = this.classify(c)
      const idx = this.matchOption(qClass, msg.candidates)
      if (idx >= 0) {
        const text = cleanOpt(msg.candidates[idx])
        const u = this.understandOption(qClass, text)
        this.profile[qClass] = text
        return { action: 'click-option', text, understanding: u.understanding, reason: u.reason }
      }
      // 附加问题（非标准 4 问）：核心需求已问全 → 放权让模型收敛（真实用户会不耐烦）；否则兜底选第一个
      if (this.profileComplete()) {
        return { action: 'type', text: '都行，你按合适的来', understanding: '附加问题（核心 4 问已确认完）', reason: '放权给模型决定——让它收敛到需求确认' }
      }
      const text = cleanOpt(msg.candidates[0])
      return { action: 'click-option', text, understanding: '附加问题（核心 4 问未问全）', reason: `先选第一个：${text.slice(0, 15)}` }
    }
    // —— 无候选 → 判断是提问（打字回答）还是提示/陈述 ——
    if (/(说要做但还没动手|回复.*继续)/.test(c)) {
      return { action: 'continue', understanding: '模型说要做但没动手', reason: '回复「继续」让它接着干' }
    }
    const qClass = this.classify(c)
    // 无候选但模型在问（疑问语义——问号/哪个/什么/确认/理解/意思/想法）→ 打字回答（模型偶尔不出候选块直接问）
    if (qClass !== Q.UNKNOWN && (/[?？]|哪个|哪几种|哪一种|什么|吗$|呢$|确认|理解|意思|想法|看看你|你觉得/.test(c))) {
      const answer = this.typeAnswer(qClass)
      return { action: 'type', text: answer, understanding: `模型在问「${qClass}」`, reason: `打字回答：${answer.slice(0, 15)}` }
    }
    return { action: 'wait', understanding: '模型在陈述', reason: '暂不需要我操作——等它下一步' }
  }

  // 问题分类（领域规则）——DONE 强特征优先（「做成什么样算完成」含「网页上玩」会误判 PLATFORM）
  classify(content) {
    const c = content ?? ''
    if (/(做成什么样|算完成|算完|做到哪|完成标准|做完|什么时候算|做到什么程度)/.test(c)) return Q.DONE
    if (/(给谁玩|谁玩|面向|玩家|对象)/.test(c)) return Q.AUDIENCE
    if (/(在哪|哪儿玩|平台|网页|电脑|手机|浏览器|运行|设备)/.test(c)) return Q.PLATFORM
    if (/(设计|意思|理解|指什么|哪个意思|什么游戏|哪种|哪一档)/.test(c)) return Q.WHAT
    if (/(完成|满意|程度|标准|需求|够)/.test(c)) return Q.DONE
    return Q.UNKNOWN
  }

  // 标准 4 问是否都已确认（核心需求完整——附加问题可放权让模型收敛）
  profileComplete() {
    return !!(this.profile[Q.WHAT] && this.profile[Q.AUDIENCE] && this.profile[Q.PLATFORM] && this.profile[Q.DONE])
  }

  // 候选选项匹配（我的意图：同音泛化选「射击」，其余选贴合画像的）
  matchOption(qClass, options) {
    const clean = options.map(cleanOpt)
    const patterns = {
      [Q.WHAT]: /射击/,
      [Q.AUDIENCE]: /大众|普通|随便谁|自己|单人|朋友/,
      [Q.PLATFORM]: /网页|浏览器/,
      [Q.DONE]: /简单|能玩|先|基础|够|开局/
    }
    const pat = patterns[qClass]
    if (!pat) return -1
    return clean.findIndex((o) => pat.test(o))
  }

  // 理解所选选项的含义（供打印——真人知道自己为什么选这个）
  understandOption(qClass, text) {
    const map = {
      [Q.WHAT]: { understanding: '这是「做什么」——我本意是射击游戏（设计≈射击，打字谐音）', reason: `选「${text.slice(0, 12)}」——射击符合我的本意` },
      [Q.AUDIENCE]: { understanding: '这是「给谁玩」——选择目标玩家', reason: `选「${text.slice(0, 12)}」——贴合我的场景` },
      [Q.PLATFORM]: { understanding: '这是「在哪儿玩」——选择运行平台', reason: `选「${text.slice(0, 12)}」——网页最方便` },
      [Q.DONE]: { understanding: '这是「做成什么样算完」——选择完成标准', reason: `选「${text.slice(0, 12)}」——先跑起来就行` }
    }
    return map[qClass] ?? { understanding: '选择该项', reason: `选「${text.slice(0, 12)}」` }
  }

  // 无候选时打字回答
  typeAnswer(qClass) {
    if (qClass === Q.WHAT) return '射击游戏'
    if (qClass === Q.AUDIENCE) return '随便谁都能玩，简单易上手'
    if (qClass === Q.PLATFORM) return '在网页浏览器里玩，打开就能玩'
    if (qClass === Q.DONE) return '能玩就行——能开枪打中、有得分，界面简单'
    return ''
  }

  // 验证模型是否理解了我们的选择（复述确认——语义核心词命中即可）
  verifyEcho(lastReply, chosenText) {
    if (!chosenText) return true
    const sem = chosenText.match(/(射击|解谜|建造|网页|浏览器|大众|普通|随便|简单|能玩|单机|朋友|得分|自己|电脑|手机|闯关|对战|开枪|分数|打中|练手|学习|键盘|鼠标|调试|关卡|怪)/g) ?? []
    const phrases = chosenText.match(/[^：:、\-—()（）\s]{2,8}/g) ?? []
    const tests = [...new Set([...sem, ...phrases])]
    return tests.some((k) => k && lastReply.includes(k))
  }
}

// ============================================================================
// SessionDriver —— UI 驱动
// ============================================================================

class SessionDriver {
  constructor(page) { this.page = page }

  async readTranscript() {
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
    const t = await this.readTranscript()
    return [...t].reverse().find((m) => m.role === 'assistant') ?? null
  }

  async waitSettled(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs
    let last = null
    let sb = '' // 循环外定义——超时 throw 引用
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1500)
      const t = await this.readTranscript()
      const msgs = t.filter((m) => m.content.trim())
      const lastMsg = msgs[msgs.length - 1]
      sb = await this.page.locator('.nf-statusbar').innerText().catch(() => '')
      const working = await this.page.locator('.nf-statusbar__dot--working').count().catch(() => 0)
      const msgChanged = last && lastMsg && lastMsg.content !== last.content
      // 授权卡待批（「有操作待你批准」）——模型在等用户批准（maybeContinue 已停），不是没回复——返回让上层处理授权
      if (sb.includes('有操作待你批准') && lastMsg) return lastMsg
      if (lastMsg && lastMsg.content.trim() && working === 0 && sb.includes('就绪') && !msgChanged) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) { last = lastMsg; continue } // 跳过 isActionPromise 系统提示（UI 插入，非模型回复）
        return lastMsg
      }
      if (lastMsg) last = lastMsg
    }
    throw new Error(`waitSettled 超时 ${timeoutMs / 1000}s（模型长时间无回复，状态栏="${sb}"）`)
  }

  // 等模型「新」回复（内容必须变化——用于决策后等待模型对操作的回复，防点击没生效）
  async waitNew(fromContent, timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs
    let lastReal = null // 最后一条非提示的模型回复（提示插入后模型已回复完——用于超时容错）
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1500)
      const t = await this.readTranscript()
      const lastMsg = [...t].reverse().find((m) => m.role === 'assistant' && m.content.trim())
      if (lastMsg && lastMsg.content !== fromContent) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) continue // 跳过 isActionPromise 系统提示（非模型回复）
        lastReal = lastMsg
        return lastMsg
      }
      // 记录已出现的非提示消息（可能被提示挤到后面——用于超时容错）
      const real = [...t].reverse().find((m) => m.role === 'assistant' && m.content.trim() && !/说要做但还没动手|回复.*继续/.test(m.content))
      if (real && real.content !== fromContent) lastReal = real
    }
    // 超时容错：模型回复完成后被 isActionPromise 提示插入（提示是最后一条）——此时返回提示前的模型回复（流程可继续）
    if (lastReal && lastReal.content !== fromContent) {
      console.log(`   ⚠️ 模型回复后插入系统提示（isActionPromise），返回提示前的模型回复继续流程`)
      return lastReal
    }
    // 超时诊断：区分「模型流式中断/无响应」vs「操作未生效」（模拟真实用户遇到卡住时看状态）
    const sb = await this.page.locator('.nf-statusbar').innerText().catch(() => '?')
    const last = await this.latestAssistant()
    const working = await this.page.locator('.nf-statusbar__dot--working').count().catch(() => -1)
    throw new Error(`模型对操作无新回复（${timeoutMs / 1000}s）——状态栏="${sb}" working=${working} 最后消息="${last?.content.slice(0, 40) ?? ''}"（可能流式中断/模型无响应）`)
  }

  async send(text) {
    await this.page.locator('.nf-chat__input textarea').fill(text)
    await this.page.locator('.nf-chat__input textarea').press('Meta+Enter')
  }

  async clickCandidate(text) {
    const btn = this.page.locator('.nf-candidates__btn').filter({ hasText: text })
    if (await btn.count() === 0) throw new Error(`候选按钮「${text}」未找到——选项文本不匹配`)
    await btn.click()
  }

  async currentStage() {
    const active = this.page.locator('.nf-flow__stage--active')
    if (await active.count() === 0) return ''
    return (await active.innerText()).trim()
  }

  async clickAdvance(expectStage, timeoutMs = 60000) {
    const btn = this.page.locator('.nf-flow__advance button')
    await btn.waitFor({ state: 'visible', timeout: 10000 })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await btn.isEnabled().catch(() => false)) break
      await this.page.waitForTimeout(1000)
    }
    if (!(await btn.isEnabled().catch(() => false))) {
      throw new Error(`推进按钮未解锁（等 ${expectStage}）：${(await this.page.locator('.nf-flow__advance').innerText().catch(() => '')).slice(0, 100)}`)
    }
    await btn.click()
    if (expectStage) {
      const d2 = Date.now() + 30000
      while (Date.now() < d2) {
        const s = await this.currentStage()
        if (s.includes(expectStage)) return
        await this.page.waitForTimeout(1000)
      }
      throw new Error(`推进后未到 ${expectStage}（当前 ${await this.currentStage()}）`)
    }
  }

  // 批准待授权卡（完整策略）：① 规划卡「批准这批文件」② 批量「全部允许并记住」③ 单卡「允许并记住」④ 单卡「允许执行」
  async approvePending() {
    const p = this.page
    const plan = p.locator('.nf-toolcall__approve', { hasText: '批准这批文件' })
    if (await plan.count() > 0) {
      // 提取文件清单（路径 + 原因）——真实用户批准前会看清单
      const files = await p.locator('.nf-plan__file').allInnerTexts().catch(() => [])
      const paths = await p.locator('.nf-plan__path').allInnerTexts().catch(() => [])
      await plan.first().click()
      return { label: '批准这批文件', detail: `文件清单(${files.length})：${files.slice(0, 6).map((f) => f.replace(/\n/g, ' ').slice(0, 35)).join(' | ')}`, planFiles: paths.map((s) => s.trim()).filter(Boolean) }
    }
    const batch = p.locator('.nf-toolcall__batch-approve')
    if (await batch.count() > 0) { await batch.first().click(); return { label: '全部允许并记住', detail: '' } }
    const remember = p.locator('.nf-toolcall__remember')
    if (await remember.count() > 0) {
      const target = await remember.first().locator('xpath=ancestor::div[contains(@class,"nf-toolcall")]').locator('.nf-toolcall__args').innerText().catch(() => '')
      await remember.first().click()
      return { label: '允许并记住', detail: target }
    }
    const approve = p.locator('.nf-toolcall__approve')
    if (await approve.count() > 0) {
      const target = await approve.first().locator('xpath=ancestor::div[contains(@class,"nf-toolcall")]').locator('.nf-toolcall__args').innerText().catch(() => '')
      await approve.first().click()
      return { label: '允许执行', detail: target }
    }
    return null
  }

  async fileTree() {
    return (await this.page.locator('.nf-filetree span, [class*="filetree"] span').allInnerTexts().catch(() => []))
      .map((s) => s.trim()).filter(Boolean)
  }

  // 是否有未完成的工具卡（running/pending——bash 长任务如 npm install 执行中）
  async toolsRunning() {
    return await this.page.locator('.nf-toolcall--running, .nf-toolcall--pending').count().catch(() => 0)
  }

  // 项目根目录（状态栏「│ 目录名」→ Documents/NeonForge/目录名）
  async projectDir() {
    const sb = await this.statusbar()
    const name = (sb.match(/│\s*(.+)$/) ?? [])[1]?.trim() ?? ''
    if (!name) return null
    return path.join(os.homedir(), 'Documents/NeonForge', name)
  }

  // 真实文件系统检查（比 UI 文件树可靠——文件树可能折叠/缓存）——递归列出项目内文件（相对路径）
  async realFiles() {
    const dir = await this.projectDir()
    if (!dir || !fs.existsSync(dir)) return []
    const out = []
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, f.name)
        if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') walk(fp)
        else if (f.isFile()) out.push(fp.replace(dir + path.sep, ''))
      }
    }
    walk(dir)
    return out
  }

  async statusbar() {
    return this.page.locator('.nf-statusbar').innerText().catch(() => '')
  }
}

// ============================================================================
// 打印 —— 真实用户视角（完整内容 + 理解 + 决策）
// ============================================================================

function printModel(msg, prefix = '🤖') {
  const head = msg.content.slice(0, 200)
  console.log(`   ${prefix} 模型回复（${msg.content.length} 字）：`)
  console.log(`      ${head.replace(/\n/g, '\n      ')}${msg.content.length > 200 ? '…' : ''}`)
  if (msg.candidates.length > 0) {
    console.log(`       [候选按钮]`)
    msg.candidates.forEach((c, i) => console.log(`         ${i + 1}. ${cleanOpt(c)}`))
  }
  if (msg.tools.length > 0) {
    console.log(`       [工具卡] ${msg.tools.slice(0, 4).map((t) => t.replace(/\n/g, ' ').slice(0, 50)).join(' | ')}`)
  }
}

// ============================================================================
// 阶段机
// ============================================================================

class StageMachine {
  constructor(driver, agent, phase) {
    this.driver = driver
    this.agent = agent
    this.phase = phase
    this.verdicts = []
  }

  async run() {
    await this.requirement()
    if (this.phase === 'req') { console.log('\n   [PHASE=req] 需求阶段验证完成——停止'); return }
    await this.design()
    if (this.phase === 'design') { console.log('\n   [PHASE=design] 设计阶段验证完成——停止'); return }
    await this.development()
    if (this.phase === 'dev') { console.log('\n   [PHASE=dev] 开发阶段验证完成——停止'); return }
    await this.test()
    await this.deploy()
  }

  // ---- 需求阶段：一轮一轮真实交互（看回复 → 理解 → 决策 → 验证） ----
  // 循环不变量：每轮处理一条「未处理过」的模型消息（打印 + 决策 + 执行）；
  // 决策后等模型新回复（内容必须变化），下轮对它决策——像真人一轮一轮对话。
  async requirement() {
    let lastProcessed = '' // 已处理（打印+决策）的消息内容
    for (let i = 0; i < 20; i++) {
      const msg = await this.driver.waitSettled()
      if (msg.content === lastProcessed) {
        await this.driver.page.waitForTimeout(3000)
        continue
      }
      lastProcessed = msg.content
      // 需求确认 → 推进
      if (/(【需求确认|需求确认|确认完毕|点.*「?确认推进|确认无误|就这样定)/.test(msg.content)) {
        printModel(msg)
        console.log(`   📌 需求确认完成——点「确认推进」进入设计`)
        await this.driver.clickAdvance('设计')
        return
      }
      // 真实用户：先看完整回复 → 理解 → 思考 → 决策
      printModel(msg)
      console.log(`   🧠 我的理解：${this.agent.understand(msg)}`)
      const decision = this.agent.decide(msg)
      if (decision.action === 'wait') {
        console.log(`   ⏳ ${decision.reason}——等模型下一步`)
        await this.driver.page.waitForTimeout(3000)
        continue
      }
      if (decision.action === 'click-option') {
        console.log(`   🧑 我的决策：${decision.understanding}\n      → ${decision.reason}「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
      } else if (decision.action === 'type') {
        console.log(`   🧑 我的决策：${decision.understanding}\n      → ${decision.reason}「${decision.text}」`)
        await this.driver.send(decision.text)
      } else if (decision.action === 'continue') {
        console.log(`   🧑 我的决策：${decision.reason}`)
        await this.driver.send('继续')
      } else {
        console.log(`   🧑 我的决策：${decision.reason}`)
        await this.driver.clickAdvance('设计')
        return
      }
      this.agent.steps.push({ msg: msg.content.slice(0, 80), decision: decision.text ?? decision.action })
      // 等模型对这次操作的回复（必须是新消息——防点击没生效/模型没回复）
      const next = await this.driver.waitNew(msg.content)
      const echoed = this.agent.verifyEcho(next.content, decision.text ?? '')
      this.verdicts.push({ stage: '需求', echoed, chosen: decision.text, reply: next.content.slice(0, 60) })
      console.log(`   ${echoed ? '✅ 模型正确复述了我的选择' : '⚠️ 模型未复述我的选择关键词——需要关注'}\n`)
      // lastProcessed 保持 msg.content——next 是未处理的新消息，下轮循环会打印并决策
    }
    throw new Error('需求阶段 20 轮未收敛（模型持续提问/循环）')
  }

  // ---- 设计阶段：真实用户——模型输出方案（可能还有设计选择题要问）→ 答选择题 → 模型明确「方案完整/确认推进」→ 才推进 ----
  async design() {
    let lastProcessed = ''
    const deadline = Date.now() + 240000
    while (Date.now() < deadline) {
      const msg = await this.driver.waitSettled(60000)
      if (msg.content === lastProcessed) { await this.driver.page.waitForTimeout(3000); continue }
      lastProcessed = msg.content
      // 授权卡（设计阶段模型可能违规调 read/bash——正常批准）
      const ap = await this.driver.approvePending()
      if (ap) { console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`); continue }
      if (/说要做但还没动手|回复.*继续/.test(msg.content)) {
        console.log(`   🧑 模型说要做但没动手——回复「继续」让它干完`)
        await this.driver.send('继续')
        continue
      }
      printModel(msg)
      // 模型在问设计选择题（候选/问句）→ 像需求阶段一样语义回答
      const decision = this.agent.decide(msg)
      if (decision.action === 'click-option') {
        console.log(`   🧑 设计选择：${decision.reason}「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
        const next = await this.driver.waitNew(msg.content)
        this.verdicts.push({ stage: '设计', answered: decision.text, reply: next.content.slice(0, 50) })
        console.log(`   ✅ 模型回复：「${next.content.slice(0, 50).replace(/\n/g, ' ')}」\n`)
        lastProcessed = next.content
        continue
      }
      if (decision.action === 'type') {
        console.log(`   🧑 设计回答：${decision.reason}「${decision.text}」`)
        await this.driver.send(decision.text)
        const next = await this.driver.waitNew(msg.content)
        this.verdicts.push({ stage: '设计', answered: decision.text, reply: next.content.slice(0, 50) })
        console.log(`   ✅ 模型回复：「${next.content.slice(0, 50).replace(/\n/g, ' ')}」\n`)
        lastProcessed = next.content
        continue
      }
      // 模型说方案完整/确认推进（明确完成设计）→ 推进
      const okLen = msg.content.length >= 60
      const okKw = /(方案|技术|用|结构|界面|页面|模块|整体)/.test(msg.content)
      const confirmed = /(方案.*(完整|没问题|确认|定了)|确认.*方案|没问题.*确认推进|你确认|确认推进|就这样|可以了|没问题)/.test(msg.content)
      if (okLen && okKw && confirmed) {
        this.verdicts.push({ stage: '设计', okLen, okKw, len: msg.content.length })
        console.log(`   📐 设计验证：${msg.content.length} 字 ✓ 含方案要素 ✓ 模型确认完整`)
        console.log(`   🧑 方案我看过了，没问题——点「确认推进」进入开发`)
        await this.driver.clickAdvance('开发')
        return
      }
      // 模型还在输出方案（没说完整/没问问题）→ 等下一轮
      if (okLen && okKw) {
        console.log(`   ⏳ 模型还在补设计方案（${msg.content.length} 字）——等它说完\n`)
      }
      await this.driver.page.waitForTimeout(1500)
    }
    throw new Error('设计阶段超时（模型未明确「方案完整/确认推进」）')
  }

  // ---- 开发阶段：真实用户——批准清单 → 看着模型逐个写 → 模型说完成 → 检查文件齐全 → 缺则补齐 → 推进 ----
  async development() {
    let planned = [] // 批准的文件清单（plan_approval）
    let lastProcessed = '' // 已处理消息（防同一条重复打印/处理）
    const deadline = Date.now() + 300000
    while (Date.now() < deadline) {
      const msg = await this.driver.waitSettled(60000)
      if (msg.content === lastProcessed) { await this.driver.page.waitForTimeout(3000); continue }
      lastProcessed = msg.content
      // 授权卡（plan_approval/bash/单卡）——批准并记录清单
      const ap = await this.driver.approvePending()
      if (ap) {
        console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`)
        if (ap.planFiles && ap.planFiles.length > 0) {
          planned = ap.planFiles
          console.log(`      📋 已批准文件清单（${planned.length} 个）：${planned.join(', ')}`)
        }
        continue
      }
      // 模型请求批准文件清单（二次 plan_approval 被 UI 幂等处理不弹卡——模型以为在等批准）→ 显式放行
      if (/(请求你批准|请批准|等你批准|需要你批准|请求批准)/.test(msg.content)) {
        printModel(msg)
        console.log(`   🧑 模型请求批准（UI 幂等无新卡）——显式放行「批准，继续写」`)
        await this.driver.send('批准，继续写')
        continue
      }
      // isActionPromise 提示（模型说要做但没动手）→ 回复「继续」
      if (/说要做但还没动手|回复.*继续/.test(msg.content)) {
        console.log(`   🧑 模型说要做但没动手——回复「继续」让它干完`)
        await this.driver.send('继续')
        continue
      }
      // 模型在写文件/说明进度（工具卡在动）→ 展示模型说什么，继续等
      const have = await this.driver.realFiles()
      printModel(msg)
      // 模型明确说「写完/完成」？→ 检查清单是否齐全（真实文件系统）
      if (/(写完了|都写好了|全部完成|都完成了|搞定|写好了|做完了|完成.*确认推进)/.test(msg.content)) {
        const missing = planned.filter((pf) => !have.some((h) => h === pf || h.endsWith(pf) || pf.endsWith(h)))
        console.log(`   📦 已完成文件：${have.slice(0, 10).join(', ') || '(空)'}`)
        if (missing.length > 0) {
          // 真实用户：模型说写完但清单缺文件 → 指出并让补齐
          console.log(`   ⚠️ 模型说写完了，但清单里还缺：${missing.join(', ')}`)
          console.log(`   🧑 我检查发现缺文件——提醒模型补齐`)
          await this.driver.send(`清单里的 ${missing.slice(0, 3).join('、')} 还没看到，补一下再确认`)
          continue
        }
        // 清单齐全 → 推进（不强制等工具全部 done——dev server 常驻进程工具卡会一直 pending，属正常；只看模型说完成 + 清单齐全）
        this.verdicts.push({ stage: '开发', planned: planned.length, have: have.length })
        console.log(`   ✅ 开发完成（清单 ${planned.length}/${planned.length} 文件齐全）——点「确认推进」进入测试`)
        await this.driver.clickAdvance('测试')
        return
      }
      // 模型还在做（没说完成）→ 等下一轮
      await this.driver.page.waitForTimeout(1500)
    }
    throw new Error('开发阶段超时（模型未完成——清单文件未全部产出）')
  }

  // ---- 测试阶段：真实用户——模型必须实际调工具验证（跑起来/检查）并说通过，才能推进 ----
  async test() {
    let lastProcessed = '' // 已处理消息（防同一条重复打印/处理）
    const deadline = Date.now() + 300000
    while (Date.now() < deadline) {
      const msg = await this.driver.waitSettled(60000)
      if (msg.content === lastProcessed) { await this.driver.page.waitForTimeout(3000); continue }
      lastProcessed = msg.content
      const ap = await this.driver.approvePending()
      if (ap) { console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`); continue }
      printModel(msg)
      if (/说要做但还没动手|回复.*继续/.test(msg.content)) {
        console.log(`   🧑 模型说要做但没动手——回复「继续」让它干完`)
        await this.driver.send('继续')
        continue
      }
      // 真实验证：模型实际调了工具（bash 跑/检查/启动）+ 明确说验证通过
      const t = await this.driver.readTranscript()
      const hasBashRun = t.some((m) => m.tools.some((x) => /(npm|vite|serve|启动|运行|执行|检查|ls|测试|验证|test)/.test(x)))
      const saidPass = /(验证通过|测试通过|能跑|正常运行|没问题|跑起来了|启动成功|检查通过|测试完成)/.test(msg.content)
      if (saidPass && hasBashRun) {
        this.verdicts.push({ stage: '测试', hasBashRun, saidPass })
        console.log(`   ✅ 测试验证通过（有实际运行/检查动作 + 模型确认）——点「确认推进」进入部署`)
        await this.driver.clickAdvance('部署')
        return
      }
      if (saidPass && !hasBashRun) {
        // 模型说通过但没实际跑 → 真实用户会要求实际验证
        console.log(`   ⚠️ 模型说通过，但没看到实际运行/检查动作`)
        console.log(`   🧑 要求实际验证：「实际跑起来验证一下，确认能打开」`)
        await this.driver.send('实际跑起来验证一下，确认能打开再确认完成')
        continue
      }
      // 模型还在验证/写东西 → 等
      await this.driver.page.waitForTimeout(1500)
    }
    throw new Error('测试阶段无真实验证（模型没实际运行/检查就要求推进）')
  }

  // ---- 部署阶段：真实用户——先查产物完整（核心文件在），再让模型给出可执行部署/实际部署 ----
  async deploy() {
    // ① 检查产物完整性（部署前真实用户会确认「能部署的东西在不在」——真实文件系统）
    const tree = await this.driver.realFiles()
    const core = ['index.html', 'package.json']
    const missingCore = core.filter((c) => !tree.some((t) => t.endsWith(c)))
    let msg = null
    if (missingCore.length > 0) {
      console.log(`   ⚠️ 部署前检查：核心产物缺失 ${missingCore.join(', ')}——先让模型补齐`)
      await this.driver.send(`${missingCore.join('、')} 还没写，补齐了再谈部署`)
      msg = await this.driver.waitSettled(180000)
      printModel(msg, '✅')
      // 补齐后再查一次
      const tree2 = await this.driver.realFiles()
      const missing2 = core.filter((c) => !tree2.some((t) => t.endsWith(c)))
      if (missing2.length > 0) throw new Error(`部署阶段产物补齐失败（仍缺 ${missing2.join(', ')}）`)
      console.log(`   ✅ 产物已补齐（${core.join(', ')} 在）`)
    } else {
      console.log(`   📦 产物检查：${core.join(', ')} 都在 ✓`)
    }
    // ② 等模型给出可执行部署方案（或实际部署）
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      msg = await this.driver.waitSettled(60000)
      const ap = await this.driver.approvePending()
      if (ap) { console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`); continue }
      if (/说要做但还没动手|回复.*继续/.test(msg.content)) {
        console.log(`   🧑 模型说要做但没动手——回复「继续」让它干完`)
        await this.driver.send('继续')
        continue
      }
      printModel(msg)
      // 可执行部署：给了命令/平台/链接/实际部署动作
      const actionable = /(npm run|vercel|部署|上线|链接|地址|端口|localhost|npm i|npm install|访问|打开.*玩|部署好了|可以玩)/.test(msg.content)
      if (actionable) {
        this.verdicts.push({ stage: '部署', actionable })
        console.log(`   ✅ 部署方案可执行（${msg.content.slice(0, 40)}…）`)
        break
      }
      await this.driver.page.waitForTimeout(1500)
    }
    const done = await this.driver.page.locator('.nf-flow__done').count()
    const sb = await this.driver.statusbar()
    const rootHint = (sb.match(/│\s*(.+)$/) ?? [])[1]?.trim() ?? ''
    const treeF = await this.driver.realFiles()
    const hasFiles = treeF.some((f) => /package|\.(js|ts|html|css|json)$/.test(f))
    this.verdicts.push({ stage: '产物', rootHint, hasFiles })
    console.log(`   📦 产物：项目=${rootHint}，${hasFiles ? '✓ 有真实文件' : '✗ 无产物'}，到达阶段=${await this.driver.currentStage()}${done ? '（交付完成）' : ''}`)
    return { rootHint, hasFiles, done, stage: await this.driver.currentStage() }
  }
}

// ============================================================================
// 用例执行
// ============================================================================

async function launch0to1(mode) {
  try {
    for (const f of fs.readdirSync(LOCK_DIR)) {
      if (f.startsWith('Singleton')) fs.rmSync(path.join(LOCK_DIR, f), { force: true })
    }
  } catch {}
  const app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173', NF_TEST_PROJECT: WORK_DIR, ELECTRON_RUN_AS_NODE: '' }
  })
  const proc = app.process()
  proc.stdout?.on('data', (d) => { const s = String(d).trim(); if (s.includes('[ws:diag]')) console.log('  [main]', s) })
  proc.stderr?.on('data', (d) => { const s = String(d).trim(); if (s.includes('[ws:diag]')) console.log('  [main]', s) })
  const page = await app.firstWindow()
  await page.waitForSelector('.nf-start', { timeout: 20000 })
  await page.evaluate(() => {
    try {
      localStorage.removeItem('nf-session')
      localStorage.removeItem('nf-problems')
      localStorage.removeItem('nf-delegate-lowrisk')
    } catch {}
  })
  await page.evaluate((k) => window.neonforge.config.setKey(k), KEY)
  if (mode === 'fill') {
    await page.locator('.nf-start__input').fill('我想做一个3D设计游戏')
    await page.locator('.nf-start__input').press('Enter')
  } else {
    await page.getByRole('button', { name: '从零开始' }).click()
  }
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 20000 })
  return { app, page }
}

const PHASE = process.env.PHASE ?? 'all'
const MODE = process.env.MODE ?? 'both'

async function case_(name, mode) {
  const t0 = Date.now()
  let app = null
  try {
    const l = await launch0to1(mode)
    app = l.app
    const driver = new SessionDriver(l.page)
    const agent = new UserAgent()
    if (mode === 'empty') await driver.send('我想做一个3D设计游戏')
    console.log(`\n── ${name}（PHASE=${PHASE}）──\n`)
    const machine = new StageMachine(driver, agent, PHASE)
    await machine.run()
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    const end = machine.verdicts[machine.verdicts.length - 1]
    const reqEchoed = machine.verdicts.filter((v) => v.stage === '需求' && v.echoed !== undefined).some((v) => v.echoed)
    const ok = (PHASE !== 'all' || (end?.stage === '产物' && end?.hasFiles && reqEchoed))
    console.log(`\n${ok ? '✅' : '⚠️'} ${name} ${ok ? '通过' : '部分验证'} (${secs}s)`)
    console.log(`   决策轨迹（可复现）：`)
    agent.steps.forEach((s, i) => console.log(`     ${i + 1}. 模型：「${s.msg.replace(/\n/g, ' ').slice(0, 40)}」→ 我：${s.decision}`))
    return { ok }
  } catch (e) {
    console.log(`\n❌ ${name} 异常: ${String(e).slice(0, 200)}`)
    return { ok: false }
  } finally {
    if (app) {
      try {
        const proc = app.process()
        await app.close()
        await Promise.race([new Promise((r) => proc.once('exit', r)), new Promise((r) => setTimeout(r, 8000))])
      } catch {}
      try {
        for (const f of fs.readdirSync(LOCK_DIR)) {
          if (f.startsWith('Singleton')) fs.rmSync(path.join(LOCK_DIR, f), { force: true })
        }
      } catch {}
    }
  }
}

console.log('=== NeonForge 0-1 完整流程 E2E（真实用户模拟 · DDD）===\n')
if (!KEY) { console.log('❌ 无可用 API Key'); process.exit(1) }
console.log(`Key: ${KEY.slice(0, 5)}…${KEY.slice(-3)}（已脱敏） | PHASE=${PHASE} | MODE=${MODE}\n`)

let ok = true
if (MODE === 'A') { ok = (await case_('场景 A：起始页填需求', 'fill')).ok }
else if (MODE === 'B') { ok = (await case_('场景 B：对话输入', 'empty')).ok }
else {
  const r1 = await case_('场景 A：起始页填需求', 'fill')
  const r2 = await case_('场景 B：对话输入', 'empty')
  ok = r1.ok && r2.ok
}
process.exit(ok ? 0 : 1)
