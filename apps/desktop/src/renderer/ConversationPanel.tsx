import { useEffect, useMemo, useRef, useState } from 'react'
import DigitalDeliveryPanel from './DigitalDeliveryPanel'
import TrustLadderPanel from './TrustLadderPanel'
import DoDAlignPanel from './DoDAlignPanel'
import type { DeliveryPackage } from './types'
import { loadSession, saveSession, serializeMessages } from './sessionStore'
// ticket 14 信任阶梯：授权执行模型（等级/影响/合并判定——L4 委托 + 疲劳防护）
import { buildAuthHint, canMergeApprove, toolRisk } from './authModel'
// 2026-08-03 v33：思考过程内容清洗（reasoning 含 Markdown 标记 → 展示为可读纯文字）
// 2026-08-04：cleanContent 回复正文展示清洗（字面转义/连续换行杂音）
import { cleanContent, stripMarkdown } from './textClean'
// 2026-08-06 DDD 落地（progress-aware 卡住检测——领域层纯逻辑，双源调研驱动）
import { evaluateTurnProgress, detectStuck, initialStuckState, isQuestionLike, isCommunicationLike, isDoneLike, parseExecutionPlan, summarizeCapability, goalFallbackTrigger } from '../domain/agentLoop'
// 2026-08-14 会话状态机（Task 聚合——A0 §2/§3/§4/§5）：状态单一来源 + 转换唯一入口（session-state-machine.md S2）
import { initialState as initialConversationState, classifyAction, canExecute, plannedComplete as isPlannedComplete, forceToolInput as buildForceToolInput, isProgressing as hasProgress, pendingCardToShow, shouldStopContinuation, type ConversationState } from '../domain/conversationState'
// 2026-08-15 Q1a+Q2：状态机转换单点封装（写路径唯一入口）
import { useConversationState } from './useConversationState'
// 2026-08-15 Q1b：工具授权 handler 封装（组件瘦身）
import { useToolApproval } from './useToolApproval'
// 2026-08-07 DDD 落地（坑 89 forceTool/advanceChat 领域化——Conversation BC 轮次执行保障 + AgentChain BC 产品阶段流转）
import { decideTurnPolicy } from '../domain/turnPolicy'
// 2026-08-07 无阶段重构 S4：buildAdvanceInstruction/stageFlow import 删除（advanceChat 随阶段体系移除）
// 2026-08-05 方案 3：结构化候选按钮——<candidates> 块解析/剥离（点选文本替代序号，消除模型序号解析漂移）
import { parseCandidates, stripCandidates, stripTags } from './candidates'
// 2026-08-03 视觉审计 P1-6：内联 SVG 图标（替换 emoji 图标）
import {
  IconBrain, IconCheck, IconClock, IconDot, IconFile,
  IconLock, IconRotateCcw, IconShield, IconSquare, IconX, ToolIcon
} from './icons'
// 2026-08-04 启动页方案 A：场景卡数据共享（启动页 + 对话空态共用）
import { SCENES } from './scenes'
// 2026-08-07 T1（regex-todo）：聊天错误分类纯函数——原 includes('5') 过宽（token-limit-50/5000/x5x 误归 service）；
// 根因补强：ipc 已返回结构化 errorType（gateway 源头分类）——classifyChatError 降级为兜底（字面量/未知格式）
import { classifyChatError, type ChatErrorType } from './errorClassify'
// 2026-08-15 Q6：系统提示词外置（原内嵌 sysHint 模板）
import { buildSysHint } from './sysPrompt'
// 2026-08-15 Q10：demo 注入通道类型化单例
import { getDemoBridge } from './demoBridge'
// 2026-08-15 DDD 重建：事件注册表 dev 校验
import { validateTimelineEvent, TIMELINE_EVENT_SPECS, dedupeKey, detectProposed } from '../domain/timeline'

// ticket 04：对话最小闭环（D0 §2/§3.4）——输入发送 → Gateway 流式 → 消息/呼吸光条/推理展示
// 消费 02：streamChat（四档 basic）+ ModelRouter（默认 Flash）；错误分支：Key 失效内嵌更新 / 服务故障提示

export interface ToolCallMsg {
  id?: string // 2026-08-15 P2：稳定 id（会话内递增——同 args 卡并存的精确定位键；旧存档无 id → 渲染/定位 fallback）
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'done' | 'need-approval' | 'file-approval' | 'error' | 'reverted'
  result?: string
  rawResult?: string // 2026-08-05：API 回填用完整结果（UI 展示用 result 摘要）——read 完整内容防模型反复读同文件
  file?: string       // write/edit 成功写入的文件路径（回滚目标）
  canRevert?: boolean // 写前已快照——可回滚
  hidden?: boolean    // 2026-08-08 O2：UI 隐藏（如 check-capability 能力齐备时默认不展示——结果仍回填模型上下文）
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  status: 'streaming' | 'done' | 'error'
  error?: string
  toolCalls?: ToolCallMsg[]
  id?: string // 2026-08-15 Q5：稳定 id（React key——防索引漂移；旧存档无 id → 渲染 fallback 索引）
}
export type { Msg }

// 2026-08-04 体验修复：工具结果展示清洗——bash 只显示 stdout（原 JSON.stringify 显示 {stdout:...} 括号输出）；write/edit 显示路径；read 长内容摘要化（用户不想看整篇文件）
// 2026-08-05 体验反馈（用户「工具输出太偏代码，冗余不想看」）：工具结果精简为人类可读一句话——详细输出在工具卡 details 折叠查看（rawResult）
function fmtToolResult(r: { ok: boolean; data?: unknown }): string {
  if (typeof r.data === 'string') {
    return `已读取（${r.data.length} 字符）`
  }
  const d = r.data as Record<string, unknown> | undefined
  if (d && typeof d === 'object') {
    if ('stdout' in d) {
      const lines = String(d.stdout ?? '').split('\n').filter((l) => l.trim()).length
      return `执行完成（输出 ${lines} 行）`
    }
    if ('file' in d) return `已写入：${String(d.file)}`
  }
  return '完成'
}

// 2026-08-05：工具卡参数人类化（原 JSON.stringify(args) 技术化——普通用户看不懂）——「读取 xxx / 执行 xxx」
function fmtToolArgs(tc: { name: string; args: Record<string, unknown> }): string {
  const a = tc.args
  switch (tc.name) {
    case 'read': return a.path ? `读取 ${String(a.path)}` : '读取文件'
    case 'write': return a.path ? `写入 ${String(a.path)}` : '写入文件'
    case 'edit': return a.path ? `修改 ${String(a.path)}` : '修改文件'
    case 'bash': return a.command ? `执行 ${String(a.command).slice(0, 60)}` : '执行命令'
    case 'search': return a.query ? `搜索 ${String(a.query)}` : '搜索代码'
    case 'approve-files': return `批量授权 ${((a.files ?? []) as unknown[]).length} 个文件`
    // 2026-08-06 用户反馈「get_diagnostics 具体干什么了不知道」：LSP 工具名技术化 → 人类化描述（工具卡显示）
    case 'get_diagnostics': return a.path ? `检查代码错误：${String(a.path)}` : '检查代码错误'
    case 'get_imports': return a.path ? `查看文件依赖：${String(a.path)}` : '查看文件依赖'
    case 'find_definition': return a.path ? `定位定义：${String(a.symbol ?? a.path)}` : '定位代码定义'
    case 'find_references': return a.path ? `查找引用：${String(a.symbol ?? a.path)}` : '查找代码引用'
    case 'get_type_info': return a.path ? `查看类型：${String(a.symbol ?? a.path)}` : '查看类型信息'
    case 'get_call_chain': return a.path ? `查看代码结构：${String(a.path)}` : '查看代码结构'
    case 'open': return a.url ? `打开网页：${String(a.url)}` : '打开网页'
    // 2026-08-06 设计层升级：服务工具人类化；2026-08-07 无阶段重构 S2：check-env → check-capability
    case 'check-capability': return a.dir ? `检查能力：${String(a.dir)}` : '检查能力'
    case 'start-server': return a.dir ? `启动服务器：${String(a.dir)}` : '启动服务器'
    case 'check-server': return a.dir ? `检查服务：${String(a.dir)}` : '检查服务状态'
    case 'stop-server': return a.dir ? `停止服务：${String(a.dir)}` : '停止服务'
    default: return tc.name
  }
}

// 2026-08-05 体验反馈（用户「最后一条像卡住」——模型承诺行动但没调工具，如「我先打开服务端看看再动手」后停住）：
// 检测开发阶段模型回复「承诺要做事但没实际调工具」→ 对话区提示用户可回复「继续」（非卡死——working 已释放，只是模型停住等指令）
// 2026-08-05 第五轮修复：排除「确认/沟通」类（「我先和你确认一下…建造游戏」——模型在引导候选/确认需求，不是行动承诺；
// 误判 → 插入提示消息 → done updater 被拦截 → 候选按钮 status 卡 streaming 不渲染）——沟通动词（确认/复述/说明等）不是行动
// 2026-08-06 设计层翻转（用户「还在用正则文字匹配，除非穷举匹配不完」——坑 74 教训重演）：
// 旧方案匹配「承诺词」（我先/我读/我看/…promise+action 正则）——措辞无限匹配不完；
// 新方案**结构判定**：不检测「说了要做」，检测「该行动却没行动」——排除 问句（模型在问用户等决策）/ 沟通词（模型在对话）/ **完成态词（有限集——模型在汇报成果，正常不需要行动）**；
// 剩余情况（无工具调用 + 非问句 + 非沟通 + 非完成态）= 模型停在「要行动没行动」状态（调用方再结合 flowStage/toolCalls 判定）
export function isActionPromise(content: string): boolean {
  if (!content) return false
  const t = content.trim()
  if (!t) return false
  // 2026-08-07 质量把关 C 类：判定合并到领域层 agentLoop（isQuestionLike/isCommunicationLike/isDoneLike——唯一实现，防双源）
  if (isQuestionLike(t)) return false // 问句/征求同意——模型在等用户，不是承诺
  if (isCommunicationLike(t)) return false // 沟通/澄清/确认类（模型在对话不是在干活）
  if (isDoneLike(t)) return false // 完成态/收尾词（有限集）——模型在汇报成果（「改好了/做好了/解决了」= 已行动完成，不需要再催）；检测「完成」易（有限），检测「承诺」难（无限）
  return true
}

export default function ConversationPanel({
  rootPath,
  currentFile,
  onKeyExpired,
  onReasoning,
  onWorkingChange,
  onApprovalChange,
  onActionPromiseHint,
  externalRequest,
  onExternalConsumed,
  onToolResult,
  onUserMessage,
  onGoalConfirmed,
  onExecutionConfirmed,
  onGoalRejected,
  onExecutionRejected,
  goalConfirmed,
  executionConfirmed,
  goalSeq,
  recentFilesExternal,
  activeAuthorizedLogs,
  initialPrompt,
  onSessionStart
}: {
  rootPath?: string | null
  currentFile?: string | null // 08 快捷键 Cmd+E：当前选中文件（@引用——D0 §6）
  onKeyExpired: () => void
  onReasoning?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
  onApprovalChange?: (pending: boolean) => void // 2026-08-04 审计修复（D2）：有待批准工具操作时上报（状态栏提示——键盘用户感知）
  onActionPromiseHint?: (hint: string | null) => void // 2026-08-05 用户反馈 2：isActionPromise 提示不插入对话流（污染阅读）——状态栏非侵入提示
  externalRequest?: string | null
  onExternalConsumed?: () => void
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  onUserMessage?: (text: string) => void
  // 2026-08-04：目标确认回写——模型输出【目标确认：xxx】→ 上报 MainWorkspace（更新台账标题/快照 + 项目 README）
  // 2026-08-07 无阶段重构 S4：onRequirementConfirmed → onGoalConfirmed / requirementConfirmed → goalConfirmed + executionConfirmed
  onGoalConfirmed?: (title: string) => void
  onExecutionConfirmed?: () => void // 2026-08-07 执行确认卡【确认执行】→ MainWorkspace setExecutionConfirmed（结构化确认——替代确认词）
  // 2026-08-15 D1：拒绝路径对称回调（MainWorkspace 渲染镜像回退——修复「拒绝被 effect 反转」双权威缺陷）
  onGoalRejected?: () => void
  onExecutionRejected?: () => void
  goalConfirmed?: boolean // 2026-08-06 需求阶段门控（无阶段重构 S4：目标确认）：用户确认（MainWorkspace state）→ 渲染镜像（状态机权威在 stateRef）
  executionConfirmed?: boolean // 2026-08-07 无阶段重构 S4：执行确认（ExecutionConfirmCard——目标确认后用户确认执行方案）
  goalSeq?: number // 2026-08-07 无阶段重构 S4：目标确认次数——每次确认 = 任务边界（clearTrust 驱动）
  recentFilesExternal?: string[]
  // 2026-08-04 体验修复：启动页首句 → 进入工作区自动发送（说了就直接开始；输入框不预填）
  initialPrompt?: string
  activeAuthorizedLogs?: Array<{ tool: string; file: string } | string> // 06/14 授权记录可回溯：当前问题快照 authorized（TrustLadder 展示）
  // 2026-08-08 会话日志（用户「每次应该是单独的会话日志」）：挂载（进入对话）生成 UUID 会话 ID → 上报 MainWorkspace
  // （goal-confirmed/exec-confirmed 等 MainWorkspace 侧事件归属同一会话；chatKey+1 新会话 remount → 新 ID）
  onSessionStart?: (sessionId: string) => void
}) {
  // 2026-08-08 会话 ID：进入实际对话（本组件挂载）时生成——决定日志文件归属（timeline-<id>.jsonl / chat-<id>.jsonl）
  // crypto.randomUUID（Electron renderer secure context 可用）失败降级时间戳+随机
  const [sessionId] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
  const [messages, setMessages] = useState<Msg[]>([])
  const messagesRef = useRef<Msg[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  // 2026-08-15 Q5：消息稳定 id 生成（会话内递增——key 稳定性）
  const msgSeqRef = useRef(0)
  const nextMsgId = () => `m${Date.now().toString(36)}-${(msgSeqRef.current++).toString(36)}`
  // 2026-08-04 审计修复（D2）：有待批准工具操作 → 上报状态栏提示（need-approval 出现/消失）
  // 2026-08-07 无阶段修复（输入≠打断）：send 排队判定用（待授权时模型停住等批准，
  // 用户输入直接处理不排队——排队会卡在授权等待；模型产出中才排队衔接）
  // 2026-08-14 S2b：授权等待接入状态机单一 PENDING（pending='approval'——A0 §3.2 授权卡同属会话级 pending）
  // 2026-08-15 D5：互斥——确认卡 pending（goal/execution/achievement——done 分支 setPending 置位）优先，
  // 授权卡 pending 只在当前无确认卡 pending 时置位（A0：pending 只有一个——决策点互斥，用户先处理先弹的卡）
  useEffect(() => {
    const hasApproval = messages.some((m) => m.toolCalls?.some((c) => c.status === 'need-approval' || c.status === 'file-approval')) ?? false
    if (hasApproval && stateRef.current.pending === 'none') {
      setPendingState('approval')
    } else if (!hasApproval && stateRef.current.pending === 'approval') {
      clearPending()
    }
    onApprovalChange?.(hasApproval)
  }, [messages, onApprovalChange])
  // 断点续做（ticket 06/基线 §21）：挂载恢复上次会话（onNew 已 clearSession → 空）
  useEffect(() => {
    const stored = loadSession()
    if (stored && stored.length > 0) {
      setMessages(stored.map((s) => ({
        id: s.id ?? nextMsgId(),
        role: s.role,
        content: s.content,
        reasoning: s.reasoning,
        status: 'done' as const,
        toolCalls: s.toolCalls
      })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 断点续做：完整消息变化 → 持久化（过滤半截 streaming——streaming 时 serialize 为空不覆盖存档）
  useEffect(() => {
    const serialized = serializeMessages(messages)
    if (serialized.length > 0) saveSession(serialized)
  }, [messages])
  const chatRef = useRef<{ msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>; depth: number } | null>(null)
  const sessionRef = useRef(0) // 会话隔离：每次发送递增——旧会话事件/续聊失效
  const streamingSidRef = useRef(0) // 2026-08-04：当前活跃流 sid——停止（sid++）后旧流 chunk 忽略（applyChunk 只处理活跃流）
  const applyChunkRef = useRef<((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null>(null)
  useEffect(() => { applyChunkRef.current = applyChunk }) // 每次渲染同步最新 applyChunk
  // 2026-08-08 会话日志：挂载（进入对话）→ 会话 ID 上报 MainWorkspace（其 timeline 事件归属本会话）
  useEffect(() => { onSessionStart?.(sessionId) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 2026-08-15 补齐：会话创建事件（06 §1.6 conversation.created——会话文件创建点可观测）
  useEffect(() => { tlog('conversation.created', { session: sessionId }, 'system') }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // 永久 listener：不随 runChat off（off 竞争会导致 done 事件丢失——invoke resolve 与 stream-chunk 投递顺序）
    // 2026-08-04 修复（用户「按停止没反应」）：streamingSidRef 检查——只处理当前活跃流的 chunk（停止 sid++ 后旧流 chunk 忽略）
    const off = window.neonforge.gateway.onStreamChunk((chunk) => {
      if (sessionRef.current === 0 || streamingSidRef.current !== sessionRef.current) return // 无活跃会话 / 旧流（已停止）——忽略
      applyChunkRef.current?.(chunk)
    })
    return off
  }, [])
  const [input, setInput] = useState('')
  const [working, setWorking] = useState(false)
  const [workingStage, setWorkingStage] = useState('等待回复…')
  // 2026-08-08 B 修复（feedback.log「候选+确认卡不能同时出来」）：候选点击后标记已选（消息索引 → 选项索引）——
  // 跨消息视觉：旧候选消息不再显示可点按钮（已选态），确认卡接管决策（决策点互斥）
  const [chosenCandidates, setChosenCandidates] = useState<Record<number, number>>({})
  // 2026-08-14 用户实测修复（「重新描述后卡片没有消失」）：确认卡拒绝类按钮（重新描述/修改方案/还要改）——
  // 标记该消息的卡已处理（隐藏）+ 状态机回退（A0 §3.2 否 → 状态回退 + 模型调整）。卡点确认/拒绝后必须消失，
  // 等模型重新提议再弹新卡（新消息新索引）
  const [rejectedCardIdx, setRejectedCardIdx] = useState<{ goal?: number; execution?: number; achievement?: number }>({})
  // ticket 14 L4 委托：低危文件操作（write/edit）自动授权免确认（可随时撤销——localStorage 持久化；bash 高危永不委托）
  const [delegateLowRisk, setDelegateLowRisk] = useState(() => {
    try { return localStorage.getItem('nf-delegate-lowrisk') === '1' } catch { return false }
  })
  const handleDelegateChange = (v: boolean) => {
    setDelegateLowRisk(v)
    try { localStorage.setItem('nf-delegate-lowrisk', v ? '1' : '0') } catch { /* 存储不可用——内存态仍工作 */ }
  }
  // 2026-08-04：设置面板 L4 委托开关 → 对话授权实时联动（同 localStorage key + 自定义事件）
  useEffect(() => {
    const onDelegateChanged = () => {
      try { setDelegateLowRisk(localStorage.getItem('nf-delegate-lowrisk') === '1') } catch { /* 读不到保持现状 */ }
    }
    window.addEventListener('nf-delegate-changed', onDelegateChanged)
    return () => window.removeEventListener('nf-delegate-changed', onDelegateChanged)
  }, [])
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef('')
  // 2026-08-04 审计修复（A3）：textarea DOM ref——场景卡点击预填后聚焦输入框（原焦点停卡片，需再点输入框）
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 2026-08-04 体验修复（用户实测：启动页输入句预填多余）：initialPrompt 进入工作区自动发送——说了就直接开始
  // （区别于 externalRequest「预填+自动发送」复跑语义；initialPrompt 只用于启动页首句）
  const sendRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {})
  // 2026-08-06 DDD 落地（progress-aware 卡住检测——领域层状态）：连续无进展计数 + 升级次数（不可变 StuckState）+ 已读文件集合
  const stuckStateRef = useRef(initialStuckState)
  const prevReadFilesRef = useRef<Set<string>>(new Set())
  // 2026-08-14 会话状态机（Task 聚合——S2 迁移）：原 7 个散 ref（plannedFiles/producedFiles/goalAchieved/
  // lastToolFailed/filesApproved/goalConfirmed/executionConfirmed）合并为单一 ConversationState——
  // 读 = stateRef.current.x；写 = useConversationState 转换方法（Q1a+Q2——唯一入口）
  // 2026-08-15 DDD 重建：transition 内 diff 派生领域事件 → tlog 落盘（一处接入覆盖全部状态转换——
  // task.*/session.*/plan.* 事件自动发出；事件目录 domain/timeline.ts 对齐 06 文档）
  const { stateRef, confirm, reject, grantPlan, applyTool, setPending: setPendingState, clearPending, addPlannedFiles, setFilesApproved } = useConversationState({
    emit: (type, detail) => tlog(type, detail, 'system')
  })
  // 2026-08-14 用户实测卡死修复（timeline 0219a516）：确认卡唯一性——模型连发消息时卡固定在
  // 「最后一条信号消息」上不漂移。**O(n) 倒序单次扫描**预计算三个信号索引（useMemo 缓存——
  // 消息列表不可控（compaction 阈值 100+ 条），每渲染 O(n²) 不可接受；此方案 O(n) 一次 + 渲染 O(1) 查表）
  const lastSignalIdx = useMemo(() => {
    let exec = -1
    let goal = -1
    let achieve = -1
    for (let k = messages.length - 1; k >= 0; k--) {
      const x = messages[k]
      if (x.role !== 'assistant') continue
      if (exec === -1 && (x.content.includes('【执行方案') || (x.toolCalls ?? []).some((c) => classifyAction(c.name, String(c.args?.command ?? '')) === 'side-effect'))) exec = k
      if (goal === -1 && /【目标确认[:：]/.test(x.content)) goal = k
      if (achieve === -1 && x.content.includes('【已达成')) achieve = k
      if (exec !== -1 && goal !== -1 && achieve !== -1) break
    }
    return { exec, goal, achieve }
  }, [messages])
  // 用户确认/拒绝（MainWorkspace state = 展示镜像——不再从 prop 同步状态机，防拒绝被反转；D1 2026-08-15）
  // 2026-08-14 审计发现：原 useEffect 只同步 true 方向——拒绝（userRejected 只改 stateRef）后 prop 仍 true
  // → effect 立即把回退反转回 true（「重新描述需点两次」根因）。现状态机唯一权威 = stateRef；
  // MainWorkspace 的 goalConfirmed/executionConfirmed 仅作渲染镜像（由确认/拒绝回调显式设置，双向对称）。
  // 2026-08-07 会话时间线（Session Timeline BC——单会话所有步骤统一日志：用户/搭档/工具/授权/状态——分析一步到位）
  // 2026-08-15 A6：dedupe 事件去重集合（会话级——同 detail 签名只记一次）
  const timelineDedupeRef = useRef<Set<string>>(new Set())
  const tlog = (type: string, detail: Record<string, unknown>, role?: 'user' | 'assistant' | 'system' | 'tool') => {
    // 2026-08-15 DDD 重建：事件注册表 dev 校验（A2——未登记 type / 缺载荷字段 → warn 防散落）
    try {
      for (const w of validateTimelineEvent(type, detail)) console.warn('[timeline]', w)
    } catch { /* 校验失败不影响发送 */ }
    // 2026-08-15 A6：dedupe 事件去重（注册表 dedupe:true——同会话同 detail 签名只记一次；替代组件 cardShownRef 手动的通用机制）
    try {
      if (TIMELINE_EVENT_SPECS[type as keyof typeof TIMELINE_EVENT_SPECS]?.dedupe) {
        const k = dedupeKey(type, detail)
        if (timelineDedupeRef.current.has(k)) return
        timelineDedupeRef.current.add(k)
      }
    } catch { /* 去重失败不影响发送 */ }
    // 2026-08-08 会话归属：session 用会话 ID（UUID——本组件挂载生成）——写入对应会话 timeline 文件
    try { void window.neonforge.timeline?.log?.({ session: sessionId, type, role, detail }) } catch { /* 日志失败不影响 */ }
  }
  // 2026-08-08 卡弹出打点（用户「加一个确认/授权等卡弹出的点」）：确认卡（目标/执行/达成）+ 授权卡/approve-files 卡——卡从无到有打一次
  const cardShownRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const last = messages[messages.length - 1]
    const isLastAssistant = last?.role === 'assistant' && last.status === 'done'
    const content = last?.content ?? ''
    const show = (card: string, extra?: Record<string, unknown>) => {
      if (cardShownRef.current.has(card)) return
      cardShownRef.current.add(card)
      tlog('card.shown', { card, ...extra }, 'system')
    }
    if (isLastAssistant) {
      if ((/【目标确认[:：]/.test(content) || !goalConfirmed) && !goalConfirmed) show('goal-confirm', { goalText: content.slice(0, 80) })
      if ((content.includes('【执行方案') || (goalConfirmed && !executionConfirmed)) && goalConfirmed && !executionConfirmed) show('exec-confirm')
      if (content.includes('【已达成') && stateRef.current.producedFiles.size > 0 && !stateRef.current.achievementConfirmed) show('achieve-confirm')
    }
    // 授权卡 / approve-files 卡（工具卡 need-approval/plan-approval 状态）——每次弹卡独立记录（同工具不同 args 是新的授权决策）
    for (const m of messages) {
      for (const c of m.toolCalls ?? []) {
        if (c.status === 'need-approval' || c.status === 'file-approval') {
          const key = `approval:${c.name}:${JSON.stringify(c.args ?? {}).slice(0, 60)}`
          show(key, { card: c.status === 'file-approval' ? 'file-approval' : 'approval', name: c.name, args: c.args })
        }
      }
    }
  }, [messages, goalConfirmed, executionConfirmed])
  // 2026-08-08 状态变化打点（working / approval-pending / ready——统一状态机；变化才记录）
  const lastStatusRef = useRef('')
  useEffect(() => {
    const status = working ? 'working' : stateRef.current.pending === 'approval' ? 'approval-pending' : 'ready'
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status
      tlog('conversation.status_change', { status })
    }
  }, [working, messages])
  // 2026-08-05：renderer 侧「已规划」标记 + 确认门控 ref 已并入状态机（stateRef——见上方 S2 迁移）；保留注释链：
  // filesApproved → stateRef.filesApproved；goal/execConfirmed → stateRef.goalConfirmed/executionConfirmed；
  // lastToolFailed → stateRef.lastToolFailed（applyToolResult 唯一写入口）
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      inputRef.current = initialPrompt.trim()
      setInput('')
      // 下一 tick 发送（等 sendRef 同步——send 读 inputRef 已就绪）
      setTimeout(() => void sendRef.current(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (externalRequest && typeof externalRequest === 'string' && externalRequest.trim()) {
      const text = externalRequest.trim()
      inputRef.current = text
      setInput(text)
      onExternalConsumed?.()
      // 下一 tick 发送（等 state 同步——send 读 inputRef 已就绪）
      setTimeout(() => void sendRef.current(), 50)
    }
  }, [externalRequest])
  // 2026-08-04 授权架构 v4：任务边界 = 目标确认（新目标任务开始）——清除任务级信任（授权自动收回）
  // 2026-08-07 无阶段重构 S4：原 stageAdvance?.seq（阶段推进）→ goalSeq（目标确认次数——每次确认 = 任务边界，覆盖首确认与后续新任务）
  useEffect(() => {
    if ((goalSeq ?? 0) > 0) clearTrust()
  }, [goalSeq])
  // 2026-08-07 无阶段重构修复（执行确认卡删除——dock 顶部全清，用户「最上面的那块都不需要了」）：
  // execConfirmedHandledRef 自动 silent 触发删除——执行确认现在靠用户打字确认词（「可以/确认」）作为普通用户消息
  // 发送（模型看到确认 + executionConfirmed=true → forceTool 强制产出）——旧 effect 与用户消息双重发送冲突
  // （398 实测：「可以」消息 + silent「用户已确认执行」排队/打断——双触发）
  const [mentionOpen, setMentionOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  // 2026-08-04 审计修复（A2）：浮层方向键高亮索引（-1=未高亮）——listbox 键盘语义落地（原仅 Tab 可达，Arrow 无反应）
  const [mentionActive, setMentionActive] = useState(-1)
  const demoFiles = (recentFilesExternal && recentFilesExternal.length > 0)
    ? recentFilesExternal
    : getDemoBridge()?.recentFiles ?? []
  // 2026-08-04 审计修复（A2）：选择浮层项（输入框 @后插入文件名）——点击/Enter 共用
  const pickMention = (idx: number) => {
    const f = recentFiles[idx]
    if (!f) return
    const before = inputRef.current.replace(/@[^@]*$/, '')
    const next = before + '@' + f + ' '
    inputRef.current = next
    setInput(next)
    setMentionOpen(false)
    setMentionActive(-1)
    textareaRef.current?.focus()
  }
  // 2026-08-04 审计修复（A2）：浮层打开/内容变化时重置高亮
  useEffect(() => {
    if (!mentionOpen) setMentionActive(-1)
    else setMentionActive(recentFiles.length > 0 ? 0 : -1)
  }, [mentionOpen, recentFiles])

  // 处理单个流式事件（当前轮次——写入最后一条 assistant 消息）
  // 2026-08-04：流式累积（事件层）——React StrictMode 会双调 setMessages updater，副作用（日志/工具执行）放 updater 内会重复执行（实测对话日志每条记录两次）
  // 2026-08-15 Q3：reasoning 累积 + onReasoning/setWorkingStage 全部上移到事件层（原 updater 内调用外部回调——坑 32 违反残留）
  const streamingRef = useRef<{ content: string; reasoning: string; toolCalls: ToolCallMsg[] }>({ content: '', reasoning: '', toolCalls: [] })
  // 2026-08-07 无阶段重构 S4：TurnKind/turnKindRef 删除（advanceChat 随阶段体系移除——无 advance-turn；send/maybeContinue 不再需要轮次类型标记）
  const applyChunk = (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => {
    console.log('[conv] chunk', chunk.type)
    // 2026-08-15 P2：当前 tool-call chunk 的卡稳定 id（函数级——updater 闭包引用；tool-call chunk 时赋值）
    let tcId: string | undefined
    // 2026-08-05 用户反馈 2：模型有新动作（chunk）→ 清除 isActionPromise 状态栏提示（模型在动——之前只是陈述/即将调工具）
    if (chunk.type === 'content' || chunk.type === 'tool-call') onActionPromiseHint?.(null)
    // 事件层累积（每事件一次——双调安全）
    if (chunk.type === 'reasoning') {
      streamingRef.current.reasoning += chunk.text ?? ''
      onReasoning?.(streamingRef.current.reasoning)
      setWorkingStage('思考中…')
    }
    if (chunk.type === 'content') {
      streamingRef.current.content += chunk.text ?? ''
      setWorkingStage('生成回复…')
      // 2026-08-07 用户决策（显式确认——行业共识）：【目标确认】标记不再自报确认（模型标记=提议，渲染确认卡——
      // 用户点「确认目标」才 goalConfirmed；原提前检测自报确认删除）
    }
    if (chunk.type === 'tool-call' && chunk.toolCall) {
      tlog('tool.requested', { name: chunk.toolCall.name, args: chunk.toolCall.args }, 'tool')
      // 2026-08-15 P2：卡稳定 id **在流事件层同步生成**（updater 外——React 批处理会延迟执行 updater，
      // 期间 streamingRef 可能已被后续 done chunk 清空 → updater 内取 streamingRef 会拿到 undefined；
      // 闭包变量传入 updater——StrictMode 双调 id 仍唯一）
      tcId = nextMsgId()
      streamingRef.current.toolCalls.push({ name: chunk.toolCall.name, args: chunk.toolCall.args, status: 'pending', id: tcId })
    }
    if (chunk.type === 'done') {
      // 副作用移出 updater：目标确认回写 + 对话日志（updater 双调会重复记录）
      const content = streamingRef.current.content
      // 2026-08-07 用户决策（显式确认）：模型【目标确认】标记不再调 onGoalConfirmed（自报确认删除）——标记只渲染确认卡，
      // 用户点「确认目标」才 onGoalConfirmed（结构化确认——行业共识）
      tlog('conversation.assistant_done', { content }, 'assistant')
      // 2026-08-15 补齐：模型提议事件（06 §1.1 task.*_proposed——提议→确认/拒绝闭环起点）
      for (const p of detectProposed(content)) tlog(p.type, p.detail, 'assistant')
      window.neonforge.chatLog?.log?.({
        ts: new Date().toISOString(),
        role: 'assistant',
        content,
        // 2026-08-15 G4：toolCalls 只记工具名清单（原记 streamingRef 恒 pending——误导；
        // 工具状态完整轨迹在 timeline tool.requested/executed/failed/blocked）
        toolCalls: streamingRef.current.toolCalls.map((t) => ({ name: t.name })),
        session: sessionId
      })
      // 2026-08-07 用户决策（显式确认）：【目标确认】标记不再同步 goalConfirmedRef（自报确认删除——
      // goalConfirmedRef 由 prop 同步（用户点确认卡 → MainWorkspace state → 248 行 effect））
      // 2026-08-15 D5：确认卡触发 → 会话级 PENDING（状态机冻结——A0 §3.2/§3.4 单一 PENDING 落地）
      // 原实现 pending 仅授权卡置位（useEffect 直接展开改）；目标/执行/达成卡的「冻结」靠轮级派生检测——
      // escalate 续聊后的新轮次模型仍可执行工具（pending 未置位漏洞）。现 done 时按派生结果置 pending，
      // canExecute 统一消费（pending 下所有工具无效——含只读——用户决策是下一状态唯一输入）。
      // sideEffectPending 与 maybeContinue 同源（UI 消息 status——拦截后为 done 不计；自动执行中为 pending 计）
      const lastUiMsg = messagesRef.current[messagesRef.current.length - 1]
      const uiCalls = lastUiMsg?.toolCalls ?? []
      const sideEffectPendingUi = uiCalls.some((c) => c.status === 'pending' && classifyAction(c.name, String(c.args?.command ?? '')) === 'side-effect')
      const cardToShow = pendingCardToShow(stateRef.current.goalConfirmed, stateRef.current.executionConfirmed, stateRef.current.achievementConfirmed, content, sideEffectPendingUi)
      if (cardToShow !== 'none' && stateRef.current.pending === 'none') {
        setPendingState(cardToShow)
      }
      // 2026-08-07 无阶段重构 S5：执行方案清单解析——模型输出【执行方案】块 → 并入 plannedFiles（任务完成度——deepcode unimplemented_files 借鉴）
      // 2026-08-08 根因 3 修复③：trustPath 规范化（模型写相对路径如 game.js）——与 approvePlan 的绝对路径清单（1036 行）统一比较基准
      const planFiles = parseExecutionPlan(content)
      if (planFiles.length > 0) {
        addPlannedFiles(planFiles.map((f) => trustPath(f)))
      }
      // 2026-08-05 体验反馈（用户「最后一条像卡住」）：模型承诺行动（「我先…再…」）但没调工具 → 提示用户可回复「继续」
      // （非卡死——working 已释放；判定收紧：问句/征求同意/「确认/思考」类对话行为不触发；不限于开发阶段——任何阶段说了要看/读/写就该做）
      // 2026-08-05 自动化实测发现（需求阶段偶发误判）：需求阶段（flowStage=0）模型「我先…再确认/再问」是问答引导（STAGE_HINT 需求阶段禁止工具），
      // 不是「承诺写代码没动手」——误判会插入「回复继续」提示 → 打断正常需求问答；需求阶段排除 isActionPromise
      // 2026-08-05 用户反馈 2：提示不再插入对话流（「陈述句后紧跟『说要做但还没动手』」——污染阅读且常误判模型正常陈述）→ 状态栏非侵入提示，模型下一条消息自动清除
      // 2026-08-06 只说不做多次升级（用户反馈「光说不做也发生很多轮次了」——07:36 催「打开」10+ 次模型不调 open）：
      // 用户已催同类指令（继续/打开等）模型仍承诺不调工具 → 自动 silent 续聊（「继续，把刚才说要做的做完」——不显示用户消息）；
      // 防死循环 autoNudgeRef 每会话最多 2 次，之后降级为状态栏提示
      // 2026-08-06 升级（用户「说了做没做老问题」——09:37-09:38 日志：模型 6+ 条「我要看/查/确认」toolCalls:[] + 文本模拟「（上一步执行：[read]）」+ course_correction_guidance）：
      // ① isTextSimulation 检测——模型把工具执行记录当正文输出（sysHint ⑪ 禁止）→ 视为「以为执行了实际没调」触发
      // ② autoNudge 次数 2→3 + 续聊内容带修正指令（指出「没调工具/文本模拟」——比「继续」有效，模型收到后真正调工具）
      // ③ 2026-08-06 DDD 落地（progress-aware 卡住检测——双源调研 tavily+serper：activity≠progress + 连续无进展升级 + needs-human）：
      //    替换散落的 isActionPromise/isTextSimulation/autoNudge 3 次配额——领域层 ProgressEvaluator + StuckDetector 判定；
      //    只处理工具循环轮（首轮已 forceTool API 强制——不重复）；连续 2 轮无产出（无 write/edit/新 read）→ escalate 自动续聊指出没动手；
      //    升级 2 次仍无产出 → needs-human 状态栏提示（对齐行业——不再固定配额「耗尽」问题）
      // 2026-08-07 无阶段重构 S3：目标确认后才启用 StuckDetector（原 flowStage>=1——目标确认前模型澄清问答/探索是正常行为，不检测停滞）
      // 2026-08-14 S4（缝隙 7）：会话级 PENDING（等用户决策——确认卡/授权卡）期间 StuckDetector 完全静默——
      // 等用户决策时模型静止是**正常态**不是停滞（A0 §3.2）
      // 2026-08-14 冒烟回归修复（escalate 打断合法链）：**工具轮不参与停滞检测**——有工具调用 = 模型在活动；
      // 流 done 时工具执行可能未回填（卡仍 pending → 误判无进展 → escalate silent 打断 write 链 → 后续空回复）。
      // 工具链的停滞由 maybeContinue 重复检测 + depth 40 兜底；StuckDetector 只管「纯文本停住」
      if (stateRef.current.goalConfirmed && stateRef.current.pending === 'none' && streamingRef.current.toolCalls.length === 0) {
        // 2026-08-06 任务完成度：write/edit 成功标记产出（approve-files 规划文件 vs 已产出——deepcode unimplemented_files 借鉴）
        // 2026-08-14 S2：产出记录走状态机转换（applyToolResult——不可变更新）
        streamingRef.current.toolCalls.forEach((c) => {
          if ((c.name === 'write' || c.name === 'edit') && c.status === 'done' && c.file) applyTool({ name: c.name, ok: true, file: c.file })
        })
        const turn = evaluateTurnProgress({
          toolCalls: streamingRef.current.toolCalls.map((c) => ({ name: c.name, status: c.status, file: c.file, command: String(c.args?.command ?? '') })),
          content,
          prevReadFiles: prevReadFilesRef.current,
          plannedFiles: stateRef.current.plannedFiles,
          producedFiles: stateRef.current.producedFiles,
          // 2026-08-06 补充（用户「清单来源不只 approve-files」——③ projectFiles 项目文件树）：产出校验（规划文件出现在文件树=已产出）
          // 2026-08-15 坑 102 修复：projectFiles 统一绝对基准（MainWorkspace listDir 返回 basename——与 planned/produced 绝对基准分裂
          // → projectFiles.has(f) 恒 false → 文件树权威分支失效 → plannedComplete 只靠 produced 记录）；trustPath 归一
          projectFiles: new Set((recentFilesExternal ?? []).map((f) => trustPath(f)))
        })
        streamingRef.current.toolCalls.forEach((c) => { if (c.name === 'read' && c.file) prevReadFilesRef.current.add(c.file) })
        const { state, event } = detectStuck({ turn, prev: stuckStateRef.current })
        stuckStateRef.current = state
        if (event?.type === 'escalate') {
          tlog('stuck.escalated', { message: event.message }, 'system') // 2026-08-08 卡住升级打点
          onActionPromiseHint?.(null)
          inputRef.current = event.message
          void sendRef.current?.({ silent: true })
        } else if (event?.type === 'needs-human') {
          tlog('stuck.needs_human', { message: event.message }, 'system') // 2026-08-08 升级达上限转用户
          onActionPromiseHint?.(event.message)
        }
      }
      streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
    }
    setMessages((prev) => {
      // 纯 UI 更新（无副作用——StrictMode 双调安全；onReasoning/setWorkingStage 已在事件层——Q3）
      // 2026-08-05 第五轮修复：定位「最后一条 streaming 的 assistant 消息」而非「最后一条消息」——
      // done 分支插入提示消息（isActionPromise）后，原 last 变成提示消息（status='done'）→ guard 拦截 → 流式消息 status 卡 streaming → 候选按钮不渲染（选项卡消失根因）
      // 从尾部向前找 streaming 消息；tool-call 保留原语义（无 streaming 时回退到最后一条 assistant）
      let target = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role !== 'assistant') continue
        if (prev[i].status === 'streaming') { target = i; break }
        if (chunk.type === 'tool-call' && target === -1) target = i
      }
      if (target === -1) return prev
      const next = { ...prev[target] }
      if (chunk.type === 'reasoning') {
        next.reasoning = (next.reasoning ?? '') + (chunk.text ?? '')
      }
      if (chunk.type === 'content') {
        next.content = next.content + (chunk.text ?? '')
      }
      if (chunk.type === 'done') {
        next.status = 'done'
        if (!next.content && !(next.toolCalls && next.toolCalls.length > 0)) {
          next.error = 'empty-response'
        }
        // 2026-08-04 体验修复：流式完成 → 通知 runChat 尾部立即返回（working 及时释放——用户快速「确认推进」不被拦截）
        doneNotifierRef.current?.()
      }
      if (chunk.type === 'tool-call' && chunk.toolCall) {
        // 2026-08-04 批量授权：approve-files 不执行（虚拟工具）——状态 file-approval 弹批量授权卡（等用户批准文件清单）
        // 2026-08-05 体验反馈（用户实测「批量授权出来两次」）：幂等——本任务已批准过不再弹卡
        // 2026-08-07 无阶段重构 S3：删除阶段门控（原 flowStage<2 设计阶段不弹卡——无阶段无阶段概念；approve-files 语义更新见 S5）
        // 2026-08-08 改名 + 语义澄清（坑 95）：approve-files = 批量授权（确认执行后的粒度优化），非「规划批准」
        let status: 'pending' | 'done' | 'file-approval' = 'pending'
        if (chunk.toolCall.name === 'approve-files') {
          status = stateRef.current.filesApproved ? 'done' : 'file-approval'
        }
        next.toolCalls = [...(next.toolCalls ?? []), {
          // 2026-08-15 P2：复用流事件层同步生成的稳定 id（闭包 tcId——同 args 卡并存的精确定位键）
          id: tcId,
          name: chunk.toolCall.name,
          args: chunk.toolCall.args,
          status,
          result: status === 'done' && chunk.toolCall.name === 'approve-files'
            ? '文件已批量授权（本任务不重复授权）'
            : undefined
        }]
      }
      return [...prev.slice(0, target), next, ...prev.slice(target + 1)]
    })
    // 工具执行副作用（移出 updater——StrictMode 双调会执行两次；真实工具写文件等不可重复）
    // 2026-08-04 规划级授权：approve-files 跳过执行（虚拟工具——批准由 renderer approvePlan 处理）
    if (chunk.type === 'tool-call' && chunk.toolCall && chunk.toolCall.name !== 'approve-files') {
      const tc = chunk.toolCall
      // 2026-08-06 用户反馈「第一句话就有一个工具执行」：目标确认前工具门控——目标没澄清前不执行任何工具
      // （目标都没澄清，看目录/写文件都没意义）；工具直接 done + 提示（maybeContinue 回填给模型 → 模型停止调工具继续澄清目标）
      // 2026-08-03 v35：workingStage 人类化（原「调用工具 bash…」技术腔——按工具名映射自然描述）
      const stageMap: Record<string, string> = {
        read: '正在读取文件…', write: '正在写入文件…', edit: '正在修改文件…',
        bash: '正在执行命令…', search: '正在搜索…',
        // 2026-08-06 用户反馈「get_diagnostics 具体干什么了不知道」：LSP 工具名技术化 → 人类化描述（查代码错误/引用/定义等）
        get_diagnostics: '正在检查代码错误…', get_imports: '正在查看文件依赖…',
        find_definition: '正在定位代码定义…', find_references: '正在查找代码引用…',
        get_type_info: '正在查看类型信息…', get_call_chain: '正在查看代码结构…',
        // 2026-08-06 设计层升级：服务工具人类化
        'start-server': '正在启动开发服务器…', 'check-server': '正在检查服务状态…', 'stop-server': '正在停止服务…'
      }
      setWorkingStage(stageMap[tc.name] ?? (tc.name.startsWith('find_') || tc.name.startsWith('get_') ? '正在查代码…' : '正在处理…'))
      // ticket 14 L4 委托：低危文件操作（write/edit）命中委托规则 → 免确认直接执行（仍快照可回滚）；bash 高危永远单独授权
      // 2026-08-04 授权架构 v4：任务级信任——「允许并记住」的文件 write/edit 自动（沙箱内）；read/bash 只读由 main preApproval 裁决（沙箱内自动/沙箱外 ask）
      // 2026-08-07 会话级单一 PENDING 状态机（领域模型 §3.2/§3.4——重构：3 处分散 done 拦截合并为统一 pending 检测）：
      // 卡弹出（确认卡/授权卡）→ 等用户决策——模型执行类动作（write/edit/bash——有副作用）无效（做了白做——不执行）；
      // 信息类（read/search/check-capability——只读无副作用）放行（模型可准备方案/查证——「白做」对有副作用动作才有意义）
      // 2026-08-08 根因 3 修复③：plannedFiles 清单比较统一**双向 trustPath 规范化**——【执行方案】块解析可能发生在
      // rootPath 未设置时（存相对路径 'game.js'），write 判定时 rootPath 已设（trustPath 转 '/test/game.js'）→ 直接 has 不匹配
      const inPlannedFiles = (p: unknown): boolean =>
        [...stateRef.current.plannedFiles].some((f) => trustPath(f) === trustPath(p))
      const confirmPending = (content: string, calls: Array<{ name: string; status?: string; command?: string }>): boolean => {
        // 2026-08-14 S2b（缝隙 4/5）：确认卡触发走状态机派生——执行确认只认**有副作用动作**（探索 bash 不再触发）
        const sideEffectPending = calls.some((c) => c.status === 'pending' && classifyAction(c.name, c.command) === 'side-effect')
        return pendingCardToShow(stateRef.current.goalConfirmed, stateRef.current.executionConfirmed, stateRef.current.achievementConfirmed, content, sideEffectPending) !== 'none'
      }
      // 2026-08-07 用户纠正（「无害≠有用」）：pending 下**所有工具都不执行**——read/search 虽只读无害但没用
      // （用户决策未到——结果无意义——做了白做）——模型停（maybeContinue releaseWorking）等用户决策
      // 2026-08-08 问题 2 修复（feedback.log 标注——「又检测，而且这个显示出来了，咱们定的不显示」）：
      // 拦截分支对 check-capability 同样 hidden——O2 静默语义「能力检测默认不展示」对执行/拦截一致
      // 2026-08-14 用户实测修复（「目标确认卡与授权卡不能并存」）：目标/执行确认未处理时副作用工具
      // **不执行也不弹授权卡**——canExecute 统一门控（A0 §3.5 活动边界：未确认目标 → 只澄清不产生执行动作；
      // 单一 PENDING 决策点互斥）。原 confirmPending 只认【目标确认】标记命中——模型第一轮直接调 bash 时
      // 标记未出现 → 走 main need-approval 授权卡 → 与 goalFallback 目标确认卡并存（两决策点冲突）
      const toolGate = canExecute(stateRef.current, { name: tc.name, command: String(tc.args?.command ?? ''), path: String(tc.args?.path ?? tc.args?.filePath ?? '') }, inPlannedFiles(tc.args?.path ?? tc.args?.filePath))
      const confirmGate = confirmPending(streamingRef.current.content, [{ name: tc.name, status: 'pending', command: String(tc.args?.command ?? '') }])
      // 2026-08-15 D5：会话级 PENDING（状态机冻结）下**所有工具无效**（含只读——A0 §3.4「无害≠有用」：
      // 用户决策未到——read/search 结果无意义——做了白做）。原条件只拦 side-effect——escalate 新轮
      // 在 pending 下仍可 read（轮级 confirmGate 无信号时不拦 + readonly 豁免）→ 与状态机语义不一致
      const pendingBlocked = stateRef.current.pending !== 'none'
      if (confirmGate || pendingBlocked || (!toolGate.ok && classifyAction(tc.name, String(tc.args?.command ?? '')) === 'side-effect')) {
        const gateReason = pendingBlocked ? `会话等待你的决策（${stateRef.current.pending}）——此动作未执行` : (confirmGate ? '等待你的决策' : toolGate.reason)
        // 2026-08-15 DDD 重建：工具拦截事件（tool.blocked——G3 缺口：拦截原因落时间线，消费方无需反推代码）
        tlog('tool.blocked', {
          name: tc.name,
          gate: pendingBlocked ? 'pending' : (confirmGate ? 'confirm' : 'gate'),
          reason: gateReason,
          args: tc.args
        }, 'tool')
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? { ...c, status: 'done' as const, hidden: tc.name === 'check-capability', result: (confirmGate || pendingBlocked) ? `${tc.name} 等待你的决策——此动作未执行（点确认卡后模型会重新执行）` : `${tc.name} 未执行：${gateReason}` }
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        // 2026-08-14 S2b：拦截即停——释放 working（原拦截后 working 悬挂「处理中」——状态栏卡住；
        // 渲染层确认卡的 !working 门依赖此释放——否则模型空闲但卡被 working 挡住不弹 → 死锁）
        setWorking(false)
        onWorkingChange?.(false)
        return
      }
      // 2026-08-06 偏离清单拦截（基于事实：06:03 已规划但写「正确路径」偏离批准清单 → 逐个弹授权/规划外文件——用户「相同文件弹授权」根因）：
      // 已规划（filesApprovedRef）但文件不在批准清单 → 不弹逐个卡——拒绝 + 引导补充 approve-files（清单与实际始终一致）
      if (tc.name === 'write' && stateRef.current.filesApproved && !inPlannedFiles(tc.args.path)) { // 2026-08-06 edit 豁免（改现有文件=操作明确——B 类文件操作直接改）；write 新建强制规划
        // 2026-08-15 DDD 重建：偏离清单拦截事件（tool.blocked gate='out-of-plan'——拒绝带边界可回放）
        tlog('tool.blocked', { name: tc.name, gate: 'out-of-plan', reason: `${tc.args.path} 不在批准清单`, args: tc.args }, 'tool')
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? (() => {
                const approved = [...stateRef.current.plannedFiles].map((p) => p.split('/').pop()).join('、')
                return { ...c, status: 'done' as const, result: `${tc.args.path} 不在批准清单（已批准：${approved || '无'}）——不要重复尝试；改写清单内文件，或再次调 approve-files 补充该文件（列出文件+原因）` }
              })()
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      // 2026-08-08 根因 3 修复③：write 门控与【执行方案】块联动——用户确认执行（executionConfirmedRef）后，
      // 【执行方案】块解析的清单内文件（plannedFilesRef）视为已批准（approved=true）→ 绕过 main 规划门控
      // （模型已列清单 + 用户已确认执行 = 认可这批文件——无需再点 approve-files 卡；清单外文件仍被 main 门控拦）
      const execPlanApproved = tc.name === 'write' && stateRef.current.executionConfirmed && inPlannedFiles(tc.args.path)
      const autoApproved = execPlanApproved || (delegateLowRisk && toolRisk(tc.name) === 'low') || isTrusted(tc.args)
      void (window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: autoApproved, rootPath: rootPath ?? undefined, sessionId }) ?? Promise.resolve({ ok: false, error: 'tools 通道未就绪' })).then((r) => {
        const data = r.data as { file?: string; snapshot?: boolean } | undefined
        // 13 交付包联动：真实文件操作成功（write/edit 返回 file）→ 上报变更（产物区展示）
        if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
        // 2026-08-14 S2：工具结果 → 状态机转换唯一入口（applyToolResult——进度/失败标志汇入状态）
        applyTool({ name: tc.name, ok: r.ok, needApproval: r.needApproval, policy: r.policy, file: data?.file })
        tlog(r.ok ? 'tool.executed' : 'tool.failed', { name: tc.name, needApproval: r.needApproval, error: r.error }, 'tool')
        // 2026-08-15 DDD 重建：main 侧策略引导（write 未规划 policy）→ tool.blocked（非执行失败——gate='policy'）
        if (!r.ok && r.policy) {
          tlog('tool.blocked', { name: tc.name, gate: 'policy', reason: r.error, args: tc.args }, 'tool')
        }
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => {
            if (c.name !== tc.name || c.status !== 'pending') return c
            return r.ok
              ? (() => {
                  // 2026-08-08 O2：check-capability 检测结果——能力齐备 → 工具卡隐藏（hidden——用户不被打扰，结果仍回填模型）；
                  // 缺失/异常（needsUser）→ 展示（用户需实质决策：安装/换方案）
                  if (tc.name === 'check-capability') {
                    const cap = summarizeCapability(r.data as { capabilities?: Array<{ id: string; status: string; detail?: string }> })
                    tlog('capability.checked', { capabilities: (r.data as { capabilities?: Array<{ id: string; status: string }> })?.capabilities ?? [], missing: cap.needsUser }, 'tool')
                    return { ...c, status: 'done' as const, result: cap.summary, hidden: !cap.needsUser, rawResult: typeof r.data === 'string' ? r.data.slice(0, 16000) : JSON.stringify(r.data ?? '').slice(0, 16000) }
                  }
                  // 2026-08-06 修正重写可见性（用户「第二次 write 很快不知道发生了什么——只需知道第二次是 fix bug」）：
                  // write 且该文件之前已写过（producedFilesRef 已有）→ 卡上标记「修正重写」——用户看到第二次是修正不是重复
                  const isRewrite = tc.name === 'write' && !!data?.file && stateRef.current.producedFiles.has(data.file)
                  return { ...c, status: 'done' as const, result: (isRewrite ? '⚠️ 修正重写——' : '') + fmtToolResult(r), rawResult: typeof r.data === 'string' ? r.data.slice(0, 16000) : JSON.stringify(r.data ?? '').slice(0, 16000), file: data?.file, canRevert: !!(data?.file && data.snapshot) }
                })()
              : { ...c, status: r.needApproval ? ('need-approval' as const) : ('error' as const), result: r.error }
          })
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
      })
    }
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, working])

  // 工具完成后触发续聊：轮询等工具执行（自动/授权）完成，全 done → 回填模型继续
  // 2026-08-04 重构（用户：「定多少才不会卡」）：死上限（2/8）→ 自然停止 + 兜底——只要模型还在调工具就继续（开发正常 10-20+ 轮）；
  // 停止条件：模型不调工具（toolCalls 空）/ 待授权 / 同工具重复 3 次（死循环）/ 40 轮总兜底
  const maybeContinue = async (depth: number, sid: number) => {
    const ctx = chatRef.current
    if (!ctx || depth >= 40 || sessionRef.current !== sid) return
    // 2026-08-05 用户反馈 3（处理中可发送）：工具执行期间保持 working=true（状态栏「搭档处理中」）——send 守卫/停止按钮可感知模型仍在干活；
    // 原工具执行间隙 working=false → 用户发送放行 → 新旧对话并发（未知问题）
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage('工具执行中…')
    const releaseWorking = () => { setWorking(false); onWorkingChange?.(false) }
    // 等待自动执行（pending）完成——最多 150s（2026-08-05 根因修复：原 8s 窗口 < 长任务工具超时
    // （bash 30s / npm install 120s——坑 61）→ 工具未完成就续聊 → 回填「执行失败」→ 模型停住/重试；
    // 窗口必须覆盖最长工具超时；待授权（need-approval）立即停止（等用户点允许）
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 500))
      // 2026-08-05 防护：长窗口（150s）期间用户可能打断（处理中发送=stopGeneration→sessionRef++）——检测到立即停止等待，防旧会话续聊
      if (sessionRef.current !== sid) { releaseWorking(); return }
      const latest = messagesRef.current
      const lastMsg = latest[latest.length - 1]
      if (!lastMsg || !lastMsg.toolCalls || lastMsg.toolCalls.length === 0) { releaseWorking(); return }
      const pending = lastMsg.toolCalls.filter((c) => c.status === 'pending')
      const needsApproval = lastMsg.toolCalls.some((c) => c.status === 'need-approval' || c.status === 'file-approval')
      // 2026-08-07 会话级单一 PENDING（重构——确认卡待决策 → 模型停——动作无效——用户决策是唯一输入）
      // 2026-08-14 S2b（缝隙 4/5）：确认卡触发走状态机派生——执行确认只认**有副作用动作**（探索 bash 不再触发）
      const lastContent = lastMsg.content ?? ''
      const sideEffectPending = lastMsg.toolCalls.some((c) => c.status === 'pending' && classifyAction(c.name, String(c.args?.command ?? '')) === 'side-effect')
      const confirmPending = pendingCardToShow(stateRef.current.goalConfirmed, stateRef.current.executionConfirmed, stateRef.current.achievementConfirmed, lastContent, sideEffectPending) !== 'none'
      // 2026-08-15 问题 A 修复（用户实测 14 轮工具循环根因）：停止条件接入状态机——pending 非 none 即停
      // （与 canExecute 同源——领域层 shouldStopContinuation）。授权卡（need-approval/file-approval）可能挂在
      // **旧消息**（用户未批准未拒绝——卡悬挂）→ 全列表 effect 已置 pending='approval'，但 lastMsg 派生检测不到
      // → 修复前继续喂模型 → forceTool 逼模型每轮调工具 → 被 pendingBlocked 拦 → 循环。现在卡在任意消息都停续聊
      if (shouldStopContinuation(stateRef.current, { needsApproval, confirmPending })) { releaseWorking(); return } // 卡弹出（确认卡/授权卡）——等用户决策（模型停——不续聊）
      if (pending.length === 0) {
        // 2026-08-04 重构：同工具重复检测（同一 name+args 连续 3 次 = 死循环——防模型空转不产出；跨调用累积——原局部变量每轮重置失效）
        // 2026-08-05 体验反馈：只统计写工具（write/edit）——read/bash 只读重复是模型合理排查（曾因 read 摘要化反复读同文件被误伤），不触发；真正空转由 depth 40 兜底
        // 2026-08-14 修复（冒烟实测：npm init 中文目录名失败 exit-1 → 模型 13+ 次原样重试同一命令——空错误无诊断 + bash 重试无上限 = 死循环；
        // 同日再实测：check-server 成功仍重复 7+ 次（起服务验证后不收敛）——成功重复同样空转）：
        // 重复检测覆盖三类：① write/edit（原判定）② **失败工具**（status=error——失败重试 ≠ 合理排查，错误没变结果不会变）
        // ③ **执行/验证类工具**（bash/check-server/start-server/stop-server/open——成功还重复 = 转圈）；
        // read/search/LSP 查询类仍豁免（2026-08-05 决策：只读重复是模型合理排查）
        const retryCalls = lastMsg.toolCalls.filter((c) =>
          (c.name === 'write' || c.name === 'edit')
          || c.status === 'error'
          || ['bash', 'check-server', 'start-server', 'stop-server', 'open'].includes(c.name)
        )
        if (retryCalls.length > 0) {
          // sig 含 status：失败→成功的「修好了」不算重复（npm install 失败 2 次后成功 = 合理收敛）
          const sig = retryCalls.map((c) => `${c.name}:${c.status}:${JSON.stringify(c.args ?? {})}`).join('|')
          const chain = chainRepeatRef.current
          if (chain.sid !== sid) { chain.sid = sid; chain.sig = ''; chain.count = 0 }
          chain.count = sig === chain.sig ? chain.count + 1 : 1
          chain.sig = sig
          if (chain.count >= 3) {
            console.log('[conversation] 工具循环疑似死循环（同一工具重复 3 次）——停止续聊')
            // 2026-08-04 体验修复：停止时提示用户（原静默停——用户看到「卡住」不知道原因；提示后可继续）
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: '搭档检测到在重复做同一件事（反复写同一个文件、反复执行同一个失败命令或反复检查同一个服务，已自动暂停，避免死循环）。你回复「继续」或告诉它下一步，它就会接着做。',
              status: 'done',
              id: nextMsgId()
            }])
            releaseWorking()
            return
          }
        }
        break // 全部执行完成
      }
    }
    const latest = messagesRef.current
    const lastMsg = latest[latest.length - 1]
    if (!lastMsg) { releaseWorking(); return }
    const calls = lastMsg.toolCalls ?? []
    if (calls.length === 0) { releaseWorking(); return }
    // 组装 tool 消息序列
    const toolMsgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }> = [
      ...ctx.msgs,
      {
        role: 'assistant',
        content: null,
        reasoning_content: lastMsg.reasoning ?? '',
        tool_calls: calls.map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }))
      },
      ...calls.map((c, i) => ({ role: 'tool', tool_call_id: `call_${i}`, content: c.rawResult ?? c.result ?? '执行失败' }))
    ]
    chatRef.current = { msgs: toolMsgs, depth: depth + 1 }
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming', id: nextMsgId() }])
    await new Promise((r) => setTimeout(r, 50))
    await runChat(toolMsgs, depth + 1, sid)
  }

  // 多轮工具循环：模型返回 tool_call → 执行 → 结果回填 → 续聊（2026-08-04 重构：自然停止——模型不调工具/待授权/死循环检测；40 轮总兜底）
  const runChat = async (msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>, depth: number, sid: number) => {
    // 2026-08-04：当前活跃流 = 本 sid（停止后旧流 chunk 不再更新 UI）
    streamingSidRef.current = sid
    // 2026-08-04 重构（用户：「定多少才不卡」根因——原 `depth > 4` 硬上限，开发工具链 5+ 轮必断）：40 轮总兜底（防死循环由 maybeContinue 重复检测承担）
    if (depth > 40) {
      // 2026-08-05：提前 return 释放 working（不经过 maybeContinue/finishError——防卡「搭档处理中」）
      setWorking(false); onWorkingChange?.(false); setWorkingStage('就绪')
      return
    }
    const key = await window.neonforge.config.getKey()
    if (!key) { finishError('key-invalid'); return }
    // 系统提示：引导直接 read（项目根相对路径）——避免 bash 全局搜索/工具循环（提速）
    // 2026-08-02：LSP 工具接入模型（HANDOFF §3 第一优先）——引导用 find_definition/find_references/get_type_info 查真实代码上下文
    // 2026-08-02：search 工具接入模型（Layer2 CodeRAG agentic 化——Claude Code grep 模式）
    // 2026-08-03 v33：回复语言跟随用户——检测最近用户消息语言（中文 → 中文回复；否则 → 同语言回复）
    // 2026-08-04：回复风格约束——用户反馈「太技术化/杂音多」——面向非技术用户：简洁口语化 + 无 Markdown 重符号/少括号/少空行
    // 2026-08-07 环境/能力快照注入（用户「环境/能力注入缺少——模型要自己确认目录/环境」）：
    // 主动调 check-capability（内部执行——risk none 不弹卡）→ 环境+能力状态注入系统提示——模型开箱即知，
    // 不用 bash 探索确认目录/依赖/能力（冒烟 5 实测：模型「先检查一下环境和目录情况」但不知道环境 → 卡住）
    let envHint = ''
    if (rootPath) {
      try {
        const cap = await window.neonforge.tools.execute('check-capability', { dir: rootPath, sessionId })
        if (cap.ok) {
          const data = cap.data as { capabilities?: Array<{ id: string; status: string }>; runtime?: string; runtimeVersion?: string; hasNodeModules?: boolean } | undefined
          const caps = data?.capabilities ?? []
          const ready = caps.filter((c) => c.status === 'ready').map((c) => c.id)
          const missing = caps.filter((c) => c.status === 'missing' || c.status === 'failed').map((c) => c.id)
          envHint = `【当前环境】项目根目录：${rootPath}；runtime：${data?.runtime ?? '?'} ${data?.runtimeVersion ?? ''}；依赖：${data?.hasNodeModules ? '已装' : '未装'}；可用能力：${ready.join('/') || '无'}；${missing.length > 0 ? `缺失/异常：${missing.join('/')}` : '能力齐备'}。`
          // 2026-08-15 M8：环境注入事件（06 §1.4 environment.injected 对应打点——模型 02 §4.7 事实来源前置呈现可观测）
          tlog('environment.injected', { rootPath, runtime: data?.runtime, runtimeVersion: data?.runtimeVersion, hasNodeModules: data?.hasNodeModules, caps: caps.map((c) => `${c.id}:${c.status}`) }, 'system')
        }
      } catch { /* 环境注入失败不影响发送 */ }
    }
    // 2026-08-07 批准清单可见性（竞品源码调研：Aider abs_fnames / Codex rules / Goose judge——边界对模型显式可见）：
    // approve-files 批准后 → 清单注入系统提示——模型每轮知道「可写哪几个文件」——写文件对照清单，不写清单外
    let planHint = ''
    const plannedFiles = stateRef.current.plannedFiles
    if (plannedFiles.size > 0) {
      const names = [...plannedFiles].map((p) => p.split('/').pop()).join('、')
      planHint = `【已批准文件清单】${names}——**写文件只能写清单内的**；写清单外文件会被拒绝。被拒=该文件不在已批准范围——**改写清单内文件**；确需写新文件，先调 approve-files 补充（列出文件+原因）再写。`
    }
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
    const langRule = lastUserMsg && /[\u4e00-\u9fff]/.test(String(lastUserMsg.content ?? ''))
      ? '用中文回复用户（避免英文夹杂；工具名/代码/技术名词可保留原文；**即使工具结果/代码是英文，回复用户也保持中文**——不要中途切换成英文）'
      : '用与用户消息相同的语言回复'
    // 2026-08-15 Q6：系统提示词外置（sysPrompt.ts——原 4812 字符模板内嵌组件）
    const sysHint = buildSysHint(envHint, planHint, langRule)
    try {
      // 2026-08-06 调研驱动根治「只说不做」（官方 issue #1376 + 文档 + 实测三源交叉验证——工具模式 thinking disabled 下 required 可用）：
      // 2026-08-07 无阶段重构 S1/S3/S4：判定改由领域层 TurnExecutionPolicy 三态推导（goalConfirmed/executionConfirmed/produced）——
      // 目标+执行确认但无产出 → required 强制模型必须调工具（不能只输出文本承诺）；其余 auto（澄清/等确认/已有产出）
      // isPureAck 词表随无阶段终结（S3——T4「保持现状」决策被取代：纯确认进入目标/执行确认状态流转，无需独立豁免名单）
      // 2026-08-14 S4（缝隙 3）：forceTool 输入统一走状态机派生 buildForceToolInput——
      // plannedComplete 从「size 宽松比较」切换为领域层严格判定（plannedFiles ⊆ produced ∪ projectFiles；
      // 无计划以 produced 为准——A0 §4 补行语义，L1 已锁定）
      // 2026-08-08 根因 3 修复①：判定改读 **ref** 而非 prop 闭包——确认卡按钮同事件触发 send 时
      // （onClick 内 setState 异步 + sendRef 同步调用）prop 还是旧渲染值 → forceTool 恒 auto → 模型纯文本承诺后停住
      const { forceTool } = decideTurnPolicy(buildForceToolInput(stateRef.current, new Set((recentFilesExternal ?? []).map((f) => trustPath(f)))))
      // 2026-08-15 补齐：执行保障事件（06 §1.5 execution.forced/released——forceTool 轨迹可回放）
      tlog(forceTool ? 'execution.forced' : 'execution.released', { reason: 'turn-policy' }, 'system')
      // 2026-08-14 取证打点（用户实测「一直读取操作」——plannedComplete 未收敛）：dump 三集合供 timeline 比对
      tlog('execution.force_input', {
        planned: [...stateRef.current.plannedFiles].slice(0, 12),
        produced: [...stateRef.current.producedFiles].slice(0, 12),
        projectFiles: (recentFilesExternal ?? []).slice(0, 12),
        goalAchieved: stateRef.current.achievementConfirmed
      }, 'system')
      tlog('conversation.assistant_start', { forceTool, goalConfirmed: stateRef.current.goalConfirmed, executionConfirmed: stateRef.current.executionConfirmed }, 'assistant')
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic',
        tools: true,
        forceTool,
        messages: [sysHint, ...msgs]
      })
      if (!res.ok) { finishError(res.error ?? 'gateway-error', res.errorType); return }
    } catch { finishError('network'); return }

    // 记录本轮上下文 → 由 maybeContinue 轮询工具完成（自动执行）→ 续聊
    chatRef.current = { msgs, depth }
    // 2026-08-04 体验修复：等流式 done（模型回复完成 → working 立即释放——原固定等 1000ms+轮询，用户快速「确认推进」被 working 守卫拦截）；
    // 800ms 超时兜底（流式异常未发 done 时防挂起）
    await new Promise<void>((r) => {
      const t = setTimeout(() => { doneNotifierRef.current = null; r() }, 800)
      doneNotifierRef.current = () => { clearTimeout(t); doneNotifierRef.current = null; r() }
    })
    await maybeContinue(depth, sid)
  }

  // 2026-08-04：对话历史构造（send 与阶段推进自动触发共用——工具轮转文本摘要保留上下文，DeepSeek 要求 tool 消息带 reasoning_content）
  // 2026-08-06 根因修复（用户「说了做没做老问题——到底需要多少兜底」）：工具轮**不再转「（上一步执行：xxx）」自然语言文本**——
  // 那是模型文本模拟工具的模仿源（09:38 日志模型输出「（上一步执行：[read]）」= 模仿历史里我方塞的文本；9 层兜底全在补救症状，从没修模仿源）；
  // 改为保留**标准结构化 tool_calls + tool 消息**（与工具循环 497-505 行同格式——模型看到的是系统工具消息，不会模仿成正文）
  const buildHistory = (msgs: Msg[]): Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }> => {
    let callSeq = 0 // 历史多轮工具的全局唯一 tool_call_id
    return msgs
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done'))
      .flatMap((m): Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> => {
        // 2026-08-15 D4：工具轮完整回填——① 有正文+工具的消息也带 tool_calls（原 `!m.content` 条件丢弃工具结果）② tool 消息用
        // rawResult 完整内容（原用 UI 摘要 c.result 且截断 300——模型后续轮看不到 read 内容 → 被迫反复 read——「一直读取操作」嫌疑）
        // 与 maybeContinue（工具循环内）回填语义一致：c.rawResult ?? c.result
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          const calls = m.toolCalls.map((c, i) => ({
            id: `h${callSeq + i}`,
            name: c.name,
            args: c.args,
            result: c.rawResult ?? c.result ?? c.status ?? '执行失败'
          }))
          callSeq += calls.length
          return [
            { role: 'assistant', content: m.content || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
            ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: String(c.result) }))
          ]
        }
        return [{ role: m.role, content: m.content }]
      })
  }
  const workingRef = useRef(false)
  useEffect(() => { workingRef.current = working }, [working])
  // 2026-08-04 体验修复：流式 done 通知——runChat 尾部等 done（working 及时释放，用户快速「确认推进」不被拦）
  const doneNotifierRef = useRef<(() => void) | null>(null)
  // 2026-08-07 无阶段重构 S4：pendingAdvanceRef（阶段推进排队）删除——advanceChat 随阶段体系移除
  // 2026-08-04 重构：工具链死循环检测——同工具（name+args）连续 3 次停止（跨 maybeContinue 调用累积——原局部变量每轮重置失效）
  const chainRepeatRef = useRef<{ sid: number; sig: string; count: number }>({ sid: -1, sig: '', count: 0 })
  // 2026-08-04 授权架构 v4：任务级信任集合——「允许并记住」的文件（沙箱内 write/edit 自动）；阶段推进（确认推进=新任务）自动清除
  const [taskTrust, setTaskTrust] = useState<string[]>([])
  const taskTrustRef = useRef<string[]>([])
  const trustPath = (p: unknown): string => {
    const s = String(p ?? '')
    if (s.startsWith('/')) return s
    return rootPath ? `${rootPath}/${s.replace(/^\/+/, '')}` : s
  }
  const isTrusted = (args: Record<string, unknown>): boolean =>
    taskTrustRef.current.includes(trustPath(args.path ?? args.filePath ?? ''))
  const addTrust = (args: Record<string, unknown>): void => {
    // 2026-08-06 安全漏洞（用户反馈「启动服务没弹授权卡」）：bash 点「允许并记住」→ trustPath('') fallback rootPath → 整个项目根被信任 → 后续所有 bash 绕过授权！
    // 修复：只信任「文件路径类」工具（write/edit 的 path）——bash 无 path 一律不进入信任（bash 高危永远单独确认）
    if (!args.path && !args.filePath) return
    const p = trustPath(args.path ?? args.filePath ?? '')
    if (!p || taskTrustRef.current.includes(p)) return
    // 2026-08-04 授权架构 v4：只信任沙箱内（项目根内）——沙箱外 write/edit 永不进入信任集合（每次弹卡——安全底线）
    if (!rootPath || !p.startsWith(rootPath)) return
    taskTrustRef.current = [...taskTrustRef.current, p]
    setTaskTrust(taskTrustRef.current)
  }
  const clearTrust = (): void => {
    taskTrustRef.current = []
    setTaskTrust([])
    // 2026-08-05：阶段推进 = 任务边界；2026-08-07 无阶段重构 S4/S5：目标确认（goalSeq）= 任务边界——approve-files 幂等标记同步重置（新任务需重新规划授权）
    // 2026-08-14 S2：状态机字段（完整任务边界重置由 userConfirmed('goal') 承担——此处仅即时清幂等标记）
    setFilesApproved(false)
    // 2026-08-15 D2：任务边界同步 main（filesApprovedRef 复位——否则跨任务 write 规划门控失效）
    try { void window.neonforge.tools?.filesApprovedReset?.() } catch { /* 重置失败不影响——renderer 门控仍生效 */ }
  }
  // 2026-08-04 修复（用户「游戏成的3是D」错位）：流式链互斥——一次只跑一条链（send/advanceChat/授权续聊），其他链排队；
  // 原并发流（approveToolCall 续聊 + pendingAdvance 补发）chunk 交错写入同一消息 → 文本字符级错位
  const chainLockRef = useRef<Promise<void>>(Promise.resolve())
  const acquireChain = () => {
    const prev = chainLockRef.current
    let release!: () => void
    chainLockRef.current = new Promise<void>((r) => { release = r })
    return prev.then(() => release)
  }

  // 2026-08-05 用户反馈 4：打断能力（对齐 Claude Code Esc / Cursor Stop）——停止当前流 + 杀当前 bash + 释放状态
  // 停止后旧流 chunk / maybeContinue 续聊全部失效（sessionRef++ 隔离）；用户可继续输入新指令
  const stopGeneration = async (source: 'button' | 'silent' = 'button') => {
    tlog('conversation.interrupted', { source }, 'system') // 2026-08-08 打断打点（停止按钮 / silent 自动干预）
    sessionRef.current++ // 旧会话失效——旧流 chunk（streamingSidRef 检查）、maybeContinue 续聊（sessionRef 检查）全失效
    streamingSidRef.current = sessionRef.current
    onActionPromiseHint?.(null)
    try { await window.neonforge.tools.cancel?.() } catch { /* 无活动命令 */ }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('已停止')
  }

  // 2026-08-07 无阶段修复（用户「输入≠打断」）：排队衔接机制——模型产出中用户发送 → 存 pending，
  // 当前轮（流式+工具链）完成后自动发送（不打断）；打断 = 显式停止按钮（.nf-chat__stop）
  const pendingSendRef = useRef('')
  const flushPendingSend = () => {
    const pending = pendingSendRef.current
    if (!pending) return
    pendingSendRef.current = ''
    inputRef.current = pending
    // 等 workingRef 更新（setWorking(false) effect 渲染后）——避免 send 开头误判 working 又排队
    setTimeout(() => void sendRef.current(), 50)
  }

  // 2026-08-06 只说不做第 5 次升级（用户反馈「最后又卡住了」）：send 支持 silent（自动续聊用——不显示/不记录用户消息，避免用户看到「自己发的」困惑）
  const send = async (opts?: { silent?: boolean }) => {
    const text = inputRef.current.trim()
    if (!text) return
    // 2026-08-07 无阶段修复（用户「输入≠打断」——竞品共识：Claude Code Esc / Cursor 停止按钮 / Devin 中断都是显式动作）：
    // 模型产出中发送 = 排队衔接（不打断当前流式/工具链，当前轮完成后自动发送）；打断 = 显式停止按钮（.nf-chat__stop）
    // 待授权（模型停住等批准）时发送 = 直接处理（用户未批准给新指令——排队会卡在授权等待）
    if (workingRef.current) {
      if (opts?.silent) {
        // 系统自动消息（StuckDetector escalate/执行确认触发——非用户输入）：直接处理（打断当前——内部机制干预卡住，
        // 不受「输入≠打断」约束；排队会让修正消息延迟到当前轮完成——卡住时正是要立即干预）
        console.log('[conversation] 处理中 silent 发送——打断当前（系统自动续聊/修正）')
        await stopGeneration('silent')
      } else if (stateRef.current.pending !== 'approval') {
        // 用户输入：排队衔接（不打断当前流式/工具链——输入≠打断，竞品共识：打断=显式停止按钮）
        // 只存 pending——消息显示/onUserMessage（确认词处理）由 flush 后 send 统一执行一次
        // （原排队时 push + flush 后 send 再 push = 重复用户消息——398 实测两条「可以」）
        console.log('[conversation] 处理中发送——排队衔接（当前轮完成后自动发送；要停请点停止按钮）')
        pendingSendRef.current = text
        inputRef.current = ''
        setInput('')
        return
      }
      console.log('[conversation] 待授权中发送——新指令直接处理（未批准给新指令）')
    }
    inputRef.current = ''
    setInput('')
    if (!opts?.silent) {
      // 13 复跑入口：上报用户输入（真实交付包 rerunPrompt 用）
      onUserMessage?.(text)
      // 2026-08-04：对话日志（自动记录用户消息——与 assistant done 互补成完整对话）；2026-08-08 会话归属
      tlog('conversation.message_sent', { content: text }, 'user')
      window.neonforge.chatLog?.log?.({ ts: new Date().toISOString(), role: 'user', content: text, session: sessionId })
      setMessages((p) => [...p, { role: 'user', content: text, status: 'done', id: nextMsgId() }])
    }
    // 2026-08-04：新轮次——重置流式累积（防上轮异常残留）
    streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
    setWorking(true)
    onWorkingChange?.(true)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messages)
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming', id: nextMsgId() }])
    setWorkingStage('已发送，等待搭档…')

    // ticket 12 ContextEngine：@引用文件 → 注入精准上下文（零 token 确定性——不走 LLM read）
    const msgs: Array<{ role: 'user' | 'system'; content: string }> = [{ role: 'user', content: text }]
    const mentionFiles = (text.match(/@(\S+)/g) ?? []).map((m) => m.slice(1))
    if (mentionFiles.length > 0 && rootPath) {
      try {
        const ctx = await window.neonforge.context.resolve(mentionFiles)
        if (ctx.fragments.length > 0) {
          const note = '【已注入文件上下文（@引用）】\n' + ctx.fragments.map((f) => `--- ${f.path}${f.truncated ? '（截断）' : ''} ---\n${f.content}`).join('\n\n')
          msgs.unshift({ role: 'system', content: note })
        }
      } catch { /* 注入失败不影响发送 */ }
    }
    // ticket 08d：搭档须知 .neonforge 注入（项目级指令——readNotebook 已实现未消费；全局指令放最前）
    if (rootPath) {
      try {
        const nb = await window.neonforge.workspace.readNotebook(rootPath)
        if (nb?.ok && nb.content.trim()) {
          msgs.unshift({ role: 'system', content: `【搭档须知 .neonforge】\n${nb.content.slice(0, 2000)}` })
        }
      } catch { /* 注入失败不影响发送 */ }
    }
    // 2026-08-07 无阶段重构 S4：stageHint（阶段指引注入）删除——无阶段体系
    // ticket 11 Compaction：对话历史超阈值（>100 条或 >200K 字符）→ 压缩为摘要 + 保留最近 20 条（上下文不丢）
    let chatHistory = history
    if (history.length > 100) {
      try {
        const compacted = await window.neonforge.compaction.compact(history)
        if (compacted.ok) {
          // 2026-08-06 用户反馈「压缩条数够了就一直触发」：原只改本次发送 chatHistory，messages state 不变 → 每轮 send 都重新压缩
          // （每轮重压早期上下文 → 上下文不稳定 + 浪费 token + 模型行为异常）；修复：压缩结果写回 messages state
          // （早期压缩为摘要 + 保留最近 20 条）→ 压缩只触发一次，新消息累积到阈值才再压
          setMessages((prev) => {
            const tail = prev.slice(-2) // 当前轮新 user + streaming（压缩后保留）
            return [
              // 2026-08-06 用户「早期对话已压缩不要显示实际内容」：展示只提示压缩，summary 只进 API（738 行）——用户不读早期总结
              { role: 'assistant', content: '（早期对话已压缩——长对话自动摘要，最近 20 条保留）', status: 'done' as const, id: nextMsgId() },
              ...compacted.kept.filter((m) => m.content != null).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '', status: 'done' as const, id: nextMsgId() })),
              ...tail
            ]
          })
          chatHistory = [
            { role: 'user' as const, content: compacted.summary },
            ...compacted.kept.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' }))
          ]
          setWorkingStage('已压缩长对话（摘要 + 最近 20 条）…')
        }
      } catch { /* 压缩失败 → 全量发送（降级不阻塞） */ }
    }
    try {
      // 2026-08-04 修复（流式链互斥）：send 链占锁——其他链（授权续聊）排队，防 chunk 交错
      const release = await acquireChain()
      try {
        await runChat([...chatHistory, ...msgs], 0, sid)
      } finally {
        release()
      }
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
      // 2026-08-07 无阶段修复（输入≠打断）：当前轮（流式+工具链）完成 → 排队消息自动衔接发送
      flushPendingSend()
    }
  }
  // 05 B：sendRef 同步最新 send（externalRequest 触发用）
  useEffect(() => { sendRef.current = send }, [send])

  // 2026-08-07 无阶段重构 S4：advanceChat（阶段推进自动触发）删除——无阶段无阶段切换；
  // 目标确认/执行确认后由用户消息驱动（send 正常流程），不再有内部阶段指令

  // L3 授权：允许执行（approved=true）/ 拒绝（标记拒绝）
  // 2026-08-04 重构（用户：「搭档处理中」卡住根因）：按消息定位工具卡更新——原固定更新最后一条消息，
  // 续聊已追加新 streaming 消息时错位（工具结果回填错位 → maybeContinue 看不到 done → 链中断 + working 卡）
  // 2026-08-15 Q1b：工具授权 handler 封装（useToolApproval——批准/拒绝/记住/合并/回滚/停止）
  const { patchToolCall, approveToolCall, rejectToolCall, rememberAndApprove, approveAllRemember, approvePlan, revertToolCall, stopToolCall, approveAllToolCalls } = useToolApproval({
    setMessages, tlog, fmtToolResult, trustPath, rootPath, sessionId, onToolResult, applyTool, grantPlan, addTrust,
    acquireChain, maybeContinue, chatRef, sessionRef, streamingSidRef, streamingRef, setWorking, onWorkingChange, setWorkingStage
  })
  const finishError = (err: string, errorTypeHint?: ChatErrorType) => {
    // 2026-08-04 体验修复：错误分类 + 日志记录在 updater 外（坑 32——StrictMode updater 双调；原仅 done 记录错误无法追溯）
    // 2026-08-05 用户反馈（第二轮候选点选后卡住）：runChat 提前 return（gateway 错误/网络错误/key 失效）走 finishError 不经过 maybeContinue——
    // working 释放点已移到 maybeContinue（0e12ea6）→ finishError 不释放 → working 卡 true → 状态栏「搭档处理中」→ 卡住；此处统一释放
    // 2026-08-07 T1 根因补强：ipc 返回结构化 errorType 优先（gateway 源头分类）——classifyChatError 仅兜底（字面量/未知格式）
    const errorType = errorTypeHint ?? classifyChatError(err)
    tlog('conversation.error', { errorType, message: err }, 'system') // 2026-08-08 错误打点（错误链路可追溯）
    let content = '刚才出错了，请再试一次。'
    if (errorType === 'key-invalid') {
      content = 'API Key 好像失效了，换个 Key 试试。'
    } else if (errorType === 'service') {
      content = '服务暂时不可用，稍后再试。'
    }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('就绪')
    onActionPromiseHint?.(null)
    window.neonforge.chatLog?.log?.({ ts: new Date().toISOString(), role: 'assistant', content, error: errorType, session: sessionId })
    setMessages((p) => {
      const last = p[p.length - 1]
      if (!last || last.role !== 'assistant') return p
      return [...p.slice(0, -1), { ...last, status: 'error', error: errorType, content }]
    })
  }

  const demo = getDemoBridge()
  // 2026-08-07 无阶段重构 S4：demoFlow（DeliveryFlowPanel demo 通道）删除——阶段卡随阶段体系移除
  const demoDigital = !!demo?.digitalDelivery
  const demoTrust = !!demo?.trustLadder
  const demoDod = !!demo?.dodAlign
  const compactCount = demo?.compactHistory ?? 0
  const compactNote = compactCount > 24 ? `对话已超过 24 条——将压缩前 ${compactCount - 12} 条为摘要（上下文不丢）` : null
  const onDeliver = (pkg: DeliveryPackage) => {
    getDemoBridge()?.onDeliver?.(pkg)
  }

  return (
    <div className="nf-chat">
      {demoDigital && <DigitalDeliveryPanel onDeliver={onDeliver} />}
      {demoTrust && <TrustLadderPanel authorizedLogs={activeAuthorizedLogs} delegateLowRisk={delegateLowRisk} onDelegateChange={handleDelegateChange} />}
      {demoDod && <DoDAlignPanel />}
      {compactNote && <div className="nf-compact"><IconClock size={12} /> {compactNote}</div>}
      <div className="nf-chat__list" ref={listRef} aria-live="polite" aria-relevant="additions text" tabIndex={0} aria-label="对话消息列表">
        {messages.length === 0 && (
          <div className="nf-scenes">
            <p className="nf-placeholder">想解决什么？直接说，或从这些开始：</p>
            <div className="nf-scenes__grid">
              {SCENES.map(({ icon: Icon, label, q }) => (
                <button
                  key={label}
                  type="button"
                  className="nf-scene"
                  onClick={() => { setInput(q); inputRef.current = q; textareaRef.current?.focus() }}
                >
                  <span className="nf-scene__icon"><Icon size={20} /></span>
                  <span className="nf-scene__label">{label}</span>
                  <span className="nf-scene__q">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`nf-msg nf-msg--${m.role}`}>
            {m.role === 'assistant' && m.status === 'streaming' && (
              <span className="nf-breath" />
            )}
            {m.role === 'user' && <span className="nf-msg__role">你</span>}
            <div className={`nf-msg__body${m.role === 'assistant' && m.status === 'streaming' && !m.content ? ' nf-msg__body--thinking' : ''}`}>
              {/* 2026-08-04：展示前 cleanContent 清洗（字面转义/连续换行/行尾空白）——只影响展示，API 发送原文
                  2026-08-05：stripCandidates 剥离 <candidates> 候选块（不露标记；候选渲染为按钮组）+ stripTags 去模型自发尖括号标签（实测 <one-question>，去标签留内容） */}
              {m.content ? cleanContent(stripTags(stripCandidates(m.content))) : (m.status === 'streaming' ? '搭档处理中…' : m.error === 'empty-response' ? '搭档没有返回内容——请重试或换个说法' : m.status === 'error' ? '处理失败' : '')}
              {m.error === 'key-invalid' && (
                <button type="button" className="nf-config__link" onClick={onKeyExpired}>
                  要不要更新一下？
                </button>
              )}
            </div>
            {/* 2026-08-05 方案 3：结构化候选按钮——模型 <candidates> 块 → 可点击按钮（点选发送选项文本，不走序号解析）
                体验反馈：竖排 + 行首序号（① ② ③）——序号仅展示，发送仍用选项文本 */}
            {m.role === 'assistant' && m.status === 'done' && m.content && !m.content.includes('【目标确认') && !m.content.includes('【执行方案') && !m.content.includes('【已达成') && (() => {
              // 2026-08-08 B 修复（feedback.log——「候选确认卡 + 确认卡不能同时出来」）：
              // 同消息互斥——含确认卡标记（【目标确认】/【执行方案】/【已达成】）时不渲染候选按钮
              // （一个决策点一个决策点地走——确认卡接管决策，候选收起）
              const opts = parseCandidates(m.content)
              if (!opts) return null
              // 2026-08-08 候选例外（用户「输入内容也可以解除 pending——本来就是支持选或输入」）：
              // 候选之后出现用户消息（无论点选还是打字）= 用户已回应决策点 → 候选完成
              // 点选路径：chosen 标记已选；输入路径：replied 标记已回复（两条路径都解除 pending）
              const replied = messages.slice(i + 1).some((mm) => mm.role === 'user')
              const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']
              return (
                <div className="nf-candidates" role="group" aria-label="选择一项">
                  {opts.map((o, j) => {
                    const chosen = chosenCandidates[i] === j
                    const done = chosen || replied
                    return (
                      <button
                        key={j}
                        type="button"
                        disabled={done}
                        className={`nf-candidates__btn${done ? ' nf-candidates__btn--chosen' : ''}`}
                        onClick={() => {
                          // 2026-08-08 B 修复：点击后标记已选（决策点走完——按钮变已选态，不再可点）
                          setChosenCandidates((p) => ({ ...p, [i]: j }))
                          inputRef.current = o
                          void sendRef.current()
                        }}
                      >
                        <span className="nf-candidates__idx" aria-hidden="true">{chosen ? '✓' : replied ? '·' : (NUMS[j] ?? `${j + 1}.`)}</span>
                        <span>{chosen ? `${o}（已选）` : replied ? `${o}（已回复）` : o}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            {/* 2026-08-07 确认/拒绝卡片（用户决策——行业共识：显式结构化确认，替代确认词匹配；对话流内嵌——像授权卡）
                三卡：目标确认（【目标确认】提议 → 确认目标/重新描述）、执行确认（【执行方案】→ 确认执行/修改方案）、
                达成确认（【已达成】→ 已解决/还要改）——模型标记=提议，用户按钮=生效（不再自报即确认） */}
            {m.role === 'assistant' && m.status === 'done' && m.content && (() => {
              const goalMatch = m.content.match(/【目标确认[:：]\s*([^】]+)/)
              const hasPlan = m.content.includes('【执行方案')
              const achievedMatch = m.content.includes('【已达成')
              // 2026-08-07 目标确认兜底（死锁修复延续——模型无【目标确认】标记时用户仍可确认）：
              // 卡不依赖标记——目标未确认时「最后一条 assistant done」消息下也显示（显示 initialPrompt 暂存目标——
              // 结构化按钮替代原确认词兜底；对齐行业：确认=显式动作，不依赖模型标记）
              // 2026-08-14 S2b（缝隙 1/5）：确认卡挂在「最后一条 assistant 消息」上——用户消息（确认词 send）插入后
              // 卡仍在模型消息位置显示，不必等模型下一条回复（旧实现 isLastAssistant 依赖 working 悬挂使 send 排队——缺陷耦合）
              const isLastAssistant = m.role === 'assistant' && m === [...messages].reverse().find((x) => x.role === 'assistant')
              // 2026-08-08 候选与确认卡互斥修复（用户「需求澄清选项卡和确认又一起出来了」——时间线 seq 5-6）：
              // 消息含 <candidates>（候选=澄清决策点，等用户选方向）时不显示兜底确认卡——一个决策点走完再进下一个
              // （此前 goalFallback「目标未确认+最后一条 done」导致候选与兜底确认卡同时显示）
              const hasCandidates = m.content.includes('<candidates>')
              // 2026-08-14 用户实测修复（「重新描述后一直弹确认」——timeline a44cce80）：goalFallback 无条件兜底过宽——
              // 模型在澄清提问（「敌人什么样？一关还是波次？」）时每条消息都弹确认卡 → 用户被卡轰炸 → 点「重新描述」
              // → 模型重新问 → 又弹 → 循环。收窄：只在模型**征询确认/总结目标**时弹；问句澄清期不弹（决策点互斥——
              // 候选块/开放问题都是澄清决策点，确认卡不插队）
              // 2026-08-15 D6：词表收敛——askingConfirm/goalStated 内联正则上移领域层（agentLoop.goalFallbackTrigger）——词表单源
              // 征询确认（含问句形式「行不行？」）→ 直接弹——确认征询就是要用户决策；目标总结陈述需非问句
              // （「你的需求是 X，你想做成什么样？」目标+后续提问 = 澄清中，不弹）
              const goalFallback = !goalConfirmed && isLastAssistant && !hasCandidates && goalFallbackTrigger(m.content)
              // 2026-08-14 S2b（缝隙 4/5）：触发统一走状态机派生 pendingCardToShow（渲染与 maybeContinue 停模型同源）——
              // 「等确认」语义命中即弹 + 停；探索期（只读 bash/无等确认语义）不弹（冒烟实证：探索期弹卡 → 模型困惑）
              const sideEffectAttempted = (m.toolCalls ?? []).some((c) => classifyAction(c.name, String(c.args?.command ?? '')) === 'side-effect')
              const execFallback = pendingCardToShow(!!goalConfirmed, !!executionConfirmed, false, m.content, sideEffectAttempted) === 'execution'
              // 2026-08-14 用户实测卡死修复（timeline 0219a516）：模型连发消息时确认卡漂移消失——
              // write 被拦（exec-confirm 卡弹出）→ 模型继续输出 approve-files/说明消息 → isLastAssistant 漂移 → 卡消失
              // → 模型等确认、用户找不到卡 → 死锁。**信号消息（方案标记/副作用工具卡）的卡不依赖 isLastAssistant**——
              // 卡固定挂在信号消息上直到确认；多信号消息只显示「最后一条信号消息」（卡唯一——索引由
              // useMemo lastSignalIdx O(n) 预计算，此处 O(1) 比较）；兜底卡（无信号）仍限最后一条
              const execSignal = hasPlan || sideEffectAttempted
              if (!goalMatch && !hasPlan && !achievedMatch && !goalFallback && !execFallback && !sideEffectAttempted) return null
              return (
                <>
                  {((goalMatch && !goalConfirmed && i === lastSignalIdx.goal) || (lastSignalIdx.goal === -1 && goalFallback)) && i !== rejectedCardIdx.goal ? (
                    <div className="nf-confirmcard" role="group" aria-label="确认目标">
                      <div className="nf-confirmcard__head">目标确认——需要你确认</div>
                      <div className="nf-confirmcard__goal">{goalMatch ? goalMatch[1].trim() : (initialPrompt || '你描述的目标')}</div>
                      <div className="nf-confirmcard__actions">
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--ok" onClick={() => { confirm('goal'); tlog('card.resolved', { card: 'goal', action: 'confirm' }, 'system'); onGoalConfirmed?.(goalMatch ? goalMatch[1].trim() : (initialPrompt || '目标已确认')); inputRef.current = '确认，目标清楚了'; void sendRef.current() }}>确认目标</button>
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--no" onClick={() => { reject('goal'); tlog('card.rejected', { card: 'goal', action: 'reject' }, 'system'); setRejectedCardIdx((p) => ({ ...p, goal: i })); onGoalRejected?.(); inputRef.current = '目标需要重新描述一下'; void sendRef.current() }}>重新描述</button>
                      </div>
                    </div>
                  ) : null}
                  {!!goalConfirmed && !executionConfirmed && ((execSignal && i === lastSignalIdx.exec) || (lastSignalIdx.exec === -1 && isLastAssistant && !hasCandidates && execFallback)) && i !== rejectedCardIdx.execution ? (
                    <div className="nf-confirmcard" role="group" aria-label="确认执行方案">
                      <div className="nf-confirmcard__head">执行方案——需要你确认后动手</div>
                      <div className="nf-confirmcard__actions">
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--ok" onClick={() => { confirm('execution'); tlog('card.resolved', { card: 'execution', action: 'confirm' }, 'system'); onExecutionConfirmed?.(); inputRef.current = '确认，按方案执行'; void sendRef.current() }}>确认执行</button>
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--no" onClick={() => { reject('execution'); tlog('card.rejected', { card: 'execution', action: 'reject' }, 'system'); setRejectedCardIdx((p) => ({ ...p, execution: i })); onExecutionRejected?.(); inputRef.current = '方案需要调整一下'; void sendRef.current() }}>修改方案</button>
                      </div>
                    </div>
                  ) : null}
                  {achievedMatch && stateRef.current.producedFiles.size > 0 && !stateRef.current.achievementConfirmed && i === lastSignalIdx.achieve && i !== rejectedCardIdx.achievement ? (
                    <div className="nf-confirmcard" role="group" aria-label="确认达成">
                      <div className="nf-confirmcard__head">搭档已完成——你确认解决了没有</div>
                      <div className="nf-confirmcard__actions">
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--ok" onClick={() => { confirm('achievement'); tlog('card.resolved', { card: 'achievement', action: 'confirm' }, 'system'); inputRef.current = '已解决，谢谢'; void sendRef.current() }}>已解决</button>
                        <button type="button" className="nf-confirmcard__btn nf-confirmcard__btn--no" onClick={() => { reject('achievement'); tlog('card.rejected', { card: 'achievement', action: 'reject' }, 'system'); setRejectedCardIdx((p) => ({ ...p, achievement: i })); inputRef.current = '还要改一些地方：'; void sendRef.current() }}>还要改</button>
                      </div>
                    </div>
                  ) : null}
                </>
              )
            })()}
            {m.role === 'user' && <span className="nf-msg__sent"><IconCheck size={11} /> 已发送</span>}
            {m.reasoning && m.role === 'assistant' && m.status === 'done' && (
              // 2026-08-03 v33：标签「推理」→「思考过程」（非技术语言）+ 内容 Markdown 清洗 + .nf-reasoning 约束（160px 滚动——修长文本撑开）
              <details className="nf-msg__reasoning">
                <summary><IconBrain size={12} /> 思考过程</summary>
                <p className="nf-reasoning">{stripMarkdown(m.reasoning)}</p>
              </details>
            )}
            {/* 2026-08-08 O2：全 hidden（如 check-capability 能力齐备）→ 不渲染空容器；map 保留原始索引（key/revert 定位一致——hidden 卡返回 null） */}
            {m.toolCalls && m.toolCalls.some((c) => !c.hidden) && (
              <div className="nf-toolcalls">
                {/* 2026-08-04 授权架构 v4：批量授权条——一条消息多个待授权文件（fix bug 场景）→ 一次批准整批 + 记住 */}
                {m.toolCalls.filter((c) => c.status === 'need-approval').length > 1 && (
                  <div className="nf-toolcall__batch">
                    <span>有 {m.toolCalls.filter((c) => c.status === 'need-approval').length} 个文件待批准</span>
                    <button type="button" className="nf-toolcall__batch-approve" onClick={() => approveAllRemember(m.toolCalls ?? [])}>
                      全部允许并记住（本次任务）
                    </button>
                  </div>
                )}
                {m.toolCalls.map((tc, i) => {
                  // 2026-08-08 O2：check-capability 能力齐备 → hidden（不展示；保持原始索引——revert/patch 定位用 i）
                  if (tc.hidden) return null
                  // ticket 14：授权卡风险明示——等级 + 影响（写哪个文件/执行什么命令）+ 快照提示
                  const hint = buildAuthHint(tc.name, tc.args)
                  return (
                  <div key={tc.id ?? i} className={`nf-toolcall nf-toolcall--${tc.status}`}>
                    <span className="nf-toolcall__icon">
                      {tc.status === 'done' ? <IconCheck size={11} /> : tc.status === 'need-approval' || tc.status === 'file-approval' ? <IconLock size={11} /> : tc.status === 'reverted' ? <IconRotateCcw size={11} /> : tc.status === 'error' ? <IconX size={11} /> : <IconClock size={11} />}
                    </span>
                    <span className="nf-toolcall__name"><ToolIcon name={tc.name} size={12} /> {tc.name}</span>
                    <span className="nf-toolcall__args">{fmtToolArgs(tc)}</span>
                    {tc.result && <span className="nf-toolcall__result">{tc.result}</span>}
                    {/* 2026-08-05 体验反馈：详细输出折叠（默认不展示代码——需要时展开查看） */}
                    {tc.status === 'done' && tc.rawResult && (
                      <details className="nf-toolcall__detail">
                        <summary>查看详情</summary>
                        <pre className="nf-toolcall__detail-pre">{tc.rawResult.slice(0, 1500)}</pre>
                      </details>
                    )}
                    {tc.status === 'done' && tc.canRevert && (
                      <button
                        type="button"
                        className="nf-toolcall__revert"
                        onClick={() => revertToolCall(m.toolCalls ?? [], i, tc)}
                      >
                        <IconRotateCcw size={12} /> 回滚
                      </button>
                    )}
                    {/* 2026-08-04 规划级授权（用户「一次性要授权」）：计划文件清单卡——模型动手前列出全部文件 → 一次批准整批（后续 write/edit 自动放行） */}
                    {/* 2026-08-14 用户实测：授权卡与确认卡互斥——目标未确认时不渲染（副作用工具已被 canExecute 拦截不执行；渲染保险防残留） */}
                    {goalConfirmed && tc.status === 'file-approval' && (
                      <>
                        <span className="nf-toolcall__approve-hint">本次任务计划修改 {((tc.args.files ?? []) as unknown[]).length} 个文件——批准后自动放行，不再逐个问</span>
                        {typeof tc.args.summary === 'string' && <span className="nf-toolcall__note">{tc.args.summary}</span>}
                        <div className="nf-plan__files">
                          {((tc.args.files ?? []) as Array<{ path?: string; reason?: string }>).map((f, fi) => (
                            <div key={fi} className="nf-plan__file">
                              <span className="nf-plan__path">{f.path ?? ''}</span>
                              <span className="nf-plan__reason">{f.reason ?? ''}</span>
                            </div>
                          ))}
                        </div>
                        <div className="nf-toolcall__actions">
                          <button type="button" className="nf-toolcall__approve" onClick={() => approvePlan(m.toolCalls ?? [], i, tc)}>
                            批准这批文件
                          </button>
                          <button type="button" className="nf-toolcall__reject" onClick={() => rejectToolCall(m.toolCalls ?? [], i)}>
                            拒绝
                          </button>
                        </div>
                      </>
                    )}
                    {goalConfirmed && tc.status === 'need-approval' && (
                      <>
                        {/* 2026-08-04 体验修复：醒目标题——用户不知道「先写文件」后要批准（等授权无提示的根因） */}
                        <span className="nf-toolcall__approve-hint">需要你批准——点「允许执行」继续</span>
                        <span className="nf-toolcall__hint">{hint.level}</span>
                        {hint.impact && <span className="nf-toolcall__impact">→ {hint.impact}</span>}
                        {hint.note && <span className="nf-toolcall__note">{hint.note}</span>}
                        {/* 2026-08-04 授权架构重构（用户授权疲劳→机械批准）：授权卡展示改动内容——用户看清再批（恢复授权意义） */}
                        {tc.name === 'write' && typeof tc.args.content === 'string' && (
                          <pre className="nf-toolcall__preview" dir="ltr">将写入：{String(tc.args.path ?? '')}\n{tc.args.content.slice(0, 300)}{tc.args.content.length > 300 ? '…' : ''}</pre>
                        )}
                        {tc.name === 'edit' && (
                          <pre className="nf-toolcall__preview" dir="ltr">将修改 {String(tc.args.filePath ?? '')}：\n- {String(tc.args.oldText ?? '').slice(0, 120)}\n+ {String(tc.args.newText ?? '').slice(0, 120)}</pre>
                        )}
                        <div className="nf-toolcall__actions">
                          <button
                            type="button"
                            className="nf-toolcall__approve"
                            onClick={() => approveToolCall(m.toolCalls ?? [], i, tc)}
                          >
                            允许执行
                          </button>
                          {/* 2026-08-04 授权架构 v4：允许并记住（本次任务内此文件自动）——授权疲劳核心解法
                              // 2026-08-06 安全漏洞（用户反馈「启动服务没弹授权卡」）：bash 点允许并记住 → trustPath('')=rootPath → 后续所有 bash 绕过授权！
                              // bash 高危永远单独确认（授权原则）——不显示「允许并记住」 */}
                          {tc.name !== 'bash' && (
                            <button
                              type="button"
                              className="nf-toolcall__remember"
                              onClick={() => rememberAndApprove(m.toolCalls ?? [], i, tc)}
                            >
                              允许并记住
                            </button>
                          )}
                          <button
                            type="button"
                            className="nf-toolcall__reject"
                            onClick={() => rejectToolCall(m.toolCalls ?? [], i)}
                          >
                            拒绝
                          </button>
                        </div>
                      </>
                    )}
                    {tc.status === 'pending' && (
                      <button type="button" className="nf-toolcall__stop" onClick={() => stopToolCall(m.toolCalls ?? [], i)}>
                        <IconSquare size={12} /> 停止
                      </button>
                    )}
                  </div>
                  )
                })}
                {/* ticket 14 疲劳防护：同批 ≥2 低危文件操作待授权 → 合并授权（bash 高危永不合并——canMergeApprove 已保证） */}
                {canMergeApprove((m.toolCalls ?? []).filter((c) => c.status === 'need-approval')) && (
                  <button type="button" className="nf-toolcall__approveall" onClick={() => approveAllToolCalls(m.toolCalls ?? [])}>
                    允许全部（本次待授权文件操作）
                  </button>
                )}
              </div>
            )}
            {/* 2026-08-05 体验反馈：working「搭档处理中」跟随最新一条消息（工具卡/回复旁）——不再独立渲染在列表末尾 */}
            {working && i === messages.length - 1 && (
              <div className="nf-working">
                <IconDot size={12} className="nf-working__dot" />
                <span>搭档处理中：{workingStage}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 2026-08-04 授权架构 v4：授权记录条——固定在输入框上方（用户随时可见/清除；原在消息列表顶部——会话长滚出视野看不到） */}
      {taskTrust.length > 0 && (
        <div className="nf-trustbar">
          <IconShield size={12} />
          <span>本次任务已记住：{taskTrust.map((p) => p.split('/').pop()).join('、')}</span>
          <button type="button" className="nf-trustbar__clear" onClick={clearTrust}>清除</button>
        </div>
      )}
      <div className="nf-chat__input">
        <textarea
          ref={textareaRef}
          value={input}
          placeholder="输入想法…（Enter 发送 · Shift+Enter 换行）"
          aria-label="给搭档的消息"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={mentionOpen}
          aria-controls="nf-mention-list"
          aria-autocomplete="list"
          rows={2}
          onChange={(e) => {
            inputRef.current = e.target.value
            setInput(e.target.value)
            const v = e.target.value
            if (v.includes('@') && demoFiles.length > 0) { setRecentFiles(demoFiles); setMentionOpen(true) }
            else if (!v.includes('@')) { setMentionOpen(false) }
          }}
          onKeyDown={(e) => {
            // 输入法组合中（拼音/候选确认的回车 isComposing=true）——不拦截，交给输入法
            if (e.nativeEvent.isComposing) return
            // 08 快捷键（D0 §6）：Cmd/Ctrl+E = @引用当前选中文件（插入 @文件名 到输入框——发送时 ContextEngine 注入）
            if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (currentFile) {
                const name = currentFile.split('/').pop() ?? currentFile
                inputRef.current = inputRef.current + `@${name} `
                setInput(inputRef.current)
                if (inputRef.current.includes('@') && demoFiles.length > 0) { setRecentFiles(demoFiles); setMentionOpen(true) }
              }
              return
            }
            // 2026-08-04 审计修复（A2）：浮层打开时——方向键移动高亮 / Esc 关闭 / Enter 选择
            if (mentionOpen) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const len = recentFiles.length
                if (len === 0) return
                setMentionActive((cur) => {
                  if (cur === -1) return e.key === 'ArrowDown' ? 0 : len - 1
                  return e.key === 'ArrowDown' ? (cur + 1) % len : (cur - 1 + len) % len
                })
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMentionOpen(false)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && mentionActive >= 0) {
                e.preventDefault()
                pickMention(mentionActive)
                return
              }
            }
            // 2026-08-03 A6 审计修复：Enter=发送（非技术用户直觉——V1 主受众）；Shift+Enter=换行；⌘/Ctrl+Enter 也发送（兼容旧习惯）
            // 注意：⌘+Enter 也命中 Enter 分支（metaKey 不排除）——发送；Shift+Enter 不拦截——textarea 默认换行
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
        />
        {/* 2026-08-03 v34：@引用浮层移到 textarea 之后（Tab 顺序 textarea→option→发送——修复键盘不可达；absolute 定位在输入框上方） */}
        {mentionOpen && (
          <div id="nf-mention-list" className="nf-mention" role="listbox" aria-label="引用文件">
            <span className="nf-mention__title">引用文件</span>
            {recentFiles.map((f, i) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={i === mentionActive}
                className={`nf-mention__item${i === mentionActive ? ' nf-mention__item--active' : ''}`}
                onClick={() => pickMention(i)}
              >
                <IconFile size={12} /> {f}
              </button>
            ))}
          </div>
        )}
        {/* 2026-08-05 用户反馈 4：停止按钮（working 时显示）——打断当前流/杀 bash；反馈 3：处理中发送 = 打断+新指令（按钮不禁用） */}
        {working && (
          <button type="button" className="nf-chat__stop" onClick={() => void stopGeneration()} aria-label="停止搭档当前工作">
            ⏹ 停止
          </button>
        )}
        <button type="button" className="nf-config__cta" onClick={() => void send()} disabled={!input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
