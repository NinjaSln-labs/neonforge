import { describe, it, expect } from 'vitest'
import { evaluateTurnProgress, detectStuck, initialStuckState, parseExecutionPlan, summarizeCapability, goalFallbackTrigger, isQuestionLike } from '../../src/domain/agentLoop'

// 领域层：progress-aware 卡住检测（2026-08-06 DDD 落地——行业调研 tavily+serper 双源：activity≠progress + 连续无进展升级 + needs-human）

// 2026-08-07 无阶段重构 S5：执行方案清单解析（plannedFiles 来源 ∪ 执行方案清单）
describe('parseExecutionPlan（执行方案清单解析）', () => {
  it('【执行方案】块内 - 行提取文件路径（去括号原因）', () => {
    const text = '以下是执行方案：【执行方案】\n- index.html（页面骨架）\n- src/main.js（游戏逻辑）\n- style.css\n确认后开始。'
    expect(parseExecutionPlan(text)).toEqual(['index.html', 'src/main.js', 'style.css'])
  })
  it('无【执行方案】标记 → 返回空数组（防误抓正文 - 行）', () => {
    expect(parseExecutionPlan('我会先读一下文件结构，再给出方案。')).toEqual([])
  })
  it('块后还有内容（其他【标记）→ 只取块内', () => {
    const text = '【执行方案】\n- a.js\n【目标确认】xxx'
    expect(parseExecutionPlan(text)).toEqual(['a.js'])
  })
  it('• 符号行同样解析（容错）', () => {
    expect(parseExecutionPlan('【执行方案】\n• b.js（改配置）')).toEqual(['b.js'])
  })
})

describe('ProgressEvaluator（单轮进展评估）', () => {
  const empty = new Set<string>()

  it('write/edit 成功 = 真实产出（artifactProduced）', () => {
    const p = evaluateTurnProgress({ toolCalls: [{ name: 'edit', status: 'done', file: 'main.js' }], content: '改好了', prevReadFiles: empty })
    expect(p.artifactProduced).toBe(true)
  })

  // 2026-08-14 缝隙 2：副作用工具成功（bash 安装/验证）也算进展——安装/验证阶段不再被 escalate 打断合法链
  it('副作用工具成功 = 进展（sideEffectSucceeded——bash 安装/验证）；只读 bash 成功不算', () => {
    const install = evaluateTurnProgress({ toolCalls: [{ name: 'bash', status: 'done', command: 'npm install three' }], content: '', prevReadFiles: empty })
    expect(install.sideEffectSucceeded).toBe(true)
    const readonly = evaluateTurnProgress({ toolCalls: [{ name: 'bash', status: 'done', command: 'ls -la' }], content: '', prevReadFiles: empty })
    expect(readonly.sideEffectSucceeded).toBe(false) // 防换文件/换只读命令假装进展（坑 81）
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

  // 2026-08-14 缝隙 2：安装/验证阶段（bash 成功）→ 停滞计数重置——不 escalate 打断合法工具链
  it('副作用工具成功（bash 安装）→ 重置停滞计数（不 escalate）', () => {
    const r1 = detectStuck({ turn: noProgressTurn(), prev: initialStuckState }) // 累积 1
    const installing = evaluateTurnProgress({ toolCalls: [{ name: 'bash', status: 'done', command: 'npm install three' }], content: '', prevReadFiles: new Set() })
    const r2 = detectStuck({ turn: installing, prev: r1.state }) // 进展 → 重置
    expect(r2.state).toEqual(initialStuckState)
    const r3 = detectStuck({ turn: noProgressTurn(), prev: r2.state }) // 重新累积
    expect(r3.event?.type).toBe('no-progress')
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

  // 2026-08-06 任务完成度（deepcode unimplemented_files 借鉴——approve-files 规划文件 vs 产出）
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

  // 2026-08-06 补充（用户「清单来源不只 approve-files」——③ projectFiles 项目文件树产出校验）
  it('规划文件出现在项目文件树（projectFiles）→ 视为已产出（比 write 记录可靠——回滚/删除不在树中）', () => {
    const planned = new Set(['index.html', 'main.js'])
    const produced = new Set(['index.html']) // write 记录只有 index.html
    const projectFiles = new Set(['index.html', 'main.js']) // 但 main.js 已在文件树（树刷新确认产出）
    const turn = evaluateTurnProgress({ toolCalls: [], content: '都写好了', prevReadFiles: new Set(), plannedFiles: planned, producedFiles: produced, projectFiles })
    expect(turn.hasRemainingPlanned).toBe(false) // 树中已有 → 无剩余
    const r = detectStuck({ turn, prev: { consecutiveNoProgress: 1, escalations: 0 } })
    expect(r.event).toBeUndefined()
  })
})

// 2026-08-08 O2 处理（用户「check-capability 默认不向用户展示，只有检测后需要用户实质确认的时候展示」）：
// 能力检测结果判定——是否需要用户实质决策（missing/failed）+ 人类化摘要（领域层纯函数——L1 可测）
describe('summarizeCapability（能力检测结果——是否需用户决策）', () => {
  it('能力全部 ready → 无需用户决策（needsUser=false——工具卡默认隐藏）', () => {
    const r = summarizeCapability({ capabilities: [
      { id: 'text-edit', status: 'ready' },
      { id: 'node-runtime', status: 'ready' }
    ] })
    expect(r.needsUser).toBe(false)
    expect(r.summary).toContain('能力齐备')
  })

  it('存在 missing/failed → 需要用户决策（needsUser=true——工具卡展示）+ 摘要列出缺失', () => {
    const r = summarizeCapability({ capabilities: [
      { id: 'text-edit', status: 'ready' },
      { id: 'node-runtime', status: 'missing', detail: 'node 未安装' },
      { id: 'dev-tools', status: 'failed' }
    ] })
    expect(r.needsUser).toBe(true)
    expect(r.summary).toContain('node-runtime')
    expect(r.summary).toContain('dev-tools')
    expect(r.summary).toContain('缺失')
  })

  it('无 capabilities 字段 → 视为无需决策（防御）', () => {
    expect(summarizeCapability({}).needsUser).toBe(false)
    expect(summarizeCapability(undefined).needsUser).toBe(false)
  })
})

// 2026-08-07 根因 2（冒烟 13）：待授权轮（need-approval——模型停住等用户批准）不算停滞——不 escalate（授权流不许打断）
describe('StuckDetector 待授权轮排除（根因 2——write 授权卡被当无产出 escalate 打断授权流）', () => {
  const baseInput = {
    toolCalls: [],
    content: 'text',
    prevReadFiles: new Set<string>(),
    plannedFiles: new Set<string>(['/p/a.js']),
    producedFiles: new Set<string>()
  }
  it('need-approval 工具（write 授权卡）→ 连续多轮不 escalate（重置——等用户批准不是卡住）', () => {
    let state = initialStuckState
    for (let i = 0; i < 5; i++) {
      const turn = evaluateTurnProgress({ ...baseInput, toolCalls: [{ name: 'write', status: 'need-approval', file: '/p/a.js' }] })
      const r = detectStuck({ turn, prev: state })
      state = r.state
      expect(r.event?.type ?? 'none').not.toBe('escalate')
      expect(r.event?.type ?? 'none').not.toBe('needs-human')
    }
  })
  it('plan-approval 卡同理（approve-files 待批准——不 escalate）', () => {
    let state = initialStuckState
    for (let i = 0; i < 4; i++) {
      const turn = evaluateTurnProgress({ ...baseInput, toolCalls: [{ name: 'approve-files', status: 'file-approval' }] })
      const r = detectStuck({ turn, prev: state })
      state = r.state
      expect(r.event?.type ?? 'none').not.toBe('escalate')
    }
  })
  it('对照：无工具纯文本（无待授权）连续 2 轮 → 仍 escalate（原行为保留——真卡住检测不退化）', () => {
    let state = initialStuckState
    let escalated = false
    for (let i = 0; i < 3; i++) {
      const turn = evaluateTurnProgress({ ...baseInput, toolCalls: [] })
      const r = detectStuck({ turn, prev: state })
      state = r.state
      if (r.event?.type === 'escalate') escalated = true
    }
    expect(escalated).toBe(true)
  })
})

// 2026-08-15 D6：目标确认兜底触发（词表单源——渲染层不再自建正则）
describe('goalFallbackTrigger（目标确认兜底——D6）', () => {
  it('征询确认（含问句形式）→ 触发', () => {
    expect(goalFallbackTrigger('我理解你的目标是做一个游戏，等你确认。')).toBe(true)
    expect(goalFallbackTrigger('这个方案行不行？')).toBe(true)
    expect(goalFallbackTrigger('就按这个来，确认一下？')).toBe(true)
  })
  it('目标总结陈述（非问句）→ 触发', () => {
    expect(goalFallbackTrigger('你的需求是整理这个文件夹的图片。')).toBe(true)
    expect(goalFallbackTrigger('我们要做的是建一个个人展示页。')).toBe(true)
    expect(goalFallbackTrigger('目标就是修好这个页面。')).toBe(true)
  })
  it('澄清提问（目标+后续问句）→ 不触发（决策点互斥——确认卡不插队）', () => {
    expect(goalFallbackTrigger('你的需求是做一个游戏，你想做成什么样？')).toBe(false)
    expect(goalFallbackTrigger('敌人什么样？一关还是波次？')).toBe(false)
  })
  it('空内容/普通陈述 → 不触发', () => {
    expect(goalFallbackTrigger('')).toBe(false)
    expect(goalFallbackTrigger('我先看看项目结构。')).toBe(false)
    expect(goalFallbackTrigger('文件已整理完成。')).toBe(false)
  })
  it('与 isQuestionLike 语义一致（问句直接走澄清，不走兜底）', () => {
    expect(isQuestionLike('可以吗？')).toBe(true)
    expect(goalFallbackTrigger('可以吗？')).toBe(true) // 征询确认词命中（设计：问句确认征询=要决策）
  })
})
