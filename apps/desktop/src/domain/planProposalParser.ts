// 方案提议解析（S2——设计 §3.3 + §8.1 C ⑭）
// 替代 parseExecutionPlan（裸文件集合）——结构化解析【执行方案】块：
//   【执行方案】
//   - 文件路径（原因）
//   - 文件路径2（原因）
//   关键假设：
//   - 假设行...
//   验证计划：
//   - 验证行...
// → PlanProposal（summary + files[{path,reason}] + assumptions + verificationPlan）
// 坑 102 路径过滤继承（垃圾条目不进清单——无空白=合法；含空白必须带扩展名）
// 失败降级（C3 修正——模型格式漂移是常态）：
//   ok=false → 不产生决策点（卡不弹）+ 打诊断事件（parse-error: reason）
// 纯逻辑无 React 依赖——L1 可测。

import type { PlanProposal } from './conversationState.js'

/** 路径形态判定（坑 102 共享——与 agentLoop.parseExecutionPlan 同源；旧函数 S3 移除后此处为唯一实现）：
 * 无空白字符 = 合法路径（相对/绝对/目录）；含空白必须带文件扩展名（中文文件名容错——如「docs/我的 文件.md」） */
export function isLikelyPath(p: string): boolean {
  if (!/\s/.test(p)) return true // 无空白：相对/绝对/目录（src/、assets、game.js、/a/b.html）
  return /\.[a-zA-Z0-9]{1,5}$/.test(p) // 含空白但带扩展名（中文文件名容错）
}

/**
 * 结构化解析【执行方案】块 → PlanProposal。
 * - 无【执行方案】标记 → { ok: false, reason: 'no-block' }（不产生决策点）
 * - 有标记但无合法文件行 → { ok: false, reason: 'malformed' }
 * - 假设/验证计划为可选节（缺省空数组——解析不失败，仅内容不完整）
 */
export function parsePlanProposal(
  text: string,
): { ok: true; proposal: PlanProposal } | { ok: false; reason: 'no-block' | 'malformed' } {
  const block = text.match(/【执行方案】([\s\S]*?)(?:【|$)/)
  if (!block) return { ok: false, reason: 'no-block' }
  const region = block[1]

  // 分节：文件清单（- 行）/ 关键假设 / 验证计划
  const files: Array<{ path: string; reason: string }> = []
  const assumptions: string[] = []
  const verificationPlan: string[] = []
  let section: 'files' | 'assumptions' | 'verification' = 'files'
  let summary = ''

  for (const line of region.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^关键假设[:：]/.test(trimmed)) {
      section = 'assumptions'
      continue
    }
    if (/^验证计划[:：]/.test(trimmed)) {
      section = 'verification'
      continue
    }
    const item = trimmed.match(/^[-•]\s*(.+)$/)
    if (section === 'files') {
      if (!item) {
        // 非清单行（如开头的一句话方案）→ 收集为 summary（首个非列表行）
        if (!summary && files.length === 0) summary = trimmed
        continue
      }
      const { path, reason } = splitPathReason(item[1].trim())
      if (path && isLikelyPath(path)) files.push({ path, reason })
    } else if (section === 'assumptions') {
      if (item) assumptions.push(item[1].trim())
    } else if (section === 'verification') {
      if (item) verificationPlan.push(item[1].trim())
    }
  }

  if (files.length === 0) return { ok: false, reason: 'malformed' }
  return {
    ok: true,
    proposal: { summary, files, assumptions, verificationPlan },
  }
}

/** 路径 + 原因拆分（「a.js（改入口）」→ path=a.js, reason=改入口；「a.js」→ reason=''） */
export function splitPathReason(line: string): { path: string; reason: string } {
  const m = line.match(/^(.+?)(?:\s*[（(](.*?)[）)])?\s*$/)
  if (!m) return { path: line, reason: '' }
  return { path: m[1].trim(), reason: (m[2] ?? '').trim() }
}
