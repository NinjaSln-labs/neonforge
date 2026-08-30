import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_TOOL_DEFS,
  PROTOCOL_TOOL_NAMES,
  validateProtocolArgs,
} from '../../src/domain/protocolTools'

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
