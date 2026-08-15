# 06 — 领域事件（无阶段·目标驱动版）

> 2026-08-07 重新生成——事件目录基于无阶段目标驱动领域模型（02 领域模型 / 04 战术设计）。
> 替代旧六阶段版（ContextEngine/Compaction/AgentChain 等产品流水线事件）。
> **事件名权威（2026-08-16 第 16 轮审计 #1）**：事件注册表实现（`timeline.ts` TIMELINE_EVENT_SPECS——44 事件）为**事件名实现权威**；本文档为**语义视图**（触发时机/携带数据/消费方）——本文已按注册表补录全部实现事件（§1.3/§1.5/§1.6）并标注文档声明但注册表未实现事件的承接/别名——S1 扩展注册表（proposal/decision/completion/gate）时以注册表为准逐名登记。

---

## 1. 事件目录

### 1.1 确认点事件（Conversation BC——核心）

| 事件 | 触发时机 | 携带数据 | 消费方 |
|------|---------|---------|--------|
| `task.goal_proposed` | 模型澄清后给出目标提议 | taskId, goalText | 确认卡渲染（UI）|
| `task.goal_confirmed` | 用户点「确认目标」 | taskId, goalText, source | 状态机（→goal-confirmed）、Timeline |
| `task.goal_rejected` | 用户点「重新描述」 | taskId | 状态机（→clarifying）、模型（重新澄清）|
| `task.execution_proposed` | 模型给出执行方案（**历史——2026-08-16 起由 proposal.plan 替代**）| taskId, plan, files | 执行确认卡渲染（UI——2026-08-16 起为方案卡）|
| `task.execution_confirmed` | 用户点「确认执行」（**历史——2026-08-16 起由 decision.resolved 替代**）| taskId, source | 状态机（→executing）、推进保障生效 |
| `task.execution_rejected` | 用户点「修改方案」（**历史——2026-08-16 起由 decision.resolved（reject+RejectReason）替代**）| taskId | 状态机（→goal-confirmed）、模型（改方案）|
| `task.achievement_proposed` | 模型汇报达成（**历史——2026-08-16 起由 proposal.completion 替代**）| taskId, summary | 达成确认卡渲染（UI——2026-08-16 起为解决确认卡，证据对账）|
| `task.achievement_confirmed` | 用户点「已解决」（**历史——2026-08-16 起由 decision.resolved 替代**）| taskId, source | 状态机（→resolved）、推进保障释放 |
| `task.achievement_rejected` | 用户点「还要改」（**历史——2026-08-16 起由 decision.resolved（reject+RejectReason）替代**）| taskId | 状态机（→executing 继续）|
| `task.resolved` | 用户确认解决（**#1 承接标注：注册表未实现——S1 起由 `decision.resolved`（kind=resolution）承接任务收敛语义——task.resolved 为语义视图保留**）| taskId | 任务收敛、Timeline |

### 1.2 计划清单事件（Workspace BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `plan.approved` | 用户批准文件清单 | taskId, files（追加）|
| `plan.rejected` | 写清单外文件被拒 | taskId, file, approvedList（拒绝带边界）|

### 1.3 工具授权/执行事件（Conversation/Workspace BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `tool.approved` / `tool.rejected` | 用户批准/拒绝工具 | toolName, args, action |
| `tool.requested`（2026-08-16 第 16 轮审计 #1 补录——注册表实现）| 工具调用发起（执行前）| toolName, args |
| `tool.executing`（#1 补录）| 工具执行中 | toolName |
| `tool.executed` / `tool.failed` | 工具执行结果 | toolName, ok, error |
| `tool.remembered`（#1 补录）| 用户「允许并记住」——任务信任加入 | toolName, path |
| `tool.pending_confirmation` | 方案未批准时工具调用到达（挂起——2026-08-16 语义更新）——**#1 承接标注：注册表以 `tool.requested` + `tool.blocked` 表达（挂起=发起后拦截）** | toolName, args |
| `tool.blocked` | 工具被拦截（2026-08-15 补录——会话冻结/确认点/清单外/策略引导）| toolName, gate（pending/confirm/out-of-plan/policy）, reason |

### 1.3b 会话级 PENDING 事件（Conversation 聚合——2026-08-15 补录）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `session.pending_set` | 卡弹出 → 会话进入 PENDING | kind（goal/plan/approval/resolution——2026-08-16 更名，原 goal/execution/achievement/approval）|
| `session.pending_cleared` | 用户决策 → PENDING 解除 | kind |

### 1.3c 卡 UI 生命周期事件（可观测——2026-08-15 补录；领域事件之外的用户交互视图）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `card.shown` / `card.resolved` / `card.rejected` / `card.dismissed` | 卡弹出/确认/拒绝/消失 | card, action?, cause? |

### 1.4 能力/环境事件（Capability BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `capability.checked` | 能力检查 | taskId, capabilities, missing |
| `capability.ledger_updated` | Ledger 回填 | rootPath, capabilityId, ok |
| `environment.injected` | 环境快照注入模型 | rootPath, envSnapshot |

### 1.5 推进保障事件（Conversation BC——2026-08-16 更名，原执行保障）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `execution.forced` | 推进保障强制（确认后无推进——产出/提议/证据；原 forceTool=true——2026-08-16 语义更新）| taskId, reason |
| `execution.force_input`（2026-08-16 第 16 轮审计 #1 补录——注册表实现）| forceTool 输入构造（推进保障决策输入侧）| taskId, input |
| `execution.released` | 推进保障释放（失败/计划写完/解决确认/pending——2026-08-16 语义更新）| taskId, reason |
| `stuck.escalated` | 连续无产出升级 | taskId, message |
| `stuck.needs_human` | 升级仍无效转用户 | taskId, message |

### 1.6 会话/消息事件

| 事件 | 说明 |
|------|------|
| `conversation.created` / `archived` | 生命周期（**#1 承接标注：注册表以 `conversation.created` + 会话关闭表达——`archived` 未在注册表——别名 conversation.status_change**）|
| `message.appended` | 消息变更（用户/搭档/工具）——**#1 承接标注：注册表以 `conversation.message_sent` / `conversation.assistant_start` / `conversation.assistant_done` 表达（按角色分事件——`message.appended` 为语义别名）** |
| `streaming.started` / `completed` | 流式输出——**#1 承接标注：注册表以 `conversation.assistant_start` / `conversation.assistant_done` 表达（`streaming.*` 为语义别名）** |
| `conversation.message_sent` | 用户消息（含确认卡触发）|
| `conversation.assistant_start` / `assistant_done`（2026-08-16 第 16 轮审计 #1 补录——注册表实现）| 搭档回合开始/结束（含流式边界）|
| `conversation.status_change`（#1 补录）| 会话状态变化（活动/等待/错误）|
| `conversation.error`（#1 补录）| 会话级错误 |
| `conversation.interrupted`（#1 补录）| 用户停止打断 |

### 1.7 问题台账事件（Conversation BC——2026-08-15 补建模 M3）

| 事件 | 触发时机 | 携带数据 | 消费方 |
|------|---------|---------|--------|
| `problem.created` | 用户消息发送（问题实例创建/复跑）| problemId, title, snapshot | 台账 UI、持久化 |
| `problem.snapshot_updated` | 目标确认 / 授权 / 待办回写 | problemId, patch | 台账 UI、断点续做 |
| `problem.closed` | 交付确认关闭（TaskResolved 联动）| problemId | 台账 UI（closed 终态）|
| `problem.rerun` | closed 复开 → 复跑 | problemId, title | 会话创建（新 Task）|

---

## 2. 关键时序图

### 2.1 目标确认（确认卡——目标驱动原点）

```
用户          模型          确认卡         Task状态机         Timeline
 │            │             │             │                │
 │ 输入需求    │             │             │                │
 ├───────────►│             │             │                │
 │            │ 澄清+候选    │             │                │
 │ 点选候选    │             │             │                │
 ├───────────►│             │             │                │
 │            │ 【目标确认】提议            │                │
 │            ├────────────►│             │                │
 │            │             │ goal_proposed               │
 │            │             ├────────────►│               │
 │            │             │             │                │
 │ 点「确认目标」│             │             │                │
 ├───────────►│             │             │                │
 │            │             │ goal_confirmed             │
 │            │             ├────────────►│               │
 │            │             │             │→goal-confirmed│
 │            │             │             ├──────────────►│
 │            │             │             │                │
 │            │ 确认消息回填  │             │                │
 │            │◄────────────┤             │                │
```

### 2.2 执行确认（确认卡——推进到动手）（2026-08-16 起语义为方案确认——PlanProposal 批准；时序图事件名保持历史，新事件见追加段）

```
用户          模型           确认卡        Task状态机     ProgressGuarantee（原 forceTool）
 │            │             │             │                │
 │ 确认目标后   │ 能力检查+方案 │             │                │
 │            ├────────────►│             │                │
 │            │ 方案提议      │ execution_plan_proposed     │
 │            │             ├────────────►│               │
 │            │             │             │                │
 │ 点「确认执行」│             │             │                │
 ├───────────►│             │ execution_confirmed          │
 │            │             ├────────────►│               │
 │            │             │             │→executing      │
 │            │             │             ├───► execution.forced
 │            │             │             │（无推进强制——产出/提议/证据）│
 │            │ 模型被强制推进 │             │                │
 │            │◄────────────┤             │                │
```

### 2.3 达成确认（确认卡——收敛）（2026-08-16 起语义为解决确认——CompletionClaim+证据对账）

```
用户          模型            确认卡        Task状态机    ProgressGuarantee（原 forceTool）
 │            │              │             │                │
 │ 动手产出    │ write/edit   │             │                │
 │            ├─────────────►│             │                │
 │            │ 【已达成】提议 │             │                │
 │            │              │ achievement_proposed        │
 │            │              ├────────────►│               │
 │            │              │             │                │
 │ 点「已解决」 │              │             │                │
 ├───────────►│              │ achievement_confirmed       │
 │            │              ├────────────►│               │
 │            │              │             │→resolved       │
 │            │              │             ├───► execution.released
 │            │              │             │                │
 │ 对话收敛     │              │             │                │
```

> 2026-08-16 第 13 轮审计 #8：时序图列名同步推进保障更名（forceTool → ProgressGuarantee；forceTool=true/释放 → execution.forced/released——事件名与 §1.5 一致；图内事件名保持历史——见 §2.2 注记）。

---

**下一步**: [07-API网关设计](./07-api-gateway.md)


---

## 意图确认领域事件（2026-08-16 新增——意图确认领域模型重设计 `intent-confirmation-domain-design.md` §3.5）

| 事件 | 内容 | 触发 |
|------|------|------|
| `proposal.goal` | GoalProposal 完整内容（statement + assumptions——含关键假设）| 模型输出目标提议（结构化解析）|
| `proposal.plan` | PlanProposal 完整内容（files[{path,reason}] + assumptions + verificationPlan）| 模型输出方案提议 |
| `proposal.completion` | CompletionClaim 完整内容（summary + evidence）| 模型输出完成声明 |
| `decision.requested` | 决策点出现（kind + decisionContent 快照——呈现内容完整审计）| deriveDecisionPoint 命中 |
| `decision.resolved` | 确认/拒绝（confirm \| reject + RejectReason）——原 card.resolved 增强 | 用户决策 |
| `completion.evidence_missing` | 完成声明被拒（missing 清单——回填引导补证据）| verifyCompletion 失败 |
| `gate.denied` | ActionGate deny（高风险动作被机制拦——非 ask）| 动作属性判定 |

现有事件保持（task.*_proposed 兼容保留——proposal.* 为结构化替代；card.shown/resolved 与 decision.requested/resolved **两层并存、语义对齐**（card.* = UI 卡生命周期视图事件——保留——消费方/dedupe 依赖；decision.* = 领域决策点事件——2026-08-16 第 13 轮审计 #8 措辞修正：非「并入」非合并——设计 §3.5 注记）；session.pending_set/cleared、tool.blocked 不变）。
