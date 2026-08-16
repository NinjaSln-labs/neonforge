import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runVerificationCommands } from '../../src/main/verification'
import {
  verifyCompletion,
  deriveDiffs,
  type CompletionClaim,
} from '../../src/domain/conversationState'

// A-010（S4 spec TDD 网格）：V1a 系统代跑 integration——真实执行只读验证命令 → verificationResults →
// verifyCompletion 判定闭环（mock 执行器 → 真实命令代跑 → 结果表 → 领域层消费）
// 契约（oracle 对照设计 §3.3 V1a/V1b + ADR-004）：
// - runVerificationCommands：只代跑系统可核验（readonly/network-read）命令；失败 → ok:false；
//   非只读命令**不执行**（fail-closed——结果表不含该项，判定由领域层 unverifiable 承担）
// - deriveDiffs：planned ∩ produced 匹配项（与 verifyCompletion V1b 消费语义一致）
// - 闭环：系统复核失败（代跑 ok:false）推翻模型自报 passed → missing → verifyCompletion ok:false

describe('runVerificationCommands（S4 V1a——真实只读命令代跑）', () => {
  let cwd: string
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'nf-verify-'))
    writeFileSync(join(cwd, 'a.txt'), 'hello\n')
  })

  it('只读命令真实代跑成功 → ok:true + output（系统复核依据）', async () => {
    const results = await runVerificationCommands(['cat a.txt', 'ls -la'], { cwd })
    expect(results['cat a.txt'].ok).toBe(true)
    expect(results['cat a.txt'].output).toContain('hello')
    expect(results['ls -la'].ok).toBe(true)
  })

  it('命令失败（目标不存在）→ ok:false（系统复核失败——模型自报 passed 被推翻依据）', async () => {
    const results = await runVerificationCommands(['cat not-exist-xyz.txt'], { cwd })
    expect(results['cat not-exist-xyz.txt'].ok).toBe(false)
  })

  it('非只读命令被拒跑（fail-closed——结果表不含该项，不执行）', async () => {
    const results = await runVerificationCommands(['rm a.txt'], { cwd })
    expect(results['rm a.txt']).toBeUndefined()
    // 文件未被删（真的没执行）
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(cwd, 'a.txt'), 'utf8')).toBe('hello\n')
  })

  it('A-010 闭环（拒绝侧）：真实代跑结果 → verifyCompletion 复核——系统复核失败 → missing → ok:false', async () => {
    const claim: CompletionClaim = {
      summary: '完成',
      evidence: {
        verification: [{ command: 'cat not-exist-xyz.txt', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    }
    const results = await runVerificationCommands(['cat not-exist-xyz.txt'], { cwd })
    const r = verifyCompletion(claim, {
      verificationResults: results,
      deriveDiffs,
      plannedFiles: new Set(),
      producedFiles: new Set(),
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('verification:cat not-exist-xyz.txt')
  })

  it('A-010 闭环（通过侧）：系统复核通过 → verifyCompletion ok:true', async () => {
    const claim: CompletionClaim = {
      summary: '完成',
      evidence: {
        verification: [{ command: 'cat a.txt', passed: true }],
        diffs: [],
        pendingQuestions: [],
      },
    }
    const results = await runVerificationCommands(['cat a.txt'], { cwd })
    const r = verifyCompletion(claim, {
      verificationResults: results,
      deriveDiffs,
      plannedFiles: new Set(),
      producedFiles: new Set(),
    })
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
  })
})

describe('deriveDiffs（S4 V1b——planned/produced 系统派生）', () => {
  it('planned 全产出 → 匹配项齐全（V1b 消费：无 diff:planned-not-produced）', () => {
    const diffs = deriveDiffs(new Set(['/t/a.js', '/t/b.js']), new Set(['/t/a.js', '/t/b.js']))
    expect(diffs.map((d) => d.path).sort()).toEqual(['/t/a.js', '/t/b.js'])
  })

  it('planned 有文件未产出 → 匹配项减少（V1b 消费：missing diff:planned-not-produced）', () => {
    const diffs = deriveDiffs(new Set(['/t/a.js', '/t/b.js']), new Set(['/t/a.js']))
    expect(diffs.map((d) => d.path)).toEqual(['/t/a.js'])
    expect(diffs.length).toBe(1)
  })
})
