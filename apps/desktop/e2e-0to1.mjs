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
// 2026-08-05 双语语义（用户指出「中英双语卡住」）：模型偶发转英文（受英文工具结果/代码带动）——
// 语义检测必须中英兼容；模型保持中文回复靠产品侧 langRule 强化，这里兜底识别
const SEM_DONE = /(写完了|都写好了|全部完成|都完成了|搞定|写好了|做完了|搭好了|跑起来了|完成|done|finished|all set|complete|written|ready)/i
const SEM_PROMISE = /(开始|我来|马上|这就|现在|先|让我|我先|待会|稍后).{0,4}(写|做|创建|生成|搭|部署|读|看|检查|确认|验证|测试|启动|查一下|看看)|I'?ll|let me|going to|start writing|gonna|will (write|start|make|read|check)/i
const SEM_PLAY = /(能玩|可以玩|地址|localhost|端口|试试|体验|访问|打开.*玩|playable|works|running|visit|open|try|have a look)/i
const SEM_CONFUSE = /(工具返回异常|读取结果|同一个文件|重新读取|确认一下实际|something wrong|same content|re-?read|verify the actual)/i
const SEM_ASK = /(要不要|还是说|还是先|你觉得|你看|想不想要|如何|怎么样|可以吗|行吗|先玩几把|感受一下|你定|你来定|看你的)/i
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
    // 2026-08-05 模型确认方案方向/操作（「方向没意见吧/按这个来/按常规定/可以吗」）→ 真实用户确认（不答非所问——A7 教训：
    // 模型问方向 e2e 因 classify 的「设计」误判 WHAT 答「射击游戏」→ 模型被带偏直接出方案 → 阶段错位）
    if (/(没意见|可以吗|行吗|好不好|按这个|按常规定|方向.*吗|这样.*吗|同意|没问题吧|你看行|你看怎么样|按你说的)/.test(c) && /[?？]|吧|吗/.test(c)) {
      return { action: 'type', text: 'OK，按你这个方向来，没问题——还有要确认的吗？没有就确认需求吧', understanding: '模型在确认方案方向', reason: '真实用户确认方向并推动收敛' }
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
// UserSimulator —— LLM 语义理解模拟用户（2026-08-05）
// 用户指示：真实用户模拟必须基于语义理解——根据搭档输出 + 上下文真正理解含义，
// 而不是正则穷举（口语化表达穷举不完、命中不了）。LLM 是第一理解层；
// UserAgent.decide（正则）降级为 LLM 失败/超时/解析失败时的兜底。
// 职责边界：LLM 管「理解语义」（模型在说什么/在等什么）；阶段机管「验证事实」
// （文件清单/HTTP/真实产物）——LLM 说推进不直接推进，仍需确定性证据通过（防假阳性）。
// ============================================================================

class UserSimulator {
  constructor(agent) {
    this.agent = agent        // UserAgent：画像 + fallback 正则决策
    this.history = []         // 最近模型消息（供上下文理解）
  }

  personaText() {
    const p = this.agent.profile
    const lines = [
      `- 你想做一个「射击游戏」（你打字的同音误输入成了「3D设计」，其实是射击）`,
      `- 目标玩家：${p[Q.AUDIENCE] || '大众，随便谁都能玩、简单易上手'}`,
      `- 平台：${p[Q.PLATFORM] || '网页浏览器，打开就能玩'}`,
      `- 完成标准：${p[Q.DONE] || '能玩就行——能开枪打中、有得分、界面简单'}`,
      `- 你不懂编程，说话口语化，会催进度，但配合度高`,
    ]
    return lines.join('\n')
  }

  systemPrompt(stage) {
    return `你是「小明」，一个完全不懂编程的普通用户，正在用 AI 工作台让 AI 搭档帮你做游戏。
你的画像：
${this.personaText()}

当前对话阶段：${stage}

你的任务：理解 AI 搭档最新对你说的话——它可能在问你问题、在等你操作、在陈述进度、
在请你打开网址试玩、在请你确认。像真实用户一样根据上下文真正理解它的意图，然后做出真实反应。

行动约束（只输出一个 action，action 与 text 必须匹配）：
- type: 你需要说话（回答问题/给反馈/提要求）——text 写你口语化的原话
- click-option: 模型给了候选选项让你选——text 写你选的选项原文（必须来自模型消息里的选项）
- play-test: 模型给了网址/让你打开试玩——text 写你打开后的真实反馈（能玩/不能玩+现象）
- confirm: 模型交付了东西/完成了一件事/明确说「确认完成/点确认推进」等你确认——text 写你的确认或指出的问题
- continue: 模型说了要做但还没做——text 写「继续」
- wait: 模型只是陈述/说明，没在等你——text 写空字符串

阶段特别规则：
- ${stage === '需求' ? '需求阶段：如果 AI 搭档在问你问题（候选选项或开放问题），你必须直接回答（click-option 选候选 / type 打字回答）——不要只说「确认/同意」；只有它明确说「需求确认完毕/点确认推进」才用 confirm' : `当前阶段（${stage}）：如果模型在问你要选择/反馈，直接回答；如果它在干活或陈述进度，用 wait 等它`}

严格约束：
- 输出必须是单个 JSON 对象：{"action":"...","text":"...","understanding":"一句话说明你理解它在说什么"}
- 不要输出 JSON 以外的任何内容、不要用 markdown 代码块包裹
- text 必须是简体中文口语，要像真实用户的话，不要用「好的没问题」这种敷衍模板`
  }

  // 语义理解：把模型最新消息 + 最近历史 + 阶段 + 画像交给 LLM，返回 { action, text, understanding }
  async understand(msg, stage) {
    const c = msg.content ?? ''
    const hist = this.history.slice(-2).map((h) => `AI 搭档之前说：${h.slice(0, 120)}`).join('\n')
    const prompt = `AI 搭档最新对你说（${c.length} 字）：\n${c.slice(0, 800)}${c.length > 800 ? '…' : ''}\n${msg.candidates.length > 0 ? `\n候选选项：${msg.candidates.join(' | ')}` : ''}`
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: this.systemPrompt(stage) },
        ...(hist ? [{ role: 'user', content: hist }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body,
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw = data?.choices?.[0]?.message?.content ?? ''
      const j = JSON.parse(raw.replace(/^```json\s*|```$/g, '').trim())
      if (!j || !j.action) throw new Error('无 action')
      this.history.push(c.slice(0, 300))
      return j
    } catch (e) {
      console.log(`   ⚠️ LLM 用户模拟失败（${String(e).slice(0, 60)}）——回退正则决策`)
      return this.fallback(msg)
    }
  }

  // 兜底：正则阶段语义 + 现有正则决策（UserAgent.decide）——LLM 不可用时的退化路径
  fallback(msg) {
    const c = msg.content ?? ''
    const urlMatch = c.match(/https?:\/\/localhost:\d+/)
    if (urlMatch && SEM_PLAY.test(c)) return { action: 'play-test', text: '', understanding: '模型给地址让我试玩' }
    if (SEM_DONE.test(c) && !SEM_ASK.test(c)) return { action: 'confirm', text: '', understanding: '模型说完成/交付' }
    if (SEM_ASK.test(c) && !SEM_DONE.test(c)) return { action: 'type', text: '我玩了几把，手感还行——先这样吧，确认完成，我们推进', understanding: '模型征求决策' }
    if (SEM_CONFUSE.test(c) && !SEM_DONE.test(c)) return { action: 'type', text: '好，你确认排查一下，没问题了再告诉我', understanding: '模型对工具结果困惑' }
    if (SEM_PROMISE.test(c)) return { action: 'continue', text: '', understanding: '模型说要做但没动手' }
    const d = this.agent.decide(msg)
    if (d.action === 'click-option') return { action: 'click-option', text: d.text, understanding: d.understanding }
    if (d.action === 'type') return { action: 'type', text: d.text, understanding: d.understanding }
    if (d.action === 'continue') return { action: 'continue', text: '', understanding: d.reason }
    if (d.action === 'advance') return { action: 'confirm', text: '', understanding: d.reason }
    return { action: 'wait', text: '', understanding: d.reason }
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
    let stableCount = 0
    // 一轮检查：模型完全空闲（working=0 + 无工具执行 + 就绪 + 消息稳定连续 2 轮）才返回
    const settled = async () => {
      await this.page.waitForTimeout(1500)
      const t = await this.readTranscript()
      const msgs = t.filter((m) => m.content.trim())
      const lastMsg = msgs[msgs.length - 1]
      sb = await this.page.locator('.nf-statusbar').innerText().catch(() => '')
      const working = await this.page.locator('.nf-statusbar__dot--working').count().catch(() => 0)
      // 2026-08-05 打断根因修复：模型工具链执行中（工具卡 running/pending）绝不能返回让用户发送——
      // 发送会触发「处理中发送=打断+新指令优先」→ 模型工具链上下文重置 → 反复重启（写文件永远到不了）
      const runningTools = await this.page.locator('.nf-toolcall--running, .nf-toolcall--pending').count().catch(() => 0)
      const msgChanged = last && lastMsg && lastMsg.content !== last.content
      // 授权卡待批（「有操作待你批准」）——模型在等用户批准（maybeContinue 已停），不是没回复——返回让上层处理授权
      if (sb.includes('有操作待你批准') && lastMsg) return lastMsg
      // 2026-08-05：状态栏 isActionPromise 提示（「说要做但还没动手」）= 模型已回复完在等用户（0e12ea6 状态栏化后非「就绪」）——视为就绪返回，上层再推动
      if (sb.includes('说要做但还没动手') && lastMsg && !msgChanged) return lastMsg
      // 模型完全空闲才返回：working=0 + 无工具执行 + 状态「就绪」+ 消息稳定——连续 2 轮（防工具链间隙的「就绪」误判）
      if (lastMsg && lastMsg.content.trim() && working === 0 && runningTools === 0 && sb.includes('就绪') && !msgChanged) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) { last = lastMsg; return null } // 跳过 isActionPromise 系统提示（UI 插入，非模型回复）
        stableCount++
        if (stableCount >= 2) return lastMsg
      } else {
        stableCount = 0
      }
      if (lastMsg) last = lastMsg
      return null
    }
    while (Date.now() < deadline) {
      const r = await settled()
      if (r) return r
    }
    // 2026-08-05 超时容错：模型停住（状态「就绪」无新回复——偶发，如授权批准后模型没续聊）→
    // 真实用户会催一次「继续」再等 60s（防偶发停住误报为超时；真卡死仍由总超时兜底）
    if (sb.includes('就绪')) {
      console.log(`   ⚠️ waitSettled 超时但状态="${sb}"——真实用户催一次「继续」再等 60s`)
      await this.send('继续')
      const d2 = Date.now() + 60000
      while (Date.now() < d2) {
        const r = await settled()
        if (r) return r
      }
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
    const clean = cleanOpt(text ?? '')
    // ① 精确匹配（LLM/正则返回的选项原文）
    let btn = this.page.locator('.nf-candidates__btn').filter({ hasText: clean })
    if (await btn.count() > 0) { await btn.click(); return }
    // ② 核心词匹配（LLM 可能加序号前缀/简化——取冒号前 2-4 字）
    const core = clean.split(/[：:]/)[0].replace(/[①-⑩\d\s.、]/g, '').slice(0, 4)
    if (core) {
      btn = this.page.locator('.nf-candidates__btn').filter({ hasText: core })
      if (await btn.count() > 0) { await btn.click(); return }
    }
    throw new Error(`候选按钮「${text}」未找到——选项文本不匹配`)
  }

  async currentStage() {
    const active = this.page.locator('.nf-flow__stage--active')
    if (await active.count() === 0) return ''
    return (await active.innerText()).trim()
  }

  async clickAdvance(expectStage, timeoutMs = 60000) {
    // 2026-08-05 防双重推进（A7 教训）：模型【需求确认】标记会让 UI 自动推进（MainWorkspace 自动 stage++）——
    // 若当前阶段已是目标（或已过），不再点按钮（否则需求→设计→开发双跳，设计被跳过）
    if (expectStage) {
      const curNow = await this.currentStage().catch(() => '')
      if (curNow.includes(expectStage)) {
        console.log(`   ↪ 阶段已是 ${curNow}（UI 自动推进）——跳过点击`)
        return
      }
    }
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
    this.sim = new UserSimulator(agent)   // LLM 语义理解模拟用户（2026-08-05）
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
      // 2026-08-05 阶段自动推进检测：模型输出【需求确认】标记 → UI 自动推进到设计——跟住阶段
      const stNow = await this.driver.currentStage().catch(() => '')
      if (stNow && stNow.includes('设计')) { console.log('   ↪ 阶段已自动推进到设计——进入设计阶段'); return }
      const msg = await this.driver.waitSettled()
      if (msg.content === lastProcessed) {
        await this.driver.page.waitForTimeout(3000)
        continue
      }
      lastProcessed = msg.content
      // 2026-08-05 需求阶段模型越界（输出技术方案——STAGE_HINT 需求规则禁止给方案）→ 提醒先确认需求（防阶段错位）
      if (/(技术选型|整体方案|页面结构|模块划分|Three\.js|Vite|代码结构|用.*做.*引擎|渲染库)/.test(msg.content) && !/(【需求确认|需求确认：|确认完毕)/.test(msg.content)) {
        printModel(msg)
        console.log(`   ⚠️ 模型需求阶段输出技术方案（越界）——提醒先完成需求确认`)
        await this.driver.send('先别急着设计方案——先把需求确认清楚（做什么/给谁玩/在哪玩/做完什么样），方案到设计阶段再出')
        continue
      }
      // 需求确认 → 推进
      if (/(【需求确认|需求确认|确认完毕|点.*「?确认推进|确认无误|就这样定)/.test(msg.content)) {
        printModel(msg)
        console.log(`   📌 需求确认完成——点「确认推进」进入设计`)
        await this.driver.clickAdvance('设计')
        return
      }
      // 真实用户：先看完整回复 → 语义理解（LLM 优先，正则兜底）→ 决策
      printModel(msg)
      const decision = await this.sim.understand(msg, '需求')
      const und = decision.understanding ?? this.agent.understand(msg)
      if (decision.action === 'wait') {
        console.log(`   🧠 我的理解：${und}\n   ⏳ 等模型下一步`)
        await this.driver.page.waitForTimeout(3000)
        continue
      }
      if (decision.action === 'click-option') {
        console.log(`   🧑 我的理解：${und}\n      → 选「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
      } else if (decision.action === 'type' || decision.action === 'play-test' || decision.action === 'confirm') {
        console.log(`   🧑 我的理解：${und}\n      → 说「${(decision.text ?? '').slice(0, 40)}」`)
        await this.driver.send(decision.text || '好的，继续')
      } else if (decision.action === 'continue') {
        console.log(`   🧑 我的理解：${und}\n      → 回复「继续」`)
        await this.driver.send('继续')
      } else {
        // 2026-08-05 兜底安全化：LLM 返回未知/异常 action 时不推进（推进只由【需求确认】确定性检查负责——
        // 防 LLM 误判「模型在确认」为「需求完成」→ 跳过 4 问直接进设计）
        console.log(`   🧠 我的理解：${und}\n   ⏳ 暂不操作（LLM 决策类型异常）——等模型下一步`)
        await this.driver.page.waitForTimeout(3000)
        continue
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
    const deadline = Date.now() + 360000
    while (Date.now() < deadline) {
      // 2026-08-05 阶段自动推进检测：模型/UI 可能主动推进阶段（用户「推进」消息触发）——e2e 必须跟住，不能在本阶段循环里处理下一阶段消息
      const stNow = await this.driver.currentStage().catch(() => '')
      if (stNow && stNow.includes('开发')) { console.log('   ↪ 阶段已自动推进到开发——进入开发阶段'); return }
      const msg = await this.driver.waitSettled(120000)
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
      // 模型在问设计选择题/陈述方案 → LLM 语义理解（正则兜底）
      const decision = await this.sim.understand(msg, '设计')
      const und = decision.understanding ?? this.agent.understand(msg)
      if (decision.action === 'click-option') {
        console.log(`   🧑 设计选择（${und}）：选「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
        const next = await this.driver.waitNew(msg.content)
        this.verdicts.push({ stage: '设计', answered: decision.text, reply: next.content.slice(0, 50) })
        console.log(`   ✅ 模型回复：「${next.content.slice(0, 50).replace(/\n/g, ' ')}」\n`)
        lastProcessed = next.content
        continue
      }
      if (decision.action === 'type' || decision.action === 'play-test') {
        console.log(`   🧑 设计回答（${und}）：说「${(decision.text ?? '').slice(0, 40)}」`)
        await this.driver.send(decision.text || '好的，继续')
        const next = await this.driver.waitNew(msg.content)
        this.verdicts.push({ stage: '设计', answered: decision.text, reply: next.content.slice(0, 50) })
        console.log(`   ✅ 模型回复：「${next.content.slice(0, 50).replace(/\n/g, ' ')}」\n`)
        lastProcessed = next.content
        continue
      }
      if (decision.action === 'continue') {
        console.log(`   🧑 模型说要做但没动手（${und}）——回复「继续」`)
        await this.driver.send('继续')
        continue
      }
      if (decision.action === 'confirm') {
        // 用户确认方案 → 确定性验证方案完整（长度+要素）→ 推进；否则等模型补充
        const okLen = msg.content.length >= 60
        const okKw = /(方案|技术|用|结构|界面|页面|模块|整体)/.test(msg.content)
        if (okLen && okKw) {
          this.verdicts.push({ stage: '设计', okLen, okKw, len: msg.content.length })
          console.log(`   📐 设计验证：${msg.content.length} 字 ✓ 含方案要素 ✓ 我确认方案`)
          console.log(`   🧑 方案我看过了，没问题——点「确认推进」进入开发`)
          await this.driver.clickAdvance('开发')
          return
        }
        console.log(`   ⏳ 我确认方案了，但还没看到完整方案（${und}）——等模型补充`)
        await this.driver.page.waitForTimeout(1500)
        continue
      }
      // wait：模型在陈述方案 → 确定性检查「方案完整/确认推进」→ 推进
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
    const deadline = Date.now() + 480000
    while (Date.now() < deadline) {
      // 2026-08-05 阶段自动推进检测：模型/UI 可能主动推进到测试（用户「推进测试」消息触发）——跟住阶段，防本阶段循环超时
      const stNow = await this.driver.currentStage().catch(() => '')
      if (stNow && stNow.includes('测试')) { console.log('   ↪ 阶段已自动推进到测试——进入测试阶段'); return }
      const msg = await this.driver.waitSettled(120000)
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
      // 模型在写文件/说明进度（工具卡在动）→ 展示模型说什么，继续等
      const have = await this.driver.realFiles()
      printModel(msg)
      // 2026-08-05 LLM 语义理解（用户指示：真实用户模拟必须语义理解，非正则穷举）——
      // LLM 理解模型在说什么/在等什么（试玩/确认/选择/继续/陈述）；确定性验证（URL/清单）保留在阶段机
      const decision = await this.sim.understand(msg, '开发')
      const und = decision.understanding ?? this.agent.understand(msg)
      // 试玩反馈：模型给地址/让你试玩 = 交付体验等你反馈 → 真实用户打开验证（确定性 HTTP 验证）
      const urlMatch = msg.content.match(/https?:\/\/localhost:\d+/)
      if (decision.action === 'play-test' || (urlMatch && /(试|玩|打开|访问|体验|看看|感受)/.test(msg.content))) {
        let feedback
        if (urlMatch) {
          try {
            const res = await fetch(urlMatch[0], { signal: AbortSignal.timeout(6000) })
            const text = await res.text()
            feedback = res.ok && text.length > 50
              ? `我打开了 ${urlMatch[0]}，页面加载出来了（${res.status}，${text.length} 字节），能玩`
              : `我打开 ${urlMatch[0]} 是空白的（${res.status}，${text.length} 字节）——页面没加载出来，看看怎么回事`
          } catch (e) {
            feedback = `我打开 ${urlMatch[0]} 打不开（${String(e).slice(0, 60)}）——服务没起来？`
          }
        } else {
          feedback = decision.text || '怎么玩？把地址给我，我打开看看'
        }
        // 消息带候选按钮（模型问操作方式/配置）→ 真实用户会一并选
        if (msg.candidates.length > 0) {
          const d2 = this.agent.decide(msg)
          if (d2.action === 'click-option') {
            feedback += `。操作方式我选：${d2.text}`
            console.log(`   🧑 试玩验证+选择（${und}）：${feedback.slice(0, 80)}`)
            await this.driver.send(feedback)
            continue
          }
        }
        // 无候选 → 明确确认完成（防模型继续加功能没完没了）
        if (decision.action === 'play-test') feedback += '。就这样吧，确认开发完成，我们推进测试'
        console.log(`   🧑 试玩验证（${und}）：${feedback.slice(0, 80)}`)
        await this.driver.send(feedback)
        continue
      }
      // 2026-08-05 兜底：模型明确说「进入测试/测试阶段/推进测试」= 开发完成语义——模型文本推进 ≠ UI 阶段切换
      // （开发→测试需用户点确认推进按钮）——即使 LLM 用户误判 wait，也走清单确定性检查推进（防卡开发循环超时）
      if (decision.action === 'wait' && /(进入测试阶段|测试阶段启动|推进测试|开发完成|测试阶段了|进测试)/.test(msg.content)) {
        console.log(`   ⚠️ 模型明确表示进入测试阶段（${und}）——走清单检查推进`)
        const missing = planned.filter((pf) => !have.some((h) => h === pf || h.endsWith(pf) || pf.endsWith(h)))
        if (missing.length === 0) {
          this.verdicts.push({ stage: '开发', planned: planned.length, have: have.length })
          console.log(`   ✅ 开发完成（清单 ${planned.length}/${planned.length} 文件齐全）——点「确认推进」进入测试`)
          await this.driver.clickAdvance('测试')
          return
        }
        console.log(`   ⚠️ 模型说进测试但清单还缺：${missing.join(', ')}——提醒补齐`)
        await this.driver.send(`清单里的 ${missing.slice(0, 3).join('、')} 还没看到，补一下再确认`)
        continue
      }
      // 模型说写完/交付（confirm）→ 清单确定性检查（真实文件系统）——LLM 说完成不直接推进，查证据
      if (decision.action === 'confirm') {
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
      if (decision.action === 'click-option') {
        console.log(`   🧑 选择（${und}）：选「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
        continue
      }
      if (decision.action === 'type') {
        console.log(`   🧑 我说话（${und}）：「${(decision.text ?? '').slice(0, 40)}」`)
        await this.driver.send(decision.text || '好的，继续')
        continue
      }
      if (decision.action === 'continue') {
        console.log(`   🧑 模型说要做但没动手（${und}）——回复「继续」`)
        await this.driver.send('继续')
        continue
      }
      // wait：模型还在做（没说完成/没在等）→ 等下一轮
      await this.driver.page.waitForTimeout(1500)
    }
    throw new Error('开发阶段超时（模型未完成——清单文件未全部产出）')
  }

  // ---- 测试阶段：真实用户——模型必须实际调工具验证（跑起来/检查）并说通过，才能推进 ----
  async test() {
    let lastProcessed = '' // 已处理消息（防同一条重复打印/处理）
    const deadline = Date.now() + 480000
    while (Date.now() < deadline) {
      // 2026-08-05 阶段自动推进检测：模型/UI 可能主动推进到部署——跟住阶段
      const stNow = await this.driver.currentStage().catch(() => '')
      if (stNow && stNow.includes('部署')) { console.log('   ↪ 阶段已自动推进到部署——进入部署阶段'); return }
      const msg = await this.driver.waitSettled(120000)
      if (msg.content === lastProcessed) { await this.driver.page.waitForTimeout(3000); continue }
      lastProcessed = msg.content
      const ap = await this.driver.approvePending()
      if (ap) { console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`); continue }
      printModel(msg)
      // 2026-08-05 LLM 语义理解（用户指示：真实用户模拟必须语义理解，非正则穷举）
      const decision = await this.sim.understand(msg, '测试')
      const und = decision.understanding ?? this.agent.understand(msg)
      // 试玩反馈：模型给地址/要我实测 = 等用户打开确认 → 真实用户打开验证（确定性 HTTP）
      const tUrl = msg.content.match(/https?:\/\/localhost:\d+/)
      if (decision.action === 'play-test' || (tUrl && /(试|玩|打开|访问|体验|看看|感受|确认)/.test(msg.content))) {
        let fb
        if (tUrl) {
          try {
            const res = await fetch(tUrl[0], { signal: AbortSignal.timeout(6000) })
            const text = await res.text()
            fb = res.ok && text.length > 50
              ? `我打开了 ${tUrl[0]}，页面正常（${res.status}，${text.length} 字节）——确认可以`
              : `我打开 ${tUrl[0]} 是空白的（${res.status}，${text.length} 字节）——页面没加载出来`
          } catch (e) {
            fb = `我打开 ${tUrl[0]} 打不开（${String(e).slice(0, 60)}）——服务没起来？`
          }
        } else {
          fb = decision.text || '怎么试？把地址给我，我打开看看'
        }
        console.log(`   🧑 打开确认（${und}）：${fb.slice(0, 80)}`)
        await this.driver.send(fb)
        continue
      }
      // 真实验证（确定性）：模型实际调了工具（bash 跑/检查/启动）+ 明确说验证通过——LLM confirm 与正则 saidPass 双保险
      const t = await this.driver.readTranscript()
      const hasBashRun = t.some((m) => m.tools.some((x) => /(npm|vite|serve|启动|运行|执行|检查|ls|测试|验证|test)/.test(x)))
      const saidPass = SEM_DONE.test(msg.content) || /(验证通过|测试通过|能跑|正常运行|没问题|启动成功|检查通过)/.test(msg.content)
      if ((decision.action === 'confirm' || saidPass) && hasBashRun) {
        this.verdicts.push({ stage: '测试', hasBashRun, saidPass })
        console.log(`   ✅ 测试验证通过（有实际运行/检查动作 + 模型确认）——点「确认推进」进入部署`)
        await this.driver.clickAdvance('部署')
        return
      }
      if ((decision.action === 'confirm' || saidPass) && !hasBashRun) {
        // 模型说通过但没实际跑 → 真实用户会要求实际验证
        console.log(`   ⚠️ 模型说通过，但没看到实际运行/检查动作`)
        console.log(`   🧑 要求实际验证：「实际跑起来验证一下，确认能打开」`)
        await this.driver.send('实际跑起来验证一下，确认能打开再确认完成')
        continue
      }
      if (decision.action === 'click-option') {
        console.log(`   🧑 选择（${und}）：选「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
        continue
      }
      if (decision.action === 'type') {
        console.log(`   🧑 我说话（${und}）：「${(decision.text ?? '').slice(0, 40)}」`)
        await this.driver.send(decision.text || '好的，继续')
        continue
      }
      if (decision.action === 'continue') {
        console.log(`   🧑 模型说要做但没动手（${und}）——回复「继续」`)
        await this.driver.send('继续')
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
    const deadline = Date.now() + 300000
    while (Date.now() < deadline) {
      msg = await this.driver.waitSettled(120000)
      const ap = await this.driver.approvePending()
      if (ap) { console.log(`   🔓 授权：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`); continue }
      if (/说要做但还没动手|回复.*继续/.test(msg.content) || SEM_PROMISE.test(msg.content)) {
        console.log(`   🧑 模型说要做但没动手——回复「继续」让它干完`)
        await this.driver.send('继续')
        continue
      }
      printModel(msg)
      // 2026-08-05 LLM 语义理解（同开发/测试阶段）
      const decision = await this.sim.understand(msg, '部署')
      const und = decision.understanding ?? this.agent.understand(msg)
      // 试玩反馈：模型「部署好了/上线了 + 地址」= 等用户打开确认——真实用户打开验证（确定性 HTTP）
      const dUrl = msg.content.match(/https?:\/\/localhost:\d+/)
      if (decision.action === 'play-test' || (dUrl && /(试|玩|打开|访问|体验|看看|感受|确认)/.test(msg.content))) {
        let fb
        if (dUrl) {
          try {
            const res = await fetch(dUrl[0], { signal: AbortSignal.timeout(6000) })
            const text = await res.text()
            fb = res.ok && text.length > 50
              ? `我打开了 ${dUrl[0]}，能正常访问（${res.status}）——确认没问题`
              : `我打开 ${dUrl[0]} 是空白的（${res.status}，${text.length} 字节）——有问题`
          } catch (e) {
            fb = `我打开 ${dUrl[0]} 打不开（${String(e).slice(0, 60)}）`
          }
        } else {
          fb = decision.text || '怎么访问？把地址给我'
        }
        console.log(`   🧑 打开确认（${und}）：${fb.slice(0, 80)}`)
        await this.driver.send(fb)
        continue
      }
      // 可执行部署（确定性）：给了命令/平台/链接/实际部署动作——LLM confirm 与 actionable 双保险
      const actionable = /(npm run|vercel|部署|上线|链接|地址|端口|localhost|npm i|npm install|访问|打开.*玩|部署好了|可以玩|deployed|live|online)/i.test(msg.content)
      if ((decision.action === 'confirm' || decision.action === 'type') && actionable) {
        this.verdicts.push({ stage: '部署', actionable })
        console.log(`   ✅ 部署方案可执行（${msg.content.slice(0, 40)}…）`)
        break
      }
      if (decision.action === 'click-option') {
        console.log(`   🧑 选择（${und}）：选「${decision.text}」`)
        await this.driver.clickCandidate(decision.text)
        continue
      }
      if (decision.action === 'type') {
        console.log(`   🧑 我说话（${und}）：「${(decision.text ?? '').slice(0, 40)}」`)
        await this.driver.send(decision.text || '好的，继续')
        continue
      }
      if (decision.action === 'continue') {
        console.log(`   🧑 模型说要做但没动手（${und}）——回复「继续」`)
        await this.driver.send('继续')
        continue
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
