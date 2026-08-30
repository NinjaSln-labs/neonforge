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

// ============================================================================
// #6 真机回归（2026-08-30——ADR-008 + P1-1 三分支，证据串取自真机 chat log 原文）
// ============================================================================
describe('#6 真机回归：S4 对账三分支修复', () => {
  it('「- 无」空遗留标记 → 不产生 pendingQuestion（真机：被解析成名为「无」的问题）', () => {
    const text = `【已达成】
页面完成。
验证证据：
- ls -la（index.html 存在，5931 字节）
遗留问题：
- 无
`
    const claim = parseCompletionClaim(text)
    expect(claim?.evidence.pendingQuestions).toEqual([])
  })

  it('中文结果括号尾巴 → command 剥离为纯命令、passed 判 undefined（系统代跑可执行）', () => {
    const text = `【已达成】
完成。
验证证据：
- ls -la（index.html 存在，5931 字节，Aug 30 21:30 创建）
- wc -c（index.html 共 5931 字节）
`
    const claim = parseCompletionClaim(text)
    const cmds = claim?.evidence.verification.map((v) => v.command) ?? []
    expect(cmds).toContain('ls -la')
    expect(cmds).toContain('wc -c')
    // 中文结果无通过/失败关键词 → passed undefined（交给系统代跑复核——不臆判）
    for (const v of claim?.evidence.verification ?? []) expect(v.passed).toBeUndefined()
  })

  it('真实失败证据（curl exit-7 连接失败）→ passed=false（对账仍拒——失败验证=达成未证明）', () => {
    const text = `【已达成】
完成。
验证证据：
- curl http://127.0.0.1:5190/index.html（exit-7 连接失败——当前服务已不在运行）
`
    const claim = parseCompletionClaim(text)
    expect(claim?.evidence.verification[0]?.command).toBe('curl http://127.0.0.1:5190/index.html')
    expect(claim?.evidence.verification[0]?.passed).toBe(false)
  })

  it('成功关键词结果 → passed=true（原行为保持）', () => {
    const text = `【已达成】
完成。
验证证据：
- npx vitest run（全部通过）
`
    const claim = parseCompletionClaim(text)
    expect(claim?.evidence.verification[0]).toMatchObject({
      command: 'npx vitest run',
      passed: true,
    })
  })
})
