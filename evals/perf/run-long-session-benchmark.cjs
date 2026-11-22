// 长会话内存基准运行器（仅测量，不改产品代码）。
//
// 用法（仓库根）：
//   node evals/perf/run-long-session-benchmark.cjs --minutes 30
//   node evals/perf/run-long-session-benchmark.cjs --minutes 30 --sample-ms 60000 --turn-ms 60000
//
// 单次运行 = 一个独立 Electron 应用进程、隔离 userData/HOME；mock 上游由探针自建。
// 探针逐分钟输出 NF_LONG_SESSION_SAMPLE，运行器边读边整理趋势；原始 JSONL 只写 .scratch/。

const { spawn, execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync, appendFileSync, existsSync } = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const { resolveElectronBin, electronCommand, displayMode } = require('./electron-bin.cjs')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const electronBin = resolveElectronBin(repoRoot)
const harness = path.join(__dirname, 'long-session.cjs')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = {
    minutes: 30,
    sampleMs: 60000,
    turnMs: 60000,
    chunks: 60,
    chunkChars: 120,
    chunkDelayMs: 5,
    timeoutMs: null,
    out: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--minutes') opts.minutes = Number(argv[++i])
    else if (a === '--sample-ms') opts.sampleMs = Number(argv[++i])
    else if (a === '--turn-ms') opts.turnMs = Number(argv[++i])
    else if (a === '--chunks') opts.chunks = Number(argv[++i])
    else if (a === '--chunk-chars') opts.chunkChars = Number(argv[++i])
    else if (a === '--chunk-delay-ms') opts.chunkDelayMs = Number(argv[++i])
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else throw new Error(`unknown arg ${a}`)
  }
  // 默认超时 = 目标时长 + 10 分钟收尾余量。
  opts.timeoutMs = opts.timeoutMs || opts.minutes * 60_000 + 10 * 60_000
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

function quantile(values, q) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]
}

function summarize(samples) {
  const rows = samples.filter(Boolean)
  const byField = (fn) => rows.map(fn).filter((v) => typeof v === 'number')
  const series = {
    workingSetMB: byField((s) => s.memory.totalWorkingSetKB / 1024),
    pssMB: byField((s) => s.memory.totalPssKB / 1024),
    rendererHeapMB: byField((s) => (s.renderer.heap ? s.renderer.heap.used / 1048576 : null)),
    mainRssMB: byField((s) => s.memory.mainRssBytes / 1048576),
    textChars: byField((s) => s.renderer.session.textChars),
    localStorageKB: byField((s) => s.renderer.session.localStorageBytes / 1024),
    mainLagP95: byField((s) => s.lag.main.p95),
    rendererLagP95: byField((s) => s.lag.renderer.p95),
    tabPssMB: byField((s) => (s.memory.byType?.Tab?.pssKB ?? null) / 1024),
    browserPssMB: byField((s) => (s.memory.byType?.Browser?.pssKB ?? null) / 1024),
    utilityPssMB: byField((s) => (s.memory.byType?.Utility?.pssKB ?? null) / 1024),
    gpuPssMB: byField((s) => (s.memory.byType?.GPU?.pssKB ?? null) / 1024),
    minutes: byField((s) => s.minute),
    turns: byField((s) => s.turns),
  }
  const first = (arr) => (arr.length ? arr[0] : null)
  const last = (arr) => (arr.length ? arr[arr.length - 1] : null)
  return {
    samples: rows.length,
    durationMinutes: last(series.minutes),
    turns: last(series.turns),
    first: {
      workingSetMB: first(series.workingSetMB),
      pssMB: first(series.pssMB),
      rendererHeapMB: first(series.rendererHeapMB),
      mainRssMB: first(series.mainRssMB),
      tabPssMB: first(series.tabPssMB),
      browserPssMB: first(series.browserPssMB),
      utilityPssMB: first(series.utilityPssMB),
      gpuPssMB: first(series.gpuPssMB),
    },
    last: {
      workingSetMB: last(series.workingSetMB),
      pssMB: last(series.pssMB),
      rendererHeapMB: last(series.rendererHeapMB),
      mainRssMB: last(series.mainRssMB),
      tabPssMB: last(series.tabPssMB),
      browserPssMB: last(series.browserPssMB),
      utilityPssMB: last(series.utilityPssMB),
      gpuPssMB: last(series.gpuPssMB),
    },
    growth: {
      workingSetMB: last(series.workingSetMB) - first(series.workingSetMB),
      pssMB: last(series.pssMB) - first(series.pssMB),
      rendererHeapMB: last(series.rendererHeapMB) - first(series.rendererHeapMB),
      mainRssMB: last(series.mainRssMB) - first(series.mainRssMB),
      tabPssMB: last(series.tabPssMB) - first(series.tabPssMB),
      browserPssMB: last(series.browserPssMB) - first(series.browserPssMB),
      utilityPssMB: last(series.utilityPssMB) - first(series.utilityPssMB),
      gpuPssMB: last(series.gpuPssMB) - first(series.gpuPssMB),
    },
    max: {
      workingSetMB: series.workingSetMB.length ? Math.max(...series.workingSetMB) : null,
      pssMB: series.pssMB.length ? Math.max(...series.pssMB) : null,
      rendererHeapMB: series.rendererHeapMB.length ? Math.max(...series.rendererHeapMB) : null,
      mainRssMB: series.mainRssMB.length ? Math.max(...series.mainRssMB) : null,
      tabPssMB: series.tabPssMB.length ? Math.max(...series.tabPssMB) : null,
      browserPssMB: series.browserPssMB.length ? Math.max(...series.browserPssMB) : null,
      utilityPssMB: series.utilityPssMB.length ? Math.max(...series.utilityPssMB) : null,
      gpuPssMB: series.gpuPssMB.length ? Math.max(...series.gpuPssMB) : null,
    },
    lag: {
      mainP95: quantile(series.mainLagP95, 0.95),
      rendererP95: quantile(series.rendererLagP95, 0.95),
      mainMax: series.mainLagP95.length ? Math.max(...series.mainLagP95) : null,
      rendererMax: series.rendererLagP95.length ? Math.max(...series.rendererLagP95) : null,
    },
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(electronBin)) throw new Error(`electron binary missing: ${electronBin}`)
  if (!existsSync(path.join(desktopDir, 'dist/main/main.js'))) {
    throw new Error('apps/desktop/dist/main/main.js missing; run `npm run build` in apps/desktop')
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath =
    opts.out || path.join(scratchDir, `long-session-${opts.minutes}min-${stamp}.jsonl`)
  mkdirSync(path.dirname(outPath), { recursive: true })
  const g = gitInfo()
  const runDir = path.join(scratchDir, `long-session-run-${stamp}`)
  mkdirSync(runDir, { recursive: true })
  mkdirSync(path.join(runDir, 'userdata'), { recursive: true })
  mkdirSync(shortDir('nf-perf-tmp', runDir), { recursive: true })

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
    },
    options: opts,
  }
  appendFileSync(outPath, JSON.stringify(meta) + '\n')

  const env = {
    ...sanitizedEnv(runDir),
    NF_LONG_SESSION_MINUTES: String(opts.minutes),
    NF_LONG_SESSION_SAMPLE_MS: String(opts.sampleMs),
    NF_LONG_SESSION_TURN_MS: String(opts.turnMs),
    NF_LONG_SESSION_CHUNKS: String(opts.chunks),
    NF_LONG_SESSION_CHUNK_CHARS: String(opts.chunkChars),
    NF_LONG_SESSION_CHUNK_DELAY_MS: String(opts.chunkDelayMs),
  }
  const args = [...electronCommand(electronBin), harness]
  const started = Date.now()
  const samples = []
  let turnError = null

  await new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      env,
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
    let stdoutBuffer = ''
    const handleLine = (line) => {
      if (line.startsWith('NF_LONG_SESSION_SAMPLE ')) {
        try {
          const sample = JSON.parse(line.slice('NF_LONG_SESSION_SAMPLE '.length))
          samples.push(sample)
          appendFileSync(outPath, JSON.stringify({ type: 'sample', ...sample }) + '\n')
          console.log(
            `min ${sample.minute}: turns=${sample.turns} ` +
              `ws=${Math.round(sample.memory.totalWorkingSetKB / 1024)}MB ` +
              `pss=${Math.round(sample.memory.totalPssKB / 1024)}MB ` +
              `heap=${sample.renderer.heap ? Math.round(sample.renderer.heap.used / 1048576) : 'n/a'}MB ` +
              `mainLag p95=${sample.lag.main.p95?.toFixed?.(1) ?? 'n/a'}`,
          )
        } catch {
          /* 坏行忽略 */
        }
      } else if (line.startsWith('NF_LONG_SESSION_RESULT ')) {
        try {
          turnError = JSON.parse(line.slice('NF_LONG_SESSION_RESULT '.length))
          appendFileSync(outPath, JSON.stringify({ type: 'result', ...turnError }) + '\n')
        } catch {
          /* 忽略 */
        }
      } else if (line.trim().startsWith('FATAL')) {
        stderr += line + '\n'
      }
    }
    child.stdout.on('data', (d) => {
      stdoutBuffer += d.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) handleLine(line)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 100000) stderr = stderr.slice(-50000)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      // 冲刷 stdout 缓冲里最后一条没有换行结尾的行（否则最终 RESULT 行会丢）。
      if (stdoutBuffer.length) {
        handleLine(stdoutBuffer)
        stdoutBuffer = ''
      }
      const summary = {
        type: 'summary',
        timestamp: new Date().toISOString(),
        git: g,
        options: opts,
        wallMs: Date.now() - started,
        exitCode: code,
        signal,
        timedOut,
        resultOk: turnError ? turnError.ok : null,
        resultError: turnError ? turnError.error || null : null,
        resultFailures: turnError ? turnError.failures || [] : [],
        actualMs: turnError ? turnError.actualMs : null,
        ...summarize(samples),
        stderrTail: stderr.slice(-2000),
      }
      writeFileSync(outPath.replace(/\.jsonl$/, '-summary.json'), JSON.stringify(summary, null, 2))
      appendFileSync(outPath, JSON.stringify(summary) + '\n')
      console.log(JSON.stringify(summary, null, 2))
      resolve()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      console.error(String(err))
      resolve()
    })
  })
  return outPath
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e))
  process.exit(1)
})
