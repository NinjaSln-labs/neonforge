// L1 领域测试：e2e 模拟器域（设计 docs/design/e2e-simulator-domain-design.md）
// signals（信号派生单一来源）/ convergence（收敛守卫——#9 域对象化）/ decide（决策策略）/
// journey（决策点驱动 · 无阶段 · PHASE 终止）/ verify（防假阳性验证）
import { describe, it, expect } from 'vitest'
import { deriveModelSignal, Signal, hasPlanMarkWithoutLines } from '../../e2e-sim/signals.mjs'
import { createGuard } from '../../e2e-sim/convergence.mjs'
import {
  decide,
  classifyQuestion,
  matchOption,
  typeAnswer,
  verifyGoalEcho,
  Question,
  profileComplete,
} from '../../e2e-sim/decide.mjs'
import { createJourney, advance, terminated } from '../../e2e-sim/journey.mjs'
import {
  verifyPlanComplete,
  verifyArtifacts,
  verifyPlayable,
  verifyRequirementsComplete,
} from '../../e2e-sim/verify.mjs'

describe('signals（模型信号派生——单一来源）', () => {
  it('goal-proposed：消息含【目标确认：】标记', () => {
    expect(deriveModelSignal({ content: '好的。【目标确认：做一个待办应用】' })).toBe(
      Signal.GOAL_PROPOSED,
    )
  })

  it('plan-proposed：消息含【执行方案】+ 文件行', () => {
    const c = '【执行方案】\n- /test/app.ts（核心）\n等你确认。'
    expect(deriveModelSignal({ content: c })).toBe(Signal.PLAN_PROPOSED)
  })

  it('【执行方案】缺文件行 → 非 plan-proposed（hasPlanMarkWithoutLines 识别）', () => {
    const c = '【执行方案】我等下写几个文件'
    expect(deriveModelSignal({ content: c })).toBe(Signal.NONE)
    expect(hasPlanMarkWithoutLines(c)).toBe(true)
  })

  it('completion-claimed：消息含【已达成】', () => {
    expect(deriveModelSignal({ content: '【已达成】写完了' })).toBe(Signal.COMPLETION_CLAIMED)
  })

  it('approval-requested：approve-files 工具卡待批', () => {
    expect(deriveModelSignal({ content: '' }, '', ['approve-files'])).toBe(
      Signal.APPROVAL_REQUESTED,
    )
  })

  it('approval-requested：状态栏「有操作待你批准」', () => {
    expect(deriveModelSignal({ content: '' }, '有操作待你批准')).toBe(Signal.APPROVAL_REQUESTED)
  })

  it('promising：状态栏「说要做但还没动手」', () => {
    expect(deriveModelSignal({ content: '' }, '说要做但还没动手')).toBe(Signal.PROMISING)
  })

  it('promising：承诺词（SEM_PROMISE 演进）', () => {
    expect(deriveModelSignal({ content: '我开始写了' })).toBe(Signal.PROMISING)
  })

  it('inviting-test：localhost 地址 + 试玩词', () => {
    expect(deriveModelSignal({ content: '打开 http://localhost:5173 试试' })).toBe(
      Signal.INVITING_TEST,
    )
  })

  it('clarifying：候选块优先', () => {
    expect(deriveModelSignal({ content: '你要哪种？', candidates: ['射击', '解谜'] })).toBe(
      Signal.CLARIFYING,
    )
  })

  it('clarifying：标准 4 问（无候选）', () => {
    expect(deriveModelSignal({ content: '你想做成什么样算完成？' })).toBe(Signal.CLARIFYING)
  })

  it('asking-decision：方向征询（不答非所问——A7 教训）', () => {
    expect(deriveModelSignal({ content: '按这个方向来可以吗？' })).toBe(Signal.ASKING_DECISION)
  })

  it('producing：最近工具为副作用推进', () => {
    expect(deriveModelSignal({ tools: ['read', 'write'] })).toBe(Signal.PRODUCING)
  })

  it('exploring：最近工具为只读探索', () => {
    expect(deriveModelSignal({ tools: ['write', 'read'] })).toBe(Signal.EXPLORING)
  })

  it('none：纯陈述', () => {
    expect(deriveModelSignal({ content: '这是项目结构说明。' })).toBe(Signal.NONE)
  })
})

describe('convergence（收敛守卫——探索容忍 · 停滞判死——#9 域对象化）', () => {
  it('进展轮（指纹变化）不消耗停滞计数——探索容忍', () => {
    const g = createGuard({ staleLimit: 3 })
    expect(g.observe('fp1')).toBe('progressing')
    expect(g.observe('fp2')).toBe('progressing')
    expect(g.observe('fp3')).toBe('progressing')
    expect(g.staleCount).toBe(0) // 连续进展——停滞计数恒 0
  })

  it('停滞轮计数——连续重复判死', () => {
    const g = createGuard({ staleLimit: 3 })
    g.observe('same')
    expect(g.observe('same')).toBe('stale')
    expect(g.observe('same')).toBe('stale')
    expect(g.observe('same')).toBe('exceeded') // 第 3 次重复 = 判死
  })

  it('进展中断停滞——重置', () => {
    const g = createGuard({ staleLimit: 3 })
    g.observe('a')
    g.observe('a')
    expect(g.observe('b')).toBe('progressing') // 新指纹——重置停滞
    expect(g.staleCount).toBe(0)
  })

  it('总轮硬上限（防无限提问）', () => {
    const g = createGuard({ totalLimit: 3 })
    g.observe('a')
    g.observe('b')
    g.observe('c')
    expect(g.observe('d')).toBe('exceeded') // 第 4 轮超总上限
  })

  it('reset 清空计数（指纹重建——首轮为新指纹）', () => {
    const g = createGuard({ staleLimit: 2 })
    g.observe('x')
    g.observe('x')
    g.reset()
    expect(g.observe('x')).toBe('progressing') // 重置后首轮 = 指纹重建（新基线）
    expect(g.observe('x')).toBe('stale') // 第二轮同指纹才计停滞
    expect(g.totalRounds).toBe(2)
  })
})

describe('decide（决策策略——信号 × 上下文 → 用户决策）', () => {
  it('goal-proposed → confirm-goal（目标确认卡）', () => {
    const d = decide(Signal.GOAL_PROPOSED, { content: '【目标确认：做游戏】' })
    expect(d.action).toBe('confirm-goal')
  })

  it('plan-proposed → confirm-plan（方案确认卡）', () => {
    const d = decide(Signal.PLAN_PROPOSED, { content: '【执行方案】' })
    expect(d.action).toBe('confirm-plan')
  })

  it('completion-claimed → confirm-resolution', () => {
    const d = decide(Signal.COMPLETION_CLAIMED, { content: '【已达成】' })
    expect(d.action).toBe('confirm-resolution')
  })

  it('approval-requested → approve', () => {
    expect(decide(Signal.APPROVAL_REQUESTED, {}).action).toBe('approve')
  })

  it('promising → nudge（「继续」）', () => {
    expect(decide(Signal.PROMISING, {}).action).toBe('nudge')
  })

  it('inviting-test → playtest-feedback', () => {
    expect(decide(Signal.INVITING_TEST, { content: 'http://localhost:5173' }).action).toBe(
      'playtest-feedback',
    )
  })

  it('clarifying 候选：WHAT 类同音泛化选「射击」（设计≈射击）', () => {
    const d = decide(Signal.CLARIFYING, {
      content: '你想做一个什么游戏？',
      candidates: ['① 设计类游戏', '② 射击类游戏', '③ 解谜类游戏'],
      profile: {},
    })
    expect(d.action).toBe('choose')
    expect(d.text).toContain('射击')
    expect(d.profilePatch?.[Question.WHAT]).toContain('射击')
  })

  it('clarifying 候选：附加问题且 4 问已齐 → 放权收敛', () => {
    const profile = {
      [Question.WHAT]: '射击游戏',
      [Question.AUDIENCE]: '大众',
      [Question.PLATFORM]: '网页',
      [Question.DONE]: '能玩就行',
    }
    const d = decide(Signal.CLARIFYING, {
      content: '要不要加个背景音乐？',
      candidates: ['要', '不要'],
      profile,
    })
    expect(d.action).toBe('answer')
    expect(d.text).toContain('都行')
  })

  it('asking-decision：方向确认 → 确认方向并推动收敛（A7 教训——不答非所问）', () => {
    const d = decide(Signal.ASKING_DECISION, { content: '按这个方向来可以吗？' })
    expect(d.action).toBe('answer')
    expect(d.text).toContain('方向')
  })

  it('clarifying 无候选：4 问分类打字回答', () => {
    const d = decide(Signal.CLARIFYING, { content: '你想给谁玩？', profile: {} })
    expect(d.action).toBe('answer')
    expect(d.text).toContain('随便谁')
    expect(d.profilePatch?.[Question.AUDIENCE]).toBeTruthy()
  })

  it('none/producing → wait', () => {
    expect(decide(Signal.NONE, {}).action).toBe('wait')
    expect(decide(Signal.PRODUCING, {}).action).toBe('wait')
  })

  it('classifyQuestion：DONE 强特征优先（含「网页上玩」不误判 PLATFORM）', () => {
    expect(classifyQuestion('做成什么样算完成？')).toBe(Question.DONE)
    expect(classifyQuestion('在哪儿玩？')).toBe(Question.PLATFORM)
  })

  it('matchOption/typeAnswer：画像匹配与答案映射', () => {
    expect(matchOption(Question.PLATFORM, ['手机', '网页'])).toBe(1) // 网页
    expect(typeAnswer(Question.DONE)).toContain('能玩')
  })

  it('verifyGoalEcho：模型复述关键词 → true；未复述 → false', () => {
    expect(verifyGoalEcho('好的，做一个网页射击游戏', '网页射击游戏')).toBe(true)
    expect(verifyGoalEcho('好的，我明白了', '射击')).toBe(false)
  })

  it('profileComplete：4 问齐判定', () => {
    const p = {
      [Question.WHAT]: 'x',
      [Question.AUDIENCE]: 'x',
      [Question.PLATFORM]: 'x',
      [Question.DONE]: 'x',
    }
    expect(profileComplete(p)).toBe(true)
    expect(profileComplete({ [Question.WHAT]: 'x' })).toBe(false)
  })
})

describe('journey（决策点驱动 · 无阶段 · PHASE 终止点）', () => {
  it('advance：confirm-goal 推进 goal 决策点', () => {
    const j = advance(createJourney('all'), {
      signal: Signal.GOAL_PROPOSED,
      action: 'confirm-goal',
    })
    expect(j.confirmed.goal).toBe(true)
    expect(j.decisionPoints).toEqual(['goal'])
  })

  it('PHASE=req：goal 确认后终止', () => {
    let j = createJourney('req')
    expect(terminated(j)).toBe(false)
    j = advance(j, { signal: Signal.GOAL_PROPOSED, action: 'confirm-goal' })
    expect(terminated(j)).toBe(true)
  })

  it('PHASE=design：plan 确认后终止（goal 确认不终止）', () => {
    let j = createJourney('design')
    j = advance(j, { signal: Signal.GOAL_PROPOSED, action: 'confirm-goal' })
    expect(terminated(j)).toBe(false)
    j = advance(j, { signal: Signal.PLAN_PROPOSED, action: 'confirm-plan' })
    expect(terminated(j)).toBe(true)
  })

  it('PHASE=dev：produced 后终止', () => {
    let j = createJourney('dev')
    j = advance(j, { signal: Signal.GOAL_PROPOSED, action: 'confirm-goal' })
    j = advance(j, { signal: Signal.PLAN_PROPOSED, action: 'confirm-plan' })
    expect(terminated(j)).toBe(false)
    j = advance(j, { signal: Signal.PRODUCING, action: 'wait' })
    expect(terminated(j)).toBe(true)
  })

  it('PHASE=all：解决确认 + 产物后 delivered', () => {
    let j = createJourney('all')
    j = advance(j, { signal: Signal.GOAL_PROPOSED, action: 'confirm-goal' })
    j = advance(j, { signal: Signal.PLAN_PROPOSED, action: 'confirm-plan' })
    j = advance(j, { signal: Signal.PRODUCING, action: 'wait' })
    expect(terminated(j)).toBe(false)
    j = advance(j, { signal: Signal.COMPLETION_CLAIMED, action: 'confirm-resolution' })
    expect(j.confirmed.resolution).toBe(true)
    expect(terminated(j)).toBe(true)
  })
})

describe('verify（防假阳性验证）', () => {
  it('verifyPlanComplete：长度 + 要素', () => {
    expect(verifyPlanComplete('短').ok).toBe(false)
    const long = '方案：用 React 做页面结构，模块划分清晰，界面友好，整体流程完整。'.padEnd(
      70,
      '详',
    )
    expect(verifyPlanComplete(long).ok).toBe(true)
  })

  it('verifyArtifacts：计划 ⊆ 产出', () => {
    expect(verifyArtifacts(['a.ts', 'b.ts'], ['a.ts', 'b.ts', 'c.ts']).ok).toBe(true)
    const r = verifyArtifacts(['a.ts', 'b.ts'], ['a.ts'])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['b.ts'])
    expect(verifyArtifacts([], ['x.ts']).ok).toBe(true) // 无计划清单——有产出即过
  })

  it('verifyPlayable：2xx + 内容量', () => {
    expect(verifyPlayable({ status: 200, bytes: 100 }).ok).toBe(true)
    expect(verifyPlayable({ status: 500, bytes: 100 }).ok).toBe(false)
    expect(verifyPlayable({ status: 200, bytes: 10 }).ok).toBe(false)
  })

  it('verifyRequirementsComplete：4 问齐', () => {
    const p = {
      [Question.WHAT]: 'x',
      [Question.AUDIENCE]: 'x',
      [Question.PLATFORM]: 'x',
      [Question.DONE]: 'x',
    }
    expect(verifyRequirementsComplete(p).ok).toBe(true)
    const r = verifyRequirementsComplete({ [Question.WHAT]: 'x' })
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(3)
  })
})
