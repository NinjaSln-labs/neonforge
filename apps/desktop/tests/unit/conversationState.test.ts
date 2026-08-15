import { describe, it, expect } from 'vitest'
import {
  initialState, userConfirmed, userRejected, setPending, approvalGranted, applyToolResult,
  classifyAction, canExecute, plannedComplete, forceToolInput, isProgressing, pendingCardToShow, shouldStopContinuation,
  type ConversationState,
} from '../../src/domain/conversationState'

// 会话状态机（Task 聚合——2026-08-14 session-state-machine.md S1）
// 覆盖：状态转换不可变 / 单一 PENDING / 门控优先级（A0 §3.5）/ 追加语义（A0 §5）/
// forceTool 无计划分支（缝隙 3）/ 动作分类单一权威（缝隙 4）/ 进展判定（缝隙 2）/ 确认卡触发（缝隙 5）

describe('conversationState——转换（唯一入口，不可变）', () => {
  it('userConfirmed goal：任务边界重置（进度/清单/达成清零）+ pending 清除', () => {
    let s = initialState()
    s = approvalGranted(setPending(s, 'approval'), ['/test/a.js'])
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(s.plannedFiles.size).toBe(1)
    expect(s.producedFiles.size).toBe(1)
    const next = userConfirmed(s, 'goal')
    expect(s.goalConfirmed).toBe(false) // 原状态不可变
    expect(next.goalConfirmed).toBe(true)
    expect(next.pending).toBe('none')
    expect(next.plannedFiles.size).toBe(0)
    expect(next.producedFiles.size).toBe(0)
    expect(next.achievementConfirmed).toBe(false)
    expect(next.filesApproved).toBe(false)
    expect(next.lastToolFailed).toBe(false)
  })

  it('userConfirmed execution：蕴含目标确认（handleExecutionConfirmed 现状语义）', () => {
    const next = userConfirmed(initialState(), 'execution')
    expect(next.goalConfirmed).toBe(true)
    expect(next.executionConfirmed).toBe(true)
    expect(next.pending).toBe('none')
  })

  it('userRejected：状态回退 + pending 清除（A0 §3.2 否→回退）', () => {
    const s = userConfirmed(initialState(), 'goal')
    const next = userRejected(s, 'goal')
    expect(next.goalConfirmed).toBe(false)
    expect(next.pending).toBe('none')
  })

  it('approvalGranted：追加语义（不覆盖前批——A0 §5）', () => {
    let s = approvalGranted(initialState(), ['/test/a.js'])
    s = approvalGranted(s, ['/test/b.js'])
    expect(s.plannedFiles.size).toBe(2)
    expect(s.plannedFiles.has('/test/a.js')).toBe(true)
  })

  it('applyToolResult：写成功入 produced；策略引导（policy）不置失败（坑 93 ②）', () => {
    let s = applyToolResult(initialState(), { name: 'write', ok: true, file: '/test/a.js' })
    expect(s.producedFiles.has('/test/a.js')).toBe(true)
    s = applyToolResult(s, { name: 'write', ok: false, policy: true })
    expect(s.lastToolFailed).toBe(false) // 策略引导 ≠ 执行失败
    s = applyToolResult(s, { name: 'bash', ok: false, error: 'exit-1' })
    expect(s.lastToolFailed).toBe(true)
    s = applyToolResult(s, { name: 'bash', ok: true })
    expect(s.lastToolFailed).toBe(false)
  })

  it('setPending：会话级单一 PENDING（覆盖而非叠加）', () => {
    const s = setPending(setPending(initialState(), 'goal'), 'approval')
    expect(s.pending).toBe('approval')
  })
})

describe('conversationState——动作分类（缝隙 4 单一权威）', () => {
  it('write/edit = side-effect；read/search/LSP = readonly', () => {
    expect(classifyAction('write')).toBe('side-effect')
    expect(classifyAction('edit')).toBe('side-effect')
    expect(classifyAction('read')).toBe('readonly')
    expect(classifyAction('search')).toBe('readonly')
    expect(classifyAction('check-capability')).toBe('readonly')
  })

  it('bash 按命令头判定：ls/cat 只读；npm install 副作用（与 preApproval 同源）', () => {
    expect(classifyAction('bash', 'ls -la')).toBe('readonly')
    expect(classifyAction('bash', 'cd /test && cat package.json')).toBe('readonly')
    expect(classifyAction('bash', 'npm install three')).toBe('side-effect')
    expect(classifyAction('bash', 'npm init -y && npm install')).toBe('side-effect')
    expect(classifyAction('bash', 'sudo rm -rf /')).toBe('side-effect')
  })
})

describe('conversationState——canExecute 门控（A0 §3.5 优先级）', () => {
  it('PENDING 冻结优先于一切（确认点未处理时动作无效）', () => {
    const s = setPending(initialState(), 'goal')
    expect(canExecute(s, { name: 'read' }, false).ok).toBe(false)
    expect(canExecute(s, { name: 'write', path: '/test/a.js' }, false).ok).toBe(false)
  })

  it('目标未确认：只读放行、副作用拒绝（A0 §3.1 活动边界）', () => {
    const s = initialState()
    expect(canExecute(s, { name: 'read' }, false).ok).toBe(true)
    expect(canExecute(s, { name: 'bash', command: 'ls' }, false).ok).toBe(true)
    expect(canExecute(s, { name: 'write', path: '/test/a.js' }, false).ok).toBe(false)
    expect(canExecute(s, { name: 'bash', command: 'npm install' }, false).ok).toBe(false)
  })

  it('执行未确认：探索 bash 放行（缝隙 4——只读不算动手）、副作用拒绝', () => {
    const s = userConfirmed(initialState(), 'goal')
    expect(canExecute(s, { name: 'bash', command: 'ls -la' }, false).ok).toBe(true)
    expect(canExecute(s, { name: 'bash', command: 'npm install three' }, false).ok).toBe(false)
    expect(canExecute(s, { name: 'write', path: '/test/a.js' }, false).ok).toBe(false)
  })

  it('执行已确认 → 清单判定：清单内放行、清单外拒绝带边界（A0 §5）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = approvalGranted(s, ['/test/a.js'])
    expect(canExecute(s, { name: 'write', path: '/test/a.js' }, true).ok).toBe(true)
    const r = canExecute(s, { name: 'write', path: '/test/outside.js' }, false)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('a.js') // 拒绝回填带清单内容
  })

  it('清单为空（无计划）→ 无文件边界（写放行由确认点把关）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    expect(canExecute(s, { name: 'write', path: '/test/any.js' }, false).ok).toBe(true)
  })
})

describe('conversationState——plannedComplete / forceToolInput（缝隙 3）', () => {
  it('无计划 + 有产出 → 完成（A0 §4 补行——防 forceTool 死锁）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    const s2: ConversationState = s
    expect(plannedComplete(s2, new Set())).toBe(true)
    expect(forceToolInput(s2, new Set()).plannedComplete).toBe(true)
  })

  it('无计划 + 无产出 → 未完成 → forceTool 强制（防只说不做）', () => {
    const s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    expect(plannedComplete(s, new Set())).toBe(false)
    expect(forceToolInput(s, new Set()).produced).toBe(false)
  })

  it('有计划：全部产出（produced ∪ 文件树）→ 完成；缺一个 → 未完成', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = approvalGranted(s, ['/test/a.js', '/test/b.js'])
    s = applyToolResult(s, { name: 'write', ok: true, file: '/test/a.js' })
    expect(plannedComplete(s, new Set())).toBe(false)
    expect(plannedComplete(s, new Set(['/test/b.js']))).toBe(true) // 文件树出现也算产出
  })

  it('lastToolFailed → 释放强制（模型可诊断——A0 §4）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = applyToolResult(s, { name: 'bash', ok: false, error: 'exit-1' })
    expect(forceToolInput(s, new Set()).lastToolFailed).toBe(true)
  })

  it('pending 非 none → forceToolInput.pending=true（P1——A0 §4 补行：等用户决策不强制，与 canExecute 同源）', () => {
    for (const kind of ['goal', 'execution', 'achievement', 'approval'] as const) {
      const s = setPending(initialState(), kind)
      expect(forceToolInput(s, new Set()).pending).toBe(true)
    }
    expect(forceToolInput(initialState(), new Set()).pending).toBe(false)
    expect(forceToolInput(userConfirmed(initialState(), 'goal'), new Set()).pending).toBe(false)
  })
})

describe('conversationState——isProgressing（缝隙 2）', () => {
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

describe('conversationState——pendingCardToShow（缝隙 5）', () => {
  const show = (goal: boolean, exec: boolean, achieved: boolean, content: string, sideEffect = false) =>
    pendingCardToShow(goal, exec, achieved, content, sideEffect)

  it('模型标记命中 → 对应确认点', () => {
    expect(show(false, false, false, '好的。【目标确认：做一个游戏】')).toBe('goal')
    expect(show(true, false, false, '【执行方案】\n- a.js')).toBe('execution')
    expect(show(true, false, false, '【已达成】完成')).toBe('achievement')
  })

  it('无标记但有副作用工具待执行 → 执行确认卡（execPendingCalls 现状语义）', () => {
    expect(show(true, false, false, '开始写。', true)).toBe('execution')
  })

  it('「等确认」语义（模型自然语言等待——无标记无工具也命中，防续聊遮挡卡死锁）', () => {
    expect(show(true, false, false, '好的，方案如下，等你确认。')).toBe('execution')
    expect(show(true, false, false, '我先看看项目现状。')).toBe('none') // 探索陈述——不触发
  })

  it('已确认的标记不再触发卡（确认点一次性）', () => {
    expect(show(true, true, false, '【目标确认：…】【执行方案】…')).toBe('none')
  })
})

describe('conversationState——D5 单一 PENDING 冻结语义（2026-08-15）', () => {
  it('目标/执行/达成任一 pending → 所有工具无效（含只读——A0 §3.4 无害≠有用）', () => {
    for (const kind of ['goal', 'execution', 'achievement'] as const) {
      const s = setPending(initialState(), kind)
      expect(canExecute(s, { name: 'read' }, false).ok).toBe(false)
      expect(canExecute(s, { name: 'bash', command: 'ls -la' }, false).ok).toBe(false)
      expect(canExecute(s, { name: 'search' }, false).ok).toBe(false)
      expect(canExecute(s, { name: 'write', path: '/test/a.js' }, true).ok).toBe(false)
      expect(canExecute(s, { name: 'write', path: '/test/a.js' }, false).ok).toBe(false)
    }
  })

  it('授权卡 pending（approval）同样冻结全部工具', () => {
    const s = setPending(initialState(), 'approval')
    expect(canExecute(s, { name: 'read' }, false).ok).toBe(false)
    expect(canExecute(s, { name: 'write', path: '/test/a.js' }, false).ok).toBe(false)
  })

  it('确认/拒绝/批准均清除 pending（用户决策 = 下一状态唯一输入）', () => {
    expect(userConfirmed(setPending(initialState(), 'goal'), 'goal').pending).toBe('none')
    expect(userConfirmed(setPending(initialState(), 'execution'), 'execution').pending).toBe('none')
    expect(userConfirmed(setPending(initialState(), 'achievement'), 'achievement').pending).toBe('none')
    expect(userRejected(setPending(initialState(), 'goal'), 'goal').pending).toBe('none')
    expect(approvalGranted(setPending(initialState(), 'approval'), ['/test/a.js']).pending).toBe('none')
  })
})

describe('conversationState——shouldStopContinuation（问题 A：maybeContinue 与 canExecute 同源）', () => {
  it('pending 非 none（卡在任意消息——含旧消息授权卡）→ 停续聊', () => {
    for (const kind of ['goal', 'execution', 'achievement', 'approval'] as const) {
      const s = setPending(initialState(), kind)
      // 最后一条消息无任何卡信号（授权卡在旧消息——lastMsg 派生检测不到的正是这个场景）
      expect(shouldStopContinuation(s, { needsApproval: false, confirmPending: false })).toBe(true)
    }
  })

  it('pending=none + 最后消息授权卡 → 停（既有语义——卡在最后一条消息）', () => {
    expect(shouldStopContinuation(initialState(), { needsApproval: true, confirmPending: false })).toBe(true)
  })

  it('pending=none + 最后消息确认卡 → 停（既有语义——确认卡触发）', () => {
    expect(shouldStopContinuation(initialState(), { needsApproval: false, confirmPending: true })).toBe(true)
  })

  it('pending=none + 无卡信号 → 继续（模型还在调工具——等待自动执行完成）', () => {
    expect(shouldStopContinuation(initialState(), { needsApproval: false, confirmPending: false })).toBe(false)
  })
})

describe('conversationState——plannedComplete 基准统一（坑 102：projectFiles 必须绝对基准——与 planned/produced 同源）', () => {
  it('produced 无记录但文件树（绝对）出现 → 完成（回滚/删除场景文件树权威——坑 102 护栏）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = approvalGranted(s, ['/test/a.js'])
    expect(plannedComplete(s, new Set(['/test/a.js']))).toBe(true)
  })

  it('basename 注入（旧分裂——MainWorkspace 原 listDir e.name）→ 不命中（锁定调用方必须归一化）', () => {
    let s = userConfirmed(userConfirmed(initialState(), 'goal'), 'execution')
    s = approvalGranted(s, ['/test/a.js'])
    expect(plannedComplete(s, new Set(['a.js']))).toBe(false)
  })
})
