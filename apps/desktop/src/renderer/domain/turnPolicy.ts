// 领域层：轮次执行保障（Conversation BC——多轮对话子域）
// 2026-08-07 无阶段重构 S1（用户决策「完整移除阶段体系」——目标驱动+能力驱动+确认驱动）：
// 三态判定替代六阶段版（原 stage/turnKind/isPureAck/depth 依赖阶段体系——全部移除）。
// forceTool 原意保留（坑 80：用户执行指令 → 必须动手到产出；坑 89：阶段推进轮 ≠ 用户指令轮——
// 无阶段下「推进轮」概念消失，统一由「目标确认/执行确认」状态推导）。
// 纯逻辑无 React 依赖——L1 可测；ConversationPanel（Application 层）调用。

// === Value Object: 轮次执行输入（三态——目标驱动核心） ===
// goalConfirmed      = 目标已确认（无阶段下确认「达成什么」——原 requirementConfirmed 语义演进）
// executionConfirmed = 执行已确认（能力检查后用户确认执行方案——无阶段新增）
// produced           = 已有产出（write/edit 成功——read 不算产出，activity≠progress 坑 81）
// lastToolFailed     = 上一轮工具执行失败（bash exit≠0 / write/edit 失败）——释放强制（用户「错误要抛出来，
//                     模型自己修正」——required 模式压制模型的文本诊断能力 → 被迫重试失败命令死循环，冒烟实测 37 轮）
export interface TurnPolicyInput {
  goalConfirmed: boolean
  executionConfirmed: boolean
  produced: boolean
  lastToolFailed?: boolean
}

export interface TurnPolicyDecision {
  forceTool: boolean // tool_choice: required（API 层强制模型必须调工具）
  reason: string
}

// === Domain Service: TurnExecutionPolicy（执行保障决策——三态穷举） ===
// 状态空间（3 布尔 = 8 组合）：
//   goal=false               → goal-clarify（目标未确认 = 澄清问答，不强制）
//   goal=true, exec=false    → awaiting-exec-confirm（执行方案已给等用户确认，不强制）
//   goal=true, exec=true,
//     produced=false         → goal-exec-until-produced（目标+执行已确认但无产出 → 强制——防只说不做）
//   produced=true            → produced-auto（已有产出 → auto——StuckDetector 兜底坑 81；
//                              避免 required 无限循环（OpenAI reset_tool_choice 防循环）+
//                              避免已干活后被迫空转）
export function decideTurnPolicy(input: TurnPolicyInput): TurnPolicyDecision {
  const { goalConfirmed, executionConfirmed, produced } = input
  // 目标未确认 → auto（澄清问答——无论执行/产出状态，目标未确认一切免谈）
  if (!goalConfirmed) {
    return { forceTool: false, reason: 'goal-clarify' }
  }
  // 目标已确认、执行未确认 → 已给执行方案等用户确认（auto——模型在等确认不能逼工具）
  if (!executionConfirmed) {
    return { forceTool: false, reason: 'awaiting-exec-confirm' }
  }
  // 已有产出 → auto（收敛到文本结束；StuckDetector 检测无产出循环兜底）
  if (produced) {
    return { forceTool: false, reason: 'produced-auto' }
  }
  // 2026-08-07 失败感知（用户「错误要抛出来，模型自己修正」——冒烟实测：bash exit-1 后模型被 required
  // 强制必须调工具 → 无法停下输出诊断/修正策略 → 被迫重试同一失败命令 37 轮死循环）：
  // 上一轮工具执行失败 → 释放强制（auto）——模型可停下看到 stderr 诊断修正，修好后下一轮恢复
  if (input.lastToolFailed) {
    return { forceTool: false, reason: 'tool-failed-diagnose' }
  }
  // 目标+执行已确认但无产出 → 强制（B 类语义延续：read 不算产出持续强制，直到 write/edit）
  return { forceTool: true, reason: 'goal-exec-until-produced' }
}
