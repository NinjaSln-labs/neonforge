// ContextEngine（ticket 12 Layer1 组装）：@引用文件 → ContextPayload（精准文件片段）
// 边界：LSP 查询（lsp.ts 已做）；本模块=确定性组装 + 注入（直接读文件片段——零 token 成本，不走 LLM read）
// 对齐基线 §23：证据链——注入文件路径 + 截断标记可见
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export interface ContextFragment {
  path: string
  content: string
  truncated: boolean // 超过行数上限被截断（提示可见）
}

export interface ContextPayload {
  fragments: ContextFragment[]
}

const MAX_LINES = 150 // 单文件截断（A0 §5「LSP 上下文 5-30K」预算控制）
const MAX_FILES = 5 // 单次注入上限

export class ContextEngine {
  // resolve：@引用文件列表 → 片段（相对 rootPath 解析；缺失/不可读跳过）
  resolve(rootPath: string | null, files: string[]): ContextPayload {
    const fragments: ContextFragment[] = []
    const seen = new Set<string>()
    for (const f of files.slice(0, MAX_FILES)) {
      const p = resolveMentionPath(f, rootPath)
      if (!p || seen.has(p)) continue
      seen.add(p)
      const frag = readFragment(p)
      if (frag) fragments.push(frag)
    }
    return { fragments }
  }
}

export const context = new ContextEngine()

// @引用路径解析：真实绝对路径直接用；相对路径以 rootPath 为基准（无扩展名尝试常见后缀）
function resolveMentionPath(mention: string, rootPath: string | null): string | null {
  const p = String(mention ?? '').trim().replace(/^@/, '')
  if (!p) return null
  if (rootPath && (p.startsWith(rootPath) || existsSync(p))) return p
  if (rootPath) {
    const base = path.join(rootPath, p.replace(/^\/+/, ''))
    if (existsSync(base)) return base
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md', '.html']
    for (const e of exts) {
      const cand = base + e
      if (existsSync(cand)) return cand
    }
    return null
  }
  return existsSync(p) ? p : null
}

// 读文件片段（2MB 上限 + 行数截断）
function readFragment(p: string): ContextFragment | null {
  try {
    const st = statSync(p)
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return null
    const lines = readFileSync(p, 'utf-8').split(/\r?\n/)
    const truncated = lines.length > MAX_LINES
    return { path: p, content: lines.slice(0, MAX_LINES).join('\n'), truncated }
  } catch {
    return null
  }
}
