import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_TOOL_DEFS,
  PROTOCOL_TOOL_NAMES,
  validateProtocolArgs,
  decideProtocolToolCall,
} from '../../src/domain/protocolTools'
import { initialState, type ConversationState } from '../../src/domain/conversationState'

// V1.5 Task 1.1 spec TDD：协议工具 schema 单源 + 参数校验器
// 契约：
// - PROTOCOL_TOOL_DEFS 四工具（propose_goal/propose_plan/report_completion/ask_user），
//   parameters 全部 additionalProperties:false + required 齐全
// - 数组一层为限（硬约束）：任何 items.properties 内不得再含 type:'array' 属性
// - validateProtocolArgs：路径化错误模板；files[].path 先过 splitPathReason 候选拆分再 isLikelyPath
//   （Spike-2b 结论——path 允许动词前缀/尾括号/冒号说明，落地拆分）

/** 取工具定义（类型收窄辅助） */
function getDef(name: string) {
  const def = PROTOCOL_TOOL_DEFS.find((d) => d.name === name)
  expect(def, `工具 ${name} 应存在`).toBeTruthy()
  return def!
}

describe('PROTOCOL_TOOL_DEFS（协议工具 schema 单源——V1.5 Task 1.1）', () => {
  it('四工具存在，每个有 name/description/parameters', () => {
    const names = PROTOCOL_TOOL_DEFS.map((d) => d.name)
    expect(names).toEqual(
      expect.arrayContaining(['propose_goal', 'propose_plan', 'report_completion', 'ask_user']),
    )
    expect(PROTOCOL_TOOL_DEFS).toHaveLength(4)
    for (const def of PROTOCOL_TOOL_DEFS) {
      expect(typeof def.name).toBe('string')
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.parameters).toBeTruthy()
      expect(def.parameters.type).toBe('object')
      expect(def.parameters.additionalProperties).toBe(false)
    }
  })

  it('扁平断言：数组属性 items.properties 内不得再含 type:"array"（数组一层为限）', () => {
    for (const def of PROTOCOL_TOOL_DEFS) {
      const props = def.parameters.properties as Record<
        string,
        { type?: string; items?: { properties?: Record<string, { type?: string }> } }
      >
      for (const [propName, schema] of Object.entries(props)) {
        if (schema.type !== 'array') continue
        const itemProps = schema.items?.properties ?? {}
        for (const [innerName, innerSchema] of Object.entries(itemProps)) {
          expect(
            innerSchema.type,
            `${def.name}.parameters.properties.${propName}.items.properties.${innerName} 不得为 array（数组一层为限）`,
          ).not.toBe('array')
        }
      }
    }
  })

  it('parameters 的 required 齐全（必填字段在 required 中，可选字段不在）', () => {
    const plan = getDef('propose_plan')
    expect(plan.parameters.required).toEqual(expect.arrayContaining(['files', 'summary']))
    const goal = getDef('propose_goal')
    expect(goal.parameters.required).toEqual(['statement'])
    const completion = getDef('report_completion')
    expect(completion.parameters.required).toEqual(
      expect.arrayContaining(['summary', 'verification']),
    )
    const ask = getDef('ask_user')
    expect(ask.parameters.required).toEqual(expect.arrayContaining(['question', 'type']))
  })

  it('PROTOCOL_TOOL_NAMES：与 PROTOCOL_TOOL_DEFS 名字一致的 ReadonlySet', () => {
    expect(PROTOCOL_TOOL_NAMES).toBeInstanceOf(Set)
    expect([...PROTOCOL_TOOL_NAMES].sort()).toEqual(PROTOCOL_TOOL_DEFS.map((d) => d.name).sort())
  })
})

describe('validateProtocolArgs（协议参数校验器——V1.5 Task 1.1）', () => {
  it('propose_plan 合格样例 → { ok: true }', () => {
    const r = validateProtocolArgs('propose_plan', {
      files: [{ path: 'index.html', reason: '新建首页' }],
      summary: '首页',
    })
    expect(r).toEqual({ ok: true })
  })

  it('propose_plan files 为空数组 → { ok: false, errors } 含 "files"', () => {
    const r = validateProtocolArgs('propose_plan', { files: [], summary: '空' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.includes('files'))).toBe(true)
  })

  it('path 带动词前缀/尾括号/冒号说明 → 经 splitPathReason 候选拆分后合格（Spike-2b 硬化文案语义）', () => {
    const r = validateProtocolArgs('propose_plan', {
      files: [{ path: '新建 index.html（说明）：详情', reason: '' }],
      summary: '首页',
    })
    expect(r).toEqual({ ok: true })
  })

  it('path 纯自然语言句（拆分后仍非路径形态）→ { ok: false, errors } 路径化错误', () => {
    const r = validateProtocolArgs('propose_plan', {
      files: [{ path: '所有需要修改的文件都列在这里', reason: '' }],
      summary: 'x',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(
      r.errors.some((e) => e.includes('files[0].path') && e.includes('期望文件路径形态')),
    ).toBe(true)
  })

  it('report_completion verification[].passed 非布尔 → errors 含 "verification[0].passed"', () => {
    const r = validateProtocolArgs('report_completion', {
      summary: '完成',
      verification: [{ command: 'node a.js', passed: 'yes' }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.includes('verification[0].passed'))).toBe(true)
  })

  it('report_completion 合格样例 → { ok: true }', () => {
    const r = validateProtocolArgs('report_completion', {
      summary: '完成',
      verification: [{ command: 'node a.js', output: 'ok', passed: true }],
    })
    expect(r).toEqual({ ok: true })
  })

  it('propose_goal 合格样例 → { ok: true }；缺 statement → errors 含 "statement"', () => {
    expect(validateProtocolArgs('propose_goal', { statement: '做一个待办应用' })).toEqual({
      ok: true,
    })
    const bad = validateProtocolArgs('propose_goal', {})
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.errors.some((e) => e.includes('statement'))).toBe(true)
  })

  it('ask_user 合格样例（含 options）→ { ok: true }；type 非枚举值 → errors 含 "type"', () => {
    expect(
      validateProtocolArgs('ask_user', {
        question: '用哪种方案？',
        options: [
          { label: 'A', description: '方案 A' },
          { label: 'B', description: '方案 B' },
        ],
        type: 'approach_choice',
      }),
    ).toEqual({ ok: true })
    const bad = validateProtocolArgs('ask_user', { question: '？', type: 'whatever' })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.errors.some((e) => e.includes('type'))).toBe(true)
  })

  it('未知工具 → { ok: false, errors }（防御）', () => {
    const r = validateProtocolArgs('nonexistent', {})
    expect(r.ok).toBe(false)
  })
})

// ============================================================================
// decideProtocolToolCall 乱序矩阵（V1.5 Task 1.2/1.2b——顺序严格单向，stage-spec r2）
// 契约：
// - 硬序门只约束「推进提议」：goal 未确认 → propose_plan/report_completion 一律 reject（引导先
//   propose_goal）；goal 已确认 plan 未确认 → report_completion reject（引导先 propose_plan）
// - ask_user 为会话级澄清（Task 1.2b 裁定）：任何时点合法 → clarify 分支——不进硬序矩阵、
//   不置 DecisionPoint（pre-goal 澄清→收敛→propose_goal 是设计主流程）
// - 提议分支：propose_goal 恒 pending:goal（ADR-006 换目标语义）；propose_plan goal 确认后恒
//   pending:plan（重复提议幂等覆盖）；report_completion goal+plan 确认后 pending:resolution
// - 载荷映射：args → GoalProposal/PlanProposal/CompletionClaim（字段名一致）；
//   evidence.diffs 恒 []（V1b 系统派生——工具无法自证对账）
// - invalid：参数校验失败/未知工具名 → 路径化错误模板（回灌模型修参）——ask_user 同样先过校验
// ============================================================================

/** 会话状态构造（乱序矩阵前置态——字面量覆盖基态字段） */
function state(over: Partial<ConversationState> = {}): ConversationState {
  return { ...initialState(), ...over }
}

describe('decideProtocolToolCall（协议工具调用乱序矩阵——V1.5 Task 1.2）', () => {
  it('goal 未确认：propose_plan → reject，resultText 引导先 propose_goal', () => {
    const r = decideProtocolToolCall(state(), 'propose_plan', {
      summary: '单文件落地',
      files: [{ path: 'index.html', reason: '新建首页' }],
    })
    expect(r.action).toBe('reject')
    if (r.action !== 'reject') return
    expect(r.resultText).toContain('propose_goal')
  })

  it('goal 未确认：report_completion → reject，resultText 引导先 propose_goal', () => {
    const r = decideProtocolToolCall(state(), 'report_completion', {
      summary: '完成',
      verification: [{ command: 'node a.js', passed: true }],
    })
    expect(r.action).toBe('reject')
    if (r.action !== 'reject') return
    expect(r.resultText).toContain('propose_goal')
  })

  it('goal 未确认：ask_user 合法 args → clarify（澄清不设序——pre-goal 澄清是设计主流程），question/options/type 映射', () => {
    const r = decideProtocolToolCall(state(), 'ask_user', {
      question: '用哪种方案？',
      type: 'approach_choice',
      options: [{ label: 'A', description: '方案 A' }, { label: 'B' }],
    })
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.content).toEqual({
      question: '用哪种方案？',
      type: 'approach_choice',
      options: [
        { label: 'A', description: '方案 A' },
        { label: 'B', description: '' },
      ],
    })
  })

  it('plan 已确认后 ask_user → 仍 clarify（澄清不设序——不进硬序矩阵）', () => {
    const r = decideProtocolToolCall(
      state({ goalConfirmed: true, planConfirmed: true }),
      'ask_user',
      { question: '验证命令跑哪个？', type: 'suggestion' },
    )
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.content).toEqual({
      question: '验证命令跑哪个？',
      type: 'suggestion',
      options: [],
    })
  })

  it('ask_user options 缺失 → 仍 clarify（options 可选，映射为空数组）', () => {
    const r = decideProtocolToolCall(state(), 'ask_user', {
      question: '数据要持久化吗？',
      type: 'missing_info',
    })
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.content.options).toEqual([])
  })

  it('ask_user type 非法枚举 → invalid（路径化错误——校验先行于 clarify 分支）', () => {
    const r = decideProtocolToolCall(state(), 'ask_user', {
      question: '？',
      type: 'whatever',
    })
    expect(r.action).toBe('invalid')
    if (r.action !== 'invalid') return
    expect(r.resultText).toContain('type')
  })

  it('goal 未确认：propose_goal 合法 args → pending:goal，proposal.statement/assumptions 映射', () => {
    const r = decideProtocolToolCall(state(), 'propose_goal', {
      statement: '做一个待办应用',
      assumptions: ['数据存内存即可', '单用户本地使用'],
    })
    expect(r).toMatchObject({ action: 'pending', kind: 'goal' })
    if (r.action !== 'pending') return
    expect(r.content.kind).toBe('goal')
    expect(r.content.proposal).toEqual({
      statement: '做一个待办应用',
      assumptions: ['数据存内存即可', '单用户本地使用'],
    })
    expect(typeof r.content.since).toBe('string')
    expect(r.content.since.length).toBeGreaterThan(0)
  })

  it('goal 已确认 plan 未确认：propose_plan 合法 → pending:plan，files/summary/verificationPlan 映射', () => {
    const r = decideProtocolToolCall(state({ goalConfirmed: true }), 'propose_plan', {
      summary: '单文件落地首页',
      files: [{ path: 'index.html', reason: '新建首页' }],
      assumptions: ['纯静态页即可'],
      verification_plan: ['npx vitest run'],
    })
    expect(r).toMatchObject({ action: 'pending', kind: 'plan' })
    if (r.action !== 'pending') return
    expect(r.content.kind).toBe('plan')
    expect(r.content.proposal).toEqual({
      summary: '单文件落地首页',
      files: [{ path: 'index.html', reason: '新建首页' }],
      assumptions: ['纯静态页即可'],
      verificationPlan: ['npx vitest run'],
    })
  })

  it('goal 已确认：propose_goal（新目标）→ pending:goal（ADR-006 换目标语义）', () => {
    const r = decideProtocolToolCall(
      state({ goalConfirmed: true, planConfirmed: true }),
      'propose_goal',
      { statement: '换一个新目标' },
    )
    expect(r).toMatchObject({ action: 'pending', kind: 'goal' })
    if (r.action !== 'pending') return
    expect(r.content.proposal).toEqual({ statement: '换一个新目标', assumptions: [] })
  })

  it('goal+plan 已确认：report_completion 合法 → pending:resolution，evidence 映射（verification 对齐 output、diffs=[]、pendingQuestions 映射）', () => {
    const r = decideProtocolToolCall(
      state({ goalConfirmed: true, planConfirmed: true }),
      'report_completion',
      {
        summary: '待办应用完成',
        verification: [
          { command: 'node a.js', output: 'all ok', passed: true },
          { command: 'npx vitest run', passed: false },
        ],
        pending_questions: ['移动端样式未验证'],
      },
    )
    expect(r).toMatchObject({ action: 'pending', kind: 'resolution' })
    if (r.action !== 'pending') return
    expect(r.content.kind).toBe('resolution')
    expect(r.content.proposal).toEqual({
      summary: '待办应用完成',
      evidence: {
        verification: [
          { command: 'node a.js', output: 'all ok', passed: true },
          { command: 'npx vitest run', passed: false },
        ],
        diffs: [],
        pendingQuestions: ['移动端样式未验证'],
      },
    })
  })

  it('plan 已确认：重复 propose_plan → pending:plan（幂等覆盖）', () => {
    const r = decideProtocolToolCall(
      state({ goalConfirmed: true, planConfirmed: true }),
      'propose_plan',
      {
        summary: '修订后的方案',
        files: [{ path: 'src/App.jsx', reason: '调整组件结构' }],
      },
    )
    expect(r).toMatchObject({ action: 'pending', kind: 'plan' })
    if (r.action !== 'pending') return
    expect(r.content.proposal).toEqual({
      summary: '修订后的方案',
      files: [{ path: 'src/App.jsx', reason: '调整组件结构' }],
      assumptions: [],
      verificationPlan: [],
    })
  })

  it('args 校验失败（propose_plan files 空）→ invalid，resultText 含「files」路径化错误', () => {
    const r = decideProtocolToolCall(state({ goalConfirmed: true }), 'propose_plan', {
      summary: '空方案',
      files: [],
    })
    expect(r.action).toBe('invalid')
    if (r.action !== 'invalid') return
    expect(r.resultText).toContain('files')
  })

  it('未知协议工具名 → invalid（防御）', () => {
    const r = decideProtocolToolCall(state({ goalConfirmed: true }), 'nonexistent', {})
    expect(r.action).toBe('invalid')
    if (r.action !== 'invalid') return
    expect(r.resultText).toContain('nonexistent')
  })
})
