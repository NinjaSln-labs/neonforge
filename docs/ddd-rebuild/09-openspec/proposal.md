# 09 · OpenSpec Proposal — DDD 重建与源码对齐

> Change ID（建议）：`ddd-rebuild-2026-11`
> 目录说明：本仓库当前没有 `openspec/` 工作区；本目录是 OpenSpec 结构的文档化呈现。若后续引入 OpenSpec CLI，可将本目录内容迁移到 `openspec/changes/ddd-rebuild-2026-11/`。

---

## Why

NeonForge 的领域模型主干（用户决策驱动的任务状态机、证据门、受控执行、事件时间线）已经存在于代码中，但当前的文档体系与代码事实存在脱节：

1. 历史文档与产品叙述混入了已移除的阶段体系、旧命名与演示能力，不能作为当前代码的单一事实来源。
2. 代码中存在与领域不变量不一致的实现：计划清单在方案确认前就被写入；只读判定存在可写绕过；`read`/`web_fetch` 的文件与网络边界不够硬；进程清理存在 `pid=0` 误杀。
3. 演示面板、占位任务队列与真实能力混排，交付真实性被削弱。
4. 事件时间线缺少版本、去重与投递保证，审计与跨聚合一致性存在缺口。
5. 代码中的字段、占位与文案暗示了若干**应有但未完整实现**的领域（变更集、任务队列、用量成本、扩展/MCP、验收门禁）；只做 as-is 文档会把“产品缺口”写成“产品现状”，因此本次同时产出目标领域蓝图与目标态 spec。

本次变更以 **代码为证据来源**，重新生成 DDD 文档集，区分“已落地 / 部分落地 / 演示 / 缺失应有”，并修正/补全源码中与模型不一致的 P0 部分。

---

## What Changes

### 文档

- 新增 `docs/ddd-rebuild/`：00 领域蓝图、01-08 的 DDD 工件、09 的 OpenSpec 结构、10 的代码证据索引。
- 明确标注 `已落地` / `部分落地` / `原型/演示` / `缺失（应有）` 四类能力状态。
- 不使用 `docs/` 下的历史产品文档作为输入。
- **00-domain-blueprint** 先回答“产品应该有哪些领域”，再以代码校准；新增 BC-10～BC-14 目标态上下文与 A13-A17 目标态聚合。

### 目标领域补齐（本次只补文档与 spec，不实现）

- **BC-10 变更与版本**：变更集、基线校验、审核/应用/回滚、Git 只读桥（`change-version` spec）。
- **BC-11 任务编排**：队列、单活跃调度、阻塞/恢复、取消（`task-orchestration` spec）。
- **BC-12 用量与成本**：真实 usage 台账、成本、预算提醒、缓存计量（`usage-cost` spec）。
- **BC-13 扩展与集成**：扩展注册/生命周期、MCP 桥、Git 集成、信任边界（`extension-integration` spec）。
- **BC-14 验收与质量门禁**：验收来源、证据绑定、门禁判定、交付联动（`acceptance-quality` spec）。

### 源码修正（P0）

- **P0-01**：`read` 工具在项目根外读取需要授权；根内自动。
- **P0-02**：只读命令判定补强：`sed -i`、`find -exec/-delete`、`awk system()`、`sort -o`、`git branch -D`、`git remote add`、`rg --pre`、`wget` 下载等归为 hazardous。
- **P0-03**：删除 `propose_plan` 提议阶段写入 `plannedFiles`；只在用户确认方案时派生；拒绝不落清单。
- **P0-04**：所有进程 kill 前守卫 `pid > 0`，避免 `kill(-0)` 误杀。
- **P0-05**：系统代跑验证只执行 `readonly` 与 localhost `network-read`；外网命令标 unverifiable。
- **P1-01**：`web_fetch` 拒绝 localhost/私网/元数据地址，手动跟随重定向并逐跳校验。

### 测试

- 新增/更新单元测试覆盖上述安全与不变量修复。
- 保持现有 Inv 1-8、tools、permissionRules、verifyCompletionSystem、interaction 测试通过。

### 非目标（本变更不做）

> 本节记录原始变更提案的范围；后续用户指令已扩展为实现全部目标态领域，勾选状态以 `tasks.md` 为准。

- 不实现任务队列、变更集、用量台账、MCP/Git 集成、验收门禁的真实运行时代码（仅补目标态文档与 spec，实现顺序见 `00-domain-blueprint.md §6`）。**（2026-11-14 已全部实现，见 `tasks.md §5`）**
- 不实现 DoD 真实接入、数字交付面板、插件市场。**（DoD 真实来源已于 2026-11-14 接入；数字交付面板仍为演示；插件市场仍为非目标）**
- 不重构 `ConversationPanel` 为多个应用服务（仅在 08/09 列为后续任务）。**（P1-05 已于 2026-11-15 完成）**
- 不引入完整 OpenSpec CLI 基础设施（列为后续任务）。**（轻量 Outbox 与跨存储事务性 Outbox 已于 2026-11-15 实现：`timelineOutbox.ts` + `stateTransaction.ts` WAL）**

---

## Impact

### Capabilities

| Capability | 受影响 | 说明 |
| :--- | :--- | :--- |
| `conversation-task/plan-confirmation` | 是 | 计划清单派生时机修正（P0-03） |
| `conversation-task/completion-verification` | 是 | 系统代跑范围收紧（P0-05） |
| `execution-trust/read-boundary` | 是 | read 根外授权（P0-01） |
| `execution-trust/action-classification` | 是 | 只读判定补强（P0-02） |
| `execution-trust/process-lifecycle` | 是 | pid 守卫（P0-04） |
| `provider-gateway/streaming-retry` | 否 | 不改 |
| `session-timeline/event-catalog` | 否（文档） | 记录缺口，后续治理 |
| `workspace-environment/planned-files` | 是 | 与 P0-03 协同 |
| `delivery-ledger/delivery-package` | 否（文档） | 记录验收空项缺口 |
| `configuration-secrets/web-access` | 是 | web_fetch 边界（P1-01） |
| `change-version` | 否（新增目标态） | 变更集/基线/Git 只读桥 |
| `task-orchestration` | 否（新增目标态） | 队列/调度/阻塞/取消 |
| `usage-cost` | 否（新增目标态） | usage 台账/成本/预算 |
| `extension-integration` | 否（新增目标态） | 扩展/MCP/Git 集成 |
| `acceptance-quality` | 否（新增目标态） | 验收来源/证据/门禁 |

### 聚合变更

| 聚合 | 变更 |
| :--- | :--- |
| A1 Task | I06 的执行路径修正；无状态字段变更 |
| A2 PlannedFiles | 写入时机从“提议”改为“方案确认”；追加语义不变 |
| A3 ToolInvocation | read 授权策略、只读判定补强、pid 守卫 |
| A4 ProjectEnvironment | 无 |
| A5 ServiceInstance | pid 守卫 |
| A6 ProblemInstance | 无 |
| A7 DeliveryPackage | 无（文档记录） |
| A8 SessionTimeline | 无（文档记录缺口） |
| A13 ChangeSet（已实现） | 新增：变更集/基线/审核/应用/回滚 |
| A14 TaskQueueEntry（已实现） | 新增：队列/调度/阻塞/取消 |
| A15 UsageLedger（已实现） | 新增：usage/成本/预算 |
| A16 Extension（已实现） | 新增：注册/生命周期/信任 |
| A17 AcceptanceRecord（已实现） | 新增：验收来源/证据/门禁 |

---

## Goals

| 目标 | 验收指标 |
| :--- | :--- |
| 文档完整 | 00-10 全部存在；每份文档通过对应 Skill 校验清单 |
| 目标领域完整 | BC-10～BC-14 均有上下文定义、聚合/不变量、事件与 spec；现状/目标态标记清晰 |
| 代码可追溯 | 10-code-evidence 中每个关键结论有文件/符号/行号 |
| P0 关闭 | P0-01 ~ P0-05 全部有修复 + 测试；安全回归通过 |
| 不变量回归 | Inv 1-8 全绿；新增 I06 渲染层测试 |
| 类型/构建 | 双 `tsc` 通过；`eslint` 通过 |
| 交互回归 | `vitest` 单测 + interaction 测试通过；主路径 e2e-sim 收敛 |
| 无回归 | 现有 provider/workspace/service/delivery 测试不因修复而失败 |

---

## 风险与缓解

| 风险 | 缓解 |
| :--- | :--- |
| read 根外授权增加交互，影响文件整理场景 | 仅在根外触发；保留根内自动；候选可配置文件范围（后续） |
| 只读判定补强误伤合法只读命令 | 用参数级形态而非整命令禁用；新增测试锁定 |
| 计划清单延迟派生影响 UI 展示 | UI 从 `decisionContent.proposal` 读取；不依赖 `plannedFiles` 展示 |
| web_fetch 拦截私网影响本地文档调试 | 仅拦截 `web_fetch`；本地开发可用 `open` 或 `read`/`curl localhost` |
| pid 守卫改变现有清理行为 | 正 pid 行为不变；仅跳过 0/负数 |

---

## 后续（不在本次变更内）

- Outbox/事件版本/去重存储（P1-02、P2-06、P2-07）。
- IPC 契约 schema（P1-04）。
- `ConversationPanel` 拆分（P1-05）。
- DoD/验收真实接入（P1-06、P1-07）。
- 密钥存储升级（P1-09）。
- symlink/realpath 沙箱（P1-10）。
- 旧事件名迁移（P2-01）。
