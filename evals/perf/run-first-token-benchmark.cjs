// 首 token 延迟基准运行器（仅测量，不改产品代码）。
// 用法（仓库根）：
//   node evals/perf/run-first-token-benchmark.cjs --mode mock --delay-ms 0 --runs 3 --iterations 10
//   node evals/perf/run-first-token-benchmark.cjs --mode mock --delay-ms 800
//   node evals/perf/run-first-token-benchmark.cjs --mode real        # 需 MAGPIE_GATEWAY_KEY 环境变量
//
// 每次运行独立 Electron 主进程、独立 userData；假 Key（mock 模式）或环境变量 Key（真实模式）。
// 原始 JSONL 只写 .scratch/evals/perf/，不进仓库；不写任何凭据值。

const { spawn, execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync, appendFileSync, existsSync } = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const { resolveElectronBin, electronCommand, displayMode } = require('./electron-bin.cjs')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const electronBin = resolveElectronBin(repoRoot)
const harness = path.join(__dirname, 'first-token.cjs')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = {
    mode: 'mock',
    delayMs: 0,
    delayMock: false,
    remote: false,
    remoteModel: null,
    runs: 3,
    iterations: 10,
    warmup: 3,
    timeoutMs: 300000,
    out: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode') opts.mode = argv[++i]
    else if (a === '--delay-ms') opts.delayMs = Number(argv[++i])
    else if (a === '--delay-mock') opts.delayMock = true
    else if (a === '--remote') opts.remote = true
    else if (a === '--remote-model') opts.remoteModel = argv[++i]
    else if (a === '--key-env') opts.keyEnv = argv[++i]
    else if (a === '--runs') opts.runs = Number(argv[++i])
    else if (a === '--iterations') opts.iterations = Number(argv[++i])
    else if (a === '--warmup') opts.warmup = Number(argv[++i])
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else throw new Error(`unknown arg ${a}`)
  }
  if (!['mock', 'real', 'remote'].includes(opts.mode)) throw new Error(`unknown mode ${opts.mode}`)
  if (opts.mode === 'remote') opts.remote = true
  return opts
}

function gitInfo() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim(),
      dirty:
        execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim()
          .length > 0,
    }
  } catch {
    return { commit: null, dirty: null }
  }
}

function shortDir(prefix, seed) {
  const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12)
  return path.join('/tmp', `${prefix}-${hash}`)
}

function baseEnv(runDir) {
  const keep = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MAGPIE|OPENAI|ANTHROPIC)/i.test(key)) continue
    keep[key] = value
  }
  const home = path.join(runDir, 'home')
  const xdg = path.join(runDir, 'xdg')
  mkdirSync(home, { recursive: true })
  mkdirSync(path.join(xdg, 'config'), { recursive: true })
  mkdirSync(path.join(xdg, 'cache'), { recursive: true })
  mkdirSync(path.join(xdg, 'data'), { recursive: true })
  return {
    ...keep,
    HOME: home,
    XDG_CONFIG_HOME: path.join(xdg, 'config'),
    XDG_CACHE_HOME: path.join(xdg, 'cache'),
    XDG_DATA_HOME: path.join(xdg, 'data'),
    TMPDIR: shortDir('nf-perf-tmp', runDir),
    NF_TEST_USERDATA: path.join(runDir, 'userdata'),
    NEONFORGE_API_KEY: 'dummy-not-a-key',
    NEONFORGE_API_KEY_FILE: '',
    NEONFORGE_SEARCH_KEY: '',
    NEONFORGE_SEARCH_KEY_FILE: '',
    NEONFORGE_KEENABLE_API_KEY: '',
    NEONFORGE_KEENABLE_API_KEY_FILE: '',
    NEONFORGE_ALLOW_PLAINTEXT_KEY: '',
    NF_DEBUG: '',
  }
}

function childEnv(runDir, opts) {
  const env = {
    ...baseEnv(runDir),
    NF_FIRST_TOKEN_ITERATIONS: String(opts.iterations),
    NF_FIRST_TOKEN_WARMUP: String(opts.warmup),
    NF_FIRST_TOKEN_DELAY_MS: String(opts.delayMs),
  }
  if (opts.remote) {
    // 远端路径：key 只从指定环境变量进入探针进程，不写文件、不写日志。
    const keyEnv = opts.keyEnv || 'DEEPSEEK_API_KEY'
    const key = process.env[keyEnv]
    if (!key) throw new Error(`${keyEnv} missing for remote mode`)
    env[keyEnv] = key
    env.NF_FIRST_TOKEN_REAL = '1'
    env.NF_FIRST_TOKEN_REAL_KEY_ENV = keyEnv
    env.NF_FIRST_TOKEN_REMOTE = '1'
    if (opts.remoteModel) env.NF_FIRST_TOKEN_REMOTE_MODEL = opts.remoteModel
    return env
  }
  if (opts.mode === 'real') {
    // 凭据只从环境变量进入探针进程，不写文件、不写日志。
    const key = process.env.MAGPIE_GATEWAY_KEY
    if (!key) throw new Error('MAGPIE_GATEWAY_KEY missing for real mode')
    env.MAGPIE_GATEWAY_KEY = key
    env.NF_FIRST_TOKEN_REAL = '1'
    env.NF_FIRST_TOKEN_REAL_BASE_URL =
      process.env.NF_FIRST_TOKEN_REAL_BASE_URL || 'http://127.0.0.1:3425/v1'
    env.NF_FIRST_TOKEN_REAL_MODEL =
      process.env.NF_FIRST_TOKEN_REAL_MODEL || 'opendesign/deepseek-v4.1-flash-eco'
    env.NF_FIRST_TOKEN_REAL_KEY_ENV = 'MAGPIE_GATEWAY_KEY'
    if (opts.delayMock) env.NF_FIRST_TOKEN_REAL_DELAY_MOCK = '1'
  }
  return env
}

function runElectron({ runDir, opts }) {
  mkdirSync(path.join(runDir, 'userdata'), { recursive: true })
  mkdirSync(shortDir('nf-perf-tmp', runDir), { recursive: true })
  const env = childEnv(runDir, opts)
  const args = [...electronCommand(electronBin), harness]
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      env,
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGTERM')
      } catch {}
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 3000).unref()
    }, opts.timeoutMs)
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > 200000) stdout = stdout.slice(-100000)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 100000) stderr = stderr.slice(-50000)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const wallMs = Date.now() - started
      const lines = stdout.split('\n').filter((l) => l.startsWith('NF_FIRST_TOKEN_RESULT '))
      const last = lines.length
        ? lines[lines.length - 1].slice('NF_FIRST_TOKEN_RESULT '.length)
        : null
      let result = null
      let parseError = null
      if (last) {
        try {
          result = JSON.parse(last)
        } catch (err) {
          parseError = String(err)
        }
      }
      resolve({
        exitCode: code,
        signal,
        timedOut,
        wallMs,
        result,
        parseError,
        stdoutTail: result ? null : stdout.slice(-4000),
        stderrTail: stderr.slice(-2000),
      })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        exitCode: null,
        signal: null,
        timedOut,
        wallMs: Date.now() - started,
        result: null,
        error: String(err),
      })
    })
  })
}

function quantile(values, q) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]
}

function merged(okRows, field) {
  const samples = []
  for (const r of okRows) {
    const m = r.result && r.result[field]
    if (m && Array.isArray(m.samples)) samples.push(...m.samples)
  }
  return {
    n: samples.length,
    p50: quantile(samples, 0.5),
    p95: quantile(samples, 0.95),
    min: samples.length ? Math.min(...samples) : null,
    max: samples.length ? Math.max(...samples) : null,
  }
}

function summarize(rows) {
  const ok = rows.filter((r) => r.result && r.result.ok)
  const failures = rows.flatMap((r) => (r.result && r.result.failures) || [])
  const rendererSamples = []
  const rendererErrors = []
  for (const r of ok) {
    const rr = r.result && r.result.renderer
    if (!rr) continue
    if (typeof rr.firstTextMs === 'number') rendererSamples.push(rr.firstTextMs)
    else if (rr.error) rendererErrors.push(rr.error)
  }
  return {
    runs: rows.length,
    ok: ok.length,
    failureCount: failures.length,
    failures: failures.slice(0, 5),
    firstReasoning: merged(ok, 'firstReasoning'),
    firstContent: merged(ok, 'firstContent'),
    firstAnyDelta: merged(ok, 'firstAnyDelta'),
    done: merged(ok, 'done'),
    renderer: {
      n: rendererSamples.length,
      p50: quantile(rendererSamples, 0.5),
      p95: quantile(rendererSamples, 0.95),
      min: rendererSamples.length ? Math.min(...rendererSamples) : null,
      max: rendererSamples.length ? Math.max(...rendererSamples) : null,
      samples: rendererSamples,
      errors: rendererErrors.slice(0, 5),
    },
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(electronBin)) throw new Error(`electron binary missing: ${electronBin}`)
  if (!existsSync(path.join(desktopDir, 'dist/main/gateway.js'))) {
    throw new Error(
      'apps/desktop/dist/main/gateway.js missing; run `npm run build` in apps/desktop',
    )
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const tag = `${opts.remote ? 'remote' : opts.mode}-${opts.delayMs}ms`
  const outPath = opts.out || path.join(scratchDir, `first-token-${tag}-${stamp}.jsonl`)
  mkdirSync(path.dirname(outPath), { recursive: true })
  const g = gitInfo()
  const meta = {
    type: 'meta',
    timestamp: new Date().toISOString(),
    git: g,
    system: {
      platform: os.platform(),
      arch: os.arch(),
      kernel: os.release(),
      cpuModel: (os.cpus()[0] || {}).model || null,
      cpuCount: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1048576),
      loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
      display: displayMode(),
      electronArgs: electronCommand(electronBin).filter((a) => a.startsWith('--')),
    },
    options: {
      mode: opts.mode,
      remote: opts.remote,
      remoteModel: opts.remoteModel,
      keyEnv: opts.remote ? opts.keyEnv || 'DEEPSEEK_API_KEY' : null,
      delayMs: opts.delayMs,
      runs: opts.runs,
      iterations: opts.iterations,
      warmup: opts.warmup,
      timeoutMs: opts.timeoutMs,
    },
  }
  appendFileSync(outPath, JSON.stringify(meta) + '\n')
  const rows = []

  for (let i = 1; i <= opts.runs; i++) {
    const runDir = path.join(scratchDir, `first-token-runs-${stamp}`, `run-${i}`)
    mkdirSync(runDir, { recursive: true })
    const row = await runElectron({ runDir, opts })
    rows.push({ type: 'run', run: i, ...row })
    appendFileSync(outPath, JSON.stringify(rows[rows.length - 1]) + '\n')
    const s = row.result
    console.log(
      `run ${i}: exit=${row.exitCode} wall=${row.wallMs}ms ` +
        (s && s.ok
          ? `firstAny p50=${s.firstAnyDelta.p50?.toFixed(1)} p95=${s.firstAnyDelta.p95?.toFixed(1)} ` +
            `firstContent p50=${s.firstContent.p50?.toFixed(1) ?? 'n/a'}`
          : `FAILED ${s?.error || row.parseError || row.error || 'no-result'}`),
    )
  }

  const summary = {
    type: 'summary',
    timestamp: new Date().toISOString(),
    git: g,
    options: meta.options,
    ...summarize(rows),
  }
  writeFileSync(outPath.replace(/\.jsonl$/, '-summary.json'), JSON.stringify(summary, null, 2))
  appendFileSync(outPath, JSON.stringify(summary) + '\n')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e))
  process.exit(1)
})
