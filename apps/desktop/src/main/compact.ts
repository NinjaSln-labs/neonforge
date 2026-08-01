// Compaction（ticket 11）：对话历史压缩策略——超长历史 → 摘要，保持上下文连续性
// 边界：Compaction=压缩策略与触发；真实摘要经 Gateway（thinking=none 压缩请求）——02 已实现

export const COMPACT_THRESHOLD = 24 // 消息数超此值触发压缩候选
export const COMPACT_TARGET = 12 // 压缩后保留条数

export interface CompactDecision {
  shouldCompact: boolean
  keep: number // 保留最近 N 条
  drop: number // 压缩掉 N 条
}

export function decideCompact(messageCount: number): CompactDecision {
  if (messageCount <= COMPACT_THRESHOLD) return { shouldCompact: false, keep: messageCount, drop: 0 }
  return { shouldCompact: true, keep: COMPACT_TARGET, drop: messageCount - COMPACT_TARGET }
}

// 摘要提示文案（renderer 展示用）
export function compactHint(messageCount: number): string | null {
  const d = decideCompact(messageCount)
  if (!d.shouldCompact) return null
  return `对话已超过 ${COMPACT_THRESHOLD} 条——将压缩前 ${d.drop} 条为摘要（保留最近 ${d.keep} 条，上下文不丢）`
}
