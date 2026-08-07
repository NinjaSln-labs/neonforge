// 领域层：轮次执行保障（Conversation BC——多轮对话子域）
// 2026-08-07 DDD 落地（坑 89 根因修复）：forceTool 领域化——
// 「对话轮次该不该强制模型产出」是对话轮次的领域规则（坑 80 原意：用户执行指令 → 必须动手到产出），
// 此前散落在 ConversationPanel.tsx:616 的组件 if 条件（`flowStage>=1 && depth===0` 数值拼凑——
// 误把「阶段推进轮」当「用户指令轮」→ 设计阶段推进后被强制调工具，无法输出方案文本）。
// 依据 A0 §2 裁决「对话上下文/消息流 → Conversation」——轮次执行保障属 Conversation BC，
// 与 agentLoop（TurnProgress/StuckDetector——轮次卡住检测）同 BC 并列（deepcode loop_detector 同位置）。
// 纯逻辑无 React 依赖——L1 可测；ConversationPanel（Application 层）调用。

import { PRODUCT_STAGE_DEFS, type ProductStageName } from './stageFlow'

// === Value Object: 轮次类型（触发语义——机制原意） ===
// user-turn    = 用户下达真实指令/消息（forceTool 原意作用对象——必须动手到产出）
// advance-turn = 阶段推进（advanceChat——切换阶段工作模式，不是用户执行指令）
// tool-loop    = 工具循环续聊（maybeContinue——自由收敛，StuckDetector 兜底）
export type TurnKind = 'user-turn' | 'advance-turn' | 'tool-loop'

export interface TurnPolicyInput {
  stage: ProductStageName | null // 当前阶段（flowStage 映射；null=未进入 0-1 流程/demo）
  turnKind: TurnKind
  isPureAck: boolean // 纯确认（嗯/好/可以/ok/继续…——问答不强制）
  requirementConfirmed: boolean // 需求已确认
  produced: boolean // 已有产出（write/edit 成功——B 类持续强制直到产出）
  depth: number // 0=该轮首轮
}

export interface TurnPolicyDecision {
  forceTool: boolean // tool_choice: required（API 层强制模型必须调工具）
  reason: string
}

// === Domain Service: TurnExecutionPolicy（执行保障决策） ===
export function decideTurnPolicy(input: TurnPolicyInput): TurnPolicyDecision {
  const { stage, turnKind, isPureAck, requirementConfirmed, produced, depth } = input
  // 纯确认 → 不强制（模型在问答）
  if (isPureAck) return { forceTool: false, reason: 'pure-ack' }
  // B 类（需求已确认但无产出）→ 每轮强制直到产出（坑 80 B 类语义——read 不算产出持续强制）
  if (requirementConfirmed && !produced) return { forceTool: true, reason: 'b-class-until-produced' }
  // 用户指令轮（首轮）→ 强制（坑 80 原意——用户下达执行指令必须动手到产出）
  // 需求阶段例外：问答澄清（STAGE_HINT 需求阶段禁止工具）——不强制；null=未进入 0-1 流程（demo）不强制
  if (turnKind === 'user-turn' && depth === 0) {
    if (!stage || stage === '需求') return { forceTool: false, reason: 'requirement-clarify' }
    return { forceTool: true, reason: 'user-command' }
  }
  // 阶段推进轮（首轮）→ 按阶段工作模式（坑 89：设计=text-proposal 输出方案文本，不强制工具）
  if (turnKind === 'advance-turn' && depth === 0) {
    if (!stage) return { forceTool: false, reason: 'advance-no-stage' }
    return { forceTool: PRODUCT_STAGE_DEFS[stage].forceToolOnAdvance, reason: `advance-${stage}` }
  }
  // 工具循环轮 / 非首轮 → auto（forceTool=false，由 StuckDetector 检测无产出循环）
  return { forceTool: false, reason: 'auto' }
}
