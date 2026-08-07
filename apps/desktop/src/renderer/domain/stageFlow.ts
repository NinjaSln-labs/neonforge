// 领域层：产品阶段流转（AgentChain BC——流水线编排子域）
// 2026-08-07 DDD 落地（坑 89 根因修复）：forceTool/advanceChat 领域化——
// 产品六阶段（需求→设计→开发→测试→部署→交付）此前游离于领域模型外（A0 §2 只有 agent 角色 Stage），
// 散落在 DeliveryFlowPanel(FLOW_STAGES)/ConversationPanel(advanceChat) 组件里。
// 依据 A0 §2 裁决「流水线编排（角色/模板/Stage）→ AgentChain」——产品六阶段 = AgentChain 的产品级流水线。
// 纯逻辑无 React 依赖——L1 可测；ConversationPanel（Application 层）调用。

// === Value Object: 产品阶段 ===
// 对齐 DeliveryFlowPanel FLOW_STAGES（产品 0-1 交付流六个阶段）
export const PRODUCT_STAGES = ['需求', '设计', '开发', '测试', '部署', '交付'] as const
export type ProductStageName = (typeof PRODUCT_STAGES)[number]

// 阶段工作模式：该阶段「模型该输出什么」（阶段推进轮的执行语义——不是用户指令轮）
// 坑 89 根因：设计阶段推进首轮被 forceTool 误判为「必须调工具」——设计=输出方案文本（不强制工具）
export type StageOutputMode =
  | 'clarify'        // 需求：问答澄清（不调工具）
  | 'text-proposal'  // 设计：输出方案文本（不强制工具——推进轮 forceTool=false）
  | 'artifacts'      // 开发：动手产出真实文件（强制工具）
  | 'verify'         // 测试：验证动作（强制工具）
  | 'deploy'         // 部署：发布操作（强制工具）
  | 'report'         // 交付：汇报 + 验收对照（文本为主，不强制工具）

export interface ProductStage {
  name: ProductStageName
  outputMode: StageOutputMode
  /** 阶段推进轮（advance-turn）首轮是否强制工具——由阶段工作模式推导 */
  forceToolOnAdvance: boolean
}

export const PRODUCT_STAGE_DEFS: Record<ProductStageName, ProductStage> = {
  需求: { name: '需求', outputMode: 'clarify', forceToolOnAdvance: false },
  设计: { name: '设计', outputMode: 'text-proposal', forceToolOnAdvance: false },
  开发: { name: '开发', outputMode: 'artifacts', forceToolOnAdvance: true },
  测试: { name: '测试', outputMode: 'verify', forceToolOnAdvance: true },
  部署: { name: '部署', outputMode: 'deploy', forceToolOnAdvance: true },
  交付: { name: '交付', outputMode: 'report', forceToolOnAdvance: false },
}

// === Domain Service: 阶段索引/映射 ===

export function stageByIndex(index: number): ProductStage | null {
  return index >= 0 && index < PRODUCT_STAGES.length ? PRODUCT_STAGE_DEFS[PRODUCT_STAGES[index]] : null
}

export function stageIndex(name: ProductStageName): number {
  return PRODUCT_STAGES.indexOf(name)
}

export function isLastStage(index: number): boolean {
  return index >= PRODUCT_STAGES.length - 1
}

// === Value Object: 阶段推进指令（AdvanceInstruction） ===
// advanceChat 的「内部指令」生成（原硬编码于 ConversationPanel.tsx:843——抽象到领域层，
// 推进轮的指令语义固化：阶段切换告知 + 按阶段工作模式引导 + 完成时提示点「确认推进」）
export function buildAdvanceInstruction(input: {
  stage: string // 阶段名（应用层传入——指令组装不依赖强类型索引，保持宽松）
  hint: string // 阶段规则提示（STAGE_HINT——提示词体系保留在 DeliveryFlowPanel，此处只组装指令）
  requirement?: string // 需求确认摘要（需求卡确认时注入——模型按确认结果工作）
}): string {
  const { stage, hint, requirement } = input
  const reqNote = requirement
    ? `【需求确认】用户已通过需求确认卡确认需求：${requirement}——请基于此需求进行本阶段工作。`
    : ''
  const modeRule = stage === '开发'
    ? '开发阶段第 0 步（必须）：先用一句话说明本次要做什么，然后调用 plan_approval 工具列出要新增/修改的全部文件（每个文件：路径 + 修改原因），等用户批准后再开始写——不要只写文字清单不调 plan_approval 工具，也不要直接逐个 write 触发授权（用户批准 plan_approval 后这些文件自动放行，不用逐个确认）。然后：直接动手产出真实文件（用 write/edit 工具，写前先读现有文件再修改；先写出第一版能跑的文件，产出后再问需要用户决策的问题，一次只问一个——不要只提问不产出）。铁律：本条回复必须以实际行动收尾——说「开始」后立刻调用工具（read/ls 看目录或 write 写文件），不要以「开始动手了」结束回复等用户。2026-08-04 体验修复：禁止预告轮——说「现在写 X」的同一条回复必须同时调用写 X 的工具（write X），说了就同轮做掉；工具结果显示「已写入：路径」= 该文件已经写好了，不要重复写同一个文件（重复写会被检测为死循环而暂停）；写文件用绝对路径或项目内相对路径。'
    : '本阶段不要写代码。'
  return `${reqNote}【阶段推进】已进入「${stage}」阶段。${hint}。请开始本阶段工作：先用简洁口语向用户说明本阶段要做什么、需要用户提供什么；本阶段完成时提示用户点「确认推进」。${modeRule}`
}
