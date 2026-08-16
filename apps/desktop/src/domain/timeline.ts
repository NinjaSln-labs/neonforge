// Session Timeline BC 领域层（2026-08-15 重建——领域事件体系，非日志打点）
// 原则（DDD）：领域事件 = 聚合状态变化的事实——转换（命令）后 diff 派生（Event Sourcing-lite），
// 任意状态转换自动产生对应事件——替代「散落打点」（组件 tlog 30+ 处逐个手写事件）。
// 事件目录对齐 docs/domain/06-domain-events.md（task.*/plan.*/tool.*/capability.*/execution.*/stuck.*/conversation.*/problem.*）
// 纯逻辑无 React 依赖——L1 可测。

import type { ConversationState } from './conversationState.js'

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
  | 'capability.ledger_updated'      // Ledger 回填（载荷：capabilityId/ok——bash 失败归因降级）
  | 'environment.injected'           // 环境快照注入模型
  // —— Conversation 聚合：会话生命周期（06 §1.6）——
  | 'conversation.created'           // 会话创建（sessionId 生成）
  // —— 执行保障（06 §1.5）——
  | 'execution.forced'               // forceTool=true（确认后无产出强制）
  | 'execution.released'             // forceTool 释放
  | 'stuck.escalated'                // 连续无产出升级
  | 'stuck.needs_human'              // 升级仍无效转用户
  // —— Problem：问题台账（06 §1.7——2026-08-15 M3 建模）——
  | 'problem.created'                // 问题实例创建/复跑
  | 'problem.rerun'                  // closed 复开 → 复跑（新 Task 关联同一 Problem）
  | 'problem.snapshot_updated'       // 快照回写（goal/authorized/pending）
  | 'problem.closed'                 // 确认关闭（终态）
  // —— Card：确认/授权卡 UI 生命周期（用户交互路径可观测——2026-08-15 补全）——
  | 'card.shown'                     // 卡弹出（载荷：card/name?/args?）
  | 'card.resolved'                  // 卡被确认/批准（载荷：card/action）
  | 'card.rejected'                  // 卡被拒绝（载荷：card/action）
  | 'card.dismissed'                 // 卡消失/任务重置（载荷：card/cause）
  // —— Decision：领域决策点（意图确认重设计 §3.5——与 card.* 并存：card=UI 卡生命周期，decision=领域决策点）——
  | 'decision.requested'             // 决策点出现（载荷：kind/since——决策点内容快照随 S3 增强）
  | 'decision.resolved'              // 决策被确认/拒绝（载荷：point/action——reason 随 S3 回填）
  // —— 元事件（运行时可观测——诊断/状态）——
  | 'conversation.status_change'     // working/ready/approval-pending 变化
  | 'conversation.error'             // 错误链路（errorType/message）
  | 'execution.force_input'          // forceTool 输入快照（取证——planned/produced/projectFiles 三集合）

// === 事件注册表（schema——新增事件三步：登记 → emit → 测试；dev 校验防散落） ===
export interface TimelineEventSpec {
  domain: 'conversation' | 'task' | 'session' | 'plan' | 'tool' | 'capability' | 'execution' | 'stuck' | 'problem' | 'card' | 'decision'
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detailKeys?: string[] // 期望载荷字段（宽松约定——不强制全有，用于 dev 校验提示）
  dedupe?: boolean      // 同会话同 detail 只记一次（卡 shown 等）
}

export const TIMELINE_EVENT_SPECS: Record<TimelineEventType, TimelineEventSpec> = {
  'conversation.message_sent': { domain: 'conversation', role: 'user', detailKeys: ['content'] },
  'conversation.assistant_start': { domain: 'conversation', role: 'assistant', detailKeys: ['forceTool'] },
  'conversation.assistant_done': { domain: 'conversation', role: 'assistant', detailKeys: ['content'] },
  'conversation.interrupted': { domain: 'conversation', role: 'system', detailKeys: ['source'] },
  'task.goal_proposed': { domain: 'task', role: 'assistant', detailKeys: ['goalText'] },
  'task.goal_confirmed': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'task.goal_rejected': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'task.execution_proposed': { domain: 'task', role: 'assistant', detailKeys: ['plan', 'files'] },
  'task.execution_confirmed': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'task.execution_rejected': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'task.achievement_proposed': { domain: 'task', role: 'assistant', detailKeys: ['summary'] },
  'task.achievement_confirmed': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'task.achievement_rejected': { domain: 'task', role: 'system', detailKeys: ['point'] },
  'session.pending_set': { domain: 'session', role: 'system', detailKeys: ['kind'] },
  'session.pending_cleared': { domain: 'session', role: 'system', detailKeys: ['kind'] },
  'plan.approved': { domain: 'plan', role: 'system', detailKeys: ['files'] },
  'plan.rejected': { domain: 'plan', role: 'tool', detailKeys: ['file'] },
  'tool.requested': { domain: 'tool', role: 'tool', detailKeys: ['name', 'args'] },
  'tool.blocked': { domain: 'tool', role: 'tool', detailKeys: ['name', 'gate', 'reason'] },
  'tool.executing': { domain: 'tool', role: 'tool', detailKeys: ['name', 'approved'] },
  'tool.executed': { domain: 'tool', role: 'tool', detailKeys: ['name', 'file'] },
  'tool.failed': { domain: 'tool', role: 'tool', detailKeys: ['name', 'error'] },
  'tool.approved': { domain: 'tool', role: 'system', detailKeys: ['name'] },
  'tool.rejected': { domain: 'tool', role: 'system', detailKeys: ['name'] },
  'tool.remembered': { domain: 'tool', role: 'system', detailKeys: ['name', 'file'] },
  'capability.checked': { domain: 'capability', role: 'tool', detailKeys: ['capabilities', 'missing'] },
  'capability.ledger_updated': { domain: 'capability', role: 'tool', detailKeys: ['capabilityId', 'ok'] },
  'environment.injected': { domain: 'capability', role: 'system', detailKeys: ['rootPath'] },
  'conversation.created': { domain: 'conversation', role: 'system', detailKeys: ['session'] },
  'execution.forced': { domain: 'execution', role: 'system', detailKeys: ['reason'] },
  'execution.released': { domain: 'execution', role: 'system', detailKeys: ['reason'] },
  'stuck.escalated': { domain: 'stuck', role: 'system', detailKeys: ['message'] },
  'stuck.needs_human': { domain: 'stuck', role: 'system', detailKeys: ['message'] },
  'problem.created': { domain: 'problem', role: 'system', detailKeys: ['problemId', 'title'] },
  'problem.rerun': { domain: 'problem', role: 'system', detailKeys: ['problemId', 'title'] },
  'problem.snapshot_updated': { domain: 'problem', role: 'system', detailKeys: ['problemId'] },
  'problem.closed': { domain: 'problem', role: 'system', detailKeys: ['problemId'] },
  'card.shown': { domain: 'card', role: 'system', detailKeys: ['card'], dedupe: true },
  'card.resolved': { domain: 'card', role: 'system', detailKeys: ['card', 'action'] },
  'card.rejected': { domain: 'card', role: 'system', detailKeys: ['card', 'action'] },
  'card.dismissed': { domain: 'card', role: 'system', detailKeys: ['card', 'cause'] },
  'decision.requested': { domain: 'decision', role: 'system', detailKeys: ['kind', 'since'] },
  'decision.resolved': { domain: 'decision', role: 'system', detailKeys: ['point', 'action'] },
  'conversation.status_change': { domain: 'conversation', role: 'system', detailKeys: ['status'] },
  'conversation.error': { domain: 'conversation', role: 'system', detailKeys: ['errorType'] },
  'execution.force_input': { domain: 'execution', role: 'system', detailKeys: ['planned', 'produced'] },
}

// dev 校验（纯函数——未登记 type / 缺关键载荷字段 → warn 提示；消费方不阻断）
export function validateTimelineEvent(type: string, detail: Record<string, unknown>): string[] {
  const warns: string[] = []
  const spec = TIMELINE_EVENT_SPECS[type as TimelineEventType]
  if (!spec) {
    warns.push(`timeline 事件未登记：${type}——按 A2 三步登记（TIMELINE_EVENT_SPECS → emit → 测试）`)
    return warns
  }
  for (const k of spec.detailKeys ?? []) {
    if (!(k in detail)) warns.push(`timeline 事件 ${type} 缺载荷字段：${k}`)
  }
  return warns
}

// === 事件派生（Event Sourcing-lite）：转换前后状态 diff → 领域事件 ===
// 纯函数：任何 ConversationState 转换（userConfirmed/userRejected/approvalGranted/applyToolResult/setPending/clearPending）
// 自动产生对应事件——应用层在转换单点（useConversationState.transition）收集后发送。
export interface DerivedStateEvent {
  type: TimelineEventType
  detail: Record<string, unknown>
}

export function deriveStateEvents(prev: ConversationState, next: ConversationState): DerivedStateEvent[] {
  const events: DerivedStateEvent[] = []
  // —— 确认点（Task 聚合——意图确认重设计 S1：execution→plan / achievement→resolution 语义更名）——
  if (!prev.goalConfirmed && next.goalConfirmed) events.push({ type: 'task.goal_confirmed', detail: { point: 'goal' } })
  if (prev.goalConfirmed && !next.goalConfirmed) events.push({ type: 'task.goal_rejected', detail: { point: 'goal' } })
  if (!prev.planConfirmed && next.planConfirmed) events.push({ type: 'task.execution_confirmed', detail: { point: 'plan' } })
  if (prev.planConfirmed && !next.planConfirmed) events.push({ type: 'task.execution_rejected', detail: { point: 'plan' } })
  if (!prev.resolutionConfirmed && next.resolutionConfirmed) events.push({ type: 'task.achievement_confirmed', detail: { point: 'resolution' } })
  if (prev.resolutionConfirmed && !next.resolutionConfirmed) events.push({ type: 'task.achievement_rejected', detail: { point: 'resolution' } })
  // —— 决策点（领域视图——设计 §3.5；与 card.* 并存：card=UI 卡生命周期，decision=领域决策点）——
  if (prev.pending === 'none' && next.pending !== 'none') {
    events.push({ type: 'session.pending_set', detail: { kind: next.pending } })
    events.push({ type: 'decision.requested', detail: { kind: next.pending, since: next.decisionContent?.since ?? '' } })
  }
  if (prev.pending !== 'none' && next.pending === 'none') {
    events.push({ type: 'session.pending_cleared', detail: { kind: prev.pending } })
    // decision.resolved：确认/拒绝由状态 diff 推断（拒绝记忆新增 = approval 拒绝；否则按确认位变化）
    if (prev.deniedApprovals.length < next.deniedApprovals.length) {
      events.push({ type: 'decision.resolved', detail: { point: 'approval', action: 'reject' } })
    } else if (prev.pending === 'approval') {
      events.push({ type: 'decision.resolved', detail: { point: 'approval', action: 'confirm' } })
    } else {
      const point = prev.pending
      const confirmed = point === 'goal' ? next.goalConfirmed : point === 'plan' ? next.planConfirmed : next.resolutionConfirmed
      events.push({ type: 'decision.resolved', detail: { point, action: confirmed ? 'confirm' : 'reject' } })
    }
  }
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

// === A6 去重键（dedupe 事件——同会话同 detail 签名只记一次；纯函数 L1 可测） ===
export function dedupeKey(type: string, detail: Record<string, unknown>): string {
  return `${type}:${JSON.stringify(detail)}`
}

// === 模型提议检测（task.*_proposed——assistant_done content 标记 → 提议事件；纯函数 L1 可测） ===
// 06 §1.1：task.goal_proposed（【目标确认】标记）/ task.execution_proposed（【执行方案】）/ task.achievement_proposed（【已达成】）
// 与渲染层 pendingCardToShow 同源判定（标记检测——但独立函数，避免 UI 依赖）
export function detectProposed(content: string): Array<{ type: 'task.goal_proposed' | 'task.execution_proposed' | 'task.achievement_proposed'; detail: Record<string, unknown> }> {
  const out: Array<{ type: 'task.goal_proposed' | 'task.execution_proposed' | 'task.achievement_proposed'; detail: Record<string, unknown> }> = []
  const t = String(content ?? '')
  if (/【目标确认[:：]/.test(t)) out.push({ type: 'task.goal_proposed', detail: { goalText: t.match(/【目标确认[:：]\s*([^】]+)/)?.[1]?.trim() ?? '' } })
  if (t.includes('【执行方案')) out.push({ type: 'task.execution_proposed', detail: { plan: t } })
  if (t.includes('【已达成')) out.push({ type: 'task.achievement_proposed', detail: { summary: t } })
  return out
}
