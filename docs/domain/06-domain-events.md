# 06 — 领域事件（无阶段·目标驱动版）

> 2026-08-07 重新生成——事件目录基于无阶段目标驱动领域模型（02 领域模型 / 04 战术设计）。
> 替代旧六阶段版（ContextEngine/Compaction/AgentChain 等产品流水线事件）。

---

## 1. 事件目录

### 1.1 确认点事件（Conversation BC——核心）

| 事件 | 触发时机 | 携带数据 | 消费方 |
|------|---------|---------|--------|
| `task.goal_proposed` | 模型澄清后给出目标提议 | taskId, goalText | 确认卡渲染（UI）|
| `task.goal_confirmed` | 用户点「确认目标」 | taskId, goalText, source | 状态机（→goal-confirmed）、Timeline |
| `task.goal_rejected` | 用户点「重新描述」 | taskId | 状态机（→clarifying）、模型（重新澄清）|
| `task.execution_plan_proposed` | 模型给出执行方案 | taskId, plan, files | 执行确认卡渲染（UI）|
| `task.execution_confirmed` | 用户点「确认执行」 | taskId, source | 状态机（→executing）、forceTool 生效 |
| `task.execution_rejected` | 用户点「修改方案」 | taskId | 状态机（→goal-confirmed）、模型（改方案）|
| `task.achievement_proposed` | 模型汇报达成 | taskId, summary | 达成确认卡渲染（UI）|
| `task.achievement_confirmed` | 用户点「已解决」 | taskId, source | 状态机（→resolved）、forceTool 释放 |
| `task.achievement_rejected` | 用户点「还要改」 | taskId | 状态机（→executing 继续）|
| `task.resolved` | 用户确认解决 | taskId | 任务收敛、Timeline |

### 1.2 计划清单事件（Workspace BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `plan.approved` | 用户批准文件清单 | taskId, files（追加）|
| `plan.rejected` | 写清单外文件被拒 | taskId, file, approvedList（拒绝带边界）|

### 1.3 工具授权/执行事件（Conversation/Workspace BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `tool.approved` / `tool.rejected` | 用户批准/拒绝工具 | toolName, args, action |
| `tool.executed` / `tool.failed` | 工具执行结果 | toolName, ok, error |
| `tool.pending_confirmation` | 执行未确认时工具调用到达（挂起）| toolName, args |

### 1.4 能力/环境事件（Capability BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `capability.checked` | 能力检查 | taskId, capabilities, missing |
| `capability.ledger_updated` | Ledger 回填 | rootPath, capabilityId, ok |
| `environment.injected` | 环境快照注入模型 | rootPath, envSnapshot |

### 1.5 执行保障事件（Conversation BC）

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `execution.forced` | forceTool=true（确认后无产出强制）| taskId, reason |
| `execution.released` | forceTool 释放（失败/计划写完/达成确认）| taskId, reason |
| `stuck.escalated` | 连续无产出升级 | taskId, message |
| `stuck.needs_human` | 升级仍无效转用户 | taskId, message |

### 1.6 会话/消息事件

| 事件 | 说明 |
|------|------|
| `conversation.created` / `archived` | 生命周期 |
| `message.appended` | 消息变更（用户/搭档/工具）|
| `streaming.started` / `completed` | 流式输出 |
| `user.message_sent` | 用户消息（含确认卡触发）|

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

### 2.2 执行确认（确认卡——推进到动手）

```
用户          模型           确认卡        Task状态机       forceTool
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
 │            │             │             ├───► forceTool=true
 │            │             │             │（无产出强制）     │
 │            │ 模型被强制产出 │             │                │
 │            │◄────────────┤             │                │
```

### 2.3 达成确认（确认卡——收敛）

```
用户          模型            确认卡        Task状态机        forceTool
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
 │            │              │             ├───► forceTool释放
 │            │              │             │                │
 │ 对话收敛     │              │             │                │
```

---

**下一步**: [07-API网关设计](./07-api-gateway.md)
