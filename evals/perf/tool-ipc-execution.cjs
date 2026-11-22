// 端到端工具执行探针（渲染器 → preload → IPC → ToolRegistry）。
// 仅测量，不改产品代码；输出一行 NF_TOOL_IPC_RESULT JSON。

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app } = require('electron')

const t0 = process.hrtime.bigint()
const startedAt = Date.now()
const phases = {}
let finished = false
let win = null
let toolsMod = null

function msSinceStart() {
  return Number(process.hrtime.bigint() - t0) / 1e6
}

function mark(name) {
  if (phases[name] === undefined) phases[name] = msSinceStart()
}

function emit(result) {
  if (finished) return
  finished = true
  process.stdout.write('NF_TOOL_IPC_RESULT ' + JSON.stringify(result) + '\n')
  try {
    if (toolsMod && typeof toolsMod.killAllSubprocesses === 'function')
      toolsMod.killAllSubprocesses()
  } catch {
    /* cleanup failure must not hide the measurement */
  }
  setImmediate(() => app.quit())
}

function fail(err) {
  emit({
    ok: false,
    error: String(err && err.stack ? err.stack : err),
    phases,
    durationMs: msSinceStart(),
  })
}

const fixtureDir = process.env.NF_PERF_FIXTURE_DIR
const iterations = Number(process.env.NF_PERF_ITERATIONS || '30')
const warmup = Number(process.env.NF_PERF_WARMUP || '3')

if (!fixtureDir) fail(new Error('NF_PERF_FIXTURE_DIR missing'))
if (!process.env.NF_TEST_USERDATA) fail(new Error('NF_TEST_USERDATA missing'))

if (!finished) {
  process.env.NEONFORGE_API_KEY = process.env.NEONFORGE_API_KEY || 'dummy-not-a-key'
  process.env.NEONFORGE_API_KEY_FILE = ''
  process.env.NEONFORGE_SEARCH_KEY_FILE = ''
  process.env.NEONFORGE_KEENABLE_API_KEY_FILE = ''
  process.env.NF_DEBUG = ''
  const electronMain = path.resolve(__dirname, '../../apps/desktop/dist/main/main.js')
  import(pathToFileURL(electronMain).href).catch(fail)
}

app.on('browser-window-created', (_event, created) => {
  if (win) return
  win = created
  mark('window_created')
  created.webContents.once('did-finish-load', () => {
    mark('did_finish_load')
    void run(created.webContents)
  })
  created.webContents.once('did-fail-load', (_e, code, desc, url) => {
    fail(new Error(`did-fail-load ${code} ${desc} ${url}`))
  })
})

function createFixture() {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
  fs.mkdirSync(fixtureDir, { recursive: true })
  const lines = []
  for (let i = 0; i < 120; i++) lines.push(`line ${i}: alpha beta gamma`)
  fs.writeFileSync(path.join(fixtureDir, 'readme.md'), lines.join('\n') + '\n')
  fs.writeFileSync(path.join(fixtureDir, 'edit-target.txt'), 'alpha\nbeta\ngamma\n')
  fs.writeFileSync(path.join(fixtureDir, 'search-target.txt'), lines.join('\n') + '\n')
}

async function run(wc) {
  try {
    // 等启动页出现，确保渲染器已订阅/挂载 bridge。
    await wc.executeJavaScript(
      `new Promise((resolve, reject) => {
        const deadline = performance.now() + 15000;
        const tick = () => {
          if (document.querySelector('.nf-start')) return resolve(true);
          if (performance.now() > deadline) return reject(new Error('start screen not ready'));
          setTimeout(tick, 10);
        };
        tick();
      })`,
      true,
    )
    mark('ready_screen')
    createFixture()

    // 让主进程侧也加载 tools.js，便于退出时清理 bash 子进程。
    toolsMod = await import(
      pathToFileURL(path.resolve(__dirname, '../../apps/desktop/dist/main/tools.js')).href
    )

    const script = `(async () => {
      const fixtureDir = ${JSON.stringify(fixtureDir)};
      const iterations = ${iterations};
      const warmup = ${warmup};
      const bridge = window.neonforge;
      if (!bridge || !bridge.tools || typeof bridge.tools.execute !== 'function') {
        throw new Error('window.neonforge.tools.execute missing');
      }
      const opts = {
        rootPath: fixtureDir,
        approved: true,
        approvalSource: 'user',
        sessionId: 'nf-perf-tool-ipc',
      };
      const quantile = (values, q) => {
        if (!values.length) return null;
        const s = [...values].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
      };
      const describe = (data) => {
        if (data === null || data === undefined) return null;
        if (typeof data === 'string') return { type: 'string', chars: data.length, preview: data.slice(0, 160) };
        if (Array.isArray(data)) return { type: 'array', length: data.length, preview: JSON.stringify(data.slice(0, 3)).slice(0, 300) };
        if (typeof data === 'object') {
          let json = '';
          try { json = JSON.stringify(data); } catch { json = '[unserializable]'; }
          return { type: 'object', keys: Object.keys(data).slice(0, 12), preview: json.slice(0, 300) };
        }
        return { type: typeof data, preview: String(data).slice(0, 160) };
      };
      const bench = async (name, makeArgs) => {
        const samples = [];
        const failures = [];
        let editState = 0;
        let firstData;
        const runOne = async (i, measured) => {
          const args = makeArgs(i, () => editState);
          const s = performance.now();
          const result = await bridge.tools.execute(name, args, opts);
          const elapsed = performance.now() - s;
          if (!result || !result.ok) {
            failures.push({
              i,
              error: (result && result.error) || 'unknown',
              policy: result && result.policy,
              needApproval: result && result.needApproval,
            });
            return;
          }
          if (measured) samples.push(elapsed);
          if (measured && firstData === undefined) firstData = result.data;
          if (name === 'edit') editState = 1 - editState;
        };
        for (let i = 0; i < warmup; i++) await runOne(i, false);
        for (let i = 0; i < iterations; i++) await runOne(i, true);
        return {
          n: samples.length,
          failures: failures.slice(0, 5),
          failureCount: failures.length,
          p50: quantile(samples, 0.5),
          p95: quantile(samples, 0.95),
          min: samples.length ? Math.min(...samples) : null,
          max: samples.length ? Math.max(...samples) : null,
          samples,
          validation: describe(firstData),
        };
      };
      const tools = {};
      tools.read = await bench('read', () => ({ path: 'readme.md' }));
      // search 在 write/edit 之前，避免 .nf-bak 污染检索 fixture。
      tools.search = await bench('search', () => ({ query: 'alpha' }));
      tools.write = await bench('write', (i) => ({ path: 'write-target.txt', content: 'value-' + i + '\\n' }));
      tools.edit = await bench('edit', (_i, getState) => getState() === 0
        ? { path: 'edit-target.txt', old: 'beta', new: 'beta2' }
        : { path: 'edit-target.txt', old: 'beta2', new: 'beta' });
      tools.bash = await bench('bash', () => ({ command: "printf 'perf-ok\\\\n'" }));
      return {
        tools,
        rendererHeap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
        screen: document.querySelector('.nf-start') ? 'start' : 'other',
      };
    })()`

    const renderer = await wc.executeJavaScript(script, true)
    mark('tools_done')
    if (toolsMod && typeof toolsMod.killAllSubprocesses === 'function')
      toolsMod.killAllSubprocesses()
    const mem = process.memoryUsage()
    let mainPssKB = null
    try {
      const text = fs.readFileSync(`/proc/${process.pid}/smaps_rollup`, 'utf8')
      mainPssKB = Number(text.match(/^Pss:\s+(\d+)\s+kB/m)?.[1] || 0)
    } catch {
      /* non-linux */
    }

    emit({
      ok: true,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      startedAt,
      durationMs: msSinceStart(),
      iterations,
      warmup,
      fixtureDir,
      phases,
      renderer,
      memory: { mainRssBytes: mem.rss, mainHeapUsedBytes: mem.heapUsed, mainPssKB },
    })
  } catch (err) {
    fail(err)
  }
}

setTimeout(() => {
  if (!finished) fail(new Error('timeout: IPC tool benchmark did not finish within 120s'))
}, 120000).unref()
