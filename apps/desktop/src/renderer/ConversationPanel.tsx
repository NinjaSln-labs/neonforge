import { useEffect, useRef, useState } from 'react'
import DeliveryFlowPanel from './DeliveryFlowPanel'
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
import { evaluateTurnProgress, detectStuck, initialStuckState, isQuestionLike, isCommunicationLike, isDoneLike } from './domain/agentLoop'
// 2026-08-07 DDD 落地（坑 89 forceTool/advanceChat 领域化——Conversation BC 轮次执行保障 + AgentChain BC 产品阶段流转）
import { decideTurnPolicy, type TurnKind } from './domain/turnPolicy'
import { stageByIndex, buildAdvanceInstruction, type ProductStageName } from './domain/stageFlow'
// 2026-08-05 方案 3：结构化候选按钮——<candidates> 块解析/剥离（点选文本替代序号，消除模型序号解析漂移）
import { parseCandidates, stripCandidates, stripTags } from './candidates'
// 2026-08-03 视觉审计 P1-6：内联 SVG 图标（替换 emoji 图标）
import {
  IconBrain, IconCheck, IconClock, IconDot, IconFile,
  IconLock, IconRotateCcw, IconShield, IconSquare, IconX, ToolIcon
} from './icons'
// 2026-08-04 启动页方案 A：场景卡数据共享（启动页 + 对话空态共用）
import { SCENES } from './scenes'
// 2026-08-07 T1（regex-todo）：聊天错误分类纯函数——原 includes('5') 过宽（token-limit-50/5000/x5x 误归 service）
import { classifyChatError } from './errorClassify'

// ticket 04：对话最小闭环（D0 §2/§3.4）——输入发送 → Gateway 流式 → 消息/呼吸光条/推理展示
// 消费 02：streamChat（四档 basic）+ ModelRouter（默认 Flash）；错误分支：Key 失效内嵌更新 / 服务故障提示

export interface ToolCallMsg {
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'done' | 'need-approval' | 'plan-approval' | 'error' | 'reverted'
  result?: string
  rawResult?: string // 2026-08-05：API 回填用完整结果（UI 展示用 result 摘要）——read 完整内容防模型反复读同文件
  file?: string       // write/edit 成功写入的文件路径（回滚目标）
  canRevert?: boolean // 写前已快照——可回滚
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  status: 'streaming' | 'done' | 'error'
  error?: string
  toolCalls?: ToolCallMsg[]
}

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
    case 'plan_approval': return `规划 ${((a.files ?? []) as unknown[]).length} 个文件`
    // 2026-08-06 用户反馈「get_diagnostics 具体干什么了不知道」：LSP 工具名技术化 → 人类化描述（工具卡显示）
    case 'get_diagnostics': return a.path ? `检查代码错误：${String(a.path)}` : '检查代码错误'
    case 'get_imports': return a.path ? `查看文件依赖：${String(a.path)}` : '查看文件依赖'
    case 'find_definition': return a.path ? `定位定义：${String(a.symbol ?? a.path)}` : '定位代码定义'
    case 'find_references': return a.path ? `查找引用：${String(a.symbol ?? a.path)}` : '查找代码引用'
    case 'get_type_info': return a.path ? `查看类型：${String(a.symbol ?? a.path)}` : '查看类型信息'
    case 'get_call_chain': return a.path ? `查看代码结构：${String(a.path)}` : '查看代码结构'
    case 'open': return a.url ? `打开网页：${String(a.url)}` : '打开网页'
    // 2026-08-06 设计层升级：服务工具人类化
    case 'check-env': return a.dir ? `检测环境：${String(a.dir)}` : '检测项目环境'
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
  onAdvanceHint,
  externalRequest,
  onExternalConsumed,
  onToolResult,
  onUserMessage,
  onRequirementConfirmed,
  requirementConfirmed,
  recentFilesExternal,
  stageHint,
  flowStage,
  stageAdvance,
  activeAuthorizedLogs,
  initialPrompt
}: {
  rootPath?: string | null
  currentFile?: string | null // 08 快捷键 Cmd+E：当前选中文件（@引用——D0 §6）
  onKeyExpired: () => void
  onReasoning?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
  onApprovalChange?: (pending: boolean) => void // 2026-08-04 审计修复（D2）：有待批准工具操作时上报（状态栏提示——键盘用户感知）
  onActionPromiseHint?: (hint: string | null) => void // 2026-08-05 用户反馈 2：isActionPromise 提示不插入对话流（污染阅读）——状态栏非侵入提示
  onAdvanceHint?: (hint: boolean) => void // 2026-08-06 阶段推进设计层：模型输出「确认推进」→ 推进按钮高亮（用户注意到该点了）
  externalRequest?: string | null
  onExternalConsumed?: () => void
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  onUserMessage?: (text: string) => void
  // 2026-08-04：需求确认回写——模型输出【需求确认：xxx】→ 上报 MainWorkspace（更新台账标题/快照 + 项目 README）
  onRequirementConfirmed?: (title: string) => void
  requirementConfirmed?: boolean // 2026-08-06 需求阶段门控：用户确认（MainWorkspace state）→ 同步 ref——确认后 B 类直接执行（write/edit/bash 放行）
  recentFilesExternal?: string[]
  stageHint?: string // 0-1 交付阶段指引（ticket 07——注入对话引导模型按阶段产出）
  flowStage?: number // 2026-08-05：当前阶段序号（plan_approval 阶段门控——设计阶段未确认不弹规划授权卡）
  // 2026-08-04：阶段推进反馈——用户点「确认推进」后对话区出现「已进入【X】阶段」提示（本地生成，确定性无杂音；顺带作为上下文让模型知道阶段切换）
  // 2026-08-04 方案 A：requirement 可选——需求卡确认摘要（注入对话上下文，模型按确认结果工作）
  stageAdvance?: { seq: number; stage: string; hint: string; requirement?: string } | null
  // 2026-08-04 体验修复：启动页首句 → 进入工作区自动发送（说了就直接开始；输入框不预填）
  initialPrompt?: string
  activeAuthorizedLogs?: string[] // 06/14 授权记录可回溯：当前问题快照 authorized（TrustLadder 展示）
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const messagesRef = useRef<Msg[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  // 2026-08-04 审计修复（D2）：有待批准工具操作 → 上报状态栏提示（need-approval 出现/消失）
  useEffect(() => {
    onApprovalChange?.(messages.some((m) => m.toolCalls?.some((c) => c.status === 'need-approval')) ?? false)
  }, [messages, onApprovalChange])
  // 断点续做（ticket 06/基线 §21）：挂载恢复上次会话（onNew 已 clearSession → 空）
  useEffect(() => {
    const stored = loadSession()
    if (stored && stored.length > 0) {
      setMessages(stored.map((s) => ({
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
  // 2026-08-06 任务完成度（deepcode unimplemented_files 借鉴）：plan_approval 规划文件清单 + write/edit 产出文件（approvePlan 时保存/重置）
  const plannedFilesRef = useRef<Set<string>>(new Set())
  const producedFilesRef = useRef<Set<string>>(new Set())
  // 2026-08-05：renderer 侧「已规划」标记——approvePlan 置 true（幂等：本任务内再调 plan_approval 不弹卡）；阶段推进（clearTrust）重置
  const planApprovedRef = useRef(false)
  const requirementConfirmedRef = useRef(false) // 2026-08-06 需求阶段门控：模型输出【需求确认】→ true（B 类确认后 write/edit/bash 放行——直接执行）
  useEffect(() => { if (requirementConfirmed) requirementConfirmedRef.current = true }, [requirementConfirmed]) // 用户确认（MainWorkspace state）→ 同步
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
  // 2026-08-04：阶段推进反馈——用户点「确认推进」→ 对话区追加本地阶段提示（确定性无杂音；作为历史上下文模型也知道阶段切换）
  // + 自动触发搭档按新阶段工作（advanceChat——流程真正走完）
  const handledStageRef = useRef(0)
  // 2026-08-04 授权架构 v4：任务边界 = 阶段推进（确认推进 = 新任务）——清除任务级信任（授权自动收回）
  useEffect(() => { clearTrust() }, [stageAdvance?.seq])
  useEffect(() => {
    if (!stageAdvance || stageAdvance.seq === handledStageRef.current) return
    handledStageRef.current = stageAdvance.seq
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `已进入【${stageAdvance.stage}】阶段\n${stageAdvance.hint}\n（在对话里告诉搭档你的想法，搭档会继续推进）`,
      status: 'done'
    }])
    void advanceChatRef.current(stageAdvance.stage, stageAdvance.hint, stageAdvance.requirement)
  }, [stageAdvance])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  // 2026-08-04 审计修复（A2）：浮层方向键高亮索引（-1=未高亮）——listbox 键盘语义落地（原仅 Tab 可达，Arrow 无反应）
  const [mentionActive, setMentionActive] = useState(-1)
  const demoFiles = (recentFilesExternal && recentFilesExternal.length > 0)
    ? recentFilesExternal
    : (window.neonforge as unknown as { demo?: { recentFiles?: string[] } }).demo?.recentFiles ?? []
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
  const streamingRef = useRef<{ content: string; toolCalls: ToolCallMsg[] }>({ content: '', toolCalls: [] })
  // 2026-08-07 DDD 落地（坑 89）：当前轮次类型——send=user-turn / advanceChat=advance-turn / maybeContinue=tool-loop；
  // forceTool 决策改由领域层 TurnExecutionPolicy 推导（区分「用户指令轮」与「阶段推进轮」——设计阶段推进不强制工具）
  const turnKindRef = useRef<TurnKind>('user-turn')
  const applyChunk = (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => {
    console.log('[conv] chunk', chunk.type)
    // 2026-08-05 用户反馈 2：模型有新动作（chunk）→ 清除 isActionPromise 状态栏提示（模型在动——之前只是陈述/即将调工具）
    if (chunk.type === 'content' || chunk.type === 'tool-call') onActionPromiseHint?.(null)
    // 事件层累积（每事件一次——双调安全）
    if (chunk.type === 'content') {
      streamingRef.current.content += chunk.text ?? ''
      // 2026-08-06 需求确认提前检测（不等 done——工具调用可能在 done 前）：【需求确认】标记 → 门控放行（B 类确认后直接执行）
      if (streamingRef.current.content.includes('【需求确认')) requirementConfirmedRef.current = true
    }
    if (chunk.type === 'tool-call' && chunk.toolCall) {
      streamingRef.current.toolCalls.push({ name: chunk.toolCall.name, args: chunk.toolCall.args, status: 'pending' })
    }
    if (chunk.type === 'done') {
      // 副作用移出 updater：需求确认回写 + 对话日志（updater 双调会重复记录）
      const content = streamingRef.current.content
      const confirm = content?.match(/【需求确认[:：]\s*([^】]+)/)
      if (confirm?.[1]) onRequirementConfirmed?.(confirm[1].trim())
      window.neonforge.chatLog?.log?.({
        ts: new Date().toISOString(),
        role: 'assistant',
        content,
        toolCalls: streamingRef.current.toolCalls.map((t) => ({ name: t.name, status: t.status }))
      })
      // 2026-08-06 阶段推进设计层（用户反馈「测试阶段不会自动或提示进入部署」）：模型输出「确认推进」→ 推进按钮高亮（用户注意到该点了）
      // 2026-08-06 修正（用户「需求确认后点推进按钮但没看到高亮」）：需求阶段模型输出【需求确认】后常不说「点确认推进」（违反规则⑤）→ 高亮不触发；
      // 需求确认 = 该推进了 → 【需求确认】标记同样触发高亮（不依赖模型措辞）
      if (/确认推进|【需求确认/.test(content)) { onAdvanceHint?.(true); requirementConfirmedRef.current = true }
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
      if ((flowStage ?? 0) >= 1) {
        // 2026-08-06 任务完成度：write/edit 成功标记产出（plan_approval 规划文件 vs 已产出——deepcode unimplemented_files 借鉴）
        streamingRef.current.toolCalls.forEach((c) => {
          if ((c.name === 'write' || c.name === 'edit') && c.status === 'done' && c.file) producedFilesRef.current.add(c.file)
        })
        const turn = evaluateTurnProgress({
          toolCalls: streamingRef.current.toolCalls.map((c) => ({ name: c.name, status: c.status, file: c.file })),
          content,
          prevReadFiles: prevReadFilesRef.current,
          plannedFiles: plannedFilesRef.current,
          producedFiles: producedFilesRef.current,
          // 2026-08-06 补充（用户「清单来源不只 plan_approval」——③ projectFiles 项目文件树）：产出校验（规划文件出现在文件树=已产出）
          projectFiles: new Set(recentFilesExternal ?? [])
        })
        streamingRef.current.toolCalls.forEach((c) => { if (c.name === 'read' && c.file) prevReadFilesRef.current.add(c.file) })
        const { state, event } = detectStuck({ turn, prev: stuckStateRef.current })
        stuckStateRef.current = state
        if (event?.type === 'escalate') {
          onActionPromiseHint?.(null)
          inputRef.current = event.message
          void sendRef.current?.({ silent: true })
        } else if (event?.type === 'needs-human') {
          onActionPromiseHint?.(event.message)
        }
      }
      streamingRef.current = { content: '', toolCalls: [] }
    }
    setMessages((prev) => {
      // 纯 UI 更新（无副作用——StrictMode 双调安全）
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
        onReasoning?.(next.reasoning)
        setWorkingStage('思考中…')
      }
      if (chunk.type === 'content') {
        next.content = next.content + (chunk.text ?? '')
        setWorkingStage('生成回复…')
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
        // 2026-08-04 规划级授权：plan_approval 不执行（虚拟工具）——状态 plan-approval 弹规划授权卡（等用户批准文件清单）
        // 2026-08-05 体验反馈（用户实测「规划授权出来两次」+「设计阶段没找我确认」）：① 幂等——本任务已批准过不再弹卡 ② 阶段门控——设计阶段（flowStage<2 设计未确认）不弹卡，模型误调无害
        let status: 'pending' | 'done' | 'plan-approval' = 'pending'
        if (chunk.toolCall.name === 'plan_approval') {
          status = (planApprovedRef.current || (flowStage ?? 0) < 2) ? 'done' : 'plan-approval'
        }
        next.toolCalls = [...(next.toolCalls ?? []), {
          name: chunk.toolCall.name,
          args: chunk.toolCall.args,
          status,
          result: status === 'done' && chunk.toolCall.name === 'plan_approval'
            ? (planApprovedRef.current ? '规划已批准（本任务不重复授权）' : '设计确认后进入开发阶段再规划')
            : undefined
        }]
      }
      return [...prev.slice(0, target), next, ...prev.slice(target + 1)]
    })
    // 工具执行副作用（移出 updater——StrictMode 双调会执行两次；真实工具写文件等不可重复）
    // 2026-08-04 规划级授权：plan_approval 跳过执行（虚拟工具——批准由 renderer approvePlan 处理）
    if (chunk.type === 'tool-call' && chunk.toolCall && chunk.toolCall.name !== 'plan_approval') {
      const tc = chunk.toolCall
      // 2026-08-06 用户反馈「第一句话就有一个工具执行」：需求阶段（flowStage=0）工具门控——需求未确认前不执行任何工具
      // （需求都没澄清，看目录/写文件都没意义）；工具直接 done + 提示（maybeContinue 回填给模型 → 模型停止调工具继续澄清需求）
      // 严格 flowStage === 0（undefined=演示/测试通道不拦截——demo 场景工具需正常执行）
      if (flowStage === 0 && tc.name === 'bash' && initialPrompt && !requirementConfirmedRef.current) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? { ...c, status: 'done' as const, result: '需求确认前先不执行命令——先把需求问清楚（进入设计/开发阶段再动手）' }
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      // 2026-08-06 设计阶段 write/edit 门控（真实 API 实测：模型设计阶段调 edit → 弹授权卡卡住——设计阶段不改文件，机制拦截非弹卡）
      // 2026-08-07 质量把关 P1 修复：advance-turn（阶段推进轮）不拦——advanceChat 触发时 applyChunk 闭包 flowStage 滞后（推进到开发仍显示设计），
      // 推进轮的 write 按授权流走（弹卡用户可批/拒）；仅模型主动（user-turn/tool-loop）设计阶段改文件才拦（坑 48 语义——L3 440 暴露）
      if (flowStage === 1 && (tc.name === 'write' || tc.name === 'edit') && turnKindRef.current !== 'advance-turn') {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? { ...c, status: 'done' as const, result: '设计阶段不改文件——先把方案说完整让用户确认（进入开发阶段再动手写/改）' }
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      // 2026-08-06 需求阶段门控（用户「需求阶段不是不会实际动手吗」——需求未确认不改文件；【需求确认】输出 → requirementConfirmedRef 放行——B 类确认后直接执行）
      // 2026-08-07 质量把关 P1 修复：补 initialPrompt 条件（对齐坑 71 bash 门控）——只拦 0-1 流程；
      // 打开已有项目（非 0-1，initialPrompt 空）用户明确要求写文件 → 弹授权卡让用户决定（c57d987 引入时漏条件——L5 write 卡测试失败暴露）
      // + advance-turn 排除（推进轮不拦——flowStage 闭包滞后同设计门控）
      if (flowStage === 0 && (tc.name === 'write' || tc.name === 'edit') && initialPrompt && turnKindRef.current !== 'advance-turn' && !requirementConfirmedRef.current) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? { ...c, status: 'done' as const, result: '需求阶段不改文件——先输出【需求确认：…】【任务类型：A/B】让用户确认，确认后再动手' }
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
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
      // 2026-08-06 偏离清单拦截（基于事实：06:03 已规划但写「正确路径」偏离批准清单 → 逐个弹授权/规划外文件——用户「相同文件弹授权」根因）：
      // 已规划（planApprovedRef）但文件不在批准清单 → 不弹逐个卡——拒绝 + 引导补充 plan_approval（清单与实际始终一致）
      if (tc.name === 'write' && planApprovedRef.current && !plannedFilesRef.current.has(trustPath(tc.args.path))) { // 2026-08-06 edit 豁免（改现有文件=操作明确——B 类文件操作直接改）；write 新建强制规划
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => c.name === tc.name && c.status === 'pending'
            ? { ...c, status: 'done' as const, result: '文件不在批准清单（批准后写清单外文件会逐个弹授权）——先调 plan_approval 工具补充这个文件（列出新增/修改文件 + 原因），用户批准后再写' }
            : c)
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      const autoApproved = (delegateLowRisk && toolRisk(tc.name) === 'low') || isTrusted(tc.args)
      void (window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: autoApproved, rootPath: rootPath ?? undefined }) ?? Promise.resolve({ ok: false, error: 'tools 通道未就绪' })).then((r) => {
        const data = r.data as { file?: string; snapshot?: boolean } | undefined
        // 13 交付包联动：真实文件操作成功（write/edit 返回 file）→ 上报变更（产物区展示）
        if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) => {
            if (c.name !== tc.name || c.status !== 'pending') return c
            return r.ok
              ? (() => {
                  // 2026-08-06 修正重写可见性（用户「第二次 write 很快不知道发生了什么——只需知道第二次是 fix bug」）：
                  // write 且该文件之前已写过（producedFilesRef 已有）→ 卡上标记「修正重写」——用户看到第二次是修正不是重复
                  const isRewrite = tc.name === 'write' && !!data?.file && producedFilesRef.current.has(data.file)
                  return { ...c, status: 'done' as const, result: (isRewrite ? '⚠️ 修正重写——' : '') + fmtToolResult(r), rawResult: typeof r.data === 'string' ? r.data.slice(0, 16000) : JSON.stringify(r.data ?? '').slice(0, 16000), file: data?.file, canRevert: !!(data?.file && data.snapshot) }
                })()
              : { ...c, status: (r.error ?? '').includes('授权') ? ('need-approval' as const) : ('error' as const), result: r.error }
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
      const needsApproval = lastMsg.toolCalls.some((c) => c.status === 'need-approval' || c.status === 'plan-approval')
      if (needsApproval) { releaseWorking(); return } // 有待授权——等用户点允许（approveToolCall 后触发续聊）
      if (pending.length === 0) {
        // 2026-08-04 重构：同工具重复检测（同一 name+args 连续 3 次 = 死循环——防模型空转不产出；跨调用累积——原局部变量每轮重置失效）
        // 2026-08-05 体验反馈：只统计写工具（write/edit）——read/bash 只读重复是模型合理排查（曾因 read 摘要化反复读同文件被误伤），不触发；真正空转由 depth 40 兜底
        const writeCalls = lastMsg.toolCalls.filter((c) => c.name === 'write' || c.name === 'edit')
        if (writeCalls.length > 0) {
          const sig = writeCalls.map((c) => `${c.name}:${JSON.stringify(c.args ?? {})}`).join('|')
          const chain = chainRepeatRef.current
          if (chain.sid !== sid) { chain.sid = sid; chain.sig = ''; chain.count = 0 }
          chain.count = sig === chain.sig ? chain.count + 1 : 1
          chain.sig = sig
          if (chain.count >= 3) {
            console.log('[conversation] 工具循环疑似死循环（重复写文件 3 次）——停止续聊')
            // 2026-08-04 体验修复：停止时提示用户（原静默停——用户看到「卡住」不知道原因；提示后可继续）
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: '搭档检测到在重复写同一个文件（已自动暂停，避免死循环）。你回复「继续」或告诉它下一步，它就会接着做。',
              status: 'done'
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
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    await new Promise((r) => setTimeout(r, 50))
    turnKindRef.current = 'tool-loop' // 2026-08-07 坑 89：工具循环轮——forceTool=auto（StuckDetector 兜底）
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
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
    const langRule = lastUserMsg && /[\u4e00-\u9fff]/.test(String(lastUserMsg.content ?? ''))
      ? '⑧ 用中文回复用户（避免英文夹杂；工具名/代码/技术名词可保留原文；**即使工具结果/代码是英文，回复用户也保持中文**——不要中途切换成英文）'
      : '⑧ 用与用户消息相同的语言回复'
    const sysHint = { role: 'system', content: `你是 NeonForge 搭档。当前项目根目录：${rootPath ?? '(未指定)'}。规则：① 读文件用 read 工具（路径用项目根下的相对路径，如 package.json）② 不要用 bash find 全局搜索（直接 read 目标文件）③ 工具一次调用一个，执行完看结果再决定 ④ 找不到文件就直接告诉用户 ⑤ 查符号定义/引用/类型用 LSP 工具：find_definition/find_references/get_type_info（传 path + symbol，如 {path: 'src/a.ts', symbol: 'greet'}）⑥ 查文件错误/import 用 get_diagnostics/get_imports ⑦（2026-08-05 定位优先——竞品 grep-first 共识）排查/修复问题时**必须先用 search 或 LSP 定位到具体文件和行号，再 read 目标文件——禁止盲读文件试探**（盲读浪费轮次）；search 传 query 关键词（如 "射线" "命中"）返回命中文件+行号+片段；不要反复 read 不同文件碰运气。${langRule}⑨ 用户可能不懂技术——回答简洁口语化：优先短句，少用术语；必须提术语时用一句大白话解释；不要堆砌要点清单。⑩ 回复正文不要用 Markdown 标记（不要 #、**、反引号、- 列表、代码块框）；少用括号补充说明；段落之间最多空一行，不要连续空行；**也不要使用任何尖括号标签**（如 <one-question>——会原样显示给用户；除 <candidates> 候选块外）。⑪（2026-08-04 防文本模拟）执行工具必须通过真正的函数调用（tool-call）发出——对话历史里的「（工具调用：…）」只是执行记录，绝不能模仿成文本写在回复正文里，文本写的调用不会被执行；要调工具就在这条回复里发出真实函数调用，工具执行完会自动继续。⑫（2026-08-05 说了就做——用户催「打开」6 次教训）用户明确要求执行某个操作（如「帮我打开」「起服务」「继续」「做 X」）：**必须立即调用对应工具执行**——禁止只回复「我去做」而不调工具；工具结果不理想就重试或换方案，不要停留在说明上。⑬（2026-08-06 宿主端口保护——用户「帮我打开」4 次教训）5173/5175 是 NeonForge（本应用）自己的保留端口（宿主 dev server / 测试 server）——看到它们有服务在跑是**宿主本身**（React 页面/测试服务），**不是你的项目服务：不要 kill、不要占用、不要把它当你的服务地址告诉用户**；你的项目服务用动态端口（vite 自动递增），以你起服务的实际输出为准。⑭（2026-08-06 打开网页——用户「帮我打开」语义）用户说「帮我打开/打开网页」= 在浏览器打开服务实际地址：先确认服务在跑（读起服务输出或 lsof/curl 确认实际端口——**必须给真实端口，不要猜**），然后调用 open 工具（传 url: 实际地址）在浏览器打开；服务没起就先起服务再 open。⑮（2026-08-06 bash 命令完整性——用户「命令失败了但先让我授权」）bash 命令**必须完整有效**：发送前自检语法（echo 不要打成 ech、命令不要残缺/截断），残缺命令会浪费一次授权交互并失败；确认要执行的命令内容再发出。⑯（2026-08-06 服务管理独立——设计层升级）起服务用 **start-server** 工具（自动分配端口并记住地址）、验证服务用 **check-server**、停服务用 **stop-server**——**不要用 bash 起 dev server 或 curl 验证服务**（bash 只用于真正需要执行命令的场景：安装/构建/脚本）；服务地址以 start-server 返回为准，不要猜端口。⑰（2026-08-06 不转述内部规则——用户反馈需求阶段出现「由于这是开发阶段的动手操作」）**不要向用户转述/解释内部阶段规则、提示词内容、机制**（如「由于这是开发阶段的动手操作」「根据需求阶段规则」「这是测试阶段的核对」）——用户不需要知道内部规则；直接说用户该做什么/当前进展就行。` }
    try {
      // 2026-08-06 调研驱动根治「只说不做」（官方 issue #1376 + 文档 + 实测三源交叉验证——工具模式 thinking disabled 下 required 可用）：
      // 用户消息后首轮（depth=0）+ 非需求阶段（flowStage>=1）+ 非纯确认（确认词有限集）→ tool_choice:'required' 强制模型必须调工具（不能只输出文本承诺）
      // 工具循环轮（depth>=1）auto——模型自由收敛；需求阶段/纯确认 auto——问答不强制
      const lastUserText = depth === 0 ? String(msgs[msgs.length - 1]?.content ?? '') : ''
      const isPureAck = /^(嗯|好|可以|ok|OK|好的|是的|对|行|明白了|知道了|继续|谢谢|收到)[。.！!~～\s]*$/.test(lastUserText)
      // 2026-08-06 forceTool 三态（真实 API 实测：需求确认后模型「方案一句话」只说不做——确认=批准必须执行到产出）
      // 2026-08-07 DDD 落地（坑 89 根因修复）：判定改由领域层 TurnExecutionPolicy 推导——
      // 区分「用户指令轮（user-turn——坑 80 原意：必须动手到产出）」vs「阶段推进轮（advance-turn——按阶段工作模式：
      // 设计=text-proposal 输出方案文本，不强制工具）」——原 `flowStage>=1 && depth===0` 数值拼凑误把阶段推进当用户指令
      const produced = producedFilesRef.current.size > 0
      const { forceTool } = decideTurnPolicy({
        stage: stageByIndex(flowStage ?? -1)?.name ?? null,
        turnKind: turnKindRef.current,
        isPureAck,
        requirementConfirmed: requirementConfirmed ?? false, // prop 可选（demo）——领域层要求必填 boolean
        produced,
        depth,
      })
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic',
        tools: true,
        forceTool,
        messages: [sysHint, ...msgs]
      })
      if (!res.ok) { finishError(res.error ?? 'gateway-error'); return }
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
        if (m.role === 'assistant' && !m.content && m.toolCalls && m.toolCalls.length > 0) {
          const calls = m.toolCalls.map((c, i) => ({
            id: `h${callSeq + i}`,
            name: c.name,
            args: c.args,
            result: c.rawResult ?? c.result ?? c.status ?? '执行失败'
          }))
          callSeq += calls.length
          return [
            { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
            ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: String(c.result).slice(0, 300) }))
          ]
        }
        return [{ role: m.role, content: m.content }]
      })
  }
  const workingRef = useRef(false)
  useEffect(() => { workingRef.current = working }, [working])
  // 2026-08-04 体验修复：流式 done 通知——runChat 尾部等 done（working 及时释放，用户快速「确认推进」不被拦）
  const doneNotifierRef = useRef<(() => void) | null>(null)
  // 2026-08-04 体验修复：阶段推进排队——working 时 advanceChat 不直接跳过（告知丢失：UI 进设计但模型不知道）
  // 存 pending，流式/工具链结束（send/advanceChat finally）后自动补发
  const pendingAdvanceRef = useRef<{ stage: string; hint: string; requirement?: string } | null>(null)
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
    // 2026-08-05：阶段推进 = 任务边界——plan_approval 幂等标记同步重置（新阶段需重新规划授权）
    planApprovedRef.current = false
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
  // 停止后旧流 chunk / maybeContinue 续聊 / pendingAdvance 全部失效（sessionRef++ 隔离）；用户可继续输入新指令
  const stopGeneration = async () => {
    sessionRef.current++ // 旧会话失效——旧流 chunk（streamingSidRef 检查）、maybeContinue 续聊（sessionRef 检查）、pendingAdvance 全失效
    streamingSidRef.current = sessionRef.current
    pendingAdvanceRef.current = null
    onActionPromiseHint?.(null)
    try { await window.neonforge.tools.cancel?.() } catch { /* 无活动命令 */ }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('已停止')
  }

  // 2026-08-06 只说不做第 5 次升级（用户反馈「最后又卡住了」）：send 支持 silent（自动续聊用——不显示/不记录用户消息，避免用户看到「自己发的」困惑）
  const send = async (opts?: { silent?: boolean }) => {
    const text = inputRef.current.trim()
    if (!text) return
    // 2026-08-05 用户反馈 3（处理中可发送）+ 反馈 4（无打断能力）：处理中发送 = 打断当前 + 新指令优先
    // （竞品共识：Claude Code Esc+新输入 / Devin 中断保留状态恢复——不是排队，不是禁止）
    if (workingRef.current) {
      console.log('[conversation] 处理中发送——打断当前，新指令优先')
      await stopGeneration()
    }
    inputRef.current = ''
    setInput('')
    if (!opts?.silent) {
      // 13 复跑入口：上报用户输入（真实交付包 rerunPrompt 用）
      onUserMessage?.(text)
      // 2026-08-04：对话日志（自动记录用户消息——与 assistant done 互补成完整对话）
      window.neonforge.chatLog?.log?.({ ts: new Date().toISOString(), role: 'user', content: text })
      setMessages((p) => [...p, { role: 'user', content: text, status: 'done' }])
    }
    // 2026-08-04：新轮次——重置流式累积（防上轮异常残留）
    streamingRef.current = { content: '', toolCalls: [] }
    setWorking(true)
    onWorkingChange?.(true)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messages)
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
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
    // ticket 07：0-1 交付阶段指引（引导模型按阶段产出——优先级最高，最前）
    if (stageHint) {
      msgs.unshift({ role: 'system', content: stageHint })
    }
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
              { role: 'assistant', content: '（早期对话已压缩——长对话自动摘要，最近 20 条保留）', status: 'done' as const },
              ...compacted.kept.filter((m) => m.content != null).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '', status: 'done' as const })),
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
      // 2026-08-04 修复（流式链互斥）：send 链占锁——其他链（授权续聊/阶段补发）排队，防 chunk 交错
      const release = await acquireChain()
      turnKindRef.current = 'user-turn' // 2026-08-07 坑 89：用户消息轮 = user-turn（forceTool 原意作用对象）
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
      // 2026-08-04 体验修复：用户消息流式结束后补发排队中的阶段推进（「确认推进」→ working 时 advanceChat 排队 → 这里补发）
      const pending = pendingAdvanceRef.current
      if (pending) {
        pendingAdvanceRef.current = null
        void advanceChatRef.current(pending.stage, pending.hint, pending.requirement)
      }
    }
  }
  // 05 B：sendRef 同步最新 send（externalRequest 触发用）
  useEffect(() => { sendRef.current = send }, [send])

  // 2026-08-04：阶段推进自动触发——点「确认推进」→ 搭档主动按新阶段工作（用户反馈「推进后无反馈/流程走不完」）
  // 内部指令作为 user 消息发给模型但不显示在对话区（本地提示消息已展示阶段切换）；模型流式回复 = 推进后的实际反馈
  // 2026-08-04 方案 A：requirement 可选——需求卡确认摘要附带在内部指令里（模型按确认结果工作；不显示在对话区）
  const advanceChat = async (stage: string, hint: string, requirement?: string) => {
    // 2026-08-04 体验修复（根因 B）：working 时排队（用户「确认推进」刚发消息→流式中）——流式结束后自动补发；
    // 原直接 return = 模型收不到「已进入设计」指令 → 按旧阶段回复混乱（导出实证 13:36:50 乱码）
    if (workingRef.current) {
      pendingAdvanceRef.current = { stage, hint, requirement }
      return
    }
    streamingRef.current = { content: '', toolCalls: [] } // 新轮次重置流式累积
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage(`进入${stage}阶段…`)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messagesRef.current)
    const msgs: Array<{ role: 'user' | 'system'; content: string }> = [{
      role: 'user',
      // 2026-08-07 坑 89：阶段推进指令生成抽象到领域层（AgentChain BC——buildAdvanceInstruction）
      content: buildAdvanceInstruction({ stage: stage as ProductStageName, hint, requirement }) // stage 来自 FLOW_STAGES 恒为合法阶段名——断言收窄
    }]
    if (stageHint) msgs.unshift({ role: 'system', content: stageHint })
    // 追加 streaming 占位——模型回复直接流式显示（内部指令不显示为用户消息）
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    try {
      // 2026-08-04 修复（流式链互斥）：advanceChat 链占锁——防与授权续聊并发（chunk 交错）
      const release = await acquireChain()
      try {
        turnKindRef.current = 'advance-turn' // 2026-08-07 坑 89：阶段推进轮——forceTool 按阶段工作模式（设计=不强制）
        await runChat([...history, ...msgs], 0, sid)
      } finally {
        release()
      }
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
      // 2026-08-04 体验修复：本流式结束后补发排队中的阶段推进（链式推进不丢失）
      const pending = pendingAdvanceRef.current
      if (pending) {
        pendingAdvanceRef.current = null
        void advanceChatRef.current(pending.stage, pending.hint, pending.requirement)
      }
    }
  }
  const advanceChatRef = useRef<typeof advanceChat>(async () => {})
  useEffect(() => { advanceChatRef.current = advanceChat }, [advanceChat])

  // L3 授权：允许执行（approved=true）/ 拒绝（标记拒绝）
  // 2026-08-04 重构（用户：「搭档处理中」卡住根因）：按消息定位工具卡更新——原固定更新最后一条消息，
  // 续聊已追加新 streaming 消息时错位（工具结果回填错位 → maybeContinue 看不到 done → 链中断 + working 卡）
  const patchToolCall = (idx: number, patch: (c: ToolCallMsg) => ToolCallMsg, msg: ToolCallMsg) => {
    setMessages((prev) => {
      for (let mi = prev.length - 1; mi >= 0; mi--) {
        const m = prev[mi]
        if (m.role !== 'assistant' || !m.toolCalls) continue
        const c = m.toolCalls[idx]
        if (c && c.name === msg.name) {
          const updated = m.toolCalls.map((x, i) => (i === idx ? patch(x) : x))
          return [...prev.slice(0, mi), { ...m, toolCalls: updated }, ...prev.slice(mi + 1)]
        }
      }
      return prev
    })
  }
  const approveToolCall = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    patchToolCall(idx, (c) => ({ ...c, status: 'pending' as const }), tc)
    void window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: true, rootPath: rootPath ?? undefined }).then((r) => {
      const data = r.data as { file?: string; snapshot?: boolean } | undefined
      // 13 交付包联动：授权后真实写入成功 → 上报变更
      if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
      patchToolCall(idx, (c) => (r.ok
        ? { ...c, status: 'done' as const, result: fmtToolResult(r), rawResult: typeof r.data === 'string' ? r.data.slice(0, 16000) : JSON.stringify(r.data ?? '').slice(0, 16000), file: data?.file, canRevert: !!(data?.file && data.snapshot) }
        : { ...c, status: 'error' as const, result: r.error }), tc)
      // 2026-08-04 修复（流式链互斥）：授权续聊也占锁排队——防与 send/advanceChat 链并发（chunk 交错「游戏成的3是D」）
      setTimeout(async () => {
        const release = await acquireChain()
        try {
          await maybeContinue(chatRef.current?.depth ?? 0, sessionRef.current)
        } finally {
          release()
        }
      }, 150)
    })
  }
  const rejectToolCall = (calls: ToolCallMsg[], idx: number) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) => i === idx ? { ...c, status: 'error' as const, result: '已拒绝授权——未执行' } : c)
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
  }
  // 2026-08-04 授权架构 v4：允许并记住（本次任务内此文件 write/edit 自动）——用户授权疲劳核心解法
  const rememberAndApprove = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    addTrust(tc.args)
    approveToolCall(calls, idx, tc)
  }
  // 2026-08-04 授权架构 v4：批量「全部允许并记住」——一条消息内多个待授权文件一次批准整批（fix bug 场景：改 3 文件 1 次点击）
  const approveAllRemember = (calls: ToolCallMsg[]) => {
    const pending = calls.filter((c) => c.status === 'need-approval')
    pending.forEach((c) => addTrust(c.args))
    pending.forEach((c) => {
      const idx = calls.indexOf(c)
      approveToolCall(calls, idx, c)
    })
  }
  // 2026-08-04 规划级授权（用户「规划好文件一次性要授权，减少逐个授权打断」）：批准计划文件清单 → 全部加入任务级信任 → 模型后续 write/edit 自动放行
  const approvePlan = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    const files = (tc.args.files ?? []) as Array<{ path: string }>
    files.forEach((f) => addTrust({ path: f.path }))
    // 2026-08-06 任务完成度：保存规划文件清单（progress 检测用——deepcode unimplemented_files 借鉴）+ 重置产出（新任务）
    // 2026-08-06 偏离拦截（基于事实：06:03 已规划但写「正确路径」偏离清单 → 弹授权/规划外）：存规范化路径（trustPath 绝对——比较一致）
    plannedFilesRef.current = new Set(files.map((f) => trustPath(f.path)))
    producedFilesRef.current = new Set()
    // 2026-08-05：幂等标记——本任务内再调 plan_approval 不再弹卡
    planApprovedRef.current = true
    // 2026-08-04 规划强制：通知 main（planApproved=true——write/edit 放行）
    void window.neonforge.tools?.planApproved?.()
    patchToolCall(idx, (c) => ({ ...c, status: 'done' as const, result: `已批准 ${files.length} 个文件（本次任务自动放行）` }), tc)
    setTimeout(() => void maybeContinue(chatRef.current?.depth ?? 0, sessionRef.current), 150)
  }
  // 真实执行安全闭环（基线 §10/§11）：write/edit 写前已快照——回滚恢复原样
  // 按 file 匹配更新（工具卡可能不在最后一条消息——maybeContinue 已追加新 streaming 消息）
  const revertToolCall = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    if (!tc.file) return
    void window.neonforge.tools?.revert?.(tc.file).then((r) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          let changed = false
          const updated = m.toolCalls.map((c) => {
            if (c.file !== tc.file || c.status !== 'done') return c
            changed = true
            return { ...c, status: 'reverted' as const, result: r.ok ? '已回滚——文件恢复原样' : (r.error ?? '回滚失败') }
          })
          return changed ? { ...m, toolCalls: updated } : m
        })
      )
    })
  }

  // ticket 14 可撤销：任何时刻停止当前操作（bash 高危——cancelActiveCommand kill；卡标记已停止）
  // 2026-08-04 修复（用户「按停止没反应」）：停止 = 中止整条链——原只 kill bash 子进程，流式链/续聊继续跑（模型还在输出）
  const stopToolCall = (calls: ToolCallMsg[], idx: number) => {
    void (window.neonforge.tools?.cancel?.() ?? Promise.resolve({ ok: false }))
    // 中止当前流式链：sid++ + streamingSid=0 → 旧流 chunk 忽略（applyChunk sid 检查）+ 旧链 maybeContinue 失效
    sessionRef.current++
    streamingSidRef.current = 0
    streamingRef.current = { content: '', toolCalls: [] }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('')
    // 标记所有待执行/待授权工具卡为已停止
    setMessages((prev) => prev.map((m) => {
      if (!m.toolCalls || m.toolCalls.length === 0) return m
      return { ...m, toolCalls: m.toolCalls.map((c) =>
        c.status === 'pending' || c.status === 'need-approval'
          ? { ...c, status: 'error' as const, result: '已停止——未继续执行' }
          : c) }
    }))
  }
  // ticket 14 疲劳防护：同批多个低危文件操作合并授权（bash 高危永远单独确认——canMergeApprove 已保证全 low）
  const approveAllToolCalls = (calls: ToolCallMsg[]) => {
    calls.forEach((tc, i) => { if (tc.status === 'need-approval') approveToolCall(calls, i, tc) })
  }

  const finishError = (err: string) => {
    // 2026-08-04 体验修复：错误分类 + 日志记录在 updater 外（坑 32——StrictMode updater 双调；原仅 done 记录错误无法追溯）
    // 2026-08-05 用户反馈（第二轮候选点选后卡住）：runChat 提前 return（gateway 错误/网络错误/key 失效）走 finishError 不经过 maybeContinue——
    // working 释放点已移到 maybeContinue（0e12ea6）→ finishError 不释放 → working 卡 true → 状态栏「搭档处理中」→ 卡住；此处统一释放
    // 2026-08-07 T1（regex-todo）：分类逻辑移入 errorClassify 纯函数（原 String(err).includes('5') 过宽——token-limit-50/5000/x5x 误归 service）
    const errorType = classifyChatError(err)
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
    window.neonforge.chatLog?.log?.({ ts: new Date().toISOString(), role: 'assistant', content, error: errorType })
    setMessages((p) => {
      const last = p[p.length - 1]
      if (!last || last.role !== 'assistant') return p
      return [...p.slice(0, -1), { ...last, status: 'error', error: errorType, content }]
    })
  }

  const d = (window.neonforge as unknown as { demo?: Record<string, unknown> }).demo ?? {}
  const demoFlow = !!d.deliveryFlow
  const demoDigital = !!d.digitalDelivery
  const demoTrust = !!d.trustLadder
  const demoDod = !!d.dodAlign
  const compactCount = (d.compactHistory as number) ?? 0
  const compactNote = compactCount > 24 ? `对话已超过 24 条——将压缩前 ${compactCount - 12} 条为摘要（上下文不丢）` : null
  const onDeliver = (pkg: DeliveryPackage) => {
    const w = window as unknown as { neonforge: { demo?: { onDeliver?: (p: DeliveryPackage) => void } } }
    w.neonforge.demo?.onDeliver?.(pkg)
  }

  return (
    <div className="nf-chat">
      {/* 2026-08-04 P0：demo 通道跳过门控（展示完整流程——产品主流程在 MainWorkspace flow dock 带门控）；artifactsReady 同步跳过开发门控 */}
      {demoFlow && <DeliveryFlowPanel requirementConfirmed artifactsReady />}
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
          <div key={i} className={`nf-msg nf-msg--${m.role}`}>
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
            {m.role === 'assistant' && m.status === 'done' && m.content && (() => {
              const opts = parseCandidates(m.content)
              if (!opts) return null
              const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']
              return (
                <div className="nf-candidates" role="group" aria-label="选择一项">
                  {opts.map((o, j) => (
                    <button
                      key={j}
                      type="button"
                      className="nf-candidates__btn"
                      onClick={() => { inputRef.current = o; void sendRef.current() }}
                    >
                      <span className="nf-candidates__idx" aria-hidden="true">{NUMS[j] ?? `${j + 1}.`}</span>
                      <span>{o}</span>
                    </button>
                  ))}
                </div>
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
            {m.toolCalls && m.toolCalls.length > 0 && (
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
                  // ticket 14：授权卡风险明示——等级 + 影响（写哪个文件/执行什么命令）+ 快照提示
                  const hint = buildAuthHint(tc.name, tc.args)
                  return (
                  <div key={i} className={`nf-toolcall nf-toolcall--${tc.status}`}>
                    <span className="nf-toolcall__icon">
                      {tc.status === 'done' ? <IconCheck size={11} /> : tc.status === 'need-approval' || tc.status === 'plan-approval' ? <IconLock size={11} /> : tc.status === 'reverted' ? <IconRotateCcw size={11} /> : tc.status === 'error' ? <IconX size={11} /> : <IconClock size={11} />}
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
                    {tc.status === 'plan-approval' && (
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
                    {tc.status === 'need-approval' && (
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
