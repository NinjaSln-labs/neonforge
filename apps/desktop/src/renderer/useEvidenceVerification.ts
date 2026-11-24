// P1-05 阶段 5：完成声明系统对账（从 ConversationPanel 提取；行为不变）。
// V1a 系统代跑 + V1b diff 派生 → verifyCompletion：通过置 resolution 决策点；不足回填引导（有护栏）。
import type { RefObject } from 'react'
import {
  buildEvidenceBackfill,
  deriveDiffs,
  evidenceGuideMaxAttempts,
  verifyCompletion,
  type CompletionClaim,
  type ConversationState,
  type SystemVerifier,
} from '../domain/conversationState'
import { resolveSandboxPath } from '../domain/sandboxPath'
import type { useConversationState } from './useConversationState'
import type { TimelineLog } from './useTimelineLog'

type SetPending = ReturnType<typeof useConversationState>['setPending']

export interface EvidenceVerificationDeps {
  evidenceGuideCountRef: RefObject<number>
  onActionPromiseHint?: (hint: string | null) => void
  /** 排队队列（对账引导在 working 时入队，按序 flush） */
  pendingSendRef: RefObject<string[]>
  rootPath?: string | null
  sendRef: RefObject<
    (opts?: { silent?: boolean; text?: string; queued?: boolean }) => Promise<void>
  >
  sessionId: string
  /** 回合归属（停止/新回合会自增——异步核验结果不得落到旧/新回合） */
  sessionRef: RefObject<number>
  setPendingState: SetPending
  stateRef: RefObject<ConversationState>
  tlog: TimelineLog
  workingRef: RefObject<boolean>
}

export function useEvidenceVerification(
  deps: EvidenceVerificationDeps,
): (claim: CompletionClaim) => Promise<void> {
  const {
    evidenceGuideCountRef,
    onActionPromiseHint,
    pendingSendRef,
    rootPath,
    sendRef,
    sessionId,
    sessionRef,
    setPendingState,
    stateRef,
    tlog,
    workingRef,
  } = deps
  // S4 完成对账（不变量 4 接线）：已解决卡条件 = verifyCompletion(claim, systemState).ok
  // V1a 系统代跑（main IPC——mock/降级无则纯逻辑）+ V1b diff 派生（领域层单源）→ 判定：
  // ok → 置 resolution 决策点（弹已解决卡）；ok=false → evidence_missing 打点 + 回填引导（模型重新输出带证据声明）
  // ADR-004：领域层同步消费快照——IO（代跑）在应用层（此处 await 后快照进 verifyCompletion）
  // 引导护栏（S4 复审）：连续引导计数——≥2 次证据不足不再自动 send（防回填死循环——坑 103 同构：
  // 任何自动机制必须配套收敛判定；超限后停止自动引导，用户可见引导消息后手动处理）
  return async (claim: CompletionClaim): Promise<void> => {
    // 2026-11-15 审查修复：核验是异步的——记录发起时的回合归属；停止/新回合（sessionRef 自增）后，
    // 旧声明的核验结果不得置 resolution 决策点或回填引导（否则旧回合的「已解决」卡冻结新回合）。
    const sid = sessionRef.current
    const bridge = window.neonforge?.completion
    let systemState: SystemVerifier | undefined
    if (bridge?.verify) {
      try {
        const commands = claim.evidence.verification
          .filter((v) => v.passed !== false)
          .map((v) => v.command)
        // 计划清单绝对化后交给 main 做存在性核对（bash 等非 write/edit 途径产出也认定已产出）
        const planned = [...stateRef.current.plannedFiles].map((p) =>
          resolveSandboxPath(rootPath ?? '', p),
        )
        const verified = await bridge.verify(commands, rootPath ?? null, planned)
        if (verified) {
          systemState = {
            verificationResults: verified.results ?? {},
            deriveDiffs,
            plannedFiles: stateRef.current.plannedFiles,
            producedFiles: stateRef.current.producedFiles,
            existingFiles: new Set(verified.existing ?? []),
          }
        }
      } catch {
        // 核验服务异常 → 降级纯逻辑判定（不阻断弹卡路径）
      }
    }
    const v = verifyCompletion(claim, systemState)
    // 核验期间被停止/新回合接管 → 旧声明的任何结果（含验收证据绑定、计数、决策点）都不得落地
    if (sessionRef.current !== sid) return
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
        if (sessionRef.current !== sid) return // 回合已停止/被新回合接管
      }
      if (sessionRef.current !== sid) return
      if (stateRef.current.pending !== 'none') return
      // 2026-11-24 审计：证据快照随决策内容入 decisionContent——解决卡据此渲染「系统核验 ✓ /
      // 未经系统核验」（原先只渲染 pendingQuestions，核验结果算完即弃）。
      setPendingState('resolution', {
        proposal: claim,
        since: new Date().toISOString(),
        verification: systemState?.verificationResults ?? {},
        unverifiable: v.unverifiable,
      })
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
        if (sessionRef.current !== sid) return // 回合已停止/被新回合接管——不写旧引导
        if (workingRef.current) pendingSendRef.current.push(nudge)
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
}
