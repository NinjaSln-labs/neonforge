# S2a 实现计划：授权域内核（Scope 版本链＋谓词全外延＋S-3 闸）

> 由 writing-plans 出，2026-10-06。契约源（不得超其边界）＝`docs/design/stage-specs/V1-S2-authorization-scope.md`（DoD A–F 十一组，本 plan 只承 **S2a 面**＝A1–A7 域面＋B1/B3＋C1/C2/C3 谓词面＋D1–D3；**B2 同事务两条＋E 组呈现＋F 组段6 出口闸全归 S2b**）＋接口 `docs/design/v1.0.0-s2-detailed-design.md` **v0.4**（签名以此为准，用户 2026-10-06 亲裁放行）＋段3 `03-domain-tactics.md` frozen v1.3＋ADR-030（案 A）。执行走 executing-plans，逐任务 TDD。

**Goal:** S2a 只在**领域层与静态闸**落地作用域版本链与 `AmendScope`：`Scope.amend()`＋三层深冻结＋正式 glob＋`requiresApproval` ③类翻转＋`ScopeAmendedPayload` 接线＋S-3 唯一源闸＋仓储面/词表两条防漂移断言；vitest 用例 **40 条**＝A 组 23＋B1 1＋C 组 12＋D 组 3＋词表 1（契约件 F2 下限 40 的余下 2 条＝B2 同事务，归 S2b），**不碰 main/renderer/preload**（那三面归 S2b）。

**Architecture:** 纯领域（`src/domain/authorization/**`＋`src/domain/spec/**`＋`src/domain/timeline.ts`），零 React、零 electron import；内存态（真持久化＝S3）；版本追加只走聚合口（仓储不理解版本链，段3 §7）；事件经 `TimelineRepo.append` 唯一机制口（I-2）；Spec＝纯谓词不收决议不收仓储（段3 §8 头注）。

**Tech Stack:** TypeScript（双 tsc）、vitest ^4（`npx vitest run`，cwd `apps/desktop`）、eslint flat、**零新依赖**（正式 glob 手写分流，不引 minimatch/picomatch）。

## Global Constraints（逐字承上游，全任务硬守）

- **不动面**：`EventType` 22 名禁增禁减；`ScopeRepo` 仍 `save`/`findByDelegation` 两方法；`DecisionPoint` 公开命令仍只 `raise`/`resolve`；余 4 未接线事件（`StallDetected`/`SessionInterrupted`/`DelegationRestored`/`DelegationAbandoned`）载荷保持 `never`（**B3 不预绿**）；`HIGH_IMPACT_LIST` 条目文案不改（扩展必经用户裁定＝段2 §4）；`RequestCause` 与 `OperationCategory` 两处三值词表**不合并、不改写**（F-14 只立断言）。
- **案 A（ADR-030）**：`Scope.amend` 读决议**事实**作前置，不在 `resolve` 处理器里自动追加；「批准本身不自额推进版本」。
- 前置违反＝抛 `DomainError('I-17'|'I-8')`，**抛则零写入、零事件、仓储 save 不发生**；拒绝理由进命令回执不进 timeline（段3 §5 留痕口径）。
- 退役词（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）不入代码与注释；凭据只走 env/系统库；每任务末 `python3 tools/desens-scan.py` rc=0。
- 段6 闸每任务末跑**相关项**；`npx vitest run` 全量＋双 tsc 全项目＋playwright＋eslint 全套＝**S2b 出口**跑（S2a 末只跑域内相关文件）。
- ADR-012 测完再修：本 plan 内不得因红测就地改上游工件。

## File Structure（S2a 新建/改）

```
apps/desktop/src/domain/authorization/Scope.ts        # 扩：amend()／chain getter／深冻结／matches 分流(kind)
apps/desktop/src/domain/timeline.ts                   # 改：ScopeAmendedPayload 具名化；S1_EMIT_EVENT_NAMES→EMIT_EVENT_NAMES(18)
apps/desktop/src/domain/spec/requiresApproval.ts      # 改：③类 return true（全外延三支序）
apps/desktop/src/domain/service/applyChange.ts        # 删：scopeCheckResult「未判（修正分支→S2）」占位三元
tests/unit/scope.versionChain.test.ts                 # 新（A1 4＋A2 3＋A3 2＝9）
tests/unit/scope.amend.test.ts                        # 新（A4 4＋4b＋A5 2＝7；B2 2 条归 S2b 追加同文件）
tests/unit/scope.repoSurface.test.ts                  # 新（A6 1）
tests/unit/scope.covers.test.ts                       # 新（A7 6）
tests/unit/scope.vocabulary.test.ts                   # 新（F-14 双源词表 1）
tests/unit/requiresApproval.test.ts                   # 扩（C1 3＋C2 6）
tests/unit/decisionPoint.test.ts                      # 扩（C3 缘由三值 3）
tests/unit/timeline.payloadKeys.test.ts               # 扩（B1 新增独立 it() 1）
tests/static/s3HighImpactList.test.ts                 # 新（D1 1＋D2 2）
```

**计数账（S2a）**：vitest 新增 **40 条**＝A 组 23（T1 9＋T2 7＋T3 6＋T6 1）＋B1 1＋C 组 12（T4 C1 3＋C2 6＋C3 3）＋D 组 3＋词表 1。**S2b 另加 2 条**（B2 同事务）⇒ 合计 **41**＝契约件 F2 下限 40 满足且可逐名点出。L3 8 条走 playwright（E4 下限），**不重复计入 F2**；`tests/unit/ipc.channels.test.ts` 与 mockBridge 夹具改动按 §9 纪律**不计下限**。

**执行序（编译前置，逐字核过 `timeline.ts`）＝ 5 → 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9**。Task 1/2 的 `amend` 要返回 `draft: { type: 'ScopeAmended', detail: {...} }`，而 `PayloadMap['ScopeAmended']` 现状＝`ScopeAmendedPayload = never`——对 `never` 赋对象字面量过不了 tsc（实测于本会话读码，非推测）。Task 5 的载荷具名化因此是 1/2 的**硬前置**，不随文件里的物理序号。

---

## Task 1：Scope 版本链与三层深冻结（A1／A2／A3）

**Files:** Modify `src/domain/authorization/Scope.ts`；Test `tests/unit/scope.versionChain.test.ts`（新建 9 条）。
**Interfaces:** Consumes `DecisionPoint`（`import type { DecisionPoint } from './DecisionPoint.js'`）；Produces `amend(dp, entries, ts): { scope: Scope; draft: EventDraft }`、`get chain(): readonly ScopeVersion[]`。

- [ ] **Step 1：写失败测（A1 单调 4 条）** — 断言序列：`Scope.initial('d1',[{kind:'仓库',pattern:'src/**'}])` → 造已批准修正决议（`const { decisionPoint: dp } = DecisionPoint.raise({decisionPointId:'dp1',delegationId:'d1',turnId:'t1',requestReason:{reason:'作用域修正',operation:'扩到 docs',requestedBy:'用户提请'}})`，随后 `dp.resolve('批准')`——**`resolve` 返回 `EventDraft[]` 不是聚合本体**，夹具须取 `raise` 返回值里的 `decisionPoint` 再就地决议）→ `scope.amend(dp,[{kind:'仓库',pattern:'docs/**'}],'2026-10-06T00:00:00Z')`；断言 `next.scope.version === 2`、`[...next.scope.chain].map(v=>v.seq)` 逐次严格递增、`chain.length===2`；再断言**乱序拒**：对返回实例二次 amend 后 `chain.at(-1).seq` 仍＝上一位＋1（调用方无法注入 seq——`amend` 形参里没有 seq 位）。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/scope.versionChain.test.ts`；预期：红（`amend` 不存在）。
- [ ] **Step 3：实现链追加＋深冻结** — `Scope.ts` 内：
  ```ts
  const freezeEntry = (e: ScopeEntry): ScopeEntry => Object.freeze({ kind: e.kind, pattern: e.pattern })
  const freezeVersion = (v: ScopeVersion): ScopeVersion =>
    Object.freeze({ seq: v.seq, entries: Object.freeze(v.entries.map(freezeEntry)), amendmentRef: v.amendmentRef })

  static initial(delegationId: string, entries: ScopeEntry[]): Scope {
    return new Scope(delegationId, [freezeVersion({ seq: 1, entries, amendmentRef: null })])
  }

  get chain(): readonly ScopeVersion[] { return Object.freeze([...this.chain_]) }   // A3：吐冻结副本
  get entries(): ScopeEntry[] { return this.chain[this.chain.length - 1].entries }  // 已是冻结副本的元素
  ```
  `private readonly chain_` 持内部数组；**`covers()`／`entries`／`version` 三处一律读 `this.chain_` 末位，不走 `chain` getter**（getter 每次调用都 `Object.freeze([...])` 拷一份，热路径上白拷；对外只读面才走 `chain`）。`amend` 新建实例＝A3「就地改写旧版本的路径命中数＝0」的静态面（旧版本对象永不被原地改）。
  **拆界（执行期订正）**：A2 第 3 条断言「同 `decisionPointId` 二次修正不产第二版本」，它的实现＝`amend` 里的 I-8 查重那一支——**本任务连同该支一起落**，否则该测跑不到绿；I-17 那两支（缘由／已批准）留 Task 2，提前落会让 Task 2 的失败测跑不红（违反 TDD 先红纪律）。
- [ ] **Step 4：跑 A2／A3 三条＋两条通过** — A2：`chain[1].amendmentRef === 'dp1'` ∧ `chain[0].amendmentRef === null`；A3：`expect(Object.isFrozen(chain[0])).toBe(true)`、`expect(Object.isFrozen(chain[0].entries)).toBe(true)`、`expect(Object.isFrozen(chain[0].entries[0])).toBe(true)`；逃逸断言：`chain[0].entries[0].pattern = 'x'` 在严格模式下抛／或赋值后重读仍 `'src/**'`（**逐层都测**——浅冻结只挡前两层，F-7 的靶心）。
- [ ] **Step 5：跑 PASS** — 同命令；预期：9 绿。
- [ ] **Step 6：commit** — `feat(S2a): Scope 版本链只追加＋VO 三层深冻结（A1/A2/A3，偿 F-7 逃逸面）`。

## Task 2：AmendScope 命令前置（A4／A5 域面）

**Files:** Modify `src/domain/authorization/Scope.ts`；Test `tests/unit/scope.amend.test.ts`（新建 7 条＝A4 四条＋**4b 缘由不符正面用例**＋A5 两条；**B2 两条留 S2b 追加进本文件**）。
**Interfaces:** Consumes `DomainError`（`import { DomainError } from '../domainError.js'`）、`EventDraft`；Produces `amend` 的三支前置与 `'I-17'`/`'I-8'` 错误码。

- [x] **Step 1：写失败测（A4 四条）** — ①无决议：`expect(() => scope.amend(undefined as unknown as DecisionPoint, entries, ts)).toThrow(DomainError)`；②未决决议（只 raise 不 resolve）⇒ 抛；③决议值＝`'拒绝'` ⇒ 抛；④`'批准'` ⇒ 不抛且返回 `{scope,draft}` 且 `draft.type === 'ScopeAmended'`。每条附加断言＝**抛出的那一支 `scope.chain.length` 不变**（违反映零写入）。
  **＋4b（执行期由主会话复核补）**＝`缘由＝作用域外 ∧ 决议已批准` ⇒ 抛 `I-17` 且链不长。补因：①支的真实语义「缘由不符⇒拒」当时无正面用例（第 1 条只是以 `dp.resolution` 读 `undefined` 撞 TypeError 顺带杀到①支）；**变异实测**＝删①支后第 1 条与 4b 同时红，两条都是活用例。
- [ ] **Step 2：跑 FAIL** — 预期红。
- [ ] **Step 3：实现 amend** —
  ```ts
  amend(dp: DecisionPoint, entries: ScopeEntry[], ts: string): { scope: Scope; draft: EventDraft } {
    if (dp?.requestReason?.reason !== '作用域修正') throw new DomainError('I-17', '修正须绑定缘由＝作用域修正的决策点')
    if (dp.resolution?.value !== '批准') throw new DomainError('I-17', '批准权仅用户：决议未批准（未决/拒绝/选项一律拒）')
    if (this.chain_.some((v) => v.amendmentRef === dp.decisionPointId))
      throw new DomainError('I-8', '同 decisionPointId 只产一个版本')
    const seq = this.chain_[this.chain_.length - 1].seq + 1
    const next = new Scope(this.delegationId, [...this.chain_, freezeVersion({ seq, entries, amendmentRef: dp.decisionPointId })])
    return {
      scope: next,
      draft: {
        type: 'ScopeAmended',
        delegationId: this.delegationId,
        detail: { delegationId: this.delegationId, versionPair: { from: seq - 1, to: seq }, decisionPointId: dp.decisionPointId },
      },
    }
  }
  ```
  注：`ts` 形参在域内不进 payload（段3 §5 三键禁增禁减，`ts` 由 `log` 侧补）——保留形参是为 §2 签名逐字一致；不用它就在参数名前加 `_` 以免 eslint 报未用。
- [ ] **Step 4：跑 A5 两条** — `requestedBy:'AI 提请'` 的已批准决议 ⇒ amend **仍成功**（批准权仅用户判的是**决议值**，提请者不影响）；另一条＝`'选项'` 决议值 ⇒ 抛 I-17 且链不长。
- [ ] **Step 5：跑 PASS** — `npx vitest run tests/unit/scope.amend.test.ts`；预期 7 绿。
- [ ] **Step 6：commit** — `feat(S2a): AmendScope 三支前置（I-17 缘由/批准 ∧ I-8 决议查重），违例零写入（A4/A5）`。

## Task 3：正式 glob 分流（A7，偿清 `ponytail:` 天花板）

**Files:** Modify `src/domain/authorization/Scope.ts`；Test `tests/unit/scope.covers.test.ts`（新建 6 条）。
**Interfaces:** `covers(kind, resource)` 签名不变；`matches` 改 arity＝`matches(kind, pattern, resource)`（全仓唯一 caller＝`covers`，§8）。

- [ ] **Step 1：写失败测** — 逐字取详设 §8 表格：正例 `仓库 src/** → src/a/b.ts`、`目录 docs/*/x.md → docs/a/x.md`、`命令 npm* → npm install`、`网络 *.githubusercontent.com → a.githubusercontent.com`、`网络 example.com:443 → example.com:443`；反例 `仓库 src/** → test/a.ts`、`目录 docs/*/x.md → docs/a/b/x.md`、`命令 npm* → nodepm x`、`网络 *.github.com → evilgithub.com`。合成 6 条 `it()`（同 kind 的正反例并一条，**每条至少一个断言对**）。
- [ ] **Step 2：跑 FAIL** — 预期：三条正例红（现 `matches` 只有三支，丢 kind）。
- [ ] **Step 3：实现分流** — 逐字照详设 §8 伪代码（`segEq` ＋ kind 分流；命令支不收 argv、领域层不做 shell 解析）：
  ```ts
  const segEq = (p: string, r: string) =>
    p === r || (p.includes('*') && new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(r))

  function matches(kind: ResourceKind, pattern: string, resource: string): boolean {
    if (pattern === '**') return true
    if (kind === '命令') return pattern.endsWith('*') ? resource.startsWith(pattern.slice(0, -1)) : resource === pattern
    if (kind === '网络') {
      if (!pattern.startsWith('*.')) return resource === pattern
      const dot = pattern.slice(1)
      return resource.endsWith(dot) && resource.length > dot.length
    }
    const ps = pattern.split('/'), rs = resource.split('/')
    return pattern.endsWith('/**')
      ? rs.length >= ps.length - 1 && ps.slice(0, -1).every((p, i) => segEq(p, rs[i]))
      : ps.length === rs.length && ps.every((p, i) => segEq(p, rs[i]))
  }
  ```
  `covers` 内改为 `matches(e.kind, e.pattern, resource)`；**删掉 `// ponytail:` 天花板注释行**（天花板已偿，留着就是假账）。
- [ ] **Step 4：跑 PASS＋回归** — `npx vitest run tests/unit/scope.covers.test.ts tests/unit/requiresApproval.test.ts`；预期：新 6 绿、S1 既有全数不红（A7 后半判据）。
- [ ] **Step 5：commit** — `feat(S2a): matches 收 kind 分流＝正式 glob（偿 Scope.ts ponytail 天花板，A7）`。

## Task 4：`requiresApproval` ③类翻转与全外延真值表（C1／C2）

**Files:** Modify `src/domain/spec/requiresApproval.ts`；Test `tests/unit/requiresApproval.test.ts`（扩 9 条：C1 3＋C2 6）。
**Interfaces:** Consumes `Scope.covers`（Task 3 后语义）；Produces 三支序（③→①→②）。

- [ ] **Step 1：写失败测（C1 三条）** — `category:'作用域修正'` 且作用域内∧未命中 ⇒ `true`（现为 `false`，先红）；类别闭集断言 `['资源访问','命令执行','作用域修正']` 不多不少；③类**不查决议**（谓词只判「要不要拍板」，判「够不够」在 `Scope.amend`——§4）。
- [ ] **Step 2：写 C2 真值表 6 条** — 作用域外∧未命中∧非修正⇒真；作用域外∧命中∧非修正⇒真；作用域内∧未命中∧非修正⇒**假**；作用域内∧命中∧非修正⇒真；`hits` 非 null 但不在 `HIGH_IMPACT_LIST`（用 `'随手编的一条' as never`）⇒假（清单是闭集）；修正∧作用域内∧未命中⇒真。
- [ ] **Step 3：跑 FAIL** — 预期 C1 第①条与 C2 若干条红。
- [ ] **Step 4：实现** — 把 `if (op.category === '作用域修正') return false` 改 `return true`，注释同步为「③类恒真：修正必经拍板（I-17 的『拍板够不够』由聚合前置复核，两处不同源＝防双源）」；三支顺序保持③→①→②。
- [ ] **Step 5：跑 PASS** — `npx vitest run tests/unit/requiresApproval.test.ts`；预期全绿（含 S1 原有用例）。
- [ ] **Step 6：C3 三条（decisionPoint 扩）** — 在 `tests/unit/decisionPoint.test.ts` 追加：缘由＝`作用域外`／`高影响清单命中`／`作用域修正` **各一条** I-3 归属断言（缺 `delegationId` 或缺 `turnId` ⇒ `DomainError('I-3')` 且**不生成**；三条各自 `raise` 的 `requestReason.reason` 不同，证 ③类走同一守卫、不另立一套）。跑 `npx vitest run tests/unit/decisionPoint.test.ts` 绿（S1 既有三分支已实现，本任务是**扩面回归**不是新功能——先写测再确认，若意外红＝抓到实现缺口，按 ADR-012 记录后再修）。
- [ ] **Step 7：commit** — `feat(S2a): RequiresApprovalSpec ③类翻转＋三类并集真值表＋缘由三值归属扩面（C1/C2/C3）`。

## Task 5：`ScopeAmended` 载荷接线（B1／B3）

**Files:** Modify `src/domain/timeline.ts`；Test `tests/unit/timeline.payloadKeys.test.ts`（新增独立 `it()` 1 条）＋回归 `tests/unit/timeline.eventCatalog.test.ts`。
**Interfaces:** Produces `ScopeAmendedPayload`（3 键）；`EMIT_EVENT_NAMES`（18）替 `S1_EMIT_EVENT_NAMES`（17）。

- [ ] **Step 1：写失败测** — payloadKeys 内新增：`expect(Object.keys(scopeAmendedDraft.detail).sort()).toEqual(['decisionPointId','delegationId','versionPair'])`（禁增禁减；`versionPair` 是**一个键**、内含 `{from,to}`）；eventCatalog 回归断言名单仍 22、`EMIT_EVENT_NAMES.length===18`。
- [ ] **Step 2：跑 FAIL** — 预期红（`never` 类型／17 名单）。
- [ ] **Step 3：实现** —
  ```ts
  export interface ScopeAmendedPayload {
    delegationId: string
    versionPair: { from: number; to: number } // 版本对（旧→新）
    decisionPointId: string
  }
  ```
  删掉 `export type ScopeAmendedPayload = never`；`NON_EMIT` 数组去掉 `'ScopeAmended'`（余 4：StallDetected／SessionInterrupted／DelegationRestored／DelegationAbandoned）；`S1_EMIT_EVENT_NAMES` 改名 `EMIT_EVENT_NAMES`，注释「18＝22 去掉余下 4 个未接线（S3／S5）」。
- [ ] **Step 4：全仓改名同步** — `grep -rn "S1_EMIT_EVENT_NAMES" apps/desktop/src apps/desktop/tests` → 逐处替换（预期命中＝`tests/unit/timeline.eventCatalog.test.ts` 与引用点，数出来几处改几处，不猜）。
- [ ] **Step 5：跑 PASS** — `npx vitest run tests/unit/timeline.payloadKeys.test.ts tests/unit/timeline.eventCatalog.test.ts tests/unit/timeline.publishDiscipline.test.ts`；预期：B1/B3/B4 全绿（**B4 属回归面，不计新增**）。
- [ ] **Step 6：commit** — `feat(S2a): ScopeAmended 载荷具名接线＋发射面 17→18（B1/B3，余 4 保持 never）`。

## Task 6：仓储面不变断言（A6）

**Files:** Test `tests/unit/scope.repoSurface.test.ts`（新建 1 条，两面断言）。
**Interfaces:** Consumes `ScopeRepo`（`src/domain/repos/index.ts`）＋`InMemoryScopeRepo`。

- [ ] **Step 1：写测** — ①类型层：`const surface: Record<keyof ScopeRepo, unknown> = { save: repo.save, findByDelegation: repo.findByDelegation } as const satisfies Record<keyof ScopeRepo, unknown>`（就地扩方法则双 tsc 编译不过）；②运行时层：`expect(new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(repo)))).toEqual(new Set(['constructor','save','findByDelegation']))`。**运行时层用 `getOwnPropertyNames(prototype)`**——内存 class 的 `for…in` 会漏（详设 §3 F-13）。
- [ ] **Step 2：跑 PASS＋双 tsc** — `npx vitest run tests/unit/scope.repoSurface.test.ts && npx tsc -p tsconfig.json --noEmit`；预期：绿（本任务不改实现，防漂移断言本身就是产物）。
- [ ] **Step 3：commit** — `test(S2a): ScopeRepo 面不变（类型层＋运行时层两面，A6 防就地扩冻结件）`。

## Task 7：双源词表断言（F-14）

**Files:** Test `tests/unit/scope.vocabulary.test.ts`（新建 1 条）。
**Interfaces:** Consumes `RequestCause`（DecisionPoint.ts）与 `OperationCategory`（requiresApproval.ts）。

- [ ] **Step 1：写测** — 词表是类型联合、运行时不存在 ⇒ 两侧各导出一个成员数组作**运行时靶**：`DecisionPoint.ts` 加 `export const REQUEST_CAUSES: readonly RequestCause[] = ['作用域外','高影响清单命中','作用域修正']`；`requiresApproval.ts` 加 `export const OPERATION_CATEGORIES: readonly OperationCategory[] = ['资源访问','命令执行','作用域修正']`。断言＝两侧 `includes('作用域修正')` 为真 ∧ 两数组各长度 3 ∧ 「作用域修正」在两表中的**字面完全同一**（`===` 比较取出的共享常量，不各写一遍字面）。
- [ ] **Step 2：跑 PASS** — 预期绿。闸在 L1、零新依赖（F-14 处置面）。
- [ ] **Step 3：commit** — `test(S2a): 作用域修正词表双源断言（F-14，任一侧改写即红）`。

## Task 8：S-3 高影响清单唯一源闸（D1／D2／D3）

**Files:** Test `tests/static/s3HighImpactList.test.ts`（新建 3 条）。
**Interfaces:** Consumes 段2 §4 唯一源行（`docs/neonforgeV1.0.0/02-domain-strategy.md`）＋`HIGH_IMPACT_LIST`；Produces `parseHighImpactLine(line: string): string[]`（三步解析）。

- [ ] **Step 1：写失败测（D1）** — 路径用 `new URL('../../../../docs/neonforgeV1.0.0/02-domain-strategy.md', import.meta.url)`（cwd 无关）；断言 `expect(new Set(parse(md))).toEqual(new Set(HIGH_IMPACT_LIST))`（顺序无关、逐项逐字）；锚点行匹配数必须 **恰＝1**（0 或 >1 都判红）。
- [ ] **Step 2：跑 FAIL** — 预期红（`parse` 未实现）。
- [ ] **Step 3：实现三步解析** — 逐字照详设 §8：`const inner = line.slice(line.indexOf('（')+1, line.lastIndexOf('）'))` → `inner.slice(inner.indexOf('：')+1)` → `split('；').map(s=>s.trim()).filter(Boolean)`；**禁止按第一个 `）` 截断**（会丢第五项）；解析出空项／找不到锚点 ⇒ `throw`（判红，不得静默绿＝D1 唯一易错点）。测试内**不复制清单文本**当第二源（D3 同源纪律）。
- [ ] **Step 4：可红自证两条（D2）** — ①领域侧漂移：把 `[...HIGH_IMPACT_LIST, '不在附录 A 的一条'] as never` 喂给比较 ⇒ 断言判红；②**解析侧漂移**：构造一行末项后多一个 `）` 的文本 ⇒ 三步解析少切一项 ⇒ 判红。**两条都要显式断言"红"**（不留永远绿的空闸，沿 S1 A5.2 纪律）。
- [ ] **Step 5：跑 PASS** — `npx vitest run tests/static/s3HighImpactList.test.ts`；预期 3 绿。
- [ ] **Step 6：commit** — `feat(S2a): S-3 高影响清单唯一源闸（CI diff 逐字比对＋双侧可红自证，D1/D2/D3 首立）`。

## Task 9：`applyChange` 占位三元删除（C1 副面）

**Files:** Modify `src/domain/service/applyChange.ts`；Test `tests/unit/applyChange.test.ts`（回归，不新增）。
**Interfaces:** Consumes Task 4 后的谓词；Produces `scopeCheckResult` 无「未判」分支。

- [ ] **Step 1：定位** — `grep -n "未判" apps/desktop/src/domain/service/applyChange.ts`，读到那段三元：③类现由 `requiresApproval` 拦在闸前 ⇒ 修正分支在 `applyChange` 内不可达（详设 §1 item 4）。
- [ ] **Step 2：写断言再删** — 在 `tests/unit/applyChange.test.ts` 追加前先跑一次回归确认现状；删除占位三元，`scopeCheckResult` 只保留可达分支；若 `it()` 内仍断言「未判」文案则同步改断言（不删用例）。
- [ ] **Step 3：跑 PASS** — `npx vitest run tests/unit/applyChange.test.ts tests/unit/requiresApproval.test.ts`；预期绿。
- [ ] **Step 4：commit** — `refactor(S2a): applyChange 删不可达「未判（修正分支→S2）」占位（③类由谓词闸前拦下）`。

---

## S2a 出口（自证，不跑全量闸）

```bash
cd apps/desktop
npx vitest run tests/unit/scope.versionChain.test.ts tests/unit/scope.amend.test.ts \
  tests/unit/scope.repoSurface.test.ts tests/unit/scope.covers.test.ts tests/unit/scope.vocabulary.test.ts \
  tests/unit/requiresApproval.test.ts tests/unit/decisionPoint.test.ts tests/unit/applyChange.test.ts \
  tests/unit/timeline.payloadKeys.test.ts tests/unit/timeline.eventCatalog.test.ts \
  tests/unit/timeline.publishDiscipline.test.ts tests/static/s3HighImpactList.test.ts
npx vitest run            # 全量：S1 既有 188 绿不红（加本次 40 ⇒ 228）
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit   # 0 error
npx eslint . && python3 tools/desens-scan.py                                   # 0 / rc=0
```
预期：S2a 新增 **40 条**全绿；`ScopeAmended` 的 `never` 仅余 4 事件（B3 不预绿）；**B2 两条与 E 组 8 条 L3、F 组表 N 回填与出口异构审计在 S2b**。
