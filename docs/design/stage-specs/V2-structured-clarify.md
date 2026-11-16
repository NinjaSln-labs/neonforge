# Stage V2-Structured-Clarify Spec（结构化澄清与假设来源）
> 来源：GitHub #13（AskToAct 式目标假设显式采集）；ADR：`docs/decisions/014-structured-clarify-assumptions.md`

## DoD（机器可验证断言——stage-gate 逐条执行）

- [x] L1 全量绿：`npx vitest run`（73 文件 / 850 用例；新增 7 条——协议校验/归一化、快照兼容、JSON 回答格式、来源制裁）
- [x] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [x] L3 交互：`npx playwright test --project=interaction`（全量 81/81；新增假设核对卡提交、来源制裁、待决策点澄清不误拒 3 场景；既有 ask_user 选项场景仍绿）
- [x] 行为验收：`ask_user(assumptions)` → 逐条选择/修正 → 提交流程可用；`propose_goal` 结构化 assumptions 来源标签可见；旧 `string[]` 提案/快照正常渲染
- [x] 审计状态：本阶段无 open 审计项
- [x] 覆盖矩阵已更新（`docs/tests/coverage-matrix.md`）
- [x] 决策日志同步：ADR-014（accepted）；决策日志索引已更新
- [x] 已提交（未推送——按用户要求）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能 | 规范断言（来源 ADR-014） | 失败测试（红） | 实现（绿） | 重构 |
|------|--------------------------|---------------|-----------|------|
| ask_user 假设清单 schema | `assumptions: string[]` ≤6、逐条非空；非法路径化回灌 | `protocolTools.test.ts` | `PROTOCOL_TOOL_DEFS.ask_user` + `validateProtocolArgs` | 校验抽公共函数 |
| 假设归一化 | `propose_goal/plan` 的 string 或 `{text,source}` → `Assumption[]`；非法 source 拒绝；缺省 `model_inference` | `protocolTools.test.ts` | `normalizeAssumptions` + `decideProtocolToolCall` | 归一化纯函数单源 |
| 领域值对象 | `Assumption {text,source}`；来源枚举三值；卡片/事件/快照均使用对象 | `conversationState.test.ts`/`timelineEvents.test.ts` | `domain/conversationState.ts` | — |
| 快照兼容 | 旧字符串假设 → `model_inference`；新对象来源保留；非法结构拒绝 | `taskSnapshot.test.ts` | `taskSnapshot` 假设解析器 | — |
| 文本降级解析 | `【执行方案】关键假设` 行 → `model_inference` | `planProposalParser.test.ts` | `parsePlanProposal`/`extractAssumptionsSection` | — |
| 假设核对卡 | 逐条「符合/不符合」+ 修正输入；JSON 结构化回答；双击/草稿/options 并存/兄弟卡独立性；已回应禁用 | `structuredClarify.interaction.ts` | `AssumptionCheckCard` + `clarifyAnswer` + ConversationPanel 接线 | 复用 CandidateButtons 样式 |
| 来源标签与制裁 | 目标/方案卡显示「你的选择/你的澄清/模型推断」；无真实交互证据的模型自报来源降级模型推断；旧字符串防御渲染 | `assumptionEvidence.test.ts` / `structuredClarify.interaction.ts` | `assumptionEvidence` + `AssumptionList` | 来源标签映射/证据集合纯函数 |

## 产出物

- `apps/desktop/src/domain/conversationState.ts`（Assumption/Source）
- `apps/desktop/src/domain/protocolTools.ts`（schema/校验/归一化）
- `apps/desktop/src/domain/taskSnapshot.ts`、`planProposalParser.ts`（兼容解析）
- `apps/desktop/src/renderer/AssumptionCheckCard.tsx`（新增）、`conversationFormat.tsx`、`DecisionCards.tsx`、`ConversationPanel.tsx`、`useChatStream.ts`、`sysPrompt.ts`
- `apps/desktop/tests/unit/protocolTools.test.ts`、`taskSnapshot.test.ts`、`planProposalParser.test.ts`、`timelineEvents.test.ts`
- `apps/desktop/tests/interaction/structuredClarify.interaction.ts`（新增）
- 文档：ADR-014、本 spec、`docs/ddd-rebuild/09-openspec/tasks.md`、覆盖矩阵

## 边界（不做——防蔓延）

- 多问题问卷/分页表单（一次一个 `ask_user`；可连续调用）
- 可编辑计划文件、澄清训练数据、云端同步
- 改变决策点枚举或让澄清置 pending（澄清仍是非 DecisionPoint 会话交互）
- 自动推断假设来源（来源由模型显式标注，缺省为模型推断）
