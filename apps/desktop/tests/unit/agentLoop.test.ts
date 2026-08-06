import { describe, it, expect } from 'vitest'
import { evaluateTurnProgress, detectStuck, initialStuckState } from '../../src/renderer/domain/agentLoop'

// 领域层：progress-aware 卡住检测（2026-08-06 DDD 落地——行业调研 tavily+serper 双源：activity≠progress + 连续无进展升级 + needs-human）

describe('ProgressEvaluator（单轮进展评估）', () => {
  const empty = new Set<string>()

  it('write/edit 成功 = 真实产出（artifactProduced）', () => {
    const p = evaluateTurnProgress({ toolCalls: [{ name: 'edit', status: 'done', file: 'main.js' }], content: '改好了', prevReadFiles: empty })
    expect(p.artifactProduced).toBe(true)
  })

  it('read 新文件 = 新信息（readNewFile）；同文件重复 read = 非进展', () => {
    const prev = new Set(['main.js'])
    expect(evaluateTurnProgress({ toolCalls: [{ name: 'read', status: 'done', file: 'main.js' }], content: '', prevReadFiles: prev }).readNewFile).toBe(false)
    expect(evaluateTurnProgress({ toolCalls: [{ name: 'read', status: 'done', file: 'other.js' }], content: '', prevReadFiles: prev }).readNewFile).toBe(true)
  })

  it('问句/沟通/完成态 = 正常对话（排除——不算停滞）', () => {
    expect(evaluateTurnProgress({ toolCalls: [], content: '这样可以吗？', prevReadFiles: empty }).isQuestion).toBe(true)
    expect(evaluateTurnProgress({ toolCalls: [], content: '我先和你确认一下', prevReadFiles: empty }).isCommunication).toBe(true)
    expect(evaluateTurnProgress({ toolCalls: [], content: '游戏已经做好了', prevReadFiles: empty }).isDone).toBe(true)
  })
})

describe('StuckDetector（卡住检测——连续无进展升级）', () => {
  const turn = (over: Partial<Parameters<typeof evaluateTurnProgress>[0] & { toolCalls: Array<{ name: string; status: string; file?: string }> }> = {}) => {
    const toolCalls = over.toolCalls ?? []
    const content = over.content ?? ''
    return evaluateTurnProgress({ toolCalls: toolCalls as Array<{ name: string; status: string; file?: string }>, content, prevReadFiles: over.prevReadFiles ?? new Set() })
  }
  const noProgressTurn = () => turn({ toolCalls: [], content: '我看到了，问题是阴影导致卡顿' }) // 分析结论无工具

  it('连续无进展 2 轮 → escalate（升级续聊）', () => {
    const r1 = detectStuck({ turn: noProgressTurn(), prev: initialStuckState })
    expect(r1.event?.type).toBe('no-progress') // 第一轮仅累积
    expect(r1.state.consecutiveNoProgress).toBe(1)
    const r2 = detectStuck({ turn: noProgressTurn(), prev: r1.state })
    expect(r2.event?.type).toBe('escalate')
    expect(r2.event).toMatchObject({ type: 'escalate' })
  })

  it('升级 2 次仍无进展 → needs-human（转用户——行业 needs_human）', () => {
    const r1 = detectStuck({ turn: noProgressTurn(), prev: initialStuckState }) // no-progress
    const r2 = detectStuck({ turn: noProgressTurn(), prev: r1.state }) // escalate（第 1 次升级）
    const r3 = detectStuck({ turn: noProgressTurn(), prev: r2.state }) // no-progress（升级后重置重新累积）
    const r4 = detectStuck({ turn: noProgressTurn(), prev: r3.state }) // escalate 且 esc>=2 → needs-human
    expect(r4.event?.type).toBe('needs-human')
  })

  it('有进展（write/edit）→ 重置计数（行业：恢复即重置）', () => {
    const r1 = detectStuck({ turn: noProgressTurn(), prev: initialStuckState })
    const progressTurn = turn({ toolCalls: [{ name: 'edit', status: 'done' }], content: '' })
    const r2 = detectStuck({ turn: progressTurn, prev: r1.state })
    expect(r2.state.consecutiveNoProgress).toBe(0)
    expect(r2.event).toBeUndefined()
  })

  it('问句/完成态 → 重置（模型在等用户/已完成——非停滞）', () => {
    const r1 = detectStuck({ turn: noProgressTurn(), prev: initialStuckState })
    const r2 = detectStuck({ turn: turn({ content: '游戏做好了' }), prev: r1.state })
    expect(r2.state.consecutiveNoProgress).toBe(0)
    expect(r2.event).toBeUndefined()
  })

  // 2026-08-06 任务完成度（deepcode unimplemented_files 借鉴——plan_approval 规划文件 vs 产出）
  it('规划文件全部产出 → 无工具结束 = 阶段完成（不 escalate）', () => {
    const planned = new Set(['index.html', 'main.js'])
    const produced = new Set(['index.html', 'main.js'])
    const doneTurn = evaluateTurnProgress({ toolCalls: [], content: '文件都写完了', prevReadFiles: new Set(), plannedFiles: planned, producedFiles: produced })
    expect(doneTurn.hasPlannedFiles).toBe(true)
    expect(doneTurn.hasRemainingPlanned).toBe(false)
    const r = detectStuck({ turn: doneTurn, prev: { consecutiveNoProgress: 1, escalations: 0 } })
    expect(r.event).toBeUndefined() // 任务完成——不停滞
    expect(r.state.consecutiveNoProgress).toBe(0)
  })

  it('规划文件未全部产出 → 无工具结束 = 任务未完成（escalate 消息带剩余数）', () => {
    const planned = new Set(['index.html', 'main.js'])
    const produced = new Set(['index.html']) // main.js 未产出
    const incompleteTurn = evaluateTurnProgress({ toolCalls: [], content: '我看到了问题', prevReadFiles: new Set(), plannedFiles: planned, producedFiles: produced })
    expect(incompleteTurn.hasRemainingPlanned).toBe(true)
    expect(incompleteTurn.remainingCount).toBe(1)
    const r1 = detectStuck({ turn: incompleteTurn, prev: initialStuckState })
    const r2 = detectStuck({ turn: incompleteTurn, prev: r1.state })
    expect(r2.event?.type).toBe('escalate')
    expect(r2.event && 'message' in r2.event ? r2.event.message : '').toContain('规划文件还有 1 个没写')
  })
})
