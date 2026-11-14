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

- [x] 2.1 **P0-03 计划清单边界**：删除 `ConversationPanel.applyChunk` 中 `propose_plan` 分支的 `addPlannedFiles`（`ConversationPanel.tsx:880-883`）；删除 done 分支文本方案降级的 `addPlannedFiles`（`1145-1153`）；保留 `userDecided(plan, confirm)` 的唯一派生。领域不变量测试覆盖“拒绝不落清单/确认才派生”；renderer 交互测试未新增（`4.4` 依赖环境）。
- [x] 2.2 **P0-01 读取边界**：`read` 改为 `requiresApproval:true` + `preApproval`（根内自动、根外授权）；ENOENT 目录提示只在根内。新增 `tools` 测试：根内 auto、根外 needApproval、根外拒绝不读取。
- [x] 2.3 **P0-02 只读判定收紧**：`classifyReadonly` 增加危险参数形态（`sed -i`、`find -exec/-delete/-fprint`、`awk system()/print >`、`sort -o`、`git branch -d/-D/-m/-M/-c/-C`、`git remote add/remove/rename/set-url`、`rg --pre`、`wget` 非 stdout 下载、`curl` 写副作用标志）。新增安全回归测试。
- [x] 2.4 **P0-04 进程守卫**：`killTree`/`killAllSubprocesses`/`recordPid` 与 `serviceManager.stopServer/stopAllServices` 增加 `pid > 0` 守卫；新增 `isKillablePid` 纯函数与单测（含 `pid=0`、`pid<0`、`pid` 缺失）。
- [x] 2.5 **P0-05 代跑边界**：`isSystemVerifiable` 只接受 `readonly` 与 localhost `network-read`；`verification.ts` 同步；新增 `verifyCompletion` 测试（外网 `curl` 证据不可代跑）。

---

## 3. P1 代码修正

- [x] 3.1 **P1-01 Web 访问边界**：`webTools.ts` 的 `web_fetch` 拒绝 localhost/私网/链路本地/云元数据地址；`redirect:'manual'` 逐跳校验，最多 5 跳，非 http/https 拒绝；新增测试。
- [x] 3.2 **P1-10 符号链接**：`isInSandbox`/`resolvePath` 对已存在路径使用 `realpath` 校验，根外链接不因“路径字符串在根内”被放行；悬空链接同样解析，write/edit 根内逃逸硬阻断（`sandboxSymlink.test.ts`）。
- [x] 3.3 **P1-04 IPC 契约校验**：高风险通道运行时 schema（`ipcSchema.ts`：tools/stream）+ 全通道静态契约测试（`ipcContractParity.test.ts`：main handler ↔ preload invoke ↔ 推送通道），防 preload/main 漂移。

---

## 4. 验证

- [x] 4.1 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- [x] 4.2 `npx vitest run`（66 文件 / 758 用例通过，2026-11-15）
- [x] 4.3 `npx eslint .`（0 error，6 条既有 hook 依赖 warning）
- [ ] 4.4 `npx playwright test --project=interaction`（环境可用时；2026-11-14 实跑 71 项：68 通过 / 3 flaky——start 页竞态与自动续跑竞态，base 复现，非本分支回归；未以 flaky 结果关闭本项）
- [x] 4.5 回归：现有 P0 用例与既有 `conversationState` / `tools` / `verifyCompletionSystem` 测试全部仍通过

---

## 5. 目标态领域（文档已完成，实现待排期）

> 这些任务的验收标准是对应 spec 的 Requirement/Scenario 全部可测试；实现顺序见 `00-domain-blueprint.md §6`。
> 本次只完成文档与 spec，不在此变更中实现运行时。

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

## 6. 后续（本次不做，已设计预留）

- [x] 6.1 事件 `eventId/version` + dedupe + DLQ/启动重放（跨上下文事务性 Outbox 仍预留）
- [ ] 6.2 `ConversationPanel.tsx` 拆分（应用层与领域编排分离）：阶段 1（纯格式化/展示辅助 → `conversationFormat.tsx`）、阶段 2（确认卡 → `DecisionCards.tsx`）与阶段 3（输入区 → `ConversationComposer.tsx`）已完成（2026-11-15）；后续阶段见 `09-openspec/p1-05-conversation-panel-split.md`
- [x] 6.3 演示面板与生产 UI 隔离（结构性）：生产运行无 `demo` 字段，仅测试桥注入
- [x] 6.4 交付包验收来源（DoD 对齐）接入真实来源，消除空验收（与 5.7 协同）

---

## 验收标准

1. 14 个 spec 全部通过 OpenSpec 格式校验（Requirement/Scenario 计数、无技术细节渗透）。
2. P0-01..P0-05 全部有失败先行回归测试，修复后通过。
3. 双 tsconfig 类型检查、单测、lint 全绿。
4. 文档中的每条“现状”断言都能在 `10-code-evidence.md` 找到 `文件:行` 证据。
5. 目标态领域（BC-10～BC-14）在 00/03/04/05/06/07/08/09 中均有上下文、聚合、不变量、事件、spec 与实现顺序，且明确标注“未实现”。
