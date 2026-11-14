# 09 · OpenSpec Design — 现有架构、契约与数据流

> 对应 Change：`ddd-rebuild-2026-11`
> 目标：把 06/07 的领域模型映射到 NeonForge 现有工程结构，并为本次代码修正提供技术设计。
> 状态（2026-11-15）：BC-10～BC-14 已于 2026-11-14 全部实现；文中 `目标态` 为设计阶段的来源标记，当前代码锚点见 `10-code-evidence.md §8`。

---

## 1. 架构映射

### 1.1 进程与分层

```text
┌──────────────────────────────────────────────────────────────┐
│ Renderer（React 19）                                         │
│  - 应用层编排：ConversationPanel / useConversationState       │
│  - UI：确认卡、工具卡、交付包、问题台账、设置                 │
│  - 不直接访问 node/文件系统；只经 preload bridge              │
└───────────────▲──────────────────────────────┬───────────────┘
                │ contextBridge (ACL/PL)       │ IPC invoke
┌───────────────┴──────────────────────────────▼───────────────┐
│ Preload（contextBridge）                                     │
│  - 暴露 config/gateway/tools/workspace/timeline/...          │
│  - 类型契约：NeonForgeBridge / types.d.ts                    │
└───────────────▲──────────────────────────────┬───────────────┘
                │                              │
┌───────────────┴──────────────────────────────▼───────────────┐
│ Main（Electron 主进程）                                       │
│  - 应用服务/基础设施：gateway、tools、workspace、env、service │
│  - 持久化：configStore、plannedFilesStore、timelineLogger     │
│  - 安全：授权、沙箱、快照、进程、web 访问                     │
└───────────────▲──────────────────────────────┬───────────────┘
                │                              │
┌───────────────┴──────────────────────────────▼───────────────┐
│ Shared Domain（纯逻辑，renderer/main 共用）                   │
│  - conversationState（Task 聚合）                             │
│  - agentLoop（进展/停滞）                                     │
│  - protocolTools / planProposalParser / completionClaimParser   │
│  - timeline（事件目录/派生）                                  │
│  - sandboxPath（路径规范化）                                  │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 上下文到代码模块

| 上下文 | 应用层 / UI | 领域层 | 基础设施 / 仓储 |
| :--- | :--- | :--- | :--- |
| BC-01 会话与任务 | `ConversationPanel.tsx`、`useConversationState.ts`、`useToolApproval.ts` | `conversationState.ts`、`agentLoop.ts`、`protocolTools.ts`、`planProposalParser.ts`、`completionClaimParser.ts`、`timeline.ts` | 会话/问题 localStorage；时间线 IPC |
| BC-02 执行与信任 | `useToolApproval.ts`、`authModel.ts` | `conversationState.ts`（门控/动作属性）、`sandboxPath.ts` | `tools.ts`、`applyDiff.ts`、`ipc.ts` |
| BC-03 工作区与环境 | `FileTree.tsx`、`OutputPanel.tsx`、`MainWorkspace.tsx` | 无独立 domain 模块（路径/EOL 规则在 domain） | `workspace.ts`、`projectInit.ts`、`plannedFilesStore.ts`、`envManager.ts`、`serviceManager.ts` |
| BC-04 交付与问题台账 | `DeliveryPanel.tsx`、`SessionPanel.tsx`、`MainWorkspace.tsx` | 无独立 domain 模块（`DeliveryPackage` 类型在 `types.d.ts`） | `applyDiff.ts`、`problemStore.ts`、`delivery:apply-diff` |
| BC-05 模型接入 | `ConfigPage.tsx`、`SettingsPanel.tsx`（model label） | 无（协议传输在 main） | `gateway.ts`、`providers/*`、`preheat.ts`、`compact.ts` |
| BC-06 会话时间线 | — | `timeline.ts` | `timelineLogger.ts`、`chatLog.ts`、`timeline:log/query` |
| BC-07 配置与凭据 | `ConfigPage.tsx`、`SettingsPanel.tsx` | 无 | `configStore.ts`、`config:*` |
| BC-08 上下文与检索 | `FileTree.tsx`（@mention 列表） | 无 | `context.ts`、`codeRag.ts`、`lsp.ts`、`compact.ts`、`preheat.ts` |
| BC-09 平台运行 | `App.tsx`、`main.tsx` | 无 | `main.ts`、`pluginSystem.ts`、`preload.ts` |
| BC-10 变更与版本（目标态） | `DeliveryPanel.tsx`（审核 UI，后续拆分） | 目标态 `domain/changeSet.ts` | `applyDiff.ts`、`ipc.ts` `delivery:*`、Git 只读桥（目标态） |
| BC-11 任务编排（目标态） | `MainWorkspace.tsx`（任务 Tab，替换占位） | 目标态 `domain/taskQueue.ts` | 目标态 `main/taskQueueStore.ts` + 调度器 |
| BC-12 用量与成本（目标态） | `MainWorkspace.tsx`（用量视图） | 目标态 `domain/usageLedger.ts` | `gateway.ts`（usage 解析）、目标态 `usageStore.ts` |
| BC-13 扩展与集成（目标态） | `ConfigPage.tsx` / 插件视图 | 目标态 `domain/extension.ts` | `pluginSystem.ts`、MCP 客户端（目标态） |
| BC-14 验收与质量门禁（目标态） | `DeliveryPanel.tsx`、`DoDAlignPanel.tsx`（去演示化） | 目标态 `domain/acceptance.ts` | 目标态验收 IPC + 交付包接线 |

---

## 2. 数据模型与持久化

| 数据 | 聚合 | 权威位置 | 持久化 | 恢复策略 |
| :--- | :--- | :--- | :--- | :--- |
| Task 状态 | A1 | renderer `stateRef` | 不直接持久化；决策内容快照随完整 assistant 消息存 localStorage | 会话消息恢复；状态从确认位/决策内容重建（当前恢复策略以消息为准） |
| 会话消息 | A1 读模型 | renderer `messages` | localStorage `nf-session`，最多 50 条，只存完整消息 | 损坏 → 空；streaming 不覆盖 |
| 计划清单 | A2 | main `plannedFilesStore` | `userData` 下 JSON（0600 模式） | 启动 `planned-files:load` 恢复；损坏 → 空 |
| 工具调用 | A3 | assistant 消息 `toolCalls` | 随会话消息（完整状态）；时间线另有事件 | 旧存档无 id → name+args fallback |
| 项目环境 | A4 | main 内存 Map | 不持久化（进程内） | 重启重检；签名变化重检 |
| 服务实例 | A5 | main 内存 Map + 进程表 | 不持久化；PID 文件仅用于清理残留 | 重启丢失；应用退出清理 |
| 问题台账 | A6 | renderer state + localStorage | `nf-problems`，最多 20 条 | 损坏 → fallback；旧 authorized 迁移 |
| 交付包 | A7 | renderer state | 不持久化（会话内） | 重启丢失；由 realChanges 重建 |
| 时间线 | A8 | main JSONL | `userData/logs/timeline-<session>.jsonl` | append-only；坏行跳过 |
| 聊天日志 | A8 子集 | main JSONL | `userData/logs/chat-<session>.jsonl` | append-only；导出固定覆盖 |
| 配置/密钥 | BC-07 | main `ConfigStore` | `userData/config/neonforge-config.json` | safeStorage 加密 + 明文 fallback |
| 变更集（目标态） | A13 | 目标态 main/领域模块 | 目标态变更集 JSON + 基线快照/哈希 | 任务边界收口；冲突显式 |
| 任务队列（目标态） | A14 | 目标态 main store | 目标态队列 JSON | 重启恢复；运行中标记 interrupted |
| 用量台账（目标态） | A15 | 目标态 main JSONL/DB | 目标态 `usage-<session>.jsonl` | append-only；缺 usage 标 unknown |
| 扩展注册表（目标态） | A16 | main `PluginRegistry` | 内存 + 本机配置 | 启动加载；损坏扩展隔离 |
| 验收记录（目标态） | A17 | 目标态会话/交付 | 目标态随交付包/会话持久化 | 无来源显式为空；门禁可重算 |

### 2.1 数据一致性规则

1. **计划清单权威在 main**：renderer 只保留镜像；写路径经 `planned-files:add/reset`。
2. **方案确认镜像**：`session:plan-confirmed` 与 `stateRef.planConfirmed` 语义同步；`approve-files` 硬序门消费 main 镜像。
3. **交付包由真实变更驱动**：`MainWorkspace.handleToolResult` 收集 `realChanges`，无真实变更不生成交付包。
4. **问题关闭同步交付包**：`handleConfirmClosed` 同时更新 `ProblemInstance.status` 与 `DeliveryPackage.status`。

---

## 3. 核心数据流

### 3.1 发送与流式回合

```text
User input
  → send()
    → 清空输入 / 处理 pending 文本意图（confirm/reject）
    → 新 sid（会话隔离）
    → buildHistory()（user/assistant done + 结构化 tool_calls/tool 消息 + reasoning_content）
    → @mention ContextEngine / .neonforge 注入
    → 长对话压缩（>100 条）
    → acquireChain()（流式互斥）
    → runChat(history + system prompt, 0, sid)
      → evaluateTurnProgress / decideProgressGuarantee → forceTool / mode
      → detectUnproductiveDialogue → loop-guard / forced-clarify
      → gateway.streamChat(SSE)
      → applyChunk(reasoning/content/tool-call/done/stream-reset)
        → 协议工具：decideProtocolToolCall → setPending / clarify / reject / invalid
        → 普通工具：tool-call 卡 → 执行/授权
      → maybeContinue(depth, sid)（工具完成后续聊，最多 40 轮）
```

### 3.2 决策点生命周期

```text
Proposal (goal/plan/completion)
  → decideProtocolToolCall / parse* 解析
  → setPending(kind, decisionContent)        [唯一 PENDING]
  → UI 卡（decision.requested）
  → 用户 confirm / reject（必须带 RejectReason）
      → userDecided / approvalDecided
      → 状态推进/回退 + 事件派生（deriveStateEvents）
      → plan 确认 → derivePlannedFiles + 写 main 镜像
      → resolution 确认 → planConfirmed 重置（任务边界）
```

### 3.3 工具执行与授权

```text
tool-call
  → 协议工具？→ 决策点（不真实执行）
  → 普通工具：
      → renderer 门控：pending / goal / plan / plannedFiles / delegate / trust
      → tools:execute(approved)
        → main ToolRegistry.execute
          → write 规划门控（未 approve-files → policy）
          → 规则 deny > allow > ask
          → requiresApproval && !approved → preApproval（只读/本地网络）→ needApproval
          → execute（read/write/edit/bash/search/web/service/...）
          → ToolResult{ok,data,error,needApproval?,policy?}
      → 回填工具卡 + applyToolResult（produced/lastToolFailed）
      → maybeContinue 续聊
```

### 3.4 完成核验与交付

```text
report_completion
  → decideProtocolToolCall → pending resolution candidate (evidence not yet trusted)
  → verifyThenResolve(claim)
    → completion:verify(commands, rootPath)      [main 代跑只读]
    → verifyCompletion(claim, systemState)       [domain 纯逻辑]
      → ok? → 等 pending 清空 → setPending(resolution)
      → not ok → completion.evidence_missing + buildEvidenceBackfill → silent 引导（最多 N 次）
  → 用户确认解决 → resolutionConfirmed
    → DeliveryPackage 由 realChanges 生成
    → ProblemInstance 可关闭
```

### 3.5 事件时间线

```text
state transition (useConversationState.transition)
  → deriveStateEvents(prev, next)
  → tlog(type, detail)
  → timeline:log (IPC)
  → timelineLogger.logTimeline
    → seqBySession[key]++
    → appendFileSync(timeline-<session>.jsonl)
  → timeline:query 读取/过滤
```

---

## 4. 接口协议设计

### 4.1 IPC 契约

见 [07 §2](../07-domain-interactions.md#2-集成事件契约ipc)。本次修正只新增/调整语义，不新增通道：

- `tools:execute`：read 的授权策略变化；`ToolResult` 字段不变。
- `completion:verify`：只代跑范围收紧；返回结构不变。
- `planned-files:add`：调用时机从提议改为确认；契约不变。
- `web_fetch`：无 IPC 变化（工具内部拦截）。
- 新增通道（已实现）：`changeset:*`、`queue:*`、`usage:*`/`budget:*`、`extensions:*`/`mcp:*`、`acceptance:*`、`git:read`；见 §10。

### 4.2 协议工具（模型工具面）

| 工具 | 用途 | 关键约束 |
| :--- | :--- | :--- |
| `propose_goal` | 目标确认提议 | `statement` 必填；`assumptions` 可选 |
| `propose_plan` | 方案提议 | `summary` + 非空 `files[{path,reason}]`；goal 未确认 → 硬序拒绝 |
| `report_completion` | 完成声明 | `summary` + 非空 `verification[{command,passed}]`；goal+plan 未确认 → 硬序拒绝 |
| `ask_user` | 会话级澄清 | 任何时点合法；不置决策点；可带 options |

硬约束：数组一层为限；`additionalProperties:false`；`files[].path` 经 `splitPathReason` + `isLikelyPath` 校验。

### 4.3 Provider SSE

- 请求：OpenAI Chat Completions `POST /chat/completions`，`stream:true`，`tools:TOOL_DEFS`，`tool_choice` 由 DeepSeek profile 决定。
- 响应：`data:` 行 JSON；`choices[0].delta` 的 `reasoning_content`/`content`/`tool_calls`；`[DONE]`。
- 累积：tool_calls 按 `index` 拼接 name/arguments；完成后 `toolCallRepair`。
- 重试：400 一次；超时/5xx/网络最多 3 次；已推 delta → `stream-reset`。
- 超时：整段 180s；工具执行 30s/120s/15s。

---

## 5. 安全设计

### 5.1 动作分类（P0-02）

新增危险参数形态（不改变只读白名单的总体结构）：

| 命令 | 只读条件 | 危险形态（→ hazardous） |
| :--- | :--- | :--- |
| `sed` | 无 `-i`/`--in-place` 且脚本不含写命令 | `-i`、`--in-place`、`w` 写文件脚本 |
| `find` | 无 `-exec`/`-delete`/`-fprint`/`-fprintf`/`-ok` | 上述任一 |
| `awk` | 脚本不含 `system(`/`print >`/`printf >` | 上述任一 |
| `sort` | 无 `-o`/`--output` | `-o`、`--output` |
| `git branch` | 无 `-d/-D/-m/-M/-c/-C` | 上述任一（创建/删除/重命名） |
| `git remote` | 仅列出 | `add/remove/rename/set-url` |
| `rg` | 无 `--pre` | `--pre`（执行外部命令） |
| `wget` | 仅 `--spider` 或 `-O-`/`-qO-`（输出到 stdout） | 默认下载写文件、`-O file` |
| `curl` | GET/HEAD 且无写副作用标志 | `-o`（非 /dev/null）、`-O`、`-T`、`-a`、`-C`、`-d`、`-F`、`-X POST/PUT/PATCH/DELETE` |

实现位置：`conversationState.ts` 的 `classifyReadonly`；`tools.ts` 的 `isReadOnlyBash` 消费同源判定。测试：`conversationState.test.ts` 新增“危险参数形态”用例；`tools.test.ts` 新增 `isReadOnlyBash` 回归。

### 5.2 读取边界（P0-01）

- `read` 改为 `requiresApproval: true` + `preApproval`：
  - `rootPath` 存在且 `isInSandbox(path, rootPath)` → auto（根内自动）。
  - 根外/无 rootPath → auto=false → 授权卡。
- `read` 的 ENOENT 分支只在根内列父目录；根外不列。
- 不改变文件整理场景：用户可在授权卡上批准 Downloads 等目录的读取。

### 5.3 系统代跑边界（P0-05）

- `isSystemVerifiable`：`readonly` → true；`network-read` 仅 localhost → true；外网 `network-read` → false（unverifiable，不代跑）。
- `verification.ts` 的 `isSystemVerifiable` 同步。
- 影响：外网 `curl` 证据需要用户自行确认，系统不再自动执行。

### 5.4 Web 访问边界（P1-01）

- `web_fetch` 拒绝：`localhost`、`127.0.0.1`、`::1`、`10.*`、`172.16-31.*`、`192.168.*`、`169.254.*`（含云元数据 169.254.169.254）、`0.0.0.0`。
- 重定向：`redirect: 'manual'`，最多 5 跳，逐跳校验目标 host；非 http/https 拒绝。
- 仅 `web_fetch` 拦截；本地开发可用 `open` 或 `curl localhost`（工具内）。

### 5.5 进程清理（P0-04）

- `killTree(pid)`：`pid <= 0` → no-op。
- `killAllSubprocesses`：过滤 `pid > 0`。
- `recordPid`：只记录 `pid > 0`。
- `serviceManager.stopServer/stopAllServices`：`pid > 0` 才 kill。
- 新增纯函数 `isKillablePid(pid)` 便于测试。

### 5.6 计划清单边界（P0-03）

- 删除 `ConversationPanel.applyChunk` 中 `propose_plan` 分支的 `addPlannedFiles`。
- 删除 done 分支文本方案解析的 `addPlannedFiles`（文本降级不产生决策点，不应形成写边界）。
- 保留 `userDecided(plan, confirm)` 的 `derivePlannedFiles`（唯一派生）。
- 保留 `approve-files` 的 `approvalGranted` 追加。
- 拒绝方案不清空既有 `plannedFiles`（它们来自此前已确认方案/批准）；但被拒方案自身不落清单。

---

## 6. 一致性、事件与 Outbox

### 6.1 已落地与预留

- **已落地（2026-11-14）**：事件版本（`version`）、`eventId`、去重存储、DLQ + 启动重放；代码证据见 `10-code-evidence.md §4`。
- **已落地（2026-11-15）· 轻量 Outbox**：`timelineOutbox.ts` 提供单文件 outbox；`logTimeline` 先将事件入队（`fsync`），再投递会话时间线；投递失败保留待下次/启动重放；`outboxId` 写入事件，重放按幂等跳过；`drainTimelineOutbox()` 接入 `main.ts` 启动流程。
- **预留 · 完整跨存储事务**：轻量 Outbox 只覆盖已进入 `logTimeline` 的事件；renderer transition → IPC → JSONL 的“状态变更”与“事件入队”仍是两个独立动作。若要保证跨存储事务，需要状态存储与事件入队同文件/同事务提交；当前单进程不做。
- **后续可选**：查询按事件版本兼容；完整跨存储事务 Outbox。

### 6.2 一次事务修改一个聚合

- Task 转换只产生新 `ConversationState`；计划清单/交付/问题台账通过事件或 IPC 后续更新。
- 工具执行是独立事务；文件写入前快照，失败/回滚通过补偿。
- 交付包由真实变更重建，不直接写 Task 状态。

---

## 7. 技术决策与权衡

| 决策 | 选择 | 权衡 |
| :--- | :--- | :--- |
| read 边界 | 根内自动 / 根外授权 | 安全 vs 文件整理便利 |
| 只读判定 | 参数级形态 + fail-closed | 安全 vs 误伤合法命令 |
| 计划清单派生 | 只在方案确认时 | 不变量正确性 vs UI 不能提前显示清单（改用决策内容） |
| 系统代跑 | 只读 + localhost 网络只读 | 安全 vs 外网证据不可代跑 |
| web_fetch | 拒私网 + 手动重定向 | 安全 vs 本地文档调试（走 open/curl） |
| pid 清理 | 跳过 <=0 | 安全 vs 可能漏清异常 pid（正常 pid 不受影响） |
| Outbox | 轻量 Outbox 已实现（2026-11-15）；完整跨存储事务不做 | 已发出事件不丢 vs 单进程交付成本 |

---

## 8. 验证计划

1. `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
2. `npx vitest run`
3. `npx eslint .`
4. `npx playwright test --project=interaction`（如环境可用）
5. 新增安全用例：只读绕过、read 根外授权、web_fetch 私网、pid 守卫、计划清单派生时机。
6. 主路径 e2e-sim：`apps/desktop/e2e-sim/*`（按仓库脚本）。

---

## 9. Spec 映射

| Spec | 覆盖 Requirement |
| :--- | :--- |
| `specs/conversation-task/spec.md` | 目标/方案/解决决策、证据核验、循环保护、会话恢复 |
| `specs/execution-trust/spec.md` | 工具授权、只读判定、沙箱/快照、拒绝记忆、进程取消 |
| `specs/workspace-environment/spec.md` | 项目打开/初始化、计划清单、环境/能力、服务生命周期 |
| `specs/delivery-ledger/spec.md` | 交付包、diff 应用/回滚、问题台账 |
| `specs/provider-gateway/spec.md` | 接入方/模型解析、流式重试、tool_call 修复、Key 验证 |
| `specs/session-timeline/spec.md` | 事件注册、状态 diff 派生、append/query、聊天导出 |
| `specs/configuration-secrets/spec.md` | 密钥存储、Provider/Model 配置、Web 访问 |
| `specs/context-retrieval/spec.md` | @mention 注入、CodeRAG、LSP、压缩、预热 |
| `specs/platform-runtime/spec.md` | 生命周期、单实例、进程清理、插件注册表 |
| `specs/change-version/spec.md`（目标态） | 变更集生成/审核/应用冲突/回滚/Git 只读 |
| `specs/task-orchestration/spec.md`（目标态） | 入队/调度/阻塞恢复/取消/视图 |
| `specs/usage-cost/spec.md`（目标态） | 用量记录/成本/预算/汇总/缓存 |
| `specs/extension-integration/spec.md`（目标态） | 扩展注册/生命周期/信任/MCP/Git |
| `specs/acceptance-quality/spec.md`（目标态） | 验收来源/证据/门禁/交付联动 |

---

## 10. 目标领域设计（BC-10～BC-14，均已实现）

> 本节只做架构与契约设计，不改变本轮已落地的运行时代码。实现顺序见 `00-domain-blueprint.md §6`。

### 10.1 变更与版本（BC-10）

```text
write/edit/diff
  → ChangeSetService.propose(rootPath, taskId)
  → 为每个文件记录 baseHash + snapshotRef + afterHash + hunks
  → changeset.proposed
  → 用户审核（DeliveryPanel/变更集 UI）
  → apply(changeId, approved=true)
      → 校验 baseHash；冲突 → changeset.conflict_detected（不写）
      → 原子写（临时文件 + rename）；成功 → changeset.applied
  → revert(changeId)
      → 快照恢复；失败项显式报告
```

- 领域模块：目标态 `domain/changeSet.ts`（纯状态机 + 基线校验谓词）。
- 存储：变更集记录 + 基线快照（沿用 `.nf-bak` 可升级为内容寻址快照）。
- 与交付：`DeliveryPackage` 引用 `ChangeSet` 摘要，不再自行猜测 diff。
- Git：只读 `status/diff/log` 经 BC-13 扩展；写操作走 BC-02 授权。

### 10.2 任务编排（BC-11）

```text
用户加入任务 → queue.enqueue(taskRef)
  → 调度器读取 Task 状态事件（BC-01）
  → 无 running 且队列非空 → start 队首
  → Task 进入 pending/needApproval → queue.entry_blocked
  → 用户决策 → Task 恢复 → queue.entry_started
  → Task 完成/失败/取消 → queue.entry_completed
```

- 领域模块：`domain/taskQueue.ts`（队列状态机；不复制 Task 状态）。
- 调度：main `taskQueueStore`（单活跃 + 持久化）；renderer TaskPanel 发起启动/暂停/恢复；授权等待自动 blocked。
- 持久化：队列条目 + 断点；重启后 running → blocked（`recoverInterruptedTasks`，等用户确认，不自动续跑）。
- 与 BC-01：只消费 Task 事件，不反向修改任务确认位。

### 10.3 用量与成本（BC-12）

```text
gateway stream done
  → 解析响应 usage（prompt/completion/reasoning tokens）
  → UsageLedger.record(provider, model, tokens, cacheOutcome, taskId)
  → 价格表（版本化）→ cost / unknown
  → usage.recorded → UI/汇总/预算
```

- gateway 改动：流结束时读取 `usage` 字段（OpenAI 兼容响应或最终 SSE chunk）；缺失时 `unknown`。
- 领域模块：目标态 `domain/usageLedger.ts`（计量与成本谓词）。
- 存储：append-only JSONL 或本机 DB；导出脱敏。
- 缓存：预热的 prefix cache 命中作为 `cacheOutcome`，与 token 计量分开。

### 10.4 扩展与集成（BC-13）

```text
PluginRegistry.register(descriptor)
  → Extension 生命周期（init/activate/deactivate）
  → 外部能力（MCP/Git）→ CapabilityDescriptor
  → 调用 → BC-02 ToolRegistry（风险分级/授权/沙箱）
```

- 领域模块：目标态 `domain/extension.ts`（注册/生命周期/信任谓词）。
- MCP：目标态 `main/mcpClient.ts`；拉取工具清单，映射为能力描述。
- Git：只读命令映射；写操作必须 approved。
- 安全：扩展不得直接获得 fs/process/network 权限；统一经 BC-02。

### 10.5 验收与质量门禁（BC-14）

```text
方案确认（verificationPlan）/ 用户 DoD
  → AcceptanceRecord.derive(source)
  → 完成证据 / 系统代跑结果 / 手工确认
  → attachEvidence → markPassed / waive
  → evaluateGate → passed / failed / incomplete / passed-with-waivers
  → 交付包展示；关闭问题前置
```

- 领域模块：目标态 `domain/acceptance.ts`（验收项状态机 + 门禁谓词）。
- 与完成证据：证据回答“是否做到”，验收回答“按什么标准算做到”；两者不互相替代。
- 与交付：`DeliveryPackage.acceptance` 由 AcceptanceRecord 填充；无来源时显式为空。
- 演示隔离：`DoDAlignPanel` / `DigitalDeliveryPanel` 仅 demo bridge 可达，生产路径不得注入。
