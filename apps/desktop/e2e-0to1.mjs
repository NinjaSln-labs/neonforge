import { _electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ensureMainBuild } from './e2e-build-check.mjs'
// 模拟器域（设计 docs/design/e2e-simulator-domain-design.md——DDD 重构 2026-08-16）：
// 信号派生/决策策略/旅程/收敛/验证全在领域层（e2e-sim/*.mjs 纯函数——L1 可测）
import { deriveModelSignal, Signal } from './e2e-sim/signals.mjs'
import { decide as decideFallback, verifyGoalEcho, Question } from './e2e-sim/decide.mjs'
import { createJourney, advance, terminated } from './e2e-sim/journey.mjs'
import { createGuard } from './e2e-sim/convergence.mjs'
import { verifyArtifacts, verifyPlayable } from './e2e-sim/verify.mjs'

// ============================================================================
// NeonForge 0-1 完整流程 E2E —— 真实用户模拟（模拟器域 DDD · 决策点驱动 · 无阶段）
// ============================================================================
// 设计原则（用户 2026-08-05 指示）：
// ① 模拟真实用户：每一步 = 【读完整内容 → 理解模型在说什么 → 思考 → 决策（含理由）→ 操作 → 验证模型正常回复】
//    ——用户会看内容、思考、才决定，不会一通猛点。
// ② 不追求一次跑通全部：分阶段构建（PHASE=req|design|dev|all）——PHASE 映射旅程终止点（领域层 journey）
// ③ 可复现：这套测试用于以后还原用户实际操作、复现 bug（配合日志定位）。
// ④ 防假阳性：每决策点确定性验证（领域层 verify）
//
// 2026-08-16 DDD 重构（用户指示：最早没有好好 DDD 设计——按当前项目设计推翻重构）：
// - StageMachine（requirement/design/development/test/deploy 五阶段循环——产品已无阶段）→ JourneyRunner 决策点单一循环
// - 理解三实现（UserAgent 正则/UserSimulator LLM/fallback 正则——缝隙 4 违反）→ deriveModelSignal 单一信号源 + LLM 增强
// - staleRounds 四份拷贝（#9）→ ConvergenceGuard 域对象（e2e-sim/convergence.mjs）
// - 决策/验证内联 → 领域层 decide/verify
//
// 用法：
//   PHASE=req  node e2e-0to1.mjs   # 只跑需求阶段（目标确认后停）
//   PHASE=design node e2e-0to1.mjs # 方案确认后停
//   PHASE=dev   node e2e-0to1.mjs  # 首个产物确认后停
//   PHASE=all   node e2e-0to1.mjs  # 完整流程
//   MODE=A/B   node e2e-0to1.mjs   # 场景（起始页填/不填）
// ============================================================================

const KEY =
  process.env.NF_TEST_KEY ||
  (() => {
    try {
      const cfg = JSON.parse(
        fs.readFileSync(
          path.join(
            os.homedir(),
            'Library/Application Support/neonforge-desktop/config/neonforge-config.json',
          ),
          'utf8',
        ),
      )
      return cfg.apiKeyPlain || ''
    } catch {
      return ''
    }
  })()
const WORK_DIR = '/tmp/nf-e2e-test'
const LOCK_DIR = path.join(os.homedir(), 'Library/Application Support/neonforge-desktop')

// ============================================================================
// 领域模型
// ============================================================================

/** 对话消息（UI → 领域）：完整内容 + 候选按钮 + 工具卡 */
/** @typedef {{ role: 'user'|'assistant', content: string, candidates: string[], tools: string[] }} Msg */

/** 用户决策（领域 → UI 动作）：每个决策带理解与理由（模拟真人——action 对齐领域层 decide） */
/** @typedef {{ action: 'confirm-goal'|'confirm-plan'|'confirm-resolution'|'approve'|'choose'|'answer'|'nudge'|'playtest-feedback'|'wait', text?: string, understanding: string, reason: string }} Decision */

const cleanOpt = (o) =>
  String(o)
    .replace(/^[①-⑩]\s*\n?\s*/, '')
    .trim()

// ============================================================================
// UserAgent —— 模拟用户状态（画像 + 决策轨迹）
// DDD 重构（2026-08-16）：决策语义（classify/matchOption/typeAnswer/verifyEcho）已下沉领域层
// （e2e-sim/decide.mjs）——本类只保留用户态（画像/步骤——可复现轨迹）
// ============================================================================

class UserAgent {
  constructor() {
    this.profile = {} // 用户画像（我的选择——键为领域 Question 常量）
    this.steps = [] // 逐步决策记录（可复现）
  }

  // 验证模型是否理解了我们的选择（复述确认——领域层判定）
  verifyEcho(reply, chosenText) {
    return verifyGoalEcho(reply, chosenText)
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
    this.agent = agent // UserAgent：画像（领域 Question 键）+ 决策轨迹
    this.history = [] // 最近模型消息（供上下文理解）
  }

  personaText() {
    const p = this.agent.profile
    const lines = [
      `- 你想做一个「射击游戏」（你打字的同音误输入成了「3D设计」，其实是射击）`,
      `- 目标玩家：${p[Question.AUDIENCE] || '大众，随便谁都能玩、简单易上手'}`,
      `- 平台：${p[Question.PLATFORM] || '网页浏览器，打开就能玩'}`,
      `- 完成标准：${p[Question.DONE] || '能玩就行——能开枪打中、有得分、界面简单'}`,
      `- 你不懂编程，说话口语化，会催进度，但配合度高`,
    ]
    return lines.join('\n')
  }

  systemPrompt(journeyLabel) {
    return `你是「小明」，一个完全不懂编程的普通用户，正在用 AI 工作台让 AI 搭档帮你做游戏。
你的画像：
${this.personaText()}

当前进度：${journeyLabel}

你的任务：理解 AI 搭档最新对你说的话——它可能在问你问题、在等你操作、在陈述进度、
在请你打开网址试玩、在请你确认。像真实用户一样根据上下文真正理解它的意图，然后做出真实反应。

行动约束（只输出一个 action，action 与 text 必须匹配——决策点语义对齐产品确认卡）：
- answer: 你需要说话（回答问题/给反馈/提要求/确认方向）——text 写你口语化的原话
- choose: 模型给了候选选项让你选——text 写你选的选项原文（必须来自模型消息里的选项）
- playtest-feedback: 模型给了网址/让你打开试玩——text 写你打开后的真实反馈（能玩/不能玩+现象）
- confirm-goal / confirm-plan / confirm-resolution: 模型提议目标/方案/完成，卡弹出等你确认——text 写你的确认或指出的问题
- approve: 授权卡/批准文件清单待批——text 写「批准」
- nudge: 模型说了要做但还没做——text 写「继续」
- wait: 模型只是陈述/说明/在干活，没在等你——text 写空字符串

规则：如果 AI 搭档在问你问题（候选选项或开放问题），你必须直接回答（choose 选候选 / answer 打字回答）——不要只说「确认/同意」；
只有它明确提议目标/方案/完成（确认卡）才用 confirm-goal/confirm-plan/confirm-resolution；方向确认类提问用 answer 确认方向并推动收敛。

严格约束：
- 输出必须是单个 JSON 对象：{"action":"...","text":"...","understanding":"一句话说明你理解它在说什么"}
- 不要输出 JSON 以外的任何内容、不要用 markdown 代码块包裹
- text 必须是简体中文口语，要像真实用户的话，不要用「好的没问题」这种敷衍模板`
  }

  /** 决策（LLM 增强优先 + 领域层确定性兜底——单一决策语义，无第三套实现）
   * @param {string} signal 领域信号（deriveModelSignal 派生）
   * @param {{ content?: string, candidates?: string[] }} msg
   * @param {string} journeyLabel 旅程进度描述（无阶段——决策点标签）
   */
  async decideWithSignal(signal, msg, journeyLabel) {
    const c = msg.content ?? ''
    // LLM 增强：自由文本意图理解（同产品「确定性派生为主 + 增强」模式）
    try {
      const hist = this.history
        .slice(-2)
        .map((h) => `AI 搭档之前说：${h.slice(0, 120)}`)
        .join('\n')
      const prompt = `AI 搭档最新对你说（${c.length} 字）：\n${c.slice(0, 800)}${c.length > 800 ? '…' : ''}\n${msg.candidates.length > 0 ? `\n候选选项：${msg.candidates.join(' | ')}` : ''}\n\n只输出一个 JSON 对象（无 Markdown 代码块包裹）：{"action":"<choose|answer|clarify|agree|feedback>", "text":"<一句话回复>"}`
      const body = JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [
          { role: 'system', content: this.systemPrompt(journeyLabel) },
          ...(hist ? [{ role: 'user', content: hist }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
        // 2026-08-21 provider 兼容（ADR-007）：Command Code 拒绝 response_format（实测 400「Invalid input, param: response_format」）——
        // 移除该参数，JSON 输出由 prompt 明确要求（用户模拟仅测试工具；失败有 decideFallback 兜底，不崩）
        // response_format: { type: 'json_object' },
      })
      const res = await fetch('https://api.commandcode.ai/provider/v1/chat/completions', {
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
      // 应用画像补丁（LLM 的 choose/answer 若命中 4 问——由领域 decide 的 profilePatch 语义兜底——
      // LLM 路径的选择记录在应用层 steps；画像主要由确定性路径维护（decide 返回 profilePatch）
      return { ...j, from: 'llm' }
    } catch (e) {
      console.log(`   ⚠️ LLM 用户模拟失败（${String(e).slice(0, 60)}）——回退领域层确定性决策`)
    }
    // 领域层确定性决策（单一兜底——deriveModelSignal 信号 → decide）
    const d = decideFallback(signal, {
      content: c,
      candidates: msg.candidates ?? [],
      profile: this.agent.profile,
    })
    return { ...d, from: 'domain' }
  }
}

// ============================================================================
// SessionDriver —— UI 驱动
// ============================================================================

class SessionDriver {
  constructor(page) {
    this.page = page
  }

  async readTranscript() {
    const out = []
    const msgs = this.page.locator('.nf-msg')
    const n = await msgs.count()
    for (let i = 0; i < n; i++) {
      const m = msgs.nth(i)
      const cls = await m.getAttribute('class')
      const role = cls.includes('nf-msg--user') ? 'user' : 'assistant'
      const content = await m
        .locator('.nf-msg__body')
        .innerText()
        .catch(() => '')
      const candidates = await m
        .locator('.nf-candidates__btn')
        .allInnerTexts()
        .catch(() => [])
      const tools = await m
        .locator('.nf-toolcall')
        .allInnerTexts()
        .catch(() => [])
      out.push({ role, content, candidates, tools })
    }
    return out
  }

  async latestAssistant() {
    const t = await this.readTranscript()
    return [...t].reverse().find((m) => m.role === 'assistant') ?? null
  }

  async waitSettled(timeoutMs = 120000) {
    // 2026-08-13 waitSettled 卡死修复（HANDOFF §3 首选——阻塞 approve-files 验证 4f1a7f4 的根因）：
    // 点「确认执行」后 tool-only 长链（write 10+ 文件 / npm install 120s+——坑 61）会超固定 120s 窗口
    // → settled() 永不返回 → 超时 throw 误杀合法长链（模型还在干活，e2e 却判失败）。三件套：
    // ① 放宽 tool-only：进展指纹含工具卡——纯工具链（无正文消息）持续变化 = 模型在推进，窗口随进展顺延
    // ② 状态栏读取容错：innerText 失败/为空时不据此判忙——就绪判定退化为 working/工具卡计数
    // ③ 长空闲兜底：窗口耗尽且无进展 → 返回最后一条已知回复（上层去重/推动），不再无条件 throw
    let windowEnd = Date.now() + timeoutMs
    const hardDeadline = Date.now() + timeoutMs * 4 // 硬上限——推进中顺延到上限，防真卡死无限等
    let last = null
    let sb = '' // 循环外定义——超时 throw 引用
    let stableCount = 0
    let lastFp = '' // 上一轮 transcript 指纹（消息+内容+工具卡）
    let idleSince = Date.now()
    // 一轮检查：模型完全空闲（working=0 + 无工具执行 + 就绪 + 消息稳定连续 2 轮）才返回
    const settled = async () => {
      await this.page.waitForTimeout(1500)
      const t = await this.readTranscript()
      // 2026-08-08 waitSettled bug 修复（同源——冒烟脚本先发现）：只取 assistant 消息——
      // 用户消息（如确认按钮 send）不能当模型回复返回（主循环拿到用户消息就误判模型回复完成）
      const msgs = t.filter((m) => m.role === 'assistant' && m.content.trim())
      const lastMsg = msgs[msgs.length - 1]
      sb = await this.page
        .locator('.nf-statusbar')
        .innerText()
        .catch(() => '')
      const working = await this.page
        .locator('.nf-statusbar__dot--working')
        .count()
        .catch(() => 0)
      // 2026-08-05 打断根因修复：模型工具链执行中（工具卡 running/pending）绝不能返回让用户发送——
      // 发送会触发「处理中发送=打断+新指令优先」→ 模型工具链上下文重置 → 反复重启（写文件永远到不了）
      const runningTools = await this.page
        .locator('.nf-toolcall--running, .nf-toolcall--pending')
        .count()
        .catch(() => 0)
      // ① 放宽 tool-only：指纹 = 消息数 + 内容摘要 + 工具卡数/文本——纯工具链持续变化也算进展
      const fp = t
        .map(
          (m) =>
            `${m.role}|${m.content.slice(0, 30)}|${m.tools.length}|${m.tools.join('|').slice(0, 40)}`,
        )
        .join('~')
      if (fp !== lastFp) {
        lastFp = fp
        idleSince = Date.now()
      }
      const msgChanged = last && lastMsg && lastMsg.content !== last.content
      // 授权卡待批（「有操作待你批准」）——模型在等用户批准（maybeContinue 已停），不是没回复——返回让上层处理授权
      if (sb.includes('有操作待你批准') && lastMsg) return lastMsg
      // 2026-08-05：状态栏 isActionPromise 提示（「说要做但还没动手」）= 模型已回复完在等用户（0e12ea6 状态栏化后非「就绪」）——视为就绪返回，上层再推动
      if (sb.includes('说要做但还没动手') && lastMsg && !msgChanged) return lastMsg
      // ② 状态栏容错：读失败/为空（sb===''）→ 不据此判忙——就绪判定退化为 working/工具卡计数
      const ready = sb === '' ? working === 0 && runningTools === 0 : sb.includes('就绪')
      // 模型完全空闲才返回：working=0 + 无工具执行 + 状态「就绪」+ 消息稳定——连续 2 轮（防工具链间隙的「就绪」误判）
      if (
        lastMsg &&
        lastMsg.content.trim() &&
        ready &&
        working === 0 &&
        runningTools === 0 &&
        !msgChanged
      ) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) {
          last = lastMsg
          return null
        } // 跳过 isActionPromise 系统提示（UI 插入，非模型回复）
        stableCount++
        if (stableCount >= 2) return lastMsg
      } else {
        stableCount = 0
      }
      if (lastMsg) last = lastMsg
      return null
    }
    while (Date.now() < hardDeadline) {
      const r = await settled()
      if (r) return r
      // ③ 长空闲兜底：窗口耗尽且无进展（或忙但停滞）→ 返回最后一条已知回复，上层去重/推动——不再无条件 throw
      const busy = sb.includes('搭档处理中') || sb.includes('工具执行中')
      const progressing = Date.now() - idleSince < 25000 // 25s 内有进展（消息/工具卡变化）→ 工具链还活着
      if (Date.now() < windowEnd) continue
      if (busy && progressing) {
        windowEnd = Date.now() + 30000 // ① 链在推进——顺延窗口（防固定窗口误杀长链；硬上限兜底）
        continue
      }
      if (last) {
        console.log(
          `   ⚠️ waitSettled 窗口耗尽（${timeoutMs / 1000}s）——状态栏="${sb}"，返回最后一条已知回复（${last.content.slice(0, 30)}…）让上层去重/推动`,
        )
        return last
      }
      windowEnd = Date.now() + 30000 // 首条消息迟迟不来（模型预热/流式慢）——继续等到硬上限
    }
    throw new Error(
      `waitSettled 硬超时 ${(timeoutMs * 4) / 1000}s（工具链停滞/模型无回复——状态栏="${sb}"，最后消息="${last?.content.slice(0, 40) ?? ''}"）`,
    )
  }

  // 等模型「新」回复（内容必须变化——用于决策后等待模型对操作的回复，防点击没生效）
  async waitNew(fromContent, timeoutMs = 120000) {
    // 2026-08-13 同 waitSettled 修复：工具链推进中窗口顺延（防 approve 后长链误判「模型对操作无新回复」）
    let windowEnd = Date.now() + timeoutMs
    const hardDeadline = Date.now() + timeoutMs * 4
    let lastReal = null // 最后一条非提示的模型回复（提示插入后模型已回复完——用于超时容错）
    let lastFp = ''
    let idleSince = Date.now()
    let lastApprovalAt = 0 // 2026-08-15 E3：授权点击防抖（点卡后冷却 2s——防同卡重复点击/渲染滞后重复批准）
    while (Date.now() < hardDeadline) {
      await this.page.waitForTimeout(1500)
      // 2026-08-15 问题 A 修复后适配：模型调工具被拦 → 授权卡弹出 → maybeContinue 停（正确行为——不再 14 轮循环）→
      // waitNew 若只等「新回复」会死等 480s（tool-only 轮内容为空被 content 过滤跳过）。检测「有操作待你批准」
      // → 点授权卡（approvePending 完整策略）→ 继续等模型对操作的回复。waitSettled 已有同款检测（348 行）——补 waitNew
      const sbNow = await this.page
        .locator('.nf-statusbar')
        .innerText()
        .catch(() => '')
      if (sbNow.includes('有操作待你批准') && Date.now() - lastApprovalAt > 2000) {
        const ap = await this.approvePending()
        if (ap) {
          lastApprovalAt = Date.now()
          console.log(`   🔓 授权（等待中）：${ap.label}${ap.detail ? `（${ap.detail}）` : ''}`)
          continue
        }
      }
      const t = await this.readTranscript()
      const lastMsg = [...t].reverse().find((m) => m.role === 'assistant' && m.content.trim())
      const fp = t
        .map(
          (m) =>
            `${m.role}|${m.content.slice(0, 30)}|${m.tools.length}|${m.tools.join('|').slice(0, 40)}`,
        )
        .join('~')
      if (fp !== lastFp) {
        lastFp = fp
        idleSince = Date.now()
      }
      if (lastMsg && lastMsg.content !== fromContent) {
        if (/说要做但还没动手|回复.*继续/.test(lastMsg.content)) continue // 跳过 isActionPromise 系统提示（非模型回复）
        return lastMsg
      }
      // 记录已出现的非提示消息（可能被提示挤到后面——用于超时容错）
      const real = [...t]
        .reverse()
        .find(
          (m) =>
            m.role === 'assistant' &&
            m.content.trim() &&
            !/说要做但还没动手|回复.*继续/.test(m.content),
        )
      if (real && real.content !== fromContent) lastReal = real
      if (Date.now() >= windowEnd) {
        const busy =
          (await this.page
            .locator('.nf-statusbar__dot--working')
            .count()
            .catch(() => 0)) > 0 ||
          (await this.page
            .locator('.nf-toolcall--running, .nf-toolcall--pending')
            .count()
            .catch(() => 0)) > 0
        const progressing = Date.now() - idleSince < 25000
        if (busy && progressing) {
          windowEnd = Date.now() + 30000
          continue
        } // 链在推进——顺延
        // 超时容错：模型回复完成后被 isActionPromise 提示插入（提示是最后一条）——此时返回提示前的模型回复（流程可继续）
        if (lastReal && lastReal.content !== fromContent) {
          console.log(
            `   ⚠️ 模型回复后插入系统提示（isActionPromise），返回提示前的模型回复继续流程`,
          )
          return lastReal
        }
        windowEnd = Date.now() + 30000 // 首条新回复迟迟不来（模型预热/流式慢）——继续等到硬上限
      }
    }
    // 超时诊断：区分「模型流式中断/无响应」vs「操作未生效」（模拟真实用户遇到卡住时看状态）
    const sb = await this.page
      .locator('.nf-statusbar')
      .innerText()
      .catch(() => '?')
    const last = await this.latestAssistant()
    const working = await this.page
      .locator('.nf-statusbar__dot--working')
      .count()
      .catch(() => -1)
    throw new Error(
      `模型对操作无新回复（${(timeoutMs * 4) / 1000}s）——状态栏="${sb}" working=${working} 最后消息="${last?.content.slice(0, 40) ?? ''}"（可能流式中断/模型无响应）`,
    )
  }

  async send(text) {
    await this.page.locator('.nf-chat__input textarea').fill(text)
    await this.page.locator('.nf-chat__input textarea').press('Meta+Enter')
  }

  async clickCandidate(text) {
    const clean = cleanOpt(text ?? '')
    // ① 精确匹配（LLM/正则返回的选项原文）
    let btn = this.page.locator('.nf-candidates__btn').filter({ hasText: clean })
    if ((await btn.count()) > 0) {
      await btn.click()
      return
    }
    // ② 核心词匹配（LLM 可能加序号前缀/简化——取冒号前 2-4 字）
    const core = clean
      .split(/[：:]/)[0]
      .replace(/[①-⑩\d\s.、]/g, '')
      .slice(0, 4)
    if (core) {
      btn = this.page.locator('.nf-candidates__btn').filter({ hasText: core })
      if ((await btn.count()) > 0) {
        await btn.click()
        return
      }
    }
    // 2026-08-15 降级（实测：模型输出非标准候选标签如 <异值候选> → 产品只去标签不渲染按钮——坑 100 ① 同类
    // 格式漂移）：真实用户面对「有选项文本但无按钮」会直接打字表达选择——降级为发送文本，不抛错中断流程
    console.log(
      `   ⚠️ 候选按钮「${text}」未找到（模型未用标准 <candidates> 块）——降级为直接输入文本`,
    )
    await this.send(clean)
  }

  async approvePending() {
    const p = this.page
    const plan = p.locator('.nf-toolcall__approve', { hasText: '批准这批文件' })
    if ((await plan.count()) > 0) {
      // 提取文件清单（路径 + 原因）——真实用户批准前会看清单
      const files = await p
        .locator('.nf-plan__file')
        .allInnerTexts()
        .catch(() => [])
      const paths = await p
        .locator('.nf-plan__path')
        .allInnerTexts()
        .catch(() => [])
      await plan.first().click()
      return {
        label: '批准这批文件',
        detail: `文件清单(${files.length})：${files
          .slice(0, 6)
          .map((f) => f.replace(/\n/g, ' ').slice(0, 35))
          .join(' | ')}`,
        planFiles: paths.map((s) => s.trim()).filter(Boolean),
      }
    }
    const batch = p.locator('.nf-toolcall__batch-approve')
    if ((await batch.count()) > 0) {
      await batch.first().click()
      return { label: '全部允许并记住', detail: '' }
    }
    const remember = p.locator('.nf-toolcall__remember')
    if ((await remember.count()) > 0) {
      const target = await remember
        .first()
        .locator('xpath=ancestor::div[contains(@class,"nf-toolcall")]')
        .locator('.nf-toolcall__args')
        .innerText()
        .catch(() => '')
      await remember.first().click()
      return { label: '允许并记住', detail: target }
    }
    const approve = p.locator('.nf-toolcall__approve')
    if ((await approve.count()) > 0) {
      const target = await approve
        .first()
        .locator('xpath=ancestor::div[contains(@class,"nf-toolcall")]')
        .locator('.nf-toolcall__args')
        .innerText()
        .catch(() => '')
      await approve.first().click()
      return { label: '允许执行', detail: target }
    }
    return null
  }

  // 2026-08-08 第 4 个问题修复（feedback.log 标注「之前用户未点确认目标卡」——e2e 与无阶段交互脱节根因）：
  // 无阶段重构后确认**只走卡片按钮**（坑 135：文本确认词已删除）——e2e 用户模拟必须点卡：
  // 结构化确认卡（目标确认/执行确认/已解决——.nf-confirmcard）+ 授权卡（approve-files 等——approvePending）
  // 2026-08-15 E1（无阶段语义对齐——no-stage-refactor「确认目标 → goalConfirmed」）：
  // only 参数限定可点的确认卡——需求阶段只点「确认目标」（点掉=需求收敛，进设计阶段）；
  // 「确认执行」是设计阶段的决策点——需求未收敛时点掉会提前触发 forceTool 强制（时间线实证 e070d44c seq 71-99）
  async handleCards(only) {
    const p = this.page
    // 结构化确认卡（对话流内嵌）——点「确认目标」→ goalConfirmed；「确认执行」→ executionConfirmed；「已解决」→ goalAchieved
    const confirmBtns = only && only.length > 0 ? only : ['确认目标', '确认执行', '已解决']
    for (const name of confirmBtns) {
      const btn = p.getByRole('button', { name })
      if ((await btn.count()) > 0) {
        await btn.first().click()
        return { label: `点确认卡「${name}」` }
      }
    }
    // 授权卡（approve-files 批量/单卡/允许并记住/允许执行）
    const ap = await this.approvePending()
    return ap
      ? { label: `批准授权：${ap.label}`, detail: ap.detail, planFiles: ap.planFiles }
      : null
  }

  async fileTree() {
    return (
      await this.page
        .locator('.nf-filetree span, [class*="filetree"] span')
        .allInnerTexts()
        .catch(() => [])
    )
      .map((s) => s.trim())
      .filter(Boolean)
  }

  // 是否有未完成的工具卡（running/pending——bash 长任务如 npm install 执行中）
  async toolsRunning() {
    return await this.page
      .locator('.nf-toolcall--running, .nf-toolcall--pending')
      .count()
      .catch(() => 0)
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
    return this.page
      .locator('.nf-statusbar')
      .innerText()
      .catch(() => '')
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
    console.log(
      `       [工具卡] ${msg.tools
        .slice(0, 4)
        .map((t) => t.replace(/\n/g, ' ').slice(0, 50))
        .join(' | ')}`,
    )
  }
}

// ============================================================================
// 阶段机
// ============================================================================

class JourneyRunner {
  constructor(driver, agent, phase) {
    this.driver = driver
    this.agent = agent
    this.sim = new UserSimulator(agent) // LLM 增强（失败降级领域层确定性决策——单一兜底）
    this.journey = createJourney(phase) // 旅程状态机（决策点驱动 · 无阶段——领域层）
    this.guard = createGuard({ staleLimit: phase === 'req' ? 20 : 15 }) // 收敛守卫（#9 域对象化）
    this.verdicts = []
    this.lastProcessed = ''
    this.planned = [] // 批准文件清单（approve-files）
    this.produced = [] // 产出文件记录（write/edit done）
  }

  journeyLabel() {
    const j = this.journey
    if (!j.confirmed.goal) return '目标未确认——澄清/目标提议中'
    if (!j.confirmed.plan) return '目标已确认——方案提议/确认中'
    if (!j.produced) return '方案已确认——执行中'
    if (!j.confirmed.resolution) return '已产出——完成声明/解决确认中'
    return '交付验证'
  }

  async run() {
    console.log(
      '   🚶 模拟用户旅程（决策点驱动 · 无阶段——goal → plan → approval → resolution → deliver）',
    )
    while (!terminated(this.journey)) {
      // 1. 卡片优先（确认卡/授权卡立即处理——按旅程过滤：目标未确认只点「确认目标」——
      //    防方案未收敛点「确认执行」提前触发 forceTool——时间线实证 e070d44c seq 71-99）
      const only = this.journey.confirmed.goal ? undefined : ['确认目标']
      const card = await this.driver.handleCards(only)
      if (card) {
        const label = card.label ?? ''
        console.log(`   🧑 卡：${label}${card.detail ? `（${card.detail}）` : ''}`)
        if (label.includes('确认目标')) {
          this.journey = advance(this.journey, {
            signal: Signal.GOAL_PROPOSED,
            action: 'confirm-goal',
          })
          console.log('   📌 目标已确认（需求收敛——无阶段语义）')
        } else if (label.includes('确认执行')) {
          this.journey = advance(this.journey, {
            signal: Signal.PLAN_PROPOSED,
            action: 'confirm-plan',
          })
          console.log('   📌 方案已确认——进入执行')
        } else if (label.includes('已解决')) {
          this.journey = advance(this.journey, {
            signal: Signal.COMPLETION_CLAIMED,
            action: 'confirm-resolution',
          })
          console.log('   📌 解决已确认（交付≠解决——以确认关闭为准）')
        } else if (card.planFiles && card.planFiles.length > 0) {
          this.planned = card.planFiles
          this.journey = advance(this.journey, {
            signal: Signal.APPROVAL_REQUESTED,
            action: 'approve',
          })
          console.log(
            `      📋 已批准文件清单（${this.planned.length} 个）：${this.planned.join(', ')}`,
          )
        }
        continue
      }
      // 2. 等模型稳定（waitSettled——tool-only 长链顺延/兜底）
      const msg = await this.driver.waitSettled()
      if (!msg) continue
      // 3. 收敛守卫（指纹 = 消息+工具卡——探索容忍：进展轮不消耗）
      const t = await this.driver.readTranscript().catch(() => [])
      const fp = t.map((m) => `${m.role}|${m.content.slice(0, 30)}|${m.tools.length}`).join('~')
      const g = this.guard.observe(fp)
      if (g === 'exceeded') {
        throw new Error(
          `旅程停滞判死（连续 ${this.guard.staleCount} 轮重复/总轮 ${this.guard.totalRounds} 超限——模型循环——最后消息"${msg.content.slice(0, 40)}"）`,
        )
      }
      if (msg.content === this.lastProcessed) {
        await this.driver.page.waitForTimeout(3000)
        continue
      }
      this.lastProcessed = msg.content
      // 4. 信号派生（单一来源——领域层）
      const sb = await this.driver.statusbar()
      const toolCards = (await this.driver.toolsRunning())
        ? await this.driver.page
            .locator('.nf-toolcall--running, .nf-toolcall--pending')
            .allTextContents()
            .catch(() => [])
        : []
      const signal = deriveModelSignal(msg, sb, toolCards)
      // 5. 决策（LLM 增强 + 领域层确定性兜底——单一语义）
      const decision = await this.sim.decideWithSignal(signal, msg, this.journeyLabel())
      printModel(msg)
      console.log(`   🧠 信号=${signal} 决策=${decision.action}（${decision.understanding}）`)
      // 6. 目标未确认时模型直接出方案 → 提醒先确认目标（原「需求阶段越界」语义收编）
      if (!this.journey.confirmed.goal && signal === Signal.PLAN_PROPOSED) {
        console.log('   ⚠️ 模型在目标确认前输出方案——提醒先确认目标')
        await this.driver.send(
          '先别急着设计方案——先把需求确认清楚（做什么/给谁玩/在哪玩/做完什么样），方案确认目标后再出',
        )
        this.journey = advance(this.journey, { signal, action: decision.action })
        this.agent.steps.push({ msg: msg.content.slice(0, 80), decision: '提醒先确认目标' })
        continue
      }
      // 7. 执行决策（choose/answer/nudge/playtest 有 UI 动作；confirm 类由卡片优先承载；wait 无操作）
      await this.execute(decision, msg)
      // 8. 旅程推进 + 决策轨迹（可复现）
      this.journey = advance(this.journey, { signal, action: decision.action })
      this.agent.steps.push({
        msg: msg.content.slice(0, 80),
        decision: decision.text ?? decision.action,
      })
      // 9. 产出记录 + 防假阳性验证（产物齐全——计划 ⊆ 产出）
      if (msg.tools && msg.tools.length > 0) {
        const producedNow = msg.tools.filter((tn) => /write|edit/.test(tn))
        if (producedNow.length > 0) {
          this.produced.push(...producedNow)
          const v = verifyArtifacts(this.planned, this.produced)
          this.verdicts.push({ stage: '产物', hasFiles: v.ok, missing: v.missing })
        }
      }
    }
    console.log('\n   🏁 旅程到达 PHASE 终止点——收敛')
  }

  // 决策执行（UI 动作——confirm 类由卡片优先处理，这里只做记录/兜底）
  async execute(decision, msg) {
    const d = decision
    if (d.action === 'choose') {
      console.log(`      → 选「${d.text}」`)
      await this.driver.clickCandidate(d.text)
      if (d.profilePatch) Object.assign(this.agent.profile, d.profilePatch)
      const next = await this.driver.waitNew(msg.content)
      this.verdicts.push({
        stage: '澄清',
        echoed: this.agent.verifyEcho(next.content, d.text ?? ''),
        chosen: d.text,
        reply: next.content.slice(0, 60),
      })
      console.log(
        `      ${this.verdicts[this.verdicts.length - 1].echoed ? '✅ 模型正确复述了我的选择' : '⚠️ 模型未复述我的选择关键词——需要关注'}`,
      )
    } else if (d.action === 'answer' || d.action === 'nudge') {
      console.log(`      → 说「${(d.text ?? '继续').slice(0, 40)}」`)
      await this.driver.send(d.text || '继续')
      if (d.profilePatch) Object.assign(this.agent.profile, d.profilePatch)
      if (d.action === 'answer' && d.text && d.text !== '继续') {
        const next = await this.driver.waitNew(msg.content)
        this.verdicts.push({
          stage: '澄清',
          echoed: this.agent.verifyEcho(next.content, d.text ?? ''),
          chosen: d.text,
          reply: next.content.slice(0, 60),
        })
      }
    } else if (d.action === 'playtest-feedback') {
      // 试玩验证（真实 HTTP——判定归领域层 verifyPlayable）
      const tUrl = (msg.content ?? '').match(/https?:\/\/localhost:\d+/)?.[0]
      if (tUrl) {
        try {
          const res = await fetch(tUrl, { signal: AbortSignal.timeout(6000) })
          const text = await res.text()
          const v = verifyPlayable({ status: res.status, bytes: text.length })
          const fb = v.ok
            ? `我打开了 ${tUrl}，页面正常（${res.status}，${text.length} 字节）——确认可以`
            : `我打开 ${tUrl} 是空白的（${res.status}，${text.length} 字节）——页面没加载出来`
          console.log(`      → 试玩反馈：${fb}`)
          await this.driver.send(fb)
          this.verdicts.push({ stage: '试玩', ok: v.ok })
        } catch (e) {
          const fb = `我打开 ${tUrl} 打不开（${String(e).slice(0, 60)}）——服务没起来？`
          await this.driver.send(fb)
          this.verdicts.push({ stage: '试玩', ok: false })
        }
      }
    }
    // confirm-goal/confirm-plan/confirm-resolution/approve/wait：卡片优先已承载；wait 无操作
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
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
      NF_TEST_PROJECT: WORK_DIR,
      ELECTRON_RUN_AS_NODE: '',
    },
  })
  const proc = app.process()
  proc.stdout?.on('data', (d) => {
    const s = String(d).trim()
    if (s.includes('[ws:diag]')) console.log('  [main]', s)
  })
  proc.stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (s.includes('[ws:diag]')) console.log('  [main]', s)
  })
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
    const machine = new JourneyRunner(driver, agent, PHASE)
    await machine.run()
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    const end = machine.verdicts[machine.verdicts.length - 1]
    const reqEchoed = machine.verdicts
      .filter((v) => v.stage === '澄清' && v.echoed !== undefined)
      .some((v) => v.echoed)
    const ok = PHASE !== 'all' || (end?.stage === '产物' && end?.hasFiles && reqEchoed)
    console.log(`\n${ok ? '✅' : '⚠️'} ${name} ${ok ? '通过' : '部分验证'} (${secs}s)`)
    console.log(`   决策轨迹（可复现）：`)
    agent.steps.forEach((s, i) =>
      console.log(
        `     ${i + 1}. 模型：「${s.msg.replace(/\n/g, ' ').slice(0, 40)}」→ 我：${s.decision}`,
      ),
    )
    return { ok }
  } catch (e) {
    console.log(`\n❌ ${name} 异常: ${String(e).slice(0, 200)}`)
    return { ok: false }
  } finally {
    if (app) {
      try {
        const proc = app.process()
        await app.close()
        await Promise.race([
          new Promise((r) => proc.once('exit', r)),
          new Promise((r) => setTimeout(r, 8000)),
        ])
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
// 坑 44 流程化：启动前置检测 dist 过期（改 main/preload 后自动 build，根治加载旧产物）
ensureMainBuild()
if (!KEY) {
  console.log('❌ 无可用 API Key')
  process.exit(1)
}
console.log(`Key: ${KEY.slice(0, 5)}…${KEY.slice(-3)}（已脱敏） | PHASE=${PHASE} | MODE=${MODE}\n`)

let ok
if (MODE === 'A') {
  ok = (await case_('场景 A：起始页填需求', 'fill')).ok
} else if (MODE === 'B') {
  ok = (await case_('场景 B：对话输入', 'empty')).ok
} else {
  const r1 = await case_('场景 A：起始页填需求', 'fill')
  const r2 = await case_('场景 B：对话输入', 'empty')
  ok = r1.ok && r2.ok
}
process.exit(ok ? 0 : 1)
