// 结构化候选（2026-08-05 方案 3：候选按钮）——模型候选用 <candidates> 块输出，UI 渲染为可点击按钮
// 核心动机：用户从「回复序号」改为「点选文本」——消除模型对「序号→选项」的映射漂移
// （实测：模型列 1射击/2解谜/3建造，用户回 1，模型却理解成建造——需求确认错位 → 后续全错）
// 2026-08-14 用户实测修复（timeline 0219a516）：模型输出 <candidates> **漏闭合标签 </candidates>** →
// 候选按钮不渲染 + 剥离逻辑把块后正文（「关于目标…行不行？」）一并吞掉——用户只看到半截话、没有可选按钮。
// 容错：未闭合块解析到最后一个列表行（选项）；剥离只剥标记行+列表行，保留块后正文。

// 匹配 <candidates> 到 </candidates>（大小写不敏感）
const BLOCK_RE = /<candidates>([\s\S]*?)<\/candidates>/gi

// 选项行判定（未闭合块的边界识别——列表前缀行是选项；纯文本行歧义，保守视为正文/块外）
const isOptionLine = (t: string): boolean =>
  /^[-*+]/.test(t) || /^\d+[.)、]/.test(t) || /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)

// 选项行清洗（去列表/序号/圈号前缀）
const cleanOption = (t: string): string =>
  t
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .trim()

// 闭合块内解析：所有非空行都算选项（含纯文本行——2026-08-05 测试锁定）
const parseClosedOptions = (body: string): string[] | null => {
  const options = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(cleanOption)
    .filter(Boolean)
  return options.length > 0 ? options : null
}

// 未闭合块容错解析：<candidates> 后取到最后一个列表行（列表行后遇正文 = 块结束）
const parseUnclosedOptions = (rest: string): string[] | null => {
  const opts: string[] = []
  let sawOption = false
  for (const line of rest.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (isOptionLine(t)) {
      opts.push(cleanOption(t))
      sawOption = true
    } else if (sawOption) break // 列表行之后遇正文 → 块结束
    // 未见选项时的非列表行（块内前导说明）——跳过
  }
  return opts.length > 0 ? opts : null
}

// 解析候选块 → 选项数组；无有效块返回 null
export function parseCandidates(content: string): string[] | null {
  const m = BLOCK_RE.exec(content)
  BLOCK_RE.lastIndex = 0
  if (m) return parseClosedOptions(m[1])
  // 2026-08-14 容错：未闭合块（模型漏 </candidates>——done 消息常态容错）→ 取到最后一个列表行
  const openIdx = content.search(/<candidates>/i)
  if (openIdx === -1) return null
  return parseUnclosedOptions(content.slice(openIdx + '<candidates>'.length))
}

// 剥离候选块（展示层——用户看到正文不含标记）；未闭合块剥标记行+选项行、保留块后正文（不露标记杂音、不吞正文）
export function stripCandidates(content: string): string {
  // 完整块：整体移除
  const closed = content.replace(BLOCK_RE, '')
  // 未闭合块：剥 <candidates> 行 + 其后的选项列表行；选项行之后的正文（含空行）全部保留
  return closed
    .replace(/<candidates>[\s\S]*$/gi, (block) => {
      const lines = block.split('\n')
      const kept: string[] = []
      let sawOption = false
      for (let i = 1; i < lines.length; i++) {
        const t = lines[i].trim()
        if (isOptionLine(t)) {
          sawOption = true
          continue
        } // 选项行剥
        if (sawOption) {
          kept.push(lines[i])
          continue
        } // 块后正文（含空行）保留
        if (t === '') continue // 未见选项时的空行剥
        kept.push(lines[i]) // 未见选项时的正文（块内前导说明）——保留
      }
      return kept.join('\n')
    })
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// 2026-08-05：通用去标签（展示层兜底）——模型会自发发明尖括号标签（实测 <one-question>，模仿 <candidates> 模式）
// 策略：去标签本身、保留内容（<one-question>问题</one-question> → 问题）；不处理 <candidates>（已被 stripCandidates 前置移除/转按钮）
export function stripTags(content: string): string {
  return content
    .replace(/<\/?[a-z][a-z0-9-]*>/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
