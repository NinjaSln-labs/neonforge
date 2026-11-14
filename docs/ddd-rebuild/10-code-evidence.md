# 10 · 代码证据索引

> 目的：保证 `01–09` 的每条“现状”断言都可回溯到源码位置。
> 行号基于 `5c54924a5c91c543166a6636f023006a3f498b9e`（2026-09-30）；修正落地后以当前文件为准。
> 路径缩写：`R/` = `apps/desktop/src/renderer/`，`M/` = `apps/desktop/src/main/`，`D/` = `apps/desktop/src/domain/`。

---

## 1. 聚合与不变量

| 文档断言 | 证据 |
| :--- | :--- |
| Task 聚合类型与 18 个状态字段 | `D/conversationState.ts:18-126` |
| 决策点种类 `goal/plan/approval/resolution/system_clarify` | `D/conversationState.ts:18-60`、`D/conversationState.ts:649-677`（`deriveDecisionPoint`） |
| 单 PENDING 不变量 | `D/conversationState.ts:303-316`（`setPending`） |
| 用户确认 → 任务边界重置（清计划清单/产出/批准/拒绝记忆） | `D/conversationState.ts:149-223`（`userDecided`） |
| 拒绝必须带原因 | `D/conversationState.ts:262-283`（`approvalDecided`） |
| 方案确认派生计划清单（唯一派生点） | `D/conversationState.ts:831-840`（`derivePlannedFiles`）、`783-798`（`deriveDiffs`/`matchesPlannedPath`） |
| 完成核验汇总（证据 + 计划产出） | `D/conversationState.ts:729-775`（`verifyCompletion`） |
| 证据回填与缺失项 | `D/conversationState.ts:804-823`（`buildEvidenceBackfill`） |
| 进展保证与计划完成判定 | `D/conversationState.ts:860-898` |
| 结构化方案/完成声明消费标记 | `D/conversationState.ts:902-919` |
| 停止续聊判定 | `D/conversationState.ts:953-958`（`shouldStopContinuation`） |
| 停滞检测与引导注入 | `D/agentLoop.ts:183-250`（`detectStuck`）、`254-325`（nudges） |
| 回合进展评估与强制工具 | `D/agentLoop.ts:118-180`（`evaluateTurnProgress`）、`D/agentLoop.ts:24-44`（`TurnProgress`） |
| 确认意图识别（文本降级） | `D/agentLoop.ts:54-78`（`isConfirmIntent`） |
| 目标兜底触发 | `D/agentLoop.ts:358-368`（`goalFallbackTrigger`） |

## 2. 门控与动作属性

| 文档断言 | 证据 |
| :--- | :--- |
| 只读命令白名单与命令链递归 | `D/conversationState.ts:353-456`（`BASH_READONLY_HEADS`、`classifyReadonly`） |
| 只读判定入口（供 main 消费） | `D/conversationState.ts:409-457`（`classifyReadonly`） |
| 副作用动作判定 | `D/conversationState.ts:476-481`（`isSideEffectAction`） |
| 会话级门控（pending/goal） | `D/conversationState.ts:497-534`（`sessionGate`） |
| 动作级门控（plan/trust/delegate） | `D/conversationState.ts:556-600`（`actionGate`） |
| 可执行判定 | `D/conversationState.ts:605-635`（`canExecute`） |
| 系统可代跑判定（当前实现接受 network-read） | `D/conversationState.ts:681-685`（`isSystemVerifiable`） |
| 主进程只读命令判定 | `M/tools.ts:482-487`（`isReadOnlyBash`） |
| bash 工具的预授权调用 | `M/tools.ts:585-592`（`bash` 注册，`preApproval`） |
| 工具风险分级 | `M/tools.ts:32-69`（`ToolRisk`、规则、`isInSandbox`） |
| 工具注册与执行 | `M/tools.ts:71-196`（`Tool`、`ToolRegistry.execute`） |
| 路径解析（绝对路径直接返回） | `M/tools.ts:199-210`（`resolvePath`） |
| 读工具当前免授权 | `M/tools.ts:560-570`（`read` 注册 `requiresApproval:false`） |
| 写/编辑工具与快照 | `M/tools.ts:212-261`、`M/tools.ts:571-577` |
| 进程树清理（`pid ?? 0`） | `M/tools.ts:288-323`（`killTree`/`killAllSubprocesses`） |
| 活动命令取消 | `M/tools.ts:464-475`（`cancelActiveCommand`） |
| 打开 URL 白名单 | `M/tools.ts:491-533`（`resolveOpenUrl`） |
| 服务停止（`process.kill(-pid)`） | `M/serviceManager.ts:254-286` |
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
| 事件类型联合与注册表 | `D/timeline.ts:20-92`（`TimelineEventType`）、`116-233`（`TIMELINE_EVENT_SPECS`） |
| 状态差异派生 | `D/timeline.ts:260-335`（`deriveStateEvents`） |
| 去重键 | `D/timeline.ts:351-353`（`dedupeKey`） |
| 方案提议检测 | `D/timeline.ts:358-376`（`detectProposed`） |
| JSONL 追加（`seq` 单调、失败静默） | `M/timelineLogger.ts:55-77` |
| 时间线通道 | `M/ipc.ts`（`timeline:log`、`timeline:query`） |

## 5. 应用层编排（renderer）

| 文档断言 | 证据 |
| :--- | :--- |
| 完成核验 → 解决确认 | `R/ConversationPanel.tsx:733-792`（`verifyThenResolve`） |
| 流式增量处理（含 `propose_plan` 提前 `addPlannedFiles`） | `R/ConversationPanel.tsx:793-...`、`880-883` |
| done 分支文本方案降级（提前 `addPlannedFiles`） | `R/ConversationPanel.tsx:1145-1153` |
| 续聊与最大轮次 | `R/ConversationPanel.tsx:1689-1834`（`maybeContinue`） |
| 主回合（历史组装、压缩、互斥） | `R/ConversationPanel.tsx:1837-2075`（`runChat`） |
| 历史构建（结构化 tool_calls/tool 消息） | `R/ConversationPanel.tsx:2083-...`（`buildHistory`） |
| 发送入口与 pending 文本意图 | `R/ConversationPanel.tsx:2242-2428`（`send`） |
| 错误收口 | `R/ConversationPanel.tsx:2472-2516`（`finishError`） |
| 演示数据门控 | `R/ConversationPanel.tsx:2555-2576` |
| 信任集合追加 | `R/ConversationPanel.tsx:2170-2180`（`addTrust`） |
| 会话状态 hook | `R/useConversationState.ts`（`transition`/`stateRef`） |
| 工具授权卡状态机 | `R/useToolApproval.ts` |
| 问题台账 7 态与迁移 | `R/problemStore.ts` |

## 6. 主进程与基础设施

| 文档断言 | 证据 |
| :--- | :--- |
| IPC 通道全集 | `M/ipc.ts:...`（`config:*`、`gateway:*`、`delivery:*`、`workspace:*`、`chat:*`、`timeline:*`、`tools:*`、`planned-files:*`、`session:plan-confirmed`、`context:resolve`、`rag:search`、`plugins:*`、`preheat:status`、`compaction:compact`、`completion:verify`） |
| 预加载桥接 API | `P/preload.ts`（`NeonForgeBridge`） |
| 计划清单持久化（0600） | `M/plannedFilesStore.ts` |
| 项目初始化（不覆盖已有目录） | `M/projectInit.ts` |
| 环境检测 | `M/envManager.ts` |
| 服务与端口 | `M/serviceManager.ts` |
| 完成核验代跑 | `M/verification.ts:9-13`（`isSystemVerifiable`） |
| Web 访问（当前无私网拦截） | `M/webTools.ts:260-296`（`web_fetch`） |
| 配置存储（safeStorage + 明文 fallback） | `M/configStore.ts` |
| 插件注册表 | `M/pluginSystem.ts` |
| 网关（SSE/重试/工具修复） | `M/gateway.ts:35-84`（错误分类）、`103-128`（`toolCallRepair`）、`559-747`（`streamChatOnce`） |
| 模型刷新与 Key 验证 | `M/gateway.ts:436-554` |
| 预热与摘要 | `M/gateway.ts:750-831` |
| 上下文/检索/压缩 | `M/context.ts`、`M/codeRag.ts`、`M/lsp.ts`、`M/compact.ts`、`M/preheat.ts` |
| 应用生命周期 | `M/main.ts` |
| diff 应用 | `M/applyDiff.ts` |

## 7. 测试证据

| 覆盖 | 证据 |
| :--- | :--- |
| Task 聚合与不变量 | `apps/desktop/tests/unit/conversationState.test.ts`（1392 行） |
| 进展/停滞 | `tests/unit/agentLoop.test.ts` |
| 工具与授权 | `tests/unit/tools.test.ts`、`tests/unit/permissionRules.test.ts` |
| 完成核验 | `tests/unit/verifyCompletionSystem.test.ts` |
| 硬序门 | `tests/unit/hardOrderGate.test.ts` |
| 进展保证 | `tests/unit/progressGuarantee.test.ts` |
| 动作承诺 | `tests/unit/actionPromise.test.ts` |
| 计划清单存储 | `tests/unit/plannedFilesStore.test.ts` |
| 主路径 e2e-sim | `apps/desktop/e2e-sim/journey.mjs`、`signals.mjs`、`decide.mjs`、`convergence.mjs` |
| 本轮安全修正 | `conversationState.test.ts`（危险参数形态）、`tools.test.ts`（read 边界/pid 守卫）、`verifyCompletionSystem.test.ts`（外网证据）、`webTools.test.ts`（SSRF/重定向） |

---

## 8. 目标态领域证据（占位 / 字段 / 演示）

> 这些证据证明“产品应该有这样的领域”，但当前不是完整实现；对应目标态设计见 `00-domain-blueprint.md`。

| 目标领域 | 证据 | 说明 |
| :--- | :--- | :--- |
| BC-10 变更与版本 | 历史证据：`M/applyDiff.ts`（snapshot/revert）、`M/ipc.ts`（`delivery:apply-diff/revert-diff`）、`R/DeliveryPanel.tsx`（审核 UI）；实现：`domain/changeSet.ts`、`main/changeSetService.ts`、`main/gitBridge.ts`、`ipc.ts` `changeset:*`/`git:read` | 已落地（2026-11-14）：变更集状态机 + 基线哈希 + 冲突回滚 |
| BC-11 任务编排 | 历史证据：`R/MainWorkspace.tsx` TaskPanel 占位；实现：`domain/taskQueue.ts`、`main/taskQueueStore.ts`、`ipc.ts` `queue:*`、TaskPanel 队列 UI | 已落地（2026-11-14）：单活跃队列 + 暂停/恢复/重排 + 授权阻塞同步 |
| BC-12 用量与成本 | 历史证据：TaskPanel“本轮用量”仅前缀缓存、`M/gateway.ts` 未解析 usage；实现：`domain/usageLedger.ts`、`main/usageStore.ts`、`main/budgetStore.ts`、`gateway.ts` usage 解析、`ipc.ts` `usage:*`/`budget:*` | 已落地（2026-11-14）：token/成本/缓存口径 + append-only 台账 + 预算提醒/暂停 |
| BC-13 扩展与集成 | 历史证据：`M/pluginSystem.ts:19-25`（`mcp-bridge`/`git`/`stats` 占位）、`M/ipc.ts` `plugins:*`；实现：`domain/extension.ts`、`main/pluginSystem.ts`、`main/mcpClient.ts`、`main/mcpConfig.ts`、`main/mcpManager.ts`、`main/gitBridge.ts`、`ipc.ts` `extensions:*`/`mcp:*`/`git:read` | 已落地（2026-11-14）：注册/信任/生命周期 + MCP stdio + Git 只读桥 |
| BC-14 验收与质量门禁 | 历史证据：`R/DeliveryPanel.tsx`（验收勾选）、`R/DoDAlignPanel.tsx:9-13`（演示）、`D/conversationState.ts` 的 `PlanProposal.verificationPlan`；实现：`domain/acceptance.ts`、`main/acceptanceStore.ts`、`ipc.ts` `acceptance:*`、`DeliveryPanel.tsx` 门禁 | 已落地（2026-11-14）：来源派生 + 证据/豁免 + 门禁判定 |
| 演示面板（非目标域） | `R/DigitalDeliveryPanel.tsx:14-67`、`R/DoDAlignPanel.tsx`、`R/TrustLadderPanel.tsx` | 仅 demo bridge 可达；生产路径不得注入 |
| 场景卡（产品内容） | `R/scenes.tsx:1`、`R/StartPage.tsx:4`、`R/ConversationPanel.tsx:82` | 不构成业务领域 |

---

## 使用规则

1. 引用本文时优先给出 `文件:行`；行号漂移以符号名（括号内）为准。
2. 修正落地后，若行为改变，必须同步更新对应 `06/08/09` 文档与本文行号。
3. 本文只记录“代码事实”，不重复 `06-aggregates.md` 的模型叙述。
