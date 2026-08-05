import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { snapshot as takeSnapshot, revert as revertFile } from './applyDiff.js'
import { codeRag } from './codeRag.js'

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
  execute: (args: Record<string, unknown>, ctx: { rootPath?: string }) => Promise<unknown>
  // 2026-08-04 授权架构重构（用户授权疲劳）：执行前裁决——requiresApproval 工具若 preApproval 判定 auto=true → 免授权直接执行
  // （main 进程裁决——bash 只读命令自动；renderer 不判断，防绕过）
  preApproval?: (args: Record<string, unknown>, ctx?: { rootPath?: string }) => { auto: boolean; reason?: string }
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
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
    opts: { approved?: boolean; rootPath?: string } = {}
  ): Promise<ToolResult> {
    console.log('[tools] execute', name, 'rootPath=' + (opts.rootPath ?? 'NONE'))
    const tool = this.tools.get(name)
    if (!tool) return { ok: false, error: `未知工具：${name}` }
    // 2026-08-04 规划级授权强制（用户实测：模型说了调 plan_approval 但没调——指令不可靠，机制兜底）：
    // write/edit 首次执行前必须 plan_approval 已批准——否则返回错误引导模型先规划（一次性授权整批，不再逐个授权）
    if ((name === 'write' || name === 'edit') && !planApprovedRef && !opts.approved) {
      return { ok: false, error: '修改前请先调用 plan_approval 工具一次性列出本次要新增/修改的文件清单（用户批准后这些文件自动放行，不需要逐个授权）——不要直接逐个 write/edit' }
    }
    // 2026-08-04 授权架构 v4：规则裁决 deny > allow > ask（fail-closed）——对齐 Claude/Codex/Cursor 共识
    const rule = this.rules.find((r) => matchesRule(name, args, r))
    if (rule?.action === 'deny') {
      return { ok: false, error: `已阻止：${name}（deny 规则 ${rule.specifier || '全部'}）——如需执行请先调整授权规则` }
    }
    const ruleAllows = rule?.action === 'allow'
    if (!ruleAllows && tool.requiresApproval && !opts.approved) {
      // 2026-08-04 授权架构重构：preApproval 裁决（如 bash 只读命令自动执行）——原一律 need-approval（授权疲劳根因：ls/cat 也弹卡）
      const pre = tool.preApproval?.(args, opts)
      if (!pre?.auto) {
        return { ok: false, error: `「${name}」需要授权（L3）——approved=true 后执行` }
      }
    }
    try {
      const data = await tool.execute(args, { rootPath: opts.rootPath })
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
// detached 进程组：app 退出时 killAllSubprocesses 杀整个组（含 `&`/nohup 后台进程——exec 时代孤儿残留）
let activeProc: { proc: import('child_process').ChildProcess; cmd: string } | null = null
const subprocs = new Set<import('child_process').ChildProcess>()

// 2026-08-05 用户反馈 1：Electron 关闭时清理所有 bash 子进程（残留 dev server 占端口 → 下次会话端口冲突）
// 递归杀进程树（进程组 + 后代）——nohup 后台进程 setsid 脱离进程组，仅杀组不够
function killTree(pid: number): void {
  try {
    const kids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n').filter(Boolean).map(Number)
    for (const k of kids) killTree(k)
  } catch { /* 无后代 */ }
  try { process.kill(-pid, 'SIGKILL') } catch { try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ } }
}
export function killAllSubprocesses(): void {
  for (const p of subprocs) killTree(p.pid ?? 0)
  subprocs.clear()
  activeProc = null
}

// 2026-08-04 端口冲突防护（用户实测：模型 npm run dev 抢占 NeonForge 5173/5174——dev server 无端口检测）：
// NeonForge 保留端口：5173（dev）/ 5175（自动化测试）——模型起的项目 dev server 必须避开
const RESERVED_PORTS = new Set([5173, 5175])
const DEV_SERVER_RE = /(npm|pnpm|yarn) run (dev|start|serve|preview)|vite( |$)|next dev|react-scripts start|node .*(server|listen)/

async function bashExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  // V1 真实执行：授权（approved=true）后执行命令（child_process）——在项目根目录执行
  // 风险标注（ticket 14）：high 风险——本机进程执行；授权即同意本机执行；可随时停止（cancelActiveCommand）
  const { spawn } = await import('child_process')
  const cmd = String(args.command ?? '')
  if (!cmd.trim()) throw new Error('bash: 缺少 command')
  // 2026-08-04 端口冲突检测：服务类命令显式指定保留端口 → 友好错误（防静默撞车——NeonForge 5173/5175 被抢占）
  if (DEV_SERVER_RE.test(cmd)) {
    const m = cmd.match(/--port[= ](\d+)|PORT=(\d+)/)
    const port = m ? Number(m[1] ?? m[2]) : null
    if (port && RESERVED_PORTS.has(port)) {
      throw new Error(`端口 ${port} 被 NeonForge 占用（开发/测试端口）——请改用其他端口：--port 5176（或 5176-5199 之间任意空闲端口）`)
    }
  }
  return new Promise((resolve, reject) => {
    // 2026-08-05：spawn detached（新进程组）——app 退出可杀组（含 &/nohup 后台进程）；exec 30s 超时对 dev server（长驻）误杀且后台孤儿残留
    const child = spawn(cmd, { cwd: ctx.rootPath ?? undefined, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    subprocs.add(child)
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
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); if (stdout.length > 4000) stdout = stdout.slice(-2000) })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); if (stderr.length > 2000) stderr = stderr.slice(-1000) })
    child.on('error', (err) => { cleanup(); reject(new Error(`bash 启动失败: ${err.message}`)) })
    child.on('close', (code, signal) => {
      cleanup()
      // 被信号终止（SIGKILL——cancel/超时）→ 「已停止」（对齐原 exec 语义：err.killed → 已停止）
      if (signal || code === null) reject(new Error('已停止（命令被中断）'))
      else if (code !== 0) reject(new Error(stderr ? `exit-${code}: ${stderr.slice(0, 500)}` : `exit-${code}`))
      else resolve({ stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 500) })
    })
    // 30s 超时（非长驻命令防挂死）；dev server（& 后台）shell 立即退出不算超时——后台进程留组内待 app 退出清理
    timer = setTimeout(() => {
      try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { /* 已退出 */ }
    }, 30000)
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
const BASH_READONLY_HEAD = new Set(['ls', 'cat', 'head', 'tail', 'grep', 'wc', 'pwd', 'echo', 'which', 'find', 'sed', 'awk', 'cd', 'stat', 'file', 'du', 'df', 'sort', 'uniq'])
export function isReadOnlyBash(cmd: string): boolean {
  const c = (cmd ?? '').trim()
  if (!c) return false
  // 含写副作用标记（重定向 / 写命令 / 可执行任意代码的解释器）→ 非只读
  if (/>\s*[^|]*$/m.test(c)) return false // 重定向到文件（echo x > f / cat a > b）
  if (/[;&|]\s*(rm|mv|cp|mkdir|touch|npm|pnpm|yarn|git|curl|wget|python|python3|node|write|install|unlink|ln|chmod|chown)/.test(c)) return false
  // 首命令在白名单 → 只读（cd "dir" && ls 也覆盖——head 取 cd）
  const head = c.split(/[;&|]/)[0].trim().split(/\s+/)[0]?.replace(/^sudo\s+/, '') ?? ''
  return BASH_READONLY_HEAD.has(head)
}

export const toolRegistry = new ToolRegistry()

// 2026-08-04 规划级授权强制：会话级「已规划」标记——plan_approval 被批准后置 true（write/edit 放行）
let planApprovedRef = false
export function markPlanApproved(): void { planApprovedRef = true }

// 注册 4 核心工具 + search（Layer2 CodeRAG——2026-08-02 接入模型；6 LSP 随 12 ContextEngine 注册）
export function initTools(): void {
  // risk（ticket 14）：none=L1 观察无需授权；low=L3 文件操作（写前快照可回滚）；high=L3 命令执行（高危单独确认）
  // 2026-08-04 v4：read 一律自动（读是低风险——Cursor/Codex 共识「读文件默认不需批准」）；沙箱内外区分核心在 write/edit（沙箱外永不信任）
  toolRegistry.register({ name: 'read', source: 'core', requiresApproval: false, risk: 'none', execute: readExecutor })
  toolRegistry.register({ name: 'write', source: 'core', requiresApproval: true, risk: 'low', execute: writeExecutor })
  toolRegistry.register({ name: 'edit', source: 'core', requiresApproval: true, risk: 'low', execute: editExecutor })
  toolRegistry.register({ name: 'bash', source: 'core', requiresApproval: true, risk: 'high', execute: bashExecutor, preApproval: (args) => ({ auto: isReadOnlyBash(String(args.command ?? '')) }) })
  // 2026-08-04 规划级授权：虚拟工具——不执行操作，renderer 收到后弹规划授权卡（用户批准后文件加入任务级信任，write/edit 自动放行）
  toolRegistry.register({ name: 'plan_approval', source: 'core', requiresApproval: false, risk: 'none', execute: async () => ({ ok: true, data: { virtual: true } }) })
  // Layer2 CodeRAG：关键词检索兜底（Claude Code grep 模式——2026-08-02 调研：agentic 工具检索为行业共识，见 .scratch/neonforge-v1/layer2-retrieval-research.md）
  toolRegistry.register({
    name: 'search',
    source: 'core',
    requiresApproval: false,
    risk: 'none',
    execute: (args, ctx) => codeRag.search(ctx?.rootPath ?? null, String(args.query ?? '')) as unknown as Promise<unknown>
  })
}

// 工具写文件回滚（write/edit 写前已快照 .nf-bak——回滚恢复原样；无快照返回错误）
export function revertToolFile(filePath: string): { ok: true } | { ok: false; error: string } {
  return revertFile(filePath)
}
