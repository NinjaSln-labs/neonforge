# ADR-014：结构化澄清与假设来源（AskToAct 式目标假设采集）
- 状态: accepted
- 日期: 2026-11-16
- 相关: GitHub #13（结构化澄清工具）；README Roadmap V2 #3；docs/design/intent-confirmation-domain-design.md §3.2/§4.1/§8.4；stage-specs/V2-structured-clarify.md

## Context

现有 `ask_user` 已支持 `question + type + options[]`，选项会渲染为可点选按钮。但目标假设（GoalProposal/PlanProposal.assumptions）仍只是 `string[]`：

1. 澄清输入以自由文本框为主：模型问「你想要什么」，用户只能整段打字；选项只覆盖整题，不覆盖「逐条假设核对」；
2. 假设来源不可追溯：设计文档要求每条 assumption 标注来源（候选选择/澄清回答/模型推断），当前无法区分「用户确认过」与「模型自行假定」；
3. AskToAct 的核心是「工具参数即显式意图」——把缺失的关键参数/假设逐条呈现给用户补齐，而不是让用户重写整句需求；
4. 旧存档、文本降级通道（`【目标确认】`/`【执行方案】`）与既有 `string[]` 假设必须继续可读。

## Decision

**在 `ask_user` 内增加「假设核对清单」，并让提议假设携带来源标签；不新增决策点。**

1. **协议 schema（`src/domain/protocolTools.ts`）**：
   - `ask_user` 新增可选 `assumptions: string[]`（≤6 条，一条一个待核对的假设——与现有扁平 schema 约束一致）；`question`/`type` 仍必填；`options` 保留原语义（整题候选）。
   - `propose_goal` / `propose_plan` 的 `assumptions` 接受两种形态并归一化：
     - `string`（旧形态/模型省事）→ `{ text, source: 'model_inference' }`；
     - `{ text, source? }`，`source ∈ model_inference | user_choice | clarification`，缺省 `model_inference`；非法 source → 参数校验失败回灌模型。
   - 校验器新增逐条假设校验（非空字符串、数量上限）。
2. **领域值对象（`src/domain/conversationState.ts`）**：
   - 新增 `AssumptionSource` 与 `Assumption { text; source }`；`GoalProposal.assumptions` 与 `PlanProposal.assumptions` 改为 `Assumption[]`。
   - 语义：`user_choice` = 用户在候选/选项中选择的结论；`clarification` = 用户对假设核对清单的回答（含修正）；`model_inference` = 模型自行推断、用户未确认。
3. **渲染（renderer）**：
   - `ask_user` 带 `assumptions` 时渲染「假设核对卡」：逐条显示假设文本 + 固定选项按钮（`符合`/`不符合`）+ 可选修正输入；用户逐条选择后点「提交回答」，以一条结构化用户消息发送：
     ```
     【澄清回答】
     问题：<question>
     - <假设文本>：<选择>（补充：<修正文本>）
     ```
     已回应后卡禁用（与既有 ask_user 选项同语义）。
   - 无 `assumptions` 的 `ask_user` 走既有选项按钮/自由文本路径，不改变行为。
   - 目标/方案确认卡的假设列表显示来源标签（`你的选择` / `你的澄清` / `模型推断`）；接受旧 `string[]` 渲染（防御性兼容）。
4. **提示词（`src/renderer/sysPrompt.ts`）**：
   - 澄清指令补充：目标/方案关键假设不明确时，用 `ask_user.assumptions` 逐条核对（可带 options）；用户提交后 `propose_goal`/`propose_plan` 用 `{ text, source }` 标注来源。
   - 自由度：自由文本仍是主通道；假设核对卡是结构化替代，不是强制流程。
5. **持久化与兼容**：
   - `taskSnapshot` 深校验接受新旧两种假设形态，旧字符串归一化为 `model_inference`；快照/时间线中的结构化来源原样保留。
   - 文本降级解析（`parsePlanProposal`、`extractAssumptionsSection`）产出 `model_inference`。
   - `nf-session` 无需版本升级（同一 JSON 记录内字段结构向后兼容）。

## Consequences
- 积极：目标假设从「用户整段打字」变为「逐条结构化核对」；模型得到的回答可直接映射为工具参数/假设；确认卡可追溯假设来源；旧会话与旧模型输出兼容。
- 代价：假设结构从字符串数组升级为对象数组（渲染/解析/快照均需归一化）；`ask_user` 参数面扩大，提示词需同步教学；假设核对卡交互状态仅存组件内（刷新后按「已出现用户消息」判定已回应，与现有选项卡一致）。
- 边界：不引入多问题问卷/可编辑计划文件/澄清训练数据；不改变决策点枚举（澄清仍非 DecisionPoint，不置 pending）。
