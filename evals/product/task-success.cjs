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

const MODEL_ID = process.env.NF_TASK_SUCCESS_MODEL || 'nf-task-success-model'
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

function goalResponse() {
  return protocolCall('propose_goal', {
    statement: task.goal,
    assumptions: [
      { text: '按用户给出的文件名与内容执行，不改动其他文件。', source: 'model_inference' },
    ],
  })
}

function planResponse() {
  return protocolCall('propose_plan', {
    summary: task.plan.summary,
    files: task.plan.files,
    assumptions: [],
    verification_plan: task.plan.verification,
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
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
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
          lastRole === 'tool' && lastToolNames.some((n) => ['write', 'edit', 'bash'].includes(n))

        let response
        if (lastUser.includes('已解决，谢谢')) {
          response = closingResponse()
        } else if (lastUser.includes('确认，按方案执行') && roundIndex === 0) {
          response = roundResponse(0)
          roundIndex = 1
        } else if (lastUser.includes('确认，目标清楚了') && !planSent) {
          planSent = true
          response = planResponse()
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
        plan: q('[aria-label="确认执行方案"] .nf-confirmcard__btn--ok'),
        resolution: q('[aria-label="确认达成"] .nf-confirmcard__btn--ok'),
        approvals: approveButtons.length,
        errorToolCalls: document.querySelectorAll('.nf-toolcall--error').length,
        working: q('.nf-working'),
        userMsgs: document.querySelectorAll('.nf-msg--user').length,
        assistantMsgs: document.querySelectorAll('.nf-msg--assistant').length,
        lastAssistantText: (() => {
          const bodies = [...document.querySelectorAll('.nf-msg--assistant .nf-msg__body')];
          const last = bodies[bodies.length - 1];
          return last ? (last.textContent || '').slice(0, 240) : '';
        })(),
        doneCount: state.doneCount,
        chunkCount: state.chunkCount,
        toolCallsSeen: state.toolCalls,
      };
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
    firstApprovalMs: null,
  }
  const t0 = Date.now()
  let goalClicked = false
  let planClicked = false
  let resolutionClicked = false
  const deadline = t0 + TIMEOUT_MS
  let lastUi = null

  while (Date.now() < deadline) {
    const ui = await scanUi(wc)
    lastUi = ui
    const at = Date.now() - t0

    if (ui.goal && !goalClicked) {
      if (stages.goalCardMs === null) stages.goalCardMs = at
      const clicked = await clickSelector(wc, '[aria-label="确认目标"] .nf-confirmcard__btn--ok')
      if (clicked) {
        goalClicked = true
        stages.goalClickedMs = at
      }
    } else if (ui.plan && !planClicked) {
      if (stages.planCardMs === null) stages.planCardMs = at
      const clicked = await clickSelector(
        wc,
        '[aria-label="确认执行方案"] .nf-confirmcard__btn--ok',
      )
      if (clicked) {
        planClicked = true
        stages.planClickedMs = at
      }
    } else if (ui.approvals > 0) {
      if (stages.firstApprovalMs === null) stages.firstApprovalMs = at
      const clicked = await clickSelector(
        wc,
        '.nf-toolcall--need-approval .nf-toolcall__approve, .nf-toolcall--file-approval .nf-toolcall__approve',
      )
      if (clicked) stages.approvalClicks++
    } else if (ui.resolution) {
      if (stages.resolutionCardMs === null) stages.resolutionCardMs = at
      const clicked = await clickSelector(wc, '[aria-label="确认达成"] .nf-confirmcard__btn--ok')
      if (clicked) {
        stages.resolutionClickedMs = at
        resolutionClicked = true
        break
      }
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

function runTaskChecks(projectDir) {
  if (!projectDir) {
    return [{ name: '项目目录存在', ok: false, detail: '未找到 Documents/NeonForge 下的项目目录' }]
  }
  return task.checks.map((c) => {
    try {
      const r = c.run(projectDir)
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

async function run() {
  const mock = await startMockServer()
  const mockBase = `http://127.0.0.1:${mock.address().port}/v1`
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
  const checks = runTaskChecks(projectDir)
  const checksOk = checks.length > 0 && checks.every((c) => c.ok)
  const ok = !driveError && checksOk
  const ui = driven?.ui ?? (driveError ? driveError.ui : null) ?? null

  if (restoreFetch) restoreFetch()
  await new Promise((r) => mock.close(r))

  emit({
    ok,
    human: false,
    mode: 'mock-protocol-product-flow',
    task: { id: task.id, title: task.title, prompt: task.prompt },
    model: MODEL_ID,
    timeoutMs: TIMEOUT_MS,
    actualMs: msSinceStart(),
    stages: driven?.stages ?? (driveError && driveError.stages) ?? null,
    approvals: driven?.stages?.approvalClicks ?? 0,
    checks,
    projectDir,
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
