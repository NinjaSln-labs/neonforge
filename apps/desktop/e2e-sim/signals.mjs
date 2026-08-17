// e2e 模拟器域：模型信号派生（设计 docs/design/e2e-simulator-domain-design.md §2）
// 单一理解源：模型「在说什么」只有这一套确定性派生（消除 UserAgent/UserSimulator/fallback 三实现——缝隙 4）
// 对齐语义：决策点提议标记与产品解析器同语义（planProposalParser/completionClaimParser——本模块为
// 独立 .mjs 实现——测试锁定防漂移）；SEM_* 语义收编于此
// 纯函数——无 Playwright/无网络/无 fs——L1 可测

/** 模型信号（值对象——字符串常量） */
export const Signal = {
  GOAL_PROPOSED: 'goal-proposed', // 【目标确认：】提议——goal 决策点
  PLAN_PROPOSED: 'plan-proposed', // 【执行方案】+ 文件行——plan 决策点
  COMPLETION_CLAIMED: 'completion-claimed', // 【已达成】——resolution 决策点
  APPROVAL_REQUESTED: 'approval-requested', // approve-files/授权待批——approval 决策点
  PROMISING: 'promising', // 说要做但还没动手（isActionPromise 同源）
  INVITING_TEST: 'inviting-test', // 给地址邀请试玩
  CLARIFYING: 'clarifying', // 澄清提问（候选块/问句/标准 4 问）
  ASKING_DECISION: 'asking-decision', // 征求决策（方向确认等）
  EXPLORING: 'exploring', // 最近工具为只读探索（read/search/check）
  PRODUCING: 'producing', // 最近工具为副作用推进（write/edit/bash）
  NONE: 'none', // 陈述/无信号
}

// —— 语义正则（收编原 SEM_* 常量——演进统一） ——
const RE_DONE =
  /(写完了|都写好了|全部完成|都完成了|搞定|写好了|做完了|搭好了|跑起来了|完成|done|finished|all set|complete|written|ready)/i
const RE_PROMISE =
  /(开始|我来|马上|这就|现在|先|让我|我先|待会|稍后).{0,4}(写|做|创建|生成|搭|部署|读|看|检查|确认|验证|测试|启动|查一下|看看)|I'?ll|let me|going to|start writing|gonna|will (write|start|make|read|check)/i
const RE_PLAY =
  /(能玩|可以玩|地址|localhost|端口|试试|体验|访问|打开.*玩|playable|works|running|visit|open|try|have a look)/i
const RE_ASK =
  /(要不要|还是说|还是先|你觉得|你看|想不想要|如何|怎么样|可以吗|行吗|先玩几把|感受一下|你定|你来定|看你的|没意见|按这个|方向.*吗|这样.*吗|同意|没问题吧|你看行|你看怎么样|按你说的)/i
const RE_GOAL = /【目标确认[:：]/
const RE_PLAN = /【执行方案/
const RE_CLAIM = /【已达成/
// 文件行（方案要素——plan-proposed 需清单可识别；语义对齐 planProposalParser 的路径形态判定）
const RE_PLAN_LINE = /[-•*]\s*[\w./\\@~-]+\.?\w*[\w./\\-]*（[^）]+）/m
const RE_4Q =
  /(做成什么样|算完成|算完|做到哪|完成标准|做完|什么时候算|做到什么程度|给谁玩|谁玩|面向|玩家|对象|在哪|哪儿玩|平台|网页|电脑|手机|浏览器|运行|设备|设计|意思|理解|指什么|哪个意思|什么游戏|哪种|哪一档)/
const RE_QUESTION_TAIL = /[?？]|哪个|哪几种|哪一种|什么|吗$|呢$|确认|理解|意思|想法|看看你|你觉得/
const EXPLORE_TOOLS = new Set([
  'read',
  'search',
  'check-capability',
  'find_definition',
  'find_references',
  'get_type_info',
  'get_diagnostics',
  'get_imports',
  'get_call_chain',
])
const PRODUCE_TOOLS = new Set([
  'write',
  'edit',
  'bash',
  'start-server',
  'check-server',
  'stop-server',
  'open',
])

/**
 * 派生模型信号（确定性——优先级从决策点提议到陈述）
 * @param {{ content?: string, candidates?: string[], tools?: string[] }} msg 对话消息
 * @param {string} [statusBar] 状态栏文本（isActionPromise/待批准提示）
 * @param {string[]} [toolCards] 当前工具卡状态（running/pending 的工具名）
 * @returns {string} Signal 常量
 */
export function deriveModelSignal(
  { content = '', candidates = [], tools = [] } = {},
  statusBar = '',
  toolCards = [],
) {
  const c = content
  // 1. 决策点提议（产品触发权同语义——标记检测）
  if (RE_GOAL.test(c)) return Signal.GOAL_PROPOSED
  if (RE_PLAN.test(c) && RE_PLAN_LINE.test(c)) return Signal.PLAN_PROPOSED
  if (RE_CLAIM.test(c)) return Signal.COMPLETION_CLAIMED
  // 2. 授权待批（工具卡 approve-files 或状态栏提示）
  if (
    toolCards.some((t) => t.includes('approve-files') || t.includes('need-approval')) ||
    statusBar.includes('有操作待你批准')
  ) {
    return Signal.APPROVAL_REQUESTED
  }
  // 3. 承诺未动（isActionPromise 同源）
  if (statusBar.includes('说要做但还没动手') || RE_PROMISE.test(c)) return Signal.PROMISING
  // 4. 邀请试玩
  const urlMatch = c.match(/https?:\/\/localhost:\d+/)
  if (urlMatch && RE_PLAY.test(c)) return Signal.INVITING_TEST
  // 5. 澄清（候选块优先——产品候选语义）
  if (candidates.length > 0) return Signal.CLARIFYING
  // 6. 完成声明尾部收尾（已达成之外——「完成/确认」等）——问句排除后
  if (RE_DONE.test(c) && !RE_ASK.test(c) && !RE_QUESTION_TAIL.test(c)) {
    // 完成 + 无征询——归 completion-claimed（应用层再结合旅程验证）
    return Signal.COMPLETION_CLAIMED
  }
  // 7. 征求决策（方向确认——不答非所问 A7 教训）
  if (RE_ASK.test(c) && /[?？]|吧|吗/.test(c)) return Signal.ASKING_DECISION
  // 8. 澄清提问（4 问关键词 + 疑问语义）
  if (RE_4Q.test(c) && RE_QUESTION_TAIL.test(c)) return Signal.CLARIFYING
  if (RE_QUESTION_TAIL.test(c)) return Signal.CLARIFYING
  // 9. 工具活动（最近工具——探索 vs 推进）
  const lastTool = tools[tools.length - 1] ?? toolCards[toolCards.length - 1] ?? ''
  if (lastTool && PRODUCE_TOOLS.has(lastTool)) return Signal.PRODUCING
  if (lastTool && EXPLORE_TOOLS.has(lastTool)) return Signal.EXPLORING
  return Signal.NONE
}

/** 消息是否含【执行方案】标记但缺文件行（plan 提议不完整——应用层可引导补充） */
export function hasPlanMarkWithoutLines(content = '') {
  return RE_PLAN.test(content) && !RE_PLAN_LINE.test(content)
}
