// L1 领域逻辑测试——意图确认重设计 S1（测试域 DDD §9.2/§9.5）
// 组织原则：describe = 不变量（Inv 1-8 穷举矩阵）+ 值对象 + 状态空间；it = 场景/状态组合（不按缺陷号命名——坑号留注释）
// 覆盖矩阵（§9.2 追溯关系）：每个不变量 describe 顶部标注承载函数
import { describe, it, expect } from 'vitest'
import {
  initialState,
  userDecided,
  approvalDecided,
  userConfirmed,
  userRejected,
  setPending,
  approvalGranted,
  applyToolResult,
  deriveDecisionPoint,
  sessionGate,
  actionGate,
  canExecute,
  classifyReadonly,
  classifyAction,
  verifyCompletion,
  buildEvidenceBackfill,
  completionEvidenceComplete,
  decideProgressGuarantee,
  derivePlannedFiles,
  plannedComplete,
  isProgressing,
  pendingCardToShow,
  shouldStopContinuation,
  actionNeedsApproval,
  type ConversationState,
  type GoalProposal,
  type PlanProposal,
  type CompletionClaim,
  type CompletionEvidence,
  type ApprovalRequest,
  type RejectReason,
  type ActionAttribute,
  type PendingKind,
} from '../../src/domain/conversationState'

// —— 测试夹具（值对象——§9.2 测试对象 1：构造即校验） ——
const goal = (statement: string, assumptions: string[] = []): GoalProposal => ({
  statement,
  assumptions,
})
const plan = (
  files: Array<{ path: string; reason: string }>,
  extra: Partial<PlanProposal> = {},
): PlanProposal => ({
  summary: '方案',
  files,
  assumptions: [],
  verificationPlan: [],
  ...extra,
})
const evidence = (e: Partial<CompletionEvidence> = {}): CompletionEvidence => ({
  verification: [{ command: 'ls /test', passed: true }],
  diffs: [],
  pendingQuestions: [],
  ...e,
})
const claim = (c: Partial<CompletionClaim> = {}): CompletionClaim => ({
  summary: '做完了',
  evidence: evidence(),
  ...c,
})
const approvalReq = (r: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  toolName: 'bash',
  subject: 'rm -rf /',
  reason: '高危',
  risk: 'high',
  ...r,
})
const reason = (kind: RejectReason['kind'], text?: string): RejectReason => ({ kind, text })

// 目标+方案已确认的基准态（多数门控/派生测试前置）
function confirmed(s: ConversationState = initialState()): ConversationState {
  return userConfirmed(userConfirmed(s, 'goal'), 'plan')
}

// 全确认态（goal+plan+resolution）
function fullyConfirmed(s: ConversationState = initialState()): ConversationState {
  return userDecided(confirmed(s), 'resolution', { confirm: true })
}

// ============================================================================
// Inv 1 决策唯一输入：状态推进只能由用户决策发生（承载：userDecided/approvalDecided——§3.4）
// ============================================================================
describe('Inv 1 决策唯一输入——无决策无推进', () => {
  it('确认点推进只经 userDecided（goal/plan/resolution）', () => {
    expect(userDecided(initialState(), 'goal', { confirm: true }).goalConfirmed).toBe(true)
    expect(confirmed().planConfirmed).toBe(true)
    expect(userDecided(confirmed(), 'resolution', { confirm: true }).resolutionConfirmed).toBe(true)
  })

  it('非决策路径不推进确认位（applyToolResult/setPending/approvalGranted）', () => {
    let s = initialState()
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    s = setPending(s, 'goal')
    s = approvalGranted(s, ['/test/b.js'])
    expect(s.goalConfirmed).toBe(false)
    expect(s.planConfirmed).toBe(false)
    expect(s.resolutionConfirmed).toBe(false)
  })

  it('目标确认 = 任务边界（进度/清单/达成/拒绝记忆清零——继承 userConfirmed goal 语义）', () => {
    let s = confirmed()
    s = approvalDecided(s, approvalReq(), { confirm: false, reason: reason('direction') })
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(s.deniedApprovals.length).toBe(1)
    const next = userDecided(s, 'goal', { confirm: true })
    expect(next.goalConfirmed).toBe(true)
    expect(next.planConfirmed).toBe(false)
    expect(next.resolutionConfirmed).toBe(false)
    expect(next.plannedFiles.size).toBe(0)
    expect(next.producedFiles.size).toBe(0)
    expect(next.filesApproved).toBe(false)
    expect(next.deniedApprovals.length).toBe(0)
    expect(next.decisionContent).toBeUndefined()
  })

  it('plan 确认蕴含目标确认（继承 handleExecutionConfirmed 现状语义）', () => {
    const next = userDecided(initialState(), 'plan', { confirm: true })
    expect(next.goalConfirmed).toBe(true)
    expect(next.planConfirmed).toBe(true)
  })

  it('原状态不可变（返回新实例）', () => {
    const s = initialState()
    const next = userDecided(s, 'goal', { confirm: true })
    expect(s.goalConfirmed).toBe(false)
    expect(next.goalConfirmed).toBe(true)
  })
})

// ============================================================================
// Inv 2 决策点确定性：同一（状态×提议×动作）→ 同一决策点（纯函数；模型文本不参与）
// ============================================================================
describe('Inv 2 决策点确定性——deriveDecisionPoint 纯函数', () => {
  it('目标提议存在 && 目标未确认 → goal（与方案/完成声明并存时仍 goal——优先级）', () => {
    const s = initialState()
    expect(
      deriveDecisionPoint(s, { goal: goal('做一个游戏'), plan: plan([]), completion: claim() }),
    ).toBe('goal')
  })

  it('目标已确认 && 方案提议存在 && 方案未确认 → plan', () => {
    const s = userConfirmed(initialState(), 'goal')
    expect(deriveDecisionPoint(s, { plan: plan([{ path: '/test/a.js', reason: 'x' }]) })).toBe(
      'plan',
    )
  })

  it('目标+方案已确认 && 存在需授权动作 → approval', () => {
    const s = confirmed()
    expect(deriveDecisionPoint(s, {}, [{ kind: 'out-of-plan', basis: 'plan-list' }])).toBe(
      'approval',
    )
    expect(deriveDecisionPoint(s, {}, [{ kind: 'hazardous', basis: 'command-chain' }])).toBe(
      'approval',
    )
    // 只读/清单内/网络只读动作不触发授权决策点
    expect(deriveDecisionPoint(s, {}, [{ kind: 'readonly', basis: 'tool-type' }])).toBe('none')
    expect(deriveDecisionPoint(s, {}, [{ kind: 'in-plan', basis: 'plan-list' }])).toBe('none')
    expect(deriveDecisionPoint(s, {}, [{ kind: 'network-read', basis: 'command-head' }])).toBe(
      'none',
    )
  })

  it('完成声明存在（含证据）&& 未确认解决 → resolution', () => {
    const s = confirmed()
    expect(deriveDecisionPoint(s, { completion: claim() })).toBe('resolution')
  })

  it('已确认的决策点不再触发（确认点一次性）', () => {
    expect(deriveDecisionPoint(userConfirmed(initialState(), 'goal'), { goal: goal('x') })).toBe(
      'none',
    )
    expect(deriveDecisionPoint(confirmed(), { plan: plan([]) })).toBe('none')
    expect(deriveDecisionPoint(fullyConfirmed(), { completion: claim() })).toBe('none')
  })

  it('同一输入重复调用 → 同一输出（确定性）', () => {
    const s = userConfirmed(initialState(), 'goal')
    const input = { plan: plan([]) } as const
    expect(deriveDecisionPoint(s, input)).toBe('plan')
    expect(deriveDecisionPoint(s, input)).toBe('plan')
    expect(deriveDecisionPoint(s, input)).toBe('plan')
  })

  it('userRequested（goalFallback 语义——用户无提议时主动发起确认，§3.6 性质 4）', () => {
    expect(deriveDecisionPoint(initialState(), {}, [], 'goal')).toBe('goal')
    expect(deriveDecisionPoint(userConfirmed(initialState(), 'goal'), {}, [], 'plan')).toBe('plan')
    // approval 不能由用户主动请求（授权只由动作触发）
    expect(deriveDecisionPoint(confirmed(), {}, [], 'approval')).toBe('none')
  })
})

// ============================================================================
// Inv 3 门控顺序：SessionGate（冻结）优先于 ActionGate（属性）——pending 时任何动作无效
// ============================================================================
describe('Inv 3 门控顺序——sessionGate × actionGate 双维正交', () => {
  it('pending 非 none → sessionGate 拒一切（含只读——D5 无害≠有用）', () => {
    for (const kind of ['goal', 'plan', 'resolution', 'approval'] as const) {
      const s = setPending(initialState(), kind)
      expect(sessionGate(s, { name: 'read' }).ok).toBe(false)
      expect(sessionGate(s, { name: 'bash', command: 'ls -la' }).ok).toBe(false)
      expect(sessionGate(s, { name: 'write', path: '/test/a.js' }).ok).toBe(false)
      expect(canExecute(s, { name: 'read' }, false).ok).toBe(false)
    }
  })

  it('sessionGate：目标未确认 → 只读放行、副作用拒绝（A0 §3.1 活动边界）', () => {
    const s = initialState()
    expect(sessionGate(s, { name: 'read' }).ok).toBe(true)
    expect(sessionGate(s, { name: 'bash', command: 'ls' }).ok).toBe(true)
    expect(sessionGate(s, { name: 'write', path: '/test/a.js' }).ok).toBe(false)
    expect(sessionGate(s, { name: 'bash', command: 'npm install' }).ok).toBe(false)
  })

  it('sessionGate：目标已确认、方案未确认 → 探索 bash 放行、副作用拒绝', () => {
    const s = userConfirmed(initialState(), 'goal')
    expect(sessionGate(s, { name: 'bash', command: 'ls -la' }).ok).toBe(true)
    expect(sessionGate(s, { name: 'bash', command: 'npm install three' }).ok).toBe(false)
    expect(sessionGate(s, { name: 'write', path: '/test/a.js' }).ok).toBe(false)
  })

  it('sessionGate：方案已确认 → 清单判定（清单内放行、清单外拒绝带边界——A0 §5）', () => {
    let s = confirmed()
    s = approvalGranted(s, ['/test/a.js'])
    expect(sessionGate(s, { name: 'write', path: '/test/a.js' }).ok).toBe(true)
    const r = sessionGate(s, { name: 'write', path: '/test/outside.js' })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('a.js') // 拒绝回填带清单内容
  })

  it('sessionGate：清单为空（无计划）→ 无文件边界（写放行由确认点把关）', () => {
    expect(sessionGate(confirmed(), { name: 'write', path: '/test/any.js' }).ok).toBe(true)
  })

  it('actionGate：只读/清单内/网络只读(localhost) 自动放行——拍板 3', () => {
    expect(actionGate({ name: 'read' }, false).verdict).toBe('allow')
    expect(actionGate({ name: 'write', path: '/test/a.js' }, true).verdict).toBe('allow')
    expect(
      actionGate({ name: 'bash', command: 'curl -s http://localhost:6696' }, false).verdict,
    ).toBe('allow')
  })

  it('actionGate：清单外/高危 ask；外网网络只读 ask（拍板 3——localhost 自动，外网 ask）', () => {
    expect(actionGate({ name: 'write', path: '/test/outside.js' }, false).verdict).toBe('ask')
    expect(actionGate({ name: 'bash', command: 'rm -rf /' }, false).verdict).toBe('ask')
    expect(
      actionGate({ name: 'bash', command: 'curl -s https://example.com' }, false).verdict,
    ).toBe('ask')
  })

  it('actionGate：属性带判定依据（审计——basis）', () => {
    expect(actionGate({ name: 'write', path: '/test/a.js' }, true).attribute).toEqual({
      kind: 'in-plan',
      basis: 'plan-list',
    })
    expect(actionGate({ name: 'read' }, false).attribute).toEqual({
      kind: 'readonly',
      basis: 'tool-type',
    })
    expect(actionGate({ name: 'bash', command: 'rm -rf /' }, false).attribute.kind).toBe(
      'hazardous',
    )
  })

  it('S1 过渡语义锁定：外网 network-read 双门放行（S6 变更点——actionGate 接入后 ask 必须由执行层消费为授权卡；运行时仍由 classifyAction 壳 fail-closed 兜底）', () => {
    const s = confirmed()
    expect(sessionGate(s, { name: 'bash', command: 'curl -s https://example.com' }).ok).toBe(true)
    expect(canExecute(s, { name: 'bash', command: 'curl -s https://example.com' }, false).ok).toBe(
      true,
    )
    // actionGate 本身已按拍板 3 判外网 ask（localhost 自动）——S6 接线消费点
    expect(
      actionGate({ name: 'bash', command: 'curl -s https://example.com' }, false).verdict,
    ).toBe('ask')
  })

  it('actionGate 策略：hazardous deny（机制拦截——S6 配置化入口）', () => {
    expect(
      actionGate({ name: 'bash', command: 'rm -rf /' }, false, { hazardous: 'deny' }).verdict,
    ).toBe('deny')
  })

  it('canExecute 组合：SessionGate 优先（pending 冻结先于属性判定）；ask 放行给执行层（S6 前现状授权卡机制）', () => {
    expect(canExecute(setPending(initialState(), 'goal'), { name: 'read' }, false).ok).toBe(false)
    expect(canExecute(confirmed(), { name: 'write', path: '/test/a.js' }, true).ok).toBe(true)
    const withPlan = approvalGranted(confirmed(), ['/test/a.js'])
    expect(canExecute(withPlan, { name: 'write', path: '/test/a.js' }, true).ok).toBe(true)
    // sessionGate 拒绝带边界（清单内容）——先于 actionGate
    const r = canExecute(withPlan, { name: 'write', path: '/test/outside.js' }, false)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('a.js')
    // ask（高危 bash）→ 放行——授权卡由执行层机制处理（main needApproval——P2 授权卡场景）
    expect(canExecute(confirmed(), { name: 'bash', command: 'npm install' }, false).ok).toBe(true)
    // deny 策略 → 拦截（S6 机制拦截入口）
    const d = canExecute(confirmed(), { name: 'bash', command: 'rm -rf /' }, false, {
      hazardous: 'deny',
    })
    expect(d.ok).toBe(false)
    expect(d.reason).toContain('策略拦截')
  })

  it('actionNeedsApproval：out-of-plan/hazardous 需授权；其余放行', () => {
    expect(actionNeedsApproval({ kind: 'out-of-plan', basis: 'plan-list' })).toBe(true)
    expect(actionNeedsApproval({ kind: 'hazardous', basis: 'command-chain' })).toBe(true)
    expect(actionNeedsApproval({ kind: 'readonly', basis: 'tool-type' })).toBe(false)
    expect(actionNeedsApproval({ kind: 'in-plan', basis: 'plan-list' })).toBe(false)
    expect(actionNeedsApproval({ kind: 'network-read', basis: 'command-head' })).toBe(false)
  })
})

// ============================================================================
// Inv 4 无证据不对账：CompletionEvidence.verification 空或 pendingQuestions 非空 → 不进入 resolution
// ============================================================================
describe('Inv 4 无证据不对账——verifyCompletion/completionEvidenceComplete/deriveDecisionPoint', () => {
  it('证据完整 → verifyCompletion ok + 进入 resolution 决策点', () => {
    expect(verifyCompletion(claim()).ok).toBe(true)
    expect(completionEvidenceComplete(evidence())).toBe(true)
    expect(deriveDecisionPoint(confirmed(), { completion: claim() })).toBe('resolution')
  })

  it('verification 空 → 不完整 + 不进入对账（missing 清单）', () => {
    const c = claim({ evidence: evidence({ verification: [] }) })
    const r = verifyCompletion(c)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('verification')
    expect(deriveDecisionPoint(confirmed(), { completion: c })).toBe('none')
  })

  it('pendingQuestions 非空 → 不完整（模型自留问题必须用户判断）', () => {
    const c = claim({ evidence: evidence({ pendingQuestions: ['部署方式未定'] }) })
    const r = verifyCompletion(c)
    expect(r.ok).toBe(false)
    expect(r.missing.some((m) => m.startsWith('pending-question'))).toBe(true)
    expect(deriveDecisionPoint(confirmed(), { completion: c })).toBe('none')
  })

  it('验证命令 passed=false → 证据不通过', () => {
    const c = claim({
      evidence: evidence({ verification: [{ command: 'grep x /test/a.js', passed: false }] }),
    })
    const r = verifyCompletion(c)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('verification:grep x /test/a.js')
  })

  it('非只读验证命令（系统不可代跑）→ unverifiable + 不进入对账（拍板 4；P0 审计修复——Inv 4 单源）', () => {
    const c = claim({
      evidence: evidence({ verification: [{ command: 'npm install', passed: true }] }),
    })
    const r = verifyCompletion(c)
    expect(r.ok).toBe(false) // 存在 unverifiable → 不通过（需用户对账）
    expect(r.unverifiable).toContain('npm install')
    // 与 evidenceVerifiable 同源：unverifiable 证据 = 证据不完整 → 不产生 resolution 决策点
    expect(completionEvidenceComplete(c.evidence)).toBe(false)
    expect(deriveDecisionPoint(confirmed(), { completion: c })).toBe('none')
  })

  it('只读验证命令不标记 unverifiable（系统可代跑核验——V1a 前置）', () => {
    const c = claim({
      evidence: evidence({ verification: [{ command: 'ls /test', passed: true }] }),
    })
    expect(verifyCompletion(c).unverifiable).toEqual([])
  })
})

// ============================================================================
// Inv 5 推进 ≠ 调工具：推进保障的强制对象是「推进」；pending 时恒 auto
// ============================================================================
describe('Inv 5 推进保障——decideProgressGuarantee', () => {
  it('pending 非 none → 恒 auto（P1 继承——模型停住等用户，不强制）', () => {
    for (const kind of ['goal', 'plan', 'resolution', 'approval'] as const) {
      const s = setPending(confirmed(), kind)
      expect(
        decideProgressGuarantee(s, {
          produced: false,
          proposed: false,
          providedEvidence: false,
          toolsAvailable: true,
        }).mode,
      ).toBe('auto')
    }
  })

  it('未确认目标/方案 → auto（澄清/方案期模型自由输出）', () => {
    expect(
      decideProgressGuarantee(initialState(), {
        produced: false,
        proposed: false,
        providedEvidence: false,
        toolsAvailable: true,
      }).mode,
    ).toBe('auto')
    expect(
      decideProgressGuarantee(userConfirmed(initialState(), 'goal'), {
        produced: false,
        proposed: false,
        providedEvidence: false,
        toolsAvailable: true,
      }).mode,
    ).toBe('auto')
  })

  it('确认后无推进 + 工具可用 → require-action（原 required——逼工具产出）', () => {
    const r = decideProgressGuarantee(confirmed(), {
      produced: false,
      proposed: false,
      providedEvidence: false,
      toolsAvailable: true,
    })
    expect(r.mode).toBe('require-action')
  })

  it('确认后无推进 + 工具不可用 → require-advance（逼「推进」——允许提议/证据/提问，不逼调工具）', () => {
    const r = decideProgressGuarantee(confirmed(), {
      produced: false,
      proposed: false,
      providedEvidence: false,
      toolsAvailable: false,
    })
    expect(r.mode).toBe('require-advance')
  })

  it('已有推进（产出/提议/证据任一）→ auto', () => {
    const base = { toolsAvailable: true }
    expect(decideProgressGuarantee(confirmed(), { produced: true, ...base }).mode).toBe('auto')
    expect(decideProgressGuarantee(confirmed(), { proposed: true, ...base }).mode).toBe('auto')
    expect(decideProgressGuarantee(confirmed(), { providedEvidence: true, ...base }).mode).toBe(
      'auto',
    )
  })
})

// ============================================================================
// Inv 6 方案单一来源：plannedFiles 只由已确认的 PlanProposal.files 派生（追加语义）
// ============================================================================
describe('Inv 6 方案单一来源——derivePlannedFiles / plan 确认派生', () => {
  it('追加语义（不覆盖前批——A0 §5）', () => {
    let s = confirmed()
    s = approvalGranted(s, ['/test/a.js'])
    const next = userDecided(s, 'plan', { confirm: true })
    expect(next.plannedFiles.size).toBe(1)
    // 第二个方案确认（重提议后）→ 追加不覆盖
    const s2 = setPending(s, 'plan', {
      proposal: plan([{ path: '/test/b.js', reason: 'y' }]),
      since: 't',
    })
    const next2 = userDecided(s2, 'plan', { confirm: true })
    expect(next2.plannedFiles.has('/test/a.js')).toBe(true)
    expect(next2.plannedFiles.has('/test/b.js')).toBe(true)
  })

  it('plan 确认时 plannedFiles 由 decisionContent.proposal 派生（不变量 6 承载——确认方案 → 派生清单）', () => {
    const s = setPending(userConfirmed(initialState(), 'goal'), 'plan', {
      proposal: plan([
        { path: '/test/a.js', reason: '入口' },
        { path: '/test/b.js', reason: '样式' },
      ]),
      since: 't1',
    })
    const next = userDecided(s, 'plan', { confirm: true })
    expect(next.plannedFiles.has('/test/a.js')).toBe(true)
    expect(next.plannedFiles.has('/test/b.js')).toBe(true)
    expect(next.plannedFiles.size).toBe(2)
  })

  it('无 decisionContent 的 plan 确认不派生清单（防御——不产生虚假边界）', () => {
    const next = userDecided(userConfirmed(initialState(), 'goal'), 'plan', { confirm: true })
    expect(next.plannedFiles.size).toBe(0)
  })

  it('去重 + 空白路径过滤 + 追加合并', () => {
    const files = derivePlannedFiles(
      initialState(),
      plan([
        { path: '/test/a.js', reason: 'x' },
        { path: '/test/a.js', reason: 'y' },
        { path: '  ', reason: 'z' },
      ]),
    )
    expect(files.has('/test/a.js')).toBe(true)
    expect(files.size).toBe(1) // 去重 + 空白过滤
    // 追加语义：已有清单 ∪ 新方案（不覆盖）
    const merged = derivePlannedFiles(
      approvalGranted(initialState(), ['/test/b.js']),
      plan([{ path: '/test/a.js', reason: 'x' }]),
    )
    expect(merged.has('/test/a.js')).toBe(true)
    expect(merged.has('/test/b.js')).toBe(true)
    expect(merged.size).toBe(2)
  })

  it('决策点内容快照：setPending 携带 proposal → decisionContent；userDecided 确认后清除', () => {
    const s = setPending(initialState(), 'plan', { proposal: plan([]), since: 't1' })
    expect(s.decisionContent?.kind).toBe('plan')
    expect(s.decisionContent?.proposal).toBeDefined()
    expect(s.decisionContent?.since).toBe('t1')
    const next = userDecided(s, 'plan', { confirm: true })
    expect(next.decisionContent).toBeUndefined()
  })
})

// ============================================================================
// Inv 7 PENDING 单一：任一时刻只有一个决策点（单值返回 + 状态空间穷举）
// ============================================================================
describe('Inv 7 PENDING 单一——deriveDecisionPoint 单值 + 状态空间', () => {
  it('多提议/多动作并存 → 按优先级单值返回（goal > plan > approval > resolution）', () => {
    const s0 = initialState()
    expect(
      deriveDecisionPoint(s0, { goal: goal('g'), plan: plan([]), completion: claim() }, [
        { kind: 'hazardous', basis: 'command-chain' },
      ]),
    ).toBe('goal')
    const s1 = userConfirmed(initialState(), 'goal')
    expect(
      deriveDecisionPoint(s1, { plan: plan([]), completion: claim() }, [
        { kind: 'hazardous', basis: 'command-chain' },
      ]),
    ).toBe('plan')
    const s2 = confirmed()
    expect(
      deriveDecisionPoint(s2, { completion: claim() }, [
        { kind: 'hazardous', basis: 'command-chain' },
      ]),
    ).toBe('approval')
  })

  it('状态空间矩阵：3 确认 × 提议组合 × 动作 → 唯一 PendingKind（代表性穷举）', () => {
    const rows: Array<{
      label: string
      s: ConversationState
      proposals: Parameters<typeof deriveDecisionPoint>[1]
      actions: ActionAttribute[]
      want: PendingKind | 'none'
    }> = [
      { label: '全未确认 + 无提议', s: initialState(), proposals: {}, actions: [], want: 'none' },
      {
        label: '全未确认 + goal 提议',
        s: initialState(),
        proposals: { goal: goal('g') },
        actions: [],
        want: 'goal',
      },
      {
        label: 'goal 已确认 + plan 提议',
        s: userConfirmed(initialState(), 'goal'),
        proposals: { plan: plan([]) },
        actions: [],
        want: 'plan',
      },
      {
        label: 'goal+plan 已确认 + 无动作无提议',
        s: confirmed(),
        proposals: {},
        actions: [],
        want: 'none',
      },
      {
        label: 'goal+plan 已确认 + 高危动作',
        s: confirmed(),
        proposals: {},
        actions: [{ kind: 'hazardous', basis: 'command-chain' }],
        want: 'approval',
      },
      {
        label: 'goal+plan 已确认 + completion',
        s: confirmed(),
        proposals: { completion: claim() },
        actions: [],
        want: 'resolution',
      },
      {
        label: '全确认 + completion',
        s: fullyConfirmed(),
        proposals: { completion: claim() },
        actions: [],
        want: 'none',
      },
    ]
    for (const r of rows) {
      expect(deriveDecisionPoint(r.s, r.proposals, r.actions), r.label).toBe(r.want)
    }
  })

  it('setPending 覆盖而非叠加（继承——单一 PENDING）', () => {
    const s = setPending(setPending(initialState(), 'goal'), 'approval')
    expect(s.pending).toBe('approval')
  })

  it('pending 枚举值：新模型四种决策点（plan/resolution 取代 execution/achievement）', () => {
    expect(setPending(initialState(), 'plan').pending).toBe('plan')
    expect(setPending(initialState(), 'resolution').pending).toBe('resolution')
    expect(setPending(initialState(), 'approval').pending).toBe('approval')
    expect(initialState().pending).toBe('none')
  })
})

// ============================================================================
// Inv 8 拒绝带原因：拒绝决策必须携带 RejectReason（结构化）——回填模型
// ============================================================================
describe('Inv 8 拒绝带原因——签名强制 + 运行时校验', () => {
  it('userDecided 拒绝无原因 → throw（不变量 8 强制）', () => {
    expect(() => userDecided(initialState(), 'goal', { confirm: false } as never)).toThrow()
    expect(() =>
      userDecided(initialState(), 'goal', { confirm: false, reason: undefined } as never),
    ).toThrow()
  })

  it('approvalDecided 拒绝无原因 → throw', () => {
    expect(() =>
      approvalDecided(initialState(), approvalReq(), { confirm: false } as never),
    ).toThrow()
  })

  it('拒绝带原因 → 状态回退 + pending 清除（决策点关闭——reason 由事件层回填模型）', () => {
    const s = setPending(confirmed(), 'plan', { proposal: plan([]), since: 't' })
    const next = userDecided(s, 'plan', { confirm: false, reason: reason('scope', '只做核心功能') })
    expect(next.planConfirmed).toBe(false)
    expect(next.pending).toBe('none')
    expect(next.decisionContent).toBeUndefined()
  })

  it('modify = 拒绝（kind=modify）+ 修正内容（拍板 1：修改方案按钮 → 模型重提议）', () => {
    const s = setPending(confirmed(), 'plan', { proposal: plan([]), since: 't' })
    const next = userDecided(s, 'plan', {
      confirm: false,
      reason: reason('modify', '加上登录页', '第 1 条'),
    })
    expect(next.planConfirmed).toBe(false)
    expect(next.pending).toBe('none')
  })

  it('approvalDecided 拒绝 → pending 清除 + 拒绝记忆登记（§3.4 C6——同轮同类动作短封）', () => {
    const s = setPending(confirmed(), 'approval', { approval: approvalReq(), since: 't' })
    const next = approvalDecided(s, approvalReq(), {
      confirm: false,
      reason: reason('direction', '不要执行'),
    })
    expect(next.pending).toBe('none')
    expect(next.deniedApprovals).toEqual([{ toolName: 'bash', subject: 'rm -rf /' }])
  })

  it('approvalDecided 允许 → pending 清除 + 无拒绝记忆', () => {
    const s = setPending(confirmed(), 'approval', { approval: approvalReq(), since: 't' })
    const next = approvalDecided(s, approvalReq(), { confirm: true })
    expect(next.pending).toBe('none')
    expect(next.deniedApprovals.length).toBe(0)
  })

  it('§4.1 C8 协商保护：同一决策点连续拒绝计数递增（含重提议——模型重出方案属延续）；确认/任务边界重置', () => {
    const s0 = setPending(confirmed(), 'plan', { proposal: plan([]), since: 't' })
    const r1 = userDecided(s0, 'plan', { confirm: false, reason: reason('scope') })
    expect(r1.rejectStreak).toBe(1)
    // 模型重提议（setPending 带新 content）→ 计数延续（否则「3 次上限」永不可达——协商保护失效）
    const s2 = setPending(r1, 'plan', { proposal: plan([]), since: 't2' })
    expect(s2.rejectStreak).toBe(1)
    const r3 = userDecided(s2, 'plan', { confirm: false, reason: reason('modify', '加登录页') })
    expect(r3.rejectStreak).toBe(2) // 含 kind='modify'（修改=拒绝）
    // 确认 → 重置（§4.1「随决策点确认重置」）
    const c1 = userDecided(setPending(r3, 'plan', { proposal: plan([]), since: 't3' }), 'plan', {
      confirm: true,
    })
    expect(c1.rejectStreak).toBe(0)
    // 任务边界（goal 确认）→ 重置（新任务）
    expect(userDecided(r3, 'goal', { confirm: true }).rejectStreak).toBe(0)
    // 无内容 setPending（仅置位）→ 保留计数
    expect(setPending(r3, 'plan').rejectStreak).toBe(2)
    // 连续 3 次拒绝 → 计数达上限（S3 消费：回退 AskToAct 澄清 / 人工接管提示）
    const r4 = userDecided(setPending(r3, 'plan', { proposal: plan([]), since: 't4' }), 'plan', {
      confirm: false,
      reason: reason('missing-info'),
    })
    expect(r4.rejectStreak).toBe(3)
  })

  it('RejectReason kind 全集合法（direction/scope/complexity/missing-info/modify/other——拍板 2）', () => {
    for (const kind of [
      'direction',
      'scope',
      'complexity',
      'missing-info',
      'modify',
      'other',
    ] as const) {
      const s = setPending(initialState(), 'goal', { proposal: goal('g'), since: 't' })
      const next = userDecided(s, 'goal', { confirm: false, reason: { kind } })
      expect(next.goalConfirmed).toBe(false)
      expect(next.pending).toBe('none')
    }
  })
})

// ============================================================================
// 值对象（§9.2 测试对象 2——构造/结构/快照语义）
// ============================================================================
describe('值对象——结构契约与快照', () => {
  it('GoalProposal：statement + assumptions（假设显式呈现——模型从未确认过的细节）', () => {
    const g = goal('做一个游戏', ['单机即可', '先做能玩的版本'])
    expect(g.statement).toBe('做一个游戏')
    expect(g.assumptions).toHaveLength(2)
  })

  it('PlanProposal：summary + files（含理由）+ assumptions + verificationPlan（拍板 1 只读呈现的数据基础）', () => {
    const p = plan([{ path: '/test/a.js', reason: '入口' }], {
      summary: '用 Vite 搭',
      assumptions: ['Node 20'],
      verificationPlan: ['npm run build'],
    })
    expect(p.files[0].reason).toBe('入口')
    expect(p.assumptions).toContain('Node 20')
    expect(p.verificationPlan).toContain('npm run build')
  })

  it('CompletionClaim：summary + evidence（verification/diffs/pendingQuestions）', () => {
    const c = claim({
      evidence: evidence({ diffs: [{ path: '/test/a.js' }], pendingQuestions: [] }),
    })
    expect(c.evidence.diffs[0].path).toBe('/test/a.js')
  })

  it('ApprovalRequest：toolName + subject + reason + risk（DSH ApprovalRequest 同构）', () => {
    const a = approvalReq()
    expect(a.risk).toBe('high')
    expect(a.subject).toBe('rm -rf /')
  })

  it('决策点内容快照：since 记录出现时间（诊断）', () => {
    const s = setPending(initialState(), 'goal', {
      proposal: goal('g'),
      since: '2026-08-16T10:00:00Z',
    })
    expect(s.decisionContent?.since).toBe('2026-08-16T10:00:00Z')
  })
})

// ============================================================================
// 继承行为锁定（S3/S5/S6 切换前——renderer 现状消费面不回归）
// ============================================================================
describe('继承锁定——classifyReadonly/classifyAction（缝隙 4 单一权威）', () => {
  it('工具类型：write/edit hazardous；read/search/LSP/check-capability readonly', () => {
    expect(classifyReadonly('write')).toBe('hazardous')
    expect(classifyReadonly('edit')).toBe('hazardous')
    expect(classifyReadonly('read')).toBe('readonly')
    expect(classifyReadonly('search')).toBe('readonly')
    expect(classifyReadonly('check-capability')).toBe('readonly')
    expect(classifyReadonly('find_definition')).toBe('readonly')
  })

  it('bash 命令头白名单：ls/cat 只读；npm install 高危（与 preApproval 同源）', () => {
    expect(classifyReadonly('bash', 'ls -la')).toBe('readonly')
    expect(classifyReadonly('bash', 'cd /test && cat package.json')).toBe('readonly')
    expect(classifyReadonly('bash', 'npm install three')).toBe('hazardous')
    expect(classifyReadonly('bash', 'sudo rm -rf /')).toBe('hazardous')
  })

  it('bash 链递归：链中任一危险命令 → hazardous（升级——设计 §3.3；原实现只查链后命令）', () => {
    expect(classifyReadonly('bash', 'ls -la && npm install')).toBe('hazardous')
    expect(classifyReadonly('bash', 'cat a.txt; git push')).toBe('hazardous')
    expect(classifyReadonly('bash', 'ls -la && cat a.txt')).toBe('readonly')
    expect(classifyReadonly('bash', 'ls -la | grep x')).toBe('readonly')
  })

  it('git 子命令级：status/log/diff 只读；push/commit 写（Codex is_safe_git_command 方向）', () => {
    expect(classifyReadonly('bash', 'git status')).toBe('readonly')
    expect(classifyReadonly('bash', 'git log --oneline')).toBe('readonly')
    expect(classifyReadonly('bash', 'git diff HEAD')).toBe('readonly')
    expect(classifyReadonly('bash', 'git push origin main')).toBe('hazardous')
    expect(classifyReadonly('bash', 'git commit -m x')).toBe('hazardous')
  })

  it('网络只读：curl GET/HEAD → network-read；POST/带 body → hazardous（拍板 3 基础）', () => {
    expect(classifyReadonly('bash', 'curl -s http://localhost:6696')).toBe('network-read')
    expect(classifyReadonly('bash', 'curl -s -X HEAD https://example.com')).toBe('network-read')
    expect(classifyReadonly('bash', 'curl -X POST -d x http://localhost')).toBe('hazardous')
    expect(classifyReadonly('bash', 'wget -q https://example.com')).toBe('network-read')
  })

  it('空命令/重定向 → hazardous（fail-closed）', () => {
    expect(classifyReadonly('bash', '')).toBe('hazardous')
    expect(classifyReadonly('bash', 'ls -la > out.txt')).toBe('hazardous')
  })

  it('classifyAction 兼容壳（S6 由 classifyReadonly 直连取代）', () => {
    expect(classifyAction('write')).toBe('side-effect')
    expect(classifyAction('read')).toBe('readonly')
    expect(classifyAction('bash', 'ls -la')).toBe('readonly')
    expect(classifyAction('bash', 'npm install')).toBe('side-effect')
    expect(classifyAction('bash', 'curl -s http://localhost')).toBe('side-effect') // S6 前旧 fail-closed（curl 一律需授权）
  })
})

describe('继承锁定——plannedComplete / decideProgressGuarantee（缝隙 3 + P1——S5 迁移自 forceToolInput）', () => {
  const noTurn = { produced: false, proposed: false, providedEvidence: false, toolsAvailable: true }

  it('无计划 + 有产出 → 完成（A0 §4 补行——防 forceTool 死锁）', () => {
    let s = confirmed()
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(plannedComplete(s, new Set())).toBe(true)
    expect(decideProgressGuarantee(s, noTurn, new Set()).mode).toBe('auto') // 完成收敛
  })

  it('无计划 + 无产出 → 未完成 → require-action（防只说不做）', () => {
    expect(plannedComplete(confirmed(), new Set())).toBe(false)
    expect(decideProgressGuarantee(confirmed(), noTurn, new Set()).mode).toBe('require-action')
  })

  it('有计划：全部产出（produced ∪ 文件树）→ 完成；缺一个 → 未完成', () => {
    let s = confirmed()
    s = approvalGranted(s, ['/test/a.js', '/test/b.js'])
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(plannedComplete(s, new Set())).toBe(false)
    expect(plannedComplete(s, new Set(['/test/b.js']))).toBe(true)
  })

  it('decideProgressGuarantee：累积完成度判定（写 1 文件 ≠ 达成——坑 12 冒烟 11；计划完成/达成确认 → 收敛）', () => {
    // 有产出 + 计划未完成 → require-action（继续完成计划）
    let s = confirmed()
    s = approvalGranted(s, ['/test/a.js', '/test/b.js'])
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(decideProgressGuarantee(s, noTurn, new Set()).mode).toBe('require-action')
    // 计划完成（produced ∪ 文件树）→ auto
    expect(decideProgressGuarantee(s, noTurn, new Set(['/test/b.js'])).mode).toBe('auto')
    // 达成确认（resolutionConfirmed + 有产出）→ auto（收敛到对话结束）
    let done = confirmed()
    done = applyToolResult(done, { name: 'write', ok: true, file: '/test/a.js' })
    done = userDecided(done, 'resolution', { confirm: true })
    expect(decideProgressGuarantee(done, noTurn, new Set()).mode).toBe('auto')
  })

  it('lastToolFailed → 释放强制（模型可诊断——A0 §4）', () => {
    let s = confirmed()
    s = applyToolResult(s, { name: 'bash', ok: false })
    expect(decideProgressGuarantee(s, noTurn, new Set()).mode).toBe('auto')
  })

  it('pending 非 none → 恒 auto（P1——与 canExecute 同源）', () => {
    for (const kind of ['goal', 'plan', 'resolution', 'approval'] as const) {
      expect(decideProgressGuarantee(setPending(confirmed(), kind), noTurn, new Set()).mode).toBe(
        'auto',
      )
    }
    expect(decideProgressGuarantee(initialState(), noTurn, new Set()).mode).toBe('auto')
  })
})

describe('继承锁定——isProgressing（缝隙 2）', () => {
  it('有副作用工具成功 = 进展（bash 安装/验证成功不再算停滞）', () => {
    expect(isProgressing([{ name: 'bash', ok: true, command: 'npm install three' }])).toBe(true)
    expect(isProgressing([{ name: 'write', ok: true }])).toBe(true)
  })

  it('只读成功不算进展（防换文件假装进展——坑 81）', () => {
    expect(isProgressing([{ name: 'read', ok: true }])).toBe(false)
    expect(isProgressing([{ name: 'bash', ok: true, command: 'ls -la' }])).toBe(false)
    expect(isProgressing([])).toBe(false)
  })
})

describe('继承锁定——pendingCardToShow（缝隙 5——S3 由 deriveDecisionPoint 取代；返回值已切新枚举）', () => {
  const show = (
    goal: boolean,
    plan: boolean,
    resolution: boolean,
    content: string,
    sideEffect = false,
  ) => pendingCardToShow(goal, plan, resolution, content, sideEffect)

  it('模型标记命中 → 对应确认点（plan/resolution 新枚举）', () => {
    expect(show(false, false, false, '好的。【目标确认：做一个游戏】')).toBe('goal')
    expect(show(true, false, false, '【执行方案】\n- a.js')).toBe('plan')
    expect(show(true, true, false, '【已达成】完成')).toBe('resolution')
  })

  it('无标记但有副作用工具待执行 → 方案确认卡（execPendingCalls 现状语义）', () => {
    expect(show(true, false, false, '开始写。', true)).toBe('plan')
  })

  it('「等确认」语义（模型自然语言等待——无标记无工具也命中，防续聊遮挡卡死锁）', () => {
    expect(show(true, false, false, '好的，方案如下，等你确认。')).toBe('plan')
    expect(show(true, false, false, '我先看看项目现状。')).toBe('none')
  })

  it('已确认的标记不再触发卡（确认点一次性）', () => {
    expect(show(true, true, false, '【目标确认：…】【执行方案】…')).toBe('none')
  })
})

describe('继承锁定——shouldStopContinuation（问题 A：maybeContinue 与 canExecute 同源）', () => {
  it('pending 非 none（卡在任意消息——含旧消息授权卡）→ 停续聊', () => {
    for (const kind of ['goal', 'plan', 'resolution', 'approval'] as const) {
      expect(
        shouldStopContinuation(setPending(confirmed(), kind), {
          needsApproval: false,
          confirmPending: false,
        }),
      ).toBe(true)
    }
  })

  it('pending=none + 最后消息授权卡 → 停（既有语义）', () => {
    expect(
      shouldStopContinuation(initialState(), { needsApproval: true, confirmPending: false }),
    ).toBe(true)
  })

  it('pending=none + 无卡信号 → 继续', () => {
    expect(
      shouldStopContinuation(initialState(), { needsApproval: false, confirmPending: false }),
    ).toBe(false)
  })
})

describe('继承锁定——兼容壳（userConfirmed/userRejected/approvalGranted/setPending/applyToolResult）', () => {
  it('userConfirmed/userRejected：旧调用形态委托新转换（S3 移除）', () => {
    const s = userConfirmed(initialState(), 'goal')
    expect(s.goalConfirmed).toBe(true)
    // A-006：userRejected reason 必传（不变量 8——缺省不再绕过 userDecided throw）
    expect(userRejected(s, 'goal', { kind: 'direction' }).goalConfirmed).toBe(false)
    const s2 = userConfirmed(s, 'plan')
    expect(s2.planConfirmed).toBe(true)
    expect(userRejected(s2, 'plan', { kind: 'scope' }).planConfirmed).toBe(false)
    const s3 = userConfirmed(confirmed(), 'resolution')
    expect(s3.resolutionConfirmed).toBe(true)
    expect(userRejected(s3, 'resolution', { kind: 'scope' }).resolutionConfirmed).toBe(false)
  })

  it('A-006：userRejected 无 reason → throw（不变量 8 真身——缺省不再掩盖）', () => {
    const s = userConfirmed(initialState(), 'goal')
    expect(() => userRejected(s, 'goal', undefined as unknown as { kind: 'direction' })).toThrow(
      TypeError,
    )
  })

  it('approvalGranted：追加语义 + 幂等标记（坑 95）', () => {
    let s = approvalGranted(initialState(), ['/test/a.js'])
    s = approvalGranted(s, ['/test/b.js'])
    expect(s.plannedFiles.size).toBe(2)
    expect(s.filesApproved).toBe(true)
  })

  it('applyToolResult：写成功入 produced；策略引导（policy）不置失败（坑 93 ②）', () => {
    let s = applyToolResult(initialState(), { name: 'write', ok: true, file: '/test/a.js' })
    expect(s.producedFiles.has('/test/a.js')).toBe(true)
    s = applyToolResult(s, { name: 'write', ok: false, policy: true })
    expect(s.lastToolFailed).toBe(false)
    s = applyToolResult(s, { name: 'bash', ok: false })
    expect(s.lastToolFailed).toBe(true)
    s = applyToolResult(s, { name: 'bash', ok: true })
    expect(s.lastToolFailed).toBe(false)
  })
})

// S4 spec TDD 网格：证据不足回填引导（§6 S4——ok=false 不弹卡 + 引导文本含清单；§3.3 unverifiable 显式提示）
describe('buildEvidenceBackfill（S4——完成声明被拒的回填引导文本）', () => {
  it('missing 清单 → 引导文本含各缺失项（验证命令/待答问题/diff 缺失）', () => {
    const text = buildEvidenceBackfill({
      ok: false,
      missing: [
        'verification:ls src',
        'pending-question:支持哪些浏览器',
        'diff:planned-not-produced',
      ],
      unverifiable: [],
    })
    expect(text).toContain('ls src')
    expect(text).toContain('支持哪些浏览器')
    expect(text).toContain('diff:planned-not-produced')
  })

  it('unverifiable 清单 → 引导文本显式提示「未经系统核验」', () => {
    const text = buildEvidenceBackfill({
      ok: false,
      missing: [],
      unverifiable: ['npm test'],
    })
    expect(text).toContain('npm test')
    expect(text).toContain('未经系统核验')
  })

  it('ok=true（无缺失）→ 空引导（不注入）', () => {
    expect(buildEvidenceBackfill({ ok: true, missing: [], unverifiable: [] })).toBe('')
  })
})
