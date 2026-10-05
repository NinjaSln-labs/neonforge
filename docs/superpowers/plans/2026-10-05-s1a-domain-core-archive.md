# S1a 实现计划：领域内核＋假网关（段6 · 只增不删）

> 由 writing-plans 出，2026-10-05。契约源（不得超其边界）＝`docs/design/stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md`（DoD A–G，本 plan 只承 **S1a 面**＝A1 tag＋B/C/D＋E 假轨＋F3 域面；**物理归档 A2–A6＋入口 rewire＋复用文件去旧域依赖＋E2/F 真网关面全归 S1b，S1 出口闸在 S1b 完成时跑**）＋接口 `docs/design/v1.0.0-s1-detailed-design.md` v0.3（签名以此为准）＋段3 `03-domain-tactics.md` frozen v1.2。执行走 executing-plans，逐任务 TDD。

**Goal:** S1a 只**增/重写新领域树**（7 聚合＋7 仓储＋3 Spec＋领域服务＋`timeline.ts` 22 事件闭集），L1 端到端用**假网关**跑通「发起→推进→拍板→核验→收尾」最小闭环；**不删旧文件**（归档与 rewire 在 S1b）。S1a 内 DoD B/C/D＋E 假轨＋F3 域面逐条绿。

**Architecture:** DDD 四上下文＋机制层，纯领域无 React（现 `src/domain/*.ts` 范式，ESM `.js` import）；内存态（重启即失，真持久化＝S3）；事件经 `TimelineLog` 聚合唯一写者口落账后进程内只读分发；Spec＝纯谓词。

**Tech Stack:** TypeScript（双 tsc：`tsconfig.json` renderer／`tsconfig.main.json` main）、vitest ^4、eslint ^10 flat（`eslint.config.js`）、无新依赖（promptfoo 不引入；不引 dependency-cruiser）。

## Global Constraints（逐字承上游，全任务硬守）

- 事件闭集＝段3 §5 **22 名**（`timeline.eventCatalog.test.ts` 名单＝§6 快照，禁增禁减；改动回段3 不改测试）。
- `EvidenceType`＝4 值（变更集/命令输出/测试结果/验收判据运行结果）；互斥标记：本委托 DoD 验收判据运行产出记第 4 值、不记 `测试结果`。
- `AcceptanceSpec` S1a **只实现基线**（待核验态∧系统采集∧可打开核验）；产物谓词两条款（变更集 D1＋验收判据运行结果 D6）**→ S4**，以指名 S4 的跳过用例显式登记、**不预绿**（C13／ADR-027 D5）。
- `deriveWaitingItems` 收束态过滤 **→ S5**（S1a 只四类闭集＋无归宿计数 0，C7）。
- `StallSpec`/`StallDetector`→S5、`RecoverableSpec`/持久化→S3、作用域修正→S2、`delegation:abandon`→S5：本 plan 不实现，仅留类型/注册位。
- 事务：聚合状态写入与 `TimelineRepo.append` **同事务**，追加失败⇒整事务回滚（段3 §6）。
- 归档＝`git rm` 落地、不留死目录；复用面不反向 import 归档文件（G-1）；renderer 扁平无 `components/`。
- 退役词（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）不入代码/注释。凭据只走 env/系统库，`desens-scan` rc=0。
- 段6 闸每任务末跑相关项；**S1a 出口＝域内**（新域单测＋静态闸＋desens，DoD B/C/D＋E假轨＋F3 逐条）——**不跑全项目双 tsc／全量 vitest**（旧 app 与新树并存期部分红属预期，全项目闸归 S1 出口＝S1b）。

## File Structure（S1a 新建/改）

```
apps/desktop/src/domain/
  timeline.ts                    # 就地重写：22 事件闭集 + TimelineLog 聚合 + EventEntry VO
  delegation/Delegation.ts       authorization/Scope.ts authorization/DecisionPoint.ts
  authorization/highImpactList.ts turn/Turn.ts turn/TurnToken.ts queue/InstructionQueue.ts
  evidence/EvidenceItem.ts       projection/waitingItems.ts projection/focus.ts
  spec/requiresApproval.ts spec/validClaim.ts spec/acceptance.ts
  service/admissionCheck.ts service/applyChange.ts
  repos/index.ts repos/memory/{delegation,scope,decisionPoint,turn,instructionQueue,evidence,timeline}Repo.ts
apps/desktop/tests/unit/…        tests/static/{noLegacyImport,appendSingleWriter,s1WritePath,s2ProviderName}.test.ts
apps/desktop/eslint.config.js    # 追加 renderer 禁 import 聚合写面（flat files 分块）
```

---

## Task 1：基线 tag（A1）＋确立「只增不删」原则

> **S1a 全程不 `git rm` 任何旧文件**——新领域树与旧 app 并存（ADR-028 负面①「归档批至骨架接线前非编译窗」；全项目双 tsc 与物理归档归 **S1 出口＝S1b 完成后**跑）。归档批 `git rm`（A2/A2.3/A2.4/A2.5）＋入口 rewire（App/ipc/main/preload）＋复用文件去旧域依赖（gateway/tools/verification 现 import `conversationState`/`protocolTools`、main.ts 现 import `timelineLogger`）**全部在 S1b**。S1a 只建/重写 `src/domain/**` 新文件＋新测，旧 app 文件不碰（旧呈现/main 引用新改写 timeline.ts 的残留会在 S1b 随归档一并清除）。

**Files:** 无删除；仅打基线 tag＝`legacy-freeze-v0.1.0`（轻量 tag 无署名面＝C3/C4，指向含旧实现的当前 commit，供 S1b 归档前冻结、`git show` 调阅）。
**Interfaces:** Produces tag；不产/删代码文件。

- [ ] **Step 1：打基线 tag** — `cd apps/desktop && git tag legacy-freeze-v0.1.0` ；预期：`git rev-parse legacy-freeze-v0.1.0` 返 sha（A1）。
- [ ] **Step 2：核 A1 可调阅** — `git show legacy-freeze-v0.1.0:apps/desktop/src/domain/conversationState.ts | wc -l` ；预期：>0。
- [ ] **Step 3：S1a 无代码 commit**（tag 即本任务产物；无文件改动则跳过 commit，或 `git commit --allow-empty -m "chore(S1a): 基线 tag legacy-freeze-v0.1.0，确立只增不删"`）。

## Task 2：G-1 防回流依赖闸（A5）

**Files:** Test `tests/static/noLegacyImport.test.ts`。
**Interfaces:** Consumes 归档路径黑名单（5 旧领域名＋A2.2 24 旧呈现路径，24 名引 stage-spec 不复制）；Produces `assertNoLegacyImport(NEW_FILE_SET): string[]`。**S1a 扫描范围＝新领域树文件（`src/domain/{delegation,authorization,turn,queue,evidence,projection,spec,service,repos}/**` ＋ `src/domain/timeline.ts` ＋ `src/renderer` 新六件）**——旧文件（`src/main/tools.ts`/`gateway.ts`/`verification.ts` 现 import `conversationState`/`protocolTools`）在 S1a 仍存在、**不属本闸范围**（S1b 移植去依赖后由全树 G-1 覆盖）。

- [ ] **Step 1：写失败测** — 遍历新领域文件集，正则匹配 `from ['"].*(conversationState|agentLoop|protocolTools|planProposalParser|completionClaimParser|<A2.2 旧呈现>)`；断言新树命中＝0；fixture 子测：临时新文件 `import '../conversationState.js'`→断言命中>0（可红自证 A5.2）。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/static/noLegacyImport.test.ts` ；预期：fixture 断言先红（未写实现时）。
- [ ] **Step 3：实现 `assertNoLegacyImport`** — 对新文件集 `fs.readdirSync` 递归＋`import` 语句匹配；命中返路径数组。
- [ ] **Step 4：跑 PASS** — 同命令；预期：新树主断言 0 命中绿、fixture 断言 >0 绿。
- [ ] **Step 5：commit** — `test(S1a): G-1 防回流依赖闸（新域不 import 旧域）+ fixture 可红自证（A5）`。

## Task 3：timeline.ts 22 事件闭集重写（B1/B2）

**Files:** Modify `src/domain/timeline.ts`（全替）；Test `tests/unit/timeline.eventCatalog.test.ts`、`tests/unit/timeline.payloadKeys.test.ts`。
**Interfaces:** Produces `export const EVENT_NAMES: readonly EventType[]`（22）、`export type EventType`、`export interface PayloadOf` 判别联合（键名逐字＝详设 §6 表）。

- [ ] **Step 1：写失败测（闭集名）** — `expect(new Set(EVENT_NAMES)).toEqual(new Set([22 名]))`；旧 ~56 类型残留命中＝0。22 名快照＝详设 §6：DelegationCreated,InputAcknowledged,TurnStarted,TurnEnded,DecisionRaised,DecisionResolved,DecisionDenied,ChangeProduced,EvidenceRecorded,EvidenceInspected,CompletionClaimed,DelegationAccepted,DelegationRejected,DelegationReopened,DelegationClosed,InstructionQueued,InstructionAdmitted,ScopeAmended,StallDetected,SessionInterrupted,DelegationRestored,DelegationAbandoned。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/timeline.eventCatalog.test.ts`；预期：红（旧 timeline.ts 导出不同名）。
- [ ] **Step 3：实现 EventType 联合 + EVENT_NAMES** — 全删旧 `TIMELINE_EVENT_SPECS`（56 项）；写 22 名联合＋`as const` 数组＋每事件 payload interface（键逐字对齐详设 §6，如 `DelegationCreated{delegationId,intent,scopeVersion:number}`…；S1a 未发射 5 事件 payload 先 `type X = never`，CC-04）。
- [ ] **Step 4：跑 PASS** — eventCatalog＋payloadKeys 测绿（payloadKeys 对 17 发射事件逐个断言 `Object.keys` 集＝详设 §6 键集，禁增禁减）。
- [ ] **Step 5：commit** — `feat(S1a): timeline.ts 重写为 22 事件闭集 + 载荷键契约（B1/B2）`。

## Task 4：TimelineLog 聚合 + append 单一写者同事务（B3/C14）

**Files:** `timeline.ts` 加 `class TimelineLog`；`repos/index.ts`+`repos/memory/timelineRepo.ts`；Test `tests/unit/timeline.append.test.ts`、`tests/static/appendSingleWriter.test.ts`。
**Interfaces:** Produces `TimelineLog.record(event): EventEntry`（seq++，无重号/跳号）；`interface TimelineRepo{ append(e):void; since(seq):TimelineEvent[]; findByDelegation(id):TimelineEvent[] }`；`append` 内调 `record`＋聚合写入同事务，失败⇒回滚。

- [ ] **Step 1：写失败测** — 并发/顺序追加→seq `[1,2,3…]` 单调无重跳；追加失败注入（record throw）⇒聚合状态未变（回滚）。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/timeline.append.test.ts`；预期：红。
- [ ] **Step 3：实现** — `TimelineLog` 持 `entries:EventEntry[]`＋`seq:number`；`record` 取 seq++ 落 entries；`InMemoryTimelineRepo.append` 包同事务（记录前快照，throw 则还原）。静态测断言非 `TimelineRepo.append` 路径调 `record` 命中＝0。
- [ ] **Step 4：跑 PASS** — append 测＋appendSingleWriter 静态测绿。
- [ ] **Step 5：commit** — `feat(S1a): TimelineLog 聚合根 + TimelineRepo.append 单一写者同事务（B3/C14）`。

## Task 5：发布纪律（B4）

**Files:** Test `tests/unit/timeline.publishDiscipline.test.ts`；`timeline.ts` 订阅分发。
**Interfaces:** Produces `subscribe(listener):unsubscribe`（进程内只读）；发布顺序＝先 append 后分发；对外发布通道命中＝0。

- [ ] **Step 1：写失败测** — 落账⇒订阅者收到；断言无 `process.send`/网络发布；append 前分发调用＝0。
- [ ] **Step 2–4：** 实现 `TimelineLog` 发布顺序（append→emit 只读订阅）；跑绿。
- [ ] **Step 5：commit** — `feat(S1a): 事件先落账后进程内分发、对外零发布（B4）`。

## Task 6：Delegation 聚合状态机（C5/C8/C11/C13 基线）

**Files:** `delegation/Delegation.ts`、`repos/{index,memory/delegationRepo}.ts`；Test `tests/unit/delegation.stateMachine.test.ts`、`delegation.reopen.test.ts`、`acceptance.test.ts`。
**Interfaces:** Consumes `ValidClaimSpec`/`AcceptanceSpec`（T12/T13）；Produces `Delegation`（§2 方法：create/claimCompletion/accept/reject/archive；重开＝reject 内部转移；abandon→S5 不留命令）。`DelegationState` 枚举＝详设 §2。

- [ ] **Step 1：写失败测** — C5 无据转 pendingVerify→拒；C8 重复终态幂等、收尾→归档恰一终态；C11 `reject` 后 delegationId 不变、reopenCount+1、新建委托＝拒；C13 基线 AcceptanceSpec 过才可 accept，含 `it.skip('产物谓词条款→S4',...)`。
- [ ] **Step 2：跑 FAIL** — `npx vitest run tests/unit/delegation.stateMachine.test.ts tests/unit/delegation.reopen.test.ts tests/unit/acceptance.test.ts`；预期：红。
- [ ] **Step 3：实现** — `Delegation` 类：状态字段＋转移守卫（`claimCompletion` 调 `validClaim` 不过 throw DomainError 且**不转态**；`accept` 调 `acceptance` 不过 throw；`reject` 置 rejected→内部 `reopened` reopenCount++）。`InMemoryDelegationRepo` save/findById/findActive(非归档非放弃含已收尾)/listArchived。
- [ ] **Step 4：跑 PASS** — 三测绿（含 skip 项显式标 S4）。
- [ ] **Step 5：commit** — `feat(S1a): Delegation 聚合状态机 + Repo（C5/C8/C11/C13 基线，产物条款跳过标 S4）`。

## Task 7：Turn + TurnToken（C1/C8/C10/C12）

**Files:** `turn/Turn.ts`、`turn/TurnToken.ts`、`repos/...turn`；Test `turn.admission.test.ts`、`turn.terminal.test.ts`、`turnToken.test.ts`、`turn.deniedGuard.test.ts`。
**Interfaces:** Produces `TurnToken{delegationId,turnId}`、`isExpired(token,inFlight):boolean`；`Turn.start/terminal(收口|中止|中断)`；`TurnRepo.findInFlight():Turn?`（≤1）。

- [ ] **Step 1：写失败测** — C1 并发两 `start`→≤1 成功、失败方输入转入队（`InputAcknowledged.归宿=入队`，非丢弃）；C8 恰一终态、重复终态幂等拒；C10 令牌复合值≠在飞⇒过期、过期写入丢弃＋过期计数+1、正常计数读数=0；C12 DecisionDenied 起至下一次 TriggerSource=用户输入 start 成功止，"系统恢复/队列准入"开轮计数=0。
- [ ] **Step 2：跑 FAIL** — 四测红。
- [ ] **Step 3：实现** — `Turn` 单飞守卫（`findInFlight` 非空且非本委托⇒入队分支）；`TurnToken.isExpired`＝复合值比对；写前复核钩子（`record` 前 `assert !isExpired` 否则丢弃＋`expiredWriteCount++`）；deniedGuard 读委托被拒标记。
- [ ] **Step 4：跑 PASS** — 四测绿。
- [ ] **Step 5：commit** — `feat(S1a): Turn 聚合 + TurnToken 写前复核/过期计数 + 拒绝待决守卫（C1/C8/C10/C12）`。

## Task 8：InstructionQueue（C3）

**Files:** `queue/InstructionQueue.ts`＋`repos/...instructionQueue`；Test `tests/unit/instructionQueue.test.ts`。
**Interfaces:** Produces `enqueue/pending(排已准入已撤回, FIFO)/admit(幂等 I-4)/markWithdrawn(机制口, S1 不接 DelegationAbandoned)`。

- [ ] **Step 1：写失败测** — 同 itemId 二次 admit=no-op；已撤回再 admit=拒；FIFO 保序；pending 不含已准入/已撤回。
- [ ] **Step 2–4：** 实现＋跑 `npx vitest run tests/unit/instructionQueue.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): InstructionQueue 聚合（I-4 幂等/FIFO，C3）`。

## Task 9：DecisionPoint（C2）

**Files:** `authorization/DecisionPoint.ts`＋`Scope.ts`(S1 仅 `initial():Scope` CC-05)/`highImpactList.ts`＋repos；Test `tests/unit/decisionPoint.test.ts`。
**Interfaces:** Produces `DecisionPoint.raise(需(delegationId,turnId) 归属)/resolve(Resolution 三值:批准/拒绝/选项)`；拒绝经 Resolution 值（非独立 deny，M-03）；`findOpenBy(delegationId,turnId)`。

- [ ] **Step 1：写失败测** — raise 缺归属对⇒拒；同 decisionPointId 重复 resolve＝首次生效（幂等）。
- [ ] **Step 2–4：** 实现＋`npx vitest run tests/unit/decisionPoint.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): DecisionPoint 归属唯一/决议幂等 + Scope v1 声明 + 高影响清单常量（C2）`。

## Task 10：EvidenceItem + Provenance + PayloadRef 脱敏（C4/D3）

**Files:** `evidence/EvidenceItem.ts`＋repos；Test `evidence.provenance.test.ts`、`payloadRef.desens.test.ts`。
**Interfaces:** Produces `Provenance` 恒等值类型（"系统采集"，不可表达 AI 自述）；`record/inspect`(记 FirstInspectionMark)；`PayloadRef{ptr,digest}` 构成约束：payload 含凭据形态串⇒落账前拒（S-4，与 `desens-scan` 同族）。

- [ ] **Step 1：写失败测** — 构造非法 Provenance 编译失败（`@ts-expect-error` 断言恒等值）；payloadRef 落账含凭据形态串⇒拒绝（≥3 例）。
- [ ] **Step 2：跑 FAIL**（含双 tsc）。
- [ ] **Step 3：实现** — `type Provenance='系统采集'`；`PayloadRef` 构造前脱敏判据（正则凭据形态→throw）；`inspect` 记首次打开标志。
- [ ] **Step 4：跑 PASS** — `npx vitest run tests/unit/evidence.provenance.test.ts tests/unit/payloadRef.desens.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): EvidenceItem + Provenance 恒系统采集 + PayloadRef 落账前脱敏（C4/D3）`。

## Task 11：requiresApproval Spec + AdmissionCheck（C6/D1）

**Files:** `spec/requiresApproval.ts`、`service/admissionCheck.ts`；Test `tests/unit/requiresApproval.test.ts`。
**Interfaces:** Produces `requiresApproval(op,scopeVersion,list):boolean`（S1 两类：资源访问/命令执行；作用域修正分支返 `false` 并注释「全外延→S2」，不 throw、不留 TODO）；`admissionCheck(op,…):boolean`＝requiresApproval 的入口前置闸。

- [ ] **Step 1：写失败测** — 清单命中/作用域外⇒true；未过闸⇒操作副作用计数=0（校验先于产出）。
- [ ] **Step 2–4：** 实现纯谓词＋`admissionCheck`；`npx vitest run tests/unit/requiresApproval.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): RequiresApprovalSpec + AdmissionCheck 前置闸（C6）`。

## Task 12：validClaim Spec（C4 声称有效性）

**Files:** `spec/validClaim.ts`；Test `tests/unit/evidence.claim.test.ts`（≥5）。
**Interfaces:** `validClaim(claim,evidenceRepo):boolean`＝evidenceRefs 非空 ∧ 全 Provenance=系统采集 ∧ 同 delegationId。

- [ ] **Step 1–4：** 写失败测（空/悬空/跨委托⇒false）→实现→`npx vitest run tests/unit/evidence.claim.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): ValidClaimSpec 非自述/同委托判定（C4）`。

## Task 13：acceptance Spec 基线（C13）

**Files:** `spec/acceptance.ts`（T6 已引用，此处补测）；Test 已在 `acceptance.test.ts`。
**Interfaces:** `acceptance(evidenceRepo,delegationId):boolean`＝S1 基线半边；产物两条款→S4（跳过用例）。

- [ ] **Step 1：写失败测** — 待核验∧系统采集∃可打开核验⇒true；否则拒。含 `it.skip` 指名 S4 产物条款。
- [ ] **Step 2–4：** 实现（只读 `findByDelegation`）→跑绿。
- [ ] **Step 5：commit** — `feat(S1a): AcceptanceSpec 基线判据（产物两条款延 S4 跳过登记，C13）`。

## Task 14：applyChange 服务 + 证据订阅（C15）

**Files:** `service/applyChange.ts`；Test `tests/unit/applyChange.test.ts`。
**Interfaces:** `applyChange(delegationId,turnId,change)`：admissionCheck 过→发 `ChangeProduced`→证据域订阅→`EvidenceRecorded`(type=变更集,Provenance=系统采集)；未过副作用=0；evidenceId 去重。

- [ ] **Step 1：写失败测** — 四步断言（过闸⇒两事件+采集；未过⇒副作用 0；重复投递⇒幂等）。
- [ ] **Step 2–4：** 实现＋订阅采集 wiring→跑绿。
- [ ] **Step 5：commit** — `feat(S1a): ApplyChange 服务 + ChangeProduced→证据订阅采集（C15）`。

## Task 15：deriveWaitingItems（C7）

**Files:** `projection/waitingItems.ts`；Test `tests/unit/waitingItems.test.ts`（≥6，四类各一＋双归属反例＋空集）。
**Interfaces:** `deriveWaitingItems(delegations,decisionPoints,turns,queue):WaitingItem[]` 四类闭集（待拍板>待核验>待用户指令>排队）；每实例属且仅属一类；无归宿计数=0。**收束态过滤不实现（→S5）**。

- [ ] **Step 1–4：** 写失败测→实现纯函数（无状态，不属子域）→`npx vitest run tests/unit/waitingItems.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): deriveWaitingItems 四类闭集共用纯函数（I-9 检测，C7；收束态过滤延 S5）`。

## Task 16：deriveFocus（F3）

**Files:** `projection/focus.ts`；Test `tests/unit/focus.test.ts`（≥4）。
**Interfaces:** `deriveFocus(items):WaitingItem|null` 前三类×创建序；排队不占焦；空则 null。

- [ ] **Step 1–4：** 写失败测→实现纯函数→`npx vitest run tests/unit/focus.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): deriveFocus 唯一投影入口（F3 领域面）`。

## Task 17：S-1/S-2 静态闸（D1/D2）

**Files:** `tests/static/s1WritePath.test.ts`、`tests/static/s2ProviderName.test.ts`；`eslint.config.js` 追加分块。
**Interfaces:** S-1：`src/renderer/**`＋`src/main`(度量) import 面禁含 6 聚合写命令＋写服务面；append 仅 `TimelineRepo.append`。S-2：`src/domain/**` provider 专名命中=0（清单源=`src/main/providers/**` 现存标识枚举）。

- [ ] **Step 1：写失败测** — S-1 fixture：临时呈现模块 import `Delegation` 写命令⇒命中>0（A5.2 可红）；S-2 fixture：注入一 provider 专名⇒判红。
- [ ] **Step 2–4：** 实现 grep/import 图断言测＋`eslint.config.js` `files:['src/renderer/**']` `no-restricted-imports`（真判据以 test 为准，CC-07）；跑 `npx vitest run tests/static/s1WritePath.test.ts tests/static/s2ProviderName.test.ts` 绿。
- [ ] **Step 5：commit** — `test(S1a): S-1 写路径闸 + S-2 provider 专名闸（flat eslint，fixture 可红，D1/D2）`。

## Task 18：假网关 L1 端到端领域闭环（E1 假轨）

**Files:** `tests/unit/e2eDomainLoop.test.ts`；`repos/memory` 注入假网关桩（`FakeGateway implements GatewayLike`，无真 Key）。
**Interfaces:** 跑 §9 happy path（create→start→applyChange→decision.resolve 批准→claimCompletion→accept）于内存态；断言各步事件序列＋终态；假网关只回确定产出。

- [ ] **Step 1：写失败测** — 端到端串：六事件按 seq 顺序落账、Delegation 终态=accepted、WaitingItems 收束为空、Focus=null。
- [ ] **Step 2：跑 FAIL**。
- [ ] **Step 3：实现 wiring** — 组装聚合＋Repo＋Spec＋服务＋FakeGateway（S1a 不接真网关，E2/真轨→S1b）。
- [ ] **Step 4：跑 PASS** — `npx vitest run tests/unit/e2eDomainLoop.test.ts` 绿。
- [ ] **Step 5：commit** — `feat(S1a): 假网关 L1 端到端领域闭环 happy path（E1 假轨，最小可信闭环）`。

---

## S1a 出口闸（域内，非全项目）

> **S1a 不跑全项目双 tsc／全量 vitest**——旧 app 与新树并存期，旧 `timeline`/`main`/`App` 会因 `timeline.ts` 重写与旧文件未删而部分红，属 ADR-028 负面①「非编译窗」；全项目闸与物理归档归 **S1 出口＝S1b 完成后**。S1a 只验**新领域树**：
1. `npx vitest run tests/unit/timeline.eventCatalog.test.ts tests/unit/timeline.payloadKeys.test.ts tests/unit/timeline.append.test.ts tests/unit/timeline.publishDiscipline.test.ts tests/unit/delegation.*.test.ts tests/unit/turn*.test.ts tests/unit/instructionQueue.test.ts tests/unit/decisionPoint.test.ts tests/unit/evidence.*.test.ts tests/unit/payloadRef.desens.test.ts tests/unit/requiresApproval.test.ts tests/unit/acceptance.test.ts tests/unit/applyChange.test.ts tests/unit/waitingItems.test.ts tests/unit/focus.test.ts tests/unit/e2eDomainLoop.test.ts`（新域单测全绿）。
2. `npx vitest run tests/static/noLegacyImport.test.ts tests/static/appendSingleWriter.test.ts tests/static/s1WritePath.test.ts tests/static/s2ProviderName.test.ts`（新域静态闸绿＋fixture 可红）。
3. `python3 tools/desens-scan.py`（rc=0）。
4. 新域类型面由 vitest(esbuild) 加载即验；全项目 `tsc -p tsconfig.json/tsconfig.main.json` 双 tsc → **S1 出口（S1b）**。
5. DoD **B/C/D＋E 假轨＋F3 域面**逐条绿（新测覆盖）；**A2/A3/A4/A5 物理归档＋A6＋G 类 → S1 出口（S1b）**。

**S1a 不含**（→S1b/S2–S7）：**归档 `git rm`（A2/A2.3/A2.4/A2.5）、入口 rewire（App/ipc/main/preload）、复用文件去旧域依赖（gateway/tools/verification 现 import conversationState/protocolTools、main.ts 现 import timelineLogger）**、真网关 port、E1 真轨 AbortController、IPC 通道桥、renderer 委托单中心、`npm run e2e`、产物谓词两条款(S4)、收束态过滤(S5)、StallDetector(S5)、持久化(S3)、作用域修正(S2)。
