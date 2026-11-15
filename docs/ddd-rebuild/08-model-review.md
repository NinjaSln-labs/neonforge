# 08 · 模型评审（DDD Model Review）

> 阶段：验证 / Review
> 输入：01-07 的建模工件 + 代码基线 `5c54924`
> 输出：评分总览、问题清单、行业对标、回溯触发、实施就绪判定
> 说明：本评审不仅评估文档，也评估**代码与模型的一致性**；问题清单中的“源码修复”状态会在本次重建的代码修正阶段更新。
> 行号说明：本文 `文件:行` 为 2026-11-14 评审时点引用（评分表保留初始评估）；当前权威行号索引见 `10-code-evidence.md`，符号名以括号内为准。

---

## 1. 评分总览

| 维度 | 得分（0-10） | 主要扣分原因 | 证据 |
| :--- | :--- | :--- | :--- |
| 术语一致性 | 7 | 旧命名 `executionConfirmed`/`achievementConfirmed` 与 `planConfirmed`/`resolutionConfirmed` 并存；UI“确认执行”与领域“方案确认”不一致；`conversationState.ts` 文件名隐藏 Task 聚合 | `conversationState.ts:1-11`、`112-115`；`timeline.ts:134-142`；`ConversationPanel.tsx` 文案 |
| 边界合理性 | 8 | `src/domain` 被 renderer/main 同时导入，形成 Shared Kernel；`ConversationPanel.tsx` 3437 行把应用编排塞进 UI 组件；`ToolRegistry` 同时承担授权、执行、服务分发 | `useConversationState.ts`、`tools.ts:100-196`、`ConversationPanel.tsx` |
| 不变量表达率 | 8 | 8 条不变量有显式函数与测试，但 I06（计划清单单一来源）在渲染层被违反：`propose_plan` 提议即写入 `plannedFiles` | `conversationState.ts:831-840`；`ConversationPanel.tsx:880-883`；测试 `Inv 6` |
| 事件完整性 | 8 | 55+ 事件已注册、diff 派生；但无事件版本/eventId；日志写失败静默；`tool.executed` 可能重复；部分事件靠手工 tlog | `timeline.ts:20-233`；`timelineLogger.ts:55-77`；`07 §9` |
| 耦合度 | 6 | renderer 直接消费 domain + 20+ IPC；main 工具/环境/服务互依；演示面板与生产路径混在同一文件；状态镜像异步 | `ConversationPanel.tsx`、`ipc.ts`、`05 §1` |
| 行业对标偏离 | 8 | 已吸收 Claude/Codex/Cursor 授权、Aider/Cline 验证与拒绝原因、reasonix/deer-flow 循环与挂起；事件版本与契约 schema 已补齐（P2-07、P1-04），轻量 Outbox 与跨存储事务性 Outbox 均已实现（P1-02，2026-11-15） | 代码注释中的对标记录；`02 §4`、`07 §9` |
| **加权平均** | **7.5 / 10** | 模型主干强，工程边界与安全边界需要硬化 | — |

> 另按**目标态领域完整度**评估：10 / 10（2026-11-15 复评）。BC-10～BC-14 五个目标态领域已落地（领域状态机 + 持久化 + IPC/preload + 生产 UI + 单测）；P1-04、P1-05、P2-08、演示隔离与跨上下文事务性 Outbox 均已关闭（WAL 状态+事件同提交，见 §5.3；仅工作区文件系统写入保留快照+补偿边界）。该评分不并入上表的“现有模型”评分。

---

## 2. 问题清单

> 优先级：P0 = 安全/正确性阻断；P1 = 重要缺陷或体验风险；P2 = 命名/可维护性/完整性。

| 编号 | 优先级 | 问题 | 影响 | 证据（文件:行 / 符号） | 建议修复 | 修复状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| P0-01 | P0 | `read` 工具允许任意绝对路径，无沙箱、无授权 | 模型可读取项目外敏感文件（`~/.ssh`、`/etc/passwd`、浏览器数据）并发送到 Provider；隐私/合规风险 | `tools.ts:199-210`（`resolvePath` 绝对路径直接返回）、`tools.ts:564-570`（read `requiresApproval:false`） | 项目根内自动；根外需授权（或显式“文件整理”范围）；新增测试 | 已修复（2026-11-14）：`read` 注册 `preApproval`（`isInSandbox`）；ENOENT 目录提示仅根内；`tests/unit/tools.test.ts` 覆盖根内自动/根外授权 |
| P0-02 | P0 | 只读命令判定可被写操作绕过 | `sed -i`、`find -exec`/`-delete`、`awk system()`、`sort -o`、`git branch -D`、`git remote add`、`rg --pre`、`wget` 下载等可被误判只读而免授权 | `conversationState.ts:353-456`（`BASH_READONLY_HEADS`、`GIT_READONLY_SUBCOMMANDS`、链递归）、`tools.ts:482-487`、`tools.ts:591` | 增加危险参数形态判定（AST/参数级）；新增安全回归测试 | 已修复（2026-11-14）：`hasDangerousArgumentShape` 参数级判定（sed/find/awk/sort/rg/git/wget/curl）；新增安全回归用例 |
| P0-03 | P0 | `plannedFiles` 在方案提议时就写入，早于用户确认 | 违反 I06；被拒绝方案的文件仍留在清单，后续方案确认后可能被自动放行；边界泄漏 | `ConversationPanel.tsx:880-883`（`propose_plan` 分支 `addPlannedFiles`）、`1145-1153`（文本方案降级 `addPlannedFiles`）、`conversationState.ts:831-840` | 删除提议阶段写入；只由 `userDecided(plan, confirm)` 派生；拒绝不落清单；新增交互测试 | 已修复（2026-11-14）：删除 `propose_plan` 与文本方案降级两处 `addPlannedFiles`；派生唯一入口 `userDecided` |
| P0-04 | P0 | 进程清理/停止服务在 `pid=0` 时调用 `kill(-0)`/`kill(0)` | 可能向当前进程组/应用自身发 SIGKILL，导致应用退出或误杀 | `tools.ts:288-323`（`killTree`/`killAllSubprocesses` 使用 `pid ?? 0`）、`serviceManager.ts:254-286`（`process.kill(-s.pid)`/`-p.pid`） | 所有 kill 前守卫 `pid > 0`；新增纯函数/单测 | 已修复（2026-11-14）：`processGuard.isKillablePid` + tools/serviceManager 全部 kill 前守卫；新增单测 |
| P0-05 | P1 | 系统代跑验证包含外网 `network-read` 命令 | 证据命令可被模型用于外网 GET 携带敏感数据；自动代跑绕过用户确认 | `conversationState.ts:681-685`（`isSystemVerifiable` 接受 `network-read`）、`verification.ts:9-13` | 系统只代跑 `readonly` 与 localhost `network-read`；外部网络命令标 unverifiable | 已修复（2026-11-14）：`isSystemVerifiable` 单源导出，外网 network-read 不可代跑；`verifyCompletionSystem.test.ts` 覆盖外网/localhost |
| P1-01 | P1 | `web_fetch` 允许任意 http/https，跟随重定向，无 localhost/私网拦截 | SSRF：可访问内网服务、云元数据地址；可被用于绕过网络边界 | `webTools.ts:260-296` | 拒绝 localhost/私网/元数据地址；手动跟随重定向并逐跳校验；新增测试 | 已修复（2026-11-14）：`isPrivateHost` + `redirect:'manual'` 逐跳校验（最多 5 跳）；`webTools.test.ts` 覆盖 |
| P1-02 | P1 | 无 Outbox/DLQ/事件版本；时间线写失败静默 | 审计不可靠；跨聚合一致性无投递保证；事件 schema 演进困难 | `timelineLogger.ts`、`timelineOutbox.ts`、`stateTransaction.ts`、`timeline.ts` | 引入事件 `eventId/version`；失败可见化；跨上下文写库后发事件（Outbox） | 已修复（2026-11-15）：`eventId/version` + 写失败计数 + DLQ/启动重放 + dedupe + 轻量 Outbox；跨存储事务性 Outbox（WAL：状态+基线+事件同提交，启动 FIFO 重放）已覆盖 BC-10/11/14 |
| P1-03 | P1 | renderer 与 main 的计划确认镜像异步 | 极端时序下 main 门控仍关闭/仍开启，导致卡不渲染或越权 | `useConversationState.ts`（`confirm/reject`）、`ipc.ts` `session:plan-confirmed` | 确认转换 await 镜像结果；失败回滚/提示；增加竞态测试 | 已修复（2026-11-14）：`confirm/reject` await 镜像并重试 1 次；领域转换仍同步完成 |
| P1-04 | P1 | IPC 契约无 schema 校验/生成 | preload、types.d.ts、main handler 三者可能漂移；调用方传入非法结构 | `preload.ts`、`renderer/types.d.ts`、`ipc.ts` | 生成式契约或 zod/JSON Schema 校验；契约测试 | 已修复（2026-11-15）：`ipcSchema.ts` 轻量校验器 + 全通道静态契约测试；运行时入口覆盖 tools/stream/config(set-key、set-web-access)/队列/验收/变更集/delivery diff/tools revert/completion verify/context/rag/plugins/planned-files/plan-confirmed；价格/预算/MCP 仍由各自 store 校验 |
| P1-05 | P1 | `ConversationPanel.tsx` 拆分前 3372 行，应用编排与 UI 渲染混在一起 | 可维护性差、DDD 应用层边界侵蚀、测试困难 | `ConversationPanel.tsx` 全文 | 拆分为应用服务 hooks（send/stream/toolLoop/decision）与展示组件 | 已修复（2026-11-15）：阶段 1–5 完成（`conversationFormat`/`DecisionCards`/`ConversationComposer`/`conversationHistory`/`useChatStream`/`useChatEngine`/`useTimelineLog`/`useMessageStore`/`useConversationTelemetry`/`useEvidenceVerification`）；面板 3372 → 1320 行；行为不变，interaction 74/74（含后续排队/重试回归） |
| P1-06 | P1 | 演示/占位能力与生产能力混排 | 用户可能以为 DoD/数字交付/任务队列已可用；产品预期失真 | `ConversationPanel.tsx`（demo 面板仅经测试 bridge 注入）、`DoDAlignPanel.tsx`（演示）、`DigitalDeliveryPanel.tsx`（demo） | 明确标记/隐藏；或将 DoD/验收接入真实方案验证计划 | 已修复（结构性）：生产运行无 `demo` 字段，演示仅在测试注入时可达；任务队列/验收已真实化 |
| P1-07 | P1 | 交付包验收项在生产路径为空 | `DeliveryPackage` 有验收字段，但无 DoD 来源；用户看不到“按什么验收” | `MainWorkspace.tsx`（历史 `acceptance: []`） | 方案确认时捕获 `verificationPlan` 作为验收项；或引入 DoD 决策点 | 已修复（BC-14）：`acceptance:derive` 取 `verificationPlan`；门禁阻断关闭 |
| P1-08 | P1 | 路径相对/绝对双形态与末段匹配启发式 | 可能把同名不同目录文件误判为已产出；完成核验误通过/误拒绝 | `conversationState.ts` 的 `inPlannedFiles/deriveDiffs/matchesPlannedPath` | 统一绝对路径规范；保存文件标识（inode/realpath）；补测试 | 已修复（2026-11-14）：`normalizeComparePath` 规范化 + 裸文件名多候选 fail-closed；单测覆盖 |
| P1-09 | P1 | API Key/Web Key 明文 fallback 0600 | 本机其他进程可读；macOS 未签名场景的安全折衷 | `configStore.ts`（密钥读取/写入） | 优先 OS keychain；明文 fallback 加显式设置/到期提醒 | 已修复（2026-11-15）：`NEONFORGE_API_KEY`/`NEONFORGE_API_KEY_FILE` 优先且不落盘；加密可用时清除明文副本；明文 fallback 改为 `NEONFORGE_ALLOW_PLAINTEXT_KEY=1` 显式 opt-in（默认拒绝保存）；Web 搜索 Key 同样加密（`enc1:` 前缀，旧明文兼容）；设置页显示来源/明文副本提醒，超过 90 天提示轮换 |
| P1-10 | P1 | 沙箱仅字符串前缀，未解析符号链接 | 根内 symlink 指向根外可绕过 trust/open 检查 | `tools.ts` 的 `isInSandbox`/`read`/`write`/`edit` | realpath 解析；拒绝 symlink 逃逸；测试 | 已修复（2026-11-14）：`isInSandboxRealpath` + 异步 `read preApproval` + write/edit 硬拦截（含 `security.symlink_escape_blocked`）；单测覆盖 |
| P1-11 | P1 | `read` 的 ENOENT 分支列出父目录内容 | 泄露目录结构/文件名；与 read 边界叠加 | `tools.ts:221-233` | 限制在项目根内；根外不列目录 | 随 P0-01 修复 |
| P2-01 | P2 | 旧事件名 `task.execution_*`/`task.achievement_*` | 术语不一致，审计与文档映射成本 | `timeline.ts` 事件目录 | 新增 `task.plan_*`/`task.resolution_*` 并保留旧名一个窗口 | 已修复（2026-11-14）：规范名已启用；旧名保留读取窗口 |
| P2-02 | P2 | 聚合根命名：文件 `conversationState.ts`，聚合是 Task | 新人误以为聚合是 Conversation | `conversationState.ts` | 重命名/导出 `TaskState` 别名；文档已用 Task | 已修复（2026-11-14）：导出 `TaskState` 别名（文件改名暂缓避免大范围 churn） |
| P2-03 | P2 | `forceTool` 旧概念仍出现在时间线与 gateway 参数 | 与 `decideProgressGuarantee` 新语义混淆 | `gateway.ts`、`timeline.ts`、`ConversationPanel.tsx` | 统一为 `progressMode`；保留兼容字段 | 已修复（2026-11-14）：`progressMode` 进入 gateway/IPC/preload/timeline；`forceTool` 保留兼容 |
| P2-04 | P2 | 计划清单落盘非原子（writeFileSync 覆盖） | 崩溃/并发可能写坏 JSON；损坏后回退空清单 | `plannedFilesStore.ts` | 临时文件 + rename 原子写；校验 | 已修复（2026-11-14）：tmp + rename 原子写 |
| P2-05 | P2 | `tool.executed` 可能重复（diff 派生 + 手工 tlog） | 时间线统计失真 | `timeline.ts`、`ConversationPanel.tsx`、`useToolApproval.ts` | 统一事件出口；按 eventId/去重 | 已修复（2026-11-14）：产出增量改 `task.files_produced`；`tool.executed` 只表示工具执行事实 |
| P2-06 | P2 | `dedupeKey` 未与全局去重存储接线 | `card.shown` 等可能重复 | `timeline.ts`、`timelineLogger.ts` | 在 append 层实现 dedupe set | 已修复（2026-11-14）：`timelineLogger` 按会话+类型+detail 去重 |
| P2-07 | P2 | 事件目录未版本化 | 事件载荷变更破坏旧日志解析 | `TimelineEvent` 仅 ts/seq/session/type/role/detail | 增加 `v` 字段；查询兼容 | 已修复（2026-11-14）：事件写 `eventId` + `version: 1` |
| P2-08 | P2 | 部分 UI 文案与技术细节混用 | 非技术用户看到"L3/快照 .nf-bak"等 | `authModel.ts` 已部分人类化；仍有权衡 | 统一文案规范 | 已修复（2026-11-15）：生产主路径无内部术语（L3/.nf-bak 仅存于 demo 面板与代码注释）；高级设置文案统一为「外部工具服务器/计费表/预算，按接入方:模型填写」的可读句式，保留 MCP/token 等必要技术名词 |

### 2A. 目标领域完整性问题（to-be）

> 这些不是“代码 bug”，而是“产品应该有、当前没有完整落地”的领域缺口。判定依据见 `00-domain-blueprint.md`。优先级 P0/P1 仅表示目标态建设的先后，不改变本轮已关闭的源码 P0。
>
> **实现状态（2026-11-14）**：G01～G05 均已实现并通过单测；本表保留为设计依据与回归验收清单（对应 `09-openspec/tasks.md` 5.6–5.10）。

| 编号 | 优先级 | 缺口 | 影响 | 代码证据 | 目标上下文 | 建议 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| G01 | P1 | 变更集与版本：diff/快照有，但没有变更集对象、基线校验与 Git 只读桥 | 交付无法回答“改了什么、基于哪个版本、是否可安全回滚”；外部修改可被覆盖 | `applyDiff.ts`、`ipc.ts:219-227`、`pluginSystem.ts:22` | BC-10 | 实现 A13 变更集；应用前基线校验；Git 只读桥 |
| G02 | P1 | 任务编排：任务队列只有占位文案 | 产品承诺多任务但不可用；用户无法排队/暂停/恢复 | `MainWorkspace.tsx:15-40` | BC-11 | 实现 A14 队列；调度只消费 Task 状态事件 |
| G03 | P1 | 用量与成本：无 usage 解析、无台账、无价格表 | 成本不可见；缓存收益不可量化；无法预算提醒 | `gateway.ts`（无 usage）、`MainWorkspace.tsx:33-36`、`pluginSystem.ts:23` | BC-12 | 解析 Provider usage；实现 A15 台账；未知价格标 unknown |
| G04 | P2 | 扩展与集成：插件只有注册表；MCP/Git 占位 | 外部能力不可用；若未来接入，缺少信任与生命周期边界 | `pluginSystem.ts:19-25`、`plugins:*` | BC-13 | 实现 A16；MCP 能力经 BC-02 授权/沙箱 |
| G05 | P1 | 验收与质量门禁：交付包验收项为空；DoD 是演示 | 交付“按什么验收”不可见，真实性被削弱；演示可能被误认为生产 | `DeliveryPanel.tsx:332-350`、`MainWorkspace.tsx:282-293`、`DoDAlignPanel.tsx:9-13` | BC-14 | 实现 A17；验收优先取 `verificationPlan`；门禁单源 |

**隐藏缺口补充**（并入现有上下文，不新建域）：

| 编号 | 缺口 | 归属 | 处理 |
| :--- | :--- | :--- | :--- |
| H01 | 对话策略（系统提示/nudge/确认词）未建模 | BC-01 | 定义为对话策略服务；spec 已覆盖 |
| H02 | 权限规则仅内存、跨重启丢失；L4 信任阶梯可视化是演示 | BC-02 | 已修复（2026-11-15）：`permissionRulesStore` 持久化 + `permissions:*` IPC + 设置页规则编辑；裁决统一为 deny > allow > ask 且显式 ask 不被 preApproval 绕过；L4 演示面板保留为非目标 |
| H03 | 会话恢复只恢复消息，不恢复完整 Task 确认位 | BC-01 | spec 明确“以消息重建”的恢复语义 |
| H04 | 模板/场景工程初始化缺失 | BC-03 | 列为候选，不建新域 |
| H05 | 长期记忆/知识库缺失 | BC-08 | 明确为非目标（无代码证据） |

---

## 3. 行业对标报告

> 说明：下表的对标结论主要来自代码注释中记录的竞品调研（Aider/Cline/Claude/Codex/Cursor/deer-flow/reasonix 等）；未在本轮重新联网核实外部产品最新行为。对标用于判断“是否有成熟实践可借鉴”，不作为外部事实断言。

| 对比项 | 参考实现做法 | 本模型做法 | 融合/拆分/遗漏 | 是否可接受 | 建议 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 工具授权 | Claude/Codex/Cursor 统一 Tool(specifier) 授权；只读自动、写操作确认 | 规则 deny>allow>ask + 动作属性 + 逐次授权 + 允许并记住 + 低危委托 | 融合（更细的 L1-L4） | 是 | 补强只读判定的参数级分析 |
| 拒绝原因 | Cline denial reason 回灌模型 | `RejectReason` 强制 + `decision.resolved` 载荷 + 拒绝记忆 | 融合 | 是 | 保持；补充 UI 原因选择 |
| 完成验证 | Aider lint/test 循环；Cline verified | 证据门 + 系统代跑 + planned/produced diff 对账 | 融合 + 拆分（系统核验 vs 用户确认） | 是 | 增加不可代跑证据的替代验证（截图/浏览器） |
| 循环检测 | reasonix storm-breaker；gemini-cli loop detection | loop-guard/forced-clarify/needs-human + rejectStreak + 40 轮兜底 | 融合 | 是 | 把阈值配置化并可视化 |
| 工具循环 | Claude/Codex 同类重复抑制 | 同工具签名连续 3 次暂停；失败/执行类覆盖；只读豁免 | 融合 | 是 | 统一重复检测与 StuckDetector 的语义 |
| 上下文管理 | Claude Code compact；Cursor 上下文窗口 | 压缩阈值 + 摘要 + 保留最近 20；@mention 确定性注入；CodeRAG/LSP | 融合 | 是 | 压缩摘要加结构化状态（目标/决策/证据） |
| 事件审计 | 多数竞品以日志/遥测为主 | 状态 diff 派生领域事件 + JSONL + query | 领先（Event Sourcing-lite） | 是 | eventId/version 与失败可见性已落地（2026-11-14）；轻量/跨存储事务性 Outbox 已落地（2026-11-15） |
| 插件生态 | Claude/Codex 有 MCP/插件 | 5 个内置插件注册声明；MCP bridge 已实现（BC-13，2026-11-14） | 部分补齐 | 是 | 第三方插件加载/生态路线图仍待明确 |
| 多任务队列 | 竞品有任务/会话管理 | 问题台账 + 任务队列（BC-11，2026-11-14）；仍为单活动会话 | 部分补齐 | 是 | 并行多会话非目标；若要支持需重新建模 Task 聚合 |

---

## 4. 回溯触发清单

| 触发条件 | 实际值 | 是否触发 | 回溯目标 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| 聚合边界与上下文边界矛盾 | Task 与 PlannedFiles 边界清晰；渲染层违反 I06 | 否（边界本身一致） | — | 修复渲染层写入点即可，无需重划上下文 |
| 术语冲突率 > 20% | 约 15%（execution/achievement/plan/达成/解决/执行确认） | 否（接近阈值） | `ddd-contexts`（建议性） | 执行一次命名清理，不改结构 |
| 不变量表达率 < 60% | 80%（8/10 显式且可测） | 否 | — | I06 修复后升至 90% |
| 集成模式与上下文映射不一致 | 无 Outbox、IPC 命令/事件混用 | 部分 | `ddd-context-map`（后续） | 事件版本已落地（P2-07），轻量/跨存储事务性 Outbox 已实现（design.md §6/§5.3，2026-11-15） |
| 事件完整性 < 70% | 80%+（55+ 事件注册） | 否 | — | 补事件版本与去重 |
| 同一回溯路径执行 3 次 | 未发生 | 否 | — | — |

**结论**：模型主干不需要回溯重做；需要的是 **P0 代码修复 + 命名清理 + 事件治理**。

---

## 5. 实施就绪判定

### 5.1 判定

**当前：Ready（文档基线 + 生产硬化）。**

- 作为 **文档基线**：Ready。01-07 的模型自洽，能支撑后续 Spec 与代码演进。
- 作为 **生产硬化**：P0 安全阻断项、P1 边界与 IPC 契约校验、ConversationPanel 拆分、轻量 Outbox 硬化、BC-02 权限规则持久化、跨存储事务性 Outbox 均已完成并有回归测试；剩余仅为明确非目标（演示面板/平台发布）。

### 5.2 原阻塞项（本轮已关闭）

1. P0-01 `read` 项目外文件无边界 —— 已修复（根内自动/根外授权）。
2. P0-02 只读命令写操作绕过 —— 已修复（危险参数形态 fail-closed）。
3. P0-03 计划清单提前写入 —— 已修复（只在方案确认时派生）。
4. P0-04 `pid=0` 误杀 —— 已修复（`isKillablePid` 守卫）。
5. P1-01 `web_fetch` SSRF —— 已修复（私网拦截 + 逐跳重定向校验）。
6. P0-05 验证代跑外网命令 —— 已修复（仅 readonly 与 localhost network-read 可代跑）。

### 5.3 非阻塞但建议尽快处理

- 已关闭（2026-11-14）：P1-03 镜像竞态、P1-06 演示通道隔离（结构性）、P1-08 路径规范化、P1-10 symlink、P2-01 事件命名、P2-03 progressMode、P2-04 原子写、P2-05 事件重复、P2-06 dedupe、P2-07 事件版本；P1-02 的 DLQ/事件版本/重放已先行落地，跨上下文 Outbox 于 2026-11-15 关闭。
- 已关闭（2026-11-15）：P1-04 IPC 契约校验（第二批入口校验 + 校验器修正）、P1-05 `ConversationPanel` 拆分（3372→1320 行）、P2-08 高级设置文案规范化、BC-02 权限规则持久化（`permissionRulesStore` + `permissions:*` IPC + 设置页；裁决 deny > allow > ask，ask 覆盖 preApproval）。BC-02 安全复核同日完成：canonical 执行字段匹配（防 decoy）、路径归一（防 `..`）、bash 链/重定向/命令替换守卫、ask 仅接受 user 来源 approved、read allow 不跨项目根、设置页保存串行化、单条坏规则容错。
- 二次代码评审修复（2026-11-14）：悬空 symlink/写边界硬阻断、变更集自有基线（快照缺失不误删原文件）、会话 ID 提升工作区（Tab 重挂载不失联）、价格表可配置 + 月度预算、`system_clarify` 按底层决策点执行副作用、异步预检异常收敛、授权拒绝不自动恢复队列、交付面板异步响应竞态、MCP UTF-8 分片与进程退出清理。
- 轻量 Outbox（2026-11-15）：`timelineOutbox.ts` + `timelineLogger` 改造——事件先入 outbox 文件（`fsync`）再投递时间线；投递失败保留待下次/启动重放；`outboxId` 写入事件按幂等跳过，崩溃窗口不重复。持久化硬化（同日复核）：目标时间线行先 `fsync` 再压缩 Outbox；压缩 tmp `fsync` + rename + 目录同步；尾部半行先补换行防黏连吞事件；启动重放移到单实例锁之后；outbox 读失败返回 error、时间线索引读失败不缓存空索引；无会话日期文件按入队时目标文件重放（跨午夜不漂移）。**跨存储事务性 Outbox**（同日）：`stateTransaction.ts` WAL 把 BC-10 变更集（状态+自有基线）、BC-11 任务队列、BC-14 验收记录的状态写入与领域事件作为一条记录 fsync 提交；启动 FIFO 重放，事件按 `txId:index` 幂等。工作区文件写入仍以快照+补偿为边界（不纳入跨文件系统事务）。崩溃恢复硬化（同日复核）：未换行半条事务视为未提交并截断/忽略；store 读取优先取 WAL 最新已提交意图，状态写入失败后后续变更不丢更新；提交未完成原因写入 `[state-tx]` 日志。
- 交互回归稳定性（2026-11-16）：`playwright --project=interaction` 全量 **78/78**（最终复跑；含排队优先、重试回合衔接与任务快照恢复；见 tasks 7.15/7.16、§8）；两个既有 flaky（`.nf-start` 网络变更、计划确认后重试双回合）根因已定位并在测试层（导航重载重试）与应用层（sid 归属/同步 working/多槽队列）修复；新增第二轮重试上下文、排队 FIFO/停止回填回归。
- 任务状态机跨重启（2026-11-15，GitHub #11）：ADR-013 `TaskSnapshot` 持久化确认位/pending/决策内容/计划与产出/拒绝记忆/ADR-010 计数；消息与任务快照同一 V2 记录原子写，恢复时同步 MainWorkspace 渲染镜像并与 main 批准事实并集；旧 V1 消息存档兼容。stage spec 见 `docs/design/stage-specs/V2-task-snapshot.md`。

### 5.4 通过标准（建议）

| 门禁 | 标准 |
| :--- | :--- |
| 安全回归 | P0/P1 安全用例全部通过；未授权写入/读取测试 0 失败 |
| 不变量回归 | `conversationState.test.ts` 的 Inv 1-8 全绿；I06 领域派生路径有测试；目标态 I17-I21 随实现补齐（见 `changeSet/acceptance/taskQueue/usageLedger/extension` 单测） |
| 类型/构建 | `tsc` 双配置通过；`eslint` 通过 |
| 交互回归 | `vitest` + interaction 测试通过；主路径 e2e-sim 收敛 |
| 文档一致性 | 08 问题状态更新；10 证据索引指向修复后代码 |

---

## 6. 评审结论

NeonForge 的领域模型主干是清晰的：**用户决策驱动的任务状态机 + 证据门 + 受控执行 + 事件时间线**，这套组合在 AI 工作台产品中是有差异化的。当前主要风险不在“模型想不出来”，而在“模型的边界在代码里没有被完全执行”：

- 计划清单在提议阶段就被写入，破坏了“只有确认方案才形成写边界”的核心不变量；
- 只读判定是授权免弹卡的单点，但字符串启发式存在可写绕过；
- `read` 与 `web_fetch` 的网络/文件边界不够硬；
- 进程清理存在 `pid=0` 误杀；
- 演示/占位能力与生产能力混排，削弱了“交付真实性”。

这些都可以在不改变产品方向的前提下修复。修复完成后，本模型可以从 Conditional Ready 进入 Ready。

但“现有模型可用”不等于“产品领域完整”。按 `00-domain-blueprint.md` 的目标态目录，产品应有 5 个目标态领域（变更集、任务队列、用量成本、扩展集成、验收门禁）；截至 2026-11-14 已全部实现：变更集与验收门禁补齐了“交付是否可信”，任务队列/用量/扩展补齐了工作台承诺。演示面板仍在 UI 中保留，但生产交付路径不再依赖它们（隔离已结构性完成）；BC-02 权限规则持久化（存储 + IPC + 设置页）、轻量 Outbox 硬化（fsync 顺序、半行/跨午夜防护、启动重放在单实例锁后）与跨存储事务性 Outbox（BC-10/11/14 状态+基线+事件 WAL）已于 2026-11-15 完成。剩余仅为明确非目标；IPC 契约校验（P1-04）、ConversationPanel 拆分（P1-05）与 P2-08 文案规范已于 2026-11-15 完成。
