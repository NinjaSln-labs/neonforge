// P1-05 阶段 4c：轮次编排（从 ConversationPanel 提取；行为不变）。
// send / runChat / maybeContinue / finishError / retryFailedTurn / stopGeneration / flushPendingSend
// 组成一次对话回合的状态机；面板只提供状态与回调依赖，本 hook 持有链锁与跨轮计数。
import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  decideProgressGuarantee,
  detectUnproductiveDialogue,
  isConsumedProposal,
  isSideEffectAction,
  noteUserTextReply,
  pendingCardToShow,
  shouldStopContinuation,
  type ConversationState,
} from '../domain/conversationState'
import { evaluateTurnProgress, isConfirmIntent } from '../domain/agentLoop'
import { buildHistory, type HistoryMessage } from './conversationHistory'
import type { Msg, ToolCallMsg } from './ConversationPanel'
import type { useConversationState } from './useConversationState'
import { buildSysHint } from './sysPrompt'
import { isSystemNudgeText, systemNudgeKind } from './systemNudge'
import { classifyChatError, type ChatErrorType } from './errorClassify'

type Confirm = ReturnType<typeof useConversationState>['confirm']
type Reject = ReturnType<typeof useConversationState>['reject']
type SetPending = ReturnType<typeof useConversationState>['setPending']

export interface ChatEngineDeps {
  capReadyRef: RefObject<boolean>
  chatRef: RefObject<{ msgs: HistoryMessage[]; depth: number } | null>
  /** 流式 done 通知（runChat 尾部等待；与 applyChunk 共享） */
  doneNotifierRef: RefObject<(() => void) | null>
  /** 迟绑定授权入口（send 的文本批准路径依赖 useToolApproval——定义顺序在 hook 之后） */
  getApproveAllToolCalls: () => (calls: ToolCallMsg[]) => void
  inputRef: RefObject<string>
  messages: Msg[]
  messagesRef: RefObject<Msg[]>
  nextMsgId: () => string
  onActionPromiseHint?: (hint: string | null) => void
  onUserMessage?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
  pendingSendRef: RefObject<string>
  prevReadFilesRef: RefObject<Set<string>>
  recentFilesExternal?: string[]
  confirm: Confirm
  reject: Reject
  rootPath?: string | null
  /** externalRequest / verifyThenResolve / applyChunk 共享的发送入口引用 */
  sendRef: RefObject<(opts?: { silent?: boolean; text?: string; queued?: boolean }) => Promise<void>>
  sessionId: string
  sessionRef: RefObject<number>
  setInput: (v: string) => void
  setMessages: Dispatch<SetStateAction<Msg[]>>
  setPendingState: SetPending
  setWorking: (working: boolean) => void
  setWorkingStage: (stage: string) => void
  stateRef: RefObject<ConversationState>
  streamingRef: RefObject<{ content: string; reasoning: string; toolCalls: ToolCallMsg[] }>
  streamingSidRef: RefObject<number>
  suspendRoundRef: RefObject<boolean>
  tlog: (
    type: string,
    detail: Record<string, unknown>,
    role?: 'user' | 'assistant' | 'system' | 'tool',
  ) => void
  trustPath: (p: unknown) => string
  workingRef: RefObject<boolean>
}

export interface ChatEngine {
  acquireChain: () => Promise<() => void>
  finishError: (err: string, errorTypeHint?: ChatErrorType, sid?: number) => void
  flushPendingSend: () => void
  maybeContinue: (depth: number, sid: number) => Promise<void>
  retryFailedTurn: () => Promise<void>
  runChat: (msgs: HistoryMessage[], depth: number, sid: number) => Promise<void>
  send: (opts?: { silent?: boolean; text?: string; queued?: boolean }) => Promise<void>
  stopGeneration: (source?: 'button' | 'silent') => Promise<void>
}

export function useChatEngine(deps: ChatEngineDeps): ChatEngine {
  const {
    capReadyRef,
    chatRef,
    doneNotifierRef,
    getApproveAllToolCalls,
    inputRef,
    messages,
    messagesRef,
    nextMsgId,
    onActionPromiseHint,
    onUserMessage,
    onWorkingChange,
    pendingSendRef,
    prevReadFilesRef,
    recentFilesExternal,
    confirm,
    reject,
    rootPath,
    sendRef,
    sessionId,
    sessionRef,
    setInput,
    setMessages,
    setPendingState,
    setWorking,
    setWorkingStage,
    stateRef,
    streamingRef,
    streamingSidRef,
    suspendRoundRef,
    tlog,
    trustPath,
    workingRef,
  } = deps

  // 2026-08-04 重构：工具链死循环检测——同工具（name+args）连续 3 次停止（跨 maybeContinue 调用累积——原局部变量每轮重置失效）
  const chainRepeatRef = useRef<{ sid: number; sig: string; count: number }>({
    sid: -1,
    sig: '',
    count: 0,
  })
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
  // 自动续跑引用（finishError 瞬态失败一次自动重试——等同点「重试」；每会话一次）
  const autoRetriedServiceRef = useRef(false)
  const retryFailedTurnRef = useRef<(() => Promise<void>) | null>(null)
  // 消息写入必须同步维护 messagesRef：finishError/maybeContinue/retry 在 React effect 之前读取 ref，
  // 仅 setMessages 会让 ref 慢一拍 → 失败路径用陈旧列表覆盖刚追加的用户/streaming 消息（计数丢失根因）
  const commitMessages = (next: Msg[]) => {
    messagesRef.current = next
    setMessages(next)
  }

  // 工具完成后触发续聊：轮询等工具执行（自动/授权）完成，全 done → 回填模型继续
  // 2026-08-04 重构（用户：「定多少才不会卡」）：死上限（2/8）→ 自然停止 + 兜底——只要模型还在调工具就继续（开发正常 10-20+ 轮）；
  // 停止条件：模型不调工具（toolCalls 空）/ 待授权 / 同工具重复 3 次（死循环）/ 40 轮总兜底
  const maybeContinue = async (depth: number, sid: number) => {
    const ctx = chatRef.current
    if (!ctx || depth >= 40 || sessionRef.current !== sid) return
    // 2026-08-05 用户反馈 3（处理中可发送）：工具执行期间保持 working=true（状态栏「搭档处理中」）——send 守卫/停止按钮可感知模型仍在干活；
    // 原工具执行间隙 working=false → 用户发送放行 → 新旧对话并发（未知问题）
    workingRef.current = true
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage('工具执行中…')
    const releaseWorking = () => {
      if (sessionRef.current !== sid) return // 旧回合不得清掉新回合的 working（并发回合根因）
      workingRef.current = false
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
        return // 新回合已接管 working——旧回合静默退出
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
    const toolMsgs: HistoryMessage[] = [
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
    commitMessages([
      ...messagesRef.current,
      { role: 'assistant', content: '', reasoning: '', status: 'streaming', id: nextMsgId() },
    ])
    await new Promise((r) => setTimeout(r, 50))
    await runChat(toolMsgs, depth + 1, sid)
  }

  // 多轮工具循环：模型返回 tool_call → 执行 → 结果回填 → 续聊（2026-08-04 重构：自然停止——模型不调工具/待授权/死循环检测；40 轮总兜底）
  const runChat = async (msgs: HistoryMessage[], depth: number, sid: number) => {
    // 2026-08-04：当前活跃流 = 本 sid（停止后旧流 chunk 不再更新 UI）
    streamingSidRef.current = sid
    // V1.5 S2 A-017：每轮流开始复位挂起标记（防 stopGeneration/错误路径残留——stop 不触发 done 分支，
    // 若只在 done 复位，中断的轮会把挂起误带到下一轮 → 兄弟工具被错误挂起）。挂起只约束同轮兄弟调用。
    suspendRoundRef.current = false
    // 2026-08-04 重构（用户：「定多少才不卡」根因——原 `depth > 4` 硬上限，开发工具链 5+ 轮必断）：40 轮总兜底（防死循环由 maybeContinue 重复检测承担）
    if (depth > 40) {
      // 2026-08-05：提前 return 释放 working（不经过 maybeContinue/finishError——防卡「搭档处理中」）
      if (sessionRef.current === sid) {
        workingRef.current = false
        setWorking(false)
        onWorkingChange?.(false)
        setWorkingStage('就绪')
      }
      return
    }
    const key = await window.neonforge.config.getKey()
    if (!key) {
      finishError('key-invalid', undefined, sid)
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
      lastUserMsg && /[一-鿿]/.test(String(lastUserMsg.content ?? ''))
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
        finishError(res.error ?? 'gateway-error', res.errorType, sid)
        return
      }
    } catch {
      finishError('network', undefined, sid)
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
    workingRef.current = false
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
    setTimeout(() => void sendRef.current({ text: pending, queued: true }), 50)
  }

  // 2026-08-06 只说不做第 5 次升级：send 支持 silent（自动续聊——不显示用户气泡）
  // 2026-09-28：系统提示/对账前缀强制 silent；opts.text 直送——不经输入框（防系统文案停在 textarea）
  const send = async (opts?: { silent?: boolean; text?: string; queued?: boolean }) => {
    const fromBox = opts?.text === undefined
    const fromQueue = Boolean(opts?.queued)
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
          getApproveAllToolCalls()(lastMsg.toolCalls)
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
      // 排队用户消息继任失败回合：移除尾部错误气泡（等同手动重试替换语义——用户已给出下一步）
      const lastMsg = messagesRef.current[messagesRef.current.length - 1]
      const dropError = fromQueue && lastMsg?.role === 'assistant' && lastMsg.status === 'error'
      const base = dropError ? messagesRef.current.slice(0, -1) : messagesRef.current
      commitMessages([
        ...base,
        { role: 'user', content: text, status: 'done', id: nextMsgId() },
      ])
    } else {
      // 系统引导/提示：不经用户通道（气泡/输入框/message_sent/chatLog）；时间线记一条便于事后查
      tlog('conversation.system_nudge', { content: text, kind: systemNudgeKind(text) }, 'system')
    }
    // 2026-08-04：新轮次——重置流式累积（防上轮异常残留）
    streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
    workingRef.current = true // 同步置位：state effect 有一拍滞后，期间其它 send 会误判空闲（并发回合根因）
    setWorking(true)
    onWorkingChange?.(true)
    const sid = ++sessionRef.current // 新会话——旧会话事件/续聊失效
    const history = buildHistory(messages)
    commitMessages([
      ...messagesRef.current,
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
      finishError('network', undefined, sid)
    } finally {
      // 只有本回合仍是最新回合才释放 working / 衔接排队（旧回合不得清掉新回合状态）
      if (sessionRef.current === sid) {
        workingRef.current = false
        setWorking(false)
        onWorkingChange?.(false)
        // 2026-08-07 无阶段修复（输入≠打断）：当前轮（流式+工具链）完成 → 排队消息自动衔接发送
        flushPendingSend()
      }
    }
  }
  // 05 B：sendRef 同步最新 send（externalRequest 触发用）
  useEffect(() => {
    sendRef.current = send
  }, [send, sendRef])

  const finishError = (err: string, errorTypeHint?: ChatErrorType, sid?: number) => {
    // 旧回合的错误不得覆盖新回合（并发回合根因：stale finishError 会改当前消息/清 working）
    if (sid !== undefined && sid !== sessionRef.current) return
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
      // 失败轮期间已有排队用户消息（当前轮 finally 会 flush）：由用户消息继任，不再自动续跑
      // （两者同 tick 并发启动 = 双回合 + chunk 混写；实测「自动续跑成功」重复）
      if (pendingSendRef.current) return
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
    commitMessages([
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
    workingRef.current = true // 同步置位（同 send：防 effect 滞后放行并发回合）
    setWorking(true)
    onWorkingChange?.(true)
    setWorkingStage('重试中…')
    const sid = ++sessionRef.current
    const hist = chatRef.current?.msgs ?? buildHistory(prev)
    const depth = chatRef.current?.depth ?? 0
    await runChat(hist, depth, sid)
  }
  retryFailedTurnRef.current = retryFailedTurn

  return {
    acquireChain,
    finishError,
    flushPendingSend,
    maybeContinue,
    retryFailedTurn,
    runChat,
    send,
    stopGeneration,
  }
}
