// 产品级 Electron 启动性能基线运行器（仅测量，不改产品代码）。
// 用法（仓库根）：
//   node evals/perf/run-startup-benchmark.cjs --cold 5 --warm 3 [--build] [--out .scratch/...]
//
// 每次运行使用独立 HOME/userData 与假 Key，不读取用户真实配置；
// 环境变量会剔除 *KEY*/*SECRET*/*TOKEN*/*MAGPIE* 等，测量环境不接触凭据。

const { spawn, execFileSync } = require('node:child_process')
const { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveElectronBin, electronCommand, displayMode } = require('./electron-bin.cjs')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const electronBin = resolveElectronBin(repoRoot)
const harness = path.join(__dirname, 'electron-startup.cjs')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = { cold: 5, warm: 3, build: false, out: null, timeoutMs: 45000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--cold') opts.cold = Number(argv[++i])
    else if (a === '--warm') opts.warm = Number(argv[++i])
    else if (a === '--build') opts.build = true
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

function shortTmpDir(runDir) {
  // Electron 的 process singleton socket 放在 TMPDIR；路径过长会 FATAL（WSL 仓库路径很深）。
  const hash = require('node:crypto').createHash('sha1').update(runDir).digest('hex').slice(0, 12)
  const dir = path.join('/tmp', `nf-perf-${hash}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function sanitizedEnv(runDir) {
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
    TMPDIR: shortTmpDir(runDir),
    NF_TEST_USERDATA: path.join(runDir, 'userdata'),
    NEONFORGE_API_KEY: 'dummy-not-a-key',
    NEONFORGE_API_KEY_FILE: '',
    NEONFORGE_SEARCH_KEY: '',
    NEONFORGE_SEARCH_KEY_FILE: '',
    NEONFORGE_KEENABLE_API_KEY: '',
    NEONFORGE_KEENABLE_API_KEY_FILE: '',
    NF_DEBUG: '',
    NEONFORGE_ALLOW_PLAINTEXT_KEY: '',
  }
}

function runElectron({ runDir, timeoutMs }) {
  mkdirSync(path.join(runDir, 'tmp'), { recursive: true })
  mkdirSync(path.join(runDir, 'userdata'), { recursive: true })
  const env = sanitizedEnv(runDir)
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
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      // 只保留尾部，防止超大日志占用内存。
      if (stdout.length > 200000) stdout = stdout.slice(-100000)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 100000) stderr = stderr.slice(-50000)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const wallMs = Date.now() - started
      const lines = stdout.split('\n').filter((l) => l.startsWith('NF_PERF_RESULT '))
      const last = lines.length ? lines[lines.length - 1].slice('NF_PERF_RESULT '.length) : null
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

function median(values) {
  return quantile(values, 0.5)
}

function summarize(rows) {
  const ok = rows.filter((r) => r.result && r.result.ok)
  const pick = (fn) => median(ok.map(fn).filter((v) => typeof v === 'number'))
  const pick95 = (fn) =>
    quantile(
      ok.map(fn).filter((v) => typeof v === 'number'),
      0.95,
    )
  const phase = (name) => (r) => r.result.phases[name]
  const ipcMedian = (i) => (r) =>
    r.result.ipc && r.result.ipc.calls && r.result.ipc.calls[i] && r.result.ipc.calls[i].median
  const ipcP95 = (i) => (r) =>
    r.result.ipc && r.result.ipc.calls && r.result.ipc.calls[i] && r.result.ipc.calls[i].p95
  return {
    runs: rows.length,
    ok: ok.length,
    wallMsMedian: pick((r) => r.wallMs),
    wallMsP95: pick95((r) => r.wallMs),
    appReadyMsMedian: pick(phase('app_ready')),
    appReadyMsP95: pick95(phase('app_ready')),
    windowCreatedMsMedian: pick(phase('window_created')),
    windowCreatedMsP95: pick95(phase('window_created')),
    didFinishLoadMsMedian: pick(phase('did_finish_load')),
    didFinishLoadMsP95: pick95(phase('did_finish_load')),
    readyScreenMsMedian: pick(phase('ready_screen')),
    readyScreenMsP95: pick95(phase('ready_screen')),
    ipcHasKeyMedianMs: pick(ipcMedian(0)),
    ipcHasKeyP95OfP95Ms: pick95(ipcP95(0)),
    ipcBudgetMedianMs: pick(ipcMedian(1)),
    ipcBudgetP95OfP95Ms: pick95(ipcP95(1)),
    totalWorkingSetMBMedian: pick((r) => r.result.memory.totalWorkingSetKB / 1024),
    totalPssMBMedian: pick((r) => r.result.memory.totalPssKB / 1024),
    totalPssMBP95: pick95((r) => r.result.memory.totalPssKB / 1024),
    screen: ok.length ? ok[0].result.screen : null,
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(electronBin)) throw new Error(`electron binary missing: ${electronBin}`)
  if (!existsSync(path.join(desktopDir, 'dist/main/main.js'))) {
    throw new Error('apps/desktop/dist/main/main.js missing; run with --build or `npm run build`')
  }
  if (opts.build) {
    execFileSync('npm', ['run', 'build'], { cwd: desktopDir, stdio: 'inherit', env: process.env })
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = opts.out || path.join(scratchDir, `startup-${stamp}.jsonl`)
  mkdirSync(path.dirname(outPath), { recursive: true })

  const g = gitInfo()
  const system = {
    platform: os.platform(),
    arch: os.arch(),
    kernel: os.release(),
    cpuModel: (os.cpus()[0] || {}).model || null,
    cpuCount: os.cpus().length,
    totalMemMB: Math.round(os.totalmem() / 1048576),
    loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
    display: displayMode(),
    electronArgs: electronCommand(electronBin).filter((a) => a.startsWith('--')),
  }
  const meta = {
    type: 'meta',
    timestamp: new Date().toISOString(),
    git: g,
    system,
    options: opts,
    electronBin,
  }
  const rows = [{ ...meta, mode: 'meta' }]
  appendFileSync(outPath, JSON.stringify(meta) + '\n')

  const baseDir = path.join(scratchDir, `runs-${stamp}`)
  mkdirSync(baseDir, { recursive: true })
  let warmDir = null
  for (let i = 1; i <= opts.cold; i++) {
    const runDir = path.join(baseDir, `cold-${i}`)
    rmSync(runDir, { recursive: true, force: true })
    mkdirSync(runDir, { recursive: true })
    const row = {
      type: 'run',
      mode: 'cold',
      run: i,
      ...(await runElectron({ runDir, timeoutMs: opts.timeoutMs })),
    }
    rows.push(row)
    appendFileSync(outPath, JSON.stringify(row) + '\n')
    console.log(
      `cold ${i}: ok=${row.result && row.result.ok} wall=${row.wallMs}ms ready=${row.result && row.result.phases && Math.round(row.result.phases.ready_screen)}ms`,
    )
    if (i === 1) warmDir = runDir
  }
  for (let i = 1; i <= opts.warm; i++) {
    const runDir = warmDir
    if (!runDir) throw new Error('warm runs need at least one cold run')
    const row = {
      type: 'run',
      mode: 'warm',
      run: i,
      ...(await runElectron({ runDir, timeoutMs: opts.timeoutMs })),
    }
    rows.push(row)
    appendFileSync(outPath, JSON.stringify(row) + '\n')
    console.log(
      `warm ${i}: ok=${row.result && row.result.ok} wall=${row.wallMs}ms ready=${row.result && row.result.phases && Math.round(row.result.phases.ready_screen)}ms`,
    )
  }

  const summary = {
    type: 'summary',
    timestamp: new Date().toISOString(),
    git: g,
    cold: summarize(rows.filter((r) => r.mode === 'cold')),
    warm: summarize(rows.filter((r) => r.mode === 'warm')),
    outPath,
  }
  appendFileSync(outPath, JSON.stringify(summary) + '\n')
  writeFileSync(
    path.join(scratchDir, 'latest-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  console.log('SUMMARY ' + JSON.stringify({ cold: summary.cold, warm: summary.warm, outPath }))
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err))
  process.exit(1)
})
