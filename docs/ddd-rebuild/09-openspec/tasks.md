# 09 · OpenSpec Tasks — ddd-rebuild-2026-11

> 勾选状态以本文件为准。`[x]` 已完成并在本仓库验证；`[ ]` 待完成。
> 代码修正遵守 AGENTS.md：Conventional Commits、ADR-012（测完再修，不边测边改）。

---

## 1. 文档（基于现有代码）

- [x] 1.1 安装并记录权威 DDD skill 链（`.claude/skills/`，来源见 `DDD-SKILLS-SOURCE.md`）
- [x] 1.2 `README.md` 文档索引与阅读顺序
- [x] 1.3 `01-scope.md` 范围与非目标
- [x] 1.4 `02-discovery.md` 领域发现（事件风暴式证据清单）
- [x] 1.5 `03-subdomains.md` 子域划分（Core / Supporting / Generic）
- [x] 1.6 `04-bounded-contexts.md` 限界上下文与聚合归属
- [x] 1.7 `05-context-map.md` 上下文映射与集成模式
- [x] 1.8 `06-aggregates.md` 聚合、不变量与状态机
- [x] 1.9 `07-domain-interactions.md` 交互契约与 IPC
- [x] 1.10 `08-model-review.md` 模型评审与问题清单（P0/P1/P2，含目标态缺口 G01-G05）
- [x] 1.11 `09-openspec/proposal.md` 变更提案
- [x] 1.12 `09-openspec/design.md` 技术设计与安全设计（含目标态领域设计 §10）
- [x] 1.13 14 个 capability specs（每个 Requirement ≤ 5 Scenario）
  - [x] `conversation-task`
  - [x] `execution-trust`
  - [x] `workspace-environment`
  - [x] `delivery-ledger`
  - [x] `provider-gateway`
  - [x] `session-timeline`
  - [x] `configuration-secrets`
  - [x] `context-retrieval`
  - [x] `platform-runtime`
  - [x] `change-version`（目标态）
  - [x] `task-orchestration`（目标态）
  - [x] `usage-cost`（目标态）
  - [x] `extension-integration`（目标态）
  - [x] `acceptance-quality`（目标态）
- [x] 1.14 `09-openspec/tasks.md`（本文件）
- [x] 1.15 `10-code-evidence.md` 代码证据索引
- [x] 1.16 `00-domain-blueprint.md` 领域蓝图：完整领域目录 + 现状/目标态 + 隐藏缺口
- [x] 1.17 `01`–`07` 同步目标态领域（BC-10～BC-14）与聚合 A13-A17

---

## 2. P0 代码修正

> 每个任务：先补回归测试（失败）→ 再改实现 → 全部测试通过后再继续下一项（ADR-012 批次内允许一次集中修复，但不得边跑边改）。

- [x] 2.1 **P0-03 计划清单边界**：删除 `ConversationPanel.applyChunk`（拆分后位于 `useChatStream.ts`）中 `propose_plan` 分支的 `addPlannedFiles`；删除 done 分支文本方案降级的 `addPlannedFiles`；保留 `userDecided(plan, confirm)` 的唯一派生。领域不变量测试覆盖“拒绝不落清单/确认才派生”；renderer 交互测试未新增（`4.4` 依赖环境）。
- [x] 2.2 **P0-01 读取边界**：`read` 改为 `requiresApproval:true` + `preApproval`（根内自动、根外授权）；ENOENT 目录提示只在根内。新增 `tools` 测试：根内 auto、根外 needApproval、根外拒绝不读取。
- [x] 2.3 **P0-02 只读判定收紧**：`classifyReadonly` 增加危险参数形态（`sed -i`、`find -exec/-delete/-fprint`、`awk system()/print >`、`sort -o`、`git branch -d/-D/-m/-M/-c/-C`、`git remote add/remove/rename/set-url`、`rg --pre`、`wget` 非 stdout 下载、`curl` 写副作用标志）。新增安全回归测试。
- [x] 2.4 **P0-04 进程守卫**：`killTree`/`killAllSubprocesses`/`recordPid` 与 `serviceManager.stopServer/stopAllServices` 增加 `pid > 0` 守卫；新增 `isKillablePid` 纯函数与单测（含 `pid=0`、`pid<0`、`pid` 缺失）。
- [x] 2.5 **P0-05 代跑边界**：`isSystemVerifiable` 只接受 `readonly` 与 localhost `network-read`；`verification.ts` 同步；新增 `verifyCompletion` 测试（外网 `curl` 证据不可代跑）。

---

## 3. P1 代码修正

- [x] 3.1 **P1-01 Web 访问边界**：`webTools.ts` 的 `web_fetch` 拒绝 localhost/私网/链路本地/云元数据地址；`redirect:'manual'` 逐跳校验，最多 5 跳，非 http/https 拒绝；新增测试。
- [x] 3.2 **P1-10 符号链接**：`isInSandbox`/`resolvePath` 对已存在路径使用 `realpath` 校验，根外链接不因“路径字符串在根内”被放行；悬空链接同样解析，write/edit 根内逃逸硬阻断（`sandboxSymlink.test.ts`）。
- [x] 3.3 **P1-04 IPC 契约校验**：高风险通道运行时 schema（`ipcSchema.ts`：tools/stream）+ 全通道静态契约测试（`ipcContractParity.test.ts`：main handler ↔ preload invoke ↔ 推送通道），防 preload/main 漂移。**2026-11-15 第二批**：新增 `config:set-key`/`config:set-web-access`、队列命令（enqueue/entry/reason/reorder）、验收（derive/mark/waive/evidence）、变更集、`delivery:apply-diff`/`revert-diff`、`tools:revert`、`completion:verify`、`context:resolve`/`rag:search`、`plugins:toggle`、`planned-files:add`、`session:plan-confirmed` 入口校验；校验器修正「required 值为 undefined 仍通过」与新增 `nullable`；schema 单测扩充。**2026-11-15 收尾**：队列 `enqueue` 的 `title` 与 `block`/`fail` 的 `reason` 提升为必填，避免空载荷进入存储后才抛泛化 TypeError；同批补齐 `gateway:validate`、工作区（list-dir/read-file/read-notebook/init-project/update-project-title）、`chat:log`、`timeline:log`/`query` 结构校验。

---

## 4. 验证

- [x] 4.1 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- [x] 4.2 `npx vitest run`（73 文件 / 850 用例通过，2026-11-16；含审查修复、P1-04 第二批、入口硬化、轻量/跨存储事务 Outbox、BC-02 权限规则持久化与安全复核新增回归；ADR-013 审查修复批补快照深校验/恢复竞态/WAL 耐久写回归；ADR-014 结构化澄清新增假设核对/来源制裁/JSON 回答/快照 v1 兼容回归）
- [x] 4.3 `npx eslint .`（0 error，6 条既有 hook 依赖 warning）
- [x] 4.4 `npx playwright test --project=interaction`（2026-11-15 全量 71/71 通过。两个既有 flaky 已定位并处置：
  ① `.nf-start` 启动竞态 = WSL/Chromium 偶发 `net::ERR_NETWORK_CHANGED`，网络栈变更取消模块请求，页面只剩空 `<div id="root">`（非应用启动逻辑 bug）——所有 interaction 入口统一走 `gotoStart`（启动超时一次重载重试 + DOM/bridge/hasKey/console 诊断），环境问题在测试层消除；
  ② 计划确认后重试双回合 = `finishError` 自动续跑与队列发送并发、旧回合清掉新回合 working、`messagesRef` 滞后导致失败路径覆盖消息——应用层改为 sid 归属校验 / 同步 working / 排队消息继任与自动续跑择一 / 引擎消息写入同步 ref；重试场景 10/10、全量 71/71。另修正 `use.expect` 配置被 Playwright 忽略的问题（断言超时 30s / 单测 90s）。
  **2026-11-15 代码审查修复后**全量 72/72（新增「第二轮失败重试重放第二轮上下文」回归）；队列已改多槽 FIFO，既有 approve-files 用例（1804）改为等 working 释放后操作（不再依赖旧单槽覆盖行为）。**排队回归补齐后**全量 74/74（新增「连续排队两条按序送达」「停止回填输入框」）。**入口硬化批次**：`approve-files 多卡并存` 用例（1560）也改为等 working 释放后再发送「继续」——原在流式未结束时发送会按排队语义进入 FIFO，第二卡在授权等待期间可能不生成（排队语义已由 `queue.interaction.ts` 单独覆盖）；repeat-each=5 稳定。）
- [x] 4.5 回归：现有 P0 用例与既有 `conversationState` / `tools` / `verifyCompletionSystem` 测试全部仍通过
- [x] 4.6 `npx prettier --check "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}" "*.mjs" "*.config.*"`（qa.yml 格式门禁；2026-11-15 对齐 42 个既有文件，326 行格式化，无逻辑变更）
- [x] 4.7 文档一致性（2026-11-15；2026-11-16 计数刷新）：14 spec / 69 Requirement / 268 Scenario（单 Requirement ≤5 Scenario）；`10-code-evidence.md` 行号刷新并校验 0 越界；`docs/ddd-rebuild` 相对链接 0 缺失；`docs/tests/coverage-matrix.md` 增补 73 文件 / 850 用例 / 81 场景快照与 BC-10～BC-14、BC-02、Outbox、ADR-013 恢复、ADR-014 结构化澄清覆盖表

---

## 5. 目标态领域（文档与实现均已完成）

> 这些任务的验收标准是对应 spec 的 Requirement/Scenario 全部可测试；实现顺序见 `00-domain-blueprint.md §6`。
> 2026-11-14 已全部实现；本文件保留原始排期作为追溯。

- [x] 5.1 BC-10 变更与版本：上下文/聚合 A13/不变量 I17/spec/design
- [x] 5.2 BC-11 任务编排：上下文/聚合 A14/不变量 I18/spec/design
- [x] 5.3 BC-12 用量与成本：上下文/聚合 A15/不变量 I19/spec/design
- [x] 5.4 BC-13 扩展与集成：上下文/聚合 A16/不变量 I20/spec/design
- [x] 5.5 BC-14 验收与质量门禁：上下文/聚合 A17/不变量 I21/spec/design
- [x] 5.6 实现 BC-10 变更集（优先级最高：交付真实性）
- [x] 5.7 实现 BC-14 验收门禁（与交付包/问题关闭接线）
- [x] 5.8 实现 BC-12 用量台账（依赖 gateway usage 解析）
- [x] 5.9 实现 BC-11 任务队列（依赖 Task 状态事件稳定）
- [x] 5.10 实现 BC-13 扩展/MCP/Git 集成（依赖 BC-02 安全边界）

---

## 6. 后续（部分已完成 / 预留）

- [x] 6.1 事件 `eventId/version` + dedupe + DLQ/启动重放 + **轻量 Outbox（2026-11-15）**：事件先入 `timeline-outbox.jsonl`（fsync），投递失败保留，启动重放，`outboxId` 幂等；持久化硬化同批完成：目标时间线先 fsync 再压缩、压缩 fsync/目录同步、尾部半行防护、启动重放在单实例锁之后、读失败可见且不缓存空索引、日期文件跨午夜按入队目标文件重放。**跨存储事务性 Outbox（2026-11-15）**：`stateTransaction.ts` WAL 把 BC-10 变更集（状态+自有基线）、BC-11 任务队列、BC-14 验收记录的状态写入与领域事件作为一条记录 fsync 提交；应用失败/事件待投递保留 WAL，启动 `drainStateTransactions()` 按 FIFO 重放；事件以 `txId:index` 幂等。工作区文件写入仍以快照+补偿为边界（不纳入跨文件系统事务）。崩溃恢复追加硬化：未换行的半条事务记录视为未提交并截断/忽略，不阻塞后续重放；提交未完成原因写入 `[state-tx]` 日志。
- [x] 6.2 `ConversationPanel.tsx` 拆分（应用层与领域编排分离）：阶段 1（纯格式化/展示辅助 → `conversationFormat.tsx`）、阶段 2（确认卡 → `DecisionCards.tsx`）、阶段 3（输入区 → `ConversationComposer.tsx`）、阶段 4a（历史构建 → `conversationHistory.ts`）、阶段 4b（流式事件 → `useChatStream.ts`）、阶段 4c（轮次编排 → `useChatEngine.ts`）、阶段 5（时间线/消息持久化/遥测/证据对账 → `useTimelineLog`/`useMessageStore`/`useConversationTelemetry`/`useEvidenceVerification`）已完成（2026-11-15，面板 3372 → 1320 行；interaction 76/76；单测 829），见 `09-openspec/p1-05-conversation-panel-split.md`
- [x] 6.3 演示面板与生产 UI 隔离（结构性）：生产运行无 `demo` 字段，仅测试桥注入
- [x] 6.4 交付包验收来源（DoD 对齐）接入真实来源，消除空验收（与 5.7 协同）
- [x] 6.5 **BC-02 权限规则持久化**（2026-11-15）：`permissionRulesStore`（0600、tmp+rename、校验/去重）+ `permissions:list`/`permissions:set` IPC + 设置页规则编辑；规则裁决修正为 `deny > allow > ask`，显式 `ask` 优先于只读 `preApproval`；存储/优先级/执行路径单测 + 设置页添加/删除 interaction。**安全复核（同日）**：规则按工具真实执行字段匹配（bash=command、read/write/edit=path 等，deny 取全部候选字段防 decoy）；路径规则按项目根 resolve 归一防 `..` 逃逸；bash allow 拒绝链式/重定向/命令替换；`ask` 仅接受 user 来源的 approved（auto/delegate/信任路径仍弹卡）；read allow 不越过项目根（含 symlink realpath）；设置页保存串行化（防双击/初次加载竞态覆盖规则）；单条坏规则只丢弃该条。L4 低危委托与信任阶梯可视化仍为演示（非目标）。

---

## 7. 代码审查修复（2026-11-15，`a524c4c..HEAD`）

> 来源：`/code-review`（medium；15 findings）。批次验收（ADR-012 测完再修）：双 tsconfig、单测 **765**（P1-04 第二批后 773）、ESLint 0 error / 6 既有 warning、构建、interaction **74/74**（review 批次 72/72 + 排队回归 2 项）。

- [x] 7.1 **批准文本判定收紧**：新增领域函数 `isApprovalIntent`（仅精确批准词）；原正则裸子串 `|批准|同意` 会让「我不同意执行这个命令」自动批准全部待授权工具调用。新增单测（否定/条件/完整句不批准）。
- [x] 7.2 **停止流归属**：`stopGeneration` 不再把 `streamingSidRef` 指向新 sid——旧流 chunk 继续被 `streamingSidRef !== sessionRef` 守卫丢弃（停止后不再落地 done/tool-call）。
- [x] 7.3 **失败回合重试上下文**：`runChat` 在请求前记录 `chatRef`——第二回合失败后的重试重放本回合（原沿用上一成功回合，丢掉失败的用户消息）。新增 interaction 回归。
- [x] 7.4 **排队衔接多槽 + 停止回填**：`pendingSendRef` 改 FIFO 数组（连续排队不再互相覆盖）；显式停止把排队中的**用户**消息回填输入框（系统对账引导丢弃），修复停止后滞留与下一轮乱序（b70e8ae 回归）。新增 interaction 回归：连续排队两条按序送达、停止回填输入框。
- [x] 7.5 **工具结果稳定 id 绑定**：`useChatStream` 四个卡更新路径改用 `isThisCall`（id 优先、旧存档回退 name），异步结果在全部消息中定位承载调用（迟到结果不再丢弃/挂错同名卡）。
- [x] 7.6 **ask_user 已回复判定**：面板按消息对象引用反查消息位置（内层 toolCalls map 的 `i` 会遮蔽消息索引），第二轮起不再误标「已回复」。
- [x] 7.7 **目标卡空值回退**：`??` → `||`（空 `initialPrompt/statement` 回退「你描述的目标」，不再写空标题）。
- [x] 7.8 **对账回合归属**：`verifyThenResolve` 捕获发起时 sid；停止/新回合后不再置 resolution、绑定验收证据或回填引导。
- [x] 7.9 **一次性自动续跑不空耗**：`finishError` 先判排队消息再置 `autoRetriedServiceRef`——排队消息继任的回合仍有一次自动恢复机会。
- [x] 7.10 **Web Key 保存边界**：设置页仅提交用户实际编辑的 Key（开关/URL/探测等保存不再把 env/文件值回写、不再误删存储 Key）。
- [x] 7.11 **Web Key 来源标注与脱敏**：`getWebAccess` 返回 `searchKeySource/keenableApiKeySource`；IPC 对 env/file 值脱敏（设置页不回填）。env/凭据文件优先的既有语义不变。
- [x] 7.12 **Web Key opt-in 明文副本**：与 API Key 同策略（`webSearchKeyPlain`/`webKeenableApiKeyPlain`，仅 `NEONFORGE_ALLOW_PLAINTEXT_KEY=1`；keychain 解密失败可回退）。
- [x] 7.13 **Key 失效恢复提示（finding 3）**：错误气泡与首次配置页明确「env/凭据文件优先于应用内保存」；配置页保存后若来源仍是 env/file 不再假报成功。**优先级语义保持既有设计，不改为应用内覆盖 env。**
- [x] 7.14 **启动导航重试**：`gotoStart` 对 `page.goto` 本身被 `ERR_NETWORK_CHANGED` 中断也重试一次（原只覆盖导航成功后的挂载失败）。
- [x] 7.15 **排队消息优先于自动续聊**（2026-11-15 全量 interaction 根因）：`maybeContinue` 在工具链本轮完成（`pending.length===0`）且 `pendingSendRef` 非空时释放 working 并停止自动续聊，由 `send` 的 finally 按序衔接待发消息。原行为自动续聊与排队确认消息各发一轮 → 重复回合触发 ADR-010 强制澄清并干扰多张授权卡并存（`approve-files 多卡` 用例在 full suite 偶发失败；修复后 core 87/87×3、全量 76/76）。
- [x] 7.16 **重试回合衔接排队消息**：`retryFailedTurn` 增加 `finally`（sid 归属校验后释放 working + `flushPendingSend`）。原重试期间排队的用户消息会滞留到下一次发送（计划确认自动续跑用例因此无「重试」按钮）；retry 文件 15/15、全量 76/76。

---

## 8. V2 Roadmap · GitHub #11（任务状态机跨重启，2026-11-15）

- [x] 8.1 开工前细化：`docs/decisions/013-task-snapshot-cross-restart.md`（ADR-013 accepted）+ `docs/design/stage-specs/V2-task-snapshot.md`（DoD/TDD 网格/边界）
- [x] 8.2 领域层 `D/taskSnapshot.ts`：`toTaskSnapshot/fromTaskSnapshot` 全字段序列化 + 运行时校验（版本/类型/枚举/聚合不变量）；损坏快照返回 null
- [x] 8.3 `R/sessionStore.ts` V2 会话记录：消息 + 任务快照一次 `setItem` 原子写；兼容旧 V1 数组（消息可读、任务为空）；`clearSession` 同时清空
- [x] 8.4 `R/useConversationState.ts` `restoreTaskState`：系统初始化路径，不派生领域事件；`R/useMessageStore.ts` 恢复时任务快照优先、旧消息 decisionContent 兜底；持久化随消息同记录
- [x] 8.5 渲染镜像同步：`MainWorkspace.handleTaskStateRestored` 恢复 goal/plan 确认位；`restorePlanned` 与 main 批准事实**并集**（防空 main 覆盖已确认方案清单）
- [x] 8.6 测试：`tests/unit/taskSnapshot.test.ts`（10：含嵌套决策内容深校验与领域合法边界态）、`sessionStore.test.ts` V2/兼容（含待授权工具卡保留）、`tests/interaction/sessionRestore.interaction.ts`（3：方案卡恢复、planConfirmed 镜像与启动无伪造事件、待授权工具卡恢复）；全量 71 文件 / 837 用例、interaction 78/78（ADR-013 阶段时点；#13 批次全量见 §9）
- [ ] 8.7 push + CI 绿（用户当前要求不推送）

---

## 9. V2 Roadmap · GitHub #13（结构化澄清与假设来源，2026-11-16）

- [x] 9.1 开工前细化：`docs/decisions/014-structured-clarify-assumptions.md`（ADR-014 accepted）+ `docs/design/stage-specs/V2-structured-clarify.md`（DoD/TDD 网格/边界）
- [x] 9.2 领域值对象 `D/conversationState.ts`：`AssumptionSource` + `Assumption{text,source}`；GoalProposal/PlanProposal 假设升级为 `Assumption[]`
- [x] 9.3 协议层 `D/protocolTools.ts`：`ask_user.assumptions`（≤6 条待核对假设）+ 提议假设校验/归一化（旧 string[] → `model_inference`，非法 source 路径化回灌）
- [x] 9.4 渲染层 `R/AssumptionCheckCard.tsx`（逐条符合/不符合 + 修正 + 提交结构化【澄清回答】）、`R/AssumptionList` 来源标签（你的选择/你的澄清/模型推断）
- [x] 9.5 提示词 `sysPrompt` ⑬/⑭ 同步：假设不确定时用 `ask_user.assumptions` 核对；提议假设用 `{text,source}` 标注来源
- [x] 9.6 持久化兼容 `D/taskSnapshot.ts`/`D/planProposalParser.ts`：旧字符串假设归一化、结构化来源跨重启保留、文本降级标记为模型推断
- [x] 9.7 测试：`protocolTools.test.ts`（假设 schema/来源校验/归一化映射）、`taskSnapshot.test.ts`（v1/v2 兼容、空串跳过、来源保留/非法来源）、`clarifyAnswer.test.ts`（JSON 往返与注入防护）、`assumptionEvidence.test.ts`（来源制裁）、`planProposalParser.test.ts`、`structuredClarify.interaction.ts`（3 场景）；全量 73 文件 / 850 用例、interaction 81/81
- [ ] 9.8 push + CI 绿（用户当前要求不推送）

---

## 验收标准

1. 14 个 spec 全部通过 OpenSpec 格式校验（Requirement/Scenario 计数、无技术细节渗透；2026-11-15 计数复核：69 Requirement / 268 Scenario，单 Requirement ≤5 Scenario）。
2. P0-01..P0-05 全部有失败先行回归测试，修复后通过。
3. 双 tsconfig 类型检查、单测、lint 全绿。
4. 文档中的每条“现状”断言都能在 `10-code-evidence.md` 找到 `文件:行` 证据。
5. 目标态领域（BC-10～BC-14）在 00/03/04/05/06/07/08/09 中均有上下文、聚合、不变量、事件、spec 与实现顺序；实现状态与 `10-code-evidence.md` 一致（2026-11-14 已落地）。
