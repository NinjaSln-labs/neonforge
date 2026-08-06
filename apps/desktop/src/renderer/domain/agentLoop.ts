// 领域层：agent 循环卡住检测（progress-aware——2026-08-06 双源调研 tavily+serper 交叉验证：
// 行业共识「activity ≠ progress」（dev.to StuckDetector / stackademic）+ 连续无进展升级 + needs-human 转用户 + arXiv 实时失败检测）
// DDD 落地：Value Object（TurnProgress/StuckState）+ Domain Service（ProgressEvaluator/StuckDetector）+ Domain Event
// 纯逻辑无 React 依赖——L1 可测；ConversationPanel（Application 层）调用

// === Value Object: 工具调用视图（AgentTurn 的 toolCalls 投影——领域层可见的最小信息） ===
export interface ToolCallView {
  name: string
  status: string
  file?: string // write/edit 目标 / read 路径
}

// === Value Object: 单轮进展（activity 是否转化为 progress——行业「只能真实工作完成时上升的度量」） ===
export interface TurnProgress {
  artifactProduced: boolean // write/edit 成功 = 真实产出（0-1 流程最可靠 progress 信号——与 artifactsReady 门控同源）
  readNewFile: boolean      // read 了此前未读过的文件（新信息）——同文件重复 read = activity 非 progress
  isQuestion: boolean       // 问句/征求同意——模型在等用户，不算停滞
  isCommunication: boolean  // 沟通/澄清/确认——模型在对话，不算停滞
  isDone: boolean           // 完成态汇报——模型已完成，不算停滞
}

// === Domain Service: ProgressEvaluator——从 AgentTurn（toolCalls + content）评估 TurnProgress ===
// 排除判定沿用坑 79 结构判定（问句/沟通/完成态——有限集，不匹配措辞）
export function evaluateTurnProgress(input: {
  toolCalls: ToolCallView[]
  content: string
  prevReadFiles: Set<string>
}): TurnProgress {
  const { toolCalls, content, prevReadFiles } = input
  const t = (content ?? '').trim()
  const artifactProduced = toolCalls.some((c) => (c.name === 'write' || c.name === 'edit') && c.status === 'done')
  const readNewFile = toolCalls.some((c) => c.name === 'read' && c.file && !prevReadFiles.has(c.file))
  const isQuestion = /[?？]$/.test(t) || /(吗|呢|吧)[。.!！]?$|可以吗|行不行/.test(t)
  const isCommunication = /(确认|复述|说明|解释|总结|澄清|商量|理解|明白|知道|收到|确认一下|跟你确认|和你确认|跟您确认|介绍一下|跟你聊|和你聊)/.test(t)
  const isDone = /(完成|做好|搞定|改好|解决|处理完|已写好|已修改|已删除|已添加|已加|可以了|能玩了|没问题|修好了|加好了|实现了|就绪|收工|结束|达标|通过了|在跑|能跑|弄好|好了，|好的，|就是这些|就这样|先说这么多)/.test(t)
  return { artifactProduced, readNewFile, isQuestion, isCommunication, isDone }
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
  if (turn.isQuestion || turn.isCommunication || turn.isDone) {
    return { state: initialStuckState, event: undefined }
  }
  // 有进展（write/edit 产出 / 读新文件）→ 重置（行业：恢复即重置）
  if (turn.artifactProduced || turn.readNewFile) {
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
          message: '搭档连续几轮没产出改动——可能卡住了，你发个具体指令或点「继续」催它动手'
        }
      }
    }
    return {
      state: { consecutiveNoProgress: 0, escalations },
      event: {
        type: 'escalate',
        message: '你连续几轮只读文件/停在分析，没有产出改动——现在直接调用 edit/write 修改代码（说「改 X」就同一轮发 edit X，不要停在分析）'
      }
    }
  }
  return { state: { consecutiveNoProgress, escalations: prev.escalations }, event: { type: 'no-progress' } }
}
