// 产品级任务成功探针（仅测量，不改产品代码）。
//
// 加载真实 dist/main/main.js，在隔离 userData/HOME、假 Key 与本地 mock SSE 下，
// 用固定剧本驱动产品的真实流程：目标确认卡 → 执行方案确认卡 → 工具执行/授权卡 →
// 完成声明（系统代跑证据）→ 已解决卡。剧本使用产品的协议工具（propose_goal /
// propose_plan / report_completion）与真实工具调用（write/edit/bash），不是文本标记降级。
//
// 输出一行 NF_TASK_SUCCESS_RESULT JSON；结果是产品编排成功率，不是模型能力成绩。

const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { app } = require('electron')
const { getTask } = require('./task-suite.cjs')

const startedAt = Date.now()
let finished = false

function msSinceStart() {
  return Date.now() - startedAt
}

function emit(result) {
  if (finished) return
  finished = true
  process.stdout.write('NF_TASK_SUCCESS_RESULT ' + JSON.stringify(result) + '\n')
  setImmediate(() => app.quit())
}

function fail(err, extra = {}) {
  emit({ ok: false, human: false, error: String(err && err.stack ? err.stack : err), ...extra })
}

const TASK_ID = process.env.NF_TASK_SUCCESS_TASK || ''
const task = getTask(TASK_ID)
if (!TASK_ID || !task) {
  fail(new Error(`unknown NF_TASK_SUCCESS_TASK: ${TASK_ID}`))
}

// 网络失败路径审计：网关瞬态重试日志（同进程 main 的 console.log）与 mock 注入次数。
// 排名靠前于 dist/main 的 import，确保能观察到 gateway 的「transient — retrying」行。
let gatewayRetries = 0
let networkFailuresInjected = 0
let midstreamDropsInjected = 0
let streamResets = 0
let chatRequestsSeen = 0
{
  const baseLog = console.log.bind(console)
  console.log = (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ')
    if (text.includes('[gateway]') && text.includes('transient') && text.includes('retrying')) {
      gatewayRetries++
    }
    if (text.includes('[ipc] SEND stream-reset')) streamResets++
    baseLog(...args)
  }
}

// 真实模式：不启动 mock，把产品固定 provider origin 路由到本机 Magpie；
// 凭据只由运行器从环境变量注入 NEONFORGE_API_KEY，探针不读也不打印。
const REAL = process.env.NF_TASK_SUCCESS_REAL === '1'
const REAL_BASE_URL = process.env.NF_TASK_SUCCESS_BASE_URL || 'http://127.0.0.1:3425/v1'
const MODEL_ID =
  process.env.NF_TASK_SUCCESS_MODEL ||
  (REAL ? 'opendesign/deepseek-v4.1-flash-eco' : 'nf-task-success-model')
const TIMEOUT_MS = Number(process.env.NF_TASK_SUCCESS_TIMEOUT_MS || '180000')
const HOME_DIR = process.env.HOME || ''
if (!process.env.NF_TEST_USERDATA) {
  process.env.NF_TEST_USERDATA = path.join(
    process.env.TMPDIR || '/tmp',
    'nf-task-userdata-' + process.pid,
  )
}
if (!process.env.NEONFORGE_API_KEY) process.env.NEONFORGE_API_KEY = 'dummy-not-a-key'
app.setPath('userData', process.env.NF_TEST_USERDATA)

// 信任模式覆盖（strict/standard/delegated）：探针启动前把模式写进隔离 userData 的
// trust-policy.json（与产品 trustPolicyStore 同格式），用于覆盖三档信任预设的授权差异。
const TRUST_MODE = process.env.NF_TASK_SUCCESS_TRUST_MODE || ''
if (TRUST_MODE) {
  const trustDir = path.join(process.env.NF_TEST_USERDATA, 'config')
  fs.mkdirSync(trustDir, { recursive: true })
  fs.writeFileSync(path.join(trustDir, 'trust-policy.json'), JSON.stringify({ mode: TRUST_MODE }))
}

let mainWindow = null
app.on('browser-window-created', (_event, created) => {
  if (!mainWindow) mainWindow = created
})

const electronMain = path.resolve(__dirname, '../../apps/desktop/dist/main/main.js')

app
  .whenReady()
  .then(async () => {
    await import(pathToFileURL(electronMain).href)
    await run()
  })
  .catch((e) => fail(e))

// ---------------------------------------------------------------------------
// Mock OpenAI 兼容服务：按请求阶段返回协议工具调用 / 真实工具调用 / 完成声明。
// ---------------------------------------------------------------------------

function protocolCall(name, args) {
  return { content: '', toolCalls: [{ name, args }] }
}

function goalResponse(statement = task.goal) {
  return protocolCall('propose_goal', {
    statement,
    assumptions: [
      { text: '按用户给出的文件名与内容执行，不改动其他文件。', source: 'model_inference' },
    ],
  })
}

function planResponse(plan = task.plan) {
  return protocolCall('propose_plan', {
    summary: plan.summary,
    files: plan.files,
    assumptions: [],
    verification_plan: plan.verification,
  })
}

function roundResponse(index) {
  const calls = (task.rounds[index] || []).map((c) => ({
    name: c.name,
    args: buildArgs(c.args),
  }))
  if (calls.length === 0) return completionResponse()
  return { content: '', toolCalls: calls }
}

// 任意剧本轮（已解决拒绝后的返工动作）——与 roundResponse 相同的工具调用形态。
function rawRoundResponse(round) {
  const calls = (round || []).map((c) => ({
    name: c.name,
    args: buildArgs(c.args),
  }))
  if (calls.length === 0) return completionResponse()
  return { content: '', toolCalls: calls }
}

function completionResponse() {
  return protocolCall('report_completion', {
    summary: task.completion.summary,
    verification: task.completion.verification.map((v) => ({
      command: v.command,
      output: v.output,
      passed: true,
    })),
    pending_questions: [],
  })
}

// 证据不足剧本：首次完成声明的验证命令系统代跑失败（文件不存在），触发系统对账回填。
function badCompletionResponse() {
  const bad = task.badCompletion
  return protocolCall('report_completion', {
    summary: bad?.summary ?? task.completion.summary,
    verification: (bad?.verification ?? []).map((v) => ({
      command: v.command,
      output: v.output,
      passed: true,
    })),
    pending_questions: [],
  })
}

function buildArgs(raw) {
  // edit-readme 的 old 依赖目标确认后产品回写的 README 标题（# ${goal}）。
  const args = { ...raw }
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') args[k] = v.replace('__GOAL__', task.goal)
  }
  return args
}

function closingResponse() {
  return { content: '任务已完成，谢谢确认。', toolCalls: [] }
}

function startMockServer() {
  let requestIndex = 0
  let roundIndex = 0
  let planSent = false
  let completionSent = false
  let missequenceSent = false
  let writeSent = false
  let rejectGoalSent = false
  let rejectPlanSent = false
  let rejectApprovalSent = false
  let evidenceBadSent = false
  let resolutionReworkSent = false
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 网络瞬态失败注入：按任务要求断开 chat 请求的连接（undici fetch 抛 TypeError）。
      // networkFailureSkip：前 N 个成功进入路由的 chat 请求不注入（用于在对话中途制造断网，
      // 而不是首轮就失败）。网关对网络错误最多重试 2 次（共 3 击）。
      if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
        chatRequestsSeen++
        if (
          task.networkFailures &&
          chatRequestsSeen > (task.networkFailuresSkip ?? 0) &&
          networkFailuresInjected < task.networkFailures
        ) {
          networkFailuresInjected++
          req.destroy()
          return
        }
      }
      // 流中途断开注入：先写若干 content delta（网关已 emitted=true）再销毁连接，
      // 触发 gateway 的 stream-reset + 重试分支（与连接前失败不同）。
      if (
        req.method === 'POST' &&
        req.url.startsWith('/v1/chat/completions') &&
        task.midstreamDropOnce &&
        midstreamDropsInjected === 0
      ) {
        midstreamDropsInjected++
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'nf-task-mock',
              object: 'chat.completion.chunk',
              model: MODEL_ID,
              choices: [{ index: 0, delta: { content: '（流中途输出）' }, finish_reason: null }],
            }) +
            '\n\n',
        )
        setTimeout(() => {
          res.destroy()
        }, 10)
        return
      }
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: MODEL_ID }] }))
        return
      }
      if (req.method !== 'POST' || !req.url.startsWith('/v1/chat/completions')) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      let raw = ''
      req.on('data', (c) => {
        raw += c
      })
      req.on('end', () => {
        let body = {}
        try {
          body = JSON.parse(raw)
        } catch {
          /* 空 body 按首轮处理 */
        }
        const messages = Array.isArray(body.messages) ? body.messages : []
        const last = messages[messages.length - 1] || {}
        const lastText = typeof last.content === 'string' ? last.content : ''
        const lastRole = last.role
        const userTexts = messages
          .filter((m) => m.role === 'user' && typeof m.content === 'string')
          .map((m) => m.content)
        const lastUser = userTexts[userTexts.length - 1] || ''
        // 协议工具（propose_goal/propose_plan/report_completion）也有 role=tool 的合成结果；
        // 只有普通工具（write/edit/bash）的结果才推进剧本动作轮。
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))
        const lastToolNames = (lastAssistant?.tool_calls ?? []).map((c) =>
          String(c?.function?.name ?? ''),
        )
        const normalToolResult =
          lastRole === 'tool' &&
          lastToolNames.some((n) => ['write', 'edit', 'bash', 'approve-files'].includes(n))

        let response
        if (lastUser.includes('已解决，谢谢')) {
          response = closingResponse()
        } else if (task.rejection === 'goal') {
          // 拒绝路径剧本（目标）：首次 propose 一个「合理但被用户否掉」的目标；
          // 用户点「重新描述」后发修正版目标（含用户方向），之后的流程同正向任务。
          // 强制澄清卡（ADR-010）确认后 product 会再发「确认，目标清楚了」——同时接受。
          if (requestIndex === 0) {
            response = goalResponse(task.rejectGoal ?? task.goal)
          } else if (lastUser.includes('目标需要重新描述一下') && !rejectGoalSent) {
            rejectGoalSent = true
            response = goalResponse(task.goal)
          } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
            planSent = true
            response = planResponse()
          } else if (lastUser.includes('确认，按方案执行') && !writeSent) {
            writeSent = true
            roundIndex = 1
            response = roundResponse(0)
          } else if (normalToolResult && roundIndex < task.rounds.length) {
            response = roundResponse(roundIndex)
            roundIndex++
          } else if (normalToolResult || (planSent && roundIndex >= task.rounds.length)) {
            response = completionResponse()
            completionSent = true
          } else {
            response = closingResponse()
          }
        } else if (task.rejection === 'plan') {
          // 拒绝路径剧本（方案）：目标确认 → 首个方案偏离用户要求（故意写错文件名）；
          // 用户点「修改方案」后按任务正确方案重提 → 执行 → 完成。
          // 强制澄清卡（ADR-010）确认后 product 会再发「确认，按方案执行」——同时接受。
          if (requestIndex === 0) {
            response = goalResponse()
          } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
            planSent = true
            response = planResponse(task.rejectPlan ?? task.plan)
          } else if (lastUser.includes('方案需要调整一下') && !rejectPlanSent) {
            rejectPlanSent = true
            response = planResponse()
          } else if (lastUser.includes('确认，按方案执行') && !writeSent) {
            writeSent = true
            roundIndex = 1
            response = roundResponse(0)
          } else if (normalToolResult && roundIndex < task.rounds.length) {
            response = roundResponse(roundIndex)
            roundIndex++
          } else if (normalToolResult || (rejectPlanSent && roundIndex >= task.rounds.length)) {
            response = completionResponse()
            completionSent = true
          } else {
            response = closingResponse()
          }
        } else if (task.rejection === 'approval') {
          // 拒绝路径剧本（授权卡）：方案正确；首次 bash（高危）弹授权卡时脚本点「拒绝」——
          // 产品置工具卡 error「已拒绝授权——未执行」；用户随后在输入框要求继续，
          // 模型改走 approve-files（清单申报 → 卡批准）再写 → 完成。
          if (requestIndex === 0) {
            response = goalResponse()
          } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
            planSent = true
            response = planResponse()
          } else if (lastUser.includes('确认，按方案执行') && !writeSent) {
            writeSent = true
            response = roundResponse(0)
          } else if (lastUser.includes('继续') && !rejectApprovalSent) {
            rejectApprovalSent = true
            roundIndex = 2
            response = roundResponse(1)
          } else if (normalToolResult && roundIndex < task.rounds.length) {
            response = roundResponse(roundIndex)
            roundIndex++
          } else if (normalToolResult || (rejectApprovalSent && roundIndex >= task.rounds.length)) {
            response = completionResponse()
            completionSent = true
          } else {
            response = closingResponse()
          }
        } else if (task.trustMode === 'strict') {
          // 信任模式 strict（ADR-015）：方案确认后清单内 write 也**不**自动放行——产品弹
          // 授权卡（need-approval），脚本点「允许执行」；批准后 write 真正执行 → 完成。
          if (requestIndex === 0) {
            response = goalResponse()
          } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
            planSent = true
            response = planResponse()
          } else if (lastUser.includes('确认，按方案执行') && !writeSent) {
            writeSent = true
            roundIndex = 1
            response = roundResponse(0)
          } else if (normalToolResult && roundIndex < task.rounds.length) {
            response = roundResponse(roundIndex)
            roundIndex++
          } else if (normalToolResult || (planSent && roundIndex >= task.rounds.length)) {
            response = completionResponse()
            completionSent = true
          } else {
            response = closingResponse()
          }
        } else if (
          task.missequence === 'write-before-plan' &&
          lastUser.includes('确认，目标清楚了') &&
          !missequenceSent
        ) {
          // 顺序违规剧本：目标确认后不发 propose_plan，直接发 write（复现真机「待决策但无卡」形态）
          missequenceSent = true
          response = roundResponse(0)
        } else if (lastUser.includes('确认，按方案执行') && !writeSent) {
          // 方案确认后的首个动作轮：剧本 round 0（顺序违规任务里即被拦直写的重放）
          writeSent = true
          roundIndex = 1
          response = roundResponse(0)
        } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
          planSent = true
          response = planResponse()
        } else if (
          task.evidenceGap &&
          normalToolResult &&
          roundIndex >= task.rounds.length &&
          !evidenceBadSent
        ) {
          // 证据不足剧本：动作轮结束后先发「证据对不上」的完成声明（系统代跑失败 → 对账回填引导），
          // 收到【系统对账】后重发正确证据的完成声明 → 已解决卡。
          evidenceBadSent = true
          response = badCompletionResponse()
        } else if (task.evidenceGap && lastText.includes('系统对账')) {
          response = completionResponse()
          completionSent = true
        } else if (
          task.rejectResolutionOnce &&
          lastUser.includes('还要改') &&
          !resolutionReworkSent
        ) {
          // 已解决卡被否 → 用户「还要改」→ 模型按意见补充动作（reworkRounds）后再完成声明。
          resolutionReworkSent = true
          roundIndex = task.rounds.length
          response = rawRoundResponse(task.reworkRounds?.[0] ?? [])
        } else if (lastText.includes('系统对账')) {
          // 证据不足时的系统回填引导：重发完成声明（剧本证据应一次通过）。
          response = completionResponse()
          completionSent = true
        } else if (normalToolResult && roundIndex < task.rounds.length) {
          response = roundResponse(roundIndex)
          roundIndex++
        } else if (normalToolResult) {
          response = completionResponse()
          completionSent = true
        } else if (requestIndex === 0) {
          response = goalResponse()
        } else if (!completionSent && planSent && roundIndex >= task.rounds.length) {
          response = completionResponse()
          completionSent = true
        } else {
          response = closingResponse()
        }
        requestIndex++
        sendResponse(res, response)
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function sendResponse(res, response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const base = { id: 'nf-task-mock', object: 'chat.completion.chunk', model: MODEL_ID }
  const usage = {
    prompt_tokens: 900,
    completion_tokens: 120,
    total_tokens: 1020,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 900,
    completion_tokens_details: { reasoning_tokens: 0 },
  }
  if (response.content) {
    res.write(
      'data: ' +
        JSON.stringify({
          ...base,
          choices: [{ index: 0, delta: { content: response.content }, finish_reason: null }],
        }) +
        '\n\n',
    )
  }
  if (response.toolCalls && response.toolCalls.length > 0) {
    const calls = response.toolCalls.map((c, i) => ({
      index: i,
      id: `call_${i}`,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    }))
    res.write(
      'data: ' +
        JSON.stringify({
          ...base,
          choices: [{ index: 0, delta: { tool_calls: calls }, finish_reason: null }],
        }) +
        '\n\n',
    )
  }
  res.write(
    'data: ' +
      JSON.stringify({
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage,
      }) +
      '\n\n',
  )
  res.write('data: [DONE]\n\n')
  res.end()
}

const PRODUCT_PROVIDER_ORIGINS = [
  'https://api.deepseek.com',
  'https://api.commandcode.ai',
  'https://opencode.ai',
]

function installFetchRouter(mockBase) {
  const originalFetch = globalThis.fetch
  const target = new URL(mockBase)
  const prefix = target.pathname.replace(/\/+$/, '')
  globalThis.fetch = (input, init) => {
    let parsed = null
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      parsed = new URL(raw)
    } catch {
      /* 非 URL 输入走原路径 */
    }
    if (parsed && PRODUCT_PROVIDER_ORIGINS.includes(parsed.origin)) {
      return originalFetch(target.origin + prefix + parsed.pathname + parsed.search, init)
    }
    return originalFetch(input, init)
  }
  return () => {
    globalThis.fetch = originalFetch
  }
}

// ---------------------------------------------------------------------------
// Renderer 驱动：启动任务、识别/点击确认卡与授权卡、核对产物。
// ---------------------------------------------------------------------------

async function waitForStartScreen(wc, timeoutMs = 20000) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const deadline = performance.now() + ${timeoutMs};
      while (!document.querySelector('.nf-start') && performance.now() < deadline) await sleep(20);
      return document.querySelector('.nf-start') ? 'start' : 'none';
    })()`,
    true,
  )
}

async function startTask(wc) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bridge = window.neonforge;
      const state = { doneCount: 0, chunkCount: 0, toolCalls: 0, errors: [] };
      window.__nfTask = state;
      bridge?.gateway?.onStreamChunk?.((chunk) => {
        state.chunkCount++;
        if (chunk.type === 'done') state.doneCount++;
        if (chunk.type === 'tool-call') state.toolCalls++;
      });
      const input = document.querySelector('.nf-start__input');
      if (!input) return { error: 'start input missing' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(task.prompt)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);
      const cta = [...document.querySelectorAll('.nf-start__cta')].find((el) =>
        el.textContent.includes('从零开始'),
      );
      if (!cta) return { error: 'start cta missing' };
      cta.click();
      return { ok: true };
    })()`,
    true,
  )
}

async function scanUi(wc) {
  return wc.executeJavaScript(
    `(() => {
      const q = (sel) => !!document.querySelector(sel);
      const approveButtons = document.querySelectorAll(
        '.nf-toolcall--need-approval .nf-toolcall__approve, .nf-toolcall--file-approval .nf-toolcall__approve',
      );
      const state = window.__nfTask || { doneCount: 0, chunkCount: 0, toolCalls: 0 };
      return {
        goal: q('[aria-label="确认目标"] .nf-confirmcard__btn--ok'),
        goalReject: q('[aria-label="确认目标"] .nf-confirmcard__btn--no'),
        plan: q('[aria-label="确认执行方案"] .nf-confirmcard__btn--ok'),
        planReject: q('[aria-label="确认执行方案"] .nf-confirmcard__btn--no'),
        resolution: q('[aria-label="确认达成"] .nf-confirmcard__btn--ok'),
        // ADR-010 强制澄清卡（拒绝链路可能触发）——点「确认执行」继续 underlying（goal/plan）
        forcedOk: q('.nf-forcedcard__btn--ok'),
        approvals: approveButtons.length,
        // 授权卡类型：need-approval（write/bash 等文字授权） vs file-approval（approve-files 批量清单）
        needApprovalCard: q('.nf-toolcall--need-approval .nf-toolcall__approve'),
        fileApprovalCard: q('.nf-toolcall--file-approval .nf-toolcall__approve'),
        // ask_user / <candidates> 澄清选项（拒绝后模型常先追问方向）——拒绝路径任务点第一个可用选项
        clarify: q('.nf-candidates .nf-candidates__btn:not([disabled])'),
        errorToolCalls: document.querySelectorAll('.nf-toolcall--error').length,
        // 网络彻底失败后的错误气泡「重试」按钮（retryAfterNetworkExhausted 任务点击一次）
        retry: q('.nf-msg__retry:not([disabled])'),
        working: q('.nf-working'),
        userMsgs: document.querySelectorAll('.nf-msg--user').length,
        assistantMsgs: document.querySelectorAll('.nf-msg--assistant').length,
        lastAssistantText: (() => {
          const bodies = [...document.querySelectorAll('.nf-msg--assistant .nf-msg__body')];
          const last = bodies[bodies.length - 1];
          return last ? (last.textContent || '').slice(0, 240) : '';
        })(),
        // 流中途断网残留检测：stream-reset 必须把半截输出从消息里清掉（否则会残留拼接）。
        partialResidue: [...document.querySelectorAll('.nf-msg--assistant .nf-msg__body')].some(
          (el) => (el.textContent || '').includes('（流中途输出）'),
        ),
        doneCount: state.doneCount,
        chunkCount: state.chunkCount,
        toolCallsSeen: state.toolCalls,
      };
    })()`,
    true,
  )
}

async function nudge(wc, text) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const ta = document.querySelector('.nf-chat__field textarea');
      if (!ta) return false;
      if (document.querySelector('.nf-chat__send--stop')) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      const btn = document.querySelector('.nf-chat__send');
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
    true,
  )
}

async function clickSelector(wc, selector) {
  return wc.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`,
    true,
  )
}

/** 拒绝原因选择器（RejectReasonPicker）：在 scope 内选指定 kind 并点「确认拒绝」。
 * 2026-11-24 审计：拒绝按钮两段式（先展开选择器）——脚本必须给出真实 kind 才提交。 */
async function pickRejectReason(wc, scope, kind) {
  return wc.executeJavaScript(
    `(() => {
      const root = document.querySelector(${JSON.stringify(scope)});
      if (!root) return false;
      const radio = root.querySelector('input[type="radio"][value="${kind}"]');
      if (!radio) return false;
      radio.click();
      const submit = [...root.querySelectorAll('button')].find((b) => (b.textContent || '').includes('确认拒绝'));
      if (!submit || submit.disabled) return false;
      submit.click();
      return true;
    })()`,
    true,
  )
}

async function driveToResolution(wc) {
  const stages = {
    startedMs: 0,
    goalCardMs: null,
    goalClickedMs: null,
    planCardMs: null,
    planClickedMs: null,
    resolutionCardMs: null,
    resolutionClickedMs: null,
    approvalClicks: 0,
    needApprovalClicks: 0,
    fileApprovalClicks: 0,
    firstApprovalMs: null,
  }
  const t0 = Date.now()
  let goalClicked = false
  let planClicked = false
  let resolutionClicked = false
  let goalClicks = 0
  let planClicks = 0
  let nudges = 0
  let approvalRejectedOnce = false
  let rememberedOnce = false
  let resolutionRejectedOnce = false
  let approvalContinueSent = false
  let resolutionReworkRequested = false
  let networkRetryClickedOnce = false
  let clarifyAnswered = false
  let clarifyAnswers = 0
  let goalRejectedOnce = false
  let planRejectedOnce = false
  const deadline = t0 + TIMEOUT_MS
  let lastUi = null
  let idleMs = 0

  while (Date.now() < deadline) {
    const ui = await scanUi(wc)
    lastUi = ui
    const at = Date.now() - t0

    if (ui.forcedOk) {
      // 强制澄清卡优先处理：点「确认执行」= 确认 underlying 决策点并发对应确认文本。
      if (stages.forcedCardMs === null) stages.forcedCardMs = at
      const clicked = await clickSelector(wc, '.nf-forcedcard__btn--ok')
      if (clicked) {
        stages.forcedClicks = (stages.forcedClicks ?? 0) + 1
        if (stages.forcedCardClickedMs === null) stages.forcedCardClickedMs = at
      }
    } else if (ui.goal) {
      if (stages.goalCardMs === null) stages.goalCardMs = at
      const selector =
        task.rejection === 'goal' && !goalRejectedOnce
          ? '[aria-label="确认目标"] .nf-confirmcard__btn--no'
          : '[aria-label="确认目标"] .nf-confirmcard__btn--ok'
      const clicked = await clickSelector(wc, selector)
      if (clicked) {
        // 2026-11-24 审计：拒绝按钮现在先展开 RejectReasonPicker（非模态）——脚本选原因并「确认拒绝」
        //（原一线点击即 reject；拒绝原因由用户真实选择，链路需要两步证据）
        // reject-goal：direction（重新描述方向）——默认选第一项；
        // reject-plan：设计规定「修改方案」直接 modify（不展开选择器）；
        // reject-resolution：scope（还要改=范围调整）——选择对应 kind。
        if (task.rejection === 'goal' && !goalRejectedOnce) {
          // 目标拒绝：选择器选 direction（重新描述方向）→ 确认拒绝
          await pickRejectReason(wc, '[aria-label="确认目标"] .nf-rejectpicker', 'direction')
        }
        goalClicked = true
        goalClicks++
        if (task.rejection === 'goal' && !goalRejectedOnce) {
          goalRejectedOnce = true
          stages.goalRejectedMs = at
          stages.goalRejects = 1
        } else if (stages.goalClickedMs === null) {
          stages.goalClickedMs = at
        }
      }
    } else if (ui.plan) {
      if (stages.planCardMs === null) stages.planCardMs = at
      const selector =
        task.rejection === 'plan' && !planRejectedOnce
          ? '[aria-label="确认执行方案"] .nf-confirmcard__btn--no'
          : '[aria-label="确认执行方案"] .nf-confirmcard__btn--ok'
      const clicked = await clickSelector(wc, selector)
      if (clicked) {
        planClicked = true
        planClicks++
        if (task.rejection === 'plan' && !planRejectedOnce) {
          planRejectedOnce = true
          stages.planRejectedMs = at
          stages.planRejects = 1
        } else if (stages.planClickedMs === null) {
          stages.planClickedMs = at
        }
      }
    } else if (ui.approvals > 0) {
      if (stages.firstApprovalMs === null) stages.firstApprovalMs = at
      // rememberOnce：首个 need-approval 卡点「允许并记住」（任务信任路径）；
      // rejection==='approval'：首个卡点「拒绝」（拒绝路径任务）。
      let selector
      if (ui.needApprovalCard && task.rejection === 'approval' && !approvalRejectedOnce) {
        selector = '.nf-toolcall--need-approval .nf-toolcall__reject'
      } else if (ui.needApprovalCard && task.rememberOnce && !rememberedOnce) {
        selector = '.nf-toolcall--need-approval .nf-toolcall__remember'
      } else {
        selector =
          '.nf-toolcall--need-approval .nf-toolcall__approve, .nf-toolcall--file-approval .nf-toolcall__approve'
      }
      const clicked = await clickSelector(wc, selector)
      if (clicked) {
        if (ui.needApprovalCard && task.rejection === 'approval' && !approvalRejectedOnce) {
          // 拒绝后由测试侧在空闲时发送「继续」（与真实用户行为一致：拒绝后说明要求）。
          approvalRejectedOnce = true
          stages.approvalRejectedMs = at
          stages.approvalRejects = 1
        } else {
          if (ui.needApprovalCard && task.rememberOnce && !rememberedOnce) {
            rememberedOnce = true
            stages.rememberClicks = 1
            stages.rememberClickedMs = at
          }
          stages.approvalClicks++
          if (ui.needApprovalCard) stages.needApprovalClicks++
          else stages.fileApprovalClicks++
        }
      }
    } else if (ui.resolution) {
      if (stages.resolutionCardMs === null) stages.resolutionCardMs = at
      // rejectResolutionOnce：首个已解决卡点「还要改」（resolution 拒绝路径）；否则确认。
      const selector =
        task.rejectResolutionOnce && !resolutionRejectedOnce
          ? '[aria-label="确认达成"] .nf-confirmcard__btn--no'
          : '[aria-label="确认达成"] .nf-confirmcard__btn--ok'
      const clicked = await clickSelector(wc, selector)
      if (clicked) {
        if (task.rejectResolutionOnce && !resolutionRejectedOnce) {
          // 2026-11-24 审计：两段式——展开 RejectReasonPicker → 选 scope（还要改=范围调整）→ 确认拒绝
          await pickRejectReason(wc, '[aria-label="确认达成"] .nf-rejectpicker', 'scope')
          resolutionRejectedOnce = true
          stages.resolutionRejectedMs = at
          stages.resolutionRejects = 1
        } else {
          stages.resolutionClickedMs = at
          resolutionClicked = true
          break
        }
      }
    } else if (ui.retry && task.retryAfterNetworkExhausted && !networkRetryClickedOnce) {
      // 网络 3 击耗尽后的错误气泡：脚本点「重试」（重放上一回合，不追加用户消息）；
      // mock 的断开注入已耗尽，重试请求正常走剧本 → 目标卡 → … → 已解决。
      const clicked = await clickSelector(wc, '.nf-msg__retry:not([disabled])')
      if (clicked) {
        networkRetryClickedOnce = true
        stages.retryButtonMs = at
        stages.networkRetryClicks = 1
      }
    } else if (ui.clarify && clarifyAnswers < 5) {
      // 真实模型常先追问方向（ask_user/<candidates>）——点第一个可用选项作答（脚本化用户选择）。
      // 拒绝路径与普通任务都可能出现；上限 5 次防追问循环。mock 剧本不会走到这里。
      const clicked = await clickSelector(wc, '.nf-candidates .nf-candidates__btn:not([disabled])')
      if (clicked) {
        clarifyAnswered = true
        clarifyAnswers++
        stages.clarifyAnswers = clarifyAnswers
        stages.clarifyAnsweredMs = at
      }
    }
    // 拒绝路径（授权卡）：拒绝后产品回到 ready 且无卡可点——测试侧在空闲 2 s 后
    // 代表用户发送「继续」，驱动模型改走 approve-files（真实用户拒绝后的自然动作）。
    const idleNow =
      !ui.goal && !ui.plan && ui.approvals === 0 && !ui.resolution && !ui.working && !ui.clarify
    if (
      idleNow &&
      task.rejectResolutionOnce &&
      resolutionRejectedOnce &&
      !resolutionReworkRequested
    ) {
      // 已解决卡拒绝路径：产品只预填输入框不发消息；测试侧代表用户发出返工要求，
      // 驱动模型补充动作并再次提交完成声明（第二个已解决卡由脚本确认）。
      idleMs += 200
      if (idleMs >= 1500) {
        idleMs = 0
        resolutionReworkRequested = true
        await nudge(wc, '还要改：交付文件的内容必须是 RESOLUTION-OK，请修改后再报告完成。')
      }
    } else if (
      idleNow &&
      task.rejection === 'approval' &&
      approvalRejectedOnce &&
      !approvalContinueSent
    ) {
      idleMs += 200
      if (idleMs >= 2000) {
        idleMs = 0
        approvalContinueSent = true
        await nudge(wc, '继续')
      }
    } else if (
      REAL &&
      !goalClicked &&
      nudges < 3 &&
      !ui.goal &&
      !ui.plan &&
      ui.approvals === 0 &&
      !ui.resolution &&
      !ui.working
    ) {
      idleMs += 200
      if (idleMs >= 5000) {
        idleMs = 0
        nudges++
        await nudge(wc, '请先调用 propose_goal 提交目标提议，等我确认后再继续。')
      }
    } else {
      idleMs = 0
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  if (!resolutionClicked) {
    throw Object.assign(new Error('任务未到达并确认「已解决」卡'), {
      stages,
      ui: lastUi,
    })
  }
  // 给已解决文本与最终 closing 流一点时间，避免验证时仍在写文件。
  await new Promise((r) => setTimeout(r, 800))
  stages.goalClicks = goalClicks
  stages.planClicks = planClicks
  stages.nudges = nudges
  return { stages, ui: lastUi }
}

function findProjectDir() {
  const base = path.join(HOME_DIR, 'Documents', 'NeonForge')
  if (!fs.existsSync(base)) return null
  const dirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const p = path.join(base, d.name)
      let mtime = 0
      try {
        mtime = fs.statSync(p).mtimeMs
      } catch {
        /* ignore */
      }
      return { p, mtime }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return dirs[0]?.p ?? null
}

function runTaskChecks(projectDir, ctx) {
  if (!projectDir) {
    return [{ name: '项目目录存在', ok: false, detail: '未找到 Documents/NeonForge 下的项目目录' }]
  }
  return task.checks.map((c) => {
    try {
      const r = c.run(projectDir, ctx)
      return { name: c.name, ...r }
    } catch (e) {
      return {
        name: c.name,
        ok: false,
        detail: String(e && e.message ? e.message : e).slice(0, 200),
      }
    }
  })
}

// ADR-015 委托边界证据：工具执行的 approvalSource 由 main 写入隔离 userData/logs 时间线
// （tool.executing / security.trust_delegation_denied）。扫描全部 timeline-*.jsonl（会话文件与
// rootPath 兜底文件都可能在）；delegated 任务等待自动批准事件落盘（outbox 投递可能滞后）。
function collectDelegateAudit() {
  const logsDir = path.join(process.env.NF_TEST_USERDATA, 'logs')
  const audit = {
    delegateExecutions: 0,
    autoFileExecutions: 0,
    delegateDenials: 0,
    fileApprovalDenials: 0,
    bashApprovalCards: 0,
    policyBlockedWrites: 0,
    evidenceMissing: 0,
    toolFailures: 0,
  }
  let names = []
  try {
    names = fs.readdirSync(logsDir).filter((n) => n.startsWith('timeline-') && n.endsWith('.jsonl'))
  } catch {
    return audit
  }
  for (const name of names) {
    let text = ''
    try {
      text = fs.readFileSync(path.join(logsDir, name), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let evt
      try {
        evt = JSON.parse(line)
      } catch {
        continue
      }
      const detail = evt?.detail ?? {}
      if (evt?.type === 'tool.executing' && detail.approvalSource === 'delegate') {
        audit.delegateExecutions++
      } else if (
        evt?.type === 'tool.executing' &&
        detail.approvalSource === 'auto' &&
        (detail.name === 'write' || detail.name === 'edit')
      ) {
        // 真实模型可能先 approve-files（用户显式批准整批）——此后 write/edit 来源 auto（trusted 分支），
        // 同样属于「文件操作无需逐次授权」；标准档的 edit 不走此支（只自动放行 write）——负控仍可区分。
        audit.autoFileExecutions++
      } else if (evt?.type === 'security.trust_delegation_denied') {
        audit.delegateDenials++
      } else if (evt?.type === 'completion.evidence_missing') {
        audit.evidenceMissing++
      } else if (evt?.type === 'tool.failed' && detail.needApproval === true) {
        // 授权卡请求：write/edit 在 delegated 档不应出现（bash 高危始终逐次授权——不算违例）。
        const toolName = String(detail.name ?? '')
        if (toolName === 'write' || toolName === 'edit') audit.fileApprovalDenials++
        else if (toolName === 'bash') audit.bashApprovalCards++
      } else if (evt?.type === 'tool.blocked' && detail.gate === 'policy') {
        // 规划门控（policy）拦截的 write——用于根外任务判「写入被拦截且未自动放行」。
        if (String(detail.name ?? '') === 'write') audit.policyBlockedWrites++
      } else if (
        evt?.type === 'tool.failed' &&
        detail.needApproval !== true &&
        !String(detail.error ?? '').includes('修改前请先调用 approve-files')
      ) {
        // 工具执行失败（非授权卡请求、非规划引导）——失败恢复任务判据。
        audit.toolFailures++
      }
    }
  }
  return audit
}

async function waitForDelegateAudit() {
  let audit = collectDelegateAudit()
  const deadline = Date.now() + 3000
  const stillWaiting = () =>
    (task.expectDelegateAudit && audit.delegateExecutions + audit.autoFileExecutions === 0) ||
    (task.expectEvidenceGap && audit.evidenceMissing === 0)
  while (stillWaiting() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
    audit = collectDelegateAudit()
  }
  return audit
}

async function run() {
  let mock = null
  let mockBase = REAL_BASE_URL
  if (!REAL) {
    mock = await startMockServer()
    mockBase = `http://127.0.0.1:${mock.address().port}/v1`
  }
  const restoreFetch = installFetchRouter(mockBase)
  const configModule = await import(
    pathToFileURL(path.resolve(__dirname, '../../apps/desktop/dist/main/configStore.js')).href
  )
  if (configModule.configStore) {
    await configModule.configStore.setModelSelection(MODEL_ID, 'deepseek')
  }

  const win = mainWindow
  if (!win || !win.webContents) throw new Error('main window missing')
  const wc = win.webContents
  const screen = await waitForStartScreen(wc)
  if (screen !== 'start') throw new Error(`start screen not ready: ${screen}`)

  const start = await startTask(wc)
  if (!start || start.error) throw new Error(`start failed: ${start?.error || 'unknown'}`)

  let driven
  let driveError = null
  try {
    driven = await driveToResolution(wc)
  } catch (e) {
    driveError = e
  }

  const projectDir = findProjectDir()
  const audit = await waitForDelegateAudit()
  const checks = runTaskChecks(projectDir, {
    ...audit,
    approvalClicks: driven?.stages?.approvalClicks ?? 0,
    needApprovalClicks: driven?.stages?.needApprovalClicks ?? 0,
    fileApprovalClicks: driven?.stages?.fileApprovalClicks ?? 0,
    rememberClicks: driven?.stages?.rememberClicks ?? 0,
    resolutionRejects: driven?.stages?.resolutionRejects ?? 0,
    gatewayRetries,
    networkFailuresInjected,
    networkRetryClicks: driven?.stages?.networkRetryClicks ?? 0,
    midstreamDropsInjected,
    streamResets,
    partialResidue: driven?.ui?.partialResidue ?? false,
  })
  const checksOk = checks.length > 0 && checks.every((c) => c.ok)
  const ok = !driveError && checksOk
  const ui = driven?.ui ?? (driveError ? driveError.ui : null) ?? null

  if (restoreFetch) restoreFetch()
  if (mock) await new Promise((r) => mock.close(r))

  emit({
    ok,
    human: false,
    mode: REAL ? 'real-model-product-flow' : 'mock-protocol-product-flow',
    task: { id: task.id, title: task.title, prompt: task.prompt },
    model: MODEL_ID,
    timeoutMs: TIMEOUT_MS,
    actualMs: msSinceStart(),
    stages: driven?.stages ?? (driveError && driveError.stages) ?? null,
    approvals: driven?.stages?.approvalClicks ?? 0,
    checks,
    projectDir,
    lastUi: driven?.ui ?? (driveError && driveError.ui) ?? null,
    error: driveError
      ? String(driveError.message || driveError)
      : checksOk
        ? null
        : '产物核验未通过',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  })
}
