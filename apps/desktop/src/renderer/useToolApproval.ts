// 工具授权 handler 封装（2026-08-15 Q1b——ConversationPanel 瘦身：批准/拒绝/记住/合并/回滚/停止）
// 依赖注入（组件状态交织——setMessages/续聊链/流式 ref 经参数传入；不可变依赖走 deps）
import type { ToolCallMsg, Msg } from './ConversationPanel'
import type { ApprovalRequest, RejectReason } from '../domain/conversationState'
// 2026-11-24 审计：批量批准必须按风险过滤（bash/未知工具保留授权卡）
import { toolRisk } from './authModel'

/** 拒绝记忆 risk 分级（S7 P1-2——复用工具卡既有 risk 判定语义：bash 高危/其余 low-medium） */
function classifyRiskForReject(tc: ToolCallMsg): 'low' | 'medium' | 'high' {
  if (tc.name === 'bash') return 'high'
  return tc.name === 'write' || tc.name === 'edit' ? 'medium' : 'low'
}

export interface UseToolApprovalDeps {
  setMessages: (fn: (prev: Msg[]) => Msg[]) => void
  tlog: (
    type: string,
    detail: Record<string, unknown>,
    role?: 'user' | 'assistant' | 'system' | 'tool',
  ) => void
  fmtToolResult: (r: { ok: boolean; data?: unknown }) => string
  trustPath: (p: unknown) => string
  rootPath?: string | null
  sessionId: string
  onToolResult?: (r: { name: string; file?: string; ok: boolean }) => void
  // P1 修复：授权结果（approved/rejected）——队列恢复不能只看 pendingApproval 变 false
  onApprovalResolved?: (result: 'approved' | 'rejected') => void
  // 状态机转换（useConversationState）
  applyTool: (r: {
    name: string
    ok: boolean
    needApproval?: boolean
    policy?: boolean
    file?: string
  }) => void
  grantPlan: (files: string[]) => void
  // S7（A0 审校 P1-2）：授权拒绝 → approvalDecided（§3.4 C6——拒绝记忆登记——同轮同类短封）
  rejectApproval: (request: ApprovalRequest, reason: RejectReason) => void
  // 任务信任（addTrust 定义于组件——依赖 rootPath/沙箱判定）
  addTrust: (args: Record<string, unknown>) => void
  // 续聊链
  acquireChain: () => Promise<() => void>
  maybeContinue: (depth: number, sid: number) => Promise<void>
  // ADR-013/审查修复：授权/批准直连续聊路径结束后衔接排队消息（原只有 send/retry finally 会 flush）
  flushPendingSend: () => void
  chatRef: { current: { depth: number } | null }
  sessionRef: { current: number }
  // 流式 ref（stopToolCall 中止链用）
  streamingSidRef: { current: number }
  streamingRef: { current: { content: string; reasoning: string; toolCalls: ToolCallMsg[] } }
  // working 状态
  setWorking: (v: boolean) => void
  onWorkingChange?: (v: boolean) => void
  setWorkingStage: (s: string) => void
}

export function useToolApproval(deps: UseToolApprovalDeps) {
  const {
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
    flushPendingSend,
    chatRef,
    sessionRef,
    streamingSidRef,
    streamingRef,
    setWorking,
    onWorkingChange,
    setWorkingStage,
  } = deps

  // 按消息定位工具卡更新（同工具不同实例可区分——args 相同匹配；2026-08-14 冒烟修复）
  // 2026-08-15 P2（时间线实证 a08d1775：同 args bash 双卡并存 → name+args 匹配从后往前错位到新卡 →
  // 旧卡永不消失 → e2e 反复点 → 16 个 npm install 并发执行）：**按稳定 id 精确定位**（渲染闭包 tc.id =
  // 流事件层生成——同 args 卡各有 id）；id 定位失败 = 卡已不存在 → 不 patch（防误伤同 args 其他卡）；
  // 旧存档（断点续做恢复的消息无 id）→ fallback 原 name+args 匹配
  const patchToolCall = (
    idx: number,
    patch: (c: ToolCallMsg) => ToolCallMsg,
    msg: ToolCallMsg,
  ): void => {
    setMessages((prev) => {
      if (msg.id) {
        for (let mi = prev.length - 1; mi >= 0; mi--) {
          const m = prev[mi]
          if (m.role !== 'assistant' || !m.toolCalls) continue
          const ci = m.toolCalls.findIndex((x) => x.id === msg.id)
          if (ci >= 0) {
            const updated = m.toolCalls.map((x, i) => (i === ci ? patch(x) : x))
            return [...prev.slice(0, mi), { ...m, toolCalls: updated }, ...prev.slice(mi + 1)]
          }
        }
        return prev
      }
      for (let mi = prev.length - 1; mi >= 0; mi--) {
        const m = prev[mi]
        if (m.role !== 'assistant' || !m.toolCalls) continue
        const c = m.toolCalls[idx]
        if (
          c &&
          c.name === msg.name &&
          JSON.stringify(c.args ?? {}) === JSON.stringify(msg.args ?? {})
        ) {
          const updated = m.toolCalls.map((x, i) => (i === idx ? patch(x) : x))
          return [...prev.slice(0, mi), { ...m, toolCalls: updated }, ...prev.slice(mi + 1)]
        }
      }
      return prev
    })
  }

  const approveToolCall = (idx: number, tc: ToolCallMsg): void => {
    tlog('tool.approved', { name: tc.name }, 'system')
    tlog('card.resolved', { card: 'approval', action: 'approve', name: tc.name }, 'system')
    onApprovalResolved?.('approved')
    // #6 真机 2026-08-30（P1-5——用户点名设计违背）：write/edit 批准即文件级绑定（任务边界内同文件免重复授权）——
    // 原实现仅「允许并记住」按钮绑文件，普通批准只绑单次调用 → 同文件每次修改都弹卡（真机连弹 3 张）。
    // 沙箱内有界（addTrust 内建检查）+ 任务边界清空（clearTrust）——安全底线不变。
    // 附带修复 P2-9：获批调用失败（路径错）后修正重试不再重复弹卡
    if (tc.name === 'write' || tc.name === 'edit') addTrust(tc.args)
    patchToolCall(idx, (c) => ({ ...c, status: 'pending' as const }), tc)
    void window.neonforge.tools
      ?.execute?.(tc.name, tc.args, {
        approved: true,
        approvalSource: 'user',
        rootPath: rootPath ?? undefined,
        sessionId,
      })
      .then((r) => {
        const data = r.data as { file?: string; snapshot?: boolean } | undefined
        if (r.ok && data?.file) onToolResult?.({ name: tc.name, file: data.file, ok: true })
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
        patchToolCall(
          idx,
          (c) =>
            r.ok
              ? {
                  ...c,
                  status: 'done' as const,
                  result: fmtToolResult(r),
                  rawResult:
                    typeof r.data === 'string'
                      ? r.data.slice(0, 16000)
                      : JSON.stringify(r.data ?? '').slice(0, 16000),
                  file: data?.file,
                  canRevert: !!(data?.file && data.snapshot),
                }
              : { ...c, status: 'error' as const, result: r.error },
          tc,
        )
        // 流式链互斥：授权续聊也占锁排队（chunk 交错防护）
        setTimeout(async () => {
          const sid = sessionRef.current
          const release = await acquireChain()
          try {
            await maybeContinue(chatRef.current?.depth ?? 0, sid)
          } finally {
            release()
            if (sessionRef.current === sid) flushPendingSend()
          }
        }, 150)
      })
  }

  const rejectToolCall = (
    calls: ToolCallMsg[],
    idx: number,
    reason: RejectReason = { kind: 'direction' },
  ): void => {
    const tc = calls[idx]
    // S7（A0 审校 P1-2 接线）：拒绝记忆登记（§3.4 C6——approvalDecided——同轮同类动作短封——
    // canExecute 消费 deniedApprovals；pending 清除 + decisionContent 清理由转换承担）
    // 2026-11-24 审计：拒绝原因可为选择器结果（默认 direction；调用方未传时保持旧语义）
    if (tc) {
      const subject = String(tc.args?.command ?? tc.args?.path ?? tc.args?.filePath ?? '')
      rejectApproval(
        {
          toolName: tc.name,
          subject,
          reason: '用户拒绝了授权请求',
          risk: classifyRiskForReject(tc),
        },
        reason,
      )
    }
    // 2026-08-15 DDD 重建：授权拒绝事件（G2 缺口——原无打点，卡生命周期不可回放）
    tlog('tool.rejected', { name: tc?.name, args: tc?.args }, 'system')
    tlog(
      'card.rejected',
      { card: 'approval', action: 'reject', name: tc?.name, reason: reason.kind },
      'system',
    )
    onApprovalResolved?.('rejected')
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) =>
        i === idx ? { ...c, status: 'error' as const, result: '已拒绝授权——未执行' } : c,
      )
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
  }

  // 允许并记住（本次任务内此文件 write/edit 自动）——授权疲劳核心解法
  const rememberAndApprove = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg): void => {
    tlog(
      'tool.remembered',
      { name: tc.name, file: String(tc.args.path ?? tc.args.filePath ?? '') },
      'system',
    )
    addTrust(tc.args)
    approveToolCall(idx, tc)
  }

  // 批量「全部允许并记住」——一条消息内多个待授权文件一次批准整批
  // 2026-11-24 审计：只批低危文件操作；bash/未知工具留在授权卡（「记住」不能绕过高危逐次确认）
  const approveAllRemember = (calls: ToolCallMsg[]): void => {
    const pending = calls.filter((c) => c.status === 'need-approval' && toolRisk(c.name) === 'low')
    if (pending.length === 0) return
    pending.forEach((c) => addTrust(c.args))
    pending.forEach((c) => approveToolCall(calls.indexOf(c), c))
  }

  // 批准计划文件清单（追加语义 + 幂等标记 + 通知 main）
  const approvePlan = (idx: number, tc: ToolCallMsg): void => {
    tlog(
      'tool.approved',
      {
        name: 'approve-files',
        files: ((tc.args.files ?? []) as Array<{ path: string }>).map((f) => f.path),
      },
      'system',
    )
    tlog('card.resolved', { card: 'file-approval', action: 'approve' }, 'system')
    const files = (tc.args.files ?? []) as Array<{ path: string }>
    files.forEach((f) => addTrust({ path: f.path }))
    grantPlan(files.map((f) => trustPath(f.path)))
    // D3（ADR-005）：PlannedFiles 权威在 main——批准清单同步落盘（取代 tools.filesApproved）
    void window.neonforge.plannedFiles?.add(files.map((f) => trustPath(f.path)))
    // 2026-11-17 审查修复：file-approval 也是授权结果——必须通知队列恢复（原只在 approveToolCall/reject 回调）
    onApprovalResolved?.('approved')
    patchToolCall(
      idx,
      (c) => ({
        ...c,
        status: 'done' as const,
        result: `已批准 ${files.length} 个文件（本次任务自动放行）`,
      }),
      tc,
    )
    setTimeout(() => {
      const sid = sessionRef.current
      void maybeContinue(chatRef.current?.depth ?? 0, sid).finally(() => {
        if (sessionRef.current === sid) flushPendingSend()
      })
    }, 150)
  }

  // 快照回滚（write/edit 写前已快照——按 file 匹配更新）
  const revertToolCall = (tc: ToolCallMsg): void => {
    if (!tc.file) return
    void window.neonforge.tools?.revert?.(tc.file, sessionId).then((r) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          let changed = false
          const updated = m.toolCalls.map((c) => {
            if (c.file !== tc.file || c.status !== 'done') return c
            changed = true
            return {
              ...c,
              status: 'reverted' as const,
              result: r.ok ? '已回滚——文件恢复原样' : (r.error ?? '回滚失败'),
            }
          })
          return changed ? { ...m, toolCalls: updated } : m
        }),
      )
    })
  }

  // 可撤销：停止当前操作 = 中止整条链（kill bash + sid++ 失效旧流 + 卡标记已停止）
  // 2026-11-28 审计：原签名 (_calls, _idx) 两参数均不读取（全局中止语义）——删除避免误读为按卡停止
  const stopToolCall = (): void => {
    void (window.neonforge.tools?.cancel?.() ?? Promise.resolve({ ok: false }))
    sessionRef.current++
    streamingSidRef.current = 0
    streamingRef.current = { content: '', reasoning: '', toolCalls: [] }
    setWorking(false)
    onWorkingChange?.(false)
    setWorkingStage('')
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.toolCalls || m.toolCalls.length === 0) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((c) =>
            c.status === 'pending' || c.status === 'need-approval'
              ? { ...c, status: 'error' as const, result: '已停止——未继续执行' }
              : c,
          ),
        }
      }),
    )
  }

  // 疲劳防护：同批多个低危文件操作合并授权（bash 高危永不合并——canMergeApprove 已保证）
  // 2026-11-24 审计修复：批量批准不得把高危调用混进「全部」——
  //   - 单个待批调用：文本/按钮确认即对该调用的逐项确认（高危也可以，仍是单次单卡）；
  //   - 多个待批调用：只批低危文件操作，bash/未知工具保留授权卡（高危永远单独确认）。
  // 文本批准路径（useChatEngine）与「允许全部」按钮共用此门。
  const approveAllToolCalls = (calls: ToolCallMsg[]): void => {
    const pending = calls.filter((tc) => tc.status === 'need-approval')
    if (pending.length === 0) return
    const targets =
      pending.length === 1 ? pending : pending.filter((tc) => toolRisk(tc.name) === 'low')
    for (const tc of targets) {
      const idx = calls.indexOf(tc)
      if (idx >= 0) approveToolCall(idx, tc)
    }
  }

  return {
    patchToolCall,
    approveToolCall,
    rejectToolCall,
    rememberAndApprove,
    approveAllRemember,
    approvePlan,
    revertToolCall,
    stopToolCall,
    approveAllToolCalls,
  }
}
