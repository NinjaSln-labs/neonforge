import { useEffect, useMemo, useRef, useState } from 'react'
import DigitalDeliveryPanel from './DigitalDeliveryPanel'
import TrustLadderPanel from './TrustLadderPanel'
import DoDAlignPanel from './DoDAlignPanel'
import type { DeliveryPackage } from './types'
import { loadSession, saveSession, serializeMessages } from './sessionStore'
// ticket 14 信任阶梯：授权执行模型（等级/影响/合并判定——L4 委托 + 疲劳防护）
import { buildAuthHint, canMergeApprove } from './authModel'
// 2026-08-03 v33：思考过程内容清洗（reasoning 含 Markdown 标记 → 展示为可读纯文字）
// 2026-08-04：cleanContent 回复正文展示清洗（字面转义/连续换行杂音）
import { cleanContent, stripMarkdown } from './textClean'
// P1-05 阶段 1：纯格式化/展示辅助（工具卡文案、假设列表、协议信号、行动承诺判定）
import {
  fmtToolArgs,
  fmtToolResult,
  hasProtoCall,
} from './conversationFormat'
import { GoalConfirmCard, PlanConfirmCard, ResolutionConfirmCard } from './DecisionCards'
import { ConversationComposer } from './ConversationComposer'
import { buildHistory } from './conversationHistory'
import { createApplyChunk } from './useChatStream'
// 2026-08-06 DDD 落地（progress-aware 卡住检测——领域层纯逻辑，双源调研驱动）
import {
  evaluateTurnProgress,
  initialStuckState,
  isConfirmIntent,
  // V1.5-S4 退役——goalFallbackTrigger 仅剩兜底探测（text_fallback 路径），见 ADR-009
  goalFallbackTrigger,
} from '../domain/agentLoop'
// 2026-08-14 会话状态机（Task 聚合——A0 §2/§3/§4/§5）：状态单一来源 + 转换唯一入口（session-state-machine.md S2）
import {
  isSideEffectAction,
  detectUnproductiveDialogue,
  noteUserTextReply,
  decideProgressGuarantee,
  isConsumedProposal,
  pendingCardToShow,
  shouldStopContinuation,
  verifyCompletion,
  buildEvidenceBackfill,
  evidenceGuideMaxAttempts,
  deriveDiffs,
  type SystemVerifier,
  type GoalProposal,
  type PlanProposal,
  type CompletionClaim,
} from '../domain/conversationState'
// S2 提议解析/历史构建已随 P1-05 阶段 4b 迁入 useChatStream.ts / conversationHistory.ts
import { resolveSandboxPath } from '../domain/sandboxPath'
// 2026-08-15 Q1a+Q2：状态机转换单点封装（写路径唯一入口）
import { useConversationState } from './useConversationState'
// 2026-08-15 Q1b：工具授权 handler 封装（组件瘦身）
import { useToolApproval } from './useToolApproval'
// S5：turnPolicy.ts 已移除（decideTurnPolicy 语义并入 decideProgressGuarantee——§6 S5 唯一推进判定器）
// 2026-08-07 无阶段重构 S4：buildAdvanceInstruction/stageFlow import 删除（advanceChat 随阶段体系移除）
// 2026-08-05 方案 3：结构化候选按钮——<candidates> 块解析/剥离（点选文本替代序号，消除模型序号解析漂移）
import { parseCandidates, stripCandidates, stripTags } from './candidates'
// A-019（S4-St-1）：候选按钮共享组件——candidates 降级通道 + ask_user 选项按钮单源
import { CandidateButtons, type CandidateOption } from './CandidateButtons'
// 2026-08-03 视觉审计 P1-6：内联 SVG 图标（替换 emoji 图标）
import {
  IconBrain,
  IconCheck,
  IconClock,
  IconDot,
  IconLock,
  IconRotateCcw,
  IconShield,
  IconSquare,
  IconX,
  ToolIcon,
} from './icons'
// 2026-08-04 启动页方案 A：场景卡数据共享（启动页 + 对话空态共用）
import { SCENES } from './scenes'
// 2026-08-07 T1（regex-todo）：聊天错误分类纯函数——原 includes('5') 过宽（token-limit-50/5000/x5x 误归 service）；
// 根因补强：ipc 已返回结构化 errorType（gateway 源头分类）——classifyChatError 降级为兜底（字面量/未知格式）
import { classifyChatError, type ChatErrorType } from './errorClassify'
import { isSystemNudgeText, systemNudgeKind } from './systemNudge'
// 2026-08-15 Q6：系统提示词外置（原内嵌 sysHint 模板）
import { buildSysHint } from './sysPrompt'
// 2026-08-15 Q10：demo 注入通道类型化单例
import { getDemoBridge } from './demoBridge'
// 2026-08-15 DDD 重建：事件注册表 dev 校验
import {
  validateTimelineEvent,
  TIMELINE_EVENT_SPECS,
  dedupeKey,
} from '../domain/timeline'
// V1.5 S1 Task 1.3：协议工具接线（ADR-009 拦截点——模型主动产出决策内容的通道；
// 判定器纯函数 domain 单源——renderer 只做信号翻译 + setPendingState 承载）
import { PROTOCOL_TOOL_NAMES } from '../domain/protocolTools'

// ticket 04：对话最小闭环（D0 §2/§3.4）——输入发送 → Gateway 流式 → 消息/呼吸光条/推理展示
// 消费 02：streamChat（四档 basic）+ ModelRouter（默认 Flash）；错误分支：Key 失效内嵌更新 / 服务故障提示

export interface ToolCallMsg {
  id?: string // 2026-08-15 P2：稳定 id（会话内递增——同 args 卡并存的精确定位键；旧存档无 id → 渲染/定位 fallback）
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'done' | 'need-approval' | 'file-approval' | 'error' | 'reverted'
  result?: string
  rawResult?: string // 2026-08-05：API 回填用完整结果（UI 展示用 result 摘要）——read 完整内容防模型反复读同文件
  file?: string // write/edit 成功写入的文件路径（回滚目标）
  canRevert?: boolean // 写前已快照——可回滚
  hidden?: boolean // 2026-08-08 O2：UI 隐藏（如 check-capability 能力齐备时默认不展示——结果仍回填模型上下文）
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

// P1-05 阶段 1：工具格式化/关键假设/协议信号/行动承诺判定已提取到 conversationFormat.tsx




export default function ConversationPanel({
  rootPath,
  currentFile,
  onKeyExpired,
  onReasoning,
  onWorkingChange,
  onApprovalChange,
  onApprovalResolved,
  onActionPromiseHint,
  externalRequest,
  onExternalConsumed,
  onToolResult,
  onUserMessage,
  onGoalConfirmed,
  onPlanConfirmed,
  onGoalRejected,
  onPlanRejected,
  goalConfirmed,
  planConfirmed,
  goalSeq,
  recentFilesExternal,
  activeAuthorizedLogs,
  initialPrompt,
  onSessionStart,
  sessionId: sessionIdProp,
}: {
  rootPath?: string | null
  sessionId?: string // P1 修复：会话 ID 由 MainWorkspace 持有——Tab 切换/重挂载不得生成新会话
  currentFile?: string | null // 08 快捷键 Cmd+E：当前选中文件（@引用——D0 §6）
  onKeyExpired: () => void
  onReasoning?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
  onApprovalChange?: (pending: boolean) => void // 2026-08-04 审计修复（D2）：有待批准工具操作时上报（状态栏提示——键盘用户感知）
  onApprovalResolved?: (result: 'approved' | 'rejected') => void // P1：授权结果（队列恢复依据）
  onActionPromiseHint?: (hint: string | null) => void // 2026-08-05 用户反馈 2：isActionPromise 提示不插入对话流（污染阅读）——状态栏非侵入提示
  externalRequest?: string | null
  onExternalConsumed?: () => void
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  onUserMessage?: (text: string) => void
  // 2026-08-04：目标确认回写——模型输出【目标确认：xxx】→ 上报 MainWorkspace（更新台账标题/快照 + 项目 README）
  // 2026-08-07 无阶段重构 S4：onRequirementConfirmed → onGoalConfirmed / requirementConfirmed → goalConfirmed + planConfirmed
  onGoalConfirmed?: (title: string) => void
  onPlanConfirmed?: () => void // 2026-08-07 执行确认卡【确认执行】→ MainWorkspace setExecutionConfirmed（结构化确认——替代确认词）
  // 2026-08-15 D1：拒绝路径对称回调（MainWorkspace 渲染镜像回退——修复「拒绝被 effect 反转」双权威缺陷）
  onGoalRejected?: () => void
  onPlanRejected?: () => void
  goalConfirmed?: boolean // 2026-08-06 需求阶段门控（无阶段重构 S4：目标确认）：用户确认（MainWorkspace state）→ 渲染镜像（状态机权威在 stateRef）
  planConfirmed?: boolean // 2026-08-07 无阶段重构 S4：执行确认（ExecutionConfirmCard——目标确认后用户确认执行方案）
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
  // P1 修复：优先使用 MainWorkspace 传入的稳定会话 ID；仅独立测试/旧调用方回退到自生成
  const [generatedSessionId] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  )
  const sessionId = sessionIdProp ?? generatedSessionId
  const [messages, setMessages] = useState<Msg[]>([])
  const messagesRef = useRef<Msg[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
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
    const hasApproval =
      messages.some((m) =>
        m.toolCalls?.some((c) => c.status === 'need-approval' || c.status === 'file-approval'),
      ) ?? false
    if (hasApproval && stateRef.current.pending === 'none') {
      setPendingState('approval')
    } else if (!hasApproval && stateRef.current.pending === 'approval') {
      clearPending()
    }
    onApprovalChange?.(hasApproval)
  }, [messages, onApprovalChange])
  // 断点续做（ticket 06/基线 §21）：挂载恢复上次会话（onNew 已 clearSession → 空）
  // S3（§8.2 E C5）：恢复后 pending 冻结立即生效——决策点内容快照（decisionContent）随消息恢复，
  // 卡重显旧内容（用户确认/修改后才更新——模型首轮只能响应用户对已有决策点的决策）
  useEffect(() => {
    const stored = loadSession()
    if (stored && stored.length > 0) {
      setMessages(
        stored.map((s) => ({
          id: s.id ?? nextMsgId(),
          role: s.role,
          content: s.content,
          reasoning: s.reasoning,
          status: 'done' as const,
          toolCalls: s.toolCalls,
        })),
      )
      // 恢复决策点冻结：最新消息携带 decisionContent → 恢复 pending（goal/plan/resolution——卡重显）
      for (let i = stored.length - 1; i >= 0; i--) {
        const dc = stored[i].decisionContent
        if (dc) {
          setPendingState(dc.kind, {
            since: dc.since,
            ...(dc.proposal ? { proposal: dc.proposal } : {}),
          })
          break
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 断点续做：完整消息变化 → 持久化（过滤半截 streaming——streaming 时 serialize 为空不覆盖存档）
  // S3（§8.2 E）：决策点内容快照随最近 assistant 消息持久化（恢复后卡内容不丢——pending 冻结语义）
  const chatRef = useRef<{
    msgs: Array<{
      role: string
      content: string | null
      tool_calls?: unknown[]
      tool_call_id?: string
      reasoning_content?: string
    }>
    depth: number
  } | null>(null)
  const sessionRef = useRef(0) // 会话隔离：每次发送递增——旧会话事件/续聊失效
  const streamingSidRef = useRef(0) // 2026-08-04：当前活跃流 sid——停止（sid++）后旧流 chunk 忽略（applyChunk 只处理活跃流）
  // V1.5 S2 A-017：同轮并存挂起标记——本轮流中出现协议工具后，同轮后续普通工具一律挂起
  // （Spike-4 实证「同响应混合协议+普通工具」：协议工具置 pending 等用户决策 → 普通工具无意义
  // ——挂起不执行，结果引导模型等确认后重试；deriveDecisionPoint 单决策点互斥语义的流式承载）
  const suspendRoundRef = useRef(false)
  // V1.5 S3：文本标记降级引导计数——每会话最多 3 次自动引导（模型连续输出标记不改用工具则停，
  // 防 silent 续聊空转；超过转用户可见提示——等用户输入/手动处理）
  const textFallbackCountRef = useRef(0)
  const applyChunkRef = useRef<
    | ((c: {
        type: string
        text?: string
        toolCall?: { name: string; args: Record<string, unknown> }
      }) => void)
    | null
  >(null)
  useEffect(() => {
    applyChunkRef.current = applyChunk
  }) // 每次渲染同步最新 applyChunk
  // 2026-08-08 会话日志：挂载（进入对话）→ 会话 ID 上报 MainWorkspace（其 timeline 事件归属本会话）
  useEffect(() => {
    onSessionStart?.(sessionId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 2026-08-15 补齐：会话创建事件（06 §1.6 conversation.created——会话文件创建点可观测）
  useEffect(() => {
    tlog('conversation.created', { session: sessionId }, 'system')
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // A-005 平衡：rejectedCardIdx 仅用于**无快照的 execSignal 兜底卡**（write 拦截场景——无结构化方案，
  // 拒绝后模型重提议前该消息信号仍在）；结构化方案卡（dcKind 快照）拒绝后由领域状态自然消失（不依赖索引）
  const [rejectedCardIdx, setRejectedCardIdx] = useState<{
    goal?: number
    execution?: number
    achievement?: number
  }>({})
  // ticket 14 L4 委托：低危文件操作（write/edit）自动授权免确认（可随时撤销——localStorage 持久化；bash 高危永不委托）
  const [delegateLowRisk, setDelegateLowRisk] = useState(() => {
    try {
      return localStorage.getItem('nf-delegate-lowrisk') === '1'
    } catch {
      return false
    }
  })
  const handleDelegateChange = (v: boolean) => {
    setDelegateLowRisk(v)
    try {
      localStorage.setItem('nf-delegate-lowrisk', v ? '1' : '0')
    } catch {
      /* 存储不可用——内存态仍工作 */
    }
  }
  // 2026-08-04：设置面板 L4 委托开关 → 对话授权实时联动（同 localStorage key + 自定义事件）
  useEffect(() => {
    const onDelegateChanged = () => {
      try {
        setDelegateLowRisk(localStorage.getItem('nf-delegate-lowrisk') === '1')
      } catch {
        /* 读不到保持现状 */
      }
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
  const sendRef = useRef<(opts?: { silent?: boolean; text?: string }) => Promise<void>>(
    async () => {},
  )
  // 2026-08-06 DDD 落地（progress-aware 卡住检测——领域层状态）：连续无进展计数 + 升级次数（不可变 StuckState）+ 已读文件集合
  const stuckStateRef = useRef(initialStuckState)
  // research→propose：分析期连续纯 web 轮 streak（与 StuckDetector 分立；确认后清零）
  const webOnlyStreakRef = useRef(0)
  const researchProposeNudgedRef = useRef(false)
  const planWasRejectedRef = useRef(false)
  const planRejectNudgedRef = useRef(false)
  const prevReadFilesRef = useRef<Set<string>>(new Set())
  // S5：toolsAvailable 能力快照（require-advance 前提——工具不可用时逼「推进」不逼调工具；
  // 由 check-capability 结果更新；无检测记录默认 true——工具总是可用）
  const capReadyRef = useRef(true)
  // 2026-08-14 会话状态机（Task 聚合——S2 迁移）：原 7 个散 ref（plannedFiles/producedFiles/goalAchieved/
  // lastToolFailed/filesApproved/goalConfirmed/planConfirmed）合并为单一 ConversationState——
  // 读 = stateRef.current.x；写 = useConversationState 转换方法（Q1a+Q2——唯一入口）
  // 2026-08-15 DDD 重建：transition 内 diff 派生领域事件 → tlog 落盘（一处接入覆盖全部状态转换——
  // task.*/session.*/plan.* 事件自动发出；事件目录 domain/timeline.ts 对齐 06 文档）
  const {
    stateRef,
    version: stateVersion, // A-005：转换计数——读 ref 的渲染点依赖它触发重渲染（卡隐藏/内容切换）
    confirm,
    reject,
    grantPlan,
    rejectApproval,
    applyTool,
    setPending: setPendingState,
    clearPending,
    resetRejectStreak,
    setFilesApproved,
    restorePlanned,
  } = useConversationState({
    emit: (type, detail) => tlog(type, detail, 'system'),
    // BC-14：方案确认 → 验收标准从 verificationPlan 派生（权威记录在 main；无来源记录为空）
    onPlanConfirmed: (plan) => {
      void window.neonforge.acceptance?.derive(
        sessionId,
        plan.verificationPlan ?? [],
        'plan-verification',
      )
    },
    onTaskBoundary: () => {
      void window.neonforge.acceptance?.clear(sessionId)
      void window.neonforge.changeset?.clear(sessionId)
    },
  })
  // D3（ADR-005）：启动恢复——main plannedFilesStore 权威（批准事实跨重启）→ 本地镜像
  // 恢复后模型继续写清单内文件不需重新批量授权（与问题台账 authorized 恢复同构）
  useEffect(() => {
    let cancelled = false
    window.neonforge.plannedFiles
      ?.load()
      .then((d) => {
        if (!cancelled) restorePlanned(d.files, d.approved)
      })
      .catch(() => {
        /* 恢复失败——保持初始空镜像（镜像优先策略） */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 断点续做：完整消息变化 → 持久化（过滤半截 streaming——streaming 时 serialize 为空不覆盖存档）
  // S3（§8.2 E）：决策点内容快照随最近 assistant 消息持久化（恢复后卡内容不丢——pending 冻结语义）
  useEffect(() => {
    const dc = stateRef.current.decisionContent
    const withSnapshot = dc
      ? messages.map((m, i) =>
          i === messages.length - 1 && m.role === 'assistant' && m.status === 'done'
            ? { ...m, decisionContent: dc }
            : m,
        )
      : // A-009：决策点已清除（确认/拒绝后）→ 剥离历史消息上的过期快照（防恢复时命中旧卡）
        messages.map((m) => ({ ...m, decisionContent: undefined }))
    const serialized = serializeMessages(withSnapshot)
    if (serialized.length > 0) saveSession(serialized)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, stateRef.current.decisionContent, stateVersion])
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
      // V1.5 S2 A-017：信号消息定位识别协议工具（propose_goal/propose_plan/report_completion）——
      // 协议工具置 pending 后卡挂在该消息下（文本探测只认标记——协议路径消息无标记 → 卡不弹缺口）
      if (
        exec === -1 &&
        (x.content.includes('【执行方案') ||
          hasProtoCall(x, 'propose_plan') ||
          (x.toolCalls ?? []).some((c) =>
            isSideEffectAction(c.name, String(c.args?.command ?? '')),
          ))
      )
        exec = k
      if (goal === -1 && (/【目标确认[:：]/.test(x.content) || hasProtoCall(x, 'propose_goal')))
        goal = k
      if (
        achieve === -1 &&
        (x.content.includes('【已达成') || hasProtoCall(x, 'report_completion'))
      )
        achieve = k
      if (exec !== -1 && goal !== -1 && achieve !== -1) break
    }
    return { exec, goal, achieve }
  }, [messages])
  // 用户确认/拒绝（MainWorkspace state = 展示镜像——不再从 prop 同步状态机，防拒绝被反转；D1 2026-08-15）
  // 2026-08-14 审计发现：原 useEffect 只同步 true 方向——拒绝（userRejected 只改 stateRef）后 prop 仍 true
  // → effect 立即把回退反转回 true（「重新描述需点两次」根因）。现状态机唯一权威 = stateRef；
  // MainWorkspace 的 goalConfirmed/planConfirmed 仅作渲染镜像（由确认/拒绝回调显式设置，双向对称）。
  // 2026-08-07 会话时间线（Session Timeline BC——单会话所有步骤统一日志：用户/搭档/工具/授权/状态——分析一步到位）
  // 2026-08-15 A6：dedupe 事件去重集合（会话级——同 detail 签名只记一次）
  const timelineDedupeRef = useRef<Set<string>>(new Set())
  const tlog = (
    type: string,
    detail: Record<string, unknown>,
    role?: 'user' | 'assistant' | 'system' | 'tool',
  ) => {
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
  // 2026-08-08 卡弹出打点（用户「加一个确认/授权等卡弹出的点」）：确认卡（目标/执行/达成）+ 授权卡/approve-files 卡——卡从无到有打一次
  const cardShownRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const last = messages[messages.length - 1]
    const isLastAssistant = last?.role === 'assistant' && last.status === 'done'
    const show = (card: string, extra?: Record<string, unknown>) => {
      if (cardShownRef.current.has(card)) return
      cardShownRef.current.add(card)
      tlog('card.shown', { card, ...extra }, 'system')
    }
    if (isLastAssistant) {
      // #6 真机 2026-08-30（P1-3 修正）：原条件 `|| !goalConfirmed` 使目标未确认时**任何** assistant
      // 回合都打 card.shown goal-confirm（goalText=随手截断的正文）——遥测假象三例（空文本/旁白/恢复快照）
      // 全部源于此，排查时严重误导（真实弹卡唯一依据 = pending + decisionContent——2203 行）。
      // 修正：只在目标决策点真实存在时打点，goalText 取提议 statement
      const dc = stateRef.current.decisionContent
      const goalStatement =
        dc?.kind === 'goal' ? ((dc.proposal as { statement?: string })?.statement ?? '') : ''
      if (stateRef.current.pending === 'goal' && goalStatement)
        show('goal-confirm', { goalText: goalStatement.slice(0, 120) })
      // A-020 附带（P2-2 对齐）：原条件 `goalConfirmed && !planConfirmed` 使目标确认后**任何**
      // assistant 回合都打 card.shown exec-confirm（真机 seq54 实证——无卡也打点，排查误导）。
      // 对齐真实决策点（与 goal-confirm/resolution 同款）：只在 plan pending 真实存在时打点
      if (stateRef.current.pending === 'plan') show('exec-confirm')
      // #6 真机 2026-08-30（P2-2）：对齐真实决策点——原条件【已达成】+产物即打点，
      // S4 门控（verifyCompletion 不通过不弹卡）下产生假「已弹卡」遥测（真机排查误导）
      if (stateRef.current.pending === 'resolution') show('achieve-confirm')
    }
    // 授权卡 / approve-files 卡（工具卡 need-approval/plan-approval 状态）——每次弹卡独立记录（同工具不同 args 是新的授权决策）
    // #6 真机 2026-08-30（坑 107 双卡同弹复现）：goal/plan/resolution 决策点 pending 时延迟显示授权卡
    //（本 effect 依赖含 pending——决策点清掉后下一 tick 补显）；同一时刻只呈现一个决策——A0 §3.5b 门控顺序的 UI 面
    const decisionPending =
      stateRef.current.pending === 'goal' ||
      stateRef.current.pending === 'plan' ||
      stateRef.current.pending === 'resolution'
    for (const m of messages) {
      for (const c of m.toolCalls ?? []) {
        if (c.status === 'need-approval' || c.status === 'file-approval') {
          if (decisionPending) continue
          const key = `approval:${c.name}:${JSON.stringify(c.args ?? {}).slice(0, 60)}`
          show(key, {
            card: c.status === 'file-approval' ? 'file-approval' : 'approval',
            name: c.name,
            args: c.args,
          })
        }
      }
    }
  }, [
    messages,
    goalConfirmed,
    planConfirmed,
    stateVersion, // 审计修正 2026-08-31：stateRef 字段变化不触发 effect——决策点异步置位（verifyThenResolve）后靠 version 重渲染补打（原写 ref 字段进依赖形同虚设）
  ])
  // 2026-08-08 状态变化打点（working / approval-pending / ready——统一状态机；变化才记录）
  const lastStatusRef = useRef('')
  useEffect(() => {
    const status = working
      ? 'working'
      : stateRef.current.pending === 'approval'
        ? 'approval-pending'
        : 'ready'
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status
      tlog('conversation.status_change', { status })
    }
  }, [working, messages])
  // 2026-08-05：renderer 侧「已规划」标记 + 确认门控 ref 已并入状态机（stateRef——见上方 S2 迁移）；保留注释链：
  // filesApproved → stateRef.filesApproved；goal/execConfirmed → stateRef.goalConfirmed/planConfirmed；
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
  const lastGoalSeqRef = useRef(goalSeq ?? 0)
  useEffect(() => {
    const seq = goalSeq ?? 0
    // P1 修复：仅「goalseq 增加」才是新任务边界；组件重挂载（Tab 切换/会话恢复）不得清空任务信任与计划快照
    if (seq > lastGoalSeqRef.current) clearTrust()
    lastGoalSeqRef.current = seq
  }, [goalSeq])
  // 2026-08-07 无阶段重构修复（执行确认卡删除——dock 顶部全清，用户「最上面的那块都不需要了」）：
  // execConfirmedHandledRef 自动 silent 触发删除——执行确认现在靠用户打字确认词（「可以/确认」）作为普通用户消息
  // 发送（模型看到确认 + planConfirmed=true → forceTool 强制产出）——旧 effect 与用户消息双重发送冲突
  // （398 实测：「可以」消息 + silent「用户已确认执行」排队/打断——双触发）
  // P1-05 阶段 3：@引用浮层与输入区本地状态已移至 ConversationComposer

  // 处理单个流式事件（当前轮次——写入最后一条 assistant 消息）
  // 2026-08-04：流式累积（事件层）——React StrictMode 会双调 setMessages updater，副作用（日志/工具执行）放 updater 内会重复执行（实测对话日志每条记录两次）
  // 2026-08-15 Q3：reasoning 累积 + onReasoning/setWorkingStage 全部上移到事件层（原 updater 内调用外部回调——坑 32 违反残留）
  const streamingRef = useRef<{ content: string; reasoning: string; toolCalls: ToolCallMsg[] }>({
    content: '',
    reasoning: '',
    toolCalls: [],
  })
  // 2026-08-07 无阶段重构 S4：TurnKind/turnKindRef 删除（advanceChat 随阶段体系移除——无 advance-turn；send/maybeContinue 不再需要轮次类型标记）
  // S4 完成对账（不变量 4 接线）：已解决卡条件 = verifyCompletion(claim, systemState).ok
  // V1a 系统代跑（main IPC——mock/降级无则纯逻辑）+ V1b diff 派生（领域层单源）→ 判定：
  // ok → 置 resolution 决策点（弹已解决卡）；ok=false → evidence_missing 打点 + 回填引导（模型重新输出带证据声明）
  // ADR-004：领域层同步消费快照——IO（代跑）在应用层（此处 await 后快照进 verifyCompletion）
  // 引导护栏（S4 复审）：连续引导计数——≥2 次证据不足不再自动 send（防回填死循环——坑 103 同构：
  // 任何自动机制必须配套收敛判定；超限后停止自动引导，用户可见引导消息后手动处理）
  const evidenceGuideCountRef = useRef(0)
  // evidence_missing 后纯文本收尾 → 再催 report_completion（每会话最多 1 次；对齐 planReject nudge）
  const evidenceReportNudgedRef = useRef(false)
  // 计划确认后 service/network：整会话最多自动续跑 1 次（与「重试」按钮同路径）
  const autoRetriedServiceRef = useRef(false)
  // 排队衔接（输入≠打断）——提前声明：verifyThenResolve 对账引导在 working 时写入此 ref
  const pendingSendRef = useRef('')
  const verifyThenResolve = async (claim: CompletionClaim): Promise<void> => {
    const bridge = window.neonforge?.completion
    let systemState: SystemVerifier | undefined
    if (bridge?.verify) {
      try {
        const commands = claim.evidence.verification
          .filter((v) => v.passed !== false)
          .map((v) => v.command)
        const results = await bridge.verify(commands, rootPath ?? null)
        if (results) {
          systemState = {
            verificationResults: results,
            deriveDiffs,
            plannedFiles: stateRef.current.plannedFiles,
            producedFiles: stateRef.current.producedFiles,
          }
        }
      } catch {
        // 核验服务异常 → 降级纯逻辑判定（不阻断弹卡路径）
      }
    }
    const v = verifyCompletion(claim, systemState)
    if (v.ok) {
      evidenceGuideCountRef.current = 0 // 证据通过 → 计数重置
      // BC-14：只把「系统复核 ok:true」的命令证据绑定到验收项；自报通过但系统未核验的命令
      // 不得自动通过验收（未覆盖项保留 pending，由用户手工确认/豁免）
      const verifiedCommands = claim.evidence.verification
        .filter((item) => item.passed !== false)
        .map((item) => item.command)
        .filter((cmd) => systemState?.verificationResults[cmd]?.ok === true)
      if (verifiedCommands.length > 0) {
        void window.neonforge.acceptance?.applyEvidence(sessionId, verifiedCommands)
      }
      // 核验期间可能已有其它决策点置位（竞态防护——pending 非 none 不覆盖）。
      // A-022（S5 真机 2026-09-06）：直接丢弃 = resolution 不可达死锁（真机实证：核验通过瞬间
      // 残留授权卡 pending 占用 → return → 之后再无重试，forceTool 循环不止）。修正：等 pending
      // 清空后置位（上限 20s——超时放弃走 A-015 用户侧提示路径），不覆盖其它决策点语义不变
      for (let i = 0; i < 40 && stateRef.current.pending !== 'none'; i++) {
        await new Promise((r) => setTimeout(r, 500))
      }
      if (stateRef.current.pending !== 'none') return
      setPendingState('resolution', { proposal: claim, since: new Date().toISOString() })
    } else {
      // 证据不足 → 不弹卡（不产生决策点）+ evidence_missing 打点 + 回填引导（模型重新输出带证据声明）
      tlog(
        'completion.evidence_missing',
        { ok: false, missing: v.missing, unverifiable: v.unverifiable },
        'system',
      )
      const guide = buildEvidenceBackfill(v)
      evidenceGuideCountRef.current++
      const maxGuides = evidenceGuideMaxAttempts(v)
      if (guide && evidenceGuideCountRef.current <= maxGuides) {
        // 对账引导：不经用户通道（isSystemNudgeText → silent），但不得 silent-interrupt 打断
        // 当前核验轮（void verifyThenResolve 与 runChat 并行——中途 stopGeneration 会打乱
        // mock/续聊轮次，S4-3 实证「已解决」卡不出）。working 中写入 pending，等本轮 finally flush。
        const nudge = `【系统对账·非用户发言】${guide}`
        if (workingRef.current) pendingSendRef.current = nudge
        else void sendRef.current({ silent: true, text: nudge })
      } else {
        // A-015（V1.5-S4）：对账失败用户侧可见提示——无回填引导（或达防死循环上限停止自动 send）时，
        // 注入消息不存在 → 状态栏非侵入提示（对齐 needs-human 模式），否则用户不知道对账未通过
        onActionPromiseHint?.(
          '证据对账未通过——已停止自动补充证据，可手动继续对话（或核对证据后重新提交完成声明）',
        )
      }
      // 达 maxGuides：停止自动引导（防死循环）
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
    const releaseWorking = () => {
      setWorking(false)
      onWorkingChange?.(false)
    }
    // 等待自动执行（pending）完成——最多 150s（2026-08-05 根因修复：原 8s 窗口 < 长任务工具超时
    // （bash 30s / npm install 120s——坑 61）→ 工具未完成就续聊 → 回填「执行失败」→ 模型停住/重试；
    // 窗口必须覆盖最长工具超时；待授权（need-approval）立即停止（等用户点允许）
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 500))
      // 2026-08-05 防护：长窗口（150s）期间用户可能打断（处理中发送=stopGeneration→sessionRef++）——检测到立即停止等待，防旧会话续聊
      if (sessionRef.current !== sid) {
        releaseWorking()
        return
      }
      const latest = messagesRef.current
      const lastMsg = latest[latest.length - 1]
      if (!lastMsg || !lastMsg.toolCalls || lastMsg.toolCalls.length === 0) {
        releaseWorking()
        return
      }
      const pending = lastMsg.toolCalls.filter((c) => c.status === 'pending')
      const needsApproval = lastMsg.toolCalls.some(
        (c) => c.status === 'need-approval' || c.status === 'file-approval',
      )
      // 2026-08-07 会话级单一 PENDING（重构——确认卡待决策 → 模型停——动作无效——用户决策是唯一输入）
      // 2026-08-14 S2b（缝隙 4/5）：确认卡触发走状态机派生——执行确认只认**有副作用动作**（探索 bash 不再触发）
      const lastContent = lastMsg.content ?? ''
      const sideEffectPending = lastMsg.toolCalls.some(
        (c) => c.status === 'pending' && isSideEffectAction(c.name, String(c.args?.command ?? '')),
      )
      const confirmPending =
        pendingCardToShow(
          stateRef.current.goalConfirmed,
          stateRef.current.planConfirmed,
          stateRef.current.resolutionConfirmed,
          lastContent,
          sideEffectPending,
        ) !== 'none'
      // 2026-08-15 问题 A 修复（用户实测 14 轮工具循环根因）：停止条件接入状态机——pending 非 none 即停
      // （与 canExecute 同源——领域层 shouldStopContinuation）。授权卡（need-approval/file-approval）可能挂在
      // **旧消息**（用户未批准未拒绝——卡悬挂）→ 全列表 effect 已置 pending='approval'，但 lastMsg 派生检测不到
      // → 修复前继续喂模型 → forceTool 逼模型每轮调工具 → 被 pendingBlocked 拦 → 循环。现在卡在任意消息都停续聊
      if (shouldStopContinuation(stateRef.current, { needsApproval, confirmPending })) {
        releaseWorking()
        return
      } // 卡弹出（确认卡/授权卡）——等用户决策（模型停——不续聊）
      if (pending.length === 0) {
        // 2026-08-04 重构：同工具重复检测（同一 name+args 连续 3 次 = 死循环——防模型空转不产出；跨调用累积——原局部变量每轮重置失效）
        // 2026-08-05 体验反馈：只统计写工具（write/edit）——read/bash 只读重复是模型合理排查（曾因 read 摘要化反复读同文件被误伤），不触发；真正空转由 depth 40 兜底
        // 2026-08-14 修复（冒烟实测：npm init 中文目录名失败 exit-1 → 模型 13+ 次原样重试同一命令——空错误无诊断 + bash 重试无上限 = 死循环；
        // 同日再实测：check-server 成功仍重复 7+ 次（起服务验证后不收敛）——成功重复同样空转）：
        // 重复检测覆盖三类：① write/edit（原判定）② **失败工具**（status=error——失败重试 ≠ 合理排查，错误没变结果不会变）
        // ③ **执行/验证类工具**（bash/check-server/start-server/stop-server/open——成功还重复 = 转圈）；
        // read/search/LSP 查询类仍豁免（2026-08-05 决策：只读重复是模型合理排查）
        const retryCalls = lastMsg.toolCalls.filter(
          (c) =>
            c.name === 'write' ||
            c.name === 'edit' ||
            c.status === 'error' ||
            ['bash', 'check-server', 'start-server', 'stop-server', 'open'].includes(c.name),
        )
        if (retryCalls.length > 0) {
          // sig 含 status：失败→成功的「修好了」不算重复（npm install 失败 2 次后成功 = 合理收敛）
          const sig = retryCalls
            .map((c) => `${c.name}:${c.status}:${JSON.stringify(c.args ?? {})}`)
            .join('|')
          const chain = chainRepeatRef.current
          if (chain.sid !== sid) {
            chain.sid = sid
            chain.sig = ''
            chain.count = 0
          }
          chain.count = sig === chain.sig ? chain.count + 1 : 1
          chain.sig = sig
          if (chain.count >= 3) {
            console.log('[conversation] 工具循环疑似死循环（同一工具重复 3 次）——停止续聊')
            // 2026-08-04 体验修复：停止时提示用户（原静默停——用户看到「卡住」不知道原因；提示后可继续）
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content:
                  '搭档检测到在重复做同一件事（反复写同一个文件、反复执行同一个失败命令或反复检查同一个服务，已自动暂停，避免死循环）。你回复「继续」或告诉它下一步，它就会接着做。',
                status: 'done',
                id: nextMsgId(),
              },
            ])
            releaseWorking()
            return
          }
        }
        break // 全部执行完成
      }
    }
    const latest = messagesRef.current
    const lastMsg = latest[latest.length - 1]
    if (!lastMsg) {
      releaseWorking()
      return
    }
    const calls = lastMsg.toolCalls ?? []
    if (calls.length === 0) {
      releaseWorking()
      return
    }
    // 组装 tool 消息序列
    const toolMsgs: Array<{
      role: string
      content: string | null
      tool_calls?: unknown[]
      tool_call_id?: string
      reasoning_content?: string
    }> = [
      ...ctx.msgs,
      {
        role: 'assistant',
        content: null,
        reasoning_content: lastMsg.reasoning ?? '',
        tool_calls: calls.map((c, i) => ({
          id: `call_${i}`,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      },
      ...calls.map((c, i) => ({
        role: 'tool',
        tool_call_id: `call_${i}`,
        content: c.rawResult ?? c.result ?? '执行失败',
      })),
    ]
    chatRef.current = { msgs: toolMsgs, depth: depth + 1 }
    setMessages((p) => [
      ...p,
      { role: 'assistant', content: '', reasoning: '', status: 'streaming', id: nextMsgId() },
    ])
    await new Promise((r) => setTimeout(r, 50))
    await runChat(toolMsgs, depth + 1, sid)
  }

  // 多轮工具循环：模型返回 tool_call → 执行 → 结果回填 → 续聊（2026-08-04 重构：自然停止——模型不调工具/待授权/死循环检测；40 轮总兜底）
  const runChat = async (
    msgs: Array<{
      role: string
      content: string | null
      tool_calls?: unknown[]
      tool_call_id?: string
      reasoning_content?: string
    }>,
    depth: number,
    sid: number,
  ) => {
    // 2026-08-04：当前活跃流 = 本 sid（停止后旧流 chunk 不再更新 UI）
    streamingSidRef.current = sid
    // V1.5 S2 A-017：每轮流开始复位挂起标记（防 stopGeneration/错误路径残留——stop 不触发 done 分支，
    // 若只在 done 复位，中断的轮会把挂起误带到下一轮 → 兄弟工具被错误挂起）。挂起只约束同轮兄弟调用。
    suspendRoundRef.current = false
    // 2026-08-04 重构（用户：「定多少才不卡」根因——原 `depth > 4` 硬上限，开发工具链 5+ 轮必断）：40 轮总兜底（防死循环由 maybeContinue 重复检测承担）
    if (depth > 40) {
      // 2026-08-05：提前 return 释放 working（不经过 maybeContinue/finishError——防卡「搭档处理中」）
      setWorking(false)
      onWorkingChange?.(false)
      setWorkingStage('就绪')
      return
    }
    const key = await window.neonforge.config.getKey()
    if (!key) {
      finishError('key-invalid')
      return
    }
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
        const cap = await window.neonforge.tools.execute('check-capability', {
          dir: rootPath,
          sessionId,
        })
        if (cap.ok) {
          const data = cap.data as
            | {
                capabilities?: Array<{ id: string; status: string }>
                runtime?: string
                runtimeVersion?: string
                hasNodeModules?: boolean
              }
            | undefined
          const caps = data?.capabilities ?? []
          const ready = caps.filter((c) => c.status === 'ready').map((c) => c.id)
          const missing = caps
            .filter((c) => c.status === 'missing' || c.status === 'failed')
            .map((c) => c.id)
          // S5：toolsAvailable 能力快照（require-advance 前提——ready 能力非空 = 工具可用）；
          // 无能力数据（caps 空——mock/降级环境）→ 默认可用（未知不降级——仅明确缺失/失败才判不可用）
          capReadyRef.current = caps.length === 0 ? true : ready.length > 0
          envHint = `【当前环境】项目根目录：${rootPath}；runtime：${data?.runtime ?? '?'} ${data?.runtimeVersion ?? ''}；依赖：${data?.hasNodeModules ? '已装' : '未装'}；可用能力：${ready.join('/') || '无'}；${missing.length > 0 ? `缺失/异常：${missing.join('/')}` : '能力齐备'}。`
          // 2026-08-15 M8：环境注入事件（06 §1.4 environment.injected 对应打点——模型 02 §4.7 事实来源前置呈现可观测）
          tlog(
            'environment.injected',
            {
              rootPath,
              runtime: data?.runtime,
              runtimeVersion: data?.runtimeVersion,
              hasNodeModules: data?.hasNodeModules,
              caps: caps.map((c) => `${c.id}:${c.status}`),
            },
            'system',
          )
        }
      } catch {
        /* 环境注入失败不影响发送 */
      }
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
    const langRule =
      lastUserMsg && /[\u4e00-\u9fff]/.test(String(lastUserMsg.content ?? ''))
        ? '用中文回复用户（避免英文夹杂；工具名/代码/技术名词可保留原文；**即使工具结果/代码是英文，回复用户也保持中文**——不要中途切换成英文）'
        : '用与用户消息相同的语言回复'
    // 2026-08-15 Q6：系统提示词外置（sysPrompt.ts——原 4812 字符模板内嵌组件）
    const sysHint = buildSysHint(envHint, planHint, langRule)
    try {
      // 2026-08-06 调研驱动根治「只说不做」（官方 issue #1376 + 文档 + 实测三源交叉验证——工具模式 thinking disabled 下 required 可用）：
      // S5（§6 S5 + §3.3——唯一推进判定器）：decideProgressGuarantee 替代 decideTurnPolicy——
      // 吸收 turnPolicy 状态空间（lastToolFailed 失败诊断释放/plannedComplete 写完释放/resolutionConfirmed
      // 达成释放）+ S5 推进维度（上轮结构化提议/证据——evaluateTurnProgress 扩展）+ toolsAvailable（能力快照）
      // 坑 93 保持：判定读 ref（stateRef.current）——确认卡按钮同事件触发 send 时 prop 闭包滞后 → forceTool 恒 auto
      const lastAssistantMsg = [...messagesRef.current]
        .reverse()
        .find((m) => m.role === 'assistant')
      const lastContent = lastAssistantMsg?.content ?? ''
      const turnInput = evaluateTurnProgress({
        toolCalls:
          lastAssistantMsg?.toolCalls?.map((c) => ({
            name: c.name,
            status: c.status,
            file: c.file,
            command: String((c.args as { command?: string } | undefined)?.command ?? ''),
          })) ?? [],
        content: lastContent,
        prevReadFiles: prevReadFilesRef.current,
        plannedFiles: stateRef.current.plannedFiles,
        producedFiles: stateRef.current.producedFiles,
        projectFiles: new Set((recentFilesExternal ?? []).map((f) => trustPath(f))),
      })
      // S5 修正（L3 根因 3 回归——S5 复审坑 97 单源）：已确认决策点的提议不再计「本轮推进」——
      // 方案确认后上轮【执行方案】消息是**已消费的提议**（用户点了确认）→ 新一轮应逼执行（require-action）；
      // 未确认的提议（pending 期/拒绝后重提议轮）仍算推进（auto——模型在走决策点流程）。
      // isConsumedProposal 领域层单源（isStructuredProposal 唯一探测——渲染层不自写正则）
      const proposalConsumed = isConsumedProposal(lastContent, stateRef.current)
      const decision = decideProgressGuarantee(
        stateRef.current,
        {
          produced: turnInput.artifactProduced || turnInput.sideEffectSucceeded,
          proposed: turnInput.proposed && !proposalConsumed,
          providedEvidence: turnInput.providedEvidence && !proposalConsumed,
          toolsAvailable: capReadyRef.current,
        },
        new Set((recentFilesExternal ?? []).map((f) => trustPath(f))),
      )
      const forceTool = decision.mode === 'require-action'
      // S5：execution.forced/released 事件语义更新——mode/reason 可回放（区分「逼工具」require-action
      // 与「逼推进」require-advance——forceTool 布尔同 true 语义但轨迹可诊断）
      tlog(
        forceTool ? 'execution.forced' : 'execution.released',
        { mode: decision.mode, reason: decision.reason },
        'system',
      )
      // 2026-08-14 取证打点（用户实测「一直读取操作」——plannedComplete 未收敛）：dump 三集合供 timeline 比对
      tlog(
        'execution.force_input',
        {
          planned: [...stateRef.current.plannedFiles].slice(0, 12),
          produced: [...stateRef.current.producedFiles].slice(0, 12),
          projectFiles: (recentFilesExternal ?? []).slice(0, 12),
          goalAchieved: stateRef.current.resolutionConfirmed,
        },
        'system',
      )
      tlog(
        'conversation.assistant_start',
        {
          forceTool,
          progressMode: decision.mode,
          goalConfirmed: stateRef.current.goalConfirmed,
          planConfirmed: stateRef.current.planConfirmed,
        },
        'assistant',
      )
      // ADR-010：无进展对话四级梯度（UAT-Sim A-024/A-025）——T1/T2 计数已在 setPendingState/message_sent 累积
      const dialogueVerdict = detectUnproductiveDialogue(stateRef.current)
      console.log(
        '[adr010] verdict=' +
          dialogueVerdict +
          ' rep=' +
          stateRef.current.pendingRepeatCount +
          ' txt=' +
          stateRef.current.unresolvedTextReplies +
          ' pending=' +
          stateRef.current.pending,
      )
      let loopGuardSuffix = ''
      if (dialogueVerdict === 'loop-guard') {
        // 一级（软重定向，reasonix 式）：注入 [loop guard]——用户文本不能替代结构化确认
        tlog(
          'dialogue.loop_guard',
          { rounds: stateRef.current.pendingRepeatCount + stateRef.current.unresolvedTextReplies },
          'system',
        )
        loopGuardSuffix =
          '\n\n【系统对账·非用户发言】对话出现循环：用户文本回复不能替代结构化确认。请检查你的提议（目标 propose_goal / 执行方案 propose_plan）是否已提交——若尚未提交（或刚被用户拒绝），必须重新调用对应提议工具提交修订后的提议（吸收用户反馈），否则界面上不会出现确认卡；提交后停止输出，等待用户点击确认卡。如需用户选择，请用 ask_user 提供明确选项。'
        console.log('[adr010] loop guard injected')
      } else if (dialogueVerdict === 'forced-clarify') {
        // 二级（强制澄清卡）：系统直接置 system_clarify 决策点（不经模型）——本回合不再调用模型
        const curPending = stateRef.current.pending
        const underlying = (
          curPending === 'none' || curPending === 'system_clarify' ? 'goal' : curPending
        ) as 'goal' | 'plan' | 'resolution'
        const dc = stateRef.current.decisionContent
        const prop = dc?.proposal as { statement?: string; summary?: string } | undefined
        const statement = prop?.statement ?? prop?.summary ?? '当前任务决策点等待你的选择'
        setPendingState('system_clarify', {
          proposal: { underlying, statement },
          since: new Date().toISOString(),
        })
        tlog('dialogue.forced_clarify', { underlying }, 'system')
        console.log('[adr010] forced clarify card set, underlying=' + underlying)
        return // 等待用户在强制卡上做出选择——不进入模型回合
      }
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic',
        tools: true,
        forceTool,
        progressMode: decision.mode,
        sessionId,
        messages: [
          ...(loopGuardSuffix
            ? [{ ...sysHint, content: sysHint.content + loopGuardSuffix }]
            : [sysHint]),
          ...msgs,
        ],
      })
      if (!res.ok) {
        finishError(res.error ?? 'gateway-error', res.errorType)
        return
      }
    } catch {
      finishError('network')
      return
    }

    // 记录本轮上下文 → 由 maybeContinue 轮询工具完成（自动执行）→ 续聊
    chatRef.current = { msgs, depth }
    // 2026-08-04 体验修复：等流式 done（模型回复完成 → working 立即释放——原固定等 1000ms+轮询，用户快速「确认推进」被 working 守卫拦截）；
    // 800ms 超时兜底（流式异常未发 done 时防挂起）
    await new Promise<void>((r) => {
      const t = setTimeout(() => {
        doneNotifierRef.current = null
        r()
      }, 800)
      doneNotifierRef.current = () => {
        clearTimeout(t)
        doneNotifierRef.current = null
        r()
      }
    })
    await maybeContinue(depth, sid)
  }

  // 2026-08-04：对话历史构造（send 与阶段推进自动触发共用——工具轮转文本摘要保留上下文，DeepSeek 要求 tool 消息带 reasoning_content）
  // 2026-08-21 ADR-007/provider 兼容：回放字段名统一 `reasoning_content`（官方与 Command Code 均需——pi #3636/#4678 实证
  // DeepSeek V4 多轮 thinking 回放必须带 reasoning_content；读取端 gateway 已多源兼容 reasoning/reasoning_content——A-012）
  // 2026-08-06 根因修复（用户「说了做没做老问题——到底需要多少兜底」）：工具轮**不再转「（上一步执行：xxx）」自然语言文本**——
  // 那是模型文本模拟工具的模仿源（09:38 日志模型输出「（上一步执行：[read]）」= 模仿历史里我方塞的文本；9 层兜底全在补救症状，从没修模仿源）；
  // 改为保留**标准结构化 tool_calls + tool 消息**（与工具循环 497-505 行同格式——模型看到的是系统工具消息，不会模仿成正文）
  // P1-05 阶段 4a：buildHistory 已提取到 conversationHistory.ts（纯函数）
  const workingRef = useRef(false)
  useEffect(() => {
    workingRef.current = working
  }, [working])
  // 2026-08-04 体验修复：流式 done 通知——runChat 尾部等 done（working 及时释放，用户快速「确认推进」不被拦）
  const doneNotifierRef = useRef<(() => void) | null>(null)
  // 2026-08-07 无阶段重构 S4：pendingAdvanceRef（阶段推进排队）删除——advanceChat 随阶段体系移除
  // 2026-08-04 重构：工具链死循环检测——同工具（name+args）连续 3 次停止（跨 maybeContinue 调用累积——原局部变量每轮重置失效）
  const chainRepeatRef = useRef<{ sid: number; sig: string; count: number }>({
    sid: -1,
    sig: '',
    count: 0,
  })
  // 2026-08-04 授权架构 v4：任务级信任集合——「允许并记住」的文件（沙箱内 write/edit 自动）；阶段推进（确认推进=新任务）自动清除
  const [taskTrust, setTaskTrust] = useState<string[]>([])
  const taskTrustRef = useRef<string[]>([])
  const trustPath = (p: unknown): string => {
    const s = String(p ?? '')
    if (!s) return rootPath ? `${rootPath}/` : ''
    // #6 真机 2026-08-30（P1-6）：剥模型误带的任务目录前缀（双重嵌套——批准注册与门控匹配统一基准）
    return resolveSandboxPath(rootPath ?? '', s)
  }
  const isTrusted = (args: Record<string, unknown>): boolean =>
    taskTrustRef.current.includes(trustPath(args.path ?? args.filePath ?? ''))

  // P1-05 阶段 4b：流式事件处理（依赖在定义处全部就绪后创建；applyChunkRef 在 effect 中同步）
  const applyChunk = createApplyChunk({
    applyTool,
    delegateLowRisk,
    doneNotifierRef,
    evidenceGuideCountRef,
    evidenceReportNudgedRef,
    initialPrompt,
    isTrusted,
    messages,
    messagesRef,
    nextMsgId,
    onActionPromiseHint,
    onReasoning,
    onToolResult,
    onWorkingChange,
    planRejectNudgedRef,
    planWasRejectedRef,
    prevReadFilesRef,
    recentFilesExternal,
    researchProposeNudgedRef,
    rootPath,
    sendRef,
    sessionId,
    setMessages,
    setPendingState,
    setWorking,
    setWorkingStage,
    stateRef,
    streamingRef,
    stuckStateRef,
    suspendRoundRef,
    textFallbackCountRef,
    tlog,
    trustPath,
    verifyThenResolve,
    webOnlyStreakRef,
  })

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
    webOnlyStreakRef.current = 0
    researchProposeNudgedRef.current = false
    planWasRejectedRef.current = false
    planRejectNudgedRef.current = false
    evidenceGuideCountRef.current = 0
    evidenceReportNudgedRef.current = false
    // 2026-08-05：阶段推进 = 任务边界；2026-08-07 无阶段重构 S4/S5：目标确认（goalSeq）= 任务边界——approve-files 幂等标记同步重置（新任务需重新规划授权）
    // 2026-08-14 S2：状态机字段（完整任务边界重置由 userConfirmed('goal') 承担——此处仅即时清幂等标记）
    setFilesApproved(false)
    // 2026-08-15 D2：任务边界同步 main（filesApprovedRef 复位——否则跨任务 write 规划门控失效）
    // D3（ADR-005）：PlannedFiles 权威在 main——任务边界经 planned-files:reset 同步落盘
    try {
      void window.neonforge.plannedFiles?.reset()
    } catch {
      /* 重置失败不影响——renderer 门控仍生效 */
    }
  }
  // 2026-08-04 修复（用户「游戏成的3是D」错位）：流式链互斥——一次只跑一条链（send/advanceChat/授权续聊），其他链排队；
  // 原并发流（approveToolCall 续聊 + pendingAdvance 补发）chunk 交错写入同一消息 → 文本字符级错位
  const chainLockRef = useRef<Promise<void>>(Promise.resolve())
  const acquireChain = () => {
    const prev = chainLockRef.current
    let release!: () => void
    chainLockRef.current = new Promise<void>((r) => {
      release = r
    })
    return prev.then(() => release)
  }

  // 2026-08-05 用户反馈 4：打断能力（对齐 Claude Code Esc / Cursor Stop）——停止当前流 + 杀当前 bash + 释放状态
  // 停止后旧流 chunk / maybeContinue 续聊全部失效（sessionRef++ 隔离）；用户可继续输入新指令
  const stopGeneration = async (source: 'button' | 'silent' = 'button') => {
    tlog('conversation.interrupted', { source }, 'system') // 2026-08-08 打断打点（停止按钮 / silent 自动干预）
    sessionRef.current++ // 旧会话失效——旧流 chunk（streamingSidRef 检查）、maybeContinue 续聊（sessionRef 检查）全失效
    streamingSidRef.current = sessionRef.current
    onActionPromiseHint?.(null)
    try {
      await window.neonforge.tools.cancel?.()
    } catch {
      /* 无活动命令 */
    }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('已停止')
  }

  // 2026-08-07 无阶段修复（用户「输入≠打断」）：排队衔接机制——模型产出中用户发送 → 存 pending，
  // 当前轮（流式+工具链）完成后自动发送（不打断）；打断 = 显式停止按钮（.nf-chat__stop）
  const flushPendingSend = () => {
    const pending = pendingSendRef.current
    if (!pending) return
    pendingSendRef.current = ''
    // 直送——不经输入框（避免 pending 文案闪进 textarea）
    setTimeout(() => void sendRef.current({ text: pending }), 50)
  }

  // 2026-08-06 只说不做第 5 次升级：send 支持 silent（自动续聊——不显示用户气泡）
  // 2026-09-28：系统提示/对账前缀强制 silent；opts.text 直送——不经输入框（防系统文案停在 textarea）
  const send = async (opts?: { silent?: boolean; text?: string }) => {
    const fromBox = opts?.text === undefined
    const text = (fromBox ? inputRef.current : opts.text!).trim()
    if (!text) return
    const silent = Boolean(opts?.silent) || isSystemNudgeText(text)
    // BC-12 硬限制（仅用户显式开启）：达阈值后在新一轮开始前暂停——不打断已开始的流式/工具调用
    if (!silent) {
      try {
        const b = await window.neonforge.budget?.get?.()
        if (b?.state.reached && b.settings.pauseOnReach) {
          onActionPromiseHint?.('预算已达阈值——已在安全点暂停；请调整预算后继续')
          return
        }
      } catch {
        /* 预算查询失败不阻断发送 */
      }
    }
    // 来自输入框：立刻清框（silent 若先 await stop，文案会长时间停在框里——UAT typeAndSend / 用户可见）
    // opts.text 直送：不动输入框，保留用户草稿
    if (fromBox) {
      inputRef.current = ''
      setInput('')
    }
    // 2026-08-07 无阶段修复（用户「输入≠打断」——竞品共识：Claude Code Esc / Cursor 停止按钮 / Devin 中断都是显式动作）：
    // 模型产出中发送 = 排队衔接（不打断当前流式/工具链，当前轮完成后自动发送）；打断 = 显式停止按钮（.nf-chat__stop）
    // 待授权（模型停住等批准）时发送 = 直接处理（用户未批准给新指令——排队会卡在授权等待）
    if (workingRef.current) {
      if (silent) {
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
        return
      }
      console.log('[conversation] 待授权中发送——新指令直接处理（未批准给新指令）')
    }
    if (!silent) {
      // S7（A0 审校 P1-5 + C2 完善——e2e-0to1 场景 B 暴露）：pending 期用户文本分流——
      // 确认语义（isConfirmIntent——「行/按这个方案」）→ 自动确认当前决策点（等价点按钮——确认卡时代
      // 遗漏文本确认——真实用户打字确认）；新意图文本 → 隐式拒绝（C2——reason.direction + text——
      // 卡消失 + 模型重提议）；approval 期确认文本 → 触发当前授权卡批准（下方 approveToolCall 路径）
      const pendingKind = stateRef.current.pending
      if (pendingKind !== 'none' && pendingKind !== 'approval') {
        if (isConfirmIntent(text)) {
          confirm(pendingKind)
        } else {
          reject(pendingKind, { kind: 'direction', text })
        }
      } else if (
        pendingKind === 'approval' &&
        // 收紧（T0-3/P2 回归修正）：approval 期只认**明确批准词**（「批准/可以/行/同意」——
        // 「继续」等非批准语义不自动批——手动按卡测试与真实「让模型继续」路径保持手动）
        /^(行|好|可以|批准|同意|没问题|确认|就这么办)[。！!~～]?$|批准|同意/.test(text)
      ) {
        // S7（C2 完善——e2e-0to1 场景 B）：approval 期确认文本 → 自动批准当前待批授权卡
        // （真实用户打字「行/批准」——确认卡时代只处理按钮批准遗漏文本批准）
        const lastMsg = messagesRef.current[messagesRef.current.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.toolCalls?.length) {
          approveAllToolCalls(lastMsg.toolCalls)
        }
      }
      // 13 复跑入口：上报用户输入（真实交付包 rerunPrompt 用）
      onUserMessage?.(text)
      // 2026-08-04：对话日志（自动记录用户消息——与 assistant done 互补成完整对话）；2026-08-08 会话归属
      tlog('conversation.message_sent', { content: text }, 'user')
      // ADR-010 T2：pending 存在期间的用户文本回复计数（用户在试图用文字确认——A-024 主动检测）
      stateRef.current = noteUserTextReply(stateRef.current)
      window.neonforge.chatLog?.log?.({
        ts: new Date().toISOString(),
        role: 'user',
        content: text,
        session: sessionId,
      })
      setMessages((p) => [...p, { role: 'user', content: text, status: 'done', id: nextMsgId() }])
    } else {
      // 系统引导/提示：不经用户通道（气泡/输入框/message_sent/chatLog）；时间线记一条便于事后查
      tlog('conversation.system_nudge', { content: text, kind: systemNudgeKind(text) }, 'system')
    }
    // 2026-08-04：新轮次——重置流式累积（防上轮异常残留）
    streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
    setWorking(true)
    onWorkingChange?.(true)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messages)
    setMessages((p) => [
      ...p,
      { role: 'assistant', content: '', reasoning: '', status: 'streaming', id: nextMsgId() },
    ])
    setWorkingStage(silent ? '系统引导中…' : '已发送，等待搭档…')

    // ticket 12 ContextEngine：@引用文件 → 注入精准上下文（零 token 确定性——不走 LLM read）
    // silent：API 走 system（非 user——不经用户通道）；模型仍消费指令
    const msgs: Array<{ role: 'user' | 'system'; content: string }> = [
      { role: silent ? 'system' : 'user', content: text },
    ]
    const mentionFiles = (text.match(/@(\S+)/g) ?? []).map((m) => m.slice(1))
    if (mentionFiles.length > 0 && rootPath) {
      try {
        const ctx = await window.neonforge.context.resolve(mentionFiles)
        if (ctx.fragments.length > 0) {
          const note =
            '【已注入文件上下文（@引用）】\n' +
            ctx.fragments
              .map((f) => `--- ${f.path}${f.truncated ? '（截断）' : ''} ---\n${f.content}`)
              .join('\n\n')
          msgs.unshift({ role: 'system', content: note })
        }
      } catch {
        /* 注入失败不影响发送 */
      }
    }
    // ticket 08d：搭档须知 .neonforge 注入（项目级指令——readNotebook 已实现未消费；全局指令放最前）
    if (rootPath) {
      try {
        const nb = await window.neonforge.workspace.readNotebook(rootPath)
        if (nb?.ok && nb.content.trim()) {
          msgs.unshift({
            role: 'system',
            content: `【搭档须知 .neonforge】\n${nb.content.slice(0, 2000)}`,
          })
        }
      } catch {
        /* 注入失败不影响发送 */
      }
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
              {
                role: 'assistant',
                content: '（早期对话已压缩——长对话自动摘要，最近 20 条保留）',
                status: 'done' as const,
                id: nextMsgId(),
              },
              ...compacted.kept
                .filter((m) => m.content != null)
                .map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content ?? '',
                  status: 'done' as const,
                  id: nextMsgId(),
                })),
              ...tail,
            ]
          })
          chatHistory = [
            { role: 'user' as const, content: compacted.summary },
            ...compacted.kept.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content ?? '',
              // 2026-08-21 ADR-007/provider 兼容：compaction 后保留 reasoning_content（DeepSeek V4 多轮 thinking 回放必须带——07 §2）
              ...(m.role === 'assistant'
                ? {
                    reasoning_content:
                      (m as { reasoning_content?: string }).reasoning_content ?? '',
                  }
                : {}),
            })),
          ]
          setWorkingStage('已压缩长对话（摘要 + 最近 20 条）…')
        }
      } catch {
        /* 压缩失败 → 全量发送（降级不阻塞） */
      }
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
  useEffect(() => {
    sendRef.current = send
  }, [send])

  // 2026-08-07 无阶段重构 S4：advanceChat（阶段推进自动触发）删除——无阶段无阶段切换；
  // 目标确认/执行确认后由用户消息驱动（send 正常流程），不再有内部阶段指令

  // L3 授权：允许执行（approved=true）/ 拒绝（标记拒绝）
  // 2026-08-04 重构（用户：「搭档处理中」卡住根因）：按消息定位工具卡更新——原固定更新最后一条消息，
  // 续聊已追加新 streaming 消息时错位（工具结果回填错位 → maybeContinue 看不到 done → 链中断 + working 卡）
  // 2026-08-15 Q1b：工具授权 handler 封装（useToolApproval——批准/拒绝/记住/合并/回滚/停止）
  const {
    approveToolCall,
    rejectToolCall,
    rememberAndApprove,
    approveAllRemember,
    approvePlan,
    revertToolCall,
    stopToolCall,
    approveAllToolCalls,
  } = useToolApproval({
    setMessages,
    tlog,
    fmtToolResult,
    trustPath,
    rootPath,
    sessionId,
    onToolResult,
    onApprovalResolved,
    applyTool,
    grantPlan,
    rejectApproval,
    addTrust,
    acquireChain,
    maybeContinue,
    chatRef,
    sessionRef,
    streamingSidRef,
    streamingRef,
    setWorking,
    onWorkingChange,
    setWorkingStage,
  })
  const finishError = (err: string, errorTypeHint?: ChatErrorType) => {
    // 2026-08-04 体验修复：错误分类 + 日志记录在 updater 外（坑 32——StrictMode updater 双调；原仅 done 记录错误无法追溯）
    // 2026-08-05 用户反馈（第二轮候选点选后卡住）：runChat 提前 return（gateway 错误/网络错误/key 失效）走 finishError 不经过 maybeContinue——
    // working 释放点已移到 maybeContinue（0e12ea6）→ finishError 不释放 → working 卡 true → 状态栏「搭档处理中」→ 卡住；此处统一释放
    // 2026-08-07 T1 根因补强：ipc 返回结构化 errorType 优先（gateway 源头分类）——classifyChatError 仅兜底（字面量/未知格式）
    const errorType = errorTypeHint ?? classifyChatError(err)
    tlog('conversation.error', { errorType, message: err }, 'system') // 2026-08-08 错误打点（错误链路可追溯）
    let content = '刚才出错了，点「重试」继续——不用重新说一遍。'
    if (errorType === 'key-invalid') {
      content = 'API Key 好像失效了，换个 Key 试试。'
    } else if (errorType === 'service') {
      content = '服务暂时不可用（已自动重试）。点「重试」再试一次。'
    }
    workingRef.current = false // 同步清——effect 滞后会导致立刻 retryFailedTurn 被 working 门挡掉
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('就绪')
    onActionPromiseHint?.(null)
    window.neonforge.chatLog?.log?.({
      ts: new Date().toISOString(),
      role: 'assistant',
      content,
      error: errorType,
      session: sessionId,
    })
    const prev = messagesRef.current
    const last = prev[prev.length - 1]
    const nextMsgs =
      !last || last.role !== 'assistant'
        ? prev
        : [...prev.slice(0, -1), { ...last, status: 'error' as const, error: errorType, content }]
    messagesRef.current = nextMsgs
    setMessages(nextMsgs)
    // 目标或方案已确认后的瞬态失败：一次自动续跑（等同点「重试」——不追加用户消息）
    if (
      errorType === 'service' &&
      (stateRef.current.goalConfirmed || stateRef.current.planConfirmed) &&
      !autoRetriedServiceRef.current
    ) {
      autoRetriedServiceRef.current = true
      setTimeout(() => {
        void retryFailedTurnRef.current?.()
      }, 0)
    }
  }

  // 竞品共识：失败气泡旁「重试」= 重放上一回合，不追加用户消息（Claude/Cursor 同类）
  const retryFailedTurn = async () => {
    if (workingRef.current) return
    const base = messagesRef.current
    const last = base[base.length - 1]
    if (!last || last.role !== 'assistant' || last.status !== 'error') return
    const prev = base.slice(0, -1)
    streamingRef.current = {
      content: '',
      reasoning: '',
      toolCalls: last.toolCalls ?? [],
    }
    setMessages([
      ...prev,
      {
        role: 'assistant',
        content: '',
        reasoning: '',
        status: 'streaming',
        id: nextMsgId(),
        toolCalls: last.toolCalls,
      },
    ])
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage('重试中…')
    const sid = ++sessionRef.current
    const hist = chatRef.current?.msgs ?? buildHistory(prev)
    const depth = chatRef.current?.depth ?? 0
    await runChat(hist, depth, sid)
  }
  const retryFailedTurnRef = useRef(retryFailedTurn)
  retryFailedTurnRef.current = retryFailedTurn

  const demo = getDemoBridge()
  // 2026-08-07 无阶段重构 S4：demoFlow（DeliveryFlowPanel demo 通道）删除——阶段卡随阶段体系移除
  const demoDigital = !!demo?.digitalDelivery
  const demoTrust = !!demo?.trustLadder
  const demoDod = !!demo?.dodAlign
  const compactCount = demo?.compactHistory ?? 0
  const compactNote =
    compactCount > 24
      ? `对话已超过 24 条——将压缩前 ${compactCount - 12} 条为摘要（上下文不丢）`
      : null
  const onDeliver = (pkg: DeliveryPackage) => {
    getDemoBridge()?.onDeliver?.(pkg)
  }

  return (
    <div className="nf-chat">
      {demoDigital && <DigitalDeliveryPanel onDeliver={onDeliver} />}
      {demoTrust && (
        <TrustLadderPanel
          authorizedLogs={activeAuthorizedLogs}
          delegateLowRisk={delegateLowRisk}
          onDelegateChange={handleDelegateChange}
        />
      )}
      {demoDod && <DoDAlignPanel />}
      {compactNote && (
        <div className="nf-compact">
          <IconClock size={12} /> {compactNote}
        </div>
      )}
      <div
        className="nf-chat__list"
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions text"
        tabIndex={0}
        aria-label="对话消息列表"
      >
        {messages.length === 0 && (
          <div className="nf-scenes">
            <p className="nf-placeholder">想解决什么？直接说，或从这些开始：</p>
            <div className="nf-scenes__grid">
              {SCENES.map(({ icon: Icon, label, q }) => (
                <button
                  key={label}
                  type="button"
                  className="nf-scene"
                  onClick={() => {
                    setInput(q)
                    inputRef.current = q
                    textareaRef.current?.focus()
                  }}
                >
                  <span className="nf-scene__icon">
                    <Icon size={20} />
                  </span>
                  <span className="nf-scene__label">{label}</span>
                  <span className="nf-scene__q">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* S3（§4.1）：拒绝超限回退——rejectStreak ≥3 状态栏提示澄清（不弹卡轰炸；同一决策点协商保护） */}
        {stateRef.current.rejectStreak >= 3 && (
          <div className="nf-reject-overflow" role="status">
            连续拒绝了 3 次——建议澄清需求或重新描述，让搭档换个方向
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`nf-msg nf-msg--${m.role}`}>
            {m.role === 'assistant' && m.status === 'streaming' && <span className="nf-breath" />}
            {m.role === 'user' && <span className="nf-msg__role">你</span>}
            <div
              className={`nf-msg__body${m.role === 'assistant' && m.status === 'streaming' && !m.content ? ' nf-msg__body--thinking' : ''}`}
            >
              {/* 2026-08-04：展示前 cleanContent 清洗（字面转义/连续换行/行尾空白）——只影响展示，API 发送原文
                  2026-08-05：stripCandidates 剥离 <candidates> 候选块（不露标记；候选渲染为按钮组）+ stripTags 去模型自发尖括号标签（实测 <one-question>，去标签留内容） */}
              {m.content
                ? cleanContent(stripTags(stripCandidates(m.content)))
                : m.status === 'streaming'
                  ? '搭档处理中…'
                  : m.error === 'empty-response'
                    ? '搭档没有返回内容——请重试或换个说法'
                    : m.status === 'error'
                      ? '处理失败'
                      : ''}
              {m.error === 'key-invalid' && (
                <button type="button" className="nf-config__link" onClick={onKeyExpired}>
                  要不要更新一下？
                </button>
              )}
              {m.status === 'error' && m.error !== 'key-invalid' && (
                <button
                  type="button"
                  className="nf-msg__retry"
                  disabled={working}
                  onClick={() => void retryFailedTurn()}
                >
                  重试
                </button>
              )}
            </div>
            {/* 2026-08-05 方案 3：结构化候选按钮——模型 <candidates> 块 → 可点击按钮（点选发送选项文本，不走序号解析）
                体验反馈：竖排 + 行首序号（① ② ③）——序号仅展示，发送仍用选项文本 */}
            {m.role === 'assistant' &&
              m.status === 'done' &&
              m.content &&
              !m.content.includes('【目标确认') &&
              !m.content.includes('【执行方案') &&
              !m.content.includes('【已达成') &&
              (() => {
                // 2026-08-08 B 修复（feedback.log——「候选确认卡 + 确认卡不能同时出来」）：
                // 同消息互斥——含确认卡标记（【目标确认】/【执行方案】/【已达成】）时不渲染候选按钮
                // （一个决策点一个决策点地走——确认卡接管决策，候选收起）
                const opts = parseCandidates(m.content)
                if (!opts) return null
                // 2026-08-08 候选例外（用户「输入内容也可以解除 pending——本来就是支持选或输入」）：
                // 候选之后出现用户消息（无论点选还是打字）= 用户已回应决策点 → 候选完成
                // 点选路径：chosen 标记已选；输入路径：replied 标记已回复（两条路径都解除 pending）
                const replied = messages.slice(i + 1).some((mm) => mm.role === 'user')
                return (
                  <CandidateButtons
                    options={opts.map((o) => ({ label: o }))}
                    replied={replied}
                    chosen={chosenCandidates[i]}
                    onPick={(label, j) => {
                      // 2026-08-08 B 修复：点击后标记已选（决策点走完——按钮变已选态，不再可点）
                      setChosenCandidates((p) => ({ ...p, [i]: j }))
                      inputRef.current = label
                      void sendRef.current()
                    }}
                  />
                )
              })()}
            {/* 2026-08-07 确认/拒绝卡片（用户决策——行业共识：显式结构化确认，替代确认词匹配；对话流内嵌——像授权卡）
                三卡：目标确认（【目标确认】提议 → 确认目标/重新描述）、执行确认（【执行方案】→ 确认执行/修改方案）、
                达成确认（【已达成】→ 已解决/还要改）——模型标记=提议，用户按钮=生效（不再自报即确认） */}
            {m.role === 'assistant' &&
              m.status === 'done' &&
              // V1.5 S2 A-017：协议工具轮消息 content 为空（只调工具无文本——propose_goal/propose_plan/
              // report_completion 决策内容经 decisionContent 承载）→ 放宽 content 条件：含协议工具调用
              // 的消息同样进入卡渲染（否则 pending 置位后卡永不弹——文本路径消息有标记故不受影响）
              (m.content || hasProtoCall(m, ...PROTOCOL_TOOL_NAMES)) &&
              (() => {
                // A-005：转换计数引用——stateVersion 变化触发重渲染（ref 非响应式——reject/confirm 后卡即时消失）
                void stateVersion
                // A-004（S3 补跑复审）：触发判定从文本探测改为领域状态派生——
                // 弹卡唯一依据 = pending + decisionContent.kind（卡内容亦来自快照——无快照不弹卡）
                // 文本探测仅保留为**信号消息定位**（卡挂哪条消息——lastSignalIdx 防连发漂移），不参与触发判定
                const dc = stateRef.current.decisionContent
                const dcKind = dc?.kind ?? null
                // P1-05 阶段 2：确认卡只接收快照（不再在卡组件内读 stateRef）
                const goalDc = dc?.kind === 'goal' ? (dc.proposal as GoalProposal) : null
                const planDc = dc?.kind === 'plan' ? (dc.proposal as PlanProposal) : null
                const resolutionClaim =
                  dc?.kind === 'resolution' ? (dc.proposal as CompletionClaim) : null
                // V1.5 S2：信号判定识别协议工具调用（协议工具消息 content 为空——决策经 decisionContent
                // 承载；文本探测只认标记——协议路径消息无标记 → 卡信号缺失）。hasPlan/achievedMatch/
                // execSignal 三处统一「文本标记 或 协议工具调用」
                const hasPlan = m.content.includes('【执行方案') || hasProtoCall(m, 'propose_plan')
                const achievedMatch =
                  m.content.includes('【已达成') || hasProtoCall(m, 'report_completion')
                // 2026-08-07 目标确认兜底（死锁修复延续——模型无【目标确认】标记时用户仍可确认）：
                // 卡不依赖标记——目标未确认时「最后一条 assistant done」消息下也显示（显示 initialPrompt 暂存目标——
                // 结构化按钮替代原确认词兜底；对齐行业：确认=显式动作，不依赖模型标记）
                // 2026-08-14 S2b（缝隙 1/5）：确认卡挂在「最后一条 assistant 消息」上——用户消息（确认词 send）插入后
                // 卡仍在模型消息位置显示，不必等模型下一条回复（旧实现 isLastAssistant 依赖 working 悬挂使 send 排队——缺陷耦合）
                const isLastAssistant =
                  m.role === 'assistant' &&
                  m === [...messages].reverse().find((x) => x.role === 'assistant')
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
                const goalFallback =
                  !goalConfirmed &&
                  isLastAssistant &&
                  !hasCandidates &&
                  // V1.5-S4 退役标注——消息列表渲染兜底探测，见 ADR-009
                  goalFallbackTrigger(m.content)
                // 2026-08-14 S2b（缝隙 4/5）：触发统一走状态机派生 pendingCardToShow（渲染与 maybeContinue 停模型同源）——
                // 「等确认」语义命中即弹 + 停；探索期（只读 bash/无等确认语义）不弹（冒烟实证：探索期弹卡 → 模型困惑）
                const sideEffectAttempted = (m.toolCalls ?? []).some((c) =>
                  isSideEffectAction(c.name, String(c.args?.command ?? '')),
                )
                // 2026-08-14 用户实测卡死修复（timeline 0219a516）：模型连发消息时确认卡漂移消失——
                // write 被拦（exec-confirm 卡弹出）→ 模型继续输出 approve-files/说明消息 → isLastAssistant 漂移 → 卡消失
                // → 模型等确认、用户找不到卡 → 死锁。**信号消息（方案标记/副作用工具卡）的卡不依赖 isLastAssistant**——
                // 卡固定挂在信号消息上直到确认；多信号消息只显示「最后一条信号消息」（卡唯一——索引由
                // useMemo lastSignalIdx O(n) 预计算，此处 O(1) 比较）；兜底卡（无信号）仍限最后一条
                const execSignal = hasPlan || sideEffectAttempted
                // 文本征询兜底（pendingCardToShow——「等你确认」类方案征询；与 done 分支 cardToShow 同源）
                const execFallback =
                  pendingCardToShow(
                    !!goalConfirmed,
                    !!planConfirmed,
                    false,
                    m.content,
                    sideEffectAttempted,
                  ) === 'plan'
                // A-004（补跑复审修正）：触发 = 领域状态（dcKind）或信号兜底（execFallback/execSignal——旧场景兼容）；
                // 拒绝后由 rejectedCardIdx 抑制（A-005 平衡——结构化卡走 dcKind 快照自然消失，信号兜底卡走索引）
                // 提前 return：无决策点且无兜底信号 → 不渲染任何卡
                if (!dcKind && !goalFallback && !execFallback && !execSignal) return null
                return (
                  <>
                    {/* #7（ADR-006）：dcKind==='goal' 渲染去掉 !goalConfirmed——换目标提议（goal 已确认后新【目标确认】）
                        也渲染目标卡（决策点由领域层派生——setPending 已置 decisionContent；再确认=新任务边界）*/}
                    {((dcKind === 'goal' && i === lastSignalIdx.goal) ||
                      (lastSignalIdx.goal === -1 && goalFallback && !dcKind)) &&
                    i !== rejectedCardIdx.goal ? (
                      <GoalConfirmCard
                        statement={goalDc?.statement ?? initialPrompt ?? '你描述的目标'}
                        assumptions={goalDc?.assumptions ?? []}
                        onConfirm={() => {
                          // 先取快照 statement 再 confirm（confirm 清 decisionContent——时序）
                          const confirmedGoal = goalDc?.statement ?? initialPrompt ?? '目标已确认'
                          confirm('goal')
                          tlog('card.resolved', { card: 'goal', action: 'confirm' }, 'system')
                          onGoalConfirmed?.(confirmedGoal)
                          void sendRef.current({ text: '确认，目标清楚了' })
                        }}
                        onReject={() => {
                          // A-006：拒绝带具体原因（不变量 8——「重新描述」= direction 调整）
                          reject('goal', { kind: 'direction' })
                          setRejectedCardIdx((p) => ({ ...p, goal: i }))
                          tlog(
                            'card.rejected',
                            { card: 'goal', action: 'reject', reason: 'direction' },
                            'system',
                          )
                          onGoalRejected?.()
                          void sendRef.current({ text: '目标需要重新描述一下' })
                        }}
                      />
                    ) : null}
                    {/* 触发：领域状态（dcKind==='plan'）或信号兜底（execFallback/execSignal——旧场景：方案征询文本/write 拦截；
                        拒绝后由 rejectedCardIdx 抑制（无快照卡）——结构化卡（dcKind）拒绝后经领域状态自然消失 */}
                    {(dcKind === 'plan' || execFallback || execSignal) &&
                    !!goalConfirmed &&
                    !planConfirmed &&
                    stateRef.current.pending !== 'none' &&
                    ((execSignal && i === lastSignalIdx.exec) ||
                      (lastSignalIdx.exec === -1 && isLastAssistant && !hasCandidates)) &&
                    (dcKind === 'plan' || i !== rejectedCardIdx.execution) ? (
                      <PlanConfirmCard
                        proposal={planDc}
                        onConfirm={() => {
                          confirm('plan')
                          planWasRejectedRef.current = false
                          planRejectNudgedRef.current = false
                          tlog(
                            'card.resolved',
                            { card: 'execution', action: 'confirm' },
                            'system',
                          )
                          onPlanConfirmed?.()
                          void sendRef.current({ text: '确认，按方案执行' })
                        }}
                        onReject={() => {
                          // S3：拒绝带原因（不变量 8——RejectKind；「修改方案」= scope 调整方向）
                          reject('plan', { kind: 'scope', target: 'plan' })
                          planWasRejectedRef.current = true
                          setRejectedCardIdx((p) => ({ ...p, execution: i }))
                          tlog(
                            'card.rejected',
                            { card: 'execution', action: 'reject', reason: 'scope' },
                            'system',
                          )
                          onPlanRejected?.()
                          void sendRef.current({ text: '方案需要调整一下' })
                        }}
                      />
                    ) : null}
                    {dcKind === 'resolution' &&
                    achievedMatch &&
                    stateRef.current.producedFiles.size > 0 &&
                    !stateRef.current.resolutionConfirmed &&
                    i === lastSignalIdx.achieve &&
                    i !== rejectedCardIdx.achievement ? (
                      <ResolutionConfirmCard
                        pendingQuestions={resolutionClaim?.evidence?.pendingQuestions ?? []}
                        onConfirm={() => {
                          confirm('resolution')
                          tlog(
                            'card.resolved',
                            { card: 'achievement', action: 'confirm' },
                            'system',
                          )
                          void sendRef.current({ text: '已解决，谢谢' })
                        }}
                        onReject={() => {
                          // A-006：拒绝带具体原因（不变量 8——「还要改」= scope 调整）
                          reject('resolution', { kind: 'scope' })
                          setRejectedCardIdx((p) => ({ ...p, achievement: i }))
                          tlog(
                            'card.rejected',
                            { card: 'achievement', action: 'reject', reason: 'scope' },
                            'system',
                          )
                          inputRef.current = '还要改一些地方：'
                        }}
                      />
                    ) : null}
                  </>
                )
              })()}
            {m.role === 'user' && (
              <span className="nf-msg__sent">
                <IconCheck size={11} /> 已发送
              </span>
            )}
            {m.reasoning && m.role === 'assistant' && m.status === 'done' && (
              // 2026-08-03 v33：标签「推理」→「思考过程」（非技术语言）+ 内容 Markdown 清洗 + .nf-reasoning 约束（160px 滚动——修长文本撑开）
              <details className="nf-msg__reasoning">
                <summary>
                  <IconBrain size={12} /> 思考过程
                </summary>
                <p className="nf-reasoning">{stripMarkdown(m.reasoning)}</p>
              </details>
            )}
            {/* 2026-08-08 O2：全 hidden（如 check-capability 能力齐备）→ 不渲染空容器；map 保留原始索引（key/revert 定位一致——hidden 卡返回 null） */}
            {m.toolCalls && m.toolCalls.some((c) => !c.hidden) && (
              <div className="nf-toolcalls">
                {/* 2026-08-04 授权架构 v4：批量授权条——一条消息多个待授权文件（fix bug 场景）→ 一次批准整批 + 记住 */}
                {m.toolCalls.filter((c) => c.status === 'need-approval').length > 1 && (
                  <div className="nf-toolcall__batch">
                    <span>
                      有 {m.toolCalls.filter((c) => c.status === 'need-approval').length}{' '}
                      个文件待批准
                    </span>
                    <button
                      type="button"
                      className="nf-toolcall__batch-approve"
                      onClick={() => approveAllRemember(m.toolCalls ?? [])}
                    >
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
                        {tc.status === 'done' ? (
                          <IconCheck size={11} />
                        ) : tc.status === 'need-approval' || tc.status === 'file-approval' ? (
                          <IconLock size={11} />
                        ) : tc.status === 'reverted' ? (
                          <IconRotateCcw size={11} />
                        ) : tc.status === 'error' ? (
                          <IconX size={11} />
                        ) : (
                          <IconClock size={11} />
                        )}
                      </span>
                      <span className="nf-toolcall__name">
                        <ToolIcon name={tc.name} size={12} /> {tc.name}
                      </span>
                      <span className="nf-toolcall__args">{fmtToolArgs(tc)}</span>
                      {tc.result && <span className="nf-toolcall__result">{tc.result}</span>}
                      {/* V1.5 S4（S3-Sp-3）：ask_user 选项按钮化——点选文本替代序号（输入框主通道不变——
                          打字与点选等价）；本消息之后出现用户消息 = 已回应 → 按钮转已回复态（同 candidates 语义） */}
                      {tc.name === 'ask_user' &&
                        tc.status === 'done' &&
                        Array.isArray(tc.args?.options) &&
                        (() => {
                          // A-019：共享 CandidateButtons（原 ask_user 内联按钮块——S4-St-1 去重）
                          const opts = (tc.args.options as CandidateOption[]).filter(
                            (o) => o && typeof o.label === 'string',
                          )
                          if (opts.length === 0) return null
                          const replied = messages.slice(i + 1).some((mm) => mm.role === 'user')
                          return (
                            <CandidateButtons
                              options={opts}
                              replied={replied}
                              onPick={(label) => {
                                inputRef.current = label
                                void sendRef.current()
                              }}
                            />
                          )
                        })()}
                      {/* 2026-08-05 体验反馈：详细输出折叠（默认不展示代码——需要时展开查看） */}
                      {tc.status === 'done' && tc.rawResult && (
                        <details className="nf-toolcall__detail">
                          <summary>查看详情</summary>
                          <pre className="nf-toolcall__detail-pre">
                            {tc.rawResult.slice(0, 1500)}
                          </pre>
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
                          <span className="nf-toolcall__approve-hint">
                            本次任务计划修改 {((tc.args.files ?? []) as unknown[]).length}{' '}
                            个文件——批准后自动放行，不再逐个问
                          </span>
                          {typeof tc.args.summary === 'string' && (
                            <span className="nf-toolcall__note">{tc.args.summary}</span>
                          )}
                          <div className="nf-plan__files">
                            {(
                              (tc.args.files ?? []) as Array<{ path?: string; reason?: string }>
                            ).map((f, fi) => (
                              <div key={fi} className="nf-plan__file">
                                <span className="nf-plan__path">{f.path ?? ''}</span>
                                <span className="nf-plan__reason">{f.reason ?? ''}</span>
                              </div>
                            ))}
                          </div>
                          <div className="nf-toolcall__actions">
                            <button
                              type="button"
                              className="nf-toolcall__approve"
                              onClick={() => approvePlan(m.toolCalls ?? [], i, tc)}
                            >
                              批准这批文件
                            </button>
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
                      {goalConfirmed && tc.status === 'need-approval' && (
                        <>
                          {/* 2026-08-04 体验修复：醒目标题——用户不知道「先写文件」后要批准（等授权无提示的根因） */}
                          <span className="nf-toolcall__approve-hint">
                            需要你批准——点「允许执行」继续
                          </span>
                          <span className="nf-toolcall__hint">{hint.level}</span>
                          {hint.impact && (
                            <span className="nf-toolcall__impact">→ {hint.impact}</span>
                          )}
                          {hint.note && <span className="nf-toolcall__note">{hint.note}</span>}
                          {/* 2026-08-04 授权架构重构（用户授权疲劳→机械批准）：授权卡展示改动内容——用户看清再批（恢复授权意义） */}
                          {tc.name === 'write' && typeof tc.args.content === 'string' && (
                            <pre className="nf-toolcall__preview" dir="ltr">
                              {'将写入：' + String(tc.args.path ?? '') + '\n'}
                              {tc.args.content.slice(0, 300)}
                              {tc.args.content.length > 300 ? '…' : ''}
                            </pre>
                          )}
                          {/* #6 真机 2026-08-30（P2-7）：原读 filePath/oldText/newText——edit 实际参数是
                              path/old/new → diff 渲染全空（用户闭眼批——审批卡意义失效） */}
                          {tc.name === 'edit' && (
                            <pre className="nf-toolcall__preview" dir="ltr">
                              {'将修改 ' +
                                String(tc.args.path ?? tc.args.filePath ?? '') +
                                '\n- ' +
                                String(tc.args.old ?? tc.args.oldText ?? '').slice(0, 200) +
                                '\n+ ' +
                                String(tc.args.new ?? tc.args.newText ?? '').slice(0, 200)}
                            </pre>
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
                        <button
                          type="button"
                          className="nf-toolcall__stop"
                          onClick={() => stopToolCall(m.toolCalls ?? [], i)}
                        >
                          <IconSquare size={12} /> 停止
                        </button>
                      )}
                    </div>
                  )
                })}
                {/* ticket 14 疲劳防护：同批 ≥2 低危文件操作待授权 → 合并授权（bash 高危永不合并——canMergeApprove 已保证） */}
                {canMergeApprove(
                  (m.toolCalls ?? []).filter((c) => c.status === 'need-approval'),
                ) && (
                  <button
                    type="button"
                    className="nf-toolcall__approveall"
                    onClick={() => approveAllToolCalls(m.toolCalls ?? [])}
                  >
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
          <button type="button" className="nf-trustbar__clear" onClick={clearTrust}>
            清除
          </button>
        </div>
      )}
      {/* ADR-010：强制澄清卡——无进展对话二级介入（系统触发不经模型；悬浮输入框上方，不物理锁定输入） */}
      {stateRef.current.pending === 'system_clarify' &&
        (() => {
          void stateVersion
          const fdc = stateRef.current.decisionContent
          const prop = fdc?.proposal as { underlying?: string; statement?: string } | undefined
          if (!prop) return null
          const lastAssistant = [...messagesRef.current]
            .reverse()
            .find((m) => m.role === 'assistant')
          return (
            <div className="nf-forcedcard" role="alertdialog" aria-label="需要你做出选择">
              <div className="nf-forcedcard__head">
                对话出现循环——请直接选择（文字回复不能替代确认）
              </div>
              <div className="nf-forcedcard__body">{prop.statement}</div>
              <div className="nf-forcedcard__actions">
                <button
                  type="button"
                  className="nf-forcedcard__btn nf-forcedcard__btn--ok"
                  onClick={() => {
                    // UAT 二轮真机（2026-09-07）：强制卡确认后必须续转——仅 confirm 不 send 会让
                    // 流程停滞（用户点完卡无反馈，模型回合不再触发）。按 underlying 对齐普通卡续转。
                    confirm('system_clarify')
                    tlog('card.resolved', { card: 'system_clarify', action: 'confirm' }, 'system')
                    const u = prop?.underlying
                    const confirmText =
                      u === 'goal'
                        ? '确认，目标清楚了'
                        : u === 'plan'
                          ? '确认，按方案执行'
                          : '确认，继续'
                    if (u === 'goal') onGoalConfirmed?.(prop?.statement ?? '目标已确认')
                    else if (u === 'plan') {
                      planWasRejectedRef.current = false
                      planRejectNudgedRef.current = false
                      onPlanConfirmed?.()
                    }
                    void sendRef.current({ text: confirmText })
                  }}
                >
                  确认执行
                </button>
                <button
                  type="button"
                  className="nf-forcedcard__btn"
                  onClick={() => {
                    // 拒绝委派 underlying + 续转引导（A-026 同源——拒绝后模型必须收到反馈并重提议）；
                    // 点卡 = 明确新一轮协商 → rejectStreak 重置（打字拒绝不重置——C2 循环形态）
                    reject('system_clarify', { kind: 'direction' })
                    resetRejectStreak()
                    if (prop?.underlying === 'plan') planWasRejectedRef.current = true
                    tlog(
                      'card.rejected',
                      { card: 'system_clarify', action: 'reject', reason: 'direction' },
                      'system',
                    )
                    void sendRef.current({
                      text: prop?.underlying === 'plan' ? '方案需要调整' : '目标需要重新描述一下',
                    })
                  }}
                >
                  我要重新描述
                </button>
                <button
                  type="button"
                  className="nf-forcedcard__btn"
                  onClick={() => {
                    confirm('system_clarify')
                    tlog('card.resolved', { card: 'system_clarify', action: 'confirm' }, 'system')
                    if (lastAssistant?.toolCalls?.length)
                      approveAllToolCalls(lastAssistant.toolCalls)
                    const u = prop?.underlying
                    const confirmText =
                      u === 'goal'
                        ? '确认，目标清楚了'
                        : u === 'plan'
                          ? '确认，按方案执行'
                          : '确认，继续'
                    if (u === 'goal') onGoalConfirmed?.(prop?.statement ?? '目标已确认')
                    else if (u === 'plan') {
                      planWasRejectedRef.current = false
                      planRejectNudgedRef.current = false
                      onPlanConfirmed?.()
                    }
                    void sendRef.current({ text: confirmText })
                  }}
                >
                  由搭档全权决定
                </button>
              </div>
            </div>
          )
        })()}
      <ConversationComposer
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        textareaRef={textareaRef}
        currentFile={currentFile}
        availableFiles={
          recentFilesExternal && recentFilesExternal.length > 0
            ? recentFilesExternal
            : (getDemoBridge()?.recentFiles ?? [])
        }
        working={working}
        pending={stateRef.current.pending}
        onSend={() => void send()}
        onStop={() => void stopGeneration()}
      />
    </div>
  )
}
