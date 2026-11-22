// 产品级首 token（TTFT）延迟探针（仅测量，不改产品代码）。
//
// 与 startup/tool 探针一致：加载真实 dist/main/main.js，但只等待应用就绪、不打断启动流程；
// 建立后通过真实网关链路（dist/main/gateway.js 的 DeepSeekGateway）请求流式 chat，
// 时间点来自网关 onDelta 回调——即 renderer 通过 gateway:stream-chunk 看到内容的时间上游。
//
// 为了在一次性沙箱内可重复，使用本机 OpenAI 兼容 mock SSE 服务（run-first-token-benchmark.cjs
// 内启动），网关的 globalThis.fetch 只在探针进程内被包装、把 mock 主机路由到本地端口，
// 其余请求保持原样；不修改产品代码、不写任何真实凭据。
//
// 被测场景（网关能力）：
//   - mock 0ms：服务端立刻返回首个 reasoning delta（网关最快路径）
//   - mock 800ms：服务端 800ms 后才开始流（模拟上游思考时间；测网关开销）
// 另可选用真实本机 Provider（NF_FIRST_TOKEN_REAL=1），指向 Magpie OpenAI 兼容端点，
// 密钥只从环境变量读取；该场景的结果单独标注为外部上游延迟，不混入 mock 基线。
//
// 输出一行 NF_FIRST_TOKEN_RESULT JSON。

const path = require('node:path')
const http = require('node:http')
const { pathToFileURL } = require('node:url')
const { app } = require('electron')

const t0 = process.hrtime.bigint()
let finished = false

function msSinceStart() {
  return Number(process.hrtime.bigint() - t0) / 1e6
}

function quantile(values, q) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]
}

function summarize(values) {
  return {
    n: values.length,
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    samples: values,
  }
}

function emit(result) {
  if (finished) return
  finished = true
  process.stdout.write('NF_FIRST_TOKEN_RESULT ' + JSON.stringify(result) + '\n')
  setImmediate(() => app.quit())
}

function fail(err) {
  emit({ ok: false, error: String(err && err.stack ? err.stack : err), durationMs: msSinceStart() })
}

const ITERATIONS = Number(process.env.NF_FIRST_TOKEN_ITERATIONS || '30')
const WARMUP = Number(process.env.NF_FIRST_TOKEN_WARMUP || '3')
const MOCK_PORT = Number(process.env.NF_FIRST_TOKEN_MOCK_PORT || '0')
const FIRST_DELAY_MS = Number(process.env.NF_FIRST_TOKEN_DELAY_MS || '0')
const REAL_MODE = process.env.NF_FIRST_TOKEN_REAL === '1'
const REAL_BASE_URL = process.env.NF_FIRST_TOKEN_REAL_BASE_URL || 'http://127.0.0.1:3425/v1'
const REAL_MODEL = process.env.NF_FIRST_TOKEN_REAL_MODEL || 'opendesign/deepseek-v4.1-flash-eco'
const REAL_KEY_ENV = process.env.NF_FIRST_TOKEN_REAL_KEY_ENV || 'MAGPIE_GATEWAY_KEY'
const USE_MOCK_TARGET = !REAL_MODE || process.env.NF_FIRST_TOKEN_REAL_DELAY_MOCK === '1'

let mainWindow = null
app.on('browser-window-created', (_event, created) => {
  if (!mainWindow) mainWindow = created
})

if (REAL_MODE && !process.env[REAL_KEY_ENV]) {
  fail(new Error(`${REAL_KEY_ENV} missing for real-provider TTFT mode`))
} else if (!finished) {
  if (!process.env.NF_TEST_USERDATA) {
    process.env.NF_TEST_USERDATA = path.join(
      process.env.TMPDIR || '/tmp',
      'nf-first-token-userdata-' + process.pid,
    )
  }
  app.setPath('userData', process.env.NF_TEST_USERDATA)
  process.env.NEONFORGE_API_KEY = process.env.NEONFORGE_API_KEY || 'dummy-not-a-key'

  const electronMain = path.resolve(__dirname, '../../apps/desktop/dist/main/main.js')
  // 真实模式：主入口启动前就把 Key 放进环境（只来自环境变量，不落盘、不打印）。
  if (REAL_MODE && process.env[REAL_KEY_ENV]) {
    process.env.NEONFORGE_API_KEY = process.env[REAL_KEY_ENV]
  }

  app
    .whenReady()
    .then(async () => {
      // 真实主入口的启动流程会继续；探针不抢窗口生命周期。
      try {
        await import(pathToFileURL(electronMain).href)
      } catch (e) {
        // 主入口导入失败在无窗口环境可能导致不可恢复；这里直接报告。
        throw e
      }
      await run()
    })
    .catch(fail)
}

// ---------------------------------------------------------------------------
// Mock SSE 服务：OpenAI 兼容 /v1/chat/completions（stream）。
// 首 delta 延迟由 NF_FIRST_TOKEN_DELAY_MS 控制（默认 0）。
// ---------------------------------------------------------------------------

function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: REAL_MODEL }, { id: 'deepseek-chat' }] }))
        return
      }
      if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
        let raw = ''
        req.on('data', (c) => {
          raw += c
        })
        req.on('end', () => {
          sendMockStream()
          function sendMockStream() {
            const deltaPayload = (extra) =>
              JSON.stringify({
                id: 'nf-mock',
                object: 'chat.completion.chunk',
                model: REAL_MODEL,
                choices: [{ index: 0, delta: extra, finish_reason: null }],
              })
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            })
            const write = (s) => res.write(s)
            const first = () => {
              write('data: ' + deltaPayload({ reasoning_content: 'ok' }) + '\n\n')
              write('data: ' + deltaPayload({ content: 'hello' }) + '\n\n')
              write(
                'data: ' +
                  JSON.stringify({
                    id: 'nf-mock',
                    object: 'chat.completion.chunk',
                    model: REAL_MODEL,
                    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                  }) +
                  '\n\n',
              )
              write('data: [DONE]\n\n')
              res.end()
            }
            // 模拟真实服务：先发 SSE 头 + 空注释行，保持连接打开（首 delta 之前不计入）。
            write(': keepalive\n\n')
            // 上游延迟：mock 模式按 NF_FIRST_TOKEN_DELAY_MS 注入；真实模式用于「固定延迟」子场景。
            if (FIRST_DELAY_MS > 0 && process.env.NF_FIRST_TOKEN_REAL === '1') {
              if (process.env.NF_FIRST_TOKEN_REAL_DELAY_MOCK === '1')
                setTimeout(first, FIRST_DELAY_MS)
              else first()
            } else if (FIRST_DELAY_MS > 0) {
              setTimeout(first, FIRST_DELAY_MS)
            } else {
              first()
            }
          }
        })
        return
      }
      res.writeHead(404)
      res.end('not found')
    })
    server.on('error', reject)
    server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server))
  })
}

// 产品接入方固定 baseURL（descriptor）→ 探针目标（本地 mock 或真实本机 Provider）。
// 只改写这四个 origin，其他请求保持原始行为；产品代码不改。
const PRODUCT_PROVIDER_ORIGINS = [
  'https://api.deepseek.com',
  'https://api.commandcode.ai',
  'https://opencode.ai',
]

function installFetchRouter(targetBase) {
  const originalFetch = globalThis.fetch
  const target = new URL(targetBase)
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
      const nextUrl = target.origin + prefix + parsed.pathname + parsed.search
      return originalFetch(nextUrl, init)
    }
    return originalFetch(input, init)
  }
  return () => {
    globalThis.fetch = originalFetch
  }
}

// ---------------------------------------------------------------------------
// 用真实 providerId（deepseek）驱动 gateway.streamChat；descriptor 的固定 origin 由
// installFetchRouter 在探针进程内改写（产品代码与注册表均不改）。
// ---------------------------------------------------------------------------

async function run() {
  const gatewayModule = await import(
    pathToFileURL(path.resolve(__dirname, '../../apps/desktop/dist/main/gateway.js')).href
  )
  const configModule = await import(
    pathToFileURL(path.resolve(__dirname, '../../apps/desktop/dist/main/configStore.js')).href
  )
  const gateway = gatewayModule.gateway
  const configStore = configModule.configStore || null

  // 真实主入口在无窗口/无任务环境下应保持存活；这里只等它完成主进程初始化。
  // 等待 gateway 模块可用即可（main.js 已 import 过同一模块实例）。
  let mock = null
  let restoreFetch = null
  if (USE_MOCK_TARGET) {
    mock = await startMockServer()
    const mockBase = `http://127.0.0.1:${mock.address().port}/v1`
    restoreFetch = installFetchRouter(mockBase)
  } else {
    restoreFetch = installFetchRouter(REAL_BASE_URL)
  }

  // providerId/model：mock 目标固定 deepseek + mock 模型；真实目标用环境变量模型。
  const providerId = 'deepseek'
  const manualModelId = REAL_MODE && !USE_MOCK_TARGET ? REAL_MODEL : 'nf-mock-model'
  const apiKey = USE_MOCK_TARGET ? 'dummy-not-a-key' : process.env[REAL_KEY_ENV]

  if (configStore) {
    await configStore.setModelSelection(manualModelId, providerId)
    if (!USE_MOCK_TARGET && REAL_MODE) {
      // 真实目标不写配置落盘密钥；仅环境变量注入当前进程。
      process.env.NEONFORGE_API_KEY = apiKey
    }
  }

  const messages = [
    { role: 'system', content: '你是性能探针。' },
    { role: 'user', content: 'Say hello in one short sentence.' },
  ]

  async function once() {
    const s = process.hrtime.bigint()
    let firstReasoningMs = null
    let firstContentMs = null
    let firstToolMs = null
    let doneMs = null
    let chunkCount = 0
    await gateway.streamChat(apiKey, {
      providerId,
      manualModelId,
      level: 'basic',
      tools: false,
      messages,
      onDelta: (chunk) => {
        chunkCount++
        const at = Number(process.hrtime.bigint() - s) / 1e6
        if (chunk.type === 'reasoning' && firstReasoningMs === null) firstReasoningMs = at
        if (chunk.type === 'content' && firstContentMs === null) firstContentMs = at
        if (chunk.type === 'tool-call' && firstToolMs === null) firstToolMs = at
        if (chunk.type === 'done') doneMs = at
      },
    })
    return { firstReasoningMs, firstContentMs, firstToolMs, doneMs, chunkCount }
  }

  const failures = []
  const samples = []
  for (let i = 0; i < WARMUP; i++) {
    try {
      await once()
    } catch (e) {
      failures.push({ i, warmup: true, error: e instanceof Error ? e.message : String(e) })
    }
  }
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      samples.push(await once())
    } catch (e) {
      failures.push({ i, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const firstReasoningSamples = samples
    .map((s) => s.firstReasoningMs)
    .filter((v) => typeof v === 'number')
  const firstContentSamples = samples
    .map((s) => s.firstContentMs)
    .filter((v) => typeof v === 'number')
  const firstAnySamples = samples
    .map((s) => s.firstReasoningMs ?? s.firstContentMs ?? s.firstToolMs)
    .filter((v) => typeof v === 'number')
  const doneSamples = samples.map((s) => s.doneMs).filter((v) => typeof v === 'number')

  let renderer = null
  if (mainWindow && mainWindow.webContents) {
    try {
      const { measureRendererFirstText } = require('./first-token-renderer.cjs')
      renderer = await measureRendererFirstText(mainWindow.webContents)
    } catch (e) {
      renderer = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  if (restoreFetch) restoreFetch()
  if (mock) await new Promise((r) => mock.close(r))

  emit({
    ok: failures.length === 0,
    human: false,
    mode: USE_MOCK_TARGET
      ? REAL_MODE
        ? 'real-ui-mock-upstream'
        : 'mock-sse-upstream'
      : 'real-provider',
    target: USE_MOCK_TARGET ? 'mock-sse' : 'real-provider',
    providerId,
    model: manualModelId,
    firstDeltaDelayMs: USE_MOCK_TARGET ? FIRST_DELAY_MS : null,
    iterations: ITERATIONS,
    warmup: WARMUP,
    firstReasoning: summarize(firstReasoningSamples),
    firstContent: summarize(firstContentSamples),
    firstAnyDelta: summarize(firstAnySamples),
    done: summarize(doneSamples),
    chunkCounts: samples.map((s) => s.chunkCount),
    renderer: {
      ...(renderer || {}),
      note: '真实 renderer：启动页填入 → 从零开始 → initialPrompt 自动发送 → 首个非占位 assistant 正文（脚本化，非人类）',
    },
    failures,
    coverage: {
      reason:
        '主进程网关 streamChat：请求→首 delta→done；renderer 链路：启动页发送→首个可见正文（脚本化）；' +
        'IPC 固定开销另由 tool-ipc 探针覆盖',
      excludes: ['真实上游模型思考时间（仅真实模式含）', '含工具调用的首轮', '人类阅读/判断时间'],
    },
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    durationMs: msSinceStart(),
  })
}
