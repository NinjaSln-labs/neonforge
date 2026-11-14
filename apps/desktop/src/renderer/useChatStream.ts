// P1-05 阶段 4b：流式事件处理（从 ConversationPanel 提取；行为不变）。
// 工厂函数接收面板依赖并返回事件处理闭包；状态所有权仍在面板（4c 再抽编排 hook）。
import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  canExecute,
  deriveDecisionPoint,
  inPlannedFiles as inPlannedFilesDomain,
  isSideEffectAction,
  pendingCardToShow,
  type CompletionClaim,
  type ConversationState,
  type DecisionKind,
  type DecisionProposals,
  type GoalProposal,
  type PlanProposal,
} from '../domain/conversationState'
import {
  detectStuck,
  evaluateTurnProgress,
  shouldNudgeProposeAfterPlanReject,
  shouldNudgeProposeAfterResearch,
  shouldNudgeReportAfterEvidenceMissing,
  summarizeCapability,
  type StuckState,
} from '../domain/agentLoop'
import { PROTOCOL_TOOL_NAMES, decideProtocolToolCall } from '../domain/protocolTools'
import { detectProposed } from '../domain/timeline'
import { extractAssumptionsSection, parsePlanProposal } from '../domain/planProposalParser'
import { parseCompletionClaim } from '../domain/completionClaimParser'
import type { Msg, ToolCallMsg } from './ConversationPanel'
import type { useConversationState } from './useConversationState'
import { toolRisk } from './authModel'
import { fmtToolResult } from './conversationFormat'

type SetPending = ReturnType<typeof useConversationState>['setPending']
type ApplyTool = ReturnType<typeof useConversationState>['applyTool']

export interface ApplyChunkDeps {
  applyTool: ApplyTool
  delegateLowRisk: boolean
  doneNotifierRef: RefObject<(() => void) | null>
  evidenceGuideCountRef: RefObject<number>
  evidenceReportNudgedRef: RefObject<boolean>
  initialPrompt?: string
  isTrusted: (args: Record<string, unknown>) => boolean
  messages: Msg[]
  messagesRef: RefObject<Msg[]>
  nextMsgId: () => string
  onActionPromiseHint?: (hint: string | null) => void
  onReasoning?: (text: string) => void
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  onWorkingChange?: (working: boolean) => void
  planRejectNudgedRef: RefObject<boolean>
  planWasRejectedRef: RefObject<boolean>
  prevReadFilesRef: RefObject<Set<string>>
  recentFilesExternal?: string[]
  researchProposeNudgedRef: RefObject<boolean>
  rootPath?: string | null
  sendRef: RefObject<(opts?: { silent?: boolean; text?: string; queued?: boolean }) => Promise<void>>
  sessionId: string
  setMessages: Dispatch<SetStateAction<Msg[]>>
  setPendingState: SetPending
  setWorking: (working: boolean) => void
  setWorkingStage: (stage: string) => void
  stateRef: RefObject<ConversationState>
  streamingRef: RefObject<{ content: string; reasoning: string; toolCalls: ToolCallMsg[] }>
  stuckStateRef: RefObject<StuckState>
  suspendRoundRef: RefObject<boolean>
  textFallbackCountRef: RefObject<number>
  tlog: (
    type: string,
    detail: Record<string, unknown>,
    role?: 'user' | 'assistant' | 'system' | 'tool',
  ) => void
  trustPath: (p: unknown) => string
  verifyThenResolve: (claim: CompletionClaim) => Promise<void>
  webOnlyStreakRef: RefObject<number>
}

export function createApplyChunk(deps: ApplyChunkDeps) {
  const {
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
  } = deps
  const applyChunk = (chunk: {
    type: string
    text?: string
    toolCall?: { name: string; args: Record<string, unknown> }
  }) => {
    console.log('[conv] chunk', chunk.type)
    if (chunk.type === 'stream-reset') {
      // 网关超时重试：丢掉半截流，等新流补上
      streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
      setWorkingStage('重试中…')
      setMessages((p) => {
        const last = p[p.length - 1]
        if (!last || last.role !== 'assistant' || last.status !== 'streaming') return p
        return [...p.slice(0, -1), { ...last, content: '', reasoning: '', toolCalls: [] }]
      })
      return
    }
    // 2026-08-15 P2：当前 tool-call chunk 的卡稳定 id（函数级——updater 闭包引用；tool-call chunk 时赋值）
    let tcId: string | undefined
    // V1.5 S1 Task 1.3：协议工具（propose_goal/propose_plan/report_completion/ask_user）结果文本
    // （函数级——updater 闭包引用；判定/副作用全在事件层，updater 只落卡状态——双调安全）
    let protocolResult: string | undefined
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
      streamingRef.current.toolCalls.push({
        name: chunk.toolCall.name,
        args: chunk.toolCall.args,
        status: 'pending',
        id: tcId,
      })
      // V1.5 S1 Task 1.3：协议工具分支（ADR-009 拦截点——虚拟工具不真实执行，结果由本处合成）。
      // 判定（decideProtocolToolCall 纯函数）+ 副作用（setPendingState/tlog）全在事件层——
      // 每事件恰好一次（updater 双调安全——对齐「副作用移出 updater」惯例）。
      // 状态机只经 setPendingState 进入（不变量 1——决策是状态推进唯一输入）；resolution 走 S4 现有 verifyThenResolve 路径
      // （不变量 4：已解决卡条件 = verifyCompletion 通过——不直接置决策点）。
      // V1.5 S2 A-017：协议工具**置 pending 时**置挂起标记（deer-flow 兄弟调用丢弃语义——同轮
      // 后续普通工具不再执行）。注意：只在 pending 分支置位——reject（乱序拒绝）/invalid（参数
      // 校验失败）分支不挂起（无决策点待确认——兄弟工具无「等确认」语义；A-017-3 测试覆盖 reject
      // 并存——read 照常执行）。suspendRoundRef 只对本轮生效（runChat 起点复位）。
      if (PROTOCOL_TOOL_NAMES.has(chunk.toolCall.name)) {
        // S1-St-1：since 由调用方传入（事件层取时钟——纯函数不取时钟）
        const d = decideProtocolToolCall(
          stateRef.current,
          chunk.toolCall.name,
          chunk.toolCall.args,
          new Date().toISOString(),
        )
        if (d.action === 'pending') {
          suspendRoundRef.current = true
          const { kind, content } = d
          if (kind === 'goal') {
            const p = content.proposal as GoalProposal
            tlog(
              'proposal.goal',
              {
                statement: p.statement,
                ...(p.assumptions.length > 0 ? { assumptions: p.assumptions } : {}),
              },
              'assistant',
            )
            setPendingState('goal', { proposal: content.proposal, since: content.since })
            protocolResult = '目标提议已提交——等待用户确认'
          } else if (kind === 'plan') {
            const p = content.proposal as PlanProposal
            tlog(
              'proposal.plan',
              { ok: true, summary: p.summary, files: p.files.map((f) => f.path) },
              'assistant',
            )
            // P0-03（不变量 6）：提议阶段不写 plannedFiles——方案只有用户确认后才形成写入边界。
            // 派生唯一入口：userDecided(plan, confirm) → derivePlannedFiles；拒绝不落清单。
            setPendingState('plan', { proposal: content.proposal, since: content.since })
            protocolResult = '执行方案提议已提交——等待用户确认执行'
          } else {
            const p = content.proposal as CompletionClaim
            tlog(
              'proposal.completion',
              {
                ok: true,
                summary: p.summary,
                verification: p.evidence.verification.length,
                pendingQuestions: p.evidence.pendingQuestions.length,
              },
              'assistant',
            )
            // S4 证据门（不变量 4）：核验通过才置 resolution 决策点（verifyThenResolve 内部
            // setPendingState）——证据不足 → evidence_missing 打点 + 回填引导（不弹卡）
            void verifyThenResolve(p)
            protocolResult = '完成声明已提交——系统核验中，等待用户确认'
          }
        } else if (d.action === 'clarify') {
          // 会话级澄清（Task 1.2b 裁定）：不置 DecisionPoint——模型停轮等用户正文回复
          const { question, options, type } = d.content
          tlog(
            'proposal.clarify',
            { question, type, ...(options.length > 0 ? { options } : {}) },
            'assistant',
          )
          protocolResult =
            question +
            (options.length > 0
              ? options
                  .map(
                    (o, i) => `\n${i + 1}. ${o.label}${o.description ? `：${o.description}` : ''}`,
                  )
                  .join('')
              : '') +
            '\n（问题已提交用户——本轮到此为止，等用户回复后再继续）'
        } else {
          // reject（硬序拒绝）/ invalid（参数校验失败）——路径化引导文本回灌模型修参/重走顺序
          protocolResult = d.resultText
        }
      }
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
        session: sessionId,
      })
      // 2026-08-07 用户决策（显式确认）：【目标确认】标记不再同步 goalConfirmedRef（自报确认删除——
      // goalConfirmedRef 由 prop 同步（用户点确认卡 → MainWorkspace state → 248 行 effect））
      // 2026-08-15 D5：确认卡触发 → 会话级 PENDING（状态机冻结——A0 §3.2/§3.4 单一 PENDING 落地）
      // 原实现 pending 仅授权卡置位（useEffect 直接展开改）；目标/执行/达成卡的「冻结」靠轮级派生检测——
      // escalate 续聊后的新轮次模型仍可执行工具（pending 未置位漏洞）。现 done 时按派生结果置 pending，
      // canExecute 统一消费（pending 下所有工具无效——含只读——用户决策是下一状态唯一输入）。
      // sideEffectPending 与 maybeContinue 同源（UI 消息 status——拦截后为 done 不计；自动执行中为 pending 计）
      // A-004 补充：被拦截的副作用工具（confirm「等待你的决策」或 gate「方案未确认/目标未确认」——
      // write 被拦后模型连发消息场景）同样构成「等确认」决策点（done 分支置 pending 的依据）
      const lastUiMsg = messagesRef.current[messagesRef.current.length - 1]
      const uiCalls = lastUiMsg?.toolCalls ?? []
      const sideEffectPendingUi = uiCalls.some(
        (c) =>
          isSideEffectAction(c.name, String(c.args?.command ?? '')) &&
          (c.status === 'pending' ||
            // A-020：need-approval（授权卡挂起——tools.execute needApproval:true）同为「被拦等决策」；
            // 漏掉会让占位执行卡误判为空卡路径被跳过（L3「执行确认卡不漂移」实证）
            c.status === 'need-approval' ||
            String(c.result ?? '').includes('等待你的决策') ||
            String(c.result ?? '').includes('未确认')),
      )
      // S7（A0 审校 P1-1——S3 触发权 DoD 补课）：触发判定 = 领域层 deriveDecisionPoint（不变量 2——
      // 决策点确定性纯函数——单源）；renderer 只做**信号翻译**（解析 proposals + 兜底 userRequested）——
      // pendingCardToShow 文本探测兼容壳生产调用移除（降级为仅测试/备用）
      // V1.5 S3：文本标记降级——标记命中不再直接产卡（sysPrompt ⑬⑭⑮ 已改为工具契约主通道；
      // 标记=降级通道——仅工具调用不可用时）。探测到标记 → 打 protocol.text_fallback + 记录降级标记，
      // **不构造 proposals**（不置决策点）——done 分支末尾注入引导（合成 tool result + 引导文本）
      // 推动模型下一轮改用 propose_* 工具（maybeContinue 一轮改道闭环）。S4 才退役解析器本身。
      const goalMark = content.match(/【目标确认[:：]\s*([^】]+)/)
      const planMark = /【执行方案/.test(content)
      const claimMark = /【已达成/.test(content)
      const fallbackMarkers: string[] = []
      if (goalMark || /【目标确认/.test(content)) {
        fallbackMarkers.push('goal')
        tlog(
          'protocol.text_fallback',
          { marker: 'goal', content_snip: content.slice(0, 80) },
          'system',
        )
      }
      if (planMark) {
        fallbackMarkers.push('plan')
        tlog(
          'protocol.text_fallback',
          { marker: 'plan', content_snip: content.slice(0, 80) },
          'system',
        )
      }
      if (claimMark) {
        fallbackMarkers.push('completion')
        tlog(
          'protocol.text_fallback',
          { marker: 'completion', content_snip: content.slice(0, 80) },
          'system',
        )
      }
      const fallbackDetected = fallbackMarkers.length > 0
      // 降级路径不构造 proposals（文本标记不产卡）；正常路径（无标记）保留原 proposals 解析。
      // 注意：userRequested 信号（write 拦截/方案征询文本「等你确认」）是**非标记**的「等确认」语义——
      // 与降级无冲突（它们不来自标记，保留产卡路径）；plan 标记降级时 plannedFiles 也不并入（见下）
      const goalProposal: GoalProposal | undefined = fallbackDetected
        ? undefined
        : goalMark
          ? {
              statement: goalMark[1]?.trim() ?? (initialPrompt || content.trim()),
              // V1.5-S4 退役标注——extractAssumptionsSection 为假设提取（文本节提取，非解析），见 ADR-009
              assumptions: extractAssumptionsSection(content),
            }
          : undefined
      // V1.5-S4 退役标注——兜底调用（受 fallbackDetected 守卫：无降级标记才解析），见 ADR-009
      const planR = !fallbackDetected && planMark ? parsePlanProposal(content) : undefined
      // V1.5-S4 退役标注——兜底调用（受 fallbackDetected 守卫），见 ADR-009
      const claim = !fallbackDetected && claimMark ? parseCompletionClaim(content) : undefined
      const proposals: DecisionProposals = {
        ...(goalProposal ? { goal: goalProposal } : {}),
        ...(planR?.ok ? { plan: planR.proposal } : {}), // malformed/no-block → C3 不置决策点（诊断事件）
        ...(claim ? { completion: claim } : {}),
      }
      // C3 诊断：有【执行方案】标记但解析失败（格式漂移——模型被要求重输出；原始文本保留在对话审计）
      if (planR && !planR.ok) {
        tlog('proposal.plan', { ok: false, reason: planR.reason }, 'assistant')
      }
      // 兜底信号（旧 pendingCardToShow 文本征询语义——判定归领域层 userRequested 参数）：
      // write 被拦（sideEffectPendingUi 或本轮流副作用工具——write 被拦后模型连发消息场景）或
      // 方案征询文本（「等你确认」类）→ 执行确认点。S7（P1-1 修正）：本轮流副作用工具（streamingRef——
      // 流式 toolCalls 未清空前）也构成信号——旧实现靠渲染层 execSignal 兜底（无 pending——卡漂移风险）
      const sideEffectAttemptedThisRound = streamingRef.current.toolCalls.some((c) =>
        isSideEffectAction(c.name, String(c.args?.command ?? '')),
      )
      const textAskPlan =
        /(等你确认|你确认一下|确认一下|等你点头|你看行吗|你看行不行|可以的话我)/.test(content)
      const userRequested: DecisionKind | undefined =
        sideEffectPendingUi ||
        (sideEffectAttemptedThisRound &&
          stateRef.current.goalConfirmed &&
          !stateRef.current.planConfirmed) ||
        (textAskPlan && stateRef.current.goalConfirmed && !stateRef.current.planConfirmed)
          ? 'plan'
          : undefined
      const cardToShow = deriveDecisionPoint(stateRef.current, proposals, [], userRequested)
      // S3（§6 S3 + §8.2 E）：决策点置位携带 decisionContent 快照（卡渲染唯一来源——呈现内容完整审计；
      // 模型文本不再直接参与卡内容判定——文本标记只用于**探测**，内容取结构化解析结果）
      if (cardToShow !== 'none' && stateRef.current.pending === 'none') {
        if (cardToShow === 'plan') {
          // 方案提议 → PlanProposal（文件/假设/验证计划）或占位（write 拦截/征询——无结构内容）
          if (planR?.ok) {
            setPendingState('plan', {
              proposal: planR.proposal,
              since: new Date().toISOString(),
            })
            tlog(
              'proposal.plan',
              {
                ok: true,
                summary: planR.proposal.summary,
                files: planR.proposal.files.map((f) => f.path),
              },
              'assistant',
            )
          } else {
            // no-block（无方案标记）+ 决策点存在（write 拦截/方案征询「等你确认」）→ 等确认执行——
            // #6 真机 2026-08-30（P1-4）：原实现直接置空 proposal（卡占位空内容——用户确认一张空卡）。
            // 修正：回搜消息历史最近一次已登记的【执行方案】并复用其结构化内容（孤儿提议回收）；
            // 确实无历史提议才置占位
            let reused: PlanProposal | undefined
            for (let k = messages.length - 1; k >= 0; k--) {
              const mm = messages[k]
              if (mm.role !== 'assistant' || !/【执行方案/.test(mm.content)) continue
              // V1.5-S4 退役标注——孤儿提议回收兜底（回搜历史消息解析），见 ADR-009
              const r = parsePlanProposal(mm.content)
              if (r.ok) {
                reused = r.proposal
                break
              }
            }
            setPendingState('plan', {
              ...(reused ? { proposal: reused } : {}),
              since: new Date().toISOString(),
            })
            // A-020（S5 真机 2026-09-06）：无 proposal 的占位卡保留（write 被拦的同意面——L3「执行确认卡
            // 不漂移」契约；done 时 execute 结果尚未回填，sideEffectPendingUi 不可依赖）。占位卡的事故
            // 触发源（bash `2>/dev/null` 误判副作用→被拦→空卡冻结）由 classifyReadonly stderr 丢弃修正根除。
          }
        } else if (cardToShow === 'goal') {
          // 目标提议 → GoalProposal（statement + assumptions——S2 ⑬ 契约：必要时附「关键假设：」行）
          // S7（A0 审校 P1-3）：proposal.goal 结构化提议事件（§3.5——statement+assumptions——替代 task.goal_proposed 文本摘要）
          tlog(
            'proposal.goal',
            {
              statement: goalProposal?.statement ?? '',
              ...(goalProposal?.assumptions && goalProposal.assumptions.length > 0
                ? { assumptions: goalProposal.assumptions }
                : {}),
            },
            'assistant',
          )
          setPendingState('goal', {
            proposal: goalProposal ?? {
              statement: initialPrompt || content.trim(),
              assumptions: [],
            },
            since: new Date().toISOString(),
          })
        } else if (cardToShow === 'resolution') {
          // V1.5-S4 退役标注——完成声明兜底解析 → 已解决卡条件 = verifyCompletion 通过
          // （不变量 4 接线——不再直接置决策点；异步系统核验（V1a 代跑 + V1b 派生）后判定）
          if (claim) {
            tlog(
              'proposal.completion',
              {
                ok: true,
                summary: claim.summary,
                verification: claim.evidence.verification.length,
                pendingQuestions: claim.evidence.pendingQuestions.length,
              },
              'assistant',
            )
            void verifyThenResolve(claim)
          } else {
            tlog('proposal.completion', { ok: false }, 'assistant')
          }
        } else {
          setPendingState(cardToShow, { since: new Date().toISOString() })
        }
      }
      // S7（A0 审校 P1-1——S4 语义保留）：完成声明存在但 deriveDecisionPoint 证据门未命中
      // （证据不足 → none——设计 §3.3「不进入对账（引导由 S4 回填）」）——verifyThenResolve 统一处理：
      // 证据完整 → 弹已解决卡；证据不足 → evidence_missing 打点 + 回填引导（证据门由 verifyCompletion 承担——
      // 避免 deriveDecisionPoint 的 completionEvidenceComplete 门绕过 S4 引导路径——双判定器同源）
      if (claim && cardToShow !== 'resolution' && stateRef.current.pending === 'none') {
        tlog(
          'proposal.completion',
          {
            ok: true,
            summary: claim.summary,
            verification: claim.evidence.verification.length,
            pendingQuestions: claim.evidence.pendingQuestions.length,
          },
          'assistant',
        )
        void verifyThenResolve(claim)
      }
      // P0-03（不变量 6）：文本【执行方案】只用于展示/决策内容，不并入 plannedFiles——
      // 文本降级不产生确认卡，提前并入会让 write 绕过用户确认自动放行。
      // 清单唯一派生点仍是用户确认方案（userDecided(plan, confirm) → derivePlannedFiles）。
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
      // research→propose（分析期窄恢复——不改 StuckDetector 门控）：连续纯 web≥2 → 催 propose_goal 一次
      {
        const toolNames = streamingRef.current.toolCalls.map((c) => c.name)
        const onlyWeb =
          toolNames.length > 0 && toolNames.every((n) => n === 'web_search' || n === 'web_fetch')
        if (onlyWeb) webOnlyStreakRef.current += 1
        else webOnlyStreakRef.current = 0
        if (stateRef.current.goalConfirmed) {
          webOnlyStreakRef.current = 0
        } else {
          const rp = shouldNudgeProposeAfterResearch({
            goalConfirmed: stateRef.current.goalConfirmed,
            pending: stateRef.current.pending,
            toolNamesThisTurn: toolNames,
            webOnlyStreak: webOnlyStreakRef.current,
            alreadyNudged: researchProposeNudgedRef.current,
          })
          if (rp.nudge) {
            researchProposeNudgedRef.current = true
            tlog(
              'conversation.system_nudge',
              { kind: 'protocol', content: rp.message.slice(0, 200) },
              'system',
            )
            void sendRef.current?.({ silent: true, text: rp.message })
          }
        }
      }
      if (
        stateRef.current.goalConfirmed &&
        stateRef.current.pending === 'none' &&
        streamingRef.current.toolCalls.length === 0
      ) {
        // G-picky leaf C：拒方案后方案未确认时勿走 StuckDetector（会催 write，而 write 仍受 plan 门）——改催 propose_plan
        if (!stateRef.current.planConfirmed) {
          const toolNames = streamingRef.current.toolCalls.map((c) => c.name)
          const rp = shouldNudgeProposeAfterPlanReject({
            goalConfirmed: stateRef.current.goalConfirmed,
            planConfirmed: stateRef.current.planConfirmed,
            pending: stateRef.current.pending,
            planWasRejected: planWasRejectedRef.current,
            alreadyNudged: planRejectNudgedRef.current,
            toolNamesThisTurn: toolNames,
          })
          if (rp.nudge) {
            planRejectNudgedRef.current = true
            tlog(
              'conversation.system_nudge',
              { kind: 'protocol', content: rp.message.slice(0, 200) },
              'system',
            )
            void sendRef.current?.({ silent: true, text: rp.message })
          }
        } else {
          // G-picky leaf C：evidence_missing 后纯文本「做好了」→ StuckDetector 视 isDoneLike 不催工具；先催再 report
          const toolNamesDone = streamingRef.current.toolCalls.map((c) => c.name)
          const evNudge = shouldNudgeReportAfterEvidenceMissing({
            planConfirmed: stateRef.current.planConfirmed,
            pending: stateRef.current.pending,
            evidenceWasMissing: evidenceGuideCountRef.current > 0,
            alreadyNudged: evidenceReportNudgedRef.current,
            toolNamesThisTurn: toolNamesDone,
          })
          if (evNudge.nudge) {
            evidenceReportNudgedRef.current = true
            tlog(
              'conversation.system_nudge',
              { kind: 'protocol', content: evNudge.message.slice(0, 200) },
              'system',
            )
            void sendRef.current?.({ silent: true, text: evNudge.message })
          } else {
            // 2026-08-06 任务完成度：write/edit 成功标记产出（approve-files 规划文件 vs 已产出——deepcode unimplemented_files 借鉴）
            // 2026-08-14 S2：产出记录走状态机转换（applyToolResult——不可变更新）
            streamingRef.current.toolCalls.forEach((c) => {
              if ((c.name === 'write' || c.name === 'edit') && c.status === 'done' && c.file)
                applyTool({ name: c.name, ok: true, file: c.file })
            })
            const turn = evaluateTurnProgress({
              toolCalls: streamingRef.current.toolCalls.map((c) => ({
                name: c.name,
                status: c.status,
                file: c.file,
                command: String(c.args?.command ?? ''),
              })),
              content,
              prevReadFiles: prevReadFilesRef.current,
              plannedFiles: stateRef.current.plannedFiles,
              producedFiles: stateRef.current.producedFiles,
              // 2026-08-06 补充（用户「清单来源不只 approve-files」——③ projectFiles 项目文件树）：产出校验（规划文件出现在文件树=已产出）
              // 2026-08-15 坑 102 修复：projectFiles 统一绝对基准（MainWorkspace listDir 返回 basename——与 planned/produced 绝对基准分裂
              // → projectFiles.has(f) 恒 false → 文件树权威分支失效 → plannedComplete 只靠 produced 记录）；trustPath 归一
              projectFiles: new Set((recentFilesExternal ?? []).map((f) => trustPath(f))),
            })
            streamingRef.current.toolCalls.forEach((c) => {
              if (c.name === 'read' && c.file) prevReadFilesRef.current.add(c.file)
            })
            const { state, event } = detectStuck({ turn, prev: stuckStateRef.current })
            stuckStateRef.current = state
            if (event?.type === 'escalate') {
              tlog('stuck.escalated', { message: event.message }, 'system') // 2026-08-08 卡住升级打点
              onActionPromiseHint?.(null)
              void sendRef.current?.({ silent: true, text: event.message })
            } else if (event?.type === 'needs-human') {
              tlog('stuck.needs_human', { message: event.message }, 'system') // 2026-08-08 升级达上限转用户
              onActionPromiseHint?.(event.message)
            }
          }
        }
      }
      streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
      // V1.5 S2 A-017：本轮结束复位挂起标记（挂起只约束同轮兄弟调用——下一轮重新判定）
      suspendRoundRef.current = false
      // V1.5 S3：文本标记降级闭环——标记命中（fallbackDetected）且未置决策点（pending 仍 none——
      // 降级不产卡）→ 合成引导 tool result + 触发下一轮（模型收到「请改用 propose_* 工具」改用工具）。
      // silent 续聊不注入用户可见消息（对齐 escalate 模式）；防死循环：降级引导每会话最多 3 次
      // （textFallbackCountRef 计数——模型连续输出标记不改用工具则停止，避免自动续聊空转）
      if (
        fallbackDetected &&
        stateRef.current.pending === 'none' &&
        textFallbackCountRef.current < 3
      ) {
        textFallbackCountRef.current++
        // 按标记类型给针对性引导（目标/方案/完成各自对应工具）
        const guideByMarker = (m: string): string => {
          if (m === 'goal')
            return '请改用 propose_goal 工具提交目标提议（statement 一句话准确目标 + assumptions 列假设）'
          if (m === 'plan')
            return '请改用 propose_plan 工具提交执行方案（summary + files[{path,reason}] + assumptions + verification_plan）'
          return '请改用 report_completion 工具提交完成声明（summary + verification[{command,output,passed}] + pending_questions）'
        }
        const firstMarker = fallbackMarkers[0]
        void sendRef.current?.({
          silent: true,
          text: `【系统提示·非用户发言】检测到文本协议标记（${firstMarker}）——${guideByMarker(firstMarker)}`,
        })
      }
    }
    setMessages((prev) => {
      // 纯 UI 更新（无副作用——StrictMode 双调安全；onReasoning/setWorkingStage 已在事件层——Q3）
      // 2026-08-05 第五轮修复：定位「最后一条 streaming 的 assistant 消息」而非「最后一条消息」——
      // done 分支插入提示消息（isActionPromise）后，原 last 变成提示消息（status='done'）→ guard 拦截 → 流式消息 status 卡 streaming → 候选按钮不渲染（选项卡消失根因）
      // 从尾部向前找 streaming 消息；tool-call 保留原语义（无 streaming 时回退到最后一条 assistant）
      let target = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role !== 'assistant') continue
        if (prev[i].status === 'streaming') {
          target = i
          break
        }
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
        let result: string | undefined
        // V1.5 S1 Task 1.3：协议工具分支（须在 approve-files 特例之前——虚拟工具不真实执行，
        // 判定在事件层已完成，此处只落卡状态/结果文本——updater 纯函数，StrictMode 双调安全）
        if (PROTOCOL_TOOL_NAMES.has(chunk.toolCall.name)) {
          status = 'done'
          result = protocolResult
        } else if (chunk.toolCall.name === 'approve-files') {
          // #6 真机 2026-08-31（复验轮用户指出）：approve-files 硬序门——方案未确认不弹卡
          // 审计修正（stage-review-2026-08-31 Spec-1）：合成结果必须是引导拒绝文本——
          // 原假成功「文件已批量授权」比静默忽略更误导（模型以为已获授权）；main policy 分支
          // 为流式路径不可达的防御纵深（renderer 跳过执行——虚拟工具结果由本处合成）
          status =
            !stateRef.current.planConfirmed || stateRef.current.filesApproved
              ? 'done'
              : 'file-approval'
          if (status === 'done') {
            result = stateRef.current.planConfirmed
              ? '文件已批量授权（本任务不重复授权）'
              : '方案未确认——先输出【执行方案】（文件清单 + 一句话方案）等待用户「确认执行」，之后再调 approve-files 请求批量放行（批准文件清单 ≠ 确认执行）'
          }
        }
        next.toolCalls = [
          ...(next.toolCalls ?? []),
          {
            // 2026-08-15 P2：复用流事件层同步生成的稳定 id（闭包 tcId——同 args 卡并存的精确定位键）
            id: tcId,
            name: chunk.toolCall.name,
            args: chunk.toolCall.args,
            status,
            result,
          },
        ]
      }
      return [...prev.slice(0, target), next, ...prev.slice(target + 1)]
    })
    // 工具执行副作用（移出 updater——StrictMode 双调会执行两次；真实工具写文件等不可重复）
    // 2026-08-04 规划级授权：approve-files 跳过执行（虚拟工具——批准由 renderer approvePlan 处理）
    // V1.5 S1 Task 1.3：协议工具同为虚拟工具——不真实执行（决策内容由 renderer 协议分支经
    // setPendingState 承载；结果文本由事件层合成回灌模型）
    if (
      chunk.type === 'tool-call' &&
      chunk.toolCall &&
      !PROTOCOL_TOOL_NAMES.has(chunk.toolCall.name) &&
      chunk.toolCall.name !== 'approve-files'
    ) {
      const tc = chunk.toolCall
      // 2026-08-06 用户反馈「第一句话就有一个工具执行」：目标确认前工具门控——目标没澄清前不执行任何工具
      // （目标都没澄清，看目录/写文件都没意义）；工具直接 done + 提示（maybeContinue 回填给模型 → 模型停止调工具继续澄清目标）
      // 2026-08-03 v35：workingStage 人类化（原「调用工具 bash…」技术腔——按工具名映射自然描述）
      const stageMap: Record<string, string> = {
        read: '正在读取文件…',
        write: '正在写入文件…',
        edit: '正在修改文件…',
        bash: '正在执行命令…',
        search: '正在搜索…',
        // 2026-08-06 用户反馈「get_diagnostics 具体干什么了不知道」：LSP 工具名技术化 → 人类化描述（查代码错误/引用/定义等）
        get_diagnostics: '正在检查代码错误…',
        get_imports: '正在查看文件依赖…',
        find_definition: '正在定位代码定义…',
        find_references: '正在查找代码引用…',
        get_type_info: '正在查看类型信息…',
        get_call_chain: '正在查看代码结构…',
        // 2026-08-06 设计层升级：服务工具人类化
        'start-server': '正在启动开发服务器…',
        'check-server': '正在检查服务状态…',
        'stop-server': '正在停止服务…',
      }
      setWorkingStage(
        stageMap[tc.name] ??
          (tc.name.startsWith('find_') || tc.name.startsWith('get_') ? '正在查代码…' : '正在处理…'),
      )
      // ticket 14 L4 委托：低危文件操作（write/edit）命中委托规则 → 免确认直接执行（仍快照可回滚）；bash 高危永远单独授权
      // 2026-08-04 授权架构 v4：任务级信任——「允许并记住」的文件 write/edit 自动（沙箱内）；read/bash 只读由 main preApproval 裁决（沙箱内自动/沙箱外 ask）
      // 2026-08-07 会话级单一 PENDING 状态机（领域模型 §3.2/§3.4——重构：3 处分散 done 拦截合并为统一 pending 检测）：
      // 卡弹出（确认卡/授权卡）→ 等用户决策——模型执行类动作（write/edit/bash——有副作用）无效（做了白做——不执行）；
      // 信息类（read/search/check-capability——只读无副作用）放行（模型可准备方案/查证——「白做」对有副作用动作才有意义）
      // 2026-08-08 根因 3 修复③：plannedFiles 清单比较统一**双向 trustPath 规范化**——【执行方案】块解析可能发生在
      // rootPath 未设置时（存相对路径 'game.js'），write 判定时 rootPath 已设（trustPath 转 '/test/game.js'）→ 直接 has 不匹配
      // S3（Q5 单源）：判定引用领域层 inPlannedFiles（plannedFiles 已 trustPath 绝对化——参数同样归一化后传入；
      // renderer 不再自写匹配逻辑——领域层相对/绝对/目录尾斜杠兼容）
      const inPlannedFiles = (p: unknown): boolean =>
        inPlannedFilesDomain(stateRef.current, { name: 'write', path: trustPath(p) })
      const confirmPending = (
        content: string,
        calls: Array<{ name: string; status?: string; command?: string }>,
      ): boolean => {
        // 2026-08-14 S2b（缝隙 4/5）：确认卡触发走状态机派生——执行确认只认**有副作用动作**（探索 bash 不再触发）
        const sideEffectPending = calls.some(
          (c) => c.status === 'pending' && isSideEffectAction(c.name, c.command),
        )
        return (
          pendingCardToShow(
            stateRef.current.goalConfirmed,
            stateRef.current.planConfirmed,
            stateRef.current.resolutionConfirmed,
            content,
            sideEffectPending,
          ) !== 'none'
        )
      }
      // 2026-08-07 用户纠正（「无害≠有用」）：pending 下**所有工具都不执行**——read/search 虽只读无害但没用
      // （用户决策未到——结果无意义——做了白做）——模型停（maybeContinue releaseWorking）等用户决策
      // 2026-08-08 问题 2 修复（feedback.log 标注——「又检测，而且这个显示出来了，咱们定的不显示」）：
      // 拦截分支对 check-capability 同样 hidden——O2 静默语义「能力检测默认不展示」对执行/拦截一致
      // 2026-08-14 用户实测修复（「目标确认卡与授权卡不能并存」）：目标/执行确认未处理时副作用工具
      // **不执行也不弹授权卡**——canExecute 统一门控（A0 §3.5 活动边界：未确认目标 → 只澄清不产生执行动作；
      // 单一 PENDING 决策点互斥）。原 confirmPending 只认【目标确认】标记命中——模型第一轮直接调 bash 时
      // 标记未出现 → 走 main need-approval 授权卡 → 与 goalFallback 目标确认卡并存（两决策点冲突）
      const toolGate = canExecute(
        stateRef.current,
        {
          name: tc.name,
          command: String(tc.args?.command ?? ''),
          path: String(tc.args?.path ?? tc.args?.filePath ?? ''),
        },
        inPlannedFiles(tc.args?.path ?? tc.args?.filePath),
      )
      const confirmGate = confirmPending(streamingRef.current.content, [
        { name: tc.name, status: 'pending', command: String(tc.args?.command ?? '') },
      ])
      // 2026-08-15 D5：会话级 PENDING（状态机冻结）下**所有工具无效**（含只读——A0 §3.4「无害≠有用」：
      // 用户决策未到——read/search 结果无意义——做了白做）。原条件只拦 side-effect——escalate 新轮
      // 在 pending 下仍可 read（轮级 confirmGate 无信号时不拦 + readonly 豁免）→ 与状态机语义不一致
      const pendingBlocked = stateRef.current.pending !== 'none'
      // V1.5 S2 A-017：同轮并存挂起——本轮流中出现协议工具（suspendRoundRef）后，兄弟普通工具
      // 一律挂起不执行（deer-flow 兄弟调用丢弃语义——Spike-4）。与 pendingBlocked 互补：
      // pendingBlocked 拦的是**已置 pending 后**的新轮；本标记拦的是**同轮先行到达的协议工具之后**
      // 的兄弟调用（协议工具置 pending 在事件层同步发生，但普通工具执行是异步副作用——竞态窗口）。
      // 结果文本回灌模型「等确认后重试」——挂起不是拦截（不置 tool.blocked——决策点尚未弹卡
      // 渲染时无卡可回；用户确认后 maybeContinue 的下一轮模型自然重试）
      if (suspendRoundRef.current) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) =>
            c.name === tc.name && c.status === 'pending'
              ? {
                  ...c,
                  status: 'done' as const,
                  result: `${tc.name} 挂起——本轮已提交协议提议等待用户确认，确认后请重新执行`,
                }
              : c,
          )
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      if (
        confirmGate ||
        pendingBlocked ||
        (!toolGate.ok && isSideEffectAction(tc.name, String(tc.args?.command ?? '')))
      ) {
        const gateReason = pendingBlocked
          ? `会话等待你的决策（${stateRef.current.pending}）——此动作未执行`
          : confirmGate
            ? '等待你的决策'
            : toolGate.reason
        // 2026-08-15 DDD 重建：工具拦截事件（tool.blocked——G3 缺口：拦截原因落时间线，消费方无需反推代码）
        tlog(
          'tool.blocked',
          {
            name: tc.name,
            gate: pendingBlocked ? 'pending' : confirmGate ? 'confirm' : 'gate',
            reason: gateReason,
            args: tc.args,
          },
          'tool',
        )
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) =>
            c.name === tc.name && c.status === 'pending'
              ? {
                  ...c,
                  status: 'done' as const,
                  hidden: tc.name === 'check-capability',
                  result:
                    confirmGate || pendingBlocked
                      ? `${tc.name} 等待你的决策——此动作未执行（点确认卡后模型会重新执行）`
                      : `${tc.name} 未执行：${gateReason}`,
                }
              : c,
          )
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
      if (tc.name === 'write' && stateRef.current.filesApproved && !inPlannedFiles(tc.args.path)) {
        // 2026-08-06 edit 豁免（改现有文件=操作明确——B 类文件操作直接改）；write 新建强制规划
        // 2026-08-15 DDD 重建：偏离清单拦截事件（tool.blocked gate='out-of-plan'——拒绝带边界可回放）
        tlog(
          'tool.blocked',
          {
            name: tc.name,
            gate: 'out-of-plan',
            reason: `${tc.args.path} 不在批准清单`,
            args: tc.args,
          },
          'tool',
        )
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const calls = (last.toolCalls ?? []).map((c) =>
            c.name === tc.name && c.status === 'pending'
              ? (() => {
                  const approved = [...stateRef.current.plannedFiles]
                    .map((p) => p.split('/').pop())
                    .join('、')
                  return {
                    ...c,
                    status: 'done' as const,
                    result: `${tc.args.path} 不在批准清单（已批准：${approved || '无'}）——不要重复尝试；改写清单内文件，或再次调 approve-files 补充该文件（列出文件+原因）`,
                  }
                })()
              : c,
          )
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        return
      }
      // 2026-08-08 根因 3 修复③：write 门控与【执行方案】块联动——用户确认执行（planConfirmedRef）后，
      // 【执行方案】块解析的清单内文件（plannedFilesRef）视为已批准（approved=true）→ 绕过 main 规划门控
      // （模型已列清单 + 用户已确认执行 = 认可这批文件——无需再点 approve-files 卡；清单外文件仍被 main 门控拦）
      const execPlanApproved =
        tc.name === 'write' && stateRef.current.planConfirmed && inPlannedFiles(tc.args.path)
      const autoApproved =
        execPlanApproved || (delegateLowRisk && toolRisk(tc.name) === 'low') || isTrusted(tc.args)
      void (
        window.neonforge.tools?.execute?.(tc.name, tc.args, {
          approved: autoApproved,
          rootPath: rootPath ?? undefined,
          sessionId,
        }) ?? Promise.resolve({ ok: false, error: 'tools 通道未就绪' })
      ).then((r) => {
        const data = r.data as { file?: string; snapshot?: boolean } | undefined
        // 13 交付包联动：真实文件操作成功（write/edit 返回 file）→ 上报变更（产物区展示）
        if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
        // 2026-08-14 S2：工具结果 → 状态机转换唯一入口（applyToolResult——进度/失败标志汇入状态）
        applyTool({
          name: tc.name,
          ok: r.ok,
          needApproval: r.needApproval,
          policy: r.policy,
          file: data?.file,
        })
        tlog(
          r.ok ? 'tool.executed' : 'tool.failed',
          { name: tc.name, needApproval: r.needApproval, error: r.error },
          'tool',
        )
        // 2026-08-15 DDD 重建：main 侧策略引导（write 未规划 policy）→ tool.blocked（非执行失败——gate='policy'）
        if (!r.ok && r.policy) {
          tlog(
            'tool.blocked',
            { name: tc.name, gate: 'policy', reason: r.error, args: tc.args },
            'tool',
          )
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
                    const cap = summarizeCapability(
                      r.data as {
                        capabilities?: Array<{ id: string; status: string; detail?: string }>
                      },
                    )
                    tlog(
                      'capability.checked',
                      {
                        capabilities:
                          (r.data as { capabilities?: Array<{ id: string; status: string }> })
                            ?.capabilities ?? [],
                        missing: cap.needsUser,
                      },
                      'tool',
                    )
                    return {
                      ...c,
                      status: 'done' as const,
                      result: cap.summary,
                      hidden: !cap.needsUser,
                      rawResult:
                        typeof r.data === 'string'
                          ? r.data.slice(0, 16000)
                          : JSON.stringify(r.data ?? '').slice(0, 16000),
                    }
                  }
                  // 2026-08-06 修正重写可见性（用户「第二次 write 很快不知道发生了什么——只需知道第二次是 fix bug」）：
                  // write 且该文件之前已写过（producedFilesRef 已有）→ 卡上标记「修正重写」——用户看到第二次是修正不是重复
                  const isRewrite =
                    tc.name === 'write' &&
                    !!data?.file &&
                    stateRef.current.producedFiles.has(data.file)
                  return {
                    ...c,
                    status: 'done' as const,
                    result: (isRewrite ? '⚠️ 修正重写——' : '') + fmtToolResult(r),
                    rawResult:
                      typeof r.data === 'string'
                        ? r.data.slice(0, 16000)
                        : JSON.stringify(r.data ?? '').slice(0, 16000),
                    file: data?.file,
                    canRevert: !!(data?.file && data.snapshot),
                  }
                })()
              : {
                  ...c,
                  status: r.needApproval ? ('need-approval' as const) : ('error' as const),
                  result: r.error,
                }
          })
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
      })
    }
  }
  return applyChunk
}
