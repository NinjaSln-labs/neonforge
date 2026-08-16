// applyDiff：统一 diff 解析 + 应用 + 快照回滚（05 交付包执行层 A1）
// V1 支持：行级新增/删除/替换（统一 diff 格式）；复杂变更（重命名/二进制）返回不支持
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export interface DiffChange {
  line: number // 目标行号（1-based——原始文件）
  type: 'add' | 'del' | 'replace'
  content: string // 新增/替换的内容（del 为空）
}

// 解析统一 diff 文本 → 变更集合（多 hunk 支持——按原始文件行号）
export function parseUnifiedDiff(diffText: string): DiffChange[] {
  const lines = diffText.split(/\r?\n/)
  const changes: DiffChange[] = []
  let targetLine = 0 // 当前 hunk 的目标起始行（1-based）
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // @@ -start,count +start,count @@
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      targetLine = m ? parseInt(m[1], 10) : 0
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('---') || line.startsWith('+++')) continue
    if (line.startsWith('+')) {
      changes.push({ line: targetLine, type: 'add', content: line.slice(1) })
      targetLine++
    } else if (line.startsWith('-')) {
      changes.push({ line: targetLine, type: 'del', content: '' })
      // 删除不推进目标行（下一行仍在该行号）
    } else if (line.startsWith(' ')) {
      targetLine++ // 上下文行——推进
    } else if (line.trim() === '') {
      // 空行（diff 分隔）——结束 hunk
      inHunk = false
    }
  }
  return changes
}

// 应用变更到文件（从后往前应用——行号不偏移）
export function applyDiffToFile(
  filePath: string,
  changes: DiffChange[]
): { ok: true; file: string } | { ok: false; error: string } {
  if (!existsSync(filePath)) return { ok: false, error: `文件不存在: ${filePath}` }
  let contentLines: string[]
  try {
    contentLines = readFileSync(filePath, 'utf-8').split(/\r?\n/)
  } catch (e) {
    return { ok: false, error: `读取失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  // 按行号分组——从后往前应用
  const byLine = new Map<number, DiffChange[]>()
  for (const c of changes) {
    if (c.line < 1 || c.line > contentLines.length + 1) continue
    if (!byLine.has(c.line)) byLine.set(c.line, [])
    byLine.get(c.line)!.push(c)
  }

  const sorted = [...byLine.keys()].sort((a, b) => b - a)
  for (const ln of sorted) {
    const group = byLine.get(ln)!
    // 同一行：del + add = replace；仅 add = 插入；仅 del = 删除
    const hasDel = group.some((c) => c.type === 'del')
    const adds = group.filter((c) => c.type === 'add')
    if (hasDel && adds.length > 0) {
      // replace：删除原行，插入新增
      contentLines.splice(ln - 1, 1, ...adds.map((c) => c.content))
    } else if (adds.length > 0) {
      contentLines.splice(ln - 1, 0, ...adds.map((c) => c.content))
    } else if (hasDel) {
      contentLines.splice(ln - 1, 1)
    }
  }

  try {
    writeFileSync(filePath, contentLines.join('\n'), 'utf-8')
  } catch (e) {
    return { ok: false, error: `写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, file: filePath }
}

// 写前快照（<file>.nf-bak——原内容）
export function snapshot(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const bak = filePath + '.nf-bak'
    writeFileSync(bak, readFileSync(filePath, 'utf-8'), { mode: 0o600 })
    return bak
  } catch {
    return null
  }
}

// 从快照恢复
export function revert(filePath: string): { ok: true } | { ok: false; error: string } {
  const bak = filePath + '.nf-bak'
  if (!existsSync(bak)) return { ok: false, error: `无快照可回滚: ${filePath}` }
  try {
    writeFileSync(filePath, readFileSync(bak, 'utf-8'), 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `回滚失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}
