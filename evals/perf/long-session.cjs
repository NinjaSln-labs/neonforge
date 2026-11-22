// 长会话内存探针（仅测量，不改产品代码）。
//
// 加载真实 dist/main/main.js，在隔离 userData/HOME 下用本地 OpenAI 兼容 mock SSE
// 驱动真实渲染器会话：启动页首句 → 工作区；之后每个 turn 间隔向 composer 发送一条消息。
// 每分钟采样 app.getAppMetrics / Linux PSS / renderer heap / localStorage 体积 / 事件循环延迟。
//
// 输出逐分钟 NF_LONG_SESSION_SAMPLE 行，以及最后一 行 NF_LONG_SESSION_RESULT。

const path = require('node:path')
const http = require('node:http')
const { readFileSync } = require('node:fs')
const { pathToFileURL } = require('node:url')
const { app } = require('electron')

const t0 = process.hrtime.bigint()
const startedAt = Date.now()
let finished = false

function msSinceStart() {
  return Number(process.hrtime.bigint() - t0) / 1e6
}

function quantile(values, q) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]
}

// Linux 用 PSS（/proc/<pid>/smaps_rollup）作为唯一驻留近似；macOS 无 PSS。
function pssKB(pid) {
  if (process.platform !== 'linux') return null
  try {
    const text = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')
    const match = text.match(/^Pss:\s+(\d+)\s+kB/m)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

function emit(result) {
  if (finished) return
  finished = true
  process.stdout.write('NF_LONG_SESSION_RESULT ' + JSON.stringify(result) + '\n')
  setImmediate(() => app.quit())
}

function fail(err) {
  emit({ ok: false, error: String(err && err.stack ? err.stack : err), durationMs: msSinceStart() })
}

const MINUTES = Number(process.env.NF_LONG_SESSION_MINUTES || '30')
const SAMPLE_MS = Number(process.env.NF_LONG_SESSION_SAMPLE_MS || '60000')
const TURN_MS = Number(process.env.NF_LONG_SESSION_TURN_MS || '60000')
const CHUNKS = Number(process.env.NF_LONG_SESSION_CHUNKS || '60')
const CHUNK_CHARS = Number(process.env.NF_LONG_SESSION_CHUNK_CHARS || '120')
const CHUNK_DELAY_MS = Number(process.env.NF_LONG_SESSION_CHUNK_DELAY_MS || '5')
const MOCK_PORT = Number(process.env.NF_LONG_SESSION_MOCK_PORT || '0')
const DURATION_MS = MINUTES * 60_000

if (!process.env.NF_TEST_USERDATA) {
  process.env.NF_TEST_USERDATA = path.join(
    process.env.TMPDIR || '/tmp',
    'nf-long-userdata-' + process.pid,
  )
}
app.setPath('userData', process.env.NF_TEST_USERDATA)
process.env.NEONFORGE_API_KEY = process.env.NEONFORGE_API_KEY || 'dummy-not-a-key'

let mainWindow = null
app.on('browser-window-created', (_event, created) => {
  if (!mainWindow) mainWindow = created
})

const mainLag = []
let lastMainTick = null
setInterval(() => {
  const now = Number(process.hrtime.bigint() / 1_000_000n)
  if (lastMainTick !== null) mainLag.push(now - lastMainTick - 1000)
  lastMainTick = now
}, 1000).unref()

const electronMain = path.resolve(__dirname, '../../apps/desktop/dist/main/main.js')

app
  .whenReady()
  .then(async () => {
    await import(pathToFileURL(electronMain).href)
    await run()
  })
  .catch(fail)

// ---------------------------------------------------------------------------
// Mock OpenAI 兼容服务：流式短回复 + 非流式摘要 + usage。
// ---------------------------------------------------------------------------

function mockContentFor(body) {
  const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user')
  const seed = lastUser && typeof lastUser.content === 'string' ? lastUser.content.slice(0, 80) : ''
  const sentence = `长会话内存探针回复（${seed}）：这是固定生成的正文，用于让渲染器累积真实消息内容与 DOM。`
  const total = Math.max(200, CHUNKS * CHUNK_CHARS)
  return sentence.repeat(Math.ceil(total / sentence.length)).slice(0, total)
}

function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'nf-long-session' }] }))
        return
      }
      if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
        let raw = ''
        req.on('data', (c) => {
          raw += c
        })
        req.on('end', () => {
          let body = {}
          try {
            body = JSON.parse(raw)
          } catch {
            /* 空 body 走默认流式 */
          }
          const content = mockContentFor(body)
          const usage = {
            prompt_tokens: 1200,
            completion_tokens: 140,
            total_tokens: 1340,
            prompt_cache_hit_tokens: 0,
            prompt_cache_miss_tokens: 1200,
            completion_tokens_details: { reasoning_tokens: 0 },
          }
          if (body.stream === false) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                id: 'nf-long-mock',
                object: 'chat.completion',
                model: 'nf-long-session',
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: '对话摘要：' + content.slice(0, 200) },
                    finish_reason: 'stop',
                  },
                ],
                usage,
              }),
            )
            return
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          const write = (s) => res.write(s)
          const delta = (extra) =>
            JSON.stringify({
              id: 'nf-long-mock',
              object: 'chat.completion.chunk',
              model: 'nf-long-session',
              choices: [{ index: 0, delta: extra, finish_reason: null }],
            })
          write(': keepalive\n\n')
          let i = 0
          const sendChunk = () => {
            if (i < CHUNKS) {
              const slice = content.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)
              write('data: ' + delta({ content: slice }) + '\n\n')
              i++
              if (CHUNK_DELAY_MS > 0) setTimeout(sendChunk, CHUNK_DELAY_MS)
              else setImmediate(sendChunk)
              return
            }
            write(
              'data: ' +
                JSON.stringify({
                  id: 'nf-long-mock',
                  object: 'chat.completion.chunk',
                  model: 'nf-long-session',
                  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                  usage,
                }) +
                '\n\n',
            )
            write('data: [DONE]\n\n')
            res.end()
          }
          sendChunk()
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
// Renderer 驱动：安装监听、启动页首句、后续 composer 发送、采样。
// ---------------------------------------------------------------------------

async function waitForStartScreen(wc, timeoutMs = 20000) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const deadline = performance.now() + ${timeoutMs};
      while (!document.querySelector('.nf-start') && performance.now() < deadline) await sleep(20);
      return document.querySelector('.nf-start') ? 'start' : document.querySelector('.nf-config') ? 'config' : 'none';
    })()`,
    true,
  )
}

async function prepareRenderer(wc) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bridge = window.neonforge;
      if (!bridge || !bridge.gateway) return { error: 'window.neonforge.gateway missing' };

      const state = { doneCount: 0, chunkCount: 0, lag: [] };
      window.__nfLongSession = state;
      bridge.gateway.onStreamChunk((chunk) => {
        state.chunkCount++;
        if (chunk.type === 'done') state.doneCount++;
      });
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        state.lag.push(now - last - 1000);
        last = now;
        if (state.lag.length > 1000) state.lag.shift();
      }, 1000);

      const input = document.querySelector('.nf-start__input');
      if (!input) return { error: 'start input missing' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, '长会话探针：第 1 轮，请回复一段说明。');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);
      const cta = [...document.querySelectorAll('.nf-start__cta')].find((el) =>
        el.textContent.includes('从零开始'),
      );
      if (!cta) return { error: 'start cta missing' };
      cta.click();

      const deadline = performance.now() + 30000;
      while (state.doneCount === 0 && performance.now() < deadline) await sleep(20);
      await sleep(300);
      if (state.doneCount === 0) return { error: 'initial turn did not finish', state };
      return { ok: true, doneCount: state.doneCount, chunkCount: state.chunkCount };
    })()`,
    true,
  )
}

async function sendTurn(wc, index) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const state = window.__nfLongSession;
      if (!state) return { error: 'long-session state missing' };
      const ta = document.querySelector('.nf-chat__field textarea');
      if (!ta) return { error: 'composer textarea missing' };
      const deadline = performance.now() + 5000;
      while (document.querySelector('.nf-chat__send--stop') && performance.now() < deadline) await sleep(50);
      if (document.querySelector('.nf-chat__send--stop')) return { error: 'composer still working' };

      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '长会话探针：第 ' + ${index} + ' 轮，请回复一段说明。');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80);
      const btn = document.querySelector('.nf-chat__send');
      if (!btn) return { error: 'send button missing' };
      const before = state.doneCount;
      btn.click();
      const doneDeadline = performance.now() + 60000;
      while (state.doneCount <= before && performance.now() < doneDeadline) await sleep(20);
      await sleep(300);
      return {
        ok: state.doneCount > before,
        doneCount: state.doneCount,
        chunkCount: state.chunkCount,
        elapsedMs: 0,
      };
    })()`,
    true,
  )
}

async function sampleRenderer(wc) {
  return wc.executeJavaScript(
    `(() => {
      const state = window.__nfLongSession || { lag: [], doneCount: 0, chunkCount: 0 };
      const lag = state.lag.splice(0, state.lag.length);
      const mem = performance.memory || null;
      const bodies = [...document.querySelectorAll('.nf-msg--assistant .nf-msg__body')];
      let textChars = 0;
      for (const b of bodies) textChars += (b.textContent || '').length;
      let localStorageBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        const v = localStorage.getItem(k) || '';
        localStorageBytes += k.length + v.length;
      }
      return {
        heap: mem ? {
          used: mem.usedJSHeapSize,
          total: mem.totalJSHeapSize,
          limit: mem.jsHeapSizeLimit,
        } : null,
        lag,
        session: {
          userMsgs: document.querySelectorAll('.nf-msg--user').length,
          assistantMsgs: document.querySelectorAll('.nf-msg--assistant').length,
          textChars,
          localStorageBytes,
          doneCount: state.doneCount,
          chunkCount: state.chunkCount,
        },
      };
    })()`,
    true,
  )
}

async function sampleMemory(wc, minute, turns) {
  const metrics = await app.getAppMetrics()
  const byType = {}
  let totalPssKB = 0
  let pssCount = 0
  let pssMissing = 0
  for (const m of metrics) {
    const type = m.type || 'unknown'
    const pss = pssKB(m.pid)
    byType[type] = byType[type] || { count: 0, workingSetKB: 0, pssKB: 0 }
    byType[type].count++
    byType[type].workingSetKB += (m.memory && m.memory.workingSetSize) || 0
    if (pss !== null) {
      byType[type].pssKB += pss
      totalPssKB += pss
      pssCount++
    } else {
      pssMissing++
    }
  }
  const mainRss = process.memoryUsage()
  const renderer = await sampleRenderer(wc)
  const rendererLag = renderer.lag || []
  const mainLagSnapshot = mainLag.splice(0, mainLag.length)
  const sample = {
    minute,
    atMs: Date.now() - startedAt,
    turns,
    memory: {
      totalWorkingSetKB: metrics.reduce(
        (s, m) => s + ((m.memory && m.memory.workingSetSize) || 0),
        0,
      ),
      totalPssKB,
      pssCount,
      pssMissing,
      byType,
      mainRssBytes: mainRss.rss,
      mainHeapUsedBytes: mainRss.heapUsed,
    },
    renderer: { heap: renderer.heap, session: renderer.session },
    lag: {
      main: {
        n: mainLagSnapshot.length,
        p95: quantile(mainLagSnapshot, 0.95),
        max: mainLagSnapshot.length ? Math.max(...mainLagSnapshot) : null,
      },
      renderer: {
        n: rendererLag.length,
        p95: quantile(rendererLag, 0.95),
        max: rendererLag.length ? Math.max(...rendererLag) : null,
      },
    },
  }
  process.stdout.write('NF_LONG_SESSION_SAMPLE ' + JSON.stringify(sample) + '\n')
  return sample
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

async function run() {
  const mock = await startMockServer()
  const mockBase = `http://127.0.0.1:${mock.address().port}/v1`
  const restoreFetch = installFetchRouter(mockBase)
  const configModule = await import(
    pathToFileURL(path.resolve(__dirname, '../../apps/desktop/dist/main/configStore.js')).href
  )
  if (configModule.configStore) {
    await configModule.configStore.setModelSelection('nf-long-session', 'deepseek')
  }

  const win = mainWindow
  if (!win || !win.webContents) throw new Error('main window missing')
  const wc = win.webContents
  const screen = await waitForStartScreen(wc)
  if (screen !== 'start') throw new Error(`start screen not ready: ${screen}`)

  const prep = await prepareRenderer(wc)
  if (!prep || prep.error) throw new Error(`renderer prepare failed: ${prep?.error || 'unknown'}`)

  const samples = []
  const failures = []
  const turnStartedAt = Date.now()
  let turns = 1
  let turnInFlight = false
  let tickTimer = null
  let consecutiveFailures = 0

  const finish = async () => {
    if (finished) return
    if (tickTimer) clearTimeout(tickTimer)
    try {
      samples.push(await sampleMemory(wc, Math.round((Date.now() - turnStartedAt) / 60000), turns))
    } catch (e) {
      failures.push({ phase: 'final-sample', error: e instanceof Error ? e.message : String(e) })
    }
    if (restoreFetch) restoreFetch()
    await new Promise((r) => mock.close(r))
    emit({
      ok: failures.length === 0,
      human: false,
      mode: 'mock-sse-long-session',
      configuredMinutes: MINUTES,
      actualMs: Date.now() - turnStartedAt,
      turns,
      turnIntervalMs: TURN_MS,
      sampleIntervalMs: SAMPLE_MS,
      chunksPerTurn: CHUNKS,
      chunkChars: CHUNK_CHARS,
      samples,
      failures,
      session: samples.length ? samples[samples.length - 1].renderer.session : null,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      durationMs: msSinceStart(),
    })
  }

  const schedule = () => {
    const elapsed = Date.now() - turnStartedAt
    if (elapsed >= DURATION_MS) {
      void finish()
      return
    }
    tickTimer = setTimeout(tick, Math.max(1000, SAMPLE_MS))
    tickTimer.unref?.()
  }

  const tick = async () => {
    if (finished) return
    if (turnInFlight) {
      tickTimer = setTimeout(tick, 500)
      tickTimer.unref?.()
      return
    }
    try {
      const minute = Math.round((Date.now() - turnStartedAt) / 60000)
      samples.push(await sampleMemory(wc, minute, turns))
      if (Date.now() - turnStartedAt < DURATION_MS) {
        turnInFlight = true
        turns++
        const r = await sendTurn(wc, turns)
        turnInFlight = false
        if (!r || !r.ok) {
          consecutiveFailures++
          failures.push({ turn: turns, error: r?.error || 'turn did not finish' })
          if (consecutiveFailures >= 3) throw new Error('three consecutive turns failed')
        } else {
          consecutiveFailures = 0
        }
      }
    } catch (e) {
      failures.push({ phase: 'tick', error: e instanceof Error ? e.message : String(e) })
      void finish()
      return
    }
    schedule()
  }

  // 基线样本在首轮完成后立即采；之后每个 SAMPLE_MS 采一次并发送下一轮。
  samples.push(await sampleMemory(wc, 0, turns))
  schedule()
}
