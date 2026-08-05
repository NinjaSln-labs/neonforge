// 结构化候选（2026-08-05 方案 3：候选按钮）——模型候选用 <candidates> 块输出，UI 渲染为可点击按钮
// 核心动机：用户从「回复序号」改为「点选文本」——消除模型对「序号→选项」的映射漂移
// （实测：模型列 1射击/2解谜/3建造，用户回 1，模型却理解成建造——需求确认错位 → 后续全错）

// 匹配 <candidates> 到 </candidates>（大小写不敏感）
const BLOCK_RE = /<candidates>([\s\S]*?)<\/candidates>/gi

// 解析候选块 → 选项数组（去行首 - / * / 数字. / 数字、 / ①②③ 前缀，去空行）；无有效块返回 null
export function parseCandidates(content: string): string[] | null {
  const m = BLOCK_RE.exec(content)
  BLOCK_RE.lastIndex = 0
  if (!m) return null
  const options = m[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line
      .replace(/^[-*+]\s+/, '')          // - / * / + 列表前缀
      .replace(/^\d+[.)、]\s*/, '')       // 1. / 1) / 1、 序号前缀
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '') // 圈号前缀
      .trim())
    .filter(Boolean)
  return options.length > 0 ? options : null
}

// 剥离候选块（展示层——用户看到正文不含标记）；未闭合块（流式中）也剥离到结尾，不露标记杂音
export function stripCandidates(content: string): string {
  // 完整块：整体移除
  const closed = content.replace(BLOCK_RE, '')
  // 流式未闭合：<candidates> 出现后（到闭合前的残留/结尾）移除
  return closed.replace(/<candidates>[\s\S]*$/gi, '').replace(/\n{2,}/g, '\n').trim()
}

// 2026-08-05：通用去标签（展示层兜底）——模型会自发发明尖括号标签（实测 <one-question>，模仿 <candidates> 模式）
// 策略：去标签本身、保留内容（<one-question>问题</one-question> → 问题）；不处理 <candidates>（已被 stripCandidates 前置移除/转按钮）
export function stripTags(content: string): string {
  return content
    .replace(/<\/?[a-z][a-z0-9-]*>/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
