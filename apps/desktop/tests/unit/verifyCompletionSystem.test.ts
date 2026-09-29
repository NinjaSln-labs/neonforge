import { describe, it, expect } from 'vitest'
import { verifyCompletion, type CompletionClaim } from '../../src/domain/conversationState'

// S2 spec TDD 网格：verifyCompletion systemState 扩展（设计 §3.3——V1a 系统代跑 + V1b diff 派生）
// 契约（oracle 对照设计原文）：
// - V1a：对 claim.evidence.verification[].command 中声明 passed 的命令，系统复核（代跑结果 ok:false → missing）
// - V1b：claim.evidence.diffs 由系统从 plannedFiles/producedFiles 派生比对（非模型自述）
// - verification 命令非只读（系统不可代跑）→ 该条证据标记 'unverifiable'
// - 证据不足（verification 空 / passed=false / 零条可代跑）→ ok=false；unverifiable 仅标注（ADR-011）；pendingQuestions 不阻塞（ADR-008）
// - unverifiable 语义保持单源（evidenceVerifiable/isSystemVerifiable 复用）
// - 领域层消费同步快照（verificationResults）——代跑执行在 main 侧（S4 接线）

/** mock 系统核验数据（V1a 复核结果 + V1b diff 派生——同步纯函数） */
function mockSystemState(
  verificationResults: Record<string, { ok: boolean; output?: string }> = {},
) {
  return {
    verificationResults,
    deriveDiffs: (planned: Set<string>, produced: Set<string>) =>
      [...produced].filter((p) => planned.has(p)).map((path) => ({ path })),
    plannedFiles: new Set(['src/a.ts', 'src/b.ts']),
    producedFiles: new Set(['src/a.ts', 'src/b.ts']),
  }
}

const claim = (partial: Partial<CompletionClaim>): CompletionClaim => ({
  summary: '完成',
  evidence: { verification: [], diffs: [], pendingQuestions: [] },
  ...partial,
})

describe('verifyCompletion（V1a 系统复核 + V1b diff 派生——S2 扩展）', () => {
  it('只读验证命令系统复核成功 → ok:true（模型自报降级为系统复核）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, mockSystemState({ 'ls src': { ok: true } }))
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
    expect(r.unverifiable).toEqual([])
  })

  it('系统复核失败（代跑 ok:false）→ missing 计入（系统复核失败）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, mockSystemState({ 'ls src': { ok: false } }))
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('verification:ls src')
  })

  it('V1a：代跑 exit 非0 但 stdout 与 claim.output 对齐 → 不 missing（grep -c 零命中）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: "grep -cE 'https?://' a.txt", output: '0', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(
      c,
      mockSystemState({ "grep -cE 'https?://' a.txt": { ok: false, output: '0\n' } }),
    )
    expect(r.ok).toBe(true)
    expect(r.missing).not.toContain("verification:grep -cE 'https?://' a.txt")
  })

  it('仅非只读验证命令（系统不可代跑）→ ok=false + unverifiable（无系统证据）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'npm run deploy', passed: true }], // 非只读（写副作用）
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, mockSystemState())
    expect(r.ok).toBe(false)
    expect(r.unverifiable).toContain('npm run deploy')
  })

  it('混合可代跑+不可代跑：V1a 可代跑过 → ok=true，unverifiable 仍列出', () => {
    const c = claim({
      evidence: {
        verification: [
          { command: 'ls src', passed: true },
          { command: 'npm run deploy', passed: true },
        ],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, mockSystemState({ 'ls src': { ok: true } }))
    expect(r.ok).toBe(true)
    expect(r.unverifiable).toContain('npm run deploy')
  })

  it('verification 为空 → missing 含 verification（不变量 4：无证据不进对账）', () => {
    const c = claim({ evidence: { verification: [], diffs: [], pendingQuestions: [] } })
    const r = verifyCompletion(c, mockSystemState())
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('verification')
  })

  it('pendingQuestions 非空 → 不阻塞 ok（ADR-008：遗留问题=解决卡知情项，非证据缺失——真机死锁修正）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: ['删除未确认'],
      },
    })
    const r = verifyCompletion(c, mockSystemState())
    expect(r.ok).toBe(true)
    expect(r.missing.some((m) => m.startsWith('pending-question:'))).toBe(false)
  })

  it('V1b：diffs 由系统从 plannedFiles/producedFiles 派生比对（非模型自述）——全产出 ok', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, mockSystemState({ 'ls src': { ok: true } }))
    expect(r.ok).toBe(true)
    // diff 对账由系统派生——planned∩produced = ['src/a.ts','src/b.ts'] 全对上 → 无 missing
    expect(r.missing).not.toContain('diff:planned-not-produced')
  })

  it('V1b：planned 有文件未产出 → 系统派生 diff 缺失（missing: diff:planned-not-produced）', () => {
    const st = mockSystemState({ 'ls src': { ok: true } })
    st.producedFiles = new Set(['src/a.ts']) // b.ts 未产出
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c, st)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('diff:planned-not-produced')
  })

  it('systemState 缺省 = 纯逻辑判定（S1 兼容——不代跑不派生）', () => {
    const c = claim({
      evidence: {
        verification: [{ command: 'ls src', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    })
    const r = verifyCompletion(c)
    expect(r.ok).toBe(true) // 纯逻辑：只读 + passed → 通过（无系统复核也过——S4 接线后必传）
  })
})
