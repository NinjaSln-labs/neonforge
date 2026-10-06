# S2b 实现计划：作用域修正的接线与呈现（runtime→IPC→桥→renderer＋L3＋段6 出口闸）

> 由 writing-plans 出，2026-10-06。前置＝**S2a 已完成**（`docs/superpowers/plans/2026-10-06-s2a-authorization-kernel.md`：`Scope.amend`/`chain`/正式 glob/③类翻转/`ScopeAmendedPayload`/S-3 闸全绿）。契约源（不得超其边界）＝`docs/design/stage-specs/V1-S2-authorization-scope.md`（本 plan 承 **S2b 面**＝A4/A5 的接线与呈现侧＋**B2 同事务两条**＋C4 静态闸回归＋E1–E5＋F1–F11）＋接口 `docs/design/v1.0.0-s2-detailed-design.md` **v0.4** §5/§7＋ADR-030（案 A＝命令式消费）。执行走 executing-plans，逐任务 TDD。

**Goal:** vitest 新增 **2 条**（B2 同事务两条）＋ playwright L3 新增 **8 条**（E1 3＋E2 3＋E3 1＋E5 1，走 E4 下限不重复计 F2）。把 S2a 的领域能力经**唯一写者口**接到用户手上：`rt.amendScope` 编排（决议在场性读得到、追加与写同事务）→ `scope:chain`/`scope:amend` 两通道 → 类型化桥 → `ScopePanel` 提案与历史只读 → `DecisionCard` 缘由与决议留痕 → L3 八条针（含 S1 遗留的 E5 端到端针）→ 段6 出口闸全跑。

**Architecture:** main 侧装配（`domainRuntime.ts` 是唯一调 `Scope.amend` 的地方）＋`ipcDomain.ts` 通道注册表（args 取 `unknown`、逐 handler 收窄＝信任边界）＋preload 桥＋renderer 扁平件（**零核心聚合 import**，S-1 静态闸守）；呈现层派生只读，不新增第二条取数通道。

**Tech Stack:** TypeScript（双 tsc）、vitest ^4、playwright ^（`--project=interaction`，`testMatch: **/*.interaction.ts`）、eslint flat、零新依赖。

## Global Constraints（逐字承上游，全任务硬守）

- **案 A（ADR-030）两步流**：`decision:resolve(批准)` 之后由**用户动作**显式发起 `scope:amend`；**不在 resolve 处理器里自动追加**（详设 §5 三条理由，S5 作废面要复用这条边界）。
- 追加仍经 `rt.log(draft)`→`TimelineRepo.append` 唯一机制口，与 `rt.scopes.save` **同事务**；append 失败⇒链不长（B2）。
- `DomainChannel` 只新增 `scope:chain`（只读）／`scope:amend`（写）两条；`ScopeRepo` 面不变；`DecisionPoint` 公开命令仍只 `raise`/`resolve`。
- 命令回执携拒绝理由，**不进 timeline**（段3 §5 留痕口径）；非法 `entries` 形状＝接线级错误（`throw Error`，**不占不变量码**）；`pattern` 落账前过 S-4 同族判据（不新增脱敏面）。
- renderer 只经 `window.neonforge`；`ScopeEntryDTO` 复用 `delegation:create` 既有 `scopeEntries` 形状，不另造第二套（详设 §7）。
- 退役词不入代码/注释；凭据只走 env；每任务末 desens rc=0。ADR-012 测完再修。
- **E2 真轨三缺口本阶段不认领**（契约件边界节；真轨继续 `describe.skip`＋blocked 注记，不预绿）。

## File Structure（S2b 新建/改）

```
apps/desktop/src/main/domainRuntime.ts     # 扩：amendScope(input)
apps/desktop/src/main/ipcDomain.ts         # 扩：DomainChannel 两通道＋handler
apps/desktop/src/preload/preload.ts        # 扩桥：scope:{chain,amend}
apps/desktop/src/renderer/types.d.ts       # 扩 NeonforgeBridge.scope
apps/desktop/src/renderer/useDomainView.ts # 扩派生：scopeVersions／lastResolution
apps/desktop/src/renderer/ScopePanel.tsx   # 新建一块
apps/desktop/src/renderer/DelegationCenter.tsx  # 装配 ScopePanel
apps/desktop/src/renderer/DecisionCard.tsx # 改：data-cause＋留痕一行
apps/desktop/tests/unit/scope.amend.test.ts          # 追加 B2 两条（S2a 建的同一文件）
apps/desktop/tests/unit/ipc.channels.test.ts         # 扩：scope:amend 回执面（不计新增下限）
apps/desktop/tests/interaction/mockBridge.ts         # 夹具扩：域桥 scope／turn.start into:'queue'
apps/desktop/tests/interaction/decisionCard.interaction.ts      # 扩 6 条（E1 3＋E2 3）
apps/desktop/tests/interaction/delegationLifecycle.interaction.ts # 扩 2 条（E3 1＋E5 1）
docs/tests/coverage-matrix.md              # 表 N S2 行回填（F6）
```

---

## Task 1：`rt.amendScope` 编排与同事务（B2／A4 回执面）

**Files:** Modify `src/main/domainRuntime.ts`；Test `tests/unit/scope.amend.test.ts`（**追加** B2 两条）。
**Interfaces:** Consumes `rt.decisionPoints.findById`／`rt.scopes.{findByDelegation,save}`／`rt.log`／`rt.timeline.append`；Produces `amendScope(input): { version: number } | null`（`null`＝决议不在场/未批准/已用过）。

- [ ] **Step 1：写失败测（B2 两条）** — ①happy：造委托＋已批准修正决议，`rt.amendScope({delegationId:'d1',decisionPointId:'dp1',entries:[{kind:'仓库',pattern:'docs/**'}]})` ⇒ 返回 `{version:2}`，且 `rt.timeline` 里 `ScopeAmended` 恰 1 条、`rt.scopes.findByDelegation('d1').version === 2`；②**tx 失败⇒链不长**：现 `InMemoryTimelineRepo.append` 的形参已核＝`append(event, tx?)`，体内 `record(event)` → `try { tx?.() } catch { this.log.rollbackTo(snap); throw }` → 成功才 `publish`（先落账后分发，B4）。故注入点＝**让 `rt.scopes.save` 抛**（`vi.spyOn(rt.scopes,'save').mockImplementation(()=>{throw new Error('boom')})`）⇒ 调 `amendScope` 抛，断言 `scopes.findByDelegation('d1').version` **仍＝1** ∧ `timeline` 里 `ScopeAmended` 计数＝**0**（回滚路径不发）。这与 S1 B3 用同一条事务包装（详设 §6）。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/scope.amend.test.ts`；预期：红（`amendScope` 未定义）。
- [ ] **Step 3：实现编排** — 在 `build()` 的 `rt` 字面量里加：
  ```ts
  amendScope(input: { delegationId: string; decisionPointId: string; entries: ScopeEntry[] }) {
    const dp = rt.decisionPoints.findById(input.decisionPointId)
    const scope = rt.scopes.findByDelegation(input.delegationId)
    if (!dp || !scope) return null                              // 决议/作用域不在场＝I-17 前置不满足
    try {
      const { scope: next, draft } = scope.amend(dp, input.entries, new Date().toISOString())
      rt.log(draft, () => rt.scopes.save(next))                  // 同事务：tx 内写聚合，append 失败⇒tx 不提交
      return { version: next.version }
    } catch (e) {
      if (e instanceof DomainError) return null                  // 回执由 IPC 层补 why（不进 timeline）
      throw e
    }
  },
  ```
  并在 `DomainRuntime` 接口补同名签名一行（`amendScope(input): { version: number } | null`）。`DomainError` 需在 `domainRuntime.ts` 顶部 import（`import { DomainError } from '../domain/domainError.js'`，路径按该文件现有 `../domain/...` 风格对齐）。
- [ ] **Step 4：跑 PASS** — 同命令；预期 S2a 6 条＋B2 2 条全绿。
- [ ] **Step 5：commit** — `feat(S2b): rt.amendScope 编排＝决议事实消费＋聚合写与 append 同事务（B2，案 A）`。

## Task 2：`scope:chain`／`scope:amend` 两通道（A4/A5 回执面）

**Files:** Modify `src/main/ipcDomain.ts`；Test `tests/unit/ipc.channels.test.ts`（扩，回执形状；**不计 F2 新增下限**，§9 已注）。
**Interfaces:** Consumes `rt.amendScope`；Produces 通道回执 `{ version } | { rejected: true, why }` 与 `ScopeVersionDTO[]`。

- [ ] **Step 1：扩 `DomainChannel` 联合＋补 main 侧 id 生成** — 追加 `| 'scope:chain' | 'scope:amend'`（编译期挡住拼写漂移）；另把现 `ipc.handle('decision:raise')` 的入参改成 `const a = { ...args as RaiseInput, decisionPointId: (args as RaiseInput).decisionPointId ?? randomUUID() }`（**详设 §7 写「`decisionPointId` 由 main 侧 `randomUUID()` 生成，与 S1 其余 id 同路」，而实树现形＝要求调用方必传**；`randomUUID` 已在本文件 import，`delegation:create`／`turn:start` 都是 `a.x ?? randomUUID()` 同一路数。不改这一行，ScopePanel 就只能自己在渲染层造 id＝把 id 生成漏到呈现侧）。
- [ ] **Step 2：写失败测** — 用现 `registerDomainChannels` 测试夹具（假 `ipcMainLike` 收集 handler）：①`scope:chain` 返 `[{seq:1,entries:[...],amendmentRef:null}]`；②`scope:amend` happy 返 `{version:2}`；③决议未批准返 `{rejected:true, why:string}` 且**非 22 事件不减**；④外来 `entries` 含非法 `kind`（`'天上'`）⇒ 接线级 `Error`（不是 `DomainError`、不占不变量码）。
- [ ] **Step 3：跑 FAIL** — `npx vitest run tests/unit/ipc.channels.test.ts`。
- [ ] **Step 4：实现 handler** —
  ```ts
  ipc.handle('scope:chain', (_evt, args) => {
    const { delegationId } = args as { delegationId: string }
    const scope = rt.scopes.findByDelegation(delegationId)
    if (!scope) throw new Error(`未知委托：${delegationId}`)
    return scope.chain.map((v) => ({ seq: v.seq, entries: v.entries.map((e) => ({ ...e })), amendmentRef: v.amendmentRef }))
  })

  ipc.handle('scope:amend', (_evt, args) => {
    const a = args as { delegationId: string; decisionPointId: string; entries: Array<{ kind: string; pattern: string }> }
    const KINDS = ['仓库', '目录', '命令', '网络'] as const
    for (const e of a.entries ?? []) {
      if (!KINDS.includes(e.kind as (typeof KINDS)[number]) || typeof e.pattern !== 'string')
        throw new Error(`entries 形状非法：${JSON.stringify(e)}`)          // 接线级，不占不变量码
    }
    const out = rt.amendScope({ ...a, entries: a.entries as ScopeEntry[] })
    return out ? { version: out.version } : { rejected: true as const, why: '无已批准的作用域修正决议，或该决议已产过版本' }
  })
  ```
  DTO 映射用 `{ ...e }` 摊平＝**不把冻结引用递给 renderer**（桥侧本就 JSON 序列化，摊平是显式意图）。
- [ ] **Step 5：跑 PASS** — `npx vitest run tests/unit/ipc.channels.test.ts tests/unit/scope.amend.test.ts`；跑 S-1 闸 `npx vitest run tests/static/s1WritePath.test.ts`（**C4**：谓词与通道扩面不得把写命令漏进呈现面）。
- [ ] **Step 6：commit** — `feat(S2b): scope:chain／scope:amend 通道（外来 entries 收窄＋拒绝走命令回执，A4/A5 接线面）`。

## Task 3：桥面（preload＋types.d.ts）

**Files:** Modify `src/preload/preload.ts`、`src/renderer/types.d.ts`；Test `tests/unit/preload.bridge.test.ts`（扩既有键集断言）。
**Interfaces:** Produces `scope: { chain(delegationId): Promise<ScopeVersionDTO[]>; amend(args): Promise<{version:number}|{rejected:true,why:string}> }`。

- [ ] **Step 1：写失败测** — 在 `preload.bridge.test.ts` 断言 `Object.keys(bridge.scope).sort()` ＝ `['amend','chain']` ∧ 两方法各自 invoke 的通道名字面（沿用该文件既有 ipcRenderer 假件模式）。
- [ ] **Step 2：跑 FAIL** — 预期红（`scope` 不存在）。
- [ ] **Step 3：实现** — `preload.ts` 的 `bridge` 对象内加：
  ```ts
  scope: {
    chain: (delegationId: string) => ipcRenderer.invoke('scope:chain', { delegationId }),
    amend: (args: { delegationId: string; decisionPointId: string; entries: ScopeEntryDTO[] }) =>
      ipcRenderer.invoke('scope:amend', args),
  },
  ```
  `types.d.ts` 的 `NeonforgeBridge` 同步加 `scope` 段，`ScopeEntryDTO` **复用** `delegation:create` 里那句 `Array<{ kind:'仓库'|'目录'|'命令'|'网络'; pattern:string }>` 的形状（提到文件顶 `type ScopeEntryDTO = ...` 两处共用，不另造第二套）。
- [ ] **Step 4：跑 PASS＋双 tsc** — `npx vitest run tests/unit/preload.bridge.test.ts && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`。
- [ ] **Step 5：commit** — `feat(S2b): preload／types.d.ts 扩 scope 桥（chain／amend，DTO 复用既有 ScopeEntryDTO）`。

## Task 4：`useDomainView` 扩派生（E2/E3 取数面）

**Files:** Modify `src/renderer/useDomainView.ts`；Test 由 L3 覆盖（本任务不建单测，**理由**＝派生只读、无分支判据；分支逻辑在 Task 5/6 的呈现与 Task 7/8 的针里）。
**Interfaces:** Consumes `bridge.scope.chain`＋既有 `timeline` 投影；Produces `DomainView.scopeVersions`、`DomainView.lastResolution`。

- [ ] **Step 1：加 DTO 与视图字段** — `export interface ScopeVersionDTO { seq: number; entries: Array<{ kind: '仓库'|'目录'|'命令'|'网络'; pattern: string }>; amendmentRef: string | null }`，**与 Task 3 里 `types.d.ts` 的 `scope.chain` 返回形状逐字同**（沿用 S1 既有范式＝桥面声明一次、视图层声明一次，两处由双 tsc 挡漂移；契约件无「合并 DTO 声明」这一项，本 plan 不就地扩面）；`DomainView` 加 `scopeVersions: ScopeVersionDTO[]` 与 `lastResolution: { value: string; reason?: string } | null`。
- [ ] **Step 2：实现取数** — 在 `useDomainView` 的轮询体内（现 `const nf = window.neonforge` 之后）加 `nf.scope?.chain(selectedId ?? '')`（未选委托＝空数组）；`lastResolution` **从既有 `timeline` 派生**，不新增通道：
  ```ts
  const rows = timelineRef /* 现视图里的 timeline 行数组 */
  const res = [...rows].reverse().find((r) => r.type === 'DecisionResolved' || r.type === 'DecisionDenied')
  const lastResolution = res
    ? { value: res.type === 'DecisionResolved' ? String((res.detail as { resolution: string }).resolution) : '拒绝',
        reason: (res.detail as { reason?: string })?.reason }
    : null
  ```
  **拒绝理由可缺省**：无值时不带 `reason` 键（E2 的「不得渲染空占位」由 Task 6 承接）。
- [ ] **Step 3：跑回归** — `npx vitest run tests/unit/focus.test.ts tests/unit/waitingItems.test.ts && npx tsc -p tsconfig.json --noEmit`（派生面不破坏既有投影）。
- [ ] **Step 4：commit** — `feat(S2b): useDomainView 派生 scopeVersions／lastResolution（走 scope:chain 与既有时间线，不新增只读通道）`。

## Task 5：`ScopePanel.tsx` 新建（E3＋A5 呈现侧）

**Files:** Create `src/renderer/ScopePanel.tsx`；Modify `src/renderer/DelegationCenter.tsx`（装配位＝`<QueueList />` 之后）。
**Interfaces:** Consumes `view.scopeVersions`＋`bridge.decision.raise`／`bridge.scope.amend`；Produces 无（纯呈现，S-1）。

- [ ] **Step 1：写组件** — 三块：当前版本 entries 只读列表（`data-testid="nf-scope-current"`，取 `scopeVersions.at(-1)`）、历史版本只读列表（`data-testid="nf-scope-history"`，`scopeVersions.slice(0,-1)`，逐项显 `seq`＋`amendmentRef`）、修正提案：textarea 收新 entries（每行 `kind<TAB>pattern`）＋「提出修正」按钮 → `decision.raise({decisionPointId: <桥侧生成或留空由 main 生成>, delegationId, turnId: 在飞轮 id, requestReason:{reason:'作用域修正',operation:<输入>,requestedBy:'用户提请'}})`；批准后同面板「提交修正」→ `scope.amend({delegationId, decisionPointId: <已批准者>, entries})`，返 `{rejected}` 时在面板内显式显示 `why`（**不静默**，原则1）。
- [ ] **Step 2：零聚合 import 自检** — `grep -n "from '../domain" src/renderer/ScopePanel.tsx` 预期**无输出**；跑 `npx vitest run tests/static/s1WritePath.test.ts` 判绿。
- [ ] **Step 3：未持久化态沿用** — 面板不显示"已保存"类文案；S1 的 F2 显式提示件（`App.tsx` 顶栏）覆盖全局，不重复造第二处（回归 `tests/interaction/unpersistedState.interaction.ts` 保持绿）。
- [ ] **Step 4：装配** — `DelegationCenter.tsx`：`import ScopePanel from './ScopePanel'` ＋ `<ScopePanel delegationId={selectedId} view={view} />`。
- [ ] **Step 5：commit** — `feat(S2b): ScopePanel（当前版本＋历史只读＋修正提案两步流，E3/A5 呈现侧）`。

## Task 6：`DecisionCard.tsx` 缘由与留痕（E1/E2 呈现面）

**Files:** Modify `src/renderer/DecisionCard.tsx`；Test 由 Task 7 的 L3 六条覆盖。
**Interfaces:** Consumes `decision.requestReason.reason`＋`view.lastResolution`（新 prop）。

- [ ] **Step 1：加 `data-cause` 钩子** — `<div className="nf-decisioncard__reason-text" data-cause={reason0?.reason ?? ''}>`（L3 选择器面，E1 三类各一针）。
- [ ] **Step 2：加留痕一行** — props 增 `lastResolution?: { value: string; reason?: string } | null`，卡片底部：
  ```tsx
  {lastResolution && (
    <div className="nf-decisioncard__resolution" data-testid="nf-decision-resolved">
      决议：{lastResolution.value}
      {lastResolution.reason ? <span className="nf-decisioncard__deny-reason">（理由：{lastResolution.reason}）</span> : null}
    </div>
  )}
  ```
  **有值才渲染**——无 `reason` 不得出现空占位（E2 逐字要求）。单卡纪律不变（多待决项完整呈现属 S6）。
- [ ] **Step 3：装配传参** — `DelegationCenter.tsx` 的 `<DecisionCard … lastResolution={view.lastResolution} />`。
- [ ] **Step 4：静态闸＋tsc** — `npx vitest run tests/static/s1WritePath.test.ts && npx tsc -p tsconfig.json --noEmit`。
- [ ] **Step 5：commit** — `feat(S2b): DecisionCard 加 data-cause 与决议留痕行（E1/E2 呈现面，理由可选不占位）`。

## Task 7：L3 决策卡针（E1 3＋E2 3）

**Files:** Modify `tests/interaction/decisionCard.interaction.ts`。
**Interfaces:** Consumes 夹具域桥（Task 8 的 mockBridge 扩）；Produces 6 条断言。

- [ ] **Step 1：缘由三值各一条（E1）** — 夹具分别注入 `reason:'作用域外'`／`'高影响清单命中'`／`'作用域修正'` 的待决决策点，断言 `page.locator('[data-cause="作用域修正"]')` 等三个选择器**各自可见**（呈现层不得吞项）。
- [ ] **Step 2：决议三值各一条（E2）** — 注入 `lastResolution` 为 `{value:'批准'}`／`{value:'拒绝',reason:'不放开 prod'}`／`{value:'选项',option:'只读三小时'}`，断言留痕行文案含对应值；**拒绝带理由**那条另断言理由可见；再断一支"无 reason 不出现占位"：`expect(await page.locator('.nf-decisioncard__deny-reason').count()).toBe(0)`。
- [ ] **Step 3：跑绿** — `npx playwright test --project=interaction tests/interaction/decisionCard.interaction.ts`；预期 6 条全绿（含 S1 原有用例不红）。
- [ ] **Step 4：commit** — `test(S2b): 决策卡 L3 缘由三值＋决议留痕六针（E1/E2）`。

## Task 8：L3 版本可溯与 E5 端到端针（E3 1＋E5 1）＋夹具扩

**Files:** Modify `tests/interaction/mockBridge.ts`（夹具，**不计用例**）、`tests/interaction/delegationLifecycle.interaction.ts`。
**Interfaces:** Produces 域桥 `scope` 两方法假件＋`turn.start` 的 `into:'queue'` 分支。

- [ ] **Step 1：扩域桥夹具** — 在既有 `extraInit` 注入段（该文件注释「认领 patch：mockBridge 的 extraInit 排在 neonforge 赋值之前」处）内加：
  ```js
  nf.scope = {
    chain: async () => { window.__domainCalls.push('scope:chain'); return d.scopeVersions || [] },
    amend: async (a) => { window.__domainCalls.push('scope:amend'); return d.amendResult || { rejected: true, why: '夹具默认拒' } },
  }
  ```
  并把 `d.scopeVersions` 加进夹具假数据的默认值表（`seq:1` 一条起步）。函数字段一律走 `extraInit`，**不经 `extra` 的 JSON 序列化**（坑 `p000105`：JSON 会静默吃掉函数）。
- [ ] **Step 2：扩 `turn.start` 分支** — 现假件恒返 `{into:'turn'}`；改成按 `d.busy` 决定：`return d.busy ? { into: 'queue', itemId: 'i1' } : { into: 'turn', turnId: 't2' }`。
- [ ] **Step 3：写 E3 针** — 注入两条版本（`seq1` 原始＋`seq2` 修正，`amendmentRef:'dp9'`），断言 `[data-testid="nf-scope-current"]` 显 `docs/**` ∧ `[data-testid="nf-scope-history"]` 内 `seq=1` 项只读可见 ∧ 未持久化提示件仍在（S1 F2 回归同针）。
- [ ] **Step 4：写 E5 针（偿 S1 审计 F-2 登记针）** — `d.busy = true` 下用户发起输入 ⇒ 断言 `QueueList` 出现该项的**可见位置**（端到端：桥调用 `turn:start` 被记 ∧ DOM 有该行），并断言不是静默丢弃（列表长度 +1）。
- [ ] **Step 5：跑绿** — `npx playwright test --project=interaction`；预期**全绿、E4 下限 ≥8 条新增达成**（本文件 2＋决策卡 6）。
- [ ] **Step 6：commit** — `test(S2b): 版本可溯呈现＋忙时入队端到端针（E3/E5），mockBridge 域桥与 queue 分支扩面`。

## Task 9：段6 出口闸与状态类断言（F1–F11）

**Files:** Modify `docs/tests/coverage-matrix.md`；`.handoff`（CLI）；`docs/audits/`（新报告）。

- [ ] **Step 1：F1–F4 全套新鲜跑**（cwd `apps/desktop`，最后一条在仓库根）
  ```bash
  npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit   # 0 error
  npx vitest run          # 全绿；新增≥40（S2a 32＋S2b 9＝41，§9 同源账）
  npx playwright test --project=interaction
  npx eslint .
  python3 tools/desens-scan.py
  ```
- [ ] **Step 2：F5 回归** — `npx vitest run tests/static/noLegacyImport.test.ts tests/static/appendSingleWriter.test.ts tests/static/s2ProviderName.test.ts`（G-1 同源断言，不另立新闸）。
- [ ] **Step 3：F6 表 N 回填** — `docs/tests/coverage-matrix.md`：轴 4 贯通面、轴 7 的 S2 列（I-8／I-17／S-3）、轴 6 的「C1 E2E 跨层延后 S2」注记转 ✅；**S3–S7 行保持 ⏳**（不得预绿）。
- [ ] **Step 4：F7 逐条勾** — 跑 `stage-gate` 对 `docs/design/stage-specs/V1-S2-authorization-scope.md` 的 `- [ ]` 全数执行：绿则勾，跑不了显式标 blocked＋理由（真轨 E2＝blocked，理由＝三缺口未认领＋无 NF_* Key）。
- [ ] **Step 5：F8/F9/F10 落账** — S2 内语义裁定已存在＝ADR-030（＋流程纪律 ADR-031，不占本闸计数）；`.handoff` 走 CLI（`close`／`set exit --dry-run` 先预览）；commit 到工作分支，**push 与 CI 绿以用户逐批授权为前提**，未授权则 F10 记 blocked 不判红。
- [ ] **Step 6：F11 出口异构审计** — 按 **ADR-031** 派单（一单一型、判据 ≤3、`--max-turns` ≤15、目标 10 分钟、跑脚本必带执行权限＋一次性 worktree）；代码面 S2 出口建议拆：INC-A＝A 组域判据对详设、INC-B＝B/C 组（事件与谓词）、INC-C＝D/E 组（闸与呈现）、INC-D＝**主会话声称的实测复跑**（L3 型，必异体）。报告落 `docs/audits/s2-exit-heterogeneous-audit-2026-10-*.md`，主会话署名采纳，**结论由用户亲裁**。

## Self-Review（本 plan 对契约的覆盖核账）

- **DoD 覆盖**：A1–A3→S2a T1；A4/A5→S2a T2（域前置）＋S2b T1/T2（回执与呈现）；A6→S2a T6；A7→S2a T3；B1/B3→S2a T5；B2→S2b T1；B4→S2a T5 Step 5 回归；C1/C2→S2a T4；C3→S2a T4 Step 6（缘由三值 3 条）；C4→S2b T2 Step 5／T5 Step 2；D1–D3→S2a T8；E1/E2→S2b T6/T7；E3→S2b T5/T8；E4→S2b T8 Step 5；E5→S2b T8 Step 4；F1–F11→S2b T9。
- **计数账**：S2a 39（A22＋B1 1＋C12＋D3＋词表 1）＋S2b 2（B2 同事务）＝**41 ≥ 40**，逐名可点出＝详设 §9 同源；L3 8 条另计（E4 下限），`ipc.channels` 回执面与 mockBridge 夹具改动**不计入下限**。
- **两处已当场核掉的疑点**（不留 TBD）：①`rt.log(draft, tx)` 语义＝`record`→`tx()`→失败 `rollbackTo(snap)` 且不发（读 `repos/memory/timelineRepo.ts:9-19` 得证）⇒ B2 的注入点是 `scopes.save` 抛，不是 `append` 抛；②`decision:raise` 现要求调用方传 id，与详设 §7「main 侧 `randomUUID()`」不符 ⇒ T2 Step 1 补一行 `?? randomUUID()`（同 `delegation:create`/`turn:start` 既有路数，属接线层归位，不动契约面）。
