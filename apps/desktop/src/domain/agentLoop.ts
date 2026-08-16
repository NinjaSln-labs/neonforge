// 领域层：agent 循环卡住检测（Conversation BC——多轮对话子域；2026-08-07 质量把关补 BC 归属）
// progress-aware——2026-08-06 双源调研 tavily+serper 交叉验证：
// 行业共识「activity ≠ progress」（dev.to StuckDetector / stackademic）+ 连续无进展升级 + needs-human 转用户 + arXiv 实时失败检测）
// DDD 落地：Value Object（TurnProgress/StuckState）+ Domain Service（ProgressEvaluator/StuckDetector）+ Domain Event
// 纯逻辑无 React 依赖——L1 可测；ConversationPanel（Application 层）调用
// 2026-08-14 S4：副作用分类同源（classifyAction——缝隙 2 进展判定）
import { classifyAction, isStructuredProposal } from './conversationState.js'
import { isLikelyPath } from './planProposalParser.js'
import { parseCompletionClaim } from './completionClaimParser.js'

// === Value Object: 工具调用视图（AgentTurn 的 toolCalls 投影——领域层可见的最小信息） ===
export interface ToolCallView {
  name: string
  status: string
  file?: string // write/edit 目标 / read 路径
  command?: string // bash 命令（2026-08-14 缝隙 4/2：副作用分类 + 进展判定需要）
}

// === Value Object: 单轮进展（activity 是否转化为 progress——行业「只能真实工作完成时上升的度量」） ===
export interface TurnProgress {
  artifactProduced: boolean // write/edit 成功 = 真实产出（0-1 流程最可靠 progress 信号——与 artifactsReady 门控同源）
  sideEffectSucceeded: boolean // 2026-08-14 缝隙 2：副作用工具成功执行（bash 安装/验证）也算进展——
  // 原只有 artifactProduced——模型装依赖（npm install 成功）被当「无进展」→ escalate 打断合法链
  readNewFile: boolean // read 了此前未读过的文件（新信息）——同文件重复 read = activity 非 progress
  // 2026-08-06 补充（deepcode-hkuds 任务完成度借鉴——用户「文件清单很多地方有」）：approve-files 规划文件是否全部产出
  // 有剩余规划文件 = 任务未完成——模型无工具结束 = 停滞（escalate 强理由）；规划全产出 → 无工具结束 = 阶段完成（不 escalate）
  hasPlannedFiles: boolean // 是否有 approve-files 规划（开发阶段）
  hasRemainingPlanned: boolean // 还有未产出规划文件（任务未完成）
  remainingCount: number
  isQuestion: boolean // 问句/征求同意——模型在等用户，不算停滞
  isCommunication: boolean // 沟通/澄清/确认——模型在对话，不算停滞
  isDone: boolean // 完成态汇报——模型已完成，不算停滞
  needsApproval: boolean // 2026-08-07 待授权轮（need-approval/plan-approval）——模型停住**等用户批准**
  // （设计语义：maybeContinue releaseWorking + return）——不是卡住，不算停滞——
  // 根因 2（冒烟 13）：write 授权卡（need-approval）被 StuckDetector 当「无产出」→ escalate
  // → silent 打断授权流 → 轮 4 授权处理混乱 + 轮 5 重写（此前缺失此排除）
  // S5（§8.1 B 331）：推进维度——结构化提议/完成声明带证据视为推进（模型在走决策点流程——不判停滞）
  proposed: boolean // 结构化提议输出（【目标确认】/【执行方案】/【已达成】信号——与 pendingCardToShow 同源）
  providedEvidence: boolean // 完成声明带验证证据（parseCompletionClaim 判定——verification 非空）
}

// === Domain Service: 文本分类（问句/沟通/完成态——坑 79 结构判定：有限集，不匹配措辞） ===
// 2026-08-07 质量把关 C 类：唯一实现——ConversationPanel isActionPromise 原复制一份（双源），已合并此处复用
export function isQuestionLike(t: string): boolean {
  return /[?？]$/.test(t) || /(吗|呢|吧)[。.!！]?$|可以吗|行不行/.test(t)
}
export function isCommunicationLike(t: string): boolean {
  return /(确认|复述|说明|解释|总结|澄清|商量|理解|明白|知道|收到|确认一下|跟你确认|和你确认|跟您确认|介绍一下|跟你聊|和你聊)/.test(
    t,
  )
}
export function isDoneLike(t: string): boolean {
  return /(完成|做好|搞定|改好|解决|处理完|已写好|已修改|已删除|已添加|已加|可以了|能玩了|没问题|修好了|加好了|实现了|就绪|收工|结束|达标|通过了|在跑|能跑|弄好|好了，|好的，|就是这些|就这样|先说这么多)/.test(
    t,
  )
}

// === Domain Service: 执行方案清单解析（2026-08-07 无阶段重构 S5——TurnProgress.plannedFiles 来源调整） ===
// plannedFiles = approve-files 批准 ∪ 执行方案清单（模型输出【执行方案】块——S6 提示词引导格式）：
//   【执行方案】
//   - 文件路径（原因）
//   - 文件路径2（原因）
// 行首 `- `/`• ` 提取路径（去括号原因注释）；无【执行方案】标记或空块 → 返回 []
// 2026-08-15 坑 102 修复（取证 fa596cdd）：模型把备注/说明当行首（「- 项目说明 README 保持不动」）→
// 垃圾条目入清单 → plannedComplete 永不收敛 → forceTool 恒 true → read 自检循环。加路径形态过滤：
// 无空白字符 = 合法路径（相对/绝对/目录）；含空白必须带文件扩展名（中文文件名容错——如「docs/我的 文件.md」）
export function parseExecutionPlan(text: string): string[] {
  const block = text.match(/【执行方案】([\s\S]*?)(?:【|$)/)
  if (!block) return [] // 无【执行方案】标记 → 不解析（防误抓正文 - 行）
  const region = block[1]
  const files: string[] = []
  for (const line of region.split('\n')) {
    const m = line.match(/^\s*[-•]\s*(.+?)(?:\s*[（(].*?[）)])?\s*$/)
    if (!m) continue
    const p = m[1].trim()
    if (p && isLikelyPath(p)) files.push(p)
  }
  return files
}

// 路径形态判定（坑 102：清单必须只含「能产出/能出现在文件树」的条目——自然语言说明行排除）
// S2 单源：isLikelyPath 迁至 planProposalParser（parsePlanProposal 共享——TDD 网格重构列）

// === Domain Service: ProgressEvaluator——从 AgentTurn（toolCalls + content）评估 TurnProgress ===
// 排除判定沿用坑 79 结构判定（问句/沟通/完成态——有限集，不匹配措辞）
export function evaluateTurnProgress(input: {
  toolCalls: ToolCallView[]
  content: string
  prevReadFiles: Set<string>
  plannedFiles?: Set<string> // approve-files 规划文件清单（开发阶段——approvePlan 保存）
  producedFiles?: Set<string> // write/edit 成功累积的文件（任务完成度）
  projectFiles?: Set<string> // 2026-08-06 补充（用户「清单来源不只 approve-files」——③ projectFiles 项目文件树实时快照）：规划文件出现在文件树 = 已产出（比 write 记录可靠——回滚/删除则不在树中）
}): TurnProgress {
  const { toolCalls, content, prevReadFiles } = input
  const t = (content ?? '').trim()
  const artifactProduced = toolCalls.some(
    (c) => (c.name === 'write' || c.name === 'edit') && c.status === 'done',
  )
  // 2026-08-14 缝隙 2：副作用工具成功（bash 安装/验证/check-server running 等——classifyAction 同源判定）也算进展——
  // 安装/验证阶段不再被 escalate 打断（同工具空转由 maybeContinue 重复检测兜底）
  const sideEffectSucceeded = toolCalls.some(
    (c) => c.status === 'done' && classifyAction(c.name, c.command) === 'side-effect',
  )
  const readNewFile = toolCalls.some(
    (c) => c.name === 'read' && c.file && !prevReadFiles.has(c.file),
  )
  const plannedFiles = input.plannedFiles
  const producedFiles = input.producedFiles
  const projectFiles = input.projectFiles
  // 任务完成度：规划文件非空时——还有未产出规划文件 = 任务未完成（deepcode unimplemented_files 同思路）
  const hasPlannedFiles = !!plannedFiles && plannedFiles.size > 0
  // 产出判定：write/edit 成功记录 ∪ 出现在项目文件树（projectFiles——回滚/删除后不在树中，更可靠）
  const isProduced = (f: string): boolean => !!producedFiles?.has(f) || !!projectFiles?.has(f)
  const hasRemainingPlanned =
    hasPlannedFiles && [...(plannedFiles ?? [])].some((f) => !isProduced(f))
  const remainingCount = hasRemainingPlanned
    ? [...(plannedFiles ?? [])].filter((f) => !isProduced(f)).length
    : 0
  const isQuestion = isQuestionLike(t)
  const isCommunication = isCommunicationLike(t)
  const isDone = isDoneLike(t)
  // 2026-08-07 待授权轮（根因 2）：need-approval/plan-approval 卡 = 模型停住等用户批准（正常状态）——不算停滞
  const needsApproval = toolCalls.some(
    (c) => c.status === 'need-approval' || c.status === 'file-approval',
  )
  // S5（§8.1 B 331——推进检测统一）：结构化提议输出 = 推进（【目标确认】/【执行方案】/【已达成】信号——
  // 与 pendingCardToShow 信号同源——决策点流程中模型在推进）；纯文本承诺不算（「只说不做」判定保留——坑 79）
  // S5 复审（坑 97 单源）：isStructuredProposal 领域层唯一探测（renderer proposalConsumed 共用——不自写正则）
  const proposed = isStructuredProposal(t)
  // S5：完成声明带验证证据 = 推进（parseCompletionClaim 判定——verification 非空——S4 证据对账流程中不判停滞）
  const providedEvidence = (parseCompletionClaim(t)?.evidence.verification.length ?? 0) > 0
  return {
    artifactProduced,
    sideEffectSucceeded,
    readNewFile,
    hasPlannedFiles,
    hasRemainingPlanned,
    remainingCount,
    isQuestion,
    isCommunication,
    isDone,
    needsApproval,
    proposed,
    providedEvidence,
  }
}

// === Value Object: 卡住状态（连续无进展轮数 + 已升级次数）——不可变，每次变化生成新实例 ===
export interface StuckState {
  consecutiveNoProgress: number
  escalations: number
}

export const initialStuckState: StuckState = { consecutiveNoProgress: 0, escalations: 0 }

// === Domain Event ===
export type StuckEvent =
  | { type: 'no-progress' } // 本轮无进展（仅累积计数——未达升级阈值）
  | { type: 'escalate'; message: string } // 连续无进展达阈值 → 升级（自动续聊指出没动手）
  | { type: 'needs-human'; message: string } // 升级仍无效 → 转用户（状态栏提示）

// === Domain Service: StuckDetector——输入 TurnProgress + 当前 StuckState → 新状态 + 事件（纯函数） ===
// 行业对标：dev.to StuckDetector（no_progress_threshold 连续无进展才升级 + needs_human 转人工）
// 参数贴合 0-1 流程（轮次少）：连续 2 轮无进展升级、升级 2 次后转用户（不再固定 autoNudge 3 次配额——「配额耗尽」问题）
export function detectStuck(input: {
  turn: TurnProgress
  prev: StuckState
  config?: { noProgressThreshold?: number; escalationLimit?: number }
}): { state: StuckState; event?: StuckEvent } {
  const { turn, prev } = input
  const noProgressThreshold = input.config?.noProgressThreshold ?? 2
  const escalationLimit = input.config?.escalationLimit ?? 2
  // 问句/沟通/完成态 = 正常对话（非停滞）——重置（模型在等用户/在对话/已完成）
  // 2026-08-07 待授权轮（根因 2）：need-approval = 模型停住等用户批准——重置（不 escalate——授权流不许打断）
  if (turn.isQuestion || turn.isCommunication || turn.isDone || turn.needsApproval) {
    return { state: initialStuckState, event: undefined }
  }
  // 有进展（write/edit 产出 / 副作用工具成功——缝隙 2：bash 安装验证）→ 重置（行业：恢复即重置）
  // 2026-08-06 修正：read 新文件**不算** progress（activity≠progress——行业 oh-my-pi workspace dirty / deepcode files_completed 只有文件改动才是进展；
  // 防「模型连续 read 不同文件假装进展」——L3 545 测试场景连续 3 轮 read 必须触发 escalate）
  // S5（§8.1 B 331——坑 99 教训扩展）：结构化提议/完成声明带证据 = 推进——模型在走决策点流程不被 escalate 打断
  if (turn.artifactProduced || turn.sideEffectSucceeded || turn.proposed || turn.providedEvidence) {
    return { state: initialStuckState, event: undefined }
  }
  // 2026-08-06 任务完成度（deepcode-hkuds unimplemented_files 借鉴）：有规划且规划文件全部产出 → 无工具结束 = 阶段完成（非停滞——等用户推进）
  if (turn.hasPlannedFiles && !turn.hasRemainingPlanned) {
    return { state: initialStuckState, event: undefined }
  }
  const consecutiveNoProgress = prev.consecutiveNoProgress + 1
  if (consecutiveNoProgress >= noProgressThreshold) {
    const escalations = prev.escalations + 1
    if (escalations >= escalationLimit) {
      return {
        state: { consecutiveNoProgress: 0, escalations },
        event: {
          type: 'needs-human',
          message: '搭档连续几轮没产出改动——可能卡住了，你发个具体指令或点「继续」催它动手',
        },
      }
    }
    const remaining = turn.hasRemainingPlanned
      ? `规划文件还有 ${turn.remainingCount} 个没写（${turn.remainingCount > 1 ? '们' : ''}）——`
      : ''
    return {
      state: { consecutiveNoProgress: 0, escalations },
      event: {
        type: 'escalate',
        message: `${remaining}你连续几轮只读文件/停在分析，没有产出改动——现在直接调用 edit/write 修改代码（说「改 X」就同一轮发 edit X，不要停在分析）`,
      },
    }
  }
  return {
    state: { consecutiveNoProgress, escalations: prev.escalations },
    event: { type: 'no-progress' },
  }
}

// === 2026-08-08 O2 处理（用户「check-capability 默认不向用户展示，只有检测后需要用户实质确认的时候展示」） ===
// 能力检测结果判定：缺失/异常（missing/failed）→ 需要用户实质决策（装依赖/换方案）——工具卡展示；
// 全部就绪（ready）→ 无需用户决策——工具卡默认隐藏（结果仍回填模型上下文，仅 UI 静默）
export interface CapabilityView {
  id: string
  status: string
  detail?: string
}

export function summarizeCapability(data?: { capabilities?: CapabilityView[] }): {
  needsUser: boolean
  summary: string
} {
  const caps = data?.capabilities ?? []
  if (caps.length === 0) return { needsUser: false, summary: '能力齐备' }
  const notReady = caps.filter((c) => c.status === 'missing' || c.status === 'failed')
  const readyCount = caps.length - notReady.length
  if (notReady.length === 0) {
    return { needsUser: false, summary: `能力齐备（${readyCount} 项就绪）` }
  }
  const names = notReady.map((c) => `${c.id}${c.detail ? `（${c.detail}）` : ''}`).join('、')
  return {
    needsUser: true,
    summary: `检测到能力缺失/异常：${names}——需要你决策（安装补齐或换方案）`,
  }
}

// === 2026-08-15 D6：目标确认兜底触发（词表单源——原 ConversationPanel 内联词表上移领域层） ===
// 场景：模型无【目标确认】标记时的兜底卡（goalFallback）——目标未确认 + 模型「征询确认」或「总结目标陈述」→ 弹目标确认卡
// 语义：征询确认（含问句形式「行不行？」）直接命中；目标总结陈述需非问句（「你的需求是 X，你想做成什么样？」= 澄清中，不弹）
// 与 pendingCardToShow（执行确认词表——conversationState）同为领域层词表——渲染层不再自建正则（防双源）
export function goalFallbackTrigger(content: string): boolean {
  const t = String(content ?? '').trim()
  if (!t) return false
  const askingConfirm =
    /(等你确认|你确认一下|确认一下|确认没问题|行不行|可以吗|对吗|对吧|没问题吧|你看行|这样.*可以|就按这个)/.test(
      t,
    )
  if (askingConfirm) return true
  const goalStated = /(目标是|要做的是|你的需求是|目标就是|就是做一个|做成|需求.*确认)/.test(t)
  return goalStated && !isQuestionLike(t)
}
