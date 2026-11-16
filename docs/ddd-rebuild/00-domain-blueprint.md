# 00 · 领域蓝图（Domain Blueprint）

> 阶段：战略 / Blueprint（`ddd-scope` → `ddd-subdomains` 之间的补充工件）
> 目的：**先回答“这个产品应该有哪些领域”，再用现有代码校准**。不是只把代码里已经存在的模块翻译成文档。
> 输入：`01–08` 的建模结果 + 全量代码阅读（含占位、演示、类型、注释中的产品语义）。
> 输出：完整领域目录、现状标记、目标态领域、隐藏缺口、演进顺序。

---

## 1. 方法与判定规则

本蓝图使用三种证据，而不是只使用“已经能跑通的代码”：

| 证据类型 | 含义 | 例子 |
| :--- | :--- | :--- |
| **运行时实现** | 代码真实执行、有测试或明确入口 | Task 状态机、工具授权、SSE 流、问题台账 |
| **占位 / 演示** | 代码明确标注“即将支持 / V1 占位 / demo”，入口存在但无真实能力 | DoD/数字交付/信任阶梯演示面板（仅 demo bridge 可达）；插件市场/公开分发非目标 |
| **产品语义暗示** | 类型、字段、注释、UI 文案、契约共同指向一个应有领域，但实现缺失或不完整 | `DeliveryPackage.acceptance` 字段、`verificationPlan`、`plan.files`、`preview`/`diff` 审核 UI |

领域判定四问：

1. 它是否有独立的业务名词与规则（不是纯 UI 布局）？
2. 它是否拥有一致性边界（聚合/不变量），可以独立演进？
3. 它的缺失是否会让现有能力变得不可信或不完整？
4. 它是否已经有代码落点（哪怕只是占位/字段），证明产品确实需要它？

四问中命中 3 条以上，就纳入目标领域目录；只命中 1–2 条，记录为“候选/非目标”。

---

## 2. 完整领域目录

> 编号稳定：BC-01～BC-09 是首轮从代码识别的上下文；BC-10～BC-14 是本轮按“应该有什么”补充的目标上下文。
> 状态沿用 `已落地` / `部分落地` / `原型/演示`，新增 `缺失（应有）`。

| 编号 | 领域 | 类型 | 现状 | 代码证据 | 目标文档 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| BC-01 | 会话与任务 | Core | 已落地 | `conversationState.ts`、`agentLoop.ts`、`protocolTools.ts` | 04/06/07 + `conversation-task` spec |
| BC-02 | 执行与信任 | Core | 已落地（本轮修 P0） | `tools.ts`、`useToolApproval.ts`、`sandboxPath.ts` | 04/06/07 + `execution-trust` spec |
| BC-03 | 工作区与环境 | Supporting | 已落地 | `workspace.ts`、`plannedFilesStore.ts`、`envManager.ts`、`serviceManager.ts` | 04/06/07 + `workspace-environment` spec |
| BC-04 | 交付与问题台账 | Supporting | 已落地（BC-10/14 补齐交付与验收） | `DeliveryPanel.tsx`、`problemStore.ts`、`applyDiff.ts` | 04/06/07 + `delivery-ledger` spec |
| BC-05 | 模型接入 | Supporting | 已落地（BC-12 补齐用量） | `gateway.ts`、`providers/*`、`preheat.ts` | 04/06/07 + `provider-gateway` spec |
| BC-06 | 会话时间线 | Generic | 已落地（含跨上下文事务性 Outbox） | `timeline.ts`、`timelineLogger.ts`、`stateTransaction.ts` | 04/06/07 + `session-timeline` spec |
| BC-07 | 配置与凭据 | Generic | 已落地 | `configStore.ts` | 04/06/07 + `configuration-secrets` spec |
| BC-08 | 上下文与检索 | Supporting | 已落地 | `context.ts`、`codeRag.ts`、`lsp.ts`、`compact.ts` | 04/06/07 + `context-retrieval` spec |
| BC-09 | 平台运行 | Generic | 已落地（扩展注册 + MCP；插件市场非目标） | `main.ts`、`pluginSystem.ts`、`preload.ts` | 04/06/07 + `platform-runtime` spec |
| **BC-10** | **变更与版本** | Supporting | **已落地** | `domain/changeSet.ts`、`main/changeSetService.ts`、`main/gitBridge.ts`、`ipc.ts` `changeset:*`/`git:read` | 本节 + `change-version` spec |
| **BC-11** | **任务编排** | Supporting | **已落地** | `domain/taskQueue.ts`、`main/taskQueueStore.ts`、`ipc.ts` `queue:*`、`MainWorkspace.tsx` TaskPanel | 本节 + `task-orchestration` spec |
| **BC-12** | **用量与成本** | Generic | **已落地** | `domain/usageLedger.ts`、`main/usageStore.ts`、`gateway.ts` usage 解析、`ipc.ts` `usage:*` | 本节 + `usage-cost` spec |
| **BC-13** | **扩展与集成** | Supporting | **已落地** | `domain/extension.ts`、`main/pluginSystem.ts`、`main/mcpClient.ts`、`main/gitBridge.ts`、`ipc.ts` `extensions:*`/`mcp:*`/`git:read` | 本节 + `extension-integration` spec |
| **BC-14** | **验收与质量门禁** | Core | **已落地** | `domain/acceptance.ts`、`main/acceptanceStore.ts`、`ipc.ts` `acceptance:*`、`DeliveryPanel.tsx` 门禁 | 本节 + `acceptance-quality` spec |

> 实现状态（2026-11-14）：BC-10～BC-14 目标态领域已全部落地（领域状态机 + 本机持久化 + IPC/preload + 生产 UI + 单测）；演示面板仍保留为演示，但生产交付路径不再依赖它们。

**非领域内容（故意不建模）**：`scenes.tsx` 的启动场景卡、图标、样式 token 属于产品内容/UI 素材，不构成业务领域；它们作为 BC-01 的 UI 素材被引用，不单独立上下文。

---

## 3. 新增目标领域（BC-10 ～ BC-14）

### 3.1 BC-10 变更与版本（Change & Version）

**为什么应有**：产品不是只产出“消息”，而是修改真实文件；当前已有 diff 应用/回滚与 `.nf-bak` 快照，但没有“变更集”这个一等对象，Git 只是占位插件。没有变更集，就无法回答“这次任务到底改了哪些文件、基于哪个版本、能否安全回滚、是否与用户外部修改冲突”。

- 聚合：**A13 变更集（ChangeSet）**
  - 实体：`ChangeItem`（path、base hash、after hash、diff hunks）
  - 值对象：`ChangeId`、`BaseSnapshotRef`、`BaseHash`、`ChangeStatus`（proposed/reviewed/applied/reverted/superseded/conflicted）、`DiffHunk`
- 不变量：
  - 变更项必须有应用前快照/基线，不能“无基线覆盖”。
  - 应用必须经过用户审核与授权；不能由模型声明自动应用。
  - 应用前校验基线（文件未被外部修改）；不一致 → `conflicted`，不得静默覆盖。
  - 回滚恢复到基线内容；回滚失败必须显式报告，不得假装成功。
  - 一个任务边界内至少有一个可追溯的变更集；交付包引用变更集，而不是重新猜测。
- 关键命令：`ProposeChangeSet`、`ReviewChangeItem`、`ApplyChangeSet`、`RevertChangeSet`、`SupersedeChangeSet`
- 关键事件：`changeset.proposed`、`changeset.reviewed`、`changeset.applied`、`changeset.reverted`、`changeset.conflict_detected`
- 代码落点：`applyDiff.ts`（snapshot/revert）、`domain/changeSet.ts`、`main/changeSetService.ts`、`main/gitBridge.ts`、`ipc.ts` `changeset:*`/`git:read`、`DeliveryPanel.tsx`（审核 UI）
- 现状：已落地。变更集状态机 + 内容哈希基线 + 冲突检测；Git 只读桥（status/log/diff/branches）固定 argv。

### 3.2 BC-11 任务编排（Task Orchestration）

**为什么应有**：对话面板已有“任务”Tab 与“任务队列”文案，说明产品承诺多任务/排队；但 `TaskPanel` 明确是结构占位。只要产品支持“一个工作区同时有多件事”，就需要独立的调度领域，而不是把队列塞进 Task 聚合（会破坏“一个任务一个决策点”的不变量）。

- 聚合：**A14 任务队列条目（TaskQueueEntry）**
  - 值对象：`TaskEntryId`、`TaskPriority`、`QueueStatus`（queued/running/paused/blocked/completed/failed/cancelled）、`SchedulingPolicy`
- 不变量：
  - 每个工作区同一时刻最多一个 `running` 任务；其余保持排队。
  - 任务被决策点/授权阻塞时进入 `blocked`，不得自动跳过或自动确认。
  - 取消排队任务不得破坏其 Task 状态；取消运行中任务走 BC-01/BC-02 的取消路径。
  - 队列顺序稳定；重排必须由用户显式触发。
  - 队列状态来自 Task 的真实状态事件，不由 UI 猜测。
- 关键命令：`EnqueueTask`、`StartTask`、`PauseTask`、`ResumeTask`、`CancelTask`、`ReorderTask`
- 关键事件：`queue.entry_enqueued`、`queue.entry_started`、`queue.entry_blocked`、`queue.entry_completed`、`queue.entry_cancelled`
- 代码落点：`domain/taskQueue.ts`、`main/taskQueueStore.ts`、`ipc.ts` `queue:*`、`MainWorkspace.tsx` TaskPanel
- 现状：已落地。单活跃队列、暂停/恢复/阻塞/取消/重排、按会话原子持久化；授权等待自动阻塞并在解除后恢复。

### 3.3 BC-12 用量与成本（Usage & Cost）

**为什么应有**：这是按 token 计费的 AI 工作台；用户需要知道“这一轮/这个项目花了多少”。当前 `TaskPanel` 只显示前缀缓存命中率，`gateway.ts` 没有解析 `usage` 字段，`stats` 插件是占位。没有用量台账，成本不可见、预算不可控、缓存收益不可量化。

- 聚合：**A15 用量台账（UsageLedger）**
  - 实体：`UsageEntry`（请求 id、provider、model、prompt/completion/reasoning tokens、cache outcome、时间、任务/会话归属）
  - 值对象：`UsageEntryId`、`TokenCount`、`Money`、`PriceTableVersion`、`CacheOutcome`
- 不变量：
  - 只记录 Provider 真实返回的 usage；没有 usage 字段时标记 `unknown`，不得用字符数伪装精确值。
  - 条目不可修改；冲正/重算产生新条目。
  - 台账不含 prompt 内容、密钥或文件内容。
  - 成本 = token × 版本化价格表；未知模型价格 → `unknown`，不得按 0 计算。
  - 预算阈值只产生提醒事件，默认不硬中断任务（硬限制需用户显式开启）。
- 关键命令：`RecordUsage`、`EvaluateBudget`、`ClosePeriod`、`ExportUsage`
- 关键事件：`usage.recorded`、`usage.budget_threshold_reached`、`usage.period_closed`
- 代码落点：`main/gateway.ts`（usage 解析）、`domain/usageLedger.ts`、`main/usageStore.ts`、`main/budgetStore.ts`、`ipc.ts` `usage:*`/`budget:*`、`MainWorkspace.tsx` TaskPanel
- 现状：已落地。真实 usage 入账（未知价格 cost=null）、append-only 台账、汇总/CSV 导出、预算阈值提醒 + 可选安全点暂停。

### 3.4 BC-13 扩展与集成（Extensions & Integrations）

**为什么应有**：`PluginRegistry` 已注册 5 个内置插件，其中 `mcp-bridge`、`git` 明确是 V1 占位；`plugins:*` IPC 已存在。产品语义上，扩展是能力边界的一部分：外部工具（MCP）与 Git 都属于“受控接入”，必须有独立的注册、信任与生命周期规则，不能混进工具目录本身。

- 聚合：**A16 扩展（Extension）**
  - 值对象：`ExtensionId`、`ExtensionVersion`、`ExtensionKind`（builtin/mcp/git）、`CapabilityDescriptor`、`TrustLevel`
- 不变量：
  - 只有已注册且 `active` 的扩展能力可被调用；未知扩展 → 拒绝。
  - 激活/停用幂等；单个扩展失败不得拖垮应用。
  - 第三方扩展第一次调用外部能力必须经过用户授权；内置扩展按 BC-02 风险分级。
  - 扩展不得绕过 BC-02 的沙箱/授权直接访问文件系统或进程。
- 关键命令：`RegisterExtension`、`ActivateExtension`、`DeactivateExtension`、`InvokeCapability`
- 关键事件：`extension.registered`、`extension.activated`、`extension.deactivated`、`extension.invocation_denied`
- 代码落点：`pluginSystem.ts`、`ipc.ts` `plugins:*`
- 现状：已落地。注册表返回 kind/trust/status/capabilities；MCP stdio 客户端拉取工具清单并按 `high` 风险映射；Git 只读桥固定 argv（status/log/diff/branches）；第三方扩展首次调用需授权。

### 3.5 BC-14 验收与质量门禁（Acceptance & Quality Gate）

**为什么应有**：`DeliveryPackage` 有 `acceptance` 字段，`DeliveryPanel` 有“请先勾选全部验收项”，`DoDAlignPanel`/`DigitalDeliveryPanel` 是演示，`PlanProposal` 有 `verificationPlan`——这些证据共同指向一个缺失的核心领域：**验收标准从哪里来、如何绑定证据、由谁判定通过**。当前验收项在生产路径为空，用户实际上“不知道按什么验收”。

- 聚合：**A17 验收记录（AcceptanceRecord）**
  - 实体：`AcceptanceItem`（id、来源、状态、证据引用、豁免原因）
  - 值对象：`AcceptanceSource`（dod/plan-verification/user/manual）、`AcceptanceStatus`（pending/passed/failed/waived）、`EvidenceRef`、`WaiverReason`、`GateVerdict`
- 不变量：
  - 验收项必须有来源；没有来源时显式为空，不得伪造“全部通过”。
  - `passed` 必须有证据引用；手工确认需记录确认人与理由。
  - `waived` 必须有理由，且不参与门禁通过计算。
  - 门禁判定 = 所有非豁免项 `passed`；存在 `failed`/`pending` → 不放行关闭。
  - 验收来源优先取已确认方案的 `verificationPlan`，其次是用户 DoD；演示 DoD 不得进入生产路径。
- 关键命令：`DeriveAcceptanceCriteria`、`AttachEvidence`、`MarkPassed`、`WaiveItem`、`EvaluateGate`
- 关键事件：`acceptance.criteria_derived`、`acceptance.item_passed`、`acceptance.item_failed`、`acceptance.item_waived`、`quality_gate.evaluated`
- 代码落点：`domain/acceptance.ts`、`main/acceptanceStore.ts`、`ipc.ts` `acceptance:*`、`DeliveryPanel.tsx` 门禁、`PlanProposal.verificationPlan`
- 现状：已落地。验收来源取已确认方案的 `verificationPlan`；证据/手工理由/豁免规则由领域强制；门禁阻断关闭。

---

## 4. 现有上下文中的隐藏缺口

> 这些不是新上下文，但属于“代码里已有暗示、文档/实现不完整”的部分，已并入相应上下文的文档与 spec。

| 上下文 | 隐藏缺口 | 代码证据 | 处理 |
| :--- | :--- | :--- | :--- |
| BC-01 | 对话策略（系统提示、nudge、阶段提示、确认词）没有作为领域对象表达 | `sysPrompt.ts`、`systemNudge.ts`、`agentLoop.ts` 的 nudges | 在 BC-01 中定义为“对话策略服务”，不属于新聚合 |
| BC-01 | 会话恢复只恢复消息，不恢复完整 Task 确认位 | `sessionStore.ts`、`useConversationState.ts` 重建 | 在 spec 中明确“以消息重建”的恢复语义 |
| BC-02 | 权限规则持久化（2026-11-15）与三档信任模式（2026-11-16，ADR-015：`trustPolicyStore` + `trust:*` IPC + `authModel` 判定 + main 委托边界二次校验 + 真实信任阶梯）已落地 | `tools.ts` rules/`delegationBoundaryViolation`、`permissionRulesStore.ts`、`trustPolicyStore.ts`、`authModel.ts`、`useTrustPolicy.ts`、`SettingsPanel.tsx`、`TrustLadderPanel.tsx` | 委托越界/清单外/bash 均不自动放行；L5 基线待 Mac 更新 |
| BC-03 | 项目初始化只创建最小骨架，没有模板/场景工程初始化 | `projectInit.ts`、`scenes.tsx` | 模板化列为候选，不建新上下文 |
| BC-04 | 交付包验收项为空；diff 审核与变更集未统一 | `MainWorkspace.tsx`、`DeliveryPanel.tsx` | 由 BC-10/BC-14 补齐 |
| BC-05 | 无 usage 解析、无价格表、无模型健康/降级策略 | `gateway.ts` | 由 BC-12 补齐；健康策略列入后续 |
| BC-06 | 事件版本/DLQ/重放/去重；轻量 Outbox 与跨存储事务性 Outbox 均已落地（2026-11-15：入队 fsync + 启动重放 + outboxId 幂等 + 投递/压缩 fsync 顺序 + 半行/跨午夜防护；WAL 事务覆盖 BC-10/11/14 状态+基线+事件） | `timeline.ts`、`timelineLogger.ts`、`timelineOutbox.ts`、`stateTransaction.ts` | 工作区文件写入仍为快照+补偿（非跨文件系统事务） |
| BC-07 | 明文 fallback 的风险决策未产品化 | `configStore.ts` | 保留为安全决策项 |
| BC-08 | 无长期记忆/项目知识库；RAG 是关键词级 | `codeRag.ts`、`context.ts` | 明确为非目标（无代码证据），避免虚构 |
| BC-09 | 无自动更新/签名/崩溃上报；插件市场/公开分发非目标 | `main.ts`、`pluginSystem.ts` | 内置扩展 + MCP 已落地（BC-13）；平台发布与插件市场列为非目标 |

---

## 5. 刻意排除 / 非目标

以下能力在当前代码与产品语义中没有足够证据，明确**不纳入本轮领域模型**，避免把想象写成需求：

1. 账号体系、云同步、团队协作、权限管理（本地单用户桌面应用）。
2. 在线支付/订阅计费（用量与成本只做本机台账，不做交易）。
3. 自动更新、代码签名、崩溃上报（平台发布能力，当前无入口）。
4. 长期记忆/知识库（当前只有请求级上下文与关键词检索）。
5. 模型训练/微调/评测平台（e2e-sim 是工程测试，不是产品领域）。

若产品后续引入这些能力，应按同样方法先补蓝图，再补上下文/聚合/spec。

---

## 6. 演进顺序（目标态）

| 阶段 | 内容 | 理由 |
| :--- | :--- | :--- |
| 已完成 | P0 安全/不变量修正（P0-01～P0-05、P1-01） | 先保证现有核心可信 |
| 已完成（2026-11-14） | BC-10 变更集、BC-14 验收门禁、BC-12 用量台账、BC-11 任务队列、BC-13 MCP/Git 集成 | 目标态五领域已落地 |
| 已完成（2026-11-15） | IPC 契约校验（P1-04）、ConversationPanel 拆分（P1-05）、演示隔离机制化、轻量 Outbox（P1-02：入队 fsync + 启动重放 + outboxId 幂等）、完整跨存储事务性 Outbox（WAL：状态+基线+事件同提交，启动 FIFO 重放；工作区文件写入保留快照+补偿） | 工程边界、安全边界与事件投递硬化 |

---

## 7. 校验

- [x] 领域目录覆盖“已实现 / 部分实现 / 占位 / 缺失应有”四种状态
- [x] 新增领域均有代码证据（占位、字段、UI 文案或注释），不是凭空发明
- [x] 每个新增领域有聚合、不变量、命令、事件与上下文边界
- [x] 隐藏缺口按现有上下文归类，未重复建域
- [x] 非目标有明确理由，避免过度建模
