// ServiceManager（2026-08-06 设计层升级——用户「白名单匹配不完」+「服务生命周期独立」）：
// NeonForge 管理开发服务器生命周期——模型用 start-server/check-server/stop-server 工具，
// 不用 bash 起服务（端口冲突/进程残留/超时杀进程）也不用 curl 验证（弹卡）——只读探索走专用工具面，bash 回归「真正执行命令」
// 服务注册表按 rootPath 记忆（端口/PID/URL）——模型不用猜端口（坑 67「帮我打开猜端口」终结）

import { spawn } from 'child_process'

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
function waitForUrl(child: import('child_process').ChildProcess, timeoutMs = 15000): Promise<string | null> {
  return new Promise((resolve) => {
    let buf = ''
    let done = false
    const finish = (url: string | null) => { if (!done) { done = true; resolve(url) } }
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      const url = parseLocalUrl(buf)
      if (url) { clearTimeout(timer); finish(url) }
    })
    child.on('close', () => finish(null))
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

// 启动开发服务器（rootPath 已有服务 → 直接返回；否则起进程并等地址）
export async function startServer(rootPath: string, command?: string): Promise<{ ok: true; data: { url: string; port: number } } | { ok: false; error: string }> {
  const existing = services.get(rootPath)
  if (existing) return { ok: true, data: { url: existing.url, port: existing.port } }
  const cmd = (command ?? 'npx vite').trim()
  if (!isServerCommand(cmd)) {
    return { ok: false, error: `start-server 只支持服务类命令（npx vite / npm run dev 等）——不支持「${cmd}」` }
  }
  try {
    const child = spawn(cmd, { cwd: rootPath, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    serviceProcs.add(child)
    const url = await waitForUrl(child)
    if (!url) {
      // 没解析到地址（输出慢/格式不同）→ 不杀进程（服务可能正在起），返回启动中——模型用 check-server 确认
      services.set(rootPath, { rootPath, port: 0, pid: child.pid ?? 0, url: '', startedAt: Date.now() })
      return { ok: true, data: { url: '', port: 0 } }
    }
    const port = Number(url.match(/:(\d+)/)?.[1] ?? 0)
    services.set(rootPath, { rootPath, port, pid: child.pid ?? 0, url, startedAt: Date.now() })
    return { ok: true, data: { url, port } }
  } catch (e) {
    return { ok: false, error: `启动服务失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// 检查服务状态（fetch 本地探测——应用内部，非 bash curl）
export async function checkServer(rootPath: string): Promise<{ ok: true; data: { running: boolean; url?: string; port?: number; note?: string } } | { ok: false; error: string }> {
  const s = services.get(rootPath)
  if (!s) {
    return { ok: true, data: { running: false, note: '没有启动过的开发服务器——用 start-server 启动' } }
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
