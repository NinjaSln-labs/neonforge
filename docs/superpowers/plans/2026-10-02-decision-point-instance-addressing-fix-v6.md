# β（决策点答复归属）修法完整方案 · v6（决策点实例寻址·双概念·九轴+终审）

> ⚠️ **已被 v7 取代（`2026-10-02-decision-point-instance-addressing-fix-v7.md`）——勿据本 v6 改码。** 第十轴 `docs/audits/independent-audit-v6-dual-concept-2026-10-02.md` 判双概念方向成立但有 X1–X6 落地规格缺陷（含本 v6 门规则破 `:748`、approval 无载体、恢复跳号、签名矛盾、双守卫、不变量措辞散落）。v7 原生内建 X1–X6。本文留历史链。

> **For agentic workers:** 逐 Task 实现，Task 间 review 闸。**取代 v1/v2/v3/v4/v5（留历史链，勿据其改码）。** 权威＝ADR-014（保留 C2/回声退通道/控件守卫）＋ **ADR-015 v2（决策点实例寻址·双概念——终审回炉后重推）**；落稿依据＝`domain-model-amendment-decision-point-instance-2026-10-02.md`。
> **本 v6 仍属"修批规划·待再终审"（第九/十轴 + 基线重取）；ADR-015 v2 未再终审通过前，不得改两份原稿正文、不得改产品码（ADR-012）。**

**Goal**：答复只作用于它被写就的**决策点实例**（`instanceId` 匹配），代次不符即 no-op；产品按钮回声整体移出用户输入通道。C2（改变意图新文本→方向拒）保留。

---

## 0. 一页结论（双概念，取代 v5 的单 epoch）

**根因（终审）**：v5 让一个 `decisionEpoch` 同时承担"协商延续"(rejectStreak) 与"答复归属"(实例身份) 两件正交的事 ⇒ 规则互斥、关不上第九轴命门。

**修法＝拆两轴**：
- **决策点槽**（`pending: kind`）→ 承载 `rejectStreak`（§4.1/ADR-001 语义**不变**）。
- **决策点实例**（`decisionInstanceSeq`，`decisionContent.instanceId/signature`）→ 承载答复寻址。**实例只在 `setPending` 按「换 kind 或结构化签名变化」推进**；逐字/结构等价重提议＝同实例。
- **一条身份校验 `isAnswerToCurrent`**（`answers.instanceId===s.decisionInstanceSeq && answers.kind===s.pending && pending!=='none'`）合 v5 刀二刀三于一体：`userDecided`/`approvalDecided` 前置，不符→no-op。
- **`userDecided`/`clearPending`/`approvalDecided` 不再各叠 epoch**（废 v5 F-B；清 pending 后 kind 检查自然拒一切在途答复）。

三刀（v5→v6 重述）：
| 刀 | v6 内容 |
|---|---|
| **刀一·回声退用户通道** | `opts.echo`（8 站点）旁路 C2/`message_sent`/`noteUserTextReply`；队列载荷带 echo/answer（否则 busy 回声经 `:2447→:2420` 复活＝活口，F-E） |
| **刀二·实例身份门**（承 ADR-015 v2，**文本路 + 按钮路统一**） | 文本入队冻结 `answer={instanceId,kind}`；**按钮 render 时从 `decisionContent.instanceId` prop 冻结**（修 F4 UI 偷换）；消费校验 `isAnswerToCurrent`，不符→`conversation.stale_input_discarded` |
| **刀三** | 并入刀二（kind+instanceId 校验已覆盖"点旧卡"跨 kind 与同 kind 偷换）——不再单列 |

**命门闭合**：同 kind 续提议 A→B 实质变 ⇒ `setPending` 判 sig 变 ⇒ **新 instanceId** ⇒ 队列旧"行"失配 ⇒ no-op，**确认不了 B**（v5 因"永不递增"在此失效）。

**不动 / 不做**：flush 触发点 `:2614`；单槽宽度（`p000143`）；`detectUnproductiveDialogue` 阈值；C2 语义；protocolTools 的 pending **执行**冻结（提议非动作，`intent-design §2:40`）；新增拒绝词表；allow 领域化（t000073 另批，其窗由身份门顺带覆盖）；`toolCallId` 精确配对（V2）；L5（Mac）。

---

## 1. 领域修订（ADR-015 v2）＝修批第一环

先落两份原稿正文（防双源）：`intent-design` §2/§3.1/§3.4/§3.5/§4/§4.1 + `00-domain-authority §3.2` + `04 §1.2` 注记，据修订草案 diff。含 sessionStore 序列化（修 F3）。

## 2. 实现现状锚点（v6 补：持久化 + 按钮站点）

- 承 v5 §2（`send:2425` / `sendRef:458` / 队列 `:758/:2416-2420/:2447/:809` / C2 块 `:2454-2482` / 回声 8 站点 / `userDecided:149/:171/:177/:218` / `approvalDecided:262/:270` / `approvalGranted:320/:323` / `clearPending useConversationState.ts:86` / `ConversationState:111-126`/`DecisionContent:103-108` 无 epoch / `:733-757` 测试 / `timeline :20-92/:96-110/:116`）。
- **新**：按钮 confirm/reject 站点 `:2997/3010/3066/3085/3128/3144/3431/3457/3479`（须 render 冻结 `decisionContent.instanceId`）；`sessionStore.ts:11-18` StoredMsg（加 `decisionInstanceSeq`+`decisionContent.instanceId/signature`）；恢复链 `ConversationPanel.tsx:332-358`（`setPending` 复位须续号、补 `:349-352` 丢 `dc.approval`）；兼容壳 `conversationState.ts:286/293 userConfirmed/userRejected`（加 `answers` 形参）。

## 3. 决策表（浓缩；⚑＝已裁，○＝待再终审）

| 编号 | 决策 |
|---|---|
| D1⚑ | 保留 C2；不取代 ADR-001/006 |
| **D2⚑** | **双概念**：槽(kind/rejectStreak) ⊥ 实例(instanceId)；`decisionInstanceSeq`+`decisionContent{instanceId,signature}` |
| **D3⚑** | 实例**只在 `setPending` 推进**：换 kind 或**结构化签名变** ⇒ seq+1；结构等价重提议 ⇒ 同实例。userDecided/approvalDecided/clearPending **不叠** epoch |
| D4⚑ | `isAnswerToCurrent`＝文本路+按钮路统一身份门；`userDecided`/`approvalDecided` 前置，不符→no-op + `stale_input_discarded` |
| D5⚑ | **按钮 instanceId render 时从 `decisionContent` prop 冻结**（修 F4 UI 偷换）；文本入队冻结 |
| D6⚑ | 队列载荷 `{text,echo?,answer?}` + flush `:2420` 恢复（F-E 前提） |
| D7⚑ | 删 `:809` 第二写入口（d000008）+ 同批改 `sendRef:458` |
| D8⚑ | ③ evidence 引导迟到作废 + **退还 `evidenceGuideCountRef`**（`:802`） |
| D9⚑ | `stale_input_discarded`：`TimelineEventType` 成员 + SPEC 双写，不扩 domain 枚举（F-D） |
| D10⚑ | `opts.echo` 弃串表；`isQuestionLike` 问句不判方向拒→纳入 |
| D11⚑ | 不新增拒绝词表；§3-D1 回声保留气泡+role user退计数；clearPending 领域化；core:161 并入待基线复核 |
| **§6-D1⚑** | **结构化签名粒度（已裁）**：签名＝statement/files[].path集/verificationPlan/evidence-command/diff-path/approval-toolName+subject，**排除 assumptions 及一切措辞**；仅动作对象实质变 ⇒ 新实例 |
| **§6-D2⚑** | **产品语义（已裁）＝作废 + 可见重确认**：实质重提议 ⇒ 在途旧答复 no-op + 用户可见重提示（状态栏"方案已更新，请重新确认" + `stale_input_discarded`），**不静默吞、不回喂模型** |

## 4. 契约变更（= ADR-015 v2 落地）

| 载体 | 变更 | 锚点 |
|---|---|---|
| `ConversationState.decisionInstanceSeq:number`(0) + `DecisionContent.instanceId/signature` | 新增 | `conversationState.ts:111-126`/`:103-108`/`:128-141` |
| `setPending:303` | **推进唯一处**：`kind变\|\|sig变 → seq+1`；否则同实例 | — |
| `userDecided:149` | 前置 `isAnswerToCurrent` no-op 门；confirm/reject 逻辑+rejectStreak `:177/:218` 不变；**不叠 epoch** | — |
| `approvalDecided:262`/`approvalGranted:320`/`clearPending` | 身份门（携 answers.instanceId）；**不叠 epoch**；clearPending 新领域函数清 `pending+decisionContent+lastRejectReason` | F-B 废除 |
| `DecisionAnswer`/`isAnswerToCurrent`/`structuralSignature` | 新导出纯函数 | — |
| `renderSendOpts` | `send` opts `echo?/answer?`；`sendRef:458` | D6/D7 |
| 兼容壳 `userConfirmed/userRejected:286/293` | 加 `answers:{instanceId,kind}` 形参 | F4 |
| `TimelineEventType`+`TIMELINE_EVENT_SPECS` | `conversation.stale_input_discarded` 双写 | D9 |
| `sessionStore.ts` StoredMsg | 序列化 `decisionInstanceSeq`+`decisionContent.instanceId/signature`；loadSession 续号；补 `dc.approval` | F3 |

## 5. 文件结构

`intent-design`+`00-authority`+`04`（Task1 落稿）·`conversationState.ts`·`useConversationState.ts:86`·`ConversationPanel.tsx`(send/队列/路由块/8回声/9按钮 render 冻结/`:802`退还/`:809`删/`:332-358`恢复续号)·`timeline.ts`·`agentLoop.ts`(echo 降兜底,不加 isDeclineIntent)·`sessionStore.ts`·tests(unit conversationState/agentLoop/timelineEvents/sessionStore + interaction cards T-ECHO/T-BOUND/T-STALE)·`coverage-matrix.md`·`.handoff/`。

**独占区**（串行勿并行）：Task3 `ConversationPanel` 路由块+队列+8回声+`send:2425/:458`；Task4 `:801-818`+timeline+sessionStore；按钮 render 冻结（`:2997…3479`）属 Task3（刀二按钮侧）。

---

## Task 0 · 改前基线（不改码/原稿）
- 串行四命令 + **L3 跑满 ≥3 次取交集**（补上轮被截断的 RUN1）；逐字记。**★先复核 `core:161` 是否稳定红**（上轮两跑未红 → 与 t000069「4 稳定红」冲突，§6-D3 须先定基线再谈修批）。Gate：基线取到 + 工作树净。**取不到/漂移→停并汇报。**

## Task 1 · 领域原稿正文落稿（ADR-015 v2）
**前提：ADR-015 v2 再终审通过 + §6-D1/D2 已裁。** 按修订草案 diff 落三份文档，一次 docs commit。Gate A13（原稿/ADR/代码三源无漂移）。

## Task 2 · 领域层代码（双概念 + 身份门 + clearPending 领域化 + 序列化）
- Step1 失败测试：`setPending` 换 kind/sig 变→seq+1、结构等价重提议→同 seq；`isAnswerToCurrent` 三态；`userDecided` stale no-op（含同 kind 续提议迟到确认被拒）；`pending='none'` goal-confirm 仍执行、rejectStreak→0（护 `:748`）；sessionStore round-trip 续号；**`:733-757` 全绿**。
- Step2 实现 §4；导出纯函数；clearPending 领域化。Gate：L1 新增绿+既有不坏+双 tsc。

## Task 3 · 刀一（回声）+ 队列载荷 + 刀二身份门（文本+按钮）
- Step1 `fromUser=!silent&&!echo` gate C2/`message_sent`/`noteUserTextReply`；回声保留气泡+role user（§3-D1）；达公共尾 `:2604` 续跑。
- Step2 队列 `{text,echo?,answer?}`，入队冻结 `answer={instanceId:stateRef.decisionInstanceSeq,kind:pending}`，flush `:2420` 恢复。
- Step3 8 回声站点 `echo:true`；9 按钮站点 `confirm/reject` 携 **render 冻结的 `decisionContent.instanceId`**（prop→闭包）。
- Step4 路由块 C2 前 `isAnswerToCurrent`，不符→`stale_input_discarded` return；相符且非问句→照旧 C2。
- Step5 测：T-ECHO-1/2、**T-BOUND-1（第九轴可达序列守卫版：manualEmit 单链双 propose_plan(A,B) + working 期入队"行" → flush 时 instanceId 失配→旧答复作废、不误确认 B）**、T-STALE-1；断言 `unresolvedTextReplies` 不被回声推高。S7-1/S7-2/#7-1 不变。Gate 双 tsc + L3 ⊆ 改前。

## Task 4 · D7 + ③退还 + 新事件
删 `:809` 统一经队列；③ evidence 迟到作废 + `evidenceGuideCountRef--`；`stale_input_discarded` timeline union+spec+测试；seq 定案断言（转红即停）。Gate `S4-3b` 不新增红。

## Task 5 · 全链 + 矩阵 + 交接
串行四命令贴新输出；worktree 复算取红（禁 `git stash`）；`coverage-matrix` 加"决策点实例寻址"↔不变量1(精确化)；`S7-1` 标领域正确；handoff 收口 t000071；不 push。

---

## 6. DoD（闸门＝不新增失败）
A1 8回声不改动任何决策点(含队列) · A2 相符真新意图仍走C2(S7-1绿) · A3 回声不推T2 · A4 实例不符作废+`stale_input_discarded`+**可见重提示(不吞文本、不回喂,§6-D2)**(不confirm/reject当前) · **A5 `setPending` 换kind/实质换内容(签名含 statement/files/verification/evidence/tool+subject,排除 assumptions,§6-D1)→新实例、结构等价重提议→同实例；`userDecided`/`clearPending`/`approvalDecided` 不叠 epoch** · A6 身份门挡点旧卡(按钮render冻结)+同kind偷换 · A7 `:733-757` 不坏 · A8 ③退还(不变量4不削) · A9 删`:809`+`sendRef:458`+事件双写 · **A10 第九轴命门(同kind迟到确认)被归属门作废=T-BOUND-1 显式断言** · A11 L3改后⊆改前(N≥3) · **A12 sessionStore 序列化 round-trip 续号、恢复不重号、补 dc.approval** · **A13 原稿/ADR/代码三源无漂移(无双源)**。

## 7. 风险/回滚
- MINOR 领域演进（双概念 + 不变量1精确化 + sessionStore）；波及所有 confirm/reject/approval 调用点喂 answers + 卡 render 传 instanceId。
- **代价**：§6-D2 产品语义（在途旧答复作废+重确认）。
- 残留：C2 coarse 尾巴（非回声非问句杂文本）——身份门+streak 上限兜底；单槽 last-write。
- 回滚：`git revert` 链；ADR-014/015 status 回退。

## 8. 待再终审 gate（阻塞修批）
1. **L3 基线重取 + `core:161` 稳定性复核**（上轮交集仅 3 例，`core:161` 未红——与 t000069「并入 core:161＝4 稳定红」冲突，硬前置）。
2. ~~§6-D1 签名粒度~~ **已裁：排除 assumptions/措辞**。
3. ~~§6-D2 产品语义~~ **已裁：作废 + 可见重确认**（Task 3 须落可见重提示 affordance + `stale_input_discarded`；DoD A4 加"stale no-op 须有可见重提示、不吞文本"）。
4. **ADR-015 v2 再终审（重跑第九/十轴）**：证伪双概念是否仍有死角（含 seq 恢复续号 round-trip）。
5. push 授权（ahead origin 20 + 本会话 docs）。

> §6-D1/D2 产品语义已由用户裁定 → 双概念模型语义闭合；剩余硬前置＝基线重取(§8.1) + 第九/十轴证伪(§8.4)。二者过 → 才请终审进修批（Task1 落原稿→Task2-5 码）。
