// 产品级任务成功运行器（仅测量，不改产品代码）。
//
// 用法（仓库根）：
//   node evals/product/run-task-success.cjs
//   node evals/product/run-task-success.cjs --tasks write-single,script-bash
//   node evals/product/run-task-success.cjs --repeat 3
//
// 每个任务 = 一个独立 Electron 应用进程、隔离 HOME/userData；本地 mock 模型按固定剧本
// 驱动真实产品流程。结果是产品编排成功率（非模型能力、非人类研究）。

const { spawn, execFileSync } = require('node:child_process')
const { appendFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const { resolveElectronBin, electronCommand, displayMode } = require('../perf/electron-bin.cjs')
const { TASKS } = require('./task-suite.cjs')

const repoRoot = path.resolve(__dirname, '../..')
const desktopDir = path.join(repoRoot, 'apps/desktop')
const electronBin = resolveElectronBin(repoRoot)
const harness = path.join(__dirname, 'task-success.cjs')
const scratchDir = path.join(repoRoot, '.scratch/evals/product')

function parseArgs(argv) {
  const opts = {
    tasks: null,
    repeat: 1,
    timeoutMs: 180000,
    mode: 'mock',
    out: null,
    trustMode: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tasks') opts.tasks = argv[++i]
    else if (a === '--mode') opts.mode = argv[++i]
    else if (a === '--repeat') opts.repeat = Number(argv[++i])
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--trust-mode') opts.trustMode = argv[++i]
    else throw new Error(`unknown arg ${a}`)
  }
  if (opts.tasks) {
    const ids = opts.tasks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const unknown = ids.filter((id) => !TASKS.some((t) => t.id === id))
    if (unknown.length > 0) throw new Error(`unknown tasks: ${unknown.join(',')}`)
    opts.tasks = ids
  }
  if (!['mock', 'real'].includes(opts.mode)) throw new Error(`unknown mode ${opts.mode}`)
  if (opts.trustMode && !['strict', 'standard', 'delegated'].includes(opts.trustMode))
    throw new Error(`unknown trust mode ${opts.trustMode}`)
  opts.repeat = Math.max(1, opts.repeat)
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
    TMPDIR: shortDir('nf-task-tmp', runDir),
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

async function runOneTask(task, opts, stamp, outPath) {
  const runDir = path.join(scratchDir, `task-run-${stamp}`, task.id)
  mkdirSync(path.join(runDir, 'userdata'), { recursive: true })
  mkdirSync(shortDir('nf-task-tmp', runDir), { recursive: true })
  const realKey = opts.mode === 'real' ? process.env.MAGPIE_GATEWAY_KEY : null
  if (opts.mode === 'real' && !realKey) throw new Error('MAGPIE_GATEWAY_KEY missing for real mode')
  const env = {
    ...sanitizedEnv(runDir),
    NF_TASK_SUCCESS_TASK: task.id,
    NF_TASK_SUCCESS_TIMEOUT_MS: String(opts.timeoutMs),
  }
  if (opts.trustMode) env.NF_TASK_SUCCESS_TRUST_MODE = opts.trustMode
  if (task.trustMode) env.NF_TASK_SUCCESS_TRUST_MODE = task.trustMode
  if (opts.mode === 'real') {
    env.NEONFORGE_API_KEY = realKey
    env.NF_TASK_SUCCESS_REAL = '1'
    env.NF_TASK_SUCCESS_MODEL =
      process.env.NF_TASK_SUCCESS_MODEL || 'opendesign/deepseek-v4.1-flash-eco'
    env.NF_TASK_SUCCESS_BASE_URL =
      process.env.NF_TASK_SUCCESS_BASE_URL || 'http://127.0.0.1:3425/v1'
  }
  const args = [...electronCommand(electronBin), harness]
  const started = Date.now()
  let result = null
  let stderr = ''
  let stdoutBuffer = ''
  const child = spawn(args[0], args.slice(1), {
    env,
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const timer = setTimeout(() => {
    try {
      child.kill('SIGTERM')
    } catch {}
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
    }, 3000).unref()
  }, opts.timeoutMs + 30000)

  const handleLine = (line) => {
    if (!line.startsWith('NF_TASK_SUCCESS_RESULT ')) return
    try {
      result = JSON.parse(line.slice('NF_TASK_SUCCESS_RESULT '.length))
    } catch {
      /* 坏行忽略 */
    }
  }

  await new Promise((resolve) => {
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
    child.on('error', (err) => {
      stderr += String(err)
      resolve()
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (stdoutBuffer.length) handleLine(stdoutBuffer)
      result = result || {
        ok: false,
        error: `probe produced no result (exit=${code}, signal=${signal})`,
        human: false,
      }
      resolve()
    })
  })

  const wallMs = Date.now() - started
  const row = {
    type: 'task',
    task: { id: task.id, title: task.title },
    runDir,
    wallMs,
    stderrTail: stderr.slice(-2000),
    ...result,
  }
  appendFileSync(outPath, JSON.stringify(row) + '\n')
  const status = row.ok ? 'PASS' : 'FAIL'
  const detail = row.error
    ? ` — ${String(row.error).split('\n')[0]}`
    : row.checks
      ? ` — ${row.checks.filter((c) => c.ok).length}/${row.checks.length} 检查`
      : ''
  console.log(`${status} ${task.id} (${Math.round(wallMs / 1000)} s)${detail}`)
  return row
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(electronBin)) throw new Error(`electron binary missing: ${electronBin}`)
  if (!existsSync(path.join(desktopDir, 'dist/main/main.js'))) {
    throw new Error('apps/desktop/dist/main/main.js missing; run `npm run build` in apps/desktop')
  }
  if (opts.mode === 'real') {
    if (!process.env.MAGPIE_GATEWAY_KEY) throw new Error('MAGPIE_GATEWAY_KEY missing for real mode')
    const base = process.env.NF_TASK_SUCCESS_BASE_URL || 'http://127.0.0.1:3425/v1'
    try {
      const res = await fetch(base.replace(/\/+$/, '') + '/models', {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`http-${res.status}`)
    } catch (e) {
      throw new Error(
        `local Magpie not reachable at ${base}: ${String(e && e.message ? e.message : e)}`,
      )
    }
  }
  mkdirSync(scratchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = opts.out || path.join(scratchDir, `task-success-${stamp}.jsonl`)
  mkdirSync(path.dirname(outPath), { recursive: true })
  const g = gitInfo()
  let selected = opts.tasks ? TASKS.filter((t) => opts.tasks.includes(t.id)) : TASKS
  const skipReason = (task) => {
    if (opts.mode === 'real' && task.mockOnly) {
      return 'mock-only 失败注入任务，真实模式不运行'
    }
    // 需要人工授权卡的任务在 delegated 模式语义不适用：计划内 write/edit 自动放行，卡不会出现。
    const effectiveMode = task.trustMode || opts.trustMode
    if (task.needsApprovalCard && effectiveMode === 'delegated') {
      return '需要授权卡任务，delegated 模式计划内 edit 自动放行（语义不适用）'
    }
    return null
  }
  const skippedTasks = selected
    .map((task) => ({ task, reason: skipReason(task) }))
    .filter((x) => x.reason)
  if (skippedTasks.length > 0) {
    selected = selected.filter((t) => !skipReason(t))
    for (const x of skippedTasks) console.log(`SKIP ${x.task.id} — ${x.reason}`)
  }
  if (selected.length === 0)
    throw new Error('没有可运行的任务：所选任务均被跳过（mock-only/delegated 语义）')
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
      display: displayMode(),
    },
    options: { ...opts, tasks: selected.map((t) => t.id) },
  }
  appendFileSync(outPath, JSON.stringify(meta) + '\n')

  const rows = []
  for (let rep = 1; rep <= opts.repeat; rep++) {
    console.log(`\n== 第 ${rep}/${opts.repeat} 轮 ==`)
    for (const task of selected) {
      rows.push(await runOneTask(task, opts, `${stamp}-r${rep}`, outPath))
    }
  }

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.length - passed
  const summary = {
    type: 'summary',
    timestamp: new Date().toISOString(),
    git: g,
    options: meta.options,
    runs: rows.length,
    tasks: selected.length,
    passed,
    failed,
    passRate: rows.length ? passed / rows.length : null,
    byTask: selected.map((task) => {
      const taskRows = rows.filter((r) => r.task.id === task.id)
      return {
        id: task.id,
        title: task.title,
        runs: taskRows.length,
        passed: taskRows.filter((r) => r.ok).length,
        stages: taskRows.map((r) => r.stages),
        errors: taskRows.filter((r) => !r.ok).map((r) => r.error),
      }
    }),
    outPath,
  }
  writeFileSync(outPath.replace(/\.jsonl$/, '-summary.json'), JSON.stringify(summary, null, 2))
  appendFileSync(outPath, JSON.stringify(summary) + '\n')
  console.log(
    `\nSUMMARY ${passed}/${rows.length} 通过（${failed} 失败）` +
      ` human=false ${opts.mode === 'real' ? 'real-model-product-flow' : 'mock-protocol-product-flow'}` +
      `\nout: ${outPath}`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e))
  process.exit(2)
})
