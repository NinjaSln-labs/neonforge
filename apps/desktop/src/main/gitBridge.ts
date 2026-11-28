// BC-13 Git 只读桥：固定 argv + execFile（无 shell），只暴露 status/log/diff/branches。
// 写操作（add/commit/checkout/push…）不在此模块提供——必须经 BC-02 bash 授权卡。
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type GitReadAction = 'status' | 'log' | 'diff' | 'branches'

export interface GitStatusEntry {
  x: string
  y: string
  path: string
}

export interface GitStatusResult {
  branch: string | null
  dirty: boolean
  files: GitStatusEntry[]
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

const GIT_TIMEOUT_MS = 10_000
const MAX_DIFF_CHARS = 100_000

function runGit(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() || err.message
          reject(new Error(detail))
          return
        }
        resolve(stdout)
      },
    )
  })
}

export async function resolveRepoRoot(root: string): Promise<string> {
  const input = String(root ?? '').trim()
  if (!input) throw new Error('缺少项目路径')
  const resolved = path.resolve(input)
  const stat = await fs.stat(resolved)
  if (!stat.isDirectory()) throw new Error('项目路径不是目录')
  return resolved
}

async function assertGitRepo(root: string): Promise<string> {
  const resolved = await resolveRepoRoot(root)
  try {
    const inside = (await runGit(resolved, ['rev-parse', '--is-inside-work-tree'])).trim()
    if (inside !== 'true') throw new Error('not a work tree')
  } catch (e) {
    throw new Error(`不是 Git 仓库：${resolved}（${e instanceof Error ? e.message : String(e)}）`, {
      cause: e,
    })
  }
  return resolved
}

export async function gitStatus(root: string): Promise<GitStatusResult> {
  const cwd = await assertGitRepo(root)
  const out = await runGit(cwd, ['status', '--porcelain=v1', '-b'])
  let branch: string | null = null
  const files: GitStatusEntry[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const ref = line.slice(3).trim()
      branch = ref.split('...')[0]?.split(' ')[0] || null
      continue
    }
    // porcelain v1：XY<space>path（重命名行含 " -> "）
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const filePath = line.slice(3).trim()
    if (filePath) files.push({ x, y, path: filePath })
  }
  return { branch, dirty: files.length > 0, files }
}

export async function gitLog(root: string, limit = 10): Promise<GitLogEntry[]> {
  const cwd = await assertGitRepo(root)
  const n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)))
  const sep = '\x1f'
  const rec = '\x1e'
  const out = await runGit(cwd, [
    'log',
    `--format=%H${sep}%h${sep}%an${sep}%aI${sep}%s${rec}`,
    `-n`,
    String(n),
  ])
  return out
    .split(rec)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash = '', shortHash = '', author = '', date = '', subject = ''] = chunk.split(sep)
      return { hash, shortHash, author, date, subject }
    })
}

// 只允许工作区内的相对路径，防目录穿越
function resolveDiffPath(cwd: string, input: unknown): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const resolved = path.resolve(cwd, raw)
  if (resolved !== cwd && !resolved.startsWith(cwd + path.sep)) {
    throw new Error('diff 路径必须在项目内')
  }
  return path.relative(cwd, resolved)
}

export async function gitDiff(root: string, filePath?: string): Promise<string> {
  const cwd = await assertGitRepo(root)
  const rel = resolveDiffPath(cwd, filePath)
  const args = ['diff', '--no-color', '--no-ext-diff']
  if (rel) args.push('--', rel)
  const out = await runGit(cwd, args)
  return out.length > MAX_DIFF_CHARS ? `${out.slice(0, MAX_DIFF_CHARS)}\n…（diff 已截断）` : out
}

export async function gitBranches(root: string): Promise<string[]> {
  const cwd = await assertGitRepo(root)
  const out = await runGit(cwd, ['branch', '--list'])
  return out
    .split('\n')
    .map((line) => line.replace(/^\*?\s*/, '').trim())
    .filter(Boolean)
}

/** 统一入口（供 ToolRegistry / IPC 使用；未知动作拒绝）
 * 2026-11-28 审计：action 原为裸 string（GitReadAction 类型零引用）——收窄为 GitReadAction
 * 并在入口做一次运行时校验（IPC/工具参数来自模型输出，类型收窄不替代运行时边界）。 */
export async function gitRead(
  action: string,
  root: string,
  opts: { path?: unknown; limit?: unknown } = {},
): Promise<unknown> {
  if (!isGitReadAction(action)) {
    throw new Error(`不支持的 Git 只读动作：${action}（可用：status/log/diff/branches）`)
  }
  switch (action) {
    case 'status':
      return gitStatus(root)
    case 'log':
      return gitLog(root, Number(opts.limit) || 10)
    case 'diff':
      return gitDiff(root, opts.path != null ? String(opts.path) : undefined)
    case 'branches':
      return gitBranches(root)
  }
}

const GIT_READ_ACTIONS: readonly GitReadAction[] = ['status', 'log', 'diff', 'branches']

export function isGitReadAction(value: unknown): value is GitReadAction {
  return typeof value === 'string' && (GIT_READ_ACTIONS as readonly string[]).includes(value)
}
