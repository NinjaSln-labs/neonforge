# S1 出口异构审计（dac12a7..a7b3979，HEAD a7b3979）

- 审计者：root 轮值以外的会话通道（不强求同池异构；本会话实际＝root 自跑，但报告口径与提交者解耦）
- 仓库：本机检出（分支 docs/neonforge-v1.0.0，HEAD a7b3979，工作树净）
- 审计射程：S1b 20 commit＝dac12a7..a7b3979；S1a 区间（dac12a7 之前）已独立审计见 `docs/audits/s1a-heterogeneous-audit-2026-10-05.md`
- 依据工件：stage-spec `V1-S1-legacy-freeze-vertical-skeleton.md` DoD A–G（**A–G 逐条核对源**）＋plan `2026-10-05-s1b-gateway-ipc-presentation.md`（9 任务＋S1 全出口闸定义）＋ADR-028 Decision 3/4（归档＋复用面清单）＋详设 v0.4（§6 22 事件闭集／§7 IPC 通道集／§8 静态闸承载体／§9 时序）＋S1a 异构审计（N1–N8 已修入基线）

---

## 结论（一行）：**有条件可采纳 — 无阻断项**；L3 interaction 用例集（自报 14 绿）审计者**未独立复现**，G-1 与四静态闸、领域面双 tsc、L1 用例数与可红自证全部落地且自洽，但 S1a 审计 N2 提到的「`TimelineLog` 私有构造器」修入被声明但代码面未实做（注释失真）。

---

## 一、独立复现的闸（与自报一致）

| 闸 | 命令 | 实测 | 自报 | 一致 |
|---|---|---|---|---|
| 双 tsc renderer | `npx tsc -p tsconfig.json --noEmit` | rc=0（0 error） | 0 错 | ✅ |
| 双 tsc main | `npx tsc -p tsconfig.main.json --noEmit` | rc=0（0 error） | 0 错 | ✅ |
| L1 全量 | `npx vitest run`（cwd `apps/desktop`） | 32 文件，187 绿｜4 skip（191） | 187 绿｜4 skip | ✅ |
| e2e 假轨 | `cd apps/desktop && npm run e2e` | 1 文件，2 绿｜1 skip | 2 绿｜1 skip | ✅ |
| eslint | `npx eslint .` | rc=0 | 0 错 | ✅ |
| desens | `python3 tools/desens-scan.py`（仓库根） | rc=0 | rc=0 | ✅ |
| G-1 静态 | `npx vitest run tests/static/noLegacyImport.test.ts` | 3 绿 | 绿 | ✅ |
| 三静态闸 | `appendSingleWriter` / `s1WritePath` / `s2ProviderName` | 10 绿 | 绿 | ✅ |
| B1–B4 timeline | `eventCatalog`/`payloadKeys`/`append`/`publishDiscipline` | 30 绿 | 绿 | ✅ |
| S1b 关键单元 | `domainRuntime`/`ipc.channels`/`preload.bridge`/`e2eDomainLoop` | 29 绿 | 绿 | ✅ |

## 二、未独立复现的闸（需用户亲裁／CI 复核）

| 闸 | 命令 | 实测 | 自报 | 备注 |
|---|---|---|---|---|
| playwright interaction L3 | `npx playwright test --project=interaction` | **挂死未出**（webServer vite 在本会话 shell 起 `localhost:5175` 长时间无响应，60s+ 仍未 `webServer ready`；同会话 4 任务并行跑 vitest 抢端口可能放大效应） | 14 绿 | **未独立复现**；任务书「shell 被权限挡死如实记『未独立复现』」的纪律落地为此项 |
| e2e 真轨 | `NF_*` 环境 | 无 Key 环境（自报亦未跑） | blocked | 与计划 Task 8 Step 3＋G5 一致，**不判红、不预绿** |

## 三、stage-spec DoD A–G 逐条核对

### A 归档批（ADR-028）

- **A1** ✅ `git rev-parse legacy-freeze-v0.1.0` ⇒ `1aadd4c33c067e6ef78061f04498e80885b41e0a`；`git show legacy-freeze-v0.1.0:apps/desktop/src/domain/conversationState.ts | wc -l` ⇒ **958 行**（与 ADR-028 Context 1「`conversationState.ts`(958)」逐字对齐）；`git cat-file -t legacy-freeze-v0.1.0` ⇒ `commit`，轻量 tag 无署名面。
- **A2** ✅ 现场 `test ! -e` 全绿：
  - A2.1 旧领域 5 件：`conversationState.ts` / `agentLoop.ts` / `protocolTools.ts` / `planProposalParser.ts` / `completionClaimParser.ts` 全 GONE。
  - A2.2 旧呈现 24 件：`ConversationPanel.tsx` / `CandidateButtons.tsx` / `DeliveryPanel.tsx` / `DigitalDeliveryPanel.tsx` / `DoDAlignPanel.tsx` / `OutputPanel.tsx` / `SessionPanel.tsx` / `StartPage.tsx` / `TrustLadderPanel.tsx` / `SettingsPanel.tsx` / `MainWorkspace.tsx` / `FileTree.tsx` / `scenes.tsx` / `authModel.ts` / `candidates.ts` / `demoBridge.ts` / `errorClassify.ts` / `problemStore.ts` / `sessionStore.ts` / `sysPrompt.ts` / `systemNudge.ts` / `textClean.ts` / `useConversationState.ts` / `useToolApproval.ts` 全 GONE。
  - A2.3 旧测试：`tests/visual/` GONE；`snapshots/` GONE（`playwright.config.ts` 的 `snapshotDir: './snapshots'` 定位到 `apps/desktop/snapshots/`，本不在 `tests/` 下，独立 `ls` 确认）；旧 `tests/unit/**` 45 文件已随旧领域清零。
  - A2.4 旧 UAT/e2e：`scripts-cdp/` GONE；`e2e-sim/` GONE；`apps/desktop/e2e-*.mjs`（6 个）GONE。
  - A2.5 旧 main 时间线：`src/main/timelineLogger.ts` GONE。
- **A2.2 保留面反向断言** ✅ `ConfigPage.tsx` / `icons.tsx` / `styles.css` / `diffRender.ts` 全 PRESENT。
- **A3** ✅ G-1 闸主断言 `src/** 全树零 import 归档面` 绿（`noLegacyImport.test.ts`）；逐处 grep `import.*from|require\(` 含归档名 0 命中（注释串提及不计——见 finding F-3）。
- **A4** ✅ L1 用例 187 全来自新树（`tests/unit` 27 + `tests/static` 4 + `tests/e2e` 1 + `tests/helpers` 间接），旧 769 归零重建未以旧数充新数。
- **A5** ✅
  - A5.1 G-1 主断言绿。
  - A5.2 fixture 自证：领域侧 `import { x } from '../conversationState.js'` ⇒ 命中、旧呈现侧 `import Panel from './ConversationPanel'` ⇒ 命中、反例合法新域 `import { TimelineLog } from '../timeline.js'` ⇒ 不命中。
- **A6** ✅ 双 tsc 0 错、eslint 0 错、desens rc=0（三项均独立复现）。

### B 事件注册表与时间线单一写者（I-2）

- **B1** ✅ `tests/unit/timeline.eventCatalog.test.ts` 22 名闭集＋顺序与段3 §5 逐字一致（仅 4 子测文件运行过的 30 项中含此测，本会话未逐条 dump；与 S1a 审计报告 N 区「查过且没问题的地方」对账——S1a 已核对一致，本期未变更 timeline.ts 注册表）。
- **B2** ✅ `tests/unit/timeline.payloadKeys.test.ts` 17 发射事件载荷键逐条断言绿（仅 dump 了 11 条段尾样本；主文件全 30 绿）。
- **B3** ✅ `timeline.append.test.ts`（并发追加无重无跳＋失败回滚）＋`appendSingleWriter.test.ts`（静态面 `record/构造 仅经聚合与机制口`）共 4 绿；本会话**未发现非机制口 `.record(` 调用**（仅 `timelineRepo.ts:11` 机制口＋`applyChange.ts:58` 异聚合的 `EvidenceItem.record`）。
- **B4** ✅ `timeline.publishDiscipline.test.ts` 4 绿；「对外发布通道＝0（无 process.send/网络/WS），扫描面＝新域全树」**已按 S1a N7 修入**。

### C 不变量判据（C1–C15）

- **C1 I-1** ✅ `tests/unit/turn.admission.test.ts` 含 5 用例（含「并发两次 StartTurn ⇒ 至多一次成功；失败方输入入队非丢弃」——编排器 `startOrEnqueue` 承担 I-1 拒方转投 InstructionQueue，与 §9 步2 时序对齐）；`ipc.channels.test.ts` 「`turn:start` 在飞位占用 ⇒ 输入入队而非丢弃（C1 输者归宿），I-1 不外抛」绿（IPC 侧已接线）。
- **C2 I-3** ✅ `decisionPoint.test.ts` ≥3；IPC 侧 `decision:resolve` 二次决议幂等拒绿。
- **C3 I-4** ✅ `instructionQueue.test.ts` 7 用例（≥4）。
- **C4 I-5** ✅ `evidence.claim.test.ts` 6 用例（≥5）＋`evidence.provenance.test.ts` 恒等值检查（双 tsc 承载）。
- **C5 I-6** ✅ `delegation.stateMachine.test.ts` ≥1；IPC 侧 `change:produce` 未过闸 ⇒ `produced:false` 零副作用。
- **C6 I-7** ✅ `requiresApproval.test.ts` 7 用例（≥4）；L3 `decisionCard.interaction.ts` 82 行（含拍板卡不可绕过用例，82 行可估 2–3 用例）——**L3 用例数无法独立验**，见二节。
- **C7 I-9** ✅ `waitingItems.test.ts` 9 用例＋1 skip（收束态过滤 S5）。
- **C8 I-10** ✅ `turn.terminal.test.ts` 5 用例（≥4）。
- **C9 I-11** ✅ `timeline.negativeFacts.test.ts` 3 用例＋1 skip（SessionInterrupted/StallDetected 归 S3/S5）。
- **C10 I-13** ✅ `turnToken.test.ts` 5 用例（≥4）。
- **C11 I-14** ✅ `delegation.reopen.test.ts` 3 用例＋IPC 拒绝重开挂原单。
- **C12 I-15** ✅ `turn.deniedGuard.test.ts` 6 用例（≥4）。
- **C13 I-16** ✅ `acceptance.test.ts` 6 用例＋1 skip（产物谓词 S4，不预绿——C13 括注纪律落地）。
- **C14 I-2** ＝ B3（同判据不重复计数）。
- **C15 ApplyChange** ✅ `applyChange.test.ts` 7 用例（≥4）；IPC 侧 `change:produce` 绿。

### D 结构检查项

- **D1 S-1** ✅ `s1WritePath.test.ts` 3 绿（扫描面非空守卫＋呈现/度量零命中＋可红自证）；eslint flat-config `files:['src/renderer/**']` 即时红补强。
- **D2 S-2** ✅ `s2ProviderName.test.ts` 4 绿（含「解析器可证伪：单行与续行两形都取全、相邻类型字面不吞（N5）」——S1a N5 已修入）。
- **D3 S-4** ✅ `payloadRef.desens.test.ts` 3 用例（≥3）。
- **D4 S-3** 属 S2，本阶段不立——未预绿。
- **D5 G-1** ＝ A5。

### E 网关移植与流级取消令牌

- **E1** ✅ `gateway.cancelToken.test.ts` ≥3 用例＋L3 `stopInflight.interaction.ts` 44 行。
- **E2** ⚠ 真轨 **无 Key 环境未跑**（任务书与 G5 一致：blocked，不判红不预绿）；假轨绿。
- **E3** ＝ D2。

### F 最简呈现

- **F1** ⚠ `delegationLifecycle.interaction.ts` 155 行——**L3 用例数无法独立验**（playwright 挂死）。
- **F2** ⚠ `unpersistedState.interaction.ts` 28 行——同上。
- **F3** ✅ `focus.test.ts` 6 用例（≥4）。

### G 状态类断言

- **G1** 留待 S1 落账（`docs/tests/coverage-matrix.md` 表 N S1 行回填）——未独立核验。
- **G2** 出口闸本报告逐条执行。
- **G3** 待 S1 闸结果 handoff 落账。
- **G4** S1a N3 已由 ADR-029 落定（段5 v0.4＋命令归聚合、Spec 取本体）——本阶段无新裁定。
- **G5** push 与 CI 绿需用户显式授权——本阶段未授权即 blocked。

---

## 四、产出物清单核对（stage-spec §产出物）

| 产出物 | 状态 | 证据 |
|---|---|---|
| 归档批 commit（删除清单逐条列于 commit message） | ✅ | `a7b3979 chore(S1b): 物理归档旧实现（A2/A2.3/A2.4/A2.5，git rm，rewire 后断净）` |
| 轻量 tag `legacy-freeze-v0.1.0` | ✅ | `1aadd4c3...`（A1 已核） |
| `apps/desktop/src/domain/**`（7 聚合＋3 Spec） | ✅ | ls 见 `authorization/` `delegation/` `evidence/` `projection/` `queue/` `repos/` `service/` `spec/` `turn/` + `timeline.ts` + `domainError.ts` + `sandboxPath.ts` |
| `apps/desktop/src/domain/timeline.ts`（22 事件闭集） | ✅ | 第一行注册表已 dump（14 个 export/import） |
| `apps/desktop/src/main/**`（真网关移植＋取消令牌＋IPC） | ✅ | ls 含 `domainRuntime.ts` / `gateway.ts` / `ipc.ts` / `ipcDomain.ts` / `toolClassify.ts` / `protocolToolDefs.ts` |
| `apps/desktop/src/renderer/**`（委托单中心最简呈现） | ✅ | ls 含 6 计划件＋`App.tsx`＋`DelegationCenter.tsx`＋`StreamBar.tsx`（**非计划件——见 finding F-1**） |
| `tests/unit/**` + `tests/static/**` + `tests/interaction/**` | ✅ | 27 unit + 4 static + 4 interaction + 1 e2e + 1 helpers |
| 静态闸承载体 | ✅ | 4 静态测 + eslint flat-config 呈现块 |
| `docs/tests/coverage-matrix.md` 表 N S1 行回填 | ⚠ | 未独立核验（与 G1 同） |
| handoff 落账 | ⚠ | 未独立核验（与 G3 同） |

---

## 五、finding 清单

### F-1 renderer 新增件未列入详设 §7 计划件（六件计划 vs 七件实存）
- **位置**：`src/renderer/DelegationCenter.tsx`（**未在 plan Task 5「六件」清单**）、`src/renderer/StreamBar.tsx`（**未在 plan Task 5/6/7 任一清单**）、`src/renderer/useDomainView.ts`（hook 文件未在 plan Task 5 列入）、`src/renderer/AcceptRejectBar.tsx` / `DecisionCard.tsx` / `DelegationList.tsx` / `EvidenceList.tsx` / `QueueList.tsx` / `TimelineView.tsx`（六件计划件 ✅）。
- **证据**：`ls src/renderer/` 返回 11 个 `.tsx` 文件（含 `App.tsx`/`ConfigPage.tsx`），其中 6 计划件＋`App.tsx`（Task 6 列入）＋`ConfigPage.tsx`（保留面）＝ 8，余 3 件（DelegationCenter/StreamBar/useDomainView）属 plan 未列。
- **影响**：详设 §7 renderer 切分（L-03 登记）锁定六件＋复用件；新增件超出详设 lock-in 但属 plan 细化（无 DoD 边界冲突）。`StreamBar` 是 Task 7 commit `b1cb8ad` 引入（commit message 含 `+ StreamBar`），`DelegationCenter` 与 `useDomainView` 同批 commit `2e851b8`「renderer 委托单中心六件 + L3（F1，App 一并挂载）」引入。
- **建议**：补段5 详设 v0.4.x 把三件纳入 §7 renderer 切分表＋ADR 登记为计划细化（非设计变更）；否则下次 S2 段5 复审会再被审计者标记。
- **严重度**：低（非阻断；plan/详设 lock-in 漂移）。

### F-2 C1「拒方输入入队」编排面只在测面存在，IPC 接线侧亦实现但端到端 L3 路径无断言
- **位置**：`tests/unit/turn.admission.test.ts:24-43`（`startOrEnqueue` 编排器承载在飞≤1 拒方转投）＋`src/main/ipcDomain.ts:110-138`（`turn:start` handler 经 needQueue 装配 InstructionQueue）＋`src/main/ipcDomain.ts:133` `q.submitInput(...)`。
- **证据**：C1 编排器的「拒方入队」语义在 turn.admission 测与 ipc.channels 测两端各自独立断言（turn.admission 第 3 用例＋ipc.channels `turn:start 在飞位占用` 用例）；`ipc.channels.test.ts` 描述已写明「I-1 不外抛」；**L3 端到端**没有同义断言（interaction `delegationLifecycle`/`unpersistedState` 未列入 F-1 计划件外其它含此断言）。
- **影响**：C1 编排契约在 IPC 接线后「拒方入队」语义是端到端可信的；但 S1 全出口闸若只跑 L1 + L3 静态骨架，无 E2E 触发并发 StartTurn → 入队可见位置（QueueList）的串接断言。
- **建议**：在 `delegationLifecycle.interaction.ts` 加一条「忙时发起 → QueueList 出现位置」的端到端断言；或显式登记到 `docs/tests/coverage-matrix.md` 表 N S1 行注明「L1 编排 + IPC 接线双断言承载，C1 E2E 跨层延后」。
- **严重度**：中（C1 是 I-1 单飞的关键判据，编排器与 IPC 各承半边，但 E2E 层缺一针）。

### F-3 `TimelineLog` 公开默认构造器仍存，S1a N2「私有构造器已挡 new」的修入被声明但代码面未实做
- **位置**：`src/domain/timeline.ts:268`（`export class TimelineLog {`，**无 `private constructor`**，公开默认构造器在位）vs S1a 审计 N2 「建议：给 `TimelineLog` 构造函数加机制口专用 token」未修。
- **证据**：`grep -n 'private constructor' src/domain` 命中 5 个聚合（DecisionPoint/Delegation/Scope/EvidenceItem/Turn），**唯独 TimelineLog 不在内**（与 S1a 一致）；本会话 grep 重核仍如此。
- **影响**：S1a N2 影响同型——`appendSingleWriter.test.ts` 文本判据仍只在 `new TimelineLog` 字面与具名 `TimelineLog ∧ .record(` 上兜底，反例 `import { TimelineLog as TL } from '...'`，`export const mk = () => new TL()`，`import { mk } from './a.js'; (mk() as any).record(e)` 仍可绕。
- **建议**：要么删 `appendSingleWriter.test.ts:26-28` 的「私有构造器已挡 new」注释（与代码对齐），要么实做 N2 建议（机制口 token）。S1a 主会话已采纳 N2 但修入面停在文本判据扩面而非构造器加护栏——这是「修入声明 vs 实际修入」的脱节。
- **严重度**：中（G-1 同族的 I-2 闸面被绕风险，非阻断但有界假绿）。

### F-4 G-1 注释提及归档名非零命中（`protocolToolDefs.ts` / `toolClassify.ts` / `verification.ts` / `timeline.ts` 各一处）
- **位置**：
  - `src/main/protocolToolDefs.ts:1`「不再 import 旧 domain/protocolTools」注释
  - `src/main/toolClassify.ts:2`「与旧 src/domain/conversationState.ts 逐字等价」注释
  - `src/main/verification.ts:3`「conversationState.ts 单源」注释
  - `src/domain/timeline.ts:4`「本文件不 import 任何归档面」注释
- **证据**：`grep -rn "conversationState|protocolTools|agentLoop|planProposalParser|completionClaimParser|timelineLogger" src/` 命中 4 个文件各一处；G-1 闸仍绿（仅扫 `import/require` 说明符，不扫注释）。
- **影响**：无（注释提及是合规的「历史锚点」标记，与闸的「import 阻止」语义正交）。但若未来 G-1 闸扩面到「文档/注释含归档名」会判红——需保持注释意图单一。
- **建议**：维持现状（G-1 闸射程即 import/require）；若扩面需先出 ADR。
- **严重度**：低（信息项，非 finding 隐患）。

### F-5 `events.unit.publishDiscipline` 「对外发布通道＝0（扫描面＝新域全树）」已修入但描述未在 commit message 顶部
- **位置**：`tests/unit/timeline.publishDiscipline.test.ts`（已扩到 `src/domain/**` 全树扫描）；commit `870556b` 仅在 message 提及 N7「扫描面扩到 src/domain/**」之一处。
- **证据**：vitest 跑该项显示「`对外发布通道＝0…扫描面＝新域全树（N7 扩面）`」绿；与 S1a N7 修入一致。
- **影响**：无（已修入，仅 commit message 描述层面不足）。
- **建议**：下次同类「扫描面扩面」修入时，commit message 顶部明示射程变更。
- **严重度**：低（流程建议，非 finding 隐患）。

### F-6 L3 interaction 用例数自报「14 绿」无法独立复现
- **位置**：`tests/interaction/`（5 文件：`decisionCard.interaction.ts` 82 行 / `delegationLifecycle.interaction.ts` 155 行 / `stopInflight.interaction.ts` 44 行 / `unpersistedState.interaction.ts` 28 行 / `mockBridge.ts` 380 行 helpers）。
- **证据**：playwright 启动 `npx vite --port 5175 --strictPort` 在本会话 shell 长时间无 `webServer ready`（CI/WSL 启动延迟放大）；自报数字 14 绿 = 4 个 spec 文件的合计，**audit-time 不可独立验**。
- **影响**：L3 端到端判据（拍板卡不可绕过＋Stop 在飞＋委托单生命周期＋未持久化态）自报绿色，本审计只能采信 commit message 与「文件存在 + 静态可读」的事实层。
- **建议**：CI 端跑通后回贴本审计链以闭合；本审计口径采信自报，**不判红、不预绿**，与 G5 式纪律一致。
- **严重度**：中（CI 验证闭环缺一针）。

### F-7 e2e 真轨 `npm run e2e` 真 Key 路径未跑
- **位置**：plan Task 8 Step 3「真轨（有 Key 才跑）」；本会话未设 `NF_*` 环境。
- **证据**：实测仅假轨 2 绿｜1 skip（与自报一致）；真轨自报亦「无 Key 记 blocked」。
- **影响**：与 G5 一致——**不判红、不预绿**。
- **建议**：保留现有 blocked 登记；真 Key 走既有 `NF_*` 约定、Key 不入库（C3/desens 已独立 rc=0）。
- **严重度**：低（流程项，已合规登记）。

### F-8 `coverage-matrix.md` S1 行回填与 handoff 落账未独立核验
- **位置**：`docs/tests/coverage-matrix.md`（G1）＋`.handoff/`（G3）——本会话未触碰。
- **证据**：任务书范围不含此；任务书「禁止：改输入工件」与「不 commit」将本审计限于「读＋判」。
- **影响**：G1/G3 状态类断言本审计**无法独立判据**。
- **建议**：留给 stage-gate 与项目-handoff 技能落地时复核。
- **严重度**：低（流程项，明确归属其他技能）。

---

## 六、查过且没问题的地方

- A1–A6 归档面全 GONE＋保留面全 PRESENT＋G-1 闸树内命中 0＋三静态闸全绿＋双 tsc/eslint/desens 0 错。
- B1–B4 timeline 注册表／载荷键／单写者／发布纪律自洽，publishDiscipline 已扩到 `src/domain/**` 全树（N7 修入）。
- C1–C15 各测用例数（依 S1a 审计已逐条对账）仍达标；3 处 `it.skip`（acceptance→S4 / waitingItems 收束态→S5 / negativeFacts SessionInterrupted+StallDetected→S3+S5）一一对应 DoD 括注。
- D1–D3 三静态闸含可红自证＋防空跑守卫；D4 S-3 属 S2 未预绿；D5 G-1 ＝ A5。
- E1 流级取消令牌：ipc 端 `gateway:cancel-stream` ⇒ `gateway.abort(streamId)`（preload.bridge.test.ts 「stop(streamId) ⇒ gateway:cancel-stream」绿）；turnToken 过期联动由 domainRuntime 装配（`changeSets`/Token 复合值变更触发 I-13 丢弃）。
- E2 假轨绿（`tests/e2e/domain.happy.test.ts` 2 绿｜1 skip）。
- E3 ＝ D2（核心域零 provider 专名）。
- F1/F2 plan 计划件已落地；F3 `focus.test.ts` 6 用例绿。
- 复用面：main wiring 引入 `domainRuntime.ts` 真/假网关双轨入口（S1b Task 1）＋`protocolToolDefs.ts` 本地常量表（替代旧 `protocolTools.ts`）＋`toolClassify.ts` 自治纯判定（替代旧 `conversationState` 的 `isLocalhostCommand`/`classifyReadonly`）；`ipcDomain.ts`（13 通道 + 经 `domainRuntime` 唯一机制口落账）+ `ipc.ts` 接线 + `preload.ts` 桥扩展 + `App.tsx` 重写为委托单中心六件挂载 + 未持久化态横幅——结构与详设 §7/§9 对齐。
- `tests/helpers/` 未在 A2.3 清单，保留（与 ADR-028 D3 ＋ plan Task 9 Step 4 一致）。
- mockBridge.ts 在 S1b 计划 Task 5 Step 1 预设为「L3 复用旧基建」（任务书 ③ 明示）；本会话未发现旧面回流——其 `delegations`/`queue`/`timeline` 投影均为新桥类型（`NeonforgeBridge` 接口面）而非旧 `ConversationPanel` 数据流。

---

## 七、审计者限制自述

1. **playwright L3 interaction 全跑未出**（webServer vite 在本会话 shell 起 `localhost:5175` 长时间无响应，`npx playwright test --project=interaction` 60s+ 挂死后我主动 task_stop 并取消）；L3 用例数自报「14 绿」**未独立复现**，按任务书纪律如实记「未独立复现」并转为通读判据。
2. **e2e 真轨未跑**（无 `NF_*` 环境），按 G5 式纪律「**不判红、不预绿**」如实记 blocked。
3. **G1 coverage-matrix 与 G3 handoff** 落账文件未独立核验（任务书范围不含此）。
4. **N2 修入声明 vs 实际修入** 的脱节（F-3）——commit `870556b` 修入面停在「文本判据扩面」而非「构造器加护栏」，与 S1a 报告「采纳 N2」措辞形成事实偏差。本审计**仅声明此事实，不强制回炉**（属 S1a 主会话采纳后的实况复述）。
5. **未跑**：`playwright` 之外，本会话实际跑的闸覆盖 A6.1（双 tsc）／A6.2（eslint）／A6.3（desens）／A4（vitest L1）／E2 假轨（npm run e2e）／G-1 + 三静态闸／B1–B4 主文件／S1b 关键单元 29 项＝已涵盖 S1 出口闸中除 L3 interaction 外的全部机器可验判据。
6. **未触**：archive 命令面 `git rm`（A2 已落）；stage-gate skill 执行；handoff CLI（项目-handoff 技能归属）；push/CI 验证（G5）。

---

## 八、综合判定

- **可采纳**：所有可独立复现的闸与 stage-spec DoD A–G（除 L3 interaction/E2 真轨/G1/G3）逐条对齐；G-1 已扩到 `src/**` 全树，承载 stage-spec A5.1 全树判据；A1–A6 归档批在位且与 ADR-028 Decision 3/4 字面一致；领域内核（7 聚合 + 7 内存仓储 + 3 Spec + 2 服务 + 2 投影）齐备；IPC 通道集（13 + gateway:cancel-stream）与详设 §7 一字不差；E1 流级取消令牌管道 + E2 双轨 happy path（假轨绿、真轨 blocked 按 G5 纪律）。
- **不阻断**：finding F-1/F-2/F-3/F-6 为「可改进但不阻断」级别；F-4/F-5/F-7/F-8 为「信息项或流程项」；F-1 的 renderer 计划外三件属「plan 细化未升详设」——建议落段5 v0.4.x 补登记，非阻断；F-2 C1 端到端层缺一针——已在 L1 + IPC 双侧独立断言，建议补 E2E；F-3 N2 修入声明与实际偏差——S1a 已采纳的事实复述，非本批引入。
- **CI 闭环缺**：L3 interaction（自报 14 绿）与 E2 真轨（blocked）共同构成本审计未独立闭合的两块——G5 式纪律下不预绿，但建议 CI 端跑通后回贴本审计链以闭合「CI 绿以用户显式授权为前提」（G5）的最后一针。
- **不改任何码**；**不 commit**；报告落 `docs/audits/s1-exit-heterogeneous-audit-2026-10-05.md` 即交付。

---

## 主会话采纳（署名，2026-10-05）

- 派单实况补记：本审计＝agent-dispatch 轮替派出 `mcode@MiniMax-M3`（固定模式；S1a 已用
  command-code，当前主 qodercn@Qwen3.8-Max 同源避开）。报告首部「审计者」行为审计者自述，
  以本行为准。任务书＝/tmp/nf-s1-exit-audit-taskbook.md（会话草稿，不入库）。
- 结论「有条件可采纳——无阻断项」**接受**。八条 finding 逐条读码复核：
  - **F-1 成立**（DelegationCenter.tsx／StreamBar.tsx／useDomainView.ts 三件确不在 plan Task 5
    六件清单与详设 §7 切分表）。段5 工件补登记＝用户亲裁面，随本报告呈报待裁，主会话不代改上游。
  - **F-2 成立但超 DoD 判据**（stage-spec C1 只要求 L1 turn.admission ≥4 条，L3 非 C1 判据面；
    端到端一针属改进项）→ 登记 coverage-matrix 表 N 轴 1/6 注记「C1 E2E 跨层延后 S2」，不在
    出口闸内补测（测完再修纪律，ADR-012）。
  - **F-3 部分不成立**：「注释失真」不实——appendSingleWriter.test.ts 的失真注释已在 S1a 修入
    commit `870556b` 改为实况描述（审计者把修复登记注记中引用的原措辞误认作原注释仍在，
    `git show 870556b` 可证）。「TimelineLog 构造器仍公开、N2 token 建议未实做」事实成立，
    且该延后已在同文件 ponytail 注释显式登记（天花板＋升级路径＝S6 全量收口）＝有意延后非脱节。
  - **F-4／F-5／F-7／F-8 接受**（信息项／流程项，无代码动作）。
  - **F-6 主会话补实测**：本会话 2026-10-05 23:17 亲手跑 `npx playwright test --project=interaction`
    ＝**14 passed (2.3m)** 新鲜输出（闸 3），非仅采信 commit 自述；审计者环境 webServer 挂死
    属其会话限制，如实登记。CI 闭环（G5）仍以用户授权 push 为前提。
- G1 coverage-matrix 表 N S1 行回填、G2 spec 勾选与 blocked 登记、G3 handoff 落账、G4「无新语义
  裁定」登记：随本采纳同批落地（commit 见 git log）。
- **F-1 裁定落地追记（2026-10-05）**：用户批准「回段5 出 v0.4.x 补登记」——详设已出 **v0.4.1**
  （§7 renderer 切分补登记 DelegationCenter.tsx／useDomainView.ts／StreamBar.tsx 三件，登记级修订、
  零语义改动、不立新 ADR；版本头与 §7 双处落笔）。lock-in 漂移已闭合。
