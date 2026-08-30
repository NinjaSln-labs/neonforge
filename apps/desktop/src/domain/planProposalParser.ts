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
 * 无空白字符 = 合法路径（相对/绝对/目录）；含空白必须带文件扩展名（中文文件名容错——如「docs/我的 文件.md」）
 * 2026-08-22 #6 真机复验（问题 B）：中文无空格长句非路径——模型【执行方案】块的「关键假设/验证计划」节
 * 行（「数据用浏览器自带的本地存储（localStorage），关掉网页再开，待办还在」）无空白被误判路径
 * → 污染 plannedFiles + plan.approved 提前。加排除：含句读（，。；：！？）、超长中文（>16 字）、
 * 括号内容（非路径注释形态）→ 非路径 */
export function isLikelyPath(p: string): boolean {
  const s = String(p ?? '').trim()
  if (!s) return false
  // 自然语言句读（中文逗号/句号/分号/冒号/感叹/问号 + 英文逗号）——不是路径
  if (/[，。；：！？、,]/.test(s)) return false
  // 无空白：相对/绝对/目录（src/、assets、game.js、/a/b.html）——但中文无空白长串是自然语言句
  if (!/\s/.test(s)) {
    // 含中文 + 无 / + 无扩展名 + 超短阈值（>6 字）→ 自然语言句（关键假设/验证计划内容）
    // 合法中文路径形态：短（≤6 字）或带扩展名（如「数据.md」「我的文件」目录）或含 /（src/数据）
    if (
      s.length > 6 &&
      /[\u4e00-\u9fa5]/.test(s) &&
      !s.includes('/') &&
      !/\.[a-zA-Z0-9]{1,5}$/.test(s)
    )
      return false
    return true
  }
  return /\.[a-zA-Z0-9]{1,5}$/.test(s) // 含空白但带扩展名（中文文件名容错）
}

/** 「关键假设：」节提取（A-008 单源——parsePlanProposal 内部与 renderer 目标提议共用；
 * 任意文本中的「关键假设：」→ `- ` 行列表；无节 → 空数组。§8.1 C ⑬ 契约） */
export function extractAssumptionsSection(text: string): string[] {
  const block = text.match(/关键假设[:：]([\s\S]*?)(?:【|$)/)
  if (!block) return []
  return block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•]\s*/.test(l))
    .map((l) => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
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

/** 路径 + 原因拆分：「a.js（改入口）」→ path=a.js, reason=改入口；「a.js」→ reason=''
 * #6 真机 2026-08-30（复验轮新发现）：模型两种新形态此前解析失败（整行当路径 → 含句读判非路径 → malformed → 空卡）：
 * ① 原因写在冒号后：「新建 index.html（单文件）：顶部输入框+添加按钮」
 * ② 行首动词前缀：「新建 index.html」
 * 处理序：冒号分节（保 http:// ）→ 剥尾随括号注释 → 剥行首动词 */
export function splitPathReason(line: string): { path: string; reason: string } {
  let s = line.trim()
  let reason = ''
  // ① 冒号右侧为说明（跳过 http:// 的协议冒号——左侧含 :// 不分节）
  const ci = s.search(/[：:]/)
  if (ci > 0 && !/:\/\//.test(s.slice(0, ci + 1))) {
    const right = s.slice(ci + 1).trim()
    s = s.slice(0, ci).trim()
    if (right) reason = right
  }
  // ② 尾随括号注释 → 原因（前置）
  const pm = s.match(/\s*[（(]([^（）]*)[）)]\s*$/)
  if (pm) {
    const inner = pm[1].trim()
    if (inner) reason = inner + (reason ? '：' + reason : '')
    s = s.slice(0, pm.index).trim()
  }
  // ③ 行首动词前缀（「新建 index.html」→「index.html」）
  s = s.replace(/^(新建|创建|修改|更新|删除|新增|添加|改|加)\s+/, '')
  return { path: s, reason }
}
