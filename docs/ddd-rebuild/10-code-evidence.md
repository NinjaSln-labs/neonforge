# 10 · 代码证据索引

> 目的：保证 `01–09` 的每条“现状”断言都可回溯到源码位置。
> 行号按 2026-11-15 当前文件刷新（审查修复与格式化之后）；若行号漂移，以括号内符号名为准。
> 路径缩写：`R/` = `apps/desktop/src/renderer/`，`M/` = `apps/desktop/src/main/`，`D/` = `apps/desktop/src/domain/`。

---

## 1. 聚合与不变量

| 文档断言 | 证据 |
| :--- | :--- |
| Task 聚合类型与 18 个状态字段 | `D/conversationState.ts:111-129`（`ConversationState`、`TaskState`） |
| 决策点种类 `goal/plan/approval/resolution/system_clarify` | `D/conversationState.ts:89`（`DecisionKind`）、`D/conversationState.ts:748-776`（`deriveDecisionPoint`） |
| 单 PENDING 不变量 | `D/conversationState.ts:306-319`（`setPending`） |
| 用户确认 → 任务边界重置（清计划清单/产出/批准/拒绝记忆） | `D/conversationState.ts:152-226`（`userDecided`） |
| 拒绝必须带原因 | `D/conversationState.ts:265-286`（`approvalDecided`） |
| 方案确认派生计划清单（唯一派生点） | `D/conversationState.ts:945-951`（`derivePlannedFiles`）、`884-909`（`deriveDiffs`/`matchesPlannedPath`） |
| 完成核验汇总（证据 + 计划产出） | `D/conversationState.ts:830-876`（`verifyCompletion`） |
| 证据回填与缺失项 | `D/conversationState.ts:915-934`（`buildEvidenceBackfill`） |
| 进展保证与计划完成判定 | `D/conversationState.ts:971-1003`（`decideProgressGuarantee`）、`1004-1009`（`plannedComplete`） |
| 结构化方案/完成声明消费标记 | `D/conversationState.ts:1013-1034`（`isStructuredProposal`/`isConsumedProposal`） |
| 停止续聊判定 | `D/conversationState.ts:1064-1069`（`shouldStopContinuation`） |
| 停滞检测与引导注入 | `D/agentLoop.ts:208-259`（`detectStuck`）、`263-334`（nudges） |
| 回合进展评估与强制工具 | `D/agentLoop.ts:127-189`（`evaluateTurnProgress`）、`D/agentLoop.ts:24-44`（`TurnProgress`） |
| 确认意图识别（文本降级） | `D/agentLoop.ts:54-78`（`isConfirmIntent`）、`84-87`（`isApprovalIntent`） |
| 目标兜底触发 | `D/agentLoop.ts:367-377`（`goalFallbackTrigger`） |

## 2. 门控与动作属性

| 文档断言 | 证据 |
| :--- | :--- |
| 只读命令白名单与命令链递归 | `D/conversationState.ts:356-472`（`BASH_READONLY_HEADS`、危险参数形态） |
| 只读判定入口（供 main 消费） | `D/conversationState.ts:473-532`（`classifyReadonly`） |
| 副作用动作判定 | `D/conversationState.ts:551-556`（`isSideEffectAction`） |
| 会话级门控（pending/goal） | `D/conversationState.ts:572-609`（`sessionGate`） |
| 动作级门控（plan/trust/delegate） | `D/conversationState.ts:655-699`（`actionGate`） |
| 可执行判定 | `D/conversationState.ts:704-734`（`canExecute`） |
| 系统可代跑判定（当前实现接受 network-read） | `D/conversationState.ts:782-786`（`isSystemVerifiable`） |
| 主进程只读命令判定 | `M/tools.ts:601-606`（`isReadOnlyBash`） |
| 权限规则裁决与持久化（BC-02） | `M/tools.ts`（`canonicalRuleArg`/`matchesRule`/`selectRule`：deny > allow > ask、真实字段匹配、路径归一、bash 链守卫、ask 来源校验）、`M/permissionRulesStore.ts`（校验/0600/原子写/单条容错）、`M/ipc.ts`（`permissions:list`/`permissions:set`）、`P/preload.ts`（`permissions`）、`R/SettingsPanel.tsx`（规则编辑/保存串行化）、`R/useChatStream.ts`/`useToolApproval.ts`（auto/user 来源） |
| bash 工具的预授权调用 | `M/tools.ts:709-716`（`bash` 注册，`preApproval`） |
| 工具风险分级 | `M/tools.ts:37-140`（`ToolRisk`、规则、`isInSandbox`） |
| 工具注册与执行 | `M/tools.ts:141-280`（`Tool`、`ToolRegistry.execute`） |
| 路径解析（绝对路径直接返回） | `M/tools.ts:283-294`（`resolvePath`） |
| 读工具当前需授权（根内预授权） | `M/tools.ts:685-694`（`read` 注册 `requiresApproval:true` + `preApproval`） |
| 写/编辑工具与快照 | `M/tools.ts:341-362`（`writeExecutor`）、`363-...`（`editExecutor`）、`695-708`（注册） |
| 进程树清理（`pid ?? 0`） | `M/tools.ts:406-442`（`killTree`/`killAllSubprocesses`） |
| 活动命令取消 | `M/tools.ts:583-594`（`cancelActiveCommand`） |
| 打开 URL 白名单 | `M/tools.ts:610-627`（`resolveOpenUrl`） |
| 服务停止（`process.kill(-pid)`） | `M/serviceManager.ts:255-286`（`stopServer`/`stopAllServices`） |
| 沙箱路径规范化 | `D/sandboxPath.ts:13-25`（`resolveSandboxPath`） |

## 3. 协议工具与解析

| 文档断言 | 证据 |
| :--- | :--- |
| 协议工具定义（goal/plan/completion/ask_user） | `D/protocolTools.ts:68-186`（`PROTOCOL_TOOL_DEFS`） |
| 参数校验（一层数组、路径形态） | `D/protocolTools.ts:225-319`（`validate`） |
| 决策分派（setPending/clarify/reject/invalid） | `D/protocolTools.ts:381-478`（`decide`） |
| 方案解析（summary + files） | `D/planProposalParser.ts`（`parsePlanProposal`） |
| 完成声明解析（verification 非空） | `D/completionClaimParser.ts`（`parseCompletionClaim`） |
| 文本完成声明降级解析 | `D/completionClaimParser.ts`（`parseTextCompletionClaim`） |

## 4. 时间线

| 文档断言 | 证据 |
| :--- | :--- |
| 事件类型联合与注册表 | `D/timeline.ts:24-133`（`TimelineEventType`）、`162-367`（`TIMELINE_EVENT_SPECS`） |
| 状态差异派生 | `D/timeline.ts:394-469`（`deriveStateEvents`） |
| 去重键 | `D/timeline.ts:485-487`（`dedupeKey`） |
| 方案提议检测 | `D/timeline.ts:492-509`（`detectProposed`） |
| JSONL 追加（`seq` 单调、eventId/version、失败可见 + DLQ） | `M/timelineLogger.ts`（`logTimeline`）、`M/timelineLogger.ts`（`drainTimelineDlq`） |
| 轻量 Outbox（P1-02） | `M/timelineOutbox.ts`（`TimelineOutbox.enqueue`/`drain`、fsync 追加与压缩、targetFile）、`M/timelineLogger.ts`（`drainTimelineOutbox`/`appendTimelineEvent`/`appendTimelineLine`/`logTimeline` 返回投递状态）、`D/timeline.ts`（`TimelineEvent.outboxId`） |
| 跨存储事务性 Outbox（P1-02） | `M/stateTransaction.ts`（`StateTransactionLog.commit/drain/latestWriteContent`：WAL 状态+事件、原子写、FIFO 重放、确定性 outboxId、未完成尾行恢复、读取优先取已提交意图）、`M/stateTransaction.instance.ts`、`M/acceptanceStore.ts`、`M/taskQueueStore.ts`、`M/changeSetService.ts`（状态+基线+事件同事务）、`M/main.ts`（单实例锁后重放） |
| 时间线通道 | `M/ipc.ts`（`timeline:log`、`timeline:query`） |

## 5. 应用层编排（renderer）

| 文档断言 | 证据 |
| :--- | :--- |
| 完成核验 → 解决确认 | `R/useEvidenceVerification.ts:36-...`（`useEvidenceVerification`）、`:61-...`（发起 sid 捕获） |
| 流式增量处理（`propose_plan`/done 分支均不再写 plannedFiles——P0-03） | `R/useChatStream.ts:82-...`（`createApplyChunk`） |
| done 分支文本方案降级（降级引导，不落清单） | `R/useChatStream.ts`（`createApplyChunk` done 分支） |
| 续聊与最大轮次 | `R/useChatEngine.ts:150-...`（`maybeContinue`） |
| 主回合（历史组装、压缩、互斥） | `R/useChatEngine.ts:294-...`（`runChat`） |
| 历史构建（结构化 tool_calls/tool 消息） | `R/conversationHistory.ts:13-...`（`buildHistory`） |
| 发送入口与 pending 文本意图 | `R/useChatEngine.ts:580-...`（`send`） |
| 错误收口（含 auto-retry 与 sid 归属） | `R/useChatEngine.ts:794-...`（`finishError`） |
| 演示数据门控 | `R/ConversationPanel.tsx:635-651`（`getDemoBridge`/`demoDigital`） |
| 信任集合追加 | `R/ConversationPanel.tsx:563-...`（`addTrust`） |
| 会话状态 hook | `R/useConversationState.ts`（`transition`/`stateRef`） |
| 工具授权卡状态机 | `R/useToolApproval.ts` |
| 问题台账 7 态与迁移 | `R/problemStore.ts` |

## 6. 主进程与基础设施

| 文档断言 | 证据 |
| :--- | :--- |
| IPC 通道全集 | `M/ipc.ts:...`（`config:*`、`gateway:*`、`delivery:*`、`workspace:*`、`chat:*`、`timeline:*`、`tools:*`、`planned-files:*`、`session:plan-confirmed`、`context:resolve`、`rag:search`、`plugins:*`、`preheat:status`、`compaction:compact`、`completion:verify`） |
| IPC 运行时契约校验（P1-04） | `M/ipcSchema.ts:100-382`（`validateIpc`/`IPC_SCHEMAS`）、`M/ipc.ts`（tools/stream/config/queue/acceptance/changeset/delivery/context/workspace/gateway/chat/timeline 等入口）、`tests/unit/ipcSchema.test.ts` |
| 预加载桥接 API | `P/preload.ts`（`NeonForgeBridge`） |
| 计划清单持久化（0600） | `M/plannedFilesStore.ts` |
| 项目初始化（不覆盖已有目录） | `M/projectInit.ts` |
| 环境检测 | `M/envManager.ts` |
| 服务与端口 | `M/serviceManager.ts` |
| 完成核验代跑 | `M/verification.ts:15-61`（`VerificationResult`/`runOne`）、`D/conversationState.ts:782-786`（`isSystemVerifiable`） |
| Web 访问（私网/云元数据拦截 + 手动逐跳重定向校验） | `M/webTools.ts`（`web_fetch`） |
| 配置存储（env/凭据文件优先 + safeStorage；明文 fallback 显式 opt-in） | `M/configStore.ts` |
| 插件注册表 | `M/pluginSystem.ts:79-282`（`PluginRegistry`）、`286-337`（`BUILTIN_EXTENSIONS`） |
| 网关（SSE/重试/工具修复） | `M/gateway.ts:35-46`（错误类型）、`117-124`（`classifyGatewayError`）、`143-168`（`toolCallRepair`）、`674-841`（`streamChatOnce`） |
| 模型刷新与 Key 验证 | `M/gateway.ts:515-567`（`refreshModels`）、`586-636`（`validateKey`） |
| 预热与摘要 | `M/gateway.ts:843-880`（`preheat`）、`882-925`（`summarize`） |
| 上下文/检索/压缩 | `M/context.ts`、`M/codeRag.ts`、`M/lsp.ts`、`M/compact.ts`、`M/preheat.ts` |
| 应用生命周期 | `M/main.ts` |
| diff 应用 | `M/applyDiff.ts` |

## 7. 测试证据

| 覆盖 | 证据 |
| :--- | :--- |
| Task 聚合与不变量 | `apps/desktop/tests/unit/conversationState.test.ts`（1447 行） |
| 进展/停滞 | `tests/unit/agentLoop.test.ts` |
| 工具与授权 | `tests/unit/tools.test.ts`、`tests/unit/permissionRules.test.ts`、`tests/unit/permissionRulesStore.test.ts` |
| 完成核验 | `tests/unit/verifyCompletionSystem.test.ts` |
| 硬序门 | `tests/unit/hardOrderGate.test.ts` |
| 进展保证 | `tests/unit/progressGuarantee.test.ts` |
| 动作承诺 | `tests/unit/actionPromise.test.ts` |
| 计划清单存储 | `tests/unit/plannedFilesStore.test.ts` |
| IPC 运行时契约 / 通道漂移 | `tests/unit/ipcSchema.test.ts`、`tests/unit/ipcContractParity.test.ts` |
| 交互回归（重试上下文/排队 FIFO/停止回填/启动重试） | `tests/interaction/retry.interaction.ts`、`tests/interaction/queue.interaction.ts`、`tests/interaction/scenarios.ts`（`gotoStart`） |
| 轻量 Outbox | `tests/unit/timelineOutbox.test.ts`（入队/FIFO/失败保留/幂等/半行/读取失败/目标文件）+ `tests/unit/timelineLogger.test.ts`（重放/重启 seq 续接/崩溃窗口幂等/跨午夜/索引重试/旧 DLQ 兼容） |
| 跨存储事务性 Outbox | `tests/unit/stateTransaction.test.ts`（提交/失败保留/重放/FIFO/损坏 WAL）+ `tests/unit/acceptanceStore.test.ts`/`taskQueueStore.test.ts`/`changeSetService.test.ts`（commit 回调：状态+基线+事件同事务） |
| 主路径 e2e-sim | `apps/desktop/e2e-sim/journey.mjs`、`signals.mjs`、`decide.mjs`、`convergence.mjs` |
| 本轮安全修正 | `conversationState.test.ts`（危险参数形态）、`tools.test.ts`（read 边界/pid 守卫）、`verifyCompletionSystem.test.ts`（外网证据）、`webTools.test.ts`（SSRF/重定向） |

---

## 8. 目标态领域证据（推导来源与实现锚点）

> 这些证据记录目标领域的推导来源（占位/字段/演示）与实现锚点；BC-10～BC-14 已于 2026-11-14 全部落地。

| 目标领域 | 证据 | 说明 |
| :--- | :--- | :--- |
| BC-10 变更与版本 | 历史证据：`M/applyDiff.ts`（snapshot/revert）、`M/ipc.ts`（`delivery:apply-diff/revert-diff`）、`R/DeliveryPanel.tsx`（审核 UI）；实现：`domain/changeSet.ts`、`main/changeSetService.ts`、`main/gitBridge.ts`、`ipc.ts` `changeset:*`/`git:read` | 已落地（2026-11-14）：变更集状态机 + 自有基线（多次写入回滚到首次基线，快照缺失时不误删原文件）+ 冲突回滚 |
| BC-11 任务编排 | 历史证据：`R/MainWorkspace.tsx` TaskPanel 占位；实现：`domain/taskQueue.ts`、`main/taskQueueStore.ts`、`ipc.ts` `queue:*`、TaskPanel 队列 UI | 已落地（2026-11-14）：单活跃队列 + 暂停/恢复/重排 + 授权阻塞同步；授权拒绝不自动恢复 |
| BC-12 用量与成本 | 历史证据：TaskPanel“本轮用量”仅前缀缓存、`M/gateway.ts` 未解析 usage；实现：`domain/usageLedger.ts`、`main/usageStore.ts`、`main/budgetStore.ts`、`main/priceStore.ts`、`gateway.ts` usage 解析、`ipc.ts` `usage:*`/`budget:*`/`pricing:*` | 已落地（2026-11-14）：token/成本/缓存口径 + append-only 台账 + 月度预算 + 本机价格表（未配置时成本为 unknown） |
| BC-13 扩展与集成 | 历史证据：`M/pluginSystem.ts`（`BUILTIN_EXTENSIONS`，原 `mcp-bridge`/`git`/`stats` 占位）、`M/ipc.ts` `plugins:*`；实现：`domain/extension.ts`、`main/pluginSystem.ts`、`main/mcpClient.ts`、`main/mcpConfig.ts`、`main/mcpManager.ts`、`main/gitBridge.ts`、`ipc.ts` `extensions:*`/`mcp:*`/`git:read` | 已落地（2026-11-14）：注册/信任/生命周期 + MCP stdio（UTF-8 分片安全）+ 应用退出清理 MCP 进程 + Git 只读桥 |
| BC-14 验收与质量门禁 | 历史证据：`R/DeliveryPanel.tsx`（验收勾选）、`R/DoDAlignPanel.tsx`（演示）、`D/conversationState.ts` 的 `PlanProposal.verificationPlan`；实现：`domain/acceptance.ts`、`main/acceptanceStore.ts`、`ipc.ts` `acceptance:*`、`DeliveryPanel.tsx` 门禁 | 已落地（2026-11-14）：来源派生 + 证据/豁免 + 门禁判定 |
| 演示面板（非目标域） | `R/DigitalDeliveryPanel.tsx`、`R/DoDAlignPanel.tsx`、`R/TrustLadderPanel.tsx` | 仅 demo bridge 可达；生产路径不得注入 |
| 场景卡（产品内容） | `R/scenes.tsx`、`R/StartPage.tsx`、`R/ConversationPanel.tsx` | 不构成业务领域 |

---

## 9. 代码审查修复证据（2026-11-15）

> 审查范围 `a524c4c..HEAD`；行为变更与不变量见 `09-openspec/tasks.md §7`。

| 断言 | 证据 |
| :--- | :--- |
| 批准文本只认精确批准词（否定句不触发） | `D/agentLoop.ts:84-87`（`isApprovalIntent`） |
| 停止后旧流 chunk 仍被丢弃（sid 归属） | `R/useChatEngine.ts:536-...`（`stopGeneration`） |
| 失败回合重试重放本回合上下文 | `R/useChatEngine.ts:294-...`（`runChat` 请求前记录 `chatRef`）、`850-...`（`retryFailedTurn`） |
| 排队衔接多槽 FIFO + 停止回填输入框 | `R/useChatEngine.ts:536-...`/`570-...`/`580-...` |
| 工具结果/拦截按稳定 id 绑定（迟到的结果不丢） | `R/useChatStream.ts:718-...`（`isThisCall`）、`:944-959`（全消息定位） |
| ask_user「已回复」按消息位置判定（内层 toolCalls 索引不遮蔽） | `R/ConversationPanel.tsx:1018-...`（`messages.indexOf(m)`） |
| 目标卡空值回退（不再写空标题） | `R/ConversationPanel.tsx:855-859`（`statement || initialPrompt || …`） |
| 异步对账按发起 sid 归属 | `R/useEvidenceVerification.ts:61-...`（`sid` 捕获/校验） |
| 一次性自动续跑不被排队消息空耗 | `R/useChatEngine.ts:794-...`（`finishError`） |
| Web Key 来源标注 / IPC 脱敏 / opt-in 明文副本 | `M/configStore.ts:31-...`（source helper）、`:294-...`（`getWebAccess`）、`:329-...`（`setWebAccess`）、`M/ipc.ts:68-...`（`webAccessView`） |
| 设置页仅提交用户编辑过的 Web Key | `R/SettingsPanel.tsx:204-...`（dirty 标记与 patch 组装） |
| Key 失效时 env/文件优先级提示 | `R/useChatEngine.ts:794-...`、`R/ConfigPage.tsx`（来源提示 + 保存后校验） |
| 启动导航本身也重试 | `tests/interaction/scenarios.ts:211-225`（`gotoStart`） |

---

## 使用规则

1. 引用本文时优先给出 `文件:行`；行号漂移以符号名（括号内）为准。
2. 修正落地后，若行为改变，必须同步更新对应 `06/08/09` 文档与本文行号。
3. 本文只记录“代码事实”，不重复 `06-aggregates.md` 的模型叙述。
