# 段3 v1.3／段5 v0.4 增量面独立审计（签名正名批）

- 审计者：`pi@SN 6.8 Flash Lite`（固定档；异构渠道，非当前主）；当前主＝`qodercn`（模型未披露⇒本会话不审亲笔）
- 派单形：`pi -p --no-session --mode text --model "SN 6.8 Flash Lite" --tools read,bash --thinking high`——工具面白名单＝**能跑 grep 与闸命令、拿不到 edit/write**（报告类派单口径，见 handoff commands 槽）
- 第一派失败记录：`mcode@MiniMax-M3.1-Flash-Preview` 于 191s 撞上游超时（`status: failed`、`error.retryable: true`、无报告产出）⇒换执行者重派，非「同一任务重派超 2 次」
- 射程＝仅增量面（v1.2→v1.3 四处 ＋ v0.3→v0.4 四处 ＋ ADR-029 ＋ 指针同步面），HEAD＝`6535968`
- 主会话采纳（署名，2026-10-05）：结论「**可采纳·无阻断项**」接受。三条非阻断全部复现后处置＝
  - **N1 修入**：S1a 计划 147／118／182 三行 Interfaces 仍为旧签名——我 `sed -n '118p;147p;182p'` 原文核对为真，三行已改正形并注 ADR-029 出处。
  - **N2 修入并升为第五处正名**：`EvidenceRepo.markFirstInspection` 同型残留——我核到 `src/domain/repos/index.ts:24`＋`memory/evidenceRepo.ts:25`（实现只是 `items.get(id)?.inspect()` 的转发）且**全仓零调用者**（`grep -rn markFirstInspection docs apps/desktop/src apps/desktop/tests` 仅两处 src＋两行工件）。处置＝段3 §7／详设 §3／接口／实现四处一并删除，ADR-029 增 Decision 6 承载；删除后本射程内仓储面唯一保留的命令形＝`TimelineRepo.append`（机制口，S-1 例外）。
  - **N3 无需动作**：S1b 计划只写 `getRuntime()`，不受四形影响（审计者自述该项仅为「已核对无残留」登记）。
- 闸与复算：审计者现场跑＝scoped vitest 28 文件 165 绿｜3 skip（rc=0）、`eslint src/domain tests/static` rc=0、`desens-scan` rc=0、`git status` 净、G-1 闸未被打掉（`tests/static/` 4 文件 13 绿）；主会话在删除 `markFirstInspection` 后**另起一轮**复跑同四项，仍 28 文件 165 绿｜3 skip、scoped tsc rc=0。

---



## 结论（一行）：可采纳

四处正名自洽、无残留冲突，实现零改动且全绿；仅有非阻断文档债（S1a 计划 3 处 Task 签名字面仍为旧形）。

---

## 阻断项（必须修才算 v1.3／v0.4 过闸）

**无。**

---

## 非阻断建议（≤6 条，同格式）

### N1 S1a 实现计划 3 处 Task 的 Interfaces 行仍是旧签名（计划未回补）
- 位置：`docs/superpowers/plans/2026-10-05-s1a-domain-core-archive.md:147`、`:118`、`:182`
- 证据：
  ```
  $ grep -n "requiresApproval\|deriveWaitingItems\|enqueue" docs/superpowers/plans/2026-10-05-s1a-domain-core-archive.md
  147:**Interfaces:** Produces `requiresApproval(op,scopeVersion,list):boolean`…
  118:**Interfaces:** Produces `enqueue/pending(排已准入已撤回, FIFO)/admit(幂等 I-4)/markWithdrawn(机制口, S1 不接 DelegationAbandoned)`。
  182:**Interfaces:** `deriveWaitingItems(delegations,decisionPoints,turns,queue):WaitingItem[]` 四类闭集…
  $ git diff HEAD~1 --name-status -- docs/superpowers/plans/2026-10-05-s1a-domain-core-archive.md
  → 本批仅改第 3 行版本指针（v0.3→v0.4 / v1.2→v1.3），Task 行未动
  ```
- 影响：不违反任何现行契约（权威源＝段3 v1.3／详设 v0.4，二者已正确；该 plan 顶部已声明「接口…v0.4（签名以此为准）」）。风险是 S1a 任务尚全未勾选（`grep -c '^- \[ \]'`=65、`^- \[x\]'`=0），后续 executing-plans 按 147 行的 `scopeVersion` 重建会造出与已冻结工件相反的实现。
- 建议：下一小修补（段6 入口）把这三行改成正形，与 plan 顶部「签名以详设为准」一致；无需回退段5。

### N2 `EvidenceRepo` 仍挂聚合命令名（同型问题，本次射程未覆盖）
- 位置：`docs/design/v1.0.0-s1-detailed-design.md:68`、`apps/desktop/src/domain/repos/index.ts:24`
- 证据：
  ```
  interface EvidenceRepo { save; findByIds(ids); findByDelegation(id); markFirstInspection(id) }
  ```
- 影响：`markFirstInspection` 是 EvidenceItem 聚合的 `inspect` 命令（段3 §2：`record`/`inspect`，`inspect` 记 FirstInspectionMark）。与「命令归聚合」同一型；段3 §7 该行写「写入 `save`、读取…」未点名，故 v1.3 正名不触它。另 `InstructionQueueRepo.save` 的聚合命令面含 `submitInput`（`apps/desktop/src/domain/queue/InstructionQueue.ts:103` 附近），v0.4 尾注仅以尾注口径登记，未逐名列举。
- 建议：如要一次收干净，段3 §7／段5 §3 增补一句「仓储面禁列聚合命令名（唯一例外＝`TimelineRepo.append` 机制口，S-1）」，并顺带核 `markFirstInspection` 归属；不改签名、不阻断本次过闸。

### N3 S1b 计划未随版本指针同步
- 位置：`docs/superpowers/plans/2026-10-05-s1b-gateway-ipc-presentation.md:3`
- 证据：本批已把该行改为「＋接口 …详设 v0.4（§7 IPC/renderer、§8 机制落点、§9 时序）＋段3 v1.3」，其 Interfaces 面只写 `getRuntime()`，未受四形影响，故无需改。此项仅登记「已核对无残留」，无需动作。

---

## 查过且没问题的地方（一行一条，附命令）

**问1 残留冲突**
- `appendVersion` 全域零命中（除状态头的 `appendVersion`→`save` 变更记自身）：`grep -rn "appendVersion" docs/neonforgeV1.0.0 docs/design docs/tests docs/superpowers apps/desktop/src apps/desktop/tests` → 仅 `03-domain-tactics.md:3`
- `scopeVersion` 仅存于**事件载荷键**（合法、不在射程）：`grep -rn "scopeVersion" …` → 段3 §5 闭集行 `125:| DelegationCreated | delegationId, intent, scopeVersion(=1) |…`、`timeline.ts:82`、`Delegation.ts:51`、段3 状态头；**Spec 形参面已零命中** → 未把前者误判为残留
- `markAdmitted` 全域零命中：同上 grep
- `markWithdrawn` 仅存于**聚合命令**登记（§2 关键命令表、详设 §2 聚合命令、指令队列聚合 M-03 尾注），仓储面无：段3 `:33`、`:152`；详设 `:56`；`apps/desktop/src/domain/queue/InstructionQueue.ts:5,119`
- 段3 §4 头注「纯谓词，可独立测试」：`03-domain-tactics.md:163`；I-4/I-15/I-17 原文 `:79`/`:90`/`:92`（I-17 本批未动）
- 段3 §7 四形面：`apps/desktop/src/domain/repos/index.ts:43-53`；实现聚合命令 `InstructionQueue.ts:50 admit()`/`:55 withdraw()`/`:73 pending()`，投影只调聚合读侧 `queue.pending()`（`waitingItems.ts` 内，无 `admitted/withdrawn` 过滤）
- 段3 §8：`RequiresApprovalSpec(operation, **scope**, 高影响清单)` = `:164`；`deriveWaitingItems` 四类逐类标注 = `:174`
- 段3 §1 裁定4「等待项＝派生读模型」= `:18`；§2 委托状态机、段2 词表零改动（`git diff HEAD~1` 段2 无 hunk）

**问2 自洽与逐字对齐**
- ScopeRepo 两边：段3 `:141` `{ save(scope); findByDelegation(delegationId): Scope? }`｜详设 `:64` `{ save(s); findByDelegation(id): Scope? }`｜实现 `index.ts:45-47` 同名同返回形
- InstructionQueueRepo 两边：段3 `:143` `{ save(queue); find(): InstructionQueue? }`｜详设 `:67` `{ save(q); find(): InstructionQueue? }`｜实现 `index.ts:52-54`
- Spec 形参两边：段3 `:164` `(operation, **scope**, 高影响清单)`｜详设 `:77` `requiresApproval(op, scope, highImpactList): boolean`｜实现 `requiresApproval.ts:17-21`；`AdmissionCheck` 同形：详设 `:84` `admissionCheck(op, scope, list)`｜实现 `admissionCheck.ts:7-12` = `!requiresApproval(op, scope, list)`
- 服务→仓储方向（无「校验位置＝仓储」）：`grep -rn "admit(\|enqueue(\|appendVersion\|markAdmitted\|markWithdrawn" …/repos/index.ts` → 零命中
- 拒绝待决源两边：段3 I-15 `:90`「Turn 聚合（以 Delegation 只读查询取被拒标记）」｜段3 `:174`「待用户指令←**Delegation 拒绝待决机制态**（权威源＝§4 I-15…）＋Turn 卡滞待指令态（S5…故 `turns` 形参于 S5 回补）」｜详设 `:85`「S1 无 turns 形参——拒绝待决的权威源＝Delegation…」｜实现 `Turn.ts:21` `deniedPending` 注释「I-15 读侧＝Delegation.awaitingUser」、`Delegation.ts:132-141`、`waitingItems.ts` 三形参
- 「命令归聚合」实现面唯一例外已显式登记：`index.ts:9-10`（append＝唯一机制口）、段3 `:116`、详设 `:132`

**问3 连带影响**
- scoped vitest：**28 files passed / 165 passed | 3 skipped（168），EXIT=0**
- `npx eslint src/domain tests/static`：**EXIT=0**，零告警
- `python3 tools/desens-scan.py`：**EXIT=0**，零输出
- `git status --short`：**空（干净）**
- `git show --stat HEAD`：10 文件；src 侧仅 `waitingItems.ts`(5)＋`repos/index.ts`(7)，`git diff HEAD~1 -- 'apps/desktop/src/**'` 全部为 `//` 注释行改动（「偏离登记」→「正名引用」），零语义改动
- **G-1 静态闸未被打掉**：stage-spec 改动只在第 3 行来源指针（`段3 frozen v1.2→v1.3`，并增列 ADR-029）；解析锚在 DoD `A2`/`A2.2`/`A2.5` 行（`:16` 等），`:25` `A5` 未动。实测 `npx vitest run tests/static/` → **4 files passed / 13 passed，EXIT=0**（含「名单从 stage-spec 现场解析成功」「新领域树零 import 归档面」「可红自证」三条）
- 指针同步面四件均指新形：stage-spec `:3`、coverage-matrix `:195`/`:201`、S1a plan `:3`、S1b plan `:3`

**跑不了的命令与原因**：无——派单所列四条命令与 G-1 全跑通。未跑的仅「全量 L1／双 tsc／playwright／e2e」（不在派单射程，且 ADR-029 commit 消息已记录段6 面 scoped 复跑结果）；本报告不对未跑的项填任何数字。
