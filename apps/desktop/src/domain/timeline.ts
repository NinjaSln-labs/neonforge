// Session Timeline BC 领域层（2026-08-15 重建——领域事件体系，非日志打点）
// 原则（DDD）：领域事件 = 聚合状态变化的事实——转换（命令）后 diff 派生（Event Sourcing-lite），
// 任意状态转换自动产生对应事件——替代「散落打点」（组件 tlog 30+ 处逐个手写事件）。
// 事件目录对齐 docs/domain/06-domain-events.md（task.*/plan.*/tool.*/capability.*/execution.*/stuck.*/conversation.*/problem.*）
// 纯逻辑无 React 依赖——L1 可测。

import type { ConversationState, PendingKind } from './conversationState.js'

// === Value Object: TimelineEvent（统一事件结构——对齐 04 §2.6 / session-timeline-domain §2.1） ===
export interface TimelineEvent {
  ts: string          // ISO 时间戳（UTC）
  seq: number         // 会话内序号（单调递增）
  session: string     // 会话标识（UUID——多会话隔离）
  type: TimelineEventType
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail: Record<string, unknown>
}

// === 事件目录（领域事件穷举——新增事件必须在此登记，06 文档同步） ===
export type TimelineEventType =
  // —— Conversation 聚合：消息/会话 ——
  | 'conversation.message_sent'      // 用户消息（含确认词/候选点选）
  | 'conversation.assistant_start'   // 模型轮开始（载荷：forceTool 判定）
  | 'conversation.assistant_done'    // 模型轮完成（载荷：content/error）
  | 'conversation.interrupted'       // 打断（停止按钮/silent）
  // —— Task 聚合：确认点（06 §1.1）——
  | 'task.goal_proposed'             // 模型提议目标（【目标确认】标记）
  | 'task.goal_confirmed'            // 用户确认目标
  | 'task.goal_rejected'             // 用户重新描述
  | 'task.execution_proposed'        // 模型给出执行方案
  | 'task.execution_confirmed'       // 用户确认执行
  | 'task.execution_rejected'        // 用户修改方案
  | 'task.achievement_proposed'      // 模型汇报达成
  | 'task.achievement_confirmed'     // 用户确认解决
  | 'task.achievement_rejected'      // 用户还要改
  // —— Conversation 聚合：会话级单一 PENDING（06 §3.2 核心）——
  | 'session.pending_set'            // 卡弹出 → 会话进入 PENDING（载荷：kind）
  | 'session.pending_cleared'        // 用户决策 → PENDING 解除
  // —— PlannedFiles：宿主边界（06 §1.2）——
  | 'plan.approved'                  // approve-files 批准（载荷：files 新增清单——追加语义）
  | 'plan.rejected'                  // 写清单外被拒（载荷：file/approvedList——拒绝带边界）
  // —— ToolRegistry：工具（06 §1.3）——
  | 'tool.requested'                 // 模型请求工具（载荷：name/args）
  | 'tool.blocked'                   // 工具被拦（载荷：gate——pending/confirm/out-of-plan/policy + reason）
  | 'tool.executing'                 // 开始执行（载荷：name/approved）
  | 'tool.executed'                  // 成功（载荷：name/file?）
  | 'tool.failed'                    // 失败（载荷：name/error）
  | 'tool.approved'                  // 授权批准
  | 'tool.rejected'                  // 授权拒绝
  | 'tool.remembered'                // 允许并记住（任务信任）
  // —— Capability/Environment（06 §1.4）——
  | 'capability.checked'             // 能力检查（载荷：capabilities/missing）
  | 'environment.injected'           // 环境快照注入模型
  // —— 执行保障（06 §1.5）——
  | 'execution.forced'               // forceTool=true（确认后无产出强制）
  | 'execution.released'             // forceTool 释放
  | 'stuck.escalated'                // 连续无产出升级
  | 'stuck.needs_human'              // 升级仍无效转用户
  // —— Problem：问题台账（06 §1.7——2026-08-15 M3 建模）——
  | 'problem.created'                // 问题实例创建/复跑
  | 'problem.snapshot_updated'       // 快照回写（goal/authorized/pending）
  | 'problem.closed'                 // 确认关闭（终态）

// === 事件派生（Event Sourcing-lite）：转换前后状态 diff → 领域事件 ===
// 纯函数：任何 ConversationState 转换（userConfirmed/userRejected/approvalGranted/applyToolResult/setPending/clearPending）
// 自动产生对应事件——应用层在转换单点（useConversationState.transition）收集后发送。
export interface DerivedStateEvent {
  type: TimelineEventType
  detail: Record<string, unknown>
}

export function deriveStateEvents(prev: ConversationState, next: ConversationState): DerivedStateEvent[] {
  const events: DerivedStateEvent[] = []
  // —— 确认点（Task 聚合）——
  if (!prev.goalConfirmed && next.goalConfirmed) events.push({ type: 'task.goal_confirmed', detail: { point: 'goal' } })
  if (prev.goalConfirmed && !next.goalConfirmed) events.push({ type: 'task.goal_rejected', detail: { point: 'goal' } })
  if (!prev.executionConfirmed && next.executionConfirmed) events.push({ type: 'task.execution_confirmed', detail: { point: 'execution' } })
  if (prev.executionConfirmed && !next.executionConfirmed) events.push({ type: 'task.execution_rejected', detail: { point: 'execution' } })
  if (!prev.achievementConfirmed && next.achievementConfirmed) events.push({ type: 'task.achievement_confirmed', detail: { point: 'achievement' } })
  if (prev.achievementConfirmed && !next.achievementConfirmed) events.push({ type: 'task.achievement_rejected', detail: { point: 'achievement' } })
  // —— 会话级 PENDING（Conversation 聚合）——
  if (prev.pending === 'none' && next.pending !== 'none') events.push({ type: 'session.pending_set', detail: { kind: next.pending } })
  if (prev.pending !== 'none' && next.pending === 'none') events.push({ type: 'session.pending_cleared', detail: { kind: prev.pending } })
  // —— PlannedFiles：批准清单追加（plan.approved）——
  const addedFiles = [...next.plannedFiles].filter((f) => !prev.plannedFiles.has(f))
  if (addedFiles.length > 0) events.push({ type: 'plan.approved', detail: { files: addedFiles } })
  // —— 产出进度（producedFiles 新增——配合 tool.executed 的 file 载荷，此处记增量）——
  const addedProduced = [...next.producedFiles].filter((f) => !prev.producedFiles.has(f))
  if (addedProduced.length > 0) events.push({ type: 'tool.executed', detail: { files: addedProduced } })
  return events
}

// === Domain Service 接口：TimelineLogger（append + query——基础设施实现） ===
// 对齐 04 §3.5（append 便捷方法）+ 通用接入（A3 查询层——本规划 §二-A）
export interface TimelineLogger {
  append(event: Omit<TimelineEvent, 'ts' | 'seq'>): void
  query(filter: { session?: string; type?: TimelineEventType | TimelineEventType[]; from?: string; to?: string; limit?: number }): TimelineEvent[]
}
