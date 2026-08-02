// diffRender（05 交付包执行层·目视 diff 审核视图——HANDOFF §3 第一优先剩余项 2026-08-02）
// 行级 diff 渲染单元：把 unified diff 文本解析为带类型的行（+绿/−红/空格灰/@@ 标题）
// 纯函数无 window/node 依赖——L1 可测；与 main/applyDiff.parseUnifiedDiff 分工：
//   parseUnifiedDiff（main）= 面向应用（变更集合 DiffChange[]）
//   parseDiffLines（renderer）= 面向渲染（行级分类，保留上下文行/标题）

export type DiffLineType = 'add' | 'del' | 'context' | 'hunk'

export interface DiffLine {
  type: DiffLineType
  content: string // 不含 +-/ 前缀的原始内容（hunk 为 @@ 行原文）
  oldLine?: number // 原文件行号（1-based，add 无）
  newLine?: number // 新文件行号（1-based，del 无）
}

// 解析统一 diff → 行级渲染单元（多 hunk 支持；不校验格式——渲染宽容）
export function parseDiffLines(diffText: string): DiffLine[] {
  const out: DiffLine[] = []
  const lines = diffText.split(/\r?\n/)
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // @@ -start,count +start,count @@
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldLine = m ? parseInt(m[1], 10) : 0
      newLine = m ? parseInt(m[2], 10) : 0
      inHunk = true
      out.push({ type: 'hunk', content: line })
      continue
    }
    if (!inHunk) continue // 文件头（---/+++ 等）跳过——不渲染
    if (line.startsWith('+')) {
      out.push({ type: 'add', content: line.slice(1), newLine })
      newLine++
    } else if (line.startsWith('-')) {
      out.push({ type: 'del', content: line.slice(1), oldLine })
      oldLine++
    } else if (line.startsWith(' ')) {
      out.push({ type: 'context', content: line.slice(1), oldLine, newLine })
      oldLine++
      newLine++
    } else if (line.trim() === '') {
      // diff 分隔空行——结束 hunk（渲染宽容：跳过）
      inHunk = false
    }
    // 其他（如 \ No newline at end of file）——忽略
  }
  return out
}
