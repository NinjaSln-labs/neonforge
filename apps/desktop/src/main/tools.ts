import { promises as fs } from 'fs'
import path from 'path'

// ToolRegistry（ticket 10 / A0 §2）：工具注册与执行分发
// 边界判定：ToolRegistry=目录与分发；ShellAgent=bash 执行；Gateway=工具调用修复（02 已实现）
// 授权：requiresApproval 工具（write/edit/bash）须显式 approved=true 才执行（对齐基线 §10 信任阶梯）

export interface Tool {
  name: string
  source: 'core' | 'lsp'
  requiresApproval: boolean
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

  list(): Array<{ name: string; source: Tool['source']; requiresApproval: boolean }> {
    return [...this.tools.values()].map(({ name, source, requiresApproval }) => ({ name, source, requiresApproval }))
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
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

// 工具执行器（4 核心）
function resolvePath(p: unknown, ctx: { rootPath?: string }): string {
  const pStr = String(p ?? '')
  if (!pStr) throw new Error('缺少路径参数')
  // 以 rootPath 为基准（模型返回的相对/类绝对路径如 /package.json → 项目根下）
  if (ctx.rootPath) return path.join(ctx.rootPath, pStr.replace(/^\/+/, ''))
  if (path.isAbsolute(pStr)) return pStr
  throw new Error('路径需为绝对路径或提供 rootPath')
}

function readExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  return fs.readFile(resolvePath(args.path, ctx), 'utf-8')
}

async function writeExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  const filePath = resolvePath(args.path, ctx)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, String(args.content ?? ''), 'utf-8')
  return { file: filePath, bytes: String(args.content ?? '').length }
}

async function editExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  const filePath = resolvePath(args.path, ctx)
  const oldText = String(args.old ?? '')
  const newText = String(args.new ?? '')
  const content = await fs.readFile(filePath, 'utf-8')
  if (!content.includes(oldText)) throw new Error(`未找到待替换内容（path: ${filePath}）`)
  await fs.writeFile(filePath, content.replace(oldText, newText), 'utf-8')
  return { file: filePath }
}

async function bashExecutor(args: Record<string, unknown>, ctx: { rootPath?: string }): Promise<unknown> {
  // V1 真实执行：授权（approved=true）后执行命令（child_process）——在项目根目录执行
  // 风险标注：本机进程执行——ShellAgent 沙箱归后续；授权即同意本机执行
  const { exec } = await import('child_process')
  const cmd = String(args.command ?? '')
  if (!cmd.trim()) throw new Error('bash: 缺少 command')
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: ctx.rootPath ?? undefined, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr ? `exit-${err.code}: ${stderr.slice(0, 500)}` : `exit-${err.code}`))
        return
      }
      resolve({ stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 500) })
    })
  })
}

export const toolRegistry = new ToolRegistry()

// 注册 4 核心工具（6 LSP 随 12 ContextEngine 注册）
export function initTools(): void {
  toolRegistry.register({ name: 'read', source: 'core', requiresApproval: false, execute: readExecutor })
  toolRegistry.register({ name: 'write', source: 'core', requiresApproval: true, execute: writeExecutor })
  toolRegistry.register({ name: 'edit', source: 'core', requiresApproval: true, execute: editExecutor })
  toolRegistry.register({ name: 'bash', source: 'core', requiresApproval: true, execute: bashExecutor })
}
