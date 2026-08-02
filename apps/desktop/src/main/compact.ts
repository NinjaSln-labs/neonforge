// Compaction（ticket 11）：对话历史压缩策略——超长历史 → 摘要，保持上下文连续性
// 边界：Compaction=压缩策略与触发 + 保留最近 N 条；真实摘要经 Gateway.summarize（thinking=none 压缩请求）

export const COMPACT_THRESHOLD = 24 // 消息数超此值触发压缩候选
export const COMPACT_TARGET = 12 // 压缩后保留条数
export const COMPACT_KEEP_RECENT = 20 // ticket 11 AC：保留最近 20 条原始消息
export const COMPACT_MSG_LIMIT = 100 // ticket 11 AC：消息数 >100 触发
export const COMPACT_CHARS_LIMIT = 200 * 1000 // ticket 11 AC：tokens >200K（字符估算近似）

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

export interface CompactionService {
  // 触发判定（ticket 11 AC：消息数 >100 或 tokens >200K——字符估算近似；A0 §5 与 03/04/06/07 对齐）
  shouldCompact(history: Array<{ role: string; content: string | null }>): boolean
  // 执行压缩：返回 { summary（压缩器产出）, kept（保留最近 20 条原始） }——失败返回错误
  compact(
    apiKey: string,
    summarize: (k: string, h: Array<{ role: string; content: string | null }>) => Promise<{ ok: true; summary: string } | { ok: false; error: string }>,
    history: Array<{ role: string; content: string | null }>
  ): Promise<{ ok: true; summary: string; kept: Array<{ role: string; content: string | null }> } | { ok: false; error: string }>
}

// 字符估算 tokens（中文为主约 1 token/字——近似触发，非精确计量）
export function estimateTokens(history: Array<{ role: string; content: string | null }>): number {
  return history.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
}

export const compaction: CompactionService = {
  shouldCompact(history) {
    return history.length > COMPACT_MSG_LIMIT || estimateTokens(history) > COMPACT_CHARS_LIMIT
  },

  async compact(apiKey, summarize, history) {
    if (history.length <= COMPACT_KEEP_RECENT) return { ok: false, error: '历史不足——无需压缩' }
    const toCompact = history.slice(0, -COMPACT_KEEP_RECENT)
    const kept = history.slice(-COMPACT_KEEP_RECENT)
    const res = await summarize(apiKey, toCompact)
    if (!res.ok) return res
    return { ok: true, summary: res.summary, kept }
  }
}

