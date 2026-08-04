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
// 2026-08-03 视觉审计 P1-6：内联 SVG 图标（替换 emoji 图标）
import {
  IconBrain, IconCheck, IconClock, IconDot, IconFile,
  IconLock, IconRotateCcw, IconSquare, IconX, ToolIcon
} from './icons'
// 2026-08-04 启动页方案 A：场景卡数据共享（启动页 + 对话空态共用）
import { SCENES } from './scenes'

// ticket 04：对话最小闭环（D0 §2/§3.4）——输入发送 → Gateway 流式 → 消息/呼吸光条/推理展示
// 消费 02：streamChat（四档 basic）+ ModelRouter（默认 Flash）；错误分支：Key 失效内嵌更新 / 服务故障提示

export interface ToolCallMsg {
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'done' | 'need-approval' | 'error' | 'reverted'
  result?: string
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

export default function ConversationPanel({
  rootPath,
  currentFile,
  onKeyExpired,
  onReasoning,
  onWorkingChange,
  onApprovalChange,
  externalRequest,
  onExternalConsumed,
  onToolResult,
  onUserMessage,
  onRequirementConfirmed,
  recentFilesExternal,
  stageHint,
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
  externalRequest?: string | null
  onExternalConsumed?: () => void
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  onUserMessage?: (text: string) => void
  // 2026-08-04：需求确认回写——模型输出【需求确认：xxx】→ 上报 MainWorkspace（更新台账标题/快照 + 项目 README）
  onRequirementConfirmed?: (title: string) => void
  recentFilesExternal?: string[]
  stageHint?: string // 0-1 交付阶段指引（ticket 07——注入对话引导模型按阶段产出）
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
  const applyChunkRef = useRef<((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null>(null)
  useEffect(() => { applyChunkRef.current = applyChunk }) // 每次渲染同步最新 applyChunk
  useEffect(() => {
    // 永久 listener：不随 runChat off（off 竞争会导致 done 事件丢失——invoke resolve 与 stream-chunk 投递顺序）
    const off = window.neonforge.gateway.onStreamChunk((chunk) => {
      if (sessionRef.current === 0) return // 无活跃会话——忽略
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
  const sendRef = useRef<() => Promise<void>>(async () => {})
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
  const applyChunk = (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => {
    console.log('[conv] chunk', chunk.type)
    // 事件层累积（每事件一次——双调安全）
    if (chunk.type === 'content') streamingRef.current.content += chunk.text ?? ''
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
      streamingRef.current = { content: '', toolCalls: [] }
    }
    setMessages((prev) => {
      // 纯 UI 更新（无副作用——StrictMode 双调安全）
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      if (chunk.type !== 'tool-call' && last.status !== 'streaming') return prev
      const next = { ...last }
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
      }
      if (chunk.type === 'tool-call' && chunk.toolCall) {
        next.toolCalls = [...(next.toolCalls ?? []), { name: chunk.toolCall.name, args: chunk.toolCall.args, status: 'pending' }]
      }
      return [...prev.slice(0, -1), next]
    })
    // 工具执行副作用（移出 updater——StrictMode 双调会执行两次；真实工具写文件等不可重复）
    if (chunk.type === 'tool-call' && chunk.toolCall) {
      const tc = chunk.toolCall
      // 2026-08-03 v35：workingStage 人类化（原「调用工具 bash…」技术腔——按工具名映射自然描述）
      const stageMap: Record<string, string> = {
        read: '正在读取文件…', write: '正在写入文件…', edit: '正在修改文件…',
        bash: '正在执行命令…', search: '正在搜索…'
      }
      setWorkingStage(stageMap[tc.name] ?? (tc.name.startsWith('find_') || tc.name.startsWith('get_') ? '正在查代码…' : '正在处理…'))
      // ticket 14 L4 委托：低危文件操作（write/edit）命中委托规则 → 免确认直接执行（仍快照可回滚）；bash 高危永远单独授权
      const autoApproved = tc.name === 'read' || (delegateLowRisk && toolRisk(tc.name) === 'low')
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
              ? { ...c, status: 'done' as const, result: typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data).slice(0, 400), file: data?.file, canRevert: !!(data?.file && data.snapshot) }
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
  const maybeContinue = async (depth: number, sid: number) => {
    const ctx = chatRef.current
    if (!ctx || depth >= 2 || sessionRef.current !== sid) return
    // 等待自动执行（pending）完成——最多 8s；待授权（need-approval）立即停止（等用户点允许）
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const latest = messagesRef.current
      const lastMsg = latest[latest.length - 1]
      if (!lastMsg || !lastMsg.toolCalls || lastMsg.toolCalls.length === 0) return
      const pending = lastMsg.toolCalls.filter((c) => c.status === 'pending')
      const needsApproval = lastMsg.toolCalls.some((c) => c.status === 'need-approval')
      if (needsApproval) return // 有待授权——等用户点允许（approveToolCall 后触发续聊）
      if (pending.length === 0) break // 全部执行完成
    }
    const latest = messagesRef.current
    const lastMsg = latest[latest.length - 1]
    if (!lastMsg) return
    const calls = lastMsg.toolCalls ?? []
    if (calls.length === 0) return
    // 组装 tool 消息序列
    const toolMsgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }> = [
      ...ctx.msgs,
      {
        role: 'assistant',
        content: null,
        reasoning_content: lastMsg.reasoning ?? '',
        tool_calls: calls.map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }))
      },
      ...calls.map((c, i) => ({ role: 'tool', tool_call_id: `call_${i}`, content: c.result ?? '执行失败' }))
    ]
    chatRef.current = { msgs: toolMsgs, depth: depth + 1 }
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    await new Promise((r) => setTimeout(r, 50))
    await runChat(toolMsgs, depth + 1, sid)
  }

  // 多轮工具循环：模型返回 tool_call → 执行 → 结果回填 → 续聊（最多 4 轮）
  const runChat = async (msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>, depth: number, sid: number) => {
    if (depth > 4) return
    const key = await window.neonforge.config.getKey()
    if (!key) { finishError('key-invalid'); return }
    // 系统提示：引导直接 read（项目根相对路径）——避免 bash 全局搜索/工具循环（提速）
    // 2026-08-02：LSP 工具接入模型（HANDOFF §3 第一优先）——引导用 find_definition/find_references/get_type_info 查真实代码上下文
    // 2026-08-02：search 工具接入模型（Layer2 CodeRAG agentic 化——Claude Code grep 模式）
    // 2026-08-03 v33：回复语言跟随用户——检测最近用户消息语言（中文 → 中文回复；否则 → 同语言回复）
    // 2026-08-04：回复风格约束——用户反馈「太技术化/杂音多」——面向非技术用户：简洁口语化 + 无 Markdown 重符号/少括号/少空行
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
    const langRule = lastUserMsg && /[\u4e00-\u9fff]/.test(String(lastUserMsg.content ?? ''))
      ? '⑧ 用中文回复用户（避免英文夹杂；工具名/代码/技术名词可保留原文）'
      : '⑧ 用与用户消息相同的语言回复'
    const sysHint = { role: 'system', content: `你是 NeonForge 搭档。当前项目根目录：${rootPath ?? '(未指定)'}。规则：① 读文件用 read 工具（路径用项目根下的相对路径，如 package.json）② 不要用 bash find 全局搜索（直接 read 目标文件）③ 工具一次调用一个，执行完看结果再决定 ④ 找不到文件就直接告诉用户 ⑤ 查符号定义/引用/类型用 LSP 工具：find_definition/find_references/get_type_info（传 path + symbol，如 {path: 'src/a.ts', symbol: 'greet'}）⑥ 查文件错误/import 用 get_diagnostics/get_imports ⑦ 不知道符号在哪个文件时用 search 工具（传 query 关键词，如 "greet"）——返回命中文件+行号+片段，再 read 或 LSP 定位。${langRule}⑨ 用户可能不懂技术——回答简洁口语化：优先短句，少用术语；必须提术语时用一句大白话解释；不要堆砌要点清单。⑩ 回复正文不要用 Markdown 标记（不要 #、**、反引号、- 列表、代码块框）；少用括号补充说明；段落之间最多空一行，不要连续空行。` }
    try {
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic',
        tools: true,
        messages: [sysHint, ...msgs]
      })
      if (!res.ok) { finishError(res.error ?? 'gateway-error'); return }
    } catch { finishError('network'); return }

    // 记录本轮上下文 → 由 maybeContinue 轮询工具完成（自动执行）→ 续聊
    chatRef.current = { msgs, depth }
    await new Promise((r) => setTimeout(r, 1000))
    await maybeContinue(depth, sid)
  }

  // 2026-08-04：对话历史构造（send 与阶段推进自动触发共用——工具轮转文本摘要保留上下文，DeepSeek 要求 tool 消息带 reasoning_content）
  const buildHistory = (msgs: Msg[]) => msgs
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done'))
    .map((m) => {
      if (m.role === 'assistant' && !m.content && m.toolCalls && m.toolCalls.length > 0) {
        // 工具轮（无文本）——转文本摘要保留上下文
        const summary = m.toolCalls
          .map((c) => `[${c.name}] ${JSON.stringify(c.args).slice(0, 60)} → ${(c.result ?? c.status).toString().slice(0, 100)}`)
          .join('; ')
        return { role: 'assistant', content: `（工具调用：${summary}）` }
      }
      return { role: m.role, content: m.content }
    })
  const workingRef = useRef(false)
  useEffect(() => { workingRef.current = working }, [working])

  const send = async () => {
    const text = inputRef.current.trim()
    if (!text || working) return
    inputRef.current = ''
    setInput('')
    // 13 复跑入口：上报用户输入（真实交付包 rerunPrompt 用）
    onUserMessage?.(text)
    // 2026-08-04：对话日志（自动记录用户消息——与 assistant done 互补成完整对话）
    window.neonforge.chatLog?.log?.({ ts: new Date().toISOString(), role: 'user', content: text })
    // 2026-08-04：新轮次——重置流式累积（防上轮异常残留）
    streamingRef.current = { content: '', toolCalls: [] }
    setWorking(true)
    onWorkingChange?.(true)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messages)
    setMessages((p) => [...p, { role: 'user', content: text, status: 'done' }])
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
          chatHistory = [
            { role: 'user' as const, content: compacted.summary },
            ...compacted.kept.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' }))
          ]
          setWorkingStage('已压缩长对话（摘要 + 最近 20 条）…')
        }
      } catch { /* 压缩失败 → 全量发送（降级不阻塞） */ }
    }
    try {
      await runChat([...chatHistory, ...msgs], 0, sid)
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
    }
  }
  // 05 B：sendRef 同步最新 send（externalRequest 触发用）
  useEffect(() => { sendRef.current = send }, [send])

  // 2026-08-04：阶段推进自动触发——点「确认推进」→ 搭档主动按新阶段工作（用户反馈「推进后无反馈/流程走不完」）
  // 内部指令作为 user 消息发给模型但不显示在对话区（本地提示消息已展示阶段切换）；模型流式回复 = 推进后的实际反馈
  // 2026-08-04 方案 A：requirement 可选——需求卡确认摘要附带在内部指令里（模型按确认结果工作；不显示在对话区）
  const advanceChat = async (stage: string, hint: string, requirement?: string) => {
    if (workingRef.current) return // 搭档处理中——跳过自动触发（本地提示已给出，用户可稍后说话）
    streamingRef.current = { content: '', toolCalls: [] } // 新轮次重置流式累积
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage(`进入${stage}阶段…`)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messagesRef.current)
    const msgs: Array<{ role: 'user' | 'system'; content: string }> = [{
      role: 'user',
      content: `${requirement ? `【需求确认】用户已通过需求确认卡确认需求：${requirement}——请基于此需求进行本阶段工作。` : ''}【阶段推进】已进入「${stage}」阶段。${hint}。请开始本阶段工作：先用简洁口语向用户说明本阶段要做什么、需要用户提供什么；本阶段完成时提示用户点「确认推进」。${stage === '开发' ? '本阶段直接动手产出真实文件（用 write/edit 工具，写前先读现有文件再修改；先写出第一版能跑的文件，产出后再问需要用户决策的问题，一次只问一个——不要只提问不产出）。' : '本阶段不要写代码。'}`
    }]
    if (stageHint) msgs.unshift({ role: 'system', content: stageHint })
    // 追加 streaming 占位——模型回复直接流式显示（内部指令不显示为用户消息）
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    try {
      await runChat([...history, ...msgs], 0, sid)
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
    }
  }
  const advanceChatRef = useRef<typeof advanceChat>(async () => {})
  useEffect(() => { advanceChatRef.current = advanceChat }, [advanceChat])

  // L3 授权：允许执行（approved=true）/ 拒绝（标记拒绝）
  const approveToolCall = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) => i === idx ? { ...c, status: 'pending' as const } : c)
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
    void window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: true, rootPath: rootPath ?? undefined }).then((r) => {
      const data = r.data as { file?: string; snapshot?: boolean } | undefined
      // 13 交付包联动：授权后真实写入成功 → 上报变更
      if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const calls = (last.toolCalls ?? []).map((c, i) => {
          if (i !== idx) return c
          return r.ok
            ? { ...c, status: 'done' as const, result: typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data).slice(0, 400), file: data?.file, canRevert: !!(data?.file && data.snapshot) }
            : { ...c, status: 'error' as const, result: r.error }
        })
        return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
      })
      setTimeout(() => void maybeContinue(chatRef.current?.depth ?? 0, sessionRef.current), 150)
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

  // ticket 14 可撤销：任何时刻停止当前操作（bash 高危——cancelActiveCommand kill；卡标记已停止，续聊回填让模型知道被停止）
  const stopToolCall = (calls: ToolCallMsg[], idx: number) => {
    void (window.neonforge.tools?.cancel?.() ?? Promise.resolve({ ok: false, error: 'cancel 通道未就绪' }))
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) => i === idx ? { ...c, status: 'error' as const, result: '已停止——未继续执行' } : c)
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
    setTimeout(() => void maybeContinue(chatRef.current?.depth ?? 0, sessionRef.current), 150)
  }
  // ticket 14 疲劳防护：同批多个低危文件操作合并授权（bash 高危永远单独确认——canMergeApprove 已保证全 low）
  const approveAllToolCalls = (calls: ToolCallMsg[]) => {
    calls.forEach((tc, i) => { if (tc.status === 'need-approval') approveToolCall(calls, i, tc) })
  }

  const finishError = (err: string) => {
    // 2026-08-04 体验修复：错误分类 + 日志记录在 updater 外（坑 32——StrictMode updater 双调；原仅 done 记录错误无法追溯）
    let errorType: 'key-invalid' | 'service' | 'unknown' = 'unknown'
    let content = '刚才出错了，请再试一次。'
    if (err === 'key-invalid' || String(err).includes('401')) {
      errorType = 'key-invalid'
      content = 'API Key 好像失效了，换个 Key 试试。'
    } else if (String(err).includes('5') || err === 'timeout' || err === 'network' || String(err).includes('gateway')) {
      errorType = 'service'
      content = '服务暂时不可用，稍后再试。'
    }
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
      <div className="nf-chat__list" ref={listRef} aria-live="polite" aria-relevant="additions text">
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
              {/* 2026-08-04：展示前 cleanContent 清洗（字面转义/连续换行/行尾空白）——只影响展示，API 发送原文 */}
              {m.content ? cleanContent(m.content) : (m.status === 'streaming' ? '搭档处理中…' : m.error === 'empty-response' ? '搭档没有返回内容——请重试或换个说法' : m.status === 'error' ? '处理失败' : '')}
              {m.error === 'key-invalid' && (
                <button type="button" className="nf-config__link" onClick={onKeyExpired}>
                  要不要更新一下？
                </button>
              )}
            </div>
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
                {m.toolCalls.map((tc, i) => {
                  // ticket 14：授权卡风险明示——等级 + 影响（写哪个文件/执行什么命令）+ 快照提示
                  const hint = buildAuthHint(tc.name, tc.args)
                  return (
                  <div key={i} className={`nf-toolcall nf-toolcall--${tc.status}`}>
                    <span className="nf-toolcall__icon">
                      {tc.status === 'done' ? <IconCheck size={11} /> : tc.status === 'need-approval' ? <IconLock size={11} /> : tc.status === 'reverted' ? <IconRotateCcw size={11} /> : tc.status === 'error' ? <IconX size={11} /> : <IconClock size={11} />}
                    </span>
                    <span className="nf-toolcall__name"><ToolIcon name={tc.name} size={12} /> {tc.name}</span>
                    <span className="nf-toolcall__args">{JSON.stringify(tc.args).slice(0, 80)}</span>
                    {tc.result && <span className="nf-toolcall__result">{tc.result}</span>}
                    {tc.status === 'done' && tc.canRevert && (
                      <button
                        type="button"
                        className="nf-toolcall__revert"
                        onClick={() => revertToolCall(m.toolCalls ?? [], i, tc)}
                      >
                        <IconRotateCcw size={12} /> 回滚
                      </button>
                    )}
                    {tc.status === 'need-approval' && (
                      <>
                        <span className="nf-toolcall__hint">{hint.level}</span>
                        {hint.impact && <span className="nf-toolcall__impact">→ {hint.impact}</span>}
                        {hint.note && <span className="nf-toolcall__note">{hint.note}</span>}
                        <div className="nf-toolcall__actions">
                          <button
                            type="button"
                            className="nf-toolcall__approve"
                            onClick={() => approveToolCall(m.toolCalls ?? [], i, tc)}
                          >
                            允许执行
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
          </div>
        ))}
        {working && (
          <div className="nf-working">
            <IconDot size={12} className="nf-working__dot" />
            <span>搭档处理中：{workingStage}</span>
          </div>
        )}
      </div>

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
        <button type="button" className="nf-config__cta" onClick={() => void send()} disabled={working || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
