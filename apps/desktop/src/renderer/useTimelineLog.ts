// P1-05 阶段 5：会话时间线写入口（从 ConversationPanel 提取；行为不变）。
// tlog = 注册表校验 + dedupe + IPC 落盘；会话归属由 sessionId 决定。
import { useRef } from 'react'
import { validateTimelineEvent, TIMELINE_EVENT_SPECS, dedupeKey } from '../domain/timeline'

export type TimelineLog = (
  type: string,
  detail: Record<string, unknown>,
  role?: 'user' | 'assistant' | 'system' | 'tool',
) => void

export function useTimelineLog(sessionId: string): TimelineLog {
  // 2026-08-15 A6：dedupe 事件去重集合（会话级——同 detail 签名只记一次）
  const timelineDedupeRef = useRef<Set<string>>(new Set())
  const tlog: TimelineLog = (type, detail, role) => {
    // 2026-08-15 DDD 重建：事件注册表 dev 校验（A2——未登记 type / 缺载荷字段 → warn 防散落）
    try {
      for (const w of validateTimelineEvent(type, detail)) console.warn('[timeline]', w)
    } catch {
      /* 校验失败不影响发送 */
    }
    // 2026-08-15 A6：dedupe 事件去重（注册表 dedupe:true——同会话同 detail 签名只记一次；替代组件 cardShownRef 手动的通用机制）
    try {
      if (TIMELINE_EVENT_SPECS[type as keyof typeof TIMELINE_EVENT_SPECS]?.dedupe) {
        const k = dedupeKey(type, detail)
        if (timelineDedupeRef.current.has(k)) return
        timelineDedupeRef.current.add(k)
      }
    } catch {
      /* 去重失败不影响发送 */
    }
    // 2026-08-08 会话归属：session 用会话 ID（UUID——本组件挂载生成）——写入对应会话 timeline 文件
    try {
      void window.neonforge.timeline?.log?.({ session: sessionId, type, role, detail })
    } catch {
      /* 日志失败不影响 */
    }
  }
  return tlog
}
