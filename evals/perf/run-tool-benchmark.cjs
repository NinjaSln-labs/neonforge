// 工具执行基准运行器（仅测量，不改产品代码）。
// 用法（仓库根）：
//   node evals/perf/run-tool-benchmark.cjs --runs 3 --iterations 30 --warmup 3
//
// 每次运行独立 Electron 主进程、独立 userData/fixture；假 Key、剔除敏感环境变量。

const { spawn, execFileSync } = require('node:child_process')
const { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const electronBin = path.join(desktopDir, 'node_modules/electron/dist/electron')
const harness = path.join(__dirname, 'tool-execution.cjs')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = { runs: 3, iterations: 30, warmup: 3, out: null, timeoutMs: 180000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--runs') opts.runs = Number(argv[++i])
    else if (a === '--iterations') opts.iterations = Number(argv[++i])
    else if (a === '--warmup') opts.warmup = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else throw new Error(`unknown arg ${a}`)
  }
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

function sanitizedEnv(runDir, fixtureDir) {
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
    NF_PERF_FIXTURE_DIR: fixtureDir,
    NEONFORGE_API_KEY: 'dummy',
    NEONFORGE_API_KEY_FILE: '',
    NEONFORGE_SEARCH_KEY: '',
    NEONFORGE_SEARCH_KEY_FILE: '',
    NEONFORGE_KEENABLE_API_KEY: '',
    NEONFORGE_KEENABLE_API_KEY_FILE: '',
    NEONFORGE_ALLOW_PLAINTEXT_KEY: '',
    NF_DEBUG: '',
  }
}

function runElectron({ runDir, fixtureDir, timeoutMs, iterations, warmup }) {
  mkdirSync(path.join(runDir, 'userdata'), { recursive: true })
  mkdirSync(shortDir('nf-perf-tmp', runDir), { recursive: true })
  const env = {
    ...sanitizedEnv(runDir, fixtureDir),
    NF_PERF_ITERATIONS: String(iterations),
    NF_PERF_WARMUP: String(warmup),
  }
  const base = process.env.DISPLAY
    ? [electronBin]
    : ['xvfb-run', '-a', '-s', '-screen 0 1280x800x24', electronBin]
  const args = [...base, '--disable-gpu', '--no-sandbox', harness]
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
    }, timeoutMs)
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
      const lines = stdout.split('\n').filter((l) => l.startsWith('NF_TOOL_PERF_RESULT '))
      const last = lines.length
        ? lines[lines.length - 1].slice('NF_TOOL_PERF_RESULT '.length)
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

function summarize(rows) {
  const ok = rows.filter((r) => r.result && r.result.ok)
  const tools = {}
  for (const name of ['read', 'write', 'edit', 'search', 'bash']) {
    const samples = []
    let failureCount = 0
    const failures = []
    for (const r of ok) {
      const t = r.result.tools && r.result.tools[name]
      if (!t) continue
      samples.push(...(t.samples || []))
      failureCount += t.failureCount || 0
      if (t.failures) failures.push(...t.failures)
    }
    tools[name] = {
      n: samples.length,
      failureCount,
      failures: failures.slice(0, 5),
      p50: quantile(samples, 0.5),
      p95: quantile(samples, 0.95),
      min: samples.length ? Math.min(...samples) : null,
      max: samples.length ? Math.max(...samples) : null,
      validation:
        ok.find((r) => r.result.tools && r.result.tools[name])?.result.tools[name].validation ||
        null,
    }
  }
  return { runs: rows.length, ok: ok.length, tools }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(electronBin)) throw new Error(`electron binary missing: ${electronBin}`)
  if (!existsSync(path.join(desktopDir, 'dist/main/tools.js'))) {
    throw new Error('apps/desktop/dist/main/tools.js missing; run `npm run build` in apps/desktop')
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = opts.out || path.join(scratchDir, `tools-${stamp}.jsonl`)
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
      display: process.env.DISPLAY ? 'host' : 'xvfb',
      electronArgs: ['--disable-gpu', '--no-sandbox'],
    },
    options: opts,
  }
  appendFileSync(outPath, JSON.stringify(meta) + '\n')
  const rows = []

  for (let i = 1; i <= opts.runs; i++) {
    const runDir = path.join(scratchDir, `tool-runs-${stamp}`, `run-${i}`)
    rmSync(runDir, { recursive: true, force: true })
    mkdirSync(runDir, { recursive: true })
    const fixtureDir = shortDir('nf-perf-fixture', `${stamp}-${i}`)
    const row = {
      type: 'run',
      run: i,
      ...(await runElectron({
        runDir,
        fixtureDir,
        timeoutMs: opts.timeoutMs,
        iterations: opts.iterations,
        warmup: opts.warmup,
      })),
    }
    rows.push(row)
    appendFileSync(outPath, JSON.stringify(row) + '\n')
    const t = row.result && row.result.ok ? row.result.tools : null
    console.log(
      `run ${i}: ok=${row.result && row.result.ok} wall=${row.wallMs}ms ` +
        (t
          ? `read=${Math.round(t.read.p50)}ms write=${Math.round(t.write.p50)}ms ` +
            `edit=${Math.round(t.edit.p50)}ms search=${Math.round(t.search.p50)}ms bash=${Math.round(t.bash.p50)}ms`
          : 'NO_RESULT'),
    )
  }

  const summary = {
    type: 'summary',
    timestamp: new Date().toISOString(),
    git: g,
    ...summarize(rows),
    outPath,
  }
  appendFileSync(outPath, JSON.stringify(summary) + '\n')
  writeFileSync(
    path.join(scratchDir, 'latest-tool-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  const compact = { runs: summary.runs, ok: summary.ok, tools: {}, outPath }
  for (const [name, v] of Object.entries(summary.tools)) {
    compact.tools[name] = {
      n: v.n,
      failureCount: v.failureCount,
      p50: v.p50 && Number(v.p50.toFixed(2)),
      p95: v.p95 && Number(v.p95.toFixed(2)),
    }
  }
  console.log('SUMMARY ' + JSON.stringify(compact))
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err))
  process.exit(1)
})
