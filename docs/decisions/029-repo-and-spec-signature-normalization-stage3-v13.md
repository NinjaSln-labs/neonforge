# 029 — S1 仓储面与谓词签名正名：命令归聚合、Spec 取本体（铁律②第四次回退：段3 v1.2→v1.3＋段5 v0.3→v0.4）

- Status: accepted（用户 2026-10-05 裁定 B＝回退上游段改工件重过闸，不在段6 就地打补丁）
- Date: 2026-10-05
- 相关：`docs/neonforgeV1.0.0/03-domain-tactics.md` §7 仓储面两行／§8 Specifications 与共用纯函数模块两行（**本件升 v1.3**）；`docs/design/v1.0.0-s1-detailed-design.md` §3 仓储面／§4 requiresApproval／§5 admissionCheck 与 deriveWaitingItems（**本件升 v0.4**）；`03-domain-tactics.md` §4 I-4/I-15（校验位置＝聚合，**零改动**）、§2 委托状态机与段2 §4（**零改动**）；`docs/design/stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md`（DoD 未写死这四形，**零改动**）；ADR-026 铁律②（禁跨段）、ADR-027（前两次段3 回退先例）、交接票 t000093（异构审计 finding N3）

## Context

段6 S1a 把四处签名实现成与上游工件不同的形，只在代码注释里登记（审计 N3 判「登记≠改工件」）。触发点是 S1b Task 1 建 `src/main/domainRuntime.ts` 时 S-1 闸当场红，顺带把这四形的出处查实：

1. `ScopeRepo`：段3 §7 写 `findByDelegation / appendVersion`。但「版本只追加、v 链不可变」是聚合内部不变量，段3 §4 自己定「校验位置＝聚合」；把 `appendVersion` 放仓储＝让仓储理解版本语义。S1 更无追加面（`ScopeAmended`→S2，CC-05）。
2. `InstructionQueueRepo`：段3 §7 写 `enqueue / pending / markAdmitted / markWithdrawn`——这四个正是 `InstructionQueue` 聚合的命令名（I-4 幂等／FIFO／撤回终态的判定全在聚合内）。按 §7 字面实现会造出「仓储方法名＝命令名」的贫血形，与 §4 冲突。
3. `RequiresApprovalSpec`：段3 §8 写 `(operation, scopeVersion, 高影响清单)`，而同节头注写「纯谓词，可独立测试」。判「作用域外」需要 entries 的 kind/pattern 匹配，**版本号零信息**；要么反查仓储（不再纯）、要么再传 Scope（双源）。字面照做与自家头注硬冲突。
4. `deriveWaitingItems`：段3 §8 把四类等待项的来源写成「DecisionPoint 未决集／Delegation 待核验态／**Turn 拒绝·中断·卡滞待指令态**／Queue pending」，而 §4 I-15 明写拒绝待决的判定输入＝「以 Delegation 只读查询取被拒标记」。两处对「拒绝待决」的归属不一致；实现侧据 §4（权威）把该标记落在 Delegation 机制态，于是 S1 无 Turn 侧消费点、`turns` 形参成空转。

实现面（`src/domain/repos/index.ts`、`spec/requiresApproval.ts`、`service/admissionCheck.ts`、`projection/waitingItems.ts`）已按上述读法落地并有测覆盖。用户裁 B＝回退段3/段5 改工件重过闸，**实现侧零语义改动**（仅注释由「偏离登记」改「正名引用」＋一轮审计扫出的零调用者死形删除，见 Decision 5/6）。

## Decision

1. **段3 §7 仓储面两行更正**：`ScopeRepo = save / findByDelegation`（追加语义移注「v 链只追加由 Scope 聚合内部保证」）；`InstructionQueueRepo = save / find`（原四形移注为聚合命令，`pending 排除已准入与已撤回＋FIFO` 标注为聚合内判据、I-4 读侧）。两行均注【v1.3】。
2. **段3 §8 RequiresApprovalSpec 更正为** `(operation, scope, 高影响清单)`，并注理由＝版本号无信息、与「纯谓词可独立测试」冲突。`AdmissionCheck` 同形随动（§8 只述「＝RequiresApprovalSpec 判定」，无需改文）。
3. **段3 §8 `deriveWaitingItems` 四类来源逐类标注**：待拍板←DecisionPoint 未决集；待核验←Delegation 待核验态；待用户指令←**Delegation 拒绝待决机制态（权威源＝§4 I-15「以 Delegation 只读查询取被拒标记」）**＋Turn 卡滞待指令态（**S5 StallDetected 落地起**）；排队中←Queue pending。即 §8 与 §4 对「拒绝待决」的归属统一，`turns` 入参在 S5 回补。
4. **段5 详设 v0.4 随动**：§3 两块仓储面、§4 `requiresApproval(op, scope, list)`、§5 `admissionCheck(op, scope, list)` 与 `deriveWaitingItems(delegations, decisionPoints, queue)`（注 S5 加 `turns`）。§6 事件注册表与 payload 键集**一字不动**——`DelegationCreated` 的 `scopeVersion` 是**事件载荷键**（段3 §5 闭集），与 Spec 形参同名不同物，不在本件射程。
5. **实现侧零语义改动**、不新立不变量编号、不扩事件闭集（22 不变）、不动段0/段1/段2/段4。闸＝段3/段5 各自「AI 自查＋独立审计」（异构执行者只审增量面、须真跑 grep 与闸命令），闸结果经 handoff CLI 落账。代码面仅两类非语义改动：四处注释由「偏离登记」改「正名引用」，＋Decision 6 的死形删除。
6. **同批第五处（独立审计 N2 扫出的同型残留，随本件一并正名）**：`EvidenceRepo` 原列 `markFirstInspection(id)`，而首开标记的判据在 `EvidenceItem.inspect()`（§2 关键命令、过程指标②「首次计入／重复不计」）——仓储实现只是 `items.get(id)?.inspect()` 的转发、且**全仓零调用者**。处置＝从段3 §7／详设 §3 与实现面（`repos/index.ts`＋`InMemoryEvidenceRepo`）一并删除该形，不新立替代 API（需要时由调用方持聚合调 `inspect()`＋`save`）。收干净后本件射程内的仓储面**唯一保留的命令形＝`TimelineRepo.append`**（机制口，S-1 例外，段3 §7 与详设 §3 均显式登记）。

## Consequences

- 正面：段3 内部一处真实自相矛盾（§8「拒绝待决记在 Turn 侧」vs §4「取 Delegation 只读查询」）被消除；§8 的「纯谓词」头注不再被自家签名打掉；段6 实现与工件一致，DoD G4「S1 内语义裁定→出 ADR」兑付；追溯矩阵不再对不上号。
- 负面/代价：①两份冻结工件各升一版，下段（段7 验收）只认工件者须读 v1.3/v0.4 的差异行；②`turns` 形参的 S5 回补成了登记在案的未来改动点（S5 建卡滞待指令时须同时改 §8/详设 §5 与实现，三处同一刀）；③段3/段5 增量审计各需一轮异构执行者（本会话已按 agent-dispatch 派单，报告落 `docs/audits/`）。
- 后续：①`docs/tests/coverage-matrix.md` 表 N 的段3／详设版本指针 v1.2→v1.3、v0.3→v0.4；②代码注释里「详设 §3/§4/§5」引用不带版本号，故不需逐处改（版本由工件头与索引承载）；③t000093 以「两工件升版＋增量审计 PASS」为关闭判据；④S5 开工前须核 `turns` 回补行仍在（登记于 §8/§5 与本件）。
