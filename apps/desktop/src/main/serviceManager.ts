// ServiceManager（2026-08-06 设计层升级——用户「白名单匹配不完」+「服务生命周期独立」+「环境单源」）：
// NeonForge 管理开发服务器生命周期——模型用 start-server/check-server/stop-server 工具，
// 不用 bash 起服务（端口冲突/进程残留/超时杀进程）也不用 curl 验证（弹卡）——只读探索走专用工具面，bash 回归「真正执行命令」
// 服务注册表按 rootPath 记忆（端口/PID/URL）——模型不用猜端口（坑 67「帮我打开猜端口」终结）
// 2026-08-06 环境单源（尽调调研 5 源驱动）：spawn 统一走 envManager（node_modules/.bin 入 PATH——任何 npm 工具可跑；
// 显式端口分配替换 --port 0——坑 77 vite 忽略 0；waitForUrl 失败检测——close 无输出=命令失败返回 stderr 错误——不再 port 0 误导）

import { spawn } from 'child_process'
import { HOST_RESERVED_PORTS, normalizeServerCommand, buildSpawnEnv, allocatePort, releasePort, ensureEnvironment, getEnvironment } from './envManager.js'

export interface ServiceEntry {
  rootPath: string
  port: number
  pid: number
  url: string
  startedAt: number
}

// 服务注册表（rootPath → 服务）
const services = new Map<string, ServiceEntry>()
// 所有服务进程（退出清理）
const serviceProcs = new Set<import('child_process').ChildProcess>()

// 解析 vite/构建工具输出里的本地地址
export function parseLocalUrl(text: string): string | null {
  const m = text.match(/https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+|Local:\s*http:\/\/[^\s]+/)
  return m ? m[0].replace(/^Local:\s*/, '').trim() : null
}

// 等待子进程输出中的地址（起服务需要时间——最长 15s）
// 2026-08-06 失败检测（用户「所有命令都要能拿到错误返回」）：close 无任何 stdout 输出 = 命令失败（command not found 等）→ 返回 stderr 错误；
// 有输出但未解析到地址 = 服务启动中（不报错）；超时无输出 = 命令失败
function waitForUrl(child: import('child_process').ChildProcess, timeoutMs = 15000): Promise<{ url: string | null; error?: string }> {
  return new Promise((resolve) => {
    let buf = ''
    let errBuf = ''
    let done = false
    const finish = (url: string | null, error?: string) => { if (!done) { done = true; resolve({ url, error }) } }
    const timer = setTimeout(() => {
      if (!buf && !errBuf) finish(null, '命令启动超时（15s 无输出）——检查命令是否存在或环境未就绪（可用 check-env 检测）')
      else finish(null)
    }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      const url = parseLocalUrl(buf)
      if (url) { clearTimeout(timer); finish(url) }
    })
    child.stderr?.on('data', (d: Buffer) => { errBuf += d.toString() })
    child.on('close', () => {
      if (!buf) {
        const err = errBuf.trim() || '命令执行失败（无输出）——检查命令是否存在（如 vite 需先 npm install）或环境是否就绪'
        clearTimeout(timer)
        finish(null, err)
      } else {
        clearTimeout(timer)
        finish(null)
      }
    })
  })
}

// 服务类命令白名单（设计层：不是命令字符串匹配——是「命令选择」；模型不能任意命令起服务）
const SERVER_COMMAND_WHITELIST: Array<{ test: (c: string) => boolean; label: string }> = [
  { test: (c) => /^npx vite/.test(c), label: 'npx vite' },
  { test: (c) => /^vite( |$)/.test(c), label: 'vite' },
  { test: (c) => /^npm run (dev|start|serve|preview)/.test(c), label: 'npm run dev/start/serve/preview' },
  { test: (c) => /^pnpm (run )?(dev|start|serve|preview)/.test(c), label: 'pnpm dev' },
  { test: (c) => /^yarn (dev|start|serve|preview)/.test(c), label: 'yarn dev' },
  { test: (c) => /^node .*(server|listen)/.test(c), label: 'node server' }
]

export function isServerCommand(cmd: string): boolean {
  return SERVER_COMMAND_WHITELIST.some((s) => s.test(cmd.trim()))
}

// 2026-08-07 T3（regex-todo）：DEV_SERVER_RE/INSTALL_RE 从 tools.ts 移入——命令类型识别单源（服务命令判定一处）
// 分工：isServerCommand = 严格白名单（start-server 工具命令选择——锚定开头）；isServerLikeCommand = 宽松检测
// （bash 超时/端口保护/ServiceState——命令可能在 shell 复合串中，非锚定——行为与原 DEV_SERVER_RE 完全一致）
const SERVER_CMD_LOOSE_RE = /(npm|pnpm|yarn) run (dev|start|serve|preview)|vite( |$)|next dev|react-scripts start|node .*(server|listen)/
export function isServerLikeCommand(cmd: string): boolean {
  return SERVER_CMD_LOOSE_RE.test(cmd)
}

const INSTALL_CMD_RE = /(npm|pnpm|yarn|bun) (i|install|add)( |$)|pip install|go mod download|brew install/
export function isInstallCommand(cmd: string): boolean {
  return INSTALL_CMD_RE.test(cmd)
}

// 启动开发服务器（rootPath 已有服务 → 直接返回；否则起进程并等地址）
export async function startServer(rootPath: string, command?: string): Promise<{ ok: true; data: { url: string; port: number } } | { ok: false; error: string }> {
  const existing = services.get(rootPath)
  if (existing) return { ok: true, data: { url: existing.url, port: existing.port } }
  const rawCmd = (command ?? 'npx vite').trim()
  if (!isServerCommand(rawCmd)) {
    return { ok: false, error: `start-server 只支持服务类命令（npx vite / npm run dev 等）——不支持「${rawCmd}」` }
  }
  // 2026-08-06 环境单源：分配显式端口（避开宿主保留 + 已用）→ normalize 注入（--port 0 替换为显式——坑 77 vite 忽略 0）
  const port = allocatePort(rootPath)
  const cmd = normalizeServerCommand(rawCmd, port)
  try {
    // 环境注入：node_modules/.bin 入 PATH——`vite`（不带 npx）也能找到（通用——非 vite 特判）
    const env = buildSpawnEnv(rootPath, process.env)
    const child = spawn(cmd, { cwd: rootPath, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    serviceProcs.add(child)
    const { url, error } = await waitForUrl(child)
    if (error) {
      // 2026-08-06 失败检测：命令失败（command not found 等）→ 明确错误 + 释放端口（不再 port 0 误导）
      try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }
      serviceProcs.delete(child)
      releasePort(rootPath)
      return { ok: false, error: `start-server: ${error}（已分配端口 ${port}）——可用 check-env 检测环境后重试` }
    }
    if (!url) {
      // 有输出但没解析到地址（输出慢/格式不同）→ 不杀进程（服务可能正在起），返回启动中——模型用 check-server 确认
      services.set(rootPath, { rootPath, port, pid: child.pid ?? 0, url: '', startedAt: Date.now() })
      return { ok: true, data: { url: '', port } }
    }
    const actualPort = Number(url.match(/:(\d+)/)?.[1] ?? 0)
    // 宿主端口保护机制化：结果端口 ∈ 保留集（npm run dev 等无法强制端口的脚本可能落 5173）→ 拒绝占用 + 杀进程
    if (HOST_RESERVED_PORTS.has(actualPort)) {
      try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }
      serviceProcs.delete(child)
      releasePort(rootPath)
      return { ok: false, error: `start-server: 服务落到了宿主保留端口 ${actualPort}（NeonForge 自己用）——已停止；已换显式端口请用 vite 类命令` }
    }
    services.set(rootPath, { rootPath, port: actualPort, pid: child.pid ?? 0, url, startedAt: Date.now() })
    // 环境 Registry 记录实际端口（后续 check-env/端口复用一致）
    const regEnv = getEnvironment(rootPath)
    if (regEnv) { regEnv.servicePort = actualPort }
    return { ok: true, data: { url, port: actualPort } }
  } catch (e) {
    releasePort(rootPath)
    return { ok: false, error: `启动服务失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// 检查服务状态（fetch 本地探测——应用内部，非 bash curl）
export async function checkServer(rootPath: string): Promise<{ ok: true; data: { running: boolean; url?: string; port?: number; note?: string } } | { ok: false; error: string }> {
  const s = services.get(rootPath)
  if (!s) {
    return { ok: true, data: { running: false, note: '没有启动过的开发服务器——用 start-server 启动（先 check-env 确认环境）' } }
  }
  if (!s.url) {
    return { ok: true, data: { running: false, url: s.url, note: '服务启动中（未确认地址）——稍后再查' } }
  }
  try {
    const res = await fetch(s.url, { signal: AbortSignal.timeout(3000) })
    const running = res.ok
    return { ok: true, data: { running, url: s.url, port: s.port } }
  } catch {
    return { ok: true, data: { running: false, url: s.url, port: s.port } }
  }
}

// 停止服务（只停自己起的）
export function stopServer(rootPath: string): { ok: true; data: { stopped: boolean } } {
  const s = services.get(rootPath)
  if (!s) return { ok: true, data: { stopped: false } }
  try { process.kill(-s.pid, 'SIGKILL') } catch { try { process.kill(s.pid, 'SIGKILL') } catch { /* 已退出 */ } }
  services.delete(rootPath)
  releasePort(rootPath)
  return { ok: true, data: { stopped: true } }
}

// 退出清理（main.ts before-quit/window-all-closed/SIGTERM 调用）
export function stopAllServices(): void {
  for (const p of serviceProcs) {
    try { process.kill(-(p.pid ?? 0), 'SIGKILL') } catch { try { p.kill('SIGKILL') } catch { /* 已退出 */ } }
  }
  serviceProcs.clear()
  services.clear()
}

export function listServices(): Array<{ rootPath: string; url: string; port: number }> {
  return [...services.values()].map((s) => ({ rootPath: s.rootPath, url: s.url, port: s.port }))
}

// 环境预检（开发阶段环境就绪——check-env 工具核心）：返回项目环境报告（模型判断环境是否就绪）
export function checkEnvironment(rootPath: string): ReturnType<typeof ensureEnvironment> {
  const env = ensureEnvironment(rootPath)
  return env
}
