// Electron 启动性能探针（仅测量，不修改产品代码）。
// 由 run-startup-benchmark.cjs 启动；主进程入口仍是 apps/desktop/dist/main/main.js。
// 输出一行 NF_PERF_RESULT JSON 到 stdout，其余日志被运行器收集。

const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app } = require('electron')

const t0 = process.hrtime.bigint()
const startedAt = Date.now()
const uptimeAtHarnessEntryMs = process.uptime() * 1000
const phases = {}
let finished = false

function msSinceStart() {
  return Number(process.hrtime.bigint() - t0) / 1e6
}

function mark(name) {
  if (phases[name] === undefined) phases[name] = msSinceStart()
}

function emit(result) {
  if (finished) return
  finished = true
  const line = 'NF_PERF_RESULT ' + JSON.stringify(result)
  process.stdout.write(line + '\n')
  // app.quit() 走 before-quit 清理；超时由运行器兜底。
  setImmediate(() => app.quit())
}

function fail(err) {
  emit({
    ok: false,
    error: String(err && err.stack ? err.stack : err),
    phases,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    uptime_at_exit_ms: process.uptime() * 1000,
  })
}

const electronMain = path.resolve(__dirname, '../../apps/desktop/dist/main/main.js')
if (!process.env.NF_TEST_USERDATA) {
  process.env.NF_TEST_USERDATA = path.join(
    process.env.TMPDIR || '/tmp',
    'nf-perf-userdata-' + process.pid,
  )
}
// 假 Key：让 App 进入启动页；不读取、不写入任何真实凭据。
process.env.NEONFORGE_API_KEY = process.env.NEONFORGE_API_KEY || 'nf-perf-dummy-not-a-key'
process.env.NEONFORGE_API_KEY_FILE = ''
process.env.NEONFORGE_SEARCH_KEY_FILE = ''
process.env.NEONFORGE_KEENABLE_API_KEY_FILE = ''
process.env.NF_DEBUG = ''

mark('harness_entry')

app
  .whenReady()
  .then(() => mark('app_ready'))
  .catch(fail)

let win = null
app.on('browser-window-created', (_event, created) => {
  if (win) return
  win = created
  mark('window_created')
  const wc = created.webContents
  wc.once('did-start-loading', () => mark('did_start_loading'))
  wc.once('dom-ready', () => mark('dom_ready'))
  wc.once('did-finish-load', () => {
    mark('did_finish_load')
    void measure(created, wc)
  })
  created.once('ready-to-show', () => mark('ready_to_show'))
  created.once('show', () => mark('window_show'))
  wc.once('did-fail-load', (_e, code, desc, url) => {
    fail(new Error(`did-fail-load ${code} ${desc} ${url}`))
  })
})

async function waitForScreen(wc, timeoutMs) {
  return wc.executeJavaScript(
    `new Promise((resolve) => {
      const deadline = performance.now() + ${timeoutMs};
      const tick = () => {
        const start = document.querySelector('.nf-start');
        const config = document.querySelector('.nf-config');
        if (start) return resolve('start');
        if (config) return resolve('config');
        if (performance.now() > deadline) return resolve('none');
        setTimeout(tick, 10);
      };
      tick();
    })`,
    true,
  )
}

async function measure(window, wc) {
  try {
    const screen = await waitForScreen(wc, 15000)
    mark('ready_screen')

    // 两个 rAF：把首屏渲染与样式计算落定后再采样。
    await wc.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`,
      true,
    )
    mark('first_frames')

    const renderer = await wc.executeJavaScript(
      `(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const mem = performance.memory || null;
        return {
          nav: nav ? {
            domContentLoaded: nav.domContentLoadedEventEnd,
            loadEventEnd: nav.loadEventEnd,
            responseStart: nav.responseStart,
            duration: nav.duration,
          } : null,
          now: performance.now(),
          heap: mem ? {
            used: mem.usedJSHeapSize,
            total: mem.totalJSHeapSize,
            limit: mem.jsHeapSizeLimit,
          } : null,
          screen: document.querySelector('.nf-start') ? 'start' : (document.querySelector('.nf-config') ? 'config' : 'other'),
          appClass: document.querySelector('.nf-app') ? document.querySelector('.nf-app').className : null,
        };
      })()`,
      true,
    )

    const ipc = await wc.executeJavaScript(
      `(async () => {
        const bridge = window.neonforge;
        if (!bridge) return { error: 'window.neonforge missing' };
        const timed = async (name, fn, warm, n) => {
          for (let i = 0; i < warm; i++) await fn();
          const samples = [];
          for (let i = 0; i < n; i++) {
            const s = performance.now();
            await fn();
            samples.push(performance.now() - s);
          }
          samples.sort((a, b) => a - b);
          const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
          return {
            name,
            n,
            median: q(0.5),
            p95: q(0.95),
            min: samples[0],
            max: samples[samples.length - 1],
          };
        };
        const out = [];
        out.push(await timed('config.hasKey', () => bridge.config.hasKey(), 3, 30));
        out.push(await timed('budget.get', () => bridge.budget.get(), 3, 30));
        return { calls: out };
      })()`,
      true,
    )
    mark('ipc_bench')

    // 静置 600ms 后采样内存，避免加载期噪声。
    await new Promise((r) => setTimeout(r, 600))
    const mainMemory = process.memoryUsage()
    const metrics = await app.getAppMetrics()
    const byType = {}
    for (const m of metrics) {
      const t = m.type || 'unknown'
      byType[t] = byType[t] || { count: 0, workingSetKB: 0, cpuPercent: 0 }
      byType[t].count += 1
      byType[t].workingSetKB += (m.memory && m.memory.workingSetSize) || 0
      byType[t].cpuPercent += (m.cpu && m.cpu.percentCPUUsage) || 0
    }
    const totalWorkingSetKB = metrics.reduce(
      (sum, m) => sum + ((m.memory && m.memory.workingSetSize) || 0),
      0,
    )

    emit({
      ok: true,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      startedAt,
      durationToEmitMs: msSinceStart(),
      processUptimeAtHarnessEntryMs: uptimeAtHarnessEntryMs,
      phases,
      screen,
      renderer,
      ipc,
      memory: {
        mainRssBytes: mainMemory.rss,
        mainHeapUsedBytes: mainMemory.heapUsed,
        totalWorkingSetKB,
        byType,
      },
    })
  } catch (err) {
    fail(err)
  }
}

// 若应用没有创建窗口或加载未完成，最多 25 秒后失败退出。
setTimeout(() => {
  if (!finished) fail(new Error('timeout: no completed measurement within 25s'))
}, 25000).unref()

import(pathToFileURL(electronMain).href).catch(fail)
