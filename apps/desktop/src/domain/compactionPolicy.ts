// 对话压缩策略单源（2026-11-28 审计：原 src/main/compact.ts 的 COMPACT_THRESHOLD/COMPACT_TARGET/
// compactHint 与 ConversationPanel.tsx 内联的 24/12 阈值和文案构成双源漂移风险——渲染层无法导入
// main 模块，故收敛到 domain，main 与 renderer 共同导入）。
// 生产触发判定仍是 compaction.shouldCompact（消息 >100 或字符 >200K），与 UI 提示阈值语义不同：
// 提示阈值 = 用户可见「历史已长」的温和提示；触发阈值 = 真正执行压缩。

/** UI 提示阈值：对话消息数超过此值，展示「将压缩」温和提示（不触发真实压缩） */
export const COMPACT_HINT_THRESHOLD = 24
/** UI 提示保留条数：提示文案中的「保留最近 N 条」 */
export const COMPACT_HINT_KEEP = 12

/** 对话历史超长提示文案（null = 未超阈值，不展示） */
export function compactHint(messageCount: number): string | null {
  if (messageCount <= COMPACT_HINT_THRESHOLD) return null
  return `对话已超过 ${COMPACT_HINT_THRESHOLD} 条——将压缩前 ${messageCount - COMPACT_HINT_KEEP} 条为摘要（上下文不丢）`
}
