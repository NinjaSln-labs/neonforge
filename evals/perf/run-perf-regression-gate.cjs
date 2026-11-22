// 性能回归门（初版）：串行运行已有 mock 基线探针，按平台阈值判定。
//
// 只测量，不改产品代码；全部场景使用假 Key / 本地 mock / 真实网络关闭，
// 子进程环境在启动前剔除凭据类变量。阈值是回归上限，不是 SLO 或承诺值。
//
// 用法（仓库根）：
//   node evals/perf/run-perf-regression-gate.cjs
//   node evals/perf/run-perf-regression-gate.cjs --only startup,tools
//   node evals/perf/run-perf-regression-gate.cjs --dry-run
//   node evals/perf/run-perf-regression-gate.cjs --host darwin
//
// 退出码：0 = 全部通过；1 = 有指标超限或检查运行失败；2 = 参数/环境错误。

const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const scratchDir = path.join(repoRoot, '.scratch/evals/perf')

function parseArgs(argv) {
  const opts = {
    host: process.platform === 'darwin' ? 'darwin' : 'linux',
    only: null,
    dryRun: false,
    outDir: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--host') opts.host = argv[++i]
    else if (a === '--only') opts.only = argv[++i]
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--out-dir') opts.outDir = argv[++i]
    else throw new Error(`unknown arg ${a}`)
  }
  if (!['linux', 'darwin'].includes(opts.host)) throw new Error(`unknown host ${opts.host}`)
  return opts
}

function sanitizedEnv() {
  const keep = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MAGPIE|OPENAI|ANTHROPIC)/i.test(key)) continue
    keep[key] = value
  }
  return keep
}

function getPath(obj, dotted) {
  let cur = obj
  for (const part of dotted.split('.')) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

function fmt(value) {
  if (value == null) return 'null'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1)
  return String(value)
}

// 阈值来自 2026-11-22/23 基线，留约 2–4 倍余量；只在同平台同探针形状下使用。
const CHECKS = [
  {
    id: 'startup',
    title: '冷启动与空载内存',
    runner: 'run-startup-benchmark.cjs',
    args: ['--cold', '3', '--warm', '2', '--timeout-ms', '45000'],
    metrics: [
      { key: 'startup.cold.ok', path: 'cold.ok', equals: 3 },
      { key: 'startup.warm.ok', path: 'warm.ok', equals: 2 },
      {
        path: 'cold.readyScreenMsP95',
        max: { linux: 2000, darwin: 4000 },
      },
      {
        key: 'startup.cold.totalWorkingSetMBMedian',
        path: 'cold.totalWorkingSetMBMedian',
        max: { linux: 900, darwin: 700 },
      },
      {
        path: 'cold.totalPssMBP95',
        max: { linux: 600 },
        allowNull: true, // macOS 无 PSS
      },
    ],
  },
  {
    id: 'tools',
    title: '主进程 ToolRegistry',
    runner: 'run-tool-benchmark.cjs',
    args: ['--runs', '1', '--iterations', '20', '--warmup', '3', '--timeout-ms', '180000'],
    metrics: [
      { key: 'tools.ok', path: 'ok', equals: 1 },
      ...['read', 'search', 'write', 'edit', 'bash'].flatMap((name) => [
        {
          key: `tools.${name}.p95`,
          path: `tools.${name}.p95`,
          max: {
            linux: { read: 40, search: 40, write: 100, edit: 100, bash: 50 }[name],
            darwin: { read: 300, search: 300, write: 800, edit: 800, bash: 300 }[name],
          },
        },
        { key: `tools.${name}.failureCount`, path: `tools.${name}.failureCount`, equals: 0 },
      ]),
    ],
  },
  {
    id: 'first-token',
    title: 'mock 上游首 token 与渲染器可见正文',
    runner: 'run-first-token-benchmark.cjs',
    args: [
      '--mode',
      'mock',
      '--delay-ms',
      '0',
      '--runs',
      '3',
      '--iterations',
      '5',
      '--warmup',
      '1',
      '--timeout-ms',
      '45000',
    ],
    metrics: [
      { key: 'first-token.ok', path: 'ok', equals: 3 },
      { key: 'first-token.failureCount', path: 'failureCount', equals: 0 },
      {
        key: 'gate.firstToken.gatewayP95',
        path: 'firstAnyDelta.p95',
        max: { linux: 100, darwin: 300 },
      },
      {
        key: 'gate.firstToken.rendererP95',
        path: 'renderer.p95',
        max: { linux: 1000, darwin: 2500 },
      },
    ],
  },
]

function readSummary(outPath) {
  if (!existsSync(outPath)) return null
  const lines = readFileSync(outPath, 'utf8').split('\n')
  let summary = null
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row.type === 'summary') summary = row
    } catch {
      /* 坏行忽略，探针自身会报错 */
    }
  }
  return summary
}

function evaluateMetric(metric, summary, host) {
  const actual = getPath(summary, metric.path)
  const base = { key: metric.key || metric.path, path: metric.path, actual }
  if (actual == null) {
    if (metric.allowNull && host === 'darwin') {
      return { ...base, status: 'skip', limit: 'n/a（平台不提供）' }
    }
    return { ...base, status: 'fail', limit: 'missing', reason: '指标缺失' }
  }
  if (metric.equals !== undefined) {
    return {
      ...base,
      limit: `== ${metric.equals}`,
      status: actual === metric.equals ? 'pass' : 'fail',
    }
  }
  const limit = metric.max[host]
  if (limit == null) return { ...base, status: 'skip', limit: 'n/a（平台无阈值）' }
  return { ...base, limit: `<= ${limit}`, status: actual <= limit ? 'pass' : 'fail' }
}

function runCheck(check, host, outDir) {
  const outPath = path.join(outDir, `${check.id}.jsonl`)
  const args = [path.join(__dirname, check.runner), ...check.args, '--out', outPath]
  const started = Date.now()
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: sanitizedEnv(),
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const wallMs = Date.now() - started
  const stdoutTail = (result.stdout || '').trim().split('\n').slice(-4).join('\n')
  const stderrTail = (result.stderr || '').trim().split('\n').slice(-4).join('\n')
  if (result.error || result.status !== 0) {
    return {
      id: check.id,
      title: check.title,
      outPath,
      wallMs,
      passed: false,
      error:
        (result.error && String(result.error)) ||
        `runner exited ${result.status == null ? 'null' : result.status}`,
      stdoutTail,
      stderrTail,
      metrics: [],
    }
  }
  const summary = readSummary(outPath)
  if (!summary) {
    return {
      id: check.id,
      title: check.title,
      outPath,
      wallMs,
      passed: false,
      error: 'summary missing',
      stdoutTail,
      stderrTail,
      metrics: [],
    }
  }
  const metrics = check.metrics.map((m) => evaluateMetric(m, summary, host))
  return {
    id: check.id,
    title: check.title,
    outPath,
    wallMs,
    passed: metrics.every((m) => m.status !== 'fail'),
    metrics,
  }
}

function printCheck(row) {
  console.log(`\n[${row.id}] ${row.title}（${Math.round(row.wallMs / 1000)} s）`)
  if (row.error) {
    console.log(`  FAIL 运行失败：${row.error}`)
    if (row.stderrTail) console.log(`  stderr: ${row.stderrTail.split('\n').slice(-1)[0]}`)
    return
  }
  for (const m of row.metrics) {
    const tag = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }[m.status]
    console.log(`  ${tag} ${m.key.padEnd(38)} ${fmt(m.actual).padStart(6)}  ${m.limit}`)
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const selected = opts.only ? CHECKS.filter((c) => opts.only.split(',').includes(c.id)) : CHECKS
  if (!selected.length) throw new Error(`no checks matched --only ${opts.only}`)
  if (!existsSync(path.join(repoRoot, 'apps/desktop/dist/main/main.js'))) {
    throw new Error('apps/desktop/dist/main/main.js missing; run `npm run build` in apps/desktop')
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = opts.outDir || path.join(scratchDir, `perf-gate-${stamp}`)
  mkdirSync(outDir, { recursive: true })

  if (opts.dryRun) {
    for (const check of selected) {
      const args = [path.join(__dirname, check.runner), ...check.args]
      console.log(`node ${path.relative(repoRoot, args[0])} ${args.slice(1).join(' ')}`)
    }
    return 0
  }

  console.log(
    `性能回归门 host=${opts.host} platform=${os.platform()} checks=${selected.map((c) => c.id).join(',')}`,
  )
  const rows = selected.map((check) => runCheck(check, opts.host, outDir))
  for (const row of rows) printCheck(row)

  const report = {
    type: 'perf-regression-gate',
    timestamp: new Date().toISOString(),
    host: opts.host,
    platform: os.platform(),
    release: os.release(),
    cpuModel: (os.cpus()[0] || {}).model || null,
    checks: rows,
    passed: rows.every((r) => r.passed),
    failedChecks: rows.filter((r) => !r.passed).map((r) => r.id),
    outDir,
  }
  const reportPath = path.join(outDir, 'report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(
    `\nGATE ${report.passed ? 'PASS' : 'FAIL'} checks=${rows.length} failed=${report.failedChecks.length} report=${reportPath}`,
  )
  return report.passed ? 0 : 1
}

try {
  process.exit(main())
} catch (e) {
  console.error(String(e && e.stack ? e.stack : e))
  process.exit(2)
}
