// CodeRAG（ticket 12 Layer2 V1 降级）：关键词检索兜底——仅 LSP/@引用 不够时启用
// V1 标注降级：不建向量索引（0-20K 预算；确定性大小写不敏感子串匹配，扫描上限防膨胀）
// 边界：ContextEngine=上下文注入；RAG=语义兜底（接口 + 轻量实现，向量索引后续）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.DS_Store'])
const MAX_FILES = 200 // 扫描上限（防大项目膨胀）
const MAX_MATCH = 5 // 返回片段上限
const MAX_FILE_KB = 200 // 单文件大小上限（KB）
const SNIPPET_LINES = 40 // 单片段行数
const SNIPPET_MAX_CHARS = 800

export interface RagHit {
  path: string
  line: number // 1-based 命中行
  snippet: string
}

export class CodeRag {
  // query 关键词（≥2 字符，取前 5 个）→ 匹配片段（每文件最多 1 条——防重复膨胀）
  search(rootPath: string | null, query: string): { hits: RagHit[]; note?: string } {
    if (!rootPath) return { hits: [], note: '无项目' }
    const keywords = String(query ?? '')
      .split(/\s+/)
      .filter((k) => k.length >= 2)
      .slice(0, 5)
      .map((k) => k.toLowerCase())
    if (keywords.length === 0) return { hits: [], note: '无有效关键词' }
    const hits: RagHit[] = []
    let scanned = 0
    const walk = (dir: string): void => {
      if (hits.length >= MAX_MATCH || scanned >= MAX_FILES) return
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        if (hits.length >= MAX_MATCH || scanned >= MAX_FILES) return
        if (name.startsWith('.') || IGNORE.has(name)) continue
        const full = path.join(dir, name)
        let isDir: boolean
        try {
          isDir = statSync(full).isDirectory()
        } catch {
          continue
        }
        if (isDir) {
          walk(full)
          continue
        }
        scanned++
        try {
          const st = statSync(full)
          if (st.size > MAX_FILE_KB * 1024) continue
          const lines = readFileSync(full, 'utf-8').split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            const lower = lines[i].toLowerCase()
            if (keywords.some((k) => lower.includes(k))) {
              hits.push({
                path: full,
                line: i + 1,
                snippet: lines
                  .slice(i, i + SNIPPET_LINES)
                  .join('\n')
                  .slice(0, SNIPPET_MAX_CHARS),
              })
              break // 每文件一条
            }
          }
        } catch {
          /* 跳过不可读文件 */
        }
      }
    }
    walk(rootPath)
    return { hits }
  }
}

export const codeRag = new CodeRag()
