// 工具执行延迟探针（仅测量，不改产品代码）。
// 直接调用构建后的 ToolRegistry（dist/main/tools.js 的 execute 路径），
// 覆盖 read/write/edit/search/bash 的固定 fixture 基准。
// 输出一行 NF_TOOL_PERF_RESULT JSON。

const fs = require('node:fs')
const path = require('node:path')
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

function summarize(samples, failures) {
  return {
    n: samples.length,
    failures: failures.slice(0, 5),
    failureCount: failures.length,
    p50: quantile(samples, 0.5),
    p95: quantile(samples, 0.95),
    min: samples.length ? Math.min(...samples) : null,
    max: samples.length ? Math.max(...samples) : null,
    samples,
  }
}

function emit(result) {
  if (finished) return
  finished = true
  process.stdout.write('NF_TOOL_PERF_RESULT ' + JSON.stringify(result) + '\n')
  setImmediate(() => app.quit())
}

function fail(err) {
  emit({
    ok: false,
    error: String(err && err.stack ? err.stack : err),
    durationMs: msSinceStart(),
  })
}

const ITERATIONS = Number(process.env.NF_PERF_ITERATIONS || '30')
const WARMUP = Number(process.env.NF_PERF_WARMUP || '3')
const fixtureDir = process.env.NF_PERF_FIXTURE_DIR
const userDataDir = process.env.NF_TEST_USERDATA

if (!fixtureDir) fail(new Error('NF_PERF_FIXTURE_DIR missing'))
if (!userDataDir) fail(new Error('NF_TEST_USERDATA missing'))

if (!finished) {
  app.setPath('userData', userDataDir)
  process.env.NEONFORGE_API_KEY = process.env.NEONFORGE_API_KEY || 'nf-perf-dummy-not-a-key'
  app
    .whenReady()
    .then(() => run())
    .catch(fail)
}

function createFixture() {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
  fs.mkdirSync(fixtureDir, { recursive: true })
  const lines = []
  for (let i = 0; i < 120; i++) lines.push(`line ${i}: alpha beta gamma`)
  fs.writeFileSync(path.join(fixtureDir, 'readme.md'), lines.join('\n') + '\n')
  fs.writeFileSync(path.join(fixtureDir, 'edit-target.txt'), 'alpha\nbeta\ngamma\n')
  fs.writeFileSync(path.join(fixtureDir, 'search-target.txt'), lines.join('\n') + '\n')
}

function describeData(data) {
  if (data === null || data === undefined) return null
  if (typeof data === 'string')
    return { type: 'string', chars: data.length, preview: data.slice(0, 160) }
  if (Array.isArray(data))
    return {
      type: 'array',
      length: data.length,
      preview: JSON.stringify(data.slice(0, 3)).slice(0, 300),
    }
  if (typeof data === 'object') {
    const keys = Object.keys(data)
    let json = ''
    try {
      json = JSON.stringify(data)
    } catch {
      json = '[unserializable]'
    }
    return { type: 'object', keys: keys.slice(0, 12), preview: json.slice(0, 300) }
  }
  return { type: typeof data, preview: String(data).slice(0, 160) }
}

async function bench(registry, name, makeArgs, opts) {
  const samples = []
  const failures = []
  let editState = 0
  let firstData
  const argsFor = (i) => makeArgs(i, () => editState)

  const runOne = async (i, measured) => {
    const args = argsFor(i)
    const s = process.hrtime.bigint()
    const result = await registry.execute(name, args, opts)
    const elapsed = Number(process.hrtime.bigint() - s) / 1e6
    if (!result.ok) {
      failures.push({
        i,
        error: result.error || 'unknown',
        policy: result.policy,
        needApproval: result.needApproval,
      })
      return
    }
    if (measured) samples.push(elapsed)
    if (measured && firstData === undefined) firstData = result.data
    if (name === 'edit') editState = 1 - editState
  }

  for (let i = 0; i < WARMUP; i++) await runOne(i, false)
  for (let i = 0; i < ITERATIONS; i++) await runOne(i, true)
  return { ...summarize(samples, failures), validation: describeData(firstData) }
}

async function run() {
  try {
    createFixture()
    const toolsUrl = pathToFileURL(
      path.resolve(__dirname, '../../apps/desktop/dist/main/tools.js'),
    ).href
    const mod = await import(toolsUrl)
    mod.initTools()
    const registry = mod.toolRegistry
    const opts = {
      rootPath: fixtureDir,
      approved: true,
      approvalSource: 'user',
      sessionId: 'nf-perf-tool-bench',
    }

    const tools = {}
    tools.read = await bench(registry, 'read', () => ({ path: 'readme.md' }), opts)
    // search 放在 write/edit 之前：避免快照 .nf-bak 污染检索结果。
    tools.search = await bench(registry, 'search', () => ({ query: 'alpha' }), opts)
    tools.write = await bench(
      registry,
      'write',
      (i) => ({ path: 'write-target.txt', content: `value-${i}\n` }),
      opts,
    )
    tools.edit = await bench(
      registry,
      'edit',
      (_i, getState) =>
        getState() === 0
          ? { path: 'edit-target.txt', old: 'beta', new: 'beta2' }
          : { path: 'edit-target.txt', old: 'beta2', new: 'beta' },
      opts,
    )
    tools.bash = await bench(registry, 'bash', () => ({ command: "printf 'perf-ok\\n'" }), opts)

    if (typeof mod.killAllSubprocesses === 'function') mod.killAllSubprocesses()
    const mem = process.memoryUsage()
    const pss = (() => {
      try {
        return Number(
          fs
            .readFileSync(`/proc/${process.pid}/smaps_rollup`, 'utf8')
            .match(/^Pss:\s+(\d+)\s+kB/m)?.[1] || 0,
        )
      } catch {
        return null
      }
    })()

    emit({
      ok: true,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      startedAt,
      durationMs: msSinceStart(),
      iterations: ITERATIONS,
      warmup: WARMUP,
      fixtureDir,
      tools,
      memory: { mainRssBytes: mem.rss, mainHeapUsedBytes: mem.heapUsed, mainPssKB: pss },
    })
  } catch (err) {
    fail(err)
  }
}

setTimeout(() => {
  if (!finished) fail(new Error('timeout: tool benchmark did not finish within 120s'))
}, 120000).unref()
