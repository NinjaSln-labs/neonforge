# S1b 实现计划：真网关移植 + 流级取消令牌 + IPC 桥 + 委托单中心呈现（段6）

> 由 writing-plans 出，2026-10-05。契约源＝stage-spec V1-S1（DoD **E2/F**＋A2.5 收尾＋E1 真轨）＋接口 `docs/design/v1.0.0-s1-detailed-design.md` v0.3（§7 IPC/renderer、§8 机制落点、§9 时序）＋段3 v1.2。**前置**：S1a 已落（领域内核＋假网关 L1 端到端绿）。执行走 executing-plans，逐任务 TDD。

**Goal:** 把 S1a 的假网关换成**真网关**（复用现 `gateway.ts`/`providers/**`）＋新建**流级取消令牌**（E1，现仓库零取消管道）＋接线**委托单中心最简呈现**（IPC 通道桥＋renderer 六件），L3 interaction＋`npm run e2e` 双轨（真/假网关）跑通 §9 happy path＋Stop 路径。

**Architecture:** main 进程持领域单例（聚合＋Repo＋服务，S1a 产物）＝新树接线位；renderer 经 `window.neonforge.<m>` 调 `ipcMain.handle`；流式＝`gateway.streamChat(apiKey,{…,onDelta})`→`event.sender.send('gateway:stream-chunk')`→preload `onStream`；取消＝streamId→`Map<string,AbortController>`→`gateway.abort(streamId)`→在飞轮复合值变更（联动 I-13 丢弃后续写）。

**Tech Stack:** TS 双 tsc、vitest ^4、**playwright**（`--project=interaction`）、electron、eslint flat、`npm run e2e`（依赖 `/tmp/nf-e2e-test`，入口自建）。无新依赖。

## Global Constraints（承 S1a＋本阶段）

- 复用真网关面**不改其重试/分类/修复逻辑**（`ModelRouter`/`classifyGatewayError`/`toolCallRepair`/`streamChat`/`streamChatOnce`），仅**新增**流级 `AbortController` 管道；不引新库、promptfoo 不引入。
- 核心域不出现 provider 专名（D2/E3）；真 Key 走既有 `NF_*` 环境约定、**Key 不入库**（C3/desens）；无 Key 环境走假网关双轨（同一 L3 用例两 provider 面）。
- renderer 扁平结构无 `components/`；复用 `styles.css`/`icons.tsx`/`diffRender.ts`；旧对话中心 24 组件不复用（S1a 已归档）。
- 呈现/度量只读投影，禁 import 核心聚合写命令（S-1，T17 已立闸）。
- A2.5：本阶段移除 `ipc.ts` 的 `timeline:log`/`timeline:query` handler（`timelineLogger.ts` S1a 已删文件，此处清 handler 悬空 import），新读面＝`timeline:query-by-delegation`。
- 未持久化态须 UI 显式呈现（F2，原则1 诚实面）——内存态、重启即失，不得静默装作已存。
- 段6 闸每任务末跑；S1b 出口＝双 tsc＋L1＋eslint flat＋desens＋DoD E2/F1/F2/F3＋G 类。

## File Structure（S1b 新建/改）

```
src/main/ipc.ts                 # 委托单中心通道 handler + gateway abort/streamId + 领域服务接线
src/main/gateway.ts             # 新增 abort(streamId) + streamChat 接 AbortSignal（不改既有逻辑）
src/main/domainRuntime.ts       # 新建：领域单例装配（聚合+Repo+服务 假网关→真网关 注入点）
src/preload/preload.ts          # 扩 window.neonforge 桥 + stop 透传
src/renderer/types.d.ts         # NeonforgeBridge 接口
src/renderer/{DelegationList,TimelineView,DecisionCard,EvidenceList,AcceptRejectBar,QueueList}.tsx
src/renderer/App.tsx            # 重写为委托单中心（挂六件 + 未持久化态横幅）
tests/interaction/{delegationLifecycle,stopInflight,decisionCard,unpersistedState}.spec.ts
```

---

## Task 1：领域运行时装配（main 持 S1a 单例）

**Files:** Create `src/main/domainRuntime.ts`。
**Interfaces:** Produces `getRuntime():DomainRuntime`（持 7 InMemory Repo＋Delegation/Turn/…聚合工厂＋`admissionCheck`/`applyChange` 服务＋`FakeGateway|RealGateway` 注入口）；Consumes S1a 领域层导出。

- [ ] **Step 1：写失败测** — `tests/unit/domainRuntime.test.ts`：`getRuntime().delegationRepo.findActive()` 返数组；同进程多次调＝同单例（内存态生命周期）。
- [ ] **Step 2：跑 FAIL** — `cd apps/desktop && npx vitest run tests/unit/domainRuntime.test.ts`。
- [ ] **Step 3：实现** — 装配 7 InMemory Repo＋服务；`gateway: GatewayLike = isTestEnv?FakeGateway:gateway`（真/假双轨入口）。
- [ ] **Step 4：跑 PASS** — 同上命令绿。
- [ ] **Step 5：commit** — `feat(S1b): domainRuntime 装配领域单例 + 真/假网关注入口`。

## Task 2：E1 流级取消令牌（现仓库零取消管道）

**Files:** Modify `src/main/gateway.ts`（新增 `abort` ＋ `streamChat` 接 signal，**不改**重试/分类/修复）；`src/main/ipc.ts`（`Map<streamId,AbortController>`＋`gateway:cancel-stream` handler）；Test `tests/unit/gateway.cancelToken.test.ts`（≥3）。
**Interfaces:** Produces `gateway.streamChat(apiKey,{…,streamId,signal})`；`gateway.abort(streamId):boolean`（controller.abort）；`ipcMain.handle('gateway:cancel-stream',(_,{streamId})=>…)`。重叠窗＝流剩余＋写前复核延迟（详设 §8）。

- [ ] **Step 1：写失败测** — `FakeGateway` 流未 finish 时 `abort(s1)`⇒已注册 controller.signal.aborted=true；abort 后在飞轮复合值变更⇒`record` 后续写被 I-13 判据丢弃＋`expiredWriteCount+1`；未知 streamId abort⇒false。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/gateway.cancelToken.test.ts`。
- [ ] **Step 3：实现** — `ipc.ts` 每 `gateway:stream-chat` 建 `AbortController` 存 `Map(streamId)`、signal 传 `streamChatOnce` 的 `fetch({signal})`（与既有 `AbortSignal.timeout` 合并：`AbortSignal.any([timeout, external])` 或手并）；新增 `gateway:cancel-stream` handler `map.get(id).abort()`；abort 回调触发领域侧 TurnToken 过期（联动 `domainRuntime`）。**保留**重试/分类逻辑不动（仅加 signal 形参）。
- [ ] **Step 4：跑 PASS** — 同命令绿。
- [ ] **Step 5：commit** — `feat(S1b): E1 流级取消令牌 streamId→AbortController→令牌过期（现库零取消管道新建，不改重试/分类）`。

## Task 3：委托单中心 IPC 通道 handler

**Files:** Modify `src/main/ipc.ts`；Test `tests/unit/ipc.channels.test.ts`（用 testHooks 直调 handler）。
**Interfaces:** Produces handlers：`delegation:list|create|accept|reject`、`turn:start`、`decision:raise|resolve`、`evidence:list-by-delegation|inspect`（inspect 经 `TimelineRepo.append` 机制口落 EvidenceInspected＝S-1 唯一例外）、`queue:pending`、`timeline:query-by-delegation|subscribe`；移除旧 `timeline:log|query`（A2.5）。

- [ ] **Step 1：写失败测** — 调 `delegation:create`→返 delegationId＋落账；`decision:resolve` 未决对⇒幂等；`evidence:inspect`⇒落 EvidenceInspected；旧 `timeline:query` handler 不在注册表。
- [ ] **Step 2：跑 FAIL**。
- [ ] **Step 3：实现** — 每 handler 经 `getRuntime()` 调聚合命令/Spec/服务，结果先 `TimelineRepo.append` 再返（同事务）；删旧两 handler＋其 import。
- [ ] **Step 4：跑 PASS** — `npx vitest run tests/unit/ipc.channels.test.ts`。
- [ ] **Step 5：commit** — `feat(S1b): 委托单中心 IPC 通道 handler + 移除旧 timeline 面（A2.5）`。

## Task 4：preload 桥 + NeonforgeBridge 类型

**Files:** Modify `src/preload/preload.ts`、`src/renderer/types.d.ts`；Test `tests/unit/preload.bridge.test.ts`（类型面＋方法名齐）。
**Interfaces:** Produces `window.neonforge.{delegation,turn,decision,evidence,queue,timeline,gateway:{streamChat,onStream,stop}}`；`stop:(streamId)=>invoke('gateway:cancel-stream',{streamId})`。

- [ ] **Step 1：写失败测** — 断言 `preload` 暴露对象键集合＝契约（`types.d.ts` `NeonforgeBridge` 与之逐键对齐，`@ts` 编译测）。
- [ ] **Step 2：跑 FAIL**（双 tsc）。
- [ ] **Step 3：实现** — `contextBridge.exposeInMainWorld('neonforge',{…})` 扩各 `ipcRenderer.invoke(...)`；`types.d.ts` 补 `NeonforgeBridge` 接口。
- [ ] **Step 4：跑 PASS** — `npx tsc -p tsconfig.json --noEmit` 0 error。
- [ ] **Step 5：commit** — `feat(S1b): preload 桥扩委托单中心方法 + NeonforgeBridge 类型`。

## Task 5：renderer 委托单中心六件（F1）

**Files:** Create `DelegationList.tsx`／`TimelineView.tsx`／`DecisionCard.tsx`／`EvidenceList.tsx`／`AcceptRejectBar.tsx`／`QueueList.tsx`；Test `tests/interaction/delegationLifecycle.spec.ts`（`--project=interaction`，≥8）。
**Interfaces:** Consumes `window.neonforge.*`；复用 `styles.css`/`icons.tsx`/`diffRender.ts`；扁平结构（与 `ConfigPage.tsx` 同级）。

- [ ] **Step 1：写失败 L3 测** — 委托单列表渲染、时间线视图、拍板卡（含拒绝理由输入）、证据打开（触发 `evidence:inspect`）、验收/拒绝按钮（拒绝→原单重开可见）、排队可见（`queue:pending` 项有位置）。
- [ ] **Step 2：跑 FAIL** — `npx playwright test --project=interaction delegationLifecycle`。
- [ ] **Step 3：实现六件** — 各件纯呈现＋经桥取数（只读投影，无写命令 import，S-1 绿）；数据源 `timeline:query-by-delegation`。
- [ ] **Step 4：跑 PASS** — 同命令 ≥8 绿。
- [ ] **Step 5：commit** — `feat(S1b): renderer 委托单中心六件（F1 最简呈现）`。

## Task 6：App.tsx 重写 + 未持久化态显式呈现（F2）

**Files:** Modify `src/renderer/App.tsx`（97 行，旧挂 ConversationPanel 等）；Test `tests/interaction/unpersistedState.spec.ts`（≥1）。
**Interfaces:** App 挂六件（去旧对话中心）；顶部横幅显式「未持久化·内存态·重启即失」。

- [ ] **Step 1：写失败 L3 测** — 渲染态含"未持久化"文案；无旧 ConversationPanel 挂载。
- [ ] **Step 2：跑 FAIL** — `npx playwright test --project=interaction unpersistedState`。
- [ ] **Step 3：实现** — App 重写挂载六件＋横幅；`index.html`/`main.tsx` 入口保持壳（S1a 已定就地重写面）。
- [ ] **Step 4：跑 PASS**。
- [ ] **Step 5：commit** — `feat(S1b): App.tsx 重写委托单中心 + 未持久化态显式呈现（F2）`。

## Task 7：拍板卡不可绕过 + Stop 在飞（C6/E1 L3）

**Files:** Test `tests/interaction/decisionCard.spec.ts`（C6 L3 ≥1）、`tests/interaction/stopInflight.spec.ts`（E1 ≥1）。
**Interfaces:** Consumes Task 2/3/5；`decision:resolve` 未决前推进副作用＝0；Stop→在飞流 abort＋令牌过期可见。

- [ ] **Step 1：写失败 L3 测** — decisionCard：无 `decision:resolve` 批准则推进卡不可点/副作用 0；stopInflight：发起流→点 Stop→`gateway:cancel-stream`→流停、令牌过期呈现。
- [ ] **Step 2：跑 FAIL** — `npx playwright test --project=interaction decisionCard stopInflight`。
- [ ] **Step 3：实现 wiring**（若前序任务已具则仅补测试夹具；组件侧 Stop 按钮调 `neonforge.gateway.stop(streamId)`）。
- [ ] **Step 4：跑 PASS**。
- [ ] **Step 5：commit** — `test(S1b): 拍板卡不可绕过 + Stop 在飞 L3（C6/E1）`。

## Task 8：npm run e2e 双轨 happy path（E2）

**Files:** Test e2e 入口（`/tmp/nf-e2e-test`，沿用既有 `NF_*` 约定）；无新 Key 入仓。
**Interfaces:** 真网关（有 Key，`NF_*`）＋假网关（无 Key）同一"发起→推进→拍板→核验→收尾"L3 两 provider 面。

- [ ] **Step 1：写 e2e 双轨用例** — 同一旅程两条 provider 面（真 Key／假网关）。
- [ ] **Step 2：跑（假轨）** — `cd apps/desktop && npm run e2e`（无 Key 走假网关）；预期：绿。
- [ ] **Step 3：真轨（有 Key 才跑）** — `NF_*` 在环境则跑真网关同例；无 Key 记 blocked（**不判红、不预绿**，G5 式）。
- [ ] **Step 4：核 Key 不入库** — `python3 tools/desens-scan.py` rc=0。
- [ ] **Step 5：commit** — `test(S1b): npm run e2e 双轨 happy path（E2，真/假网关）`。

---

## S1b 出口闸（全任务末一次性过）

1. `npx vitest run`（L1 全绿）。
2. `npx playwright test --project=interaction`（F1/C6/E1 L3 全绿）。
3. `cd apps/desktop && npm run e2e`（假轨绿；真轨有 Key 才跑否则 blocked）。
4. `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`；`npx eslint .`；`python3 tools/desens-scan.py`。
5. stage-spec DoD **E2/F1/F2/F3＋A2.5＋G 类** 逐条（`stage-gate`）。

**S1a＋S1b 合起来＝S1 全 DoD A–G**。S1 出口一次过闸（段6 闸＋S1 spec DoD），经 `agent-dispatch` 派异构执行者独立审计 S1 产出（H/M/L），结论回用户。**后续 S2–S7 不在本 plan**（作用域修正/持久化/证据三类型/产物谓词/卡滞催弃/呈现完整/指标）。
