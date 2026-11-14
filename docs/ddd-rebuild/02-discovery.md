# 02 · 领域发现（DDD Discover）

> 阶段：发现 / Discover
> 方法：以代码为事实来源做 **brownfield 事件风暴**——从用户命令、模型工具调用、状态转换、测试不变量中还原“已经发生的事实”
> 关键输入：`domain/conversationState.ts`、`domain/timeline.ts`、`domain/protocolTools.ts`、`main/tools.ts`、`main/gateway.ts`、`renderer/ConversationPanel.tsx`、`tests/unit/conversationState.test.ts`
> 行号说明：本文 `文件:行` 为初始分析时点引用；当前权威行号索引见 `10-code-evidence.md`。

---

## 1. 事件流

### 1.1 主路径（一次成功交付）

| 序号 | 事件（过去时） | 触发命令 | 参与者 | 输入 / 输出 | 异常分支 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| E01 | `ProblemCreated` 问题已创建 | 用户发送首个问题 | 用户、问题台账 | 输入：自然语言文本；输出：`ProblemInstance`（status=executing，snapshot.goal=首句） | 同标题已存在 → `ProblemRerun`（更新原实例，不新增） |
| E02 | `ProjectOpened` / `ProjectInitialized` 项目已打开或初始化 | 打开已有项目 / 从零开始 | 用户、工作区 | 输入：目录或标题；输出：rootPath、README、`.neonforge` 骨架 | 同名目录已存在 → 自动加序号；初始化失败 → 错误提示 |
| E03 | `ConversationMessageSent` 用户消息已发送 | 输入框发送 / 候选点选 / 系统引导（silent） | 用户、系统 | 输入：文本、@mention、`.neonforge`；输出：消息入列 + 历史组装 | `working` 中非 silent → 排队；silent → 打断当前轮 |
| E04 | `AssistantTurnStarted` 搭档回合已开始 | `streamChat` 请求 | 搭档、Provider | 输入：system prompt、环境快照、批准清单、历史；输出：SSE 流 | provider 错误 → `GatewayError`；401 → `KeyInvalid` |
| E05 | `UserClarified` 澄清已发生（可选） | `ask_user` 工具 | 搭档、用户 | 输入：question/type/options；输出：模型停轮等用户回复 | 无回复 → 超时/用户继续输入；模型重复提问 → `LoopGuard` |
| E06 | `GoalProposed` 目标已提议 | `propose_goal` 或文本【目标确认】降级 | 搭档 | 输入：statement + assumptions；输出：`pending='goal'` + 决策内容快照 | 参数非法 → `ProtocolInvalid`；仅有文本标记 → `ProtocolTextFallback` |
| E07 | `GoalConfirmed` 目标已确认 | 用户点“确认目标” / 明确确认文本 | 用户 | 输入：确认动作；输出：`goalConfirmed=true`，任务边界重置 | 用户拒绝 → `GoalRejected` |
| E08 | `PlanProposed` 方案已提议 | `propose_plan` / 文本【执行方案】降级 | 搭档 | 输入：summary、files[{path,reason}]、assumptions、verificationPlan；输出：`pending='plan'` | 目标未确认 → 硬序拒绝；参数非法 → 路径化错误 |
| E09 | `PlanConfirmed` 方案已确认 | 用户点“确认执行” / 明确确认文本 | 用户 | 输入：确认动作；输出：`planConfirmed=true`，`plannedFiles` 由方案派生，main 镜像同步 | 用户拒绝 → `PlanRejected`；镜像失败 → 门控不一致风险 |
| E10 | `FilesApproved` 文件清单已批准（可选） | `approve-files` + 用户点“批准这批文件” | 用户、搭档 | 输入：文件清单；输出：`plannedFiles` 追加，trust 增加，store 落盘 | 方案未确认 → policy 拦截；空清单 → no-op |
| E11 | `ToolRequested` 工具已请求 | 模型 tool_call | 搭档 | 输入：工具名 + 参数；输出：工具卡 / 授权卡 / 策略拦截 | 参数畸形 → repair；pending → `ToolBlockedPending`；越界 → `ToolBlockedOutOfPlan` |
| E12 | `ToolExecuted` 工具已执行成功 | 用户批准 / 自动只读 / 委托 | 用户、工具注册表、文件系统、进程 | 输入：工具名、rootPath、sessionId；输出：`ToolResult{ok:true,data}` | `ToolFailed`、`ToolNeedApproval`、`ToolPolicyBlocked`、`ToolCancelled` |
| E13 | `CompletionClaimed` 完成已声明 | `report_completion` / 文本【已达成】降级 | 搭档 | 输入：summary、verification、pendingQuestions；输出：证据候选 | 目标/方案未确认 → 硬序拒绝；参数非法 → 错误 |
| E14 | `CompletionEvidenceVerified` 证据已核验通过 | 系统代跑只读命令 + diff 对账 | 系统、主进程 | 输入：verification items + planned/produced；输出：`ok=true`；进入 `pending='resolution'` | `CompletionEvidenceMissing` → 回填引导；超过次数 → `NeedsHuman` |
| E15 | `ResolutionConfirmed` 解决已确认 | 用户点“已解决” / 明确确认文本 | 用户 | 输入：确认动作；输出：`resolutionConfirmed=true`，`planConfirmed=false`（任务边界） | 用户拒绝 → `ResolutionRejected` |
| E16 | `DeliveryPackageUpdated` 交付包已更新 | 真实 write/edit 成功 / 用户确认解决 | 系统、用户 | 输入：真实文件变更；输出：`DeliveryPackage`（summary/artifacts/acceptance/nextSteps/diffs） | 验收项为空（无演示注入）→ 交付包不完整（见 08） |
| E17 | `ProblemClosed` 问题已关闭 | 用户点“确认关闭” | 用户、问题台账 | 输入：交付包确认；输出：`ProblemInstance.status='closed'` | 未确认解决 → 不允许关闭 |
| E18 | `ProblemRerun` 问题已复跑 | 关闭后重新选择 / 同标题新消息 | 用户 | 输入：原问题标题；输出：状态回 executing，保留/更新快照 | 旧问题快照缺失 → 新快照 |

### 1.2 异常与回滚路径（至少两条，实际覆盖 8 类）

| 序号 | 事件 | 触发 | 领域后果 | 回滚/恢复 |
| :--- | :--- | :--- | :--- | :--- |
| X01 | `GoalRejected` 目标被拒 | 用户在目标卡点拒绝，或 pending 期新意图文本走隐式拒绝 | `goalConfirmed=false`，`rejectStreak+1`，记录 `lastRejectReason` | 模型重新提议；连续 2 次 → `ForcedClarify` |
| X02 | `PlanRejected` 方案被拒 | 方案卡拒绝 / 修改请求 / 隐式拒绝 | `planConfirmed=false`，`rejectStreak+1`；main 镜像复位 | 模型吸收反馈重提方案；`shouldNudgeProposeAfterPlanReject` |
| X03 | `ApprovalRejected` 授权被拒 | 用户拒绝工具卡 | 登记 `deniedApprovals`（toolName+subject）；同轮同类动作短封 | 任务边界（goal 确认）重置拒绝记忆 |
| X04 | `CompletionEvidenceMissing` 证据不足 | `verifyCompletion` ok=false | 不产生 resolution 决策点；打点 + 系统回填引导 | 最多 1 次（有 missing）/ 3 次（仅 unverifiable）；超限 → 用户侧提示 |
| X05 | `ToolBlocked` 工具被拦 | pending 非 none / 目标或方案未确认 / 清单外 / 策略 deny | 工具不执行；返回可执行引导 | 用户决策后重试；清单外 → 调 `approve-files` 补充 |
| X06 | `ToolLoopDetected` 工具循环 | 同一 write/edit/失败/执行类工具连续 3 次同签名 | 自动暂停续聊，提示用户 | 用户回复“继续”或给新指令 |
| X07 | `StuckEscalated` 无进展升级 | 连续 2 轮无产出 | 自动续聊指出“没动手”；2 次升级后 `NeedsHuman` | 用户发送具体指令或点继续 |
| X08 | `ForcedClarify` 强制澄清 | 同决策点重复 3 次 / pending 期文本回复 3 次 / rejectStreak≥2 / 40 轮 | 系统直接弹 `system_clarify` 决策点，本回合不调模型 | 用户点卡选择或“重新描述”；点卡重置 rejectStreak |
| X09 | `GatewayError` 网关错误 | 400 一次 / 5xx / 超时 / 网络 | 流中断；`stream-reset` 丢弃半截流；3 次后失败 | “重试”按钮重放上一回合；key-invalid → 配置页 |
| X10 | `ServiceStartFailed` 服务启动失败 | 命令不在白名单 / 端口被占 / 无输出 | 释放端口，返回错误引导 | `check-capability` 后重试 / 换命令 |
| X11 | `ServicePortConflict` 保留端口冲突 | 服务落到 5173/5175 | 杀进程 + 释放端口 + 拒绝 | 用动态端口或显式分配端口 |
| X12 | `ConversationInterrupted` 会话被打断 | 用户点停止 / silent 打断 | sid++ 使旧流失效；kill active command；卡标记“已停止” | 用户重新发送；已完成工具结果保留 |
| X13 | `SnapshotReverted` 文件回滚 | 用户点工具卡“回滚” | `.nf-bak` 恢复原文件；卡状态 reverted | 回滚失败 → 错误提示；任务边界清理快照 |
| X14 | `TaskBoundaryReset` 任务边界重置 | 目标确认（新任务） | 清 planned/produced/filesApproved/denied/lastToolFailed | main `planned-files:reset` + `cleanupSnapshots` |
| X15 | `SessionRestored` 会话恢复 | 应用重启 | 会话消息、决策内容快照、计划清单恢复 | localStorage / main store；损坏 → 空态 |

---

## 2. 命令候选清单

| 命令 | 发起者 | 期望结果 | 幂等性要求 |
| :--- | :--- | :--- | :--- |
| `SendMessage` | 用户 | 用户消息入列，触发搭档回合 | 否（每次发送是新回合） |
| `Clarify` | 搭档 | 提问/候选，停轮等回复 | 是（同问题重复提交不应重复弹） |
| `ProposeGoal` | 搭档 | 创建 goal 决策点 | 是（重复提议覆盖同一决策内容） |
| `ConfirmGoal` / `RejectGoal` | 用户 | 推进/回退任务边界 | 是（确认点一次性；已确认不再触发） |
| `ProposePlan` | 搭档 | 创建 plan 决策点 + 派生计划清单 | 是（重复提议覆盖；清单追加去重） |
| `ConfirmPlan` / `RejectPlan` | 用户 | 推进/回退方案状态 + main 镜像 | 是（确认/拒绝同步可重放） |
| `ApproveFiles` | 用户 | 计划清单追加 + 信任 + 落盘 | 是（追加去重，空清单 no-op） |
| `RequestTool` | 搭档 | 工具卡/授权卡/策略拦截 | 是（同一 toolCall id 不重复执行） |
| `ApproveTool` / `RejectTool` / `RememberTool` | 用户 | 执行/拒绝/信任记忆 | 是（卡按稳定 id 定位；拒绝记忆去重） |
| `ExecuteTool` | 系统/用户批准 | 工具结果 | 部分（bash 不幂等；write/edit 以快照回滚） |
| `CancelCommand` | 用户 | 杀活动进程组 | 是（无活动命令返回错误） |
| `ReportCompletion` | 搭档 | 完成声明 + 证据候选 | 是（重复提交覆盖当前声明） |
| `VerifyCompletion` | 系统 | `ok/missing/unverifiable` 快照 | 是（只读命令可重复代跑） |
| `ConfirmResolution` / `RejectResolution` | 用户 | 解决确认/回退 | 是（确认后 planConfirmed 重置） |
| `OpenProject` / `InitProject` | 用户 | rootPath / 项目骨架 | 否（打开不同目录改变工作区） |
| `StartService` / `CheckService` / `StopService` | 搭档/用户 | 服务生命周期 | 是（按 rootPath 唯一；重复启动返回既有） |
| `ApplyDiff` / `RevertDiff` | 用户 | 文件变更/回滚 | 部分（apply 先快照；revert 依赖快照） |
| `CreateProblem` / `RerunProblem` / `CloseProblem` | 用户/系统 | 台账状态变化 | 是（同标题复跑更新原实例） |
| `RetryFailedTurn` | 用户 | 重放上一回合 | 否（不追加用户消息但产生新请求） |
| `CompactHistory` | 系统 | 摘要 + 保留最近 20 条 | 是（阈值未到返回错误） |
| `ExportChatLog` | 用户 | 导出 Markdown | 是（固定覆盖同一路径） |
| `SetProvider` / `SetApiKey` / `SetWebAccess` / `TogglePlugin` | 用户 | 配置变更 | 是（覆盖写） |

---

## 3. 事件候选清单

| 事件 | 关键字段 | 范围 | 是否对外发布 |
| :--- | :--- | :--- | :--- |
| `conversation.message_sent` | content | Domain | 否（时间线） |
| `conversation.system_nudge` | content, kind | Domain | 否 |
| `conversation.assistant_start` | forceTool | Domain | 否 |
| `conversation.assistant_done` | content, error | Domain | 否 |
| `conversation.interrupted` | source | Domain | 否 |
| `task.goal_proposed` / `task.goal_confirmed` / `task.goal_rejected` | goalText / point | Domain | 否 |
| `task.plan_proposed` / `task.plan_confirmed` / `task.plan_rejected` | plan/files / point | Domain（规范名；旧名 `task.execution_*` 保留读取窗口） | 否 |
| `task.resolution_proposed` / `task.resolution_confirmed` / `task.resolution_rejected` | summary / point | Domain（规范名；旧名 `task.achievement_*` 保留读取窗口） | 否 |
| `session.pending_set` / `session.pending_cleared` | kind | Domain | 否 |
| `dialogue.loop_guard` / `dialogue.forced_clarify` / `dialogue.needs_human` | rounds / underlying / reason | Domain | 否 |
| `plan.approved` / `plan.rejected` | files / file+approvedList | Domain | 否 |
| `tool.requested` / `tool.blocked` / `tool.executing` / `tool.executed` / `tool.failed` | name/args/gate/reason | Domain | 否 |
| `tool.approved` / `tool.rejected` / `tool.remembered` | name/file | Domain | 否 |
| `capability.checked` / `capability.ledger_updated` | capabilities/missing; capabilityId/ok | Domain | 否 |
| `environment.injected` | rootPath/runtime/caps | Domain | 否 |
| `conversation.created` | session | Domain | 否 |
| `execution.forced` / `execution.released` / `execution.force_input` | reason/mode; planned/produced | Domain | 否 |
| `stuck.escalated` / `stuck.needs_human` | message | Domain | 否 |
| `problem.created` / `problem.rerun` / `problem.snapshot_updated` / `problem.closed` | problemId/title | Domain | 否 |
| `card.shown` / `card.resolved` / `card.rejected` / `card.dismissed` | card/action/cause | Domain（UI 生命周期） | 否 |
| `decision.requested` / `decision.resolved` | kind/since; point/action/reason | Domain | 否 |
| `proposal.goal` / `proposal.plan` / `proposal.completion` / `proposal.clarify` | statement/files/evidence | Domain | 否 |
| `protocol.text_fallback` | marker/content_snip | Domain | 否 |
| `completion.evidence_missing` | ok/missing/unverifiable | Domain | 否 |
| `conversation.status_change` / `conversation.error` | status / errorType+message | Domain | 否 |
| `gateway:stream-chunk`（IPC） | type/text/toolCall | Integration（main→renderer） | 是 |
| `timeline:log`（IPC） | session/type/role/detail | Integration（renderer→main） | 是 |
| `tools:execute`（IPC） | name/args/approved/rootPath/sessionId | Integration（renderer→main） | 是 |
| `planned-files:add/reset`（IPC） | files | Integration（renderer→main） | 是 |
| `completion:verify`（IPC） | commands/rootPath | Integration（renderer→main） | 是 |
| `delivery:apply-diff` / `delivery:revert-diff`（IPC） | path/diff/approved | Integration | 是 |

> 事件目录的代码权威：`apps/desktop/src/domain/timeline.ts:20-233`。事件名中的 `task.execution_*` / `task.achievement_*` 是历史命名，当前领域语义是 `plan` / `resolution`；见 08 的命名债。

---

## 4. 热点标注

### 4.1 一致性热点

1. **任务状态与计划清单**：`planConfirmed` 确认时从 `decisionContent.proposal` 派生 `plannedFiles`；确认与派生必须是同一转换（`conversationState.ts:189-201`）。
2. **计划清单 vs 实际产出**：完成核验要求 planned 逐项被 produced 覆盖；相对/绝对路径双形态是历史死锁点（`conversationState.ts:760-769`、`791-798`）。
3. **模型自报证据 vs 系统代跑**：`verifyCompletion` 用系统结果覆盖模型自报；`passed=false` / 代跑失败 → missing（`conversationState.ts:729-775`）。
4. **renderer 状态 vs main 门控镜像**：`session:plan-confirmed` 与 `planned-files` 是权威同步点（`ipc.ts:320-341`）。
5. **用户文本确认 vs 结构化确认**：`send` 会把确认词自动转为 `confirm`（`ConversationPanel.tsx:2277-2283`），但 `sysPrompt` 又要求只能通过卡按钮确认；语义存在张力。

### 4.2 集成热点

- Provider SSE：`gateway.ts:665-715` 手工解析 `data:` 流；半包 JSON 与 tool_call 累积。
- 文件系统：`read` 绝对路径无沙箱；write/edit 逐次授权 + 快照；`resolveSandboxPath` 处理双重嵌套。
- 开发服务器：端口分配、白名单命令、进程组、保留端口（`serviceManager.ts:126-219`）。
- 外部检索：DDG/Keenable/用户覆盖端点，探测与门控（`webTools.ts:74-98`）。
- LSP：`typescript-language-server` JSON-RPC，失败降级文本扫描（`lsp.ts:25-56`、`293-357`）。
- IPC：preload 暴露 40+ 通道，renderer 不直接碰 node（`preload.ts:10-250`）。

### 4.3 性能热点

- 流式整段 180s 超时；bash 30s / 安装 120s / 服务 15s；LSP 15s；证据代跑 5s。
- 长对话压缩阈值：>100 条或 >200K 字符；保留最近 20 条（`compact.ts:4-8`、`58-71`）。
- CodeRAG 扫描上限：200 文件、5 命中、单文件 200KB（`codeRag.ts:7-12`）。
- 预热：StandardPrefix hash 命中、前缀缓存历史 20 条（`preheat.ts:41-108`）。

### 4.4 合规 / 安全热点

- **只读判定是授权免弹卡的唯一依据**（`classifyReadonly` → `preApproval.auto`）。只读名单包含 `sed`、`awk`、`find`、`git branch`、`git remote` 等可写形态；见 08 安全发现。
- **read 工具无沙箱**：绝对路径原样读取，无需授权（`tools.ts:199-234`）；模型可读取项目外文件并发送给 provider。
- **软沙箱**：`isInSandbox` 只用于 `open` 与 trust 判断，不是 write/edit 的硬边界；沙箱外写入可通过逐次人工授权完成。
- **凭据**：safeStorage 解密失败时使用明文 fallback（0600）；web 搜索 Key 也明文存储。
- **外部网络**：web_fetch 允许任意 http/https，跟随重定向；未阻止 localhost/内网地址（SSRF 面）。
- **数据外发**：项目文件、命令输出、证据命令都会进入模型上下文；无显式供应商数据边界提示。

---

## 5. 歧义清单

| 编号 | 歧义点 | 影响范围 | 需确认方 | 建议决策 |
| :--- | :--- | :--- | :--- | :--- |
| Q01 | “执行确认” vs “方案确认” | UI 文案、事件名、领域状态 | 产品 + 领域专家 | 领域统一用“方案确认（PlanConfirmed）”；UI 可保留“确认执行”作为动作副标题；事件名后续重命名 |
| Q02 | “达成” vs “解决” | 完成声明、解决确认 | 产品 + 领域专家 | 模型只能“声明达成（Achievement）”；用户确认“问题解决（Resolution）” |
| Q03 | “目标确认” 同时是任务边界重置 | 信任、计划清单、问题快照 | 产品 + 开发 | 明确：goal 确认 = 新任务边界；保留此语义并写入 ADR |
| Q04 | “批准文件清单” vs “确认方案” | 授权卡、approve-files | 产品 + 开发 | 二者是不同决策：方案确认决定做什么；文件批准决定允许写哪些文件 |
| Q05 | “问题” vs “任务” vs “会话” | 台账、状态、日志 | 领域专家 | 问题=业务对象；任务=一次目标执行；会话=交互容器；三者不可混用 |
| Q06 | “能力” vs “工具” | check-capability、工具清单 | 领域专家 | 能力=抽象需求视图（node-runtime/spreadsheet）；工具=实现通道 |
| Q07 | “环境” vs “能力” | 能力检测、环境注入 | 开发 | 环境=事实快照；能力=环境的语义投影（代码已按此对齐） |
| Q08 | “接入方” vs “模型” vs “档位” | 配置、状态栏、路由 | 产品 + 开发 | 接入方=通道；模型=上游 id；档位=产品抽象 flash/pro |
| Q09 | “任务队列” Tab 与实际 Task | UI 占位 → BC-11 | 产品 | 初始为占位文案（`MainWorkspace.tsx:29-31`）；BC-11 已于 2026-11-14 落地（`queue:*` + TaskPanel） |
| Q10 | “验收/DoD” vs “完成证据” | 交付包、DoD 面板 | 产品 + 领域专家 | 完成证据是系统级核验；DoD 是用户级验收标准；当前 DoD 面板是原型 |
| Q11 | “交付” vs “关闭” | 交付包、问题台账 | 产品 | 交付=产物+验收呈现；关闭=用户终态确认；二者分离 |
| Q12 | “沙箱” | 授权、路径、信任 | 安全 + 开发 | 当前沙箱是软边界（项目根 + 信任），不是 OS 隔离；文档必须明示 |
| Q13 | “搭档” vs “Agent/模型” | 用户文案、系统提示 | 产品 | 用户可见统一“搭档”；Agent 仅作技术内部词 |
| Q14 | “系统提示 / 对账引导” vs “用户消息” | 消息通道、日志 | 开发 | 系统注入不得进用户气泡/输入框/聊天日志；时间线单列 `conversation.system_nudge` |
| Q15 | 文本确认 vs 只允许按钮 | 确认流程 | 产品 + 领域专家 | 当前代码支持确认词自动确认；建议保留但明确为“快捷确认”，结构化确认仍以卡为准 |
| Q16 | `commandcode` 默认接入方 vs 其他 provider | 首次配置 | 产品 | 旧配置缺省为 commandcode（ADR-007 生产通道）；新配置应显式选择 |
| Q17 | “只读 bash”边界 | 授权安全 | 安全 + 开发 | 见 08：`sed -i`/`find -exec`/`awk system()`/`git branch -D` 等需重新分类 |

---

## 6. 边界线索

从事件聚类与热点分布，得到初步能力分组：

1. **决策与核验**：目标/方案/解决决策点、证据门、回填引导、循环保护 → 候选上下文 `会话与任务`。
2. **受控执行**：工具目录、权限规则、动作属性、沙箱、快照、授权记忆、进程取消 → 候选上下文 `执行与信任`。
3. **工作区与环境**：项目打开/初始化、文件树、计划清单持久化、环境检测、能力清单、端口分配、开发服务器 → 候选上下文 `工作区与环境`。
4. **交付与台账**：交付包、diff 应用/回滚、问题 7 态、快照、复跑/关闭 → 候选上下文 `交付与问题台账`。
5. **模型接入**：接入方描述、模型列表/档位/回退、SSE 流、重试、tool_call 修复、摘要/预热 → 候选上下文 `模型接入`。
6. **时间线与可观测**：事件注册表、状态 diff 派生、JSONL append/query、聊天日志 → 候选上下文 `会话时间线`。
7. **配置与凭据**：API Key、provider/model 选择、Web 访问开关、明文 fallback → 候选上下文 `配置与凭据`。
8. **上下文与检索**：@mention 注入、CodeRAG、LSP、压缩、标准前缀 → 候选上下文 `上下文与检索`。
9. **平台运行**：应用生命周期、单实例、进程清理、插件注册表 → 候选上下文 `平台运行`。

### 6.1 目标态边界线索（由占位/字段/演示证据推导）

这些线索记录推导阶段（2026-11-14 之前）的产品语义要求——当时只有占位/字段/演示证据；BC-10～BC-14 已于 2026-11-14 全部落地，现状见 `00-domain-blueprint.md §2` 与 `10-code-evidence.md`。

10. **变更与版本**：diff/快照、审核/应用/回滚、Git 只读 → 候选上下文 `变更与版本`（BC-10）。证据：`applyDiff.ts`、`delivery:apply-diff/revert-diff`、`pluginSystem.ts:22`（git 占位）。
11. **任务编排**：队列、调度、阻塞/恢复、取消 → 候选上下文 `任务编排`（BC-11）。证据：`MainWorkspace.tsx:15-40`（任务队列占位）。
12. **用量与成本**：usage、缓存、成本、预算 → 候选上下文 `用量与成本`（BC-12）。证据：`MainWorkspace.tsx:33-36`、`pluginSystem.ts:23`（stats 占位）、`gateway.ts` 无 usage 解析。
13. **扩展与集成**：扩展注册/生命周期、MCP、Git、信任 → 候选上下文 `扩展与集成`（BC-13）。证据：`pluginSystem.ts:19-25`、`plugins:*`。
14. **验收与质量门禁**：DoD、方案验证计划、验收项、证据绑定、门禁 → 候选上下文 `验收与质量门禁`（BC-14）。证据：`DeliveryPanel.tsx:332-350`、`MainWorkspace.tsx:282-293`、`DoDAlignPanel.tsx`（演示）、`PlanProposal.verificationPlan`。

这些线索直接支撑 03 的子域分类与 04 的限界上下文设计。

---

## 7. 校验清单

- [x] 事件使用过去时命名，业务可理解
- [x] 至少覆盖 1 条主路径 + 2 条异常/回滚路径（实际 1 主路径 + 15 条异常/回滚）
- [x] 热点中明确标注了跨系统边界与强一致性点
- [x] 歧义清单中每条都标注了“谁必须确认”
- [x] 边界线索可被 `ddd-subdomains` 直接消费
