import { describe, it, expect } from 'vitest'
import { parseCompletionClaim } from '../../src/domain/completionClaimParser'

// S2 spec TDD 网格：parseCompletionClaim（设计 §3.3 + §8.1 C ⑮）
// 契约（oracle 对照设计原文）：
// - 结构化解析【已达成】块 → CompletionClaim（summary + evidence.verification[command/output/passed] + evidence.diffs + evidence.pendingQuestions）
// - 无标记 → null

describe('parseCompletionClaim（完成声明解析——S2）', () => {
  it('完整块 → CompletionClaim（summary + verification + diffs + pendingQuestions）', () => {
    const text = `【已达成】
已完成待办清单功能：列表展示、勾选完成、删除。
验证证据：
- npx vitest run（全部通过）
- npx tsc --noEmit（0 错误）
遗留问题：
- 删除操作未做撤销确认
`
    const claim = parseCompletionClaim(text)
    expect(claim).not.toBeNull()
    if (!claim) return
    expect(claim.summary).toContain('待办清单')
    expect(claim.evidence.verification.length).toBe(2)
    expect(claim.evidence.verification[0].command).toContain('npx vitest run')
    expect(claim.evidence.verification[1].command).toContain('npx tsc --noEmit')
    expect(claim.evidence.pendingQuestions).toEqual(['删除操作未做撤销确认'])
  })

  it('缺验证证据 → verification 空数组（声明不完整——不变量 4 由 verifyCompletion 判定）', () => {
    const text = `【已达成】
完成了。
遗留问题：
- 无
`
    const claim = parseCompletionClaim(text)
    expect(claim).not.toBeNull()
    if (!claim) return
    expect(claim.evidence.verification).toEqual([])
  })

  it('缺遗留问题 → pendingQuestions 空数组', () => {
    const text = `【已达成】
完成了。
验证证据：
- npm test（通过）
`
    const claim = parseCompletionClaim(text)
    expect(claim).not.toBeNull()
    if (!claim) return
    expect(claim.evidence.pendingQuestions).toEqual([])
  })

  it('无【已达成】标记 → null', () => {
    expect(parseCompletionClaim('我先看看效果，稍后汇报。')).toBeNull()
  })

  it('半结构化容错：命令行与说明混排——只取命令形态行', () => {
    const text = `【已达成】
功能完成。
验证证据：
- npm test 跑了一遍，全部用例通过（测试命令）
- 我手动验证了界面
遗留问题：
- 无
`
    const claim = parseCompletionClaim(text)
    expect(claim).not.toBeNull()
    if (!claim) return
    // 「我手动验证了界面」是说明非命令——verification 至少包含命令形态行
    expect(claim.evidence.verification.length).toBeGreaterThanOrEqual(1)
    expect(claim.evidence.verification[0].command).toContain('npm test')
  })

  it('验证行带结果判定（通过/失败）→ passed 字段', () => {
    const text = `【已达成】
完成。
验证证据：
- npx vitest run（全部通过）
- npm run build 失败
`
    const claim = parseCompletionClaim(text)
    expect(claim).not.toBeNull()
    if (!claim) return
    expect(claim.evidence.verification.some((v) => v.passed === true)).toBe(true)
    expect(claim.evidence.verification.some((v) => v.passed === false)).toBe(true)
  })
})
