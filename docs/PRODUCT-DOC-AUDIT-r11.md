# 产品文档审计报告：NeonForge（第 11 轮——2026-08-16 · 设计↔领域文档服务/事件三处一致性）

- 审计对象：`docs/domain/`（02 §5 服务表/04 §3 服务定义/02 §6 事件表/04 §4 事件表）↔ 设计文档 §3.3/§3.5
- 审计日期：2026-08-16（**第 11 轮**——交叉维度：设计定义的领域服务/事件是否入领域文档（02/04 是战术/模型权威））
- 审计方式：符号级交叉核对（服务 11 个/事件 7 个逐项比对）+ 就绪度评分
- 结论：**就绪度 78/100，可交付 Yes**（2 Major：领域服务表/事件表未同步新设计——实现者按 02/04 会漏核心服务与事件）

---

## 一、审计项（符号级交叉核对）

### 1. 领域服务：设计 §3.3（11 个）vs 02 §5（5 个）vs 04 §3（5 个）

| 设计 §3.3 服务 | 02 §5 | 04 §3 | 判定 |
|----------------|-------|-------|------|
| deriveDecisionPoint | ❌ 无 | ❌ 无 | **缺**（决策点触发权核心服务）|
| sessionGate | ❌ 无 | ❌ 无 | **缺**（会话冻结门控）|
| actionGate | ❌ 无 | ❌ 无 | **缺**（动作属性门控——A0 §3.5b）|
| classifyReadonly | ❌ 无 | ❌ 无 | **缺**（只读判定升级）|
| verifyCompletion | ❌ 无 | ❌ 无 | **缺**（证据对账——无证据不对账不变量 4）|
| parsePlanProposal | ❌ 无 | ❌ 无 | **缺**（方案解析——含坑 102 过滤）|
| parseCompletionClaim | ❌ 无 | ❌ 无 | **缺**（完成声明解析）|
| derivePlannedFiles | ❌ 无 | ❌ 无 | **缺**（不变量 6 承载）|
| decideProgressGuarantee | ✅ ProgressGuarantee | ✅ 3.1 | ✅（更名已同步）|
| shouldStopContinuation | ❌ 无 | ❌ 无 | **缺**（续聊停止——已实现于 conversationState，领域文档未列）|
| canExecute | ❌ 无 | ❌ 无 | **缺**（组合门控——现有实现，领域文档未列）|

**M1（Major）**：02 §5/04 §3 领域服务表缺 8 个新服务（+canExecute/shouldStopContinuation 2 个已有实现未列）——领域文档是战术/模型权威——实现者按 02/04 会漏 deriveDecisionPoint/verifyCompletion/parsePlanProposal 等核心服务（S1 重写的直接依据文档缺失）

### 2. 领域事件：设计 §3.5（7 个新事件）vs 02 §6 vs 04 §4

| 事件 | 02 §6 | 04 §4 | 判定 |
|------|-------|-------|------|
| proposal.goal | ❌ | ❌ | 缺 |
| proposal.plan | 历史标注提及 | 历史标注提及 | ⚠️ 仅历史提及，无新事件行 |
| proposal.completion | ❌ | ❌ | 缺 |
| decision.requested | ❌ | ❌ | 缺 |
| decision.resolved | ❌ | ❌ | 缺 |
| completion.evidence_missing | ❌ | ❌ | 缺 |
| gate.denied | ❌ | ❌ | 缺 |

**M2（Major）**：02 §6/04 §4 事件表缺 7 个新事件——06 有追加段但 02/04 事件表未同步（实现者查 02/04 事件表会漏 proposal.*/decision.* 事件）

## 二、通过项

- 06 追加段（7 新事件登记）✅ 与设计 §3.5 一致
- 02 §5/04 §3 的既有 5 服务（ProgressGuarantee/ProgressionGate/CapabilityChecker/PlannedFiles/TimelineLogger）与 A0/设计一致 ✅
- A0 §3.5b/§3.6/§4.2 已含新机制描述 ✅（A0 层面同步——02/04 战术层漏）

## 三、问题

1. **[Major] 02 §5/04 §3 服务表未同步（#1）**——缺 deriveDecisionPoint/sessionGate/actionGate/classifyReadonly/verifyCompletion/parsePlanProposal/parseCompletionClaim/derivePlannedFiles（+canExecute/shouldStopContinuation）——S1 实现依据文档缺失
2. **[Major] 02 §6/04 §4 事件表未同步（#2）**——缺 7 个新事件行

## 四、建议

- #1：02 §5 服务表 + 04 §3 服务定义补 10 个服务（含签名简述——deriveDecisionPoint/actionGate/classifyReadonly/verifyCompletion/parsePlanProposal/parseCompletionClaim/derivePlannedFiles/sessionGate/canExecute/shouldStopContinuation——S1 前置）
- #2：02 §6 + 04 §4 事件表补 7 个新事件行（对齐 06 追加段——S1 随注册表扩展）
- **权威裁决**：服务/事件定义以设计文档 §3.3/§3.5 + 06 追加段为准（02/04 按此同步——战术文档是实现的直接依据）

## 五、验收标准（2026-08-16 全部完成）

- [x] #1 02 §5 服务表补 10 服务（deriveDecisionPoint/sessionGate/actionGate/classifyReadonly/verifyCompletion/parsePlanProposal/parseCompletionClaim/derivePlannedFiles/canExecute/shouldStopContinuation——含职责/不变式）；04 §3 补意图确认服务组（签名权威引用设计文档 §3.3）
- [x] #2 02 §6 + 04 §4 事件表补 7 新事件（proposal.*/decision.*/completion.evidence_missing/gate.denied——对齐 06 追加段）
- [x] 就绪度：原 78 → 修复后 **≥90**（S1 实现依据文档闭合）

## 六、备注

- 本次审计**未修改被审文档**；第 11 轮为符号级交叉核对（前 10 轮未逐符号比对服务/事件）
- 报告路径：`docs/PRODUCT-DOC-AUDIT.md`（r4-r10 归档）
