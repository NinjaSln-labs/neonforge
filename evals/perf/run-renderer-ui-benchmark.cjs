// 渲染器 UI 性能基准运行器（mock bridge、脚本化批准；非人类数据）。
// 用法（仓库根）：
//   node evals/perf/run-renderer-ui-benchmark.cjs --cycles 20 [--out .scratch/...]
//
// 通过 apps/desktop/playwright.perf.config.ts 启动 Vite + Chromium；
// 测试输出 NF_RENDERER_UI_RESULT JSON，原始样本写入 .scratch/evals/perf/。

const { spawn, execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const playwrightBin = path.join(desktopDir, 'node_modules/.bin/playwright')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = { cycles: 20, timeoutMs: 240000, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--cycles') opts.cycles = Number(argv[++i])
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
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

function sanitizedEnv(extra) {
  const keep = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MAGPIE|OPENAI|ANTHROPIC)/i.test(key)) continue
    keep[key] = value
  }
  return { ...keep, ...extra }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(playwrightBin)) throw new Error(`playwright binary missing: ${playwrightBin}`)
  if (!existsSync(path.join(desktopDir, 'playwright.perf.config.ts'))) {
    throw new Error('apps/desktop/playwright.perf.config.ts missing')
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = opts.out || path.join(scratchDir, `renderer-ui-${stamp}.json`)
  mkdirSync(path.dirname(outPath), { recursive: true })
  const meta = {
    type: 'meta',
    timestamp: new Date().toISOString(),
    mode: 'mock-renderer-scripted-approval',
    human: false,
    git: gitInfo(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      kernel: os.release(),
      cpuModel: (os.cpus()[0] || {}).model || null,
      cpuCount: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1048576),
      loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
    },
    options: { ...opts, outPath },
  }
  const jsonlPath = outPath.replace(/\.json$/, '.jsonl')
  appendFileSync(jsonlPath, JSON.stringify(meta) + '\n')

  const started = Date.now()
  const result = await new Promise((resolve) => {
    const child = spawn(playwrightBin, ['test', '--config', 'playwright.perf.config.ts'], {
      cwd: desktopDir,
      env: sanitizedEnv({ NF_PERF_OUT: outPath, NF_PERF_CYCLES: String(opts.cycles) }),
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
      if (stdout.length > 300000) stdout = stdout.slice(-150000)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 100000) stderr = stderr.slice(-50000)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({
        exitCode: code,
        signal,
        timedOut,
        wallMs: Date.now() - started,
        stdout,
        stderr,
      })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        exitCode: null,
        signal: null,
        timedOut,
        wallMs: Date.now() - started,
        error: String(err),
      })
    })
  })

  let parsed = null
  if (existsSync(outPath)) {
    try {
      parsed = JSON.parse(readFileSync(outPath, 'utf8'))
    } catch (err) {
      parsed = { parseError: String(err) }
    }
  }
  const lineMatch = result.stdout
    ? result.stdout
        .split('\n')
        .filter((l) => l.startsWith('NF_RENDERER_UI_RESULT '))
        .pop()
    : null
  if (!parsed && lineMatch) {
    try {
      parsed = JSON.parse(lineMatch.slice('NF_RENDERER_UI_RESULT '.length))
    } catch {}
  }

  const row = {
    type: 'run',
    timestamp: new Date().toISOString(),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    wallMs: result.wallMs,
    result: parsed,
    error: result.error || null,
    stderrTail: parsed ? null : (result.stderr || '').slice(-3000),
    stdoutTail: parsed ? null : (result.stdout || '').slice(-4000),
  }
  appendFileSync(jsonlPath, JSON.stringify(row) + '\n')

  if (!parsed || parsed.parseError || !parsed.cycles) {
    console.error('NO_RESULT')
    if (row.stderrTail) console.error(row.stderrTail)
    if (row.stdoutTail) console.error(row.stdoutTail)
    process.exit(1)
  }

  const summary = {
    type: 'summary',
    timestamp: new Date().toISOString(),
    git: meta.git,
    mode: parsed.mode,
    human: false,
    cycles: parsed.cycles,
    cardAppearanceMs: parsed.cardAppearanceMs,
    approvalRoundtripMs: parsed.approvalRoundtripMs,
    outPath,
    jsonlPath,
  }
  appendFileSync(jsonlPath, JSON.stringify(summary) + '\n')
  writeFileSync(
    path.join(scratchDir, 'latest-renderer-ui-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  console.log('SUMMARY ' + JSON.stringify(summary))
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err))
  process.exit(1)
})
