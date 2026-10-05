# 段3 v1.3／段5 v0.4 采纳批的第二轮复审（修入面）

- 审计者：`mcode@minimax/MiniMax-M3.1-Flash-Preview`（固定档，异构渠道；与一轮审计者 `pi@SN 6.8 Flash Lite` 不同执行者＝避同一盲区）
- 当前主：`qodercn`（模型未披露⇒本会话不审亲笔，两轮均由外部执行者覆核）
- 派单形：`mcode exec --cwd "$PWD" --permission full --prompt-mode coding --output-format json --timeout 9m --max-steps 80`（跑了 118s、`status: succeeded`；一轮 191s 的上游超时未复现）
- 射程＝**只审「一轮结论被采纳修入」这件事本身**（commit 96e06c5 的六个改动面），不重审一轮已覆盖的签名正名射程
- 结论＝**修入可采纳·无阻断项**；四问全部现场取证（scoped vitest 28 文件 165 绿｜3 skip、eslint rc=0、desens rc=0、`git status` 净、scoped tsc rc=0）
- 主会话采纳（署名，2026-10-05）：四条非阻断逐条复现后处置＝
  - **N1 修入**：`repos/memory/instructionQueueRepo.ts:5` 注释仍写 `enqueue`——我 `grep -n "^  \(submitInput\|admit\|pending\|markWithdrawn\)" src/domain/queue/InstructionQueue.ts` 核到聚合实际命令是 `submitInput(77)/admit(107)/markWithdrawn(119)/pending(73)`，`enqueue` 为唯一残留旧名⇒注释改正并注 ADR-029 D2 出处
  - **N3 修入**：段3 状态头与详设版本头仍留「实现侧代码零改动」，与已更正的 ADR-029 D5「零语义改动」不同步（D5 正是被这句话打脸才改的，同类措辞留原样下次还会撞）⇒两处补成「实现侧零语义改动（注释改正＋零调用者死形删除，皆非语义）」
  - **N2 修入（记账面）**：全量 `tsc -p tsconfig.json` rc=2、5 条错全在 `src/renderer/ConversationPanel.tsx:94-97/:95` ↔ `domain/timeline` 缺导出——我复跑核实为真，且本批零 renderer 命中＝既存非编译窗（ADR-028 负面①），**已在 handoff exit 补记该面**（此前 exit 只记了 `src/main/timelineLogger.ts:12` 一处，少记 renderer 侧＝下段开工易误判为新引入）
  - **N4 不动**：审计者自判「后续②」与 D5 对象不同、无冲突，仅登记

---

## 结论（一行）：修入可采纳

## 阻断项（必须修）

**无。** 四个闸全绿、三行回补与实现逐字对齐、删形零残留、ADR-029 D5/D6 互不打脸。

---

## 非阻断建议（≤6 条，同格式）

### N1 `InMemoryInstructionQueueRepo` 头注释仍用旧命令名 `enqueue`
- 位置：`apps/desktop/src/domain/repos/memory/instructionQueueRepo.ts:5`
- 证据：
  ```
  $ cat apps/desktop/src/domain/repos/memory/instructionQueueRepo.ts
  // 命令与读侧（enqueue/pending/admit/markWithdrawn）在 InstructionQueue 聚合面
  ```
  实现里实际命令名是 `submitInput`（`src/domain/queue/InstructionQueue.ts:77 export submitInput(input: SubmitInput)`），且无 `pending/admit/markWithdrawn` 同名方法（`admit` 在 126 行以行内形态出现）。ADR-029 D2 正名后此处是本仓唯一还写 `enqueue` 的现行代码注释。
- 影响：不违反任何契约（ADR-029 Consequences「后续② 代码注释不带版本号、不需逐处改」明确豁免注释面），但属正名后残留指针漂移，会误导后续读者以为聚合命令叫 `enqueue`。
- 建议：把注释里 `enqueue` 改 `submitInput`，`admit` 加 `（I-4 幂等）` 注明。一行注释，不动语义。

### N2 全量 tsc（`tsconfig.json`）红，但与本批无关
- 位置：`apps/desktop/src/renderer/ConversationPanel.tsx:94-97`、`useConversationState.ts:25`
- 证据：
  ```
  $ npx tsc --noEmit -p tsconfig.json
  src/renderer/ConversationPanel.tsx(94,3): error TS2305: Module '"../domain/timeline"' has no exported member 'validateTimelineEvent'.
  … 另 4 处同型
  $ git show --stat 96e06c5 --name-only | grep -c renderer
  0
  ```
  本批 7 个文件零 renderer 命中；scoped tsc（`find src/domain -name '*.ts'` 全量）rc=0。
- 影响：commit message 里「scoped tsc rc=0」措辞准确（限定了 scoped），不算虚报；但全量 tsc 红的既存事实应在 handoff 里留一笔，否则下段开工会误判为新引入。
- 建议：handoff 遗留账记一条「renderer↔domain/timeline 导出不匹配，存于 96e06c5 之前，本批未触」。

### N3 段3 状态头「实现侧代码零改动（实现即正解，见 commit eff5327 与 ADR-029）」与 D5 措辞不同步
- 位置：`docs/neonforgeV1.0.0/03-domain-tactics.md:3`（状态头 v1.3 段）
- 证据：
  ```
  $ grep -n "实现侧代码零改动" docs/neonforgeV1.0.0/03-domain-tactics.md docs/design/v1.0.0-s1-detailed-design.md docs/decisions/029-*.md
  03-domain-tactics.md:3: …；实现侧代码零改动（实现即正解，见 commit eff5327 与 ADR-029）。
  v1.0.0-s1-detailed-design.md:3: …、§2/§8/§9 不动、实现侧代码零改动。
  ```
  ADR-029 D5 已改为「实现侧零语义改动…代码面仅两类非语义改动：四处注释…＋Decision 6 的死形删除」；两份状态头的「代码零改动」没跟改。
- 影响：不构成契约偏离——D5 已用「零语义」自我限定，状态头那句的射程是「签名正名批次未动实现语义」。但 D5 本就是因这句话被打脸才改的，同类措辞在状态头留原样，下次审计还会再撞一次。
- 建议：两份状态头的「实现侧代码零改动」补成「实现侧零语义改动（注释改正＋零调用者死形删除，非语义）」。

### N4 ADR-029 Consequences「后续②代码注释不需逐处改」与本批实际改了注释的边界需要一句界清
- 位置：`docs/decisions/029-repo-and-spec-signature-normalization-stage3-v13.md` Consequences「后续」第②条
- 证据：D5 行自述「代码面仅两类非语义改动：**四处注释**由「偏离登记」改「正名引用」，＋Decision 6 的死形删除」；而「后续②」原文「代码注释里「详设 §3/§4/§5」引用不带版本号，故不需逐处改」。
- 影响：判为**不冲突**——D5 的四处注释是 `6535968`（正名批）里随签名同批改正的，`96e06c5` 只删了一处方法、无注释改动；「后续②」说的是版本号指针注释这一类。二者对象不同。但两句相邻易被误读为自打脸。
- 建议：不动。登记为已判无冲突即可。

---

## 查过且没问题的地方（一行一条，附命令）

1. **删形零残留**：`grep -rn "markFirstInspection" docs apps/desktop/src apps/desktop/tests` → 命中仅 4 处现行工件带"已删除"注记（`029-…md:25` D6 决策正文、段3 `:158` 改后行、详设 `:68` 尾注）＋ 5 处历史审计报告正文（`stage3-v1.3-…audit:9/49/51/52`、`stage3-domain-tactics-audit3:66`、`audit5:72`）。**零现行代码、零现行接口、零现行测试命中。**
2. **`EvidenceItem.inspect()` 未被连坐**：`grep -rn "inspect(" apps/desktop/src apps/desktop/tests` → `EvidenceItem.ts:85 inspect(): boolean`（判据本体完好，含 `private inspectionCount` 计数）＋ `tests/unit/evidence.provenance.test.ts:26,27` 两次断言（首开 true / 重复 false）。删的是仓储转发，判据与覆盖都在。
3. **详设 §2/§3 无别处旧形**：`grep -n "markFirstInspection" docs/design/v1.0.0-s1-detailed-design.md` → 唯一命中 `:68`，且是"原 markFirstInspection…删除"的说明性尾注，非接口声明。
4. **118 行回补 ↔ 实现**：`InstructionQueue.ts:77 submitInput(input: SubmitInput)`；plan 118 行现写「聚合命令 `submitInput/pending/admit/markWithdrawn` ＋仓储面 `InstructionQueueRepo{save, find}`」——正形。
5. **147 行回补 ↔ 实现**：`requiresApproval.ts:17-20 (op: Operation, scope: Scope, list: readonly HighImpactOperation[])`、`admissionCheck.ts:7-10 (op, scope, list)`——plan 147 行 `requiresApproval(op,scope,list)` / `admissionCheck(op,scope,list)` 两形全对；旧 `scopeVersion` 已清零。
6. **182 行回补 ↔ 实现**：`waitingItems.ts:39-42 (delegations, decisionPoints, queue)`，**三入参无 `turns`**——plan 182 行三入参与"S5 回补"注记一致。
7. **三处仓储面同形**：`03-domain-tactics.md:157 InstructionQueueRepo | save / find`、`v1.0.0-s1-detailed-design.md:67 interface InstructionQueueRepo { save(q); find() }`、plan 118 行 `InstructionQueueRepo{save, find}`——三处同形，无指针漂移。
8. **plan 出口闸文件清单无矛盾**：plan 全批只动 118/147/182 三行 Interfaces，§出口闸 Task 清单与 `tests/unit/instructionQueue.test.ts` / `requiresApproval.test.ts` / `waitingItems.test.ts` 三个 Test 声明未被牵动（diff 中除三行外该文件 0 改动）。
9. **ADR-029 D5 ↔ D6 不打脸**：D5 限定语是「实现侧**零语义**改动」＋自列「两类非语义改动」含「Decision 6 的死形删除」。删除对象是全仓零调用者的转发形（已由 grep 独立证实），按 D6 自述"不新立替代 API、调用方持聚合调 `inspect()`＋`save`"——删后无任何行为可达性变化，**不构成语义改动**。判定：D6 与 D5 相容。
10. **闸①scoped vitest**：`npx vitest run tests/static/ …28 文件…` → `Test Files 28 passed (28)` / `Tests 165 passed | 3 skipped (168)`，**rc=0**。
11. **闸②eslint**：`npx eslint src/domain tests/static` → 无输出，**rc=0**。
12. **闸③desens**：`python3 tools/desens-scan.py`（仓库根）→ 无告警输出，**rc=0**。
13. **闸④工作树净**：`git status --short` → 空输出，**rc=0**。
14. **闸⑤scoped tsc**：`npx tsc --noEmit --strict … $(find src/domain -name '*.ts')`（33 文件）→ 无诊断，**rc=0**。
15. **本批 7 文件 diff 面核对**：`git show --stat 96e06c5` → 代码面仅 `repos/index.ts -1`、`memory/evidenceRepo.ts -4`（方法声明 + 转发体，各一处删除，无残留空行以外的副作用），其余 5 文件全为文档行。

---

## 跑不了的命令与原因

- **无。** 任务清单中的五条命令（scoped vitest / eslint / desens-scan / git status）与我追加的 scoped tsc **全部现场跑通并记录了退出码与关键行**。唯一未跑的是 commit message 提及的"scoped tsc"原样形式（无仓库内固定脚本，我以等价的 `find src/domain -name '*.ts'` 全量编译替代，结果 rc=0）。
- 未执行任何 git 写操作，未编辑/新建任何文件，本报告仅打到标准输出。