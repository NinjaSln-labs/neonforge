import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { snapshot as takeSnapshot, revert as revertFile } from './applyDiff.js'
import { codeRag } from './codeRag.js'

// ToolRegistry（ticket 10 / A0 §2）：工具注册与执行分发
// 边界判定：ToolRegistry=目录与分发；ShellAgent=bash 执行；Gateway=工具调用修复（02 已实现）
// 授权（ticket 14 信任阶梯）：requiresApproval 工具（write/edit/bash）须显式 approved=true 才执行
// risk 等级：none=L1 观察（read/search/LSP 无需授权）；low=L3 文件操作（write/edit 写前快照可回滚）；high=L3 命令执行（bash 高危——永远单独确认）

export type ToolRisk = 'none' | 'low' | 'high'

export interface Tool {
  name: string
  source: 'core' | 'lsp'
  requiresApproval: boolean
  risk: ToolRisk
  execute: (args: Record<string, unknown>, ctx: { rootPath?: string }) => Promise<unknown>
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
}

class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
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
    if (tool.requiresApproval && !opts.approved) {
      return { ok: false, error: `「${name}」需要授权（L3）——approved=true 后执行` }
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
  return fs.readFile(resolvePath(args.path, ctx), 'utf-8')
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

// 当前活动 bash 子进程（ticket 14 可撤销：任何时刻停止当前操作——cancelActiveCommand kill）
let activeProc: { proc: import('child_process').ChildProcess; cmd: string } | null = null

async function bashExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  // V1 真实执行：授权（approved=true）后执行命令（child_process）——在项目根目录执行
  // 风险标注（ticket 14）：high 风险——本机进程执行；授权即同意本机执行；可随时停止（cancelActiveCommand）
  const { exec } = await import('child_process')
  const cmd = String(args.command ?? '')
  if (!cmd.trim()) throw new Error('bash: 缺少 command')
  return new Promise((resolve, reject) => {
    const child = exec(cmd, { cwd: ctx.rootPath ?? undefined, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (activeProc?.proc === child) activeProc = null
      if (err) {
        reject(new Error(err.killed ? `已停止（${cmd.slice(0, 40)}…）` : stderr ? `exit-${err.code}: ${stderr.slice(0, 500)}` : `exit-${err.code}`))
        return
      }
      resolve({ stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 500) })
    })
    activeProc = { proc: child, cmd }
  })
}

// 可撤销（ticket 14）：停止当前活动命令（bash 高危——任何时刻可停；无活动命令返回错误）
export function cancelActiveCommand(): { ok: true } | { ok: false; error: string } {
  if (!activeProc) return { ok: false, error: '无活动命令' }
  activeProc.proc.kill('SIGKILL')
  activeProc = null
  return { ok: true }
}

export const toolRegistry = new ToolRegistry()

// 注册 4 核心工具 + search（Layer2 CodeRAG——2026-08-02 接入模型；6 LSP 随 12 ContextEngine 注册）
export function initTools(): void {
  // risk（ticket 14）：none=L1 观察无需授权；low=L3 文件操作（写前快照可回滚）；high=L3 命令执行（高危单独确认）
  toolRegistry.register({ name: 'read', source: 'core', requiresApproval: false, risk: 'none', execute: readExecutor })
  toolRegistry.register({ name: 'write', source: 'core', requiresApproval: true, risk: 'low', execute: writeExecutor })
  toolRegistry.register({ name: 'edit', source: 'core', requiresApproval: true, risk: 'low', execute: editExecutor })
  toolRegistry.register({ name: 'bash', source: 'core', requiresApproval: true, risk: 'high', execute: bashExecutor })
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
