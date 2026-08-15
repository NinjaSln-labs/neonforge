import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron' // main 进程内置——vitest 下为 undefined（subprocFile 防御走 fallback）
import { snapshot as takeSnapshot, revert as revertFile } from './applyDiff.js'
import { codeRag } from './codeRag.js'
// 2026-08-06 设计层升级（服务生命周期独立——用户「白名单匹配不完」）：模型用 start/check/stop-server 管服务，不用 bash 起服务/curl 验证
// 2026-08-07 T3（regex-todo）：命令类型识别单源化——isServerLikeCommand/isInstallCommand 从 serviceManager 导入（原 DEV_SERVER_RE/INSTALL_RE 散落 tools.ts 已删）
import { startServer, checkServer, stopServer, checkEnvironment, isServerLikeCommand, isInstallCommand } from './serviceManager.js'
// 2026-08-06 能力模型（坑 83）：check-env 返回能力视图（平台原生 + 外部扩展 Status——模型按需求选能力）
import { detectCapabilities, attributeCommandFailure } from './envManager.js'
import { logTimeline } from './timelineLogger.js'
// 2026-08-14 S3：动作分类单一权威（领域层——renderer/main 同源判定；缝隙 4）
import { classifyAction } from '../domain/conversationState.js'

// ToolRegistry（ticket 10 / A0 §2）：工具注册与执行分发
// 边界判定：ToolRegistry=目录与分发；ShellAgent=bash 执行；Gateway=工具调用修复（02 已实现）
// 授权（ticket 14 信任阶梯）：requiresApproval 工具（write/edit/bash）须显式 approved=true 才执行
// risk 等级：none=L1 观察（read/search/LSP 无需授权）；low=L3 文件操作（write/edit 写前快照可回滚）；high=L3 命令执行（bash 高危——永远单独确认）

export type ToolRisk = 'none' | 'low' | 'high'

// 2026-08-04 授权架构 v4（竞品多源交叉验证共识——Claude/Codex/Cursor 统一 Tool(specifier) 格式）：
// 规则引擎 deny > allow > ask；未匹配默认 ask（fail-closed）+ preApproval 只读自动
export type RuleAction = 'allow' | 'deny' | 'ask'
export interface PermissionRule {
  action: RuleAction
  tool: string
  specifier: string // 参数前缀（路径/命令）——空 = 该工具全部
}

// 规则匹配参数：优先取路径类参数（path/filePath/file），命令类取 command/pattern
function ruleArg(args: Record<string, unknown>): string {
  return String(args.path ?? args.filePath ?? args.file ?? args.command ?? args.pattern ?? '')
}
export function matchesRule(tool: string, args: Record<string, unknown>, rule: PermissionRule): boolean {
  if (rule.tool !== tool) return false
  if (!rule.specifier) return true
  return ruleArg(args).startsWith(rule.specifier)
}

// 沙箱判定：项目根内（0-1 创建的项目根 / 打开的项目根）——沙箱内外区分（Codex workspace-write 概念，软沙箱）
export function isInSandbox(p: unknown, rootPath?: string): boolean {
  const pStr = String(p ?? '')
  if (!rootPath || !pStr) return false
  const rp = path.resolve(rootPath)
  // 与 readExecutor resolvePath 语义一致：真绝对路径（多段）直接用；相对/类绝对（单段 /package.json = 项目根下）join rootPath
  const segments = pStr.split('/').filter(Boolean)
  const target = path.isAbsolute(pStr) && segments.length > 1 ? path.resolve(pStr) : path.resolve(rp, pStr.replace(/^\/+/, ''))
  return target === rp || target.startsWith(rp + path.sep)
}

export interface Tool {
  name: string
  source: 'core' | 'lsp'
  requiresApproval: boolean
  risk: ToolRisk
  execute: (args: Record<string, unknown>, ctx: { rootPath?: string; sessionId?: string }) => Promise<unknown>
  // 2026-08-04 授权架构重构（用户授权疲劳）：执行前裁决——requiresApproval 工具若 preApproval 判定 auto=true → 免授权直接执行
  // （main 进程裁决——bash 只读命令自动；renderer 不判断，防绕过）
  preApproval?: (args: Record<string, unknown>, ctx?: { rootPath?: string; sessionId?: string }) => { auto: boolean; reason?: string }
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  // 2026-08-07 T2（regex-todo）：needApproval 结构化字段——renderer 不再 includes('授权') 文本匹配
  //（main 改文案/英文 → 授权卡变 error 的脆弱耦合）；仅授权拦截返回时出现
  needApproval?: boolean
  // 2026-08-08 根因 3 修复②：policy 结构化字段——策略引导/拦截（如 write 规划门控「先 approve-files 再写」）
  // ≠ 工具执行失败：renderer 据此不置 lastToolFailed（否则 forceTool 恒释放 → 模型纯文本承诺后停住——冒烟 O4/O5 根因）
  policy?: boolean
}

class ToolRegistry {
  private tools = new Map<string, Tool>()
  // 2026-08-04 授权架构 v4：规则列表（deny > allow > ask；未匹配 ask + preApproval）
  private rules: PermissionRule[] = []

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  setRules(rules: PermissionRule[]): void {
    this.rules = rules
  }

  list(): Array<{ name: string; source: Tool['source']; requiresApproval: boolean; risk: ToolRisk }> {
    return [...this.tools.values()].map(({ name, source, requiresApproval, risk }) => ({ name, source, requiresApproval, risk }))
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    opts: { approved?: boolean; rootPath?: string; sessionId?: string } = {}
  ): Promise<ToolResult> {
    console.log('[tools] execute', name, 'rootPath=' + (opts.rootPath ?? 'NONE'))
    // 2026-08-07 会话时间线（Session Timeline BC——main 侧工具执行记录兜底：renderer 崩溃也有工具时间线）
    // 2026-08-08 会话归属：sessionId（会话 UUID）优先——工具执行写入对应会话文件
    logTimeline({ session: opts.sessionId ?? opts.rootPath ?? undefined, type: 'tool-exec', role: 'tool', detail: { name, args, approved: opts.approved } })
    const tool = this.tools.get(name)
    if (!tool) return { ok: false, error: `未知工具：${name}` }
    // 2026-08-04 规划级授权强制（用户实测：模型说了调 approve-files 但没调——指令不可靠，机制兜底）：
    // write/edit 首次执行前必须 approve-files 已批准——否则返回错误引导模型先规划（一次性授权整批，不再逐个授权）
    // 2026-08-08 根因 3 修复②：policy=true——策略引导非执行失败（renderer 不置 lastToolFailed，forceTool 保持强制逼模型调 approve-files）
    if (name === 'write' && !filesApprovedRef && !opts.approved) { // 2026-08-06 edit 豁免（改现有文件=操作明确——B 类直接改）；write 新建强制规划
      return { ok: false, policy: true, error: '修改前请先调用 approve-files 工具一次性列出本次要新增/修改的文件清单（用户批准后这些文件自动放行，不需要逐个授权）——不要直接逐个 write/edit' }
    }
    // 2026-08-04 授权架构 v4：规则裁决 deny > allow > ask（fail-closed）——对齐 Claude/Codex/Cursor 共识
    const rule = this.rules.find((r) => matchesRule(name, args, r))
    if (rule?.action === 'deny') {
      return { ok: false, policy: true, error: `已阻止：${name}（deny 规则 ${rule.specifier || '全部'}）——如需执行请先调整授权规则` }
    }
    const ruleAllows = rule?.action === 'allow'
    if (!ruleAllows && tool.requiresApproval && !opts.approved) {
      // 2026-08-04 授权架构重构：preApproval 裁决（如 bash 只读命令自动执行）——原一律 need-approval（授权疲劳根因：ls/cat 也弹卡）
      const pre = tool.preApproval?.(args, opts)
      if (!pre?.auto) {
        // 2026-08-07 T2（regex-todo）：needApproval 结构化标记——renderer 读字段判定授权卡（不再 includes('授权') 文本匹配）
        return { ok: false, needApproval: true, error: `「${name}」需要授权（L3）——approved=true 后执行` }
      }
    }
    try {
      const data = await tool.execute(args, { rootPath: opts.rootPath, sessionId: opts.sessionId })
      return { ok: true, data }
    } catch (e) {
      // 2026-08-04：ENOENT 友好化——原始报错（含完整路径）透传给非技术用户不可读（talk.txt 实测）；提示用相对路径或先看工程文件
      if (e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, error: '找不到这个文件或目录——试试用相对路径（如 package.json），或先看右侧工程文件列表' }
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

// 工具执行器（4 核心）
function resolvePath(p: unknown, ctx: { rootPath?: string }): string {
  const pStr = String(p ?? '')
  if (!pStr) throw new Error('缺少路径参数')
  // ① 真绝对路径（多段，如 /Users/… 或 /tmp/…）→ 永远不 join——直接用（存在则读，不存在则报不存在；2026-08-04 修复：原实现绝对路径不存在时走 join 分支，拼出 rootPath+绝对路径 的荒谬路径——talk.txt 实测）
  const segments = pStr.split('/').filter(Boolean)
  if (path.isAbsolute(pStr) && segments.length > 1) return pStr
  // ② 相对/类绝对（如 package.json 或 /package.json——单段根下文件名，模型相对语义）→ 以 rootPath 为基准，项目根下
  if (ctx.rootPath) return path.join(ctx.rootPath, pStr.replace(/^\/+/, ''))
  throw new Error('路径需为绝对路径或提供 rootPath')
}

function readExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  const filePath = resolvePath(args.path, ctx)
  // 2026-08-04 体验修复：read 目录给友好提示（原 fs.readFile 目录 EISDIR 原始错误——模型开发阶段「看目录」时暴露；引导用 bash ls）
  return fs.stat(filePath).then((st) => {
    if (st.isDirectory()) return `这是目录（${filePath}）——要列出内容请用 bash 执行 ls 命令`
    return fs.readFile(filePath, 'utf-8')
  }).catch(async (e) => {
    // 2026-08-06 用户反馈「读取工具先读不存在（盲读）——任何时候都应该先确认有没有文件」：文件不存在时列出父目录内容——
    // 模型知道目录里有什么（不再盲读试探浪费轮次）；0-1 空目录 read package.json（未创建）→ 提示目录内容 + 引导
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        const entries = await fs.readdir(path.dirname(filePath))
        return `找不到文件：${filePath}——这个目录里有：${entries.slice(0, 20).join('、') || '（空目录——项目还没创建文件，先确认要读什么再读，或用 bash ls 看完整列表）'}`
      } catch {
        return `找不到文件：${filePath}——父目录也不存在，确认路径是否正确`
      }
    }
    throw e
  })
}

async function writeExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  const filePath = resolvePath(args.path, ctx)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  // 先备份后写（基线 §11）：已存在文件写前快照 .nf-bak（新文件无旧内容——回滚语义为无快照）
  takeSnapshot(filePath)
  await fs.writeFile(filePath, String(args.content ?? ''), 'utf-8')
  return { file: filePath, bytes: String(args.content ?? '').length, snapshot: true }
}

async function editExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  const filePath = resolvePath(args.path, ctx)
  const oldText = String(args.old ?? '')
  const newText = String(args.new ?? '')
  const content = await fs.readFile(filePath, 'utf-8')
  if (!content.includes(oldText)) throw new Error(`未找到待替换内容（path: ${filePath}）`)
  // 先备份后写：替换前快照（回滚恢复原样）
  takeSnapshot(filePath)
  await fs.writeFile(filePath, content.replace(oldText, newText), 'utf-8')
  return { file: filePath, snapshot: true }
}

// 所有 bash 子进程（进程组跟踪——2026-08-05 用户反馈「服务反复起/端口冲突」：dev server 残留）
// detached 进程组：app 退出时 killAllSubprocesses 杀整个组（含 `&` 后台进程——exec 时代孤儿残留）
// 2026-08-05 用户反馈（杀固定端口会误杀用户进程）：清理只杀「自己记录 pid 的进程」（PID 文件——kill 进程组覆盖 & 后台）
let activeProc: { proc: import('child_process').ChildProcess; cmd: string } | null = null
const subprocs = new Set<import('child_process').ChildProcess>()
// PID 记录文件（userData 下）——NeonForge 自己起的 bash 进程 pid 持久化；异常退出（SIGKILL）后下次启动/退出可清
// 只杀这里记录的 pid——用户自己的进程从不记录 → 不会误杀（修复「启动清固定端口会杀用户进程」）
// 2026-08-15 Q4 修复：原 require('electron') 在 ESM 恒 ReferenceError → PID 持久化从未生效（catch 吞掉）——改静态 import
function subprocFile(): string {
  try {
    if (app?.getPath) return `${app.getPath('userData')}/neonforge-subprocs.jsonl`
  } catch { /* 非 Electron 环境 */ }
  return `${process.env.HOME ?? ''}/Library/Application Support/neonforge-desktop/neonforge-subprocs.jsonl`
}
function recordPid(pid: number): void {
  try { appendFileSync(subprocFile(), `${pid}\n`) } catch { /* 记录失败不影响执行 */ }
}

// 递归杀进程树（进程组 + 后代）——nohup 后台进程 setsid 脱离进程组，仅杀组不够
function killTree(pid: number): void {
  try {
    const kids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n').filter(Boolean).map(Number)
    for (const k of kids) killTree(k)
  } catch { /* 无后代 */ }
  try { process.kill(-pid, 'SIGKILL') } catch { try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ } }
}
// 清 NeonForge 自己起的全部子进程（含异常退出残留——读 PID 文件；只杀自己记录的，不碰用户进程）
export function killAllSubprocesses(): void {
  for (const p of subprocs) killTree(p.pid ?? 0)
  subprocs.clear()
  activeProc = null
  try {
    const file = subprocFile()
    const pids = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number)
    for (const pid of pids) killTree(pid)
    writeFileSync(file, '')
  } catch { /* 无记录文件 */ }
}

// 2026-08-04 端口冲突防护（用户实测：模型 npm run dev 抢占 NeonForge 5173/5174——dev server 无端口检测）：
// NeonForge 保留端口：5173（dev）/ 5175（自动化测试）——模型起的项目 dev server 必须避开
// 2026-08-05（用户反馈「不应绑定固定端口」）：除保留端口外**不限制**——vite 默认 strictPort:false 端口被占自动递增
const RESERVED_PORTS = new Set([5173, 5175])

async function bashExecutor(args: Record<string, unknown>, ctx: { rootPath?: string; sessionId?: string }): Promise<unknown> {
  // V1 真实执行：授权（approved=true）后执行命令（child_process）——在项目根目录执行
  // 风险标注（ticket 14）：high 风险——本机进程执行；授权即同意本机执行；可随时停止（cancelActiveCommand）
  const { spawn } = await import('child_process')
  const cmd = String(args.command ?? '')
  if (!cmd.trim()) throw new Error('bash: 缺少 command')
  // 2026-08-04 端口冲突检测：服务类命令显式指定保留端口 → 友好错误（防静默撞车——NeonForge 5173/5175 被抢占）
  if (isServerLikeCommand(cmd)) {
    const m = cmd.match(/--port[= ](\d+)|PORT=(\d+)/)
    const port = m ? Number(m[1] ?? m[2]) : null
    if (port && RESERVED_PORTS.has(port)) {
      throw new Error(`端口 ${port} 是 NeonForge 自己的开发/测试端口——请勿占用。其他端口随便用：不指定 --port 让 Vite 自动选空闲端口（被占自动递增），或用 --port 0（系统分配）`)
    }
  }
  return new Promise((resolve, reject) => {
    // 2026-08-05：spawn detached（新进程组）——app 退出可杀组（含 &/nohup 后台进程）；exec 30s 超时对 dev server（长驻）误杀且后台孤儿残留
    const child = spawn(cmd, { cwd: ctx.rootPath ?? undefined, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    subprocs.add(child)
    recordPid(child.pid ?? 0) // 2026-08-05：PID 持久化——异常退出（SIGKILL）后启动/退出可清（只清自己记的，不碰用户进程）
    activeProc = { proc: child, cmd }
    let stdout = ''
    let stderr = ''
    let timer: NodeJS.Timeout | null = null
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      timer = null
      // 2026-08-05 用户反馈 1：不从 subprocs 删除——保留进程组记录直到 app 退出统一杀
      // （&/nohup 后台进程：shell 退出（close）但后代仍在进程组——close 时删记录 → 后台进程失联残留）
      if (activeProc?.proc === child) activeProc = null
    }
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); if (stdout.length > 32000) stdout = stdout.slice(-16000) })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); if (stderr.length > 4000) stderr = stderr.slice(-2000) })
    child.on('error', (err) => { cleanup(); reject(new Error(`bash 启动失败: ${err.message}`)) })
    child.on('close', (code, signal) => {
      cleanup()
      // 被信号终止（SIGKILL——cancel/超时）→ 「已停止」（对齐原 exec 语义：err.killed → 已停止）
      if (signal || code === null) reject(new Error('已停止（命令被中断）'))
      else if (code !== 0) {
        // 2026-08-07 Ledger（坑 83 ⑥）：bash 失败归因到能力（node/python/dev-tools）——check-capability 后续降级 failed（自学习）
        try { attributeCommandFailure(ctx.rootPath ?? '', cmd) } catch { /* 归因失败不影响命令错误返回 */ }
        logTimeline({ session: ctx.sessionId ?? ctx.rootPath ?? undefined, type: 'tool-result', role: 'tool', detail: { name: 'bash', ok: false, error: `exit-${code}: ${stderr.slice(0, 300)}`, command: cmd.slice(0, 200) } })
        reject(new Error(stderr ? `exit-${code}: ${stderr.slice(0, 500)}` : `exit-${code}`))
      }
      else {
        // 2026-08-05 ServiceState（轻量服务记忆）：起服务类命令且 stdout 含实际地址 → 结果注一条（模型跨轮记得，不用重新探查端口）
        // 竞品对照：Claude/Codex 不主动记忆——工具结果回填是最轻方案；不注入全量（~30 token）
        let note = ''
        if (isServerLikeCommand(cmd)) {
          const m = (stdout + stderr).match(/https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+|Local:\s*http:\/\/[^\s]+/)
          if (m) note = `【服务状态】已启动 ${m[0].replace(/^Local:\s*/, '')}（本命令已返回，服务在后台运行）`
          else if (/localhost:\d+/.test(cmd)) note = '【服务状态】命令含端口启动（以实际输出/浏览器为准）'
          // 2026-08-06 用户反馈「帮我打开——模型猜 5173 实际 5174」：后台起服务（&/nohup）stdout 回不来 → 无地址可提取；
          // 提示模型先探测实际端口再告知用户（不要猜端口）
          else note = '【服务状态】服务命令已执行但 stdout 未见实际地址（可能后台启动）——先 lsof -iTCP -sTCP:LISTEN 或 curl 确认实际端口，再告知用户实际地址，不要猜端口'
        }
        resolve({ stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 500), note })
      }
    })
    // 超时（防挂死）：安装类命令（npm/pnpm/yarn/pip install——网络慢常超 30s）放宽到 120s；其他 30s
    // 2026-08-05 e2e 实测：npm install 30s 被杀 → 模型重试 → 体验卡（用户 11:32 起服务反复的同族问题）
    // 2026-08-07 T3（regex-todo）：isServerLikeCommand/isInstallCommand 单源自 serviceManager（原 INSTALL_RE/DEV_SERVER_RE 散落 tools.ts 已删）
    const isDevServer = isServerLikeCommand(cmd)
    const timeoutMs = isInstallCommand(cmd) ? 120000 : (isDevServer ? 15000 : 30000)
    timer = setTimeout(() => {
      // 2026-08-06 用户反馈「工具执行很多次」（模型起服务反复失败重试）：起服务（长驻进程）30s 超时杀进程组 → 服务被杀 → 模型反复重试（07:35 日志实证「每次 bash 调用结束时把进程组杀了」）；
      // 修复：起服务命令超时后**不杀进程**（服务本就该长驻），返回已收集输出 + ServiceState note（提示 curl 确认端口）；
      // 残留由 subprocs 记录 + app 退出 killAllSubprocesses 统一清（坑 54）
      if (isDevServer) {
        cleanup()
        const m = (stdout + stderr).match(/https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+|Local:\s*http:\/\/[^\s]+/)
        resolve({
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 500),
          note: m ? `【服务状态】已启动 ${m[0].replace(/^Local:\s*/, '')}（服务在后台运行）` : '【服务状态】服务命令已启动（长驻）——用 lsof/curl 确认实际端口'
        })
      } else {
        try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { /* 已退出 */ }
      }
    }, timeoutMs)
  })
}

// 可撤销（ticket 14）：停止当前活动命令（bash 高危——任何时刻可停；无活动命令返回错误）——杀整个进程组
export function cancelActiveCommand(): { ok: true } | { ok: false; error: string } {
  if (!activeProc) return { ok: false, error: '无活动命令' }
  try { process.kill(-(activeProc.proc.pid ?? 0), 'SIGKILL') } catch { try { activeProc.proc.kill('SIGKILL') } catch {} }
  activeProc = null
  return { ok: true }
}

// 2026-08-04 授权架构重构（用户授权疲劳）：bash 只读命令检测——ls/cat/grep 等查看类自动执行（零打断）；
// 写命令（rm/mv/cp/npm/git/python/node/重定向）保持授权（main 进程裁决，renderer 不判断防绕过）
// 2026-08-14 S3：判定上移领域层 classifyAction（单一权威——renderer 确认卡/门控与 main preApproval 同源，消除双源）
export function isReadOnlyBash(cmd: string): boolean {
  return classifyAction('bash', cmd) === 'readonly'
}

// 2026-08-06 用户反馈「帮我打开」（催 4 次都没打开网页）：open 工具——默认浏览器打开 http/https 地址
// 语义化优于 bash `open`（macOS 限定 + 白名单外需授权）；打开网页无害 → 无需授权（risk none）
// 仅放行 http/https（拒绝 file:// 等本地协议，防越权打开本地文件）
export function isValidOpenUrl(url: string): boolean {
  return /^https?:\/\/\S+$/.test(url)
}
async function openExecutor(args: Record<string, unknown>): Promise<unknown> {
  const url = String(args.url ?? args.target ?? '')
  if (!isValidOpenUrl(url)) throw new Error('open: 只支持 http/https 地址（如 open {url: "http://localhost:5174/"}）')
  try {
    // 2026-08-06 open 失败根因（用户反馈「open 调用出现了错误」）：main 是 ESM（NodeNext）——require 未定义 → 永远失败；
    // 用动态 import（vitest 可 mock；同文件其他 require 都被 try/catch 兜住走 fallback，唯独 open 的失败暴露）
    const { shell } = await import('electron')
    if (!shell?.openExternal) throw new Error('当前环境不支持打开浏览器（非 Electron 运行）')
    await shell.openExternal(url)
    return { ok: true, data: `已在默认浏览器打开 ${url}` }
  } catch (e) {
    throw new Error(`open 失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const toolRegistry = new ToolRegistry()

// 2026-08-04 规划级授权强制：会话级「已规划」标记——approve-files 被批准后置 true（write/edit 放行）
let filesApprovedRef = false
export function markPlanApproved(): void { filesApprovedRef = true }
// 2026-08-08 根因 3 修复②：重置规划标记（测试用——模拟用户未批准过 approve-files；产品运行由 renderer 会话边界 clearTrust 控制）
export function resetPlanApproved(): void { filesApprovedRef = false }

// 注册 4 核心工具 + search（Layer2 CodeRAG——2026-08-02 接入模型；6 LSP 随 12 ContextEngine 注册）
export function initTools(): void {
  // risk（ticket 14）：none=L1 观察无需授权；low=L3 文件操作（写前快照可回滚）；high=L3 命令执行（高危单独确认）
  // 2026-08-04 v4：read 一律自动（读是低风险——Cursor/Codex 共识「读文件默认不需批准」）；沙箱内外区分核心在 write/edit（沙箱外永不信任）
  toolRegistry.register({ name: 'read', source: 'core', requiresApproval: false, risk: 'none', execute: readExecutor })
  toolRegistry.register({ name: 'write', source: 'core', requiresApproval: true, risk: 'low', execute: writeExecutor })
  toolRegistry.register({ name: 'edit', source: 'core', requiresApproval: true, risk: 'low', execute: editExecutor })
  toolRegistry.register({ name: 'bash', source: 'core', requiresApproval: true, risk: 'high', execute: bashExecutor, preApproval: (args) => ({ auto: isReadOnlyBash(String(args.command ?? '')) }) })
  // 2026-08-06 打开网页（用户「帮我打开」）：http/https 打开默认浏览器——无害操作自动放行（risk none）
  toolRegistry.register({ name: 'open', source: 'core', requiresApproval: false, risk: 'none', execute: openExecutor })
  // 2026-08-04 批量授权：虚拟工具——不执行操作，renderer 收到后弹批量授权卡（用户批准后文件加入任务级信任，write/edit 自动放行）
  // 2026-08-08 修复（用户「批准这批文件。你没有去点」——e2e 卡死根因）：结果改「待批准」语义——
  // 原 ok:true 让模型以为已批准 → 继续 write 被拦 → 困惑重试 → 永不停 → waitSettled 卡死
  // 现明确告知「提交了批准请求、等用户点批准」→ 模型停下等用户（idle）→ 用户点卡后继续
  toolRegistry.register({ name: 'approve-files', source: 'core', requiresApproval: false, risk: 'none', execute: async () => ({ ok: true, data: { virtual: true, pendingApproval: true }, error: '已提交文件批准请求——等待用户点击「批准这批文件」后继续写文件（批准前不要写）' }) })
  // Layer2 CodeRAG：关键词检索兜底（Claude Code grep 模式——2026-08-02 调研：agentic 工具检索为行业共识，见 .scratch/neonforge-v1/layer2-retrieval-research.md）
  toolRegistry.register({
    name: 'search',
    source: 'core',
    requiresApproval: false,
    risk: 'none',
    execute: (args, ctx) => codeRag.search(ctx?.rootPath ?? null, String(args.query ?? '')) as unknown as Promise<unknown>
  })
  // 2026-08-06 设计层升级（服务生命周期独立）：start/check/stop-server——模型不用 bash 起服务（端口冲突/超时杀进程/进程残留）也不用 curl 验证（弹卡）
  // 授权：全部自动（start 白名单命令 + NeonForge 管生命周期可停；check 只读；stop 只停自己起的）
  // 2026-08-06 能力模型（坑 83）；2026-08-07 无阶段重构 S2：check-env → check-capability（能力检查——不绑开发阶段）
  toolRegistry.register({
    name: 'check-capability',
    source: 'core',
    requiresApproval: false,
    risk: 'none',
    execute: async (args) => {
      const dir = String(args.dir ?? args.rootPath ?? '')
      if (!dir) return { ok: false, error: 'check-capability: 缺少 dir（项目目录绝对路径）' }
      const env = checkEnvironment(dir)
      // 2026-08-06 能力视图（坑 83 能力模型——用户「能力才是要检测的东西」）：返回能力清单（平台原生 + 外部扩展 Status）
      // 模型按「用户需求 → 所需能力」从清单匹配（reasonix semantic 路由思路——模型理解判断，非词匹配）
      // 2026-08-08 单源修复：detectCapabilities 复用 env（不重复 detectEnvironment——原一次 check-capability exec node/python 各 2 次）
      const caps = detectCapabilities(dir, process.platform, env)
      const missing = caps.filter((c) => c.status === 'missing').map((c) => c.id)
      return {
        ok: true,
        data: {
          capabilities: caps.map((c) => ({ id: c.id, category: c.category, status: c.status, implementations: c.implementations, requires: c.requires, detail: c.detail })),
          runtime: env.runtime,
          runtimeVersion: env.runtimeVersion,
          hasNodeModules: env.hasNodeModules,
          packageManager: env.packageManager,
          missing: missing,
          note: missing.length > 0
            ? `缺少能力：${missing.join('、')}——先安装再继续（node_modules 未装先 npm install；openpyxl 用 pip install）`
            : env.runtime === 'none' ? '能力就绪（系统原生）——从零项目需先初始化（建 package.json + 装依赖）' : '环境就绪'
        }
      }
    }
  })
  toolRegistry.register({
    name: 'start-server',
    source: 'core',
    requiresApproval: false,
    risk: 'low',
    execute: async (args) => {
      const dir = String(args.dir ?? '')
      if (!dir) return { ok: false, error: 'start-server: 缺少 dir（项目目录绝对路径）' }
      return startServer(dir, args.command ? String(args.command) : undefined)
    }
  })
  toolRegistry.register({
    name: 'check-server',
    source: 'core',
    requiresApproval: false,
    risk: 'none',
    execute: async (args) => {
      const dir = String(args.dir ?? '')
      if (!dir) return { ok: false, error: 'check-server: 缺少 dir（项目目录绝对路径）' }
      return checkServer(dir)
    }
  })
  toolRegistry.register({
    name: 'stop-server',
    source: 'core',
    requiresApproval: false,
    risk: 'low',
    execute: async (args) => {
      const dir = String(args.dir ?? '')
      if (!dir) return { ok: false, error: 'stop-server: 缺少 dir（项目目录绝对路径）' }
      return stopServer(dir)
    }
  })
}

// 工具写文件回滚（write/edit 写前已快照 .nf-bak——回滚恢复原样；无快照返回错误）
export function revertToolFile(filePath: string): { ok: true } | { ok: false; error: string } {
  return revertFile(filePath)
}
