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
import type { useConversationState } from './useConversationState'
import type { TimelineLog } from './useTimelineLog'

type SetPending = ReturnType<typeof useConversationState>['setPending']

export interface EvidenceVerificationDeps {
  evidenceGuideCountRef: RefObject<number>
  onActionPromiseHint?: (hint: string | null) => void
  pendingSendRef: RefObject<string>
  rootPath?: string | null
  sendRef: RefObject<(opts?: { silent?: boolean; text?: string; queued?: boolean }) => Promise<void>>
  sessionId: string
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
}
