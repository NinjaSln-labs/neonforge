// 主进程 IPC harness（2026-11-28 审计批次 14）：headless L1 下驱动真实 registerIpc 注册的
// 真实 handler（electron mock 的 ipcMain 捕获 handler 表），覆盖「主进程发点」事件：
//   usage.recorded / usage.budget_threshold_reached（gateway:stream-chat 的 onUsage 入账路径）
//   capability.ledger_updated / tool.failed（tools:execute → bash 失败归因）
//
// 设计要点：
// - electron mock 只提供 src/main 链实际用到的面；真实存储类（UsageStore/BudgetStore/
//   PriceStore/Timeline）落到隔离临时目录，走真实读写代码。
// - 网络：provider baseURL 是静态 descriptor——测试边界改写全局 fetch，只把 provider origin
//   重定向到本地回环 mock SSE 服务器（非目标 URL 原样透传），不触碰产品代码。
// - 凭据：NEONFORGE_API_KEY 只放占位值（mock 服务器不校验）；不入库、不打印。
import { createServer, type Server } from 'node:http'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const UD = '/tmp/nf-main-harness'
const REAL_ORIGIN = 'https://api.commandcode.ai'

// —— electron mock：registerIpc 及其依赖链用到的全部面 ——
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? UD : path.join(UD, name)),
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
  BrowserWindow: { getFocusedWindow: () => null, fromWebContents: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  Menu: { setApplicationMenu: () => {} },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
}))

// —— 回环 mock provider：GET /models → 500（gateway 走 fallback 上游名）；POST /chat/completions → SSE ——
const CHAT_SSE = [
  'data: {"choices":[{"delta":{"content":"ok"}}]}',
  'data: {"usage":{"prompt_tokens":100,"completion_tokens":20,"completion_tokens_details":{"reasoning_tokens":0},"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":100},"choices":[]}',
  'data: [DONE]',
  '',
]
let server: Server
let mockOrigin = ''
const received: Array<{ method: string; url: string; body: string }> = []

const realFetch = globalThis.fetch
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d.toString()))
    req.on('end', () => {
      received.push({ method: req.method ?? '', url: req.url ?? '', body })
      // provider baseURL 带前缀（…/provider/v1）——按后缀匹配
      if ((req.url ?? '').endsWith('/chat/completions')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(CHAT_SSE.join('\n'))
        res.end()
      } else {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{"error":"models unavailable"}')
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  mockOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  // 测试边界改写：仅把真实 provider origin 重定向到回环 mock（其余 URL 原样透传）
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const rewritten = url.startsWith(REAL_ORIGIN) ? mockOrigin + url.slice(REAL_ORIGIN.length) : url
    return realFetch(rewritten, init)
  }) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
  server.close()
})

beforeEach(() => {
  process.env.NEONFORGE_API_KEY = 'test-placeholder-key'
})

describe('主进程发点事件（headless IPC harness——真实 registerIpc handler）', () => {
  it('gateway:stream-chat onUsage → usage.recorded（tokens/cost）与 budget_threshold_reached（一次去重）', async () => {
    const { initTools } = await import('../../src/main/tools.js')
    const { registerIpc } = await import('../../src/main/ipc.js')
    const { setTimelineUserData, resetTimelineRuntimeState, timelineFile } =
      await import('../../src/main/timelineLogger.js')

    // 隔离目录（真实存储代码 + 时间线 Outbox）
    rmSync(UD, { recursive: true, force: true })
    mkdirSync(path.join(UD, 'config'), { recursive: true })
    mkdirSync(path.join(UD, 'logs'), { recursive: true })
    setTimelineUserData(UD)
    resetTimelineRuntimeState()

    // 月预算 0（任何花费 ≥ 0 即达阈值 → 事件必然触发）
    const budget = await import('../../src/main/budgetStore.instance.js')
    budget.getBudgetStore().save({ limitUsd: 0, pauseOnReach: false })
    // 价格表：100 in + 20 out → 精确成本可断言
    const price = await import('../../src/main/priceStore.instance.js')
    price.getPriceStore().save({
      version: 'harness-v1',
      models: {
        'commandcode:deepseek/deepseek-v4.1-flash': {
          promptPerMillion: 1,
          completionPerMillion: 2,
        },
      },
    })

    initTools()
    registerIpc()
    const handler = handlers.get('gateway:stream-chat')
    expect(handler).toBeTypeOf('function')

    const sent: Array<Record<string, unknown>> = []
    const event = {
      sender: { send: (_ch: string, payload: Record<string, unknown>) => sent.push(payload) },
    }
    const r = (await handler!(event, {
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'sess-usage-1',
    })) as { ok: boolean }
    expect(r.ok).toBe(true)
    // SSE 内容透传到 renderer
    expect(sent.some((p) => p.type === 'content' && p.text === 'ok')).toBe(true)
    expect(sent.at(-1)?.type).toBe('done')

    // —— 时间线载荷断言（Outbox 已同步 drain——文件可立即读）——
    const readEvents = (session: string) =>
      readFileSync(timelineFile(session), 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { type: string; detail?: Record<string, unknown> })
    const events = readEvents('sess-usage-1')
    const recorded = events.filter((e) => e.type === 'usage.recorded')
    expect(recorded).toHaveLength(1)
    // cost = 100/1e6*1 + 20/1e6*2 = 1.4e-4
    expect(recorded[0]?.detail).toEqual({
      provider: 'commandcode',
      model: 'deepseek/deepseek-v4.1-flash',
      tokens: 120,
      cost: 0.00014,
    })
    const budgetEvt = events.filter((e) => e.type === 'usage.budget_threshold_reached')
    expect(budgetEvt).toHaveLength(1)
    expect(budgetEvt[0]?.detail).toEqual({ limit: 0, spent: 0.00014 })

    // 同进程第二轮流：再次达阈值但 budgetNotified 去重 → 不重复发
    const r2 = (await handler!(event, {
      messages: [{ role: 'user', content: 'again' }],
      sessionId: 'sess-usage-1',
    })) as { ok: boolean }
    expect(r2.ok).toBe(true)
    const events2 = readEvents('sess-usage-1')
    expect(events2.filter((e) => e.type === 'usage.recorded')).toHaveLength(2)
    expect(events2.filter((e) => e.type === 'usage.budget_threshold_reached')).toHaveLength(1)
  })

  it('tools:execute bash 失败 → capability.ledger_updated（首个归因 id）与 tool.failed（exit/stderr/命令）', async () => {
    const { initTools } = await import('../../src/main/tools.js')
    const { registerIpc } = await import('../../src/main/ipc.js')
    const { setTimelineUserData, resetTimelineRuntimeState, timelineFile } =
      await import('../../src/main/timelineLogger.js')

    rmSync(UD, { recursive: true, force: true })
    mkdirSync(path.join(UD, 'logs'), { recursive: true })
    setTimelineUserData(UD)
    resetTimelineRuntimeState()
    initTools()
    registerIpc()

    const handler = handlers.get('tools:execute')
    expect(handler).toBeTypeOf('function')
    const projectRoot = '/tmp/nf-main-harness-proj'
    mkdirSync(projectRoot, { recursive: true })

    // node 命令失败（exit 1）→ 归因 node-runtime（首个命中 id）
    const r = (await handler!(
      {},
      {
        name: 'bash',
        args: { command: 'node -e "process.exit(1)"' },
        approved: true,
        rootPath: projectRoot,
        sessionId: 'sess-bash-1',
      },
    )) as { ok: boolean; error?: string }
    expect(r.ok).toBe(false)

    const readEvents = (session: string) =>
      readFileSync(timelineFile(session), 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { type: string; detail?: Record<string, unknown> })
    const events = readEvents('sess-bash-1')
    const ledger = events.filter((e) => e.type === 'capability.ledger_updated')
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.detail).toEqual({ capabilityId: 'node-runtime', ok: false })
    const failed = events.filter((e) => e.type === 'tool.failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]?.detail).toMatchObject({ name: 'bash', command: 'node -e "process.exit(1)"' })
    expect(String(failed[0]?.detail?.error)).toMatch(/^exit-1:/)

    // 不归因命令（ls 无输出 exit 1——不可构造 exit≠0 而不归因；用 `sh -c 'exit 3'`：
    // 命令文本不含 node/python/npm 关键词 → 不发 ledger 事件，但 tool.failed 照发）
    const r2 = (await handler!(
      {},
      {
        name: 'bash',
        args: { command: "sh -c 'exit 3'" },
        approved: true,
        rootPath: projectRoot,
        sessionId: 'sess-bash-1',
      },
    )) as { ok: boolean; error?: string }
    expect(r2.ok).toBe(false)
    const events2 = readEvents('sess-bash-1')
    expect(events2.filter((e) => e.type === 'capability.ledger_updated')).toHaveLength(1)
    expect(events2.filter((e) => e.type === 'tool.failed')).toHaveLength(2)
    rmSync(projectRoot, { recursive: true, force: true })
  })
})

// 供调试观察请求落点（不在断言中使用）
export const __harnessProbe = { received, getMockOrigin: () => mockOrigin }
