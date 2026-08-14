// 领域层：会话状态机（Conversation BC 聚合根 Task——A0 §2/§3/§4/§5）
// 2026-08-14 溯源结论落地（session-state-machine.md）：
// A0 声明的 Task 聚合此前在实现中缺席——确认状态散在 MainWorkspace useState、
// 进度状态散在 ConversationPanel ref、授权状态散在 main filesApprovedRef——三处存储、各机制各自推断 → 7 缝隙。
// 本模块 = 状态单一来源 + 派生纯函数 + 转换唯一入口。纯逻辑无 React 依赖——L1 可测。
// 依赖关系：turnPolicy（TurnPolicyInput 消费 forceToolInput 输出）；tools.ts preApproval 消费 classifyAction（同源——缝隙 4）。

import type { TurnPolicyInput } from './turnPolicy.js'

// === 会话级单一 PENDING（A0 §3.2——所有卡统一「等用户决策」；来源只是卡类型） ===
export type PendingKind = 'none' | 'goal' | 'execution' | 'achievement' | 'approval'

// === Task 聚合状态（单一来源） ===
export interface ConversationState {
  goalConfirmed: boolean
  executionConfirmed: boolean
  achievementConfirmed: boolean // 用户点「已解决」（2026-08-07 决策：模型【已达成】= 提议，用户确认才释放 forceTool）
  pending: PendingKind
  plannedFiles: Set<string>   // A0 §5 宿主边界（追加语义——批准∪执行方案解析；路径已 trustPath 规范化）
  producedFiles: Set<string>  // write/edit 成功累积（进度数据）
  filesApproved: boolean      // 本任务已批准过 approve-files（幂等——坑 95：再调不弹卡；任务边界重置）
  lastToolFailed: boolean     // 上一轮工具执行失败（坑 93 ②：策略引导 policy 不置）
}

export const initialState = (): ConversationState => ({
  goalConfirmed: false,
  executionConfirmed: false,
  achievementConfirmed: false,
  pending: 'none',
  plannedFiles: new Set(),
  producedFiles: new Set(),
  filesApproved: false,
  lastToolFailed: false,
})

// ============================================================================
// 转换（唯一入口——所有状态变化必须经过这里；返回新实例，原状态不可变）
// ============================================================================

// 用户确认（确认卡按钮——同步置位，与 send 解耦——缝隙 1）
export function userConfirmed(s: ConversationState, point: 'goal' | 'execution' | 'achievement'): ConversationState {
  const next = { ...s, pending: 'none' as PendingKind }
  if (point === 'goal') {
    // 目标确认 = 任务边界（A0 §9 目标驱动原点；对齐 clearTrust 语义）——新任务清零进度/清单/达成
    next.goalConfirmed = true
    next.executionConfirmed = false
    next.achievementConfirmed = false
    next.plannedFiles = new Set()
    next.producedFiles = new Set()
    next.filesApproved = false
    next.lastToolFailed = false
  }
  if (point === 'execution') {
    next.executionConfirmed = true
    next.goalConfirmed = true // 执行确认蕴含目标确认（handleExecutionConfirmed 现状语义）
  }
  if (point === 'achievement') {
    next.achievementConfirmed = true
  }
  return next
}

// 用户拒绝（A0 §3.2「否 → 状态回退 + 模型调整」）
export function userRejected(s: ConversationState, point: 'goal' | 'execution' | 'achievement'): ConversationState {
  const next = { ...s, pending: 'none' as PendingKind }
  if (point === 'goal') next.goalConfirmed = false
  if (point === 'execution') next.executionConfirmed = false
  if (point === 'achievement') next.achievementConfirmed = false
  return next
}

// 卡弹出 → 会话进入 PENDING（A0 §3.2 单一 PENDING——pending 只有一个）
export function setPending(s: ConversationState, kind: Exclude<PendingKind, 'none'>): ConversationState {
  return { ...s, pending: kind }
}

// approve-files 批准 → 计划清单追加（A0 §5 追加语义——不覆盖前批）+ 幂等标记（坑 95）
export function approvalGranted(s: ConversationState, files: string[]): ConversationState {
  const planned = new Set(s.plannedFiles)
  files.forEach((f) => planned.add(f))
  return { ...s, plannedFiles: planned, filesApproved: true, pending: 'none' }
}

// 工具结果 → 进度数据 + 失败标记（缝隙 6：诊断上下文汇入状态）
export function applyToolResult(
  s: ConversationState,
  r: { name: string; ok: boolean; needApproval?: boolean; policy?: boolean; file?: string }
): ConversationState {
  const next = { ...s }
  if (r.ok) {
    next.lastToolFailed = false
    if ((r.name === 'write' || r.name === 'edit') && r.file) {
      const produced = new Set(s.producedFiles)
      produced.add(r.file)
      next.producedFiles = produced
    }
  } else if (!r.needApproval && !r.policy) {
    next.lastToolFailed = true // 坑 93 ②：策略引导（policy）≠ 执行失败
  }
  return next
}

// ============================================================================
// 派生（纯函数——所有机制从此读取，不再各自推断）
// ============================================================================

// 动作分类（缝隙 4 单一权威——bash 只读判定与 main preApproval 同源，列表唯一）
export const BASH_READONLY_HEADS: ReadonlySet<string> = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'pwd', 'echo', 'which', 'find',
  'sed', 'awk', 'cd', 'stat', 'file', 'du', 'df', 'sort', 'uniq', 'rg', 'tree', 'diff', 'history',
])

export function classifyAction(name: string, command?: string): 'side-effect' | 'readonly' {
  if (name === 'write' || name === 'edit') return 'side-effect'
  if (name !== 'bash') return 'readonly'
  const head = String(command ?? '').split(/[;&|]/)[0].trim().split(/\s+/)[0]?.replace(/^sudo\s+/, '') ?? ''
  return BASH_READONLY_HEADS.has(head) ? 'readonly' : 'side-effect'
}

export interface ExecAction { name: string; command?: string; path?: string }

// 唯一门控入口（A0 §3.5 优先级：PENDING 冻结先于确认点，确认点先于清单判定）
export function canExecute(s: ConversationState, action: ExecAction, inPlanned: boolean): { ok: boolean; reason: string } {
  if (s.pending !== 'none') {
    return { ok: false, reason: `会话等待用户决策（${s.pending}）——此动作无效` }
  }
  const kind = classifyAction(action.name, action.command)
  if (kind === 'side-effect') {
    if (!s.goalConfirmed) return { ok: false, reason: '目标未确认——先澄清目标' }
    if (!s.executionConfirmed) return { ok: false, reason: '执行未确认——先给方案等确认' }
    // A0 §3.5：执行已确认 → 按计划清单判定（write/edit 新建/清单外 → 拒绝；清单空则无边界）
    if ((action.name === 'write' || action.name === 'edit') && s.plannedFiles.size > 0 && !inPlanned) {
      const approved = [...s.plannedFiles].map((p) => p.split('/').pop()).join('、')
      return { ok: false, reason: `不在批准清单（已批准：${approved || '无'}）——改写清单内文件或再次调 approve-files 补充` }
    }
  }
  return { ok: true, reason: '' }
}

// 计划完成度（A0 §4 表 + 补行：无计划时以 produced 为准——缝隙 3 无计划死锁）
export function plannedComplete(s: ConversationState, projectFiles: ReadonlySet<string>): boolean {
  if (s.plannedFiles.size === 0) return s.producedFiles.size > 0
  return [...s.plannedFiles].every((f) => s.producedFiles.has(f) || projectFiles.has(f))
}

// forceTool 输入（turnPolicy 消费——plannedComplete 收敛后 forceTool 不再死锁；
// goalAchieved 传 achievementConfirmed——2026-08-07 决策：用户点「已解决」才释放，模型【已达成】只是提议）
export function forceToolInput(s: ConversationState, projectFiles: ReadonlySet<string>): TurnPolicyInput {
  return {
    goalConfirmed: s.goalConfirmed,
    executionConfirmed: s.executionConfirmed,
    produced: s.producedFiles.size > 0,
    lastToolFailed: s.lastToolFailed,
    goalAchieved: s.achievementConfirmed,
    plannedComplete: plannedComplete(s, projectFiles),
  }
}

// 进展判定（缝隙 2：有副作用的工具成功执行 = 任务推进——bash 安装/验证成功不再被当「停滞」；
// 「换文件假装进展」仍被防——read 不算；同工具空转由 maybeContinue 重复检测兜底）
export function isProgressing(toolResults: Array<{ name: string; ok: boolean; command?: string }>): boolean {
  return toolResults.some((r) => r.ok && classifyAction(r.name, r.command) === 'side-effect')
}

// 确认卡触发（缝隙 5：状态机派生——渲染层与 maybeContinue 停模型**同源判定**，消除双标准）。
// 纯函数化（布尔参数而非 state——渲染层用 props、异步链用 stateRef，同一定义）：
// - goal：模型输出【目标确认】标记（无标记时渲染层 goalFallback 兜底——2026-08-07 用户决策）
// - execution：【执行方案】标记 / 有副作用动作待执行 / 「等确认」语义（模型自然语言等待——「方案如下，等你确认」
//   无标记无工具也必须命中，否则 maybeContinue 继续续聊、卡被 streaming 遮挡——S2b 实测死锁）
// - achievement：【已达成】标记
export function pendingCardToShow(
  goalConfirmed: boolean,
  executionConfirmed: boolean,
  achievementConfirmed: boolean,
  lastContent: string,
  sideEffectPending: boolean
): PendingKind {
  if (!goalConfirmed && lastContent.includes('【目标确认')) return 'goal'
  if (goalConfirmed && !executionConfirmed && (
    lastContent.includes('【执行方案')
    || sideEffectPending
    || /(等你确认|你确认一下|确认一下|等你点头|你看行吗|你看行不行|可以的话我)/.test(lastContent)
  )) return 'execution'
  if (!achievementConfirmed && lastContent.includes('【已达成')) return 'achievement'
  return 'none'
}
