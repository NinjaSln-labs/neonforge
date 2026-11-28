# 全代码死代码与改进审计（2026-11-28）

> 范围：`apps/desktop` 全部生产代码（`src/main`、`src/domain`、`src/renderer`、`src/preload`）+ 测试/构建/CI 配置。
> 方法：codegraph 符号检索 + 全库 `rg -w` 交叉验证（src / tests / evals / preload / renderer 五侧）+ 逐项人工复核；
> 主进程由独立审计代理全文件扫描（63 文件 import 图可达性验证），其余进程逐批人工审查。
> 结论：**修复 28 项、产品决策 5 项待定、确认非问题 4 类**；无协议/数据迁移，无新增运行时依赖。

## 一、修复项（按批次）

### 批次 13–15：取证补强（发现并修复 1 个产品缺陷）

| ID | 位置 | 问题 | 修复 |
|----|------|------|------|
| A-01 | `src/main/tools.ts` + `envManager.ts` | `capability.ledger_updated` 恒发射 `capabilityId: ''`（归因函数返回 void）——失败归因事件不可诊断 | `attributeCommandFailure` 返回首个命中 `capabilityId`（判定序 node-runtime > python-runtime > dev-tools）；无归因不发事件 |
| A-02 | `src/main/tools.ts` | `isValidOpenUrl` 生产导出仅测试使用（`@deprecated`） | 移入 `tests/unit/tools.test.ts` 本地 helper |
| A-03 | `docs/tests/coverage-matrix.md` | 批次 13/15 行标记未更新 | 补 ✅ 与断言描述 |

### 批次 16：ADR-019 死事件清理（93 → 90）

5 个零发射点事件逐项根因取证后：3 个被更好机制取代 → 删除；2 个为 V1.5/V2 预留 → 保留并标注。

| 事件 | 根因 | 处置 |
|---|---|---|
| `plan.rejected` | 登记当日即被 `tool.blocked` gate=`out-of-plan`（载荷更全）取代，全历史 0 发射点 | 删除 |
| `card.dismissed` | 卡终结由 `card.resolved`/`card.rejected` 覆盖；任务重置由 `conversation.created` 承载 | 删除 |
| `dialogue.needs_human` | ADR-010 三级梯度只落地一、二级；三级语义由 `stuck.needs_human` 实际承载 | 删除 |
| `changeset.reviewed` | 领域函数 `reviewItem()` 已实现有单测，IPC/UI 随批次 4 裁定 V1.5 延后 | 保留（标注 V1.5） |
| `usage.period_closed` | 注册表注释自证预留；预算按自然月累计但无周期关闭动作 | 保留（标注 V2） |

### 批次 17–18：渲染器/域层死代码与构建卫生

| ID | 位置 | 问题 | 修复 |
|----|------|------|------|
| B-01 | `.github/workflows/qa.yml` | CI 只跑默认 tsconfig → **`src/main` 从未被类型检查** | 双 tsc 步骤 |
| B-02 | `.github/workflows/qa.yml` | 无 `pull_request` 触发 → PR 阶段无门禁 | 补触发（4 路径过滤） |
| B-03 | `eslint.config.js` | `files: ['apps/desktop/{...}']` 双前缀 glob 永不匹配 → 死规则 | 修为 `**/*.config.*` |
| B-04 | `tsconfig.main.json` | 无 `lib` 声明 → DOM 类型泄漏进主进程；`include` 含 preload（产物为死 `.js`） | `lib: ["ES2022"]` + include 收为 main/domain |
| B-05 | `package.json` | zustand 为无用运行时依赖；esbuild/playwright/@types/node 未声明 | 删 zustand；三者入 devDependencies |
| B-06 | `.npmrc` | 仓库根副本对 npm 无效（依赖根在 apps/desktop） | 复制到 `apps/desktop/.npmrc` |
| B-07 | `package.json` | 无 `engines`；`overrides.extract-zip` 为 no-op | 补 engines ≥22.22.1；删 override |
| B-08 | `package.json` `dev:electron` | 未设 `VITE_DEV_SERVER_URL` → 开发模式不连 Vite | 补环境变量 |
| B-09 | `.gitignore` | playwright 报告产物未忽略 | 补两条 |
| B-10 | `changeSet.ts` | `supersedeChangeSet`、`'superseded'` 成员、`deriveStatus` 全库零引用 | 删除（含 renderer 镜像与标签） |
| B-11 | `conversationState.ts` | `PlanFileEntry`、`TaskState` 别名、`userDecided` 内 no-op `if (point === 'approval')` | 删除 |
| B-12 | `agentLoop.ts` | `detectStuck` 的 `config` 参数从无调用者传值 | 删除参数，常量 2/2 内联 |
| B-13 | `problemLedger.ts` / `problemStore.ts` | `PROBLEM_LEDGER_SCHEMA` 死导出；`PROBLEMS_MAX` 双源 | 删 schema；store 改从 domain 导入 |
| B-14 | `useToolApproval.ts` | `calls` 参数三个方法内未用；`pending.forEach` 三次 `indexOf` | 删参数；`calls.indexOf(c)` 内联 |
| B-15 | `useConversationTelemetry.ts` | `goalConfirmed`/`planConfirmed` 依赖项从不被调方使用 | 删字段与调用点 |
| B-16 | `useChatStream.ts` | `onReasoning` 回调链从未接线 | 删链路 |
| B-17 | `DeliveryPanel/OutputPanel/MainWorkspace` | `onClose` 死 prop 链；`zeroToOneMode` prop + App 状态 | 删除 |
| B-18 | `providers/catalog.ts` | `isAllowedModel`/`ALLOWED_MODELS` 死导出 | 删除 |
| B-19 | `src/domain/timeline.ts` | 6 个 `task.execution_*`/`task.achievement_*` 旧别名——timeline 为**只写**存储，所谓「读取窗口」不存在（replay/DLQ 按原始 type 字符串消费，`query` 只按请求类型精确过滤） | 删除（注册表 90 → 84） |

### 批次 19：CI 根因修复 + 主进程死符号（14 项）

**CI 失败根因（非环境抖动）**：electron 43 的 npm 包**无 postinstall 脚本**（`node_modules/electron/package.json` 的 `scripts` 为 `undefined`），二进制由 `node_modules/electron/index.js` 在首次 `require('electron')` 时**同步 `spawnSync` 懒下载**。干净 `npm ci`（CI）后，首个 import 主进程模块且未 mock electron 的单测触发下载 → 撞 5s 测试超时。

取证：CI 日志 `Downloading Electron binary...` 出现在 07:55:27.845 与 07:55:31.668，紧邻两个超时测试（`timelineFile` 5730ms、`write` 9649ms）；两个运行（push/PR）失败测试完全相同；同文件后续测试均 1–15ms 正常（仅「文件内首个测试」受灾）。隔离工作树全新 `npm ci` + 4 worker 复现：首跑 3 failed / 57.19s，后续 80/80 / 5.5s。

修复：`vitest.config.ts` 设 `ELECTRON_OVERRIDE_DIST_PATH` 指向不存在路径——`index.js` 在该变量判定的分支先于下载，彻底切断懒下载；不影响 `vi.mock('electron')`。隔离工作树两次冷跑 80/80 / 5.57s、5.58s，`dist` 从未生成。

### 批次 21：CI-only L3 失败牵出的真缺陷（StrictMode 双发遥测）

CI 的 L3 断言 `capability.checked` 期望 1 条、实际 2 条。取证：给 mock `tools.execute` 加调用计数，得到 `["check-capability","read"]`（**execute 只跑一次**），而事件打点两次——排除工具重复执行。

根因：`useChatStream.ts` 的 `tlog('capability.checked', …)` 写在 `setMessages` 的 updater 内。React StrictMode（`main.tsx` 已启用）在开发构建下**双调 updater**，updater 内的副作用因此执行两次。同文件第 614 行已注释该危险模式（「工具执行副作用移出 updater——StrictMode 双调会执行两次」），但该遥测调用漏网。

影响：开发/测试构建下每次能力检测产生一条重复时间线事件（生产构建不双调，但 JSX 约定要求 updater 纯函数，违反本身即缺陷）。

修复：能力摘要计算与 `tlog` 移到 `setMessages` 之前，updater 只构建下一状态。L3 断言改为「恰好 1 条」，并做**负控验证**：把 tlog 移回 updater 内 → 测试失败（Expected 3 / Received 4），恢复后通过。

| ID | 符号 | 证据 |
|----|------|------|
| C-01 | `envManager: binDirOf` | 0 引用；同一路径在 92/184 行内联重算 |
| C-02 | `envManager: registerEnvironment` | 0 引用；`envs` 仅由 ensure/allocate/release 直写 |
| C-03 | `envManager: isPortAllocated` | 0 引用 |
| C-04 | `envManager: getCapability` | 0 引用；能力读取走 `detectCapabilities` |
| C-05 | `serviceManager: listServices` | 0 引用 |
| C-06 | `timelineLogger: getTimelineWriteStats` + `writeFailures` | 0 引用；计数器只写不读（`lastWriteError` 仍被 DLQ 消费，保留） |
| C-07 | `lsp: LspService.isConnected` | 0 调用；`requireConn` 直接查 `conn.isRunning()` |
| C-08 | `workspace: WorkspaceService.setCurrentRoot` | 0 调用；`currentRoot` 三处直写 |
| C-09 | `tools: ToolRegistry.getRules` | 0 调用；`permissions:list` 返回 `store.load()` 结果（注释声称的「执行侧快照」与实现不符，一并修正） |
| C-10 | `ipcSchema: IPC_SCHEMAS.apiKey` | 0 引用；`apiKeySet` 为在用条目 |
| C-11 | `gateway: ModelRouter.userRequestedPro` | 唯一调用点只传 `{ thinking }`，字段无生产者 |
| C-12 | `gateway: ModelID` 弃用别名 + `model?` 选项 | 唯一消费者为 gateway 自身；IPC 从不传 `model` |
| C-13 | `gateway: forceTool` / `progressMode` 字段 | gateway 内零读取（`streamChatOnce` 的 opts 读取清单无此二者）；IPC 载荷字段保留以兼容契约，main 不再转译 |
| C-14 | `gitBridge: GitReadAction` | **非死码而是未接线**——`gitRead` 原为裸 `string`；改为 `isGitReadAction()` 运行时校验 + 穷尽 switch，错误文案不变 |

## 二、产品决策项（5 项，待定）

### D-1 八个无消费者的 IPC 端点（建议：删除端点 + 其 store 方法）

`config:clear-key`、`usage:export`、`acceptance:waive`、`queue:fail`、`queue:clear`、`timeline:query`、`rag:search`、`mcp:status`。

证据：renderer 0 引用；preload 各 1 处仅为通道声明；测试仅 mockBridge stub 或 store 单测；e2e/evals 0 引用。注意 `ipcContractParity.test.ts` 双向断言「main handler ⇄ preload invoke」——删除需三处同步（main/preload/mockBridge）。
关联死 store 方法：`ConfigStore.clearApiKey`、`UsageStore.exportCsv`、`TaskQueueStore.fail/clear`、`TimelineLogger.query`、`McpManager.status`、`CodeRag` 仅经 `rag:search` 的检索入口（工具侧 `search` 仍用 CodeRag，故 CodeRag 本身保留）。

建议删除理由：死通道扩大攻击面（IPC 可被 renderer 任意调用）且长期维护成本高于「将来可能用」。若需保留 `timeline:query` 作调试接口，应移入仅开发构建可用的条件注册。

### D-2 三个演示面板（建议：删除）

`DigitalDeliveryPanel`、`TrustLadderPanel`、`DoDAlignPanel`——纯 fixture 展示，无产品数据源。建议移除组件与路由引用，保留设计文档叙述。

### D-3 LSP 打包（建议：`extraResources`）

`typescript-language-server` 为 devDependency，未随包分发 → 生产环境 LSP 能力静默降级。建议 `extraResources` 打包并在 `lsp.ts` 增加「不可用」结构化状态，而非静默失败。

### D-4 测试/配置类型检查（建议：新建 `tsconfig.test.json`，先覆盖 `tests/unit`）

现状 114 个类型错误，其中 66 个集中在已迁移的旧 `core.interaction.ts` mock。建议先对 `tests/unit` 单独开 `tsconfig.test.json`（`types: ["vitest/globals","node"]`），逐步收敛；旧 mock 随后续迁移自然消失。

### D-5 electron-builder 重复打包（建议：排除 `node_modules` 中的 monaco/react）

渲染器已由 Vite 打包，electron-builder 再从 `node_modules` 重打包会显著膨胀安装包。建议 `files` 排除并实测安装包体积。

## 三、compact 遗留策略（已修复——批次 20）

`src/main/compact.ts` 的 `decideCompact`/`compactHint`/`COMPACT_THRESHOLD`/`COMPACT_TARGET` 仅测试使用；生产走 `compaction.shouldCompact/compact`，而 renderer 在 `ConversationPanel.tsx` **内联复制**了 24/12 阈值与提示文案——双源漂移风险。

处置：提示阈值/保留条数/文案收敛到 `src/domain/compactionPolicy.ts`（renderer 可直接导入 domain），两侧共同导入；`compact.ts` 遗留策略删除。注意语义区分：提示阈值（24，温和提醒）≠ 触发阈值（`compaction.shouldCompact` 的 100 条 / 200K 字符，真正执行压缩）——已在 domain 文件头注释写明。

## 四、确认非问题（不改）

1. **144 个静默 catch**：既有「日志/遥测失败不阻断业务」策略，逐项审查未见吞掉业务错误。
2. **无幻影桥调用**：113 个 `window.neonforge` 引用逐一对 preload 声明核对，全部存在。
3. **主进程 63 文件无孤儿模块**：全部从 `main.ts` 入口经 import 图可达。审计代理的疑似死码 `McpClient.close/initialize/listTools/callTool`（接口动态分派）、`problems.load`、`plannedFiles.load` 均有真实调用方。
4. **LOW 级重复实现**（`syncDirBestEffort` x5、`safeName` x2、`appendLineDurable` x2）：各副本均为活代码（且 `appendLineDurable` 实现语义不同），属合并重构候选而非死码。

## 五、门禁与验证

| 层 | 结果 |
|----|------|
| 双 tsc | ✅ 0 错（`tsconfig.json` + `tsconfig.main.json`） |
| ESLint | ✅ 0 error（6 条既有 React Hook 依赖 warning） |
| Prettier | ✅ 全过 |
| L1 | ✅ 80 文件 / 977 用例 |
| L3 interaction | ✅ 96 passed / 3 skipped |
| 事件注册表 | 93 → 90（ADR-019）→ **84**（批次 18） |

## 六、遗留

- D-1 ~ D-5 待产品裁定。
- `changeset.reviewed`（V1.5 变更审核 UI）、`usage.period_closed`（V2 周期结算）为预留登记。
- 外部验证缺口：真实网络抖动、多机 macOS、真人可用性研究（当前评测报告均为脚本化，`human=false`）。
