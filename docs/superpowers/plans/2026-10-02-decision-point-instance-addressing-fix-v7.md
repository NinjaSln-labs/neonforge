# β（决策点实例寻址）修法完整方案 · v7（双概念·十轴+终审全闭合重铸）

> **For agentic workers:** 逐 Task、Task 间 review 闸。**取代 v1–v6（留历史链）。** 权威＝ADR-014（保留 C2/回声退通道）＋ **ADR-015 v3（决策点实例寻址·双概念·X1–X6 内建）**；落稿依据＝`domain-model-amendment-decision-point-instance-2026-10-02.md`（v3）。
> **本 v7 属"修批规划·待再终审"。第十轴 X1–X6 修法回写后 + L3 基线重取后，方请再终审；未过前不改两份原稿正文、不改产品码（ADR-012）。**

**Goal**：答复只作用于其被写就的**决策点实例**（`decisionInstanceSeq` 匹配）；产品按钮回声整体退出用户通道。C2（改变意图新文本→方向拒）保留。

---

## 0. 一页结论（双概念，X1–X6 内建）

**两正交轴**（第十轴确认核心命门由此关闭）：
- **决策点槽** `pending: kind` → 承载 `rejectStreak`（§4.1/ADR-001 **不变**）。
- **决策点实例** `decisionInstanceSeq`（+ `decisionContent{instanceId,signature}`）→ 承载答复寻址。**只在 `setPending` 推进**（换 kind 或结构化签名变→seq+1；否则同实例）；`userDecided`/`approvalDecided`/`clearPending` **不叠 epoch**。

**单一身份门**（`userDecided`/`approvalDecided` 首行；取代 014#5 kind 守卫）：
```
if (s.pending !== 'none' && !(answers.kind===s.pending && answers.instanceId===s.decisionInstanceSeq))
    { emit stale_input_discarded + 可见重提示; return s }   // 拒时 no-op（不吞文本/不回喂）
```
- `s.pending==='none'` 跳过门 → 放行清理/任务边界 goal-confirm（**X1**，护 `conversationState.test.ts:748`）。
- 门比 `s.pending` 不比 `point` → system_clarify 递归透传原 answers 自洽（**X5**，避 `conversationState.ts:164-165`）。

**答复携带**：文本路**入队(:2447)冻结 / flush(:2420)原样回传、绝不重冻**；按钮/授权路 **render 时从 `decisionContent.instanceId` prop 冻结**（修 UI 偷换）。

**其余内建**：setPending 恒铺 `{kind,since,instanceId,signature}` 骨架 + `:323` 补传 ApprovalRequest（**X2**）；新增 `restorePending(dc)` 旁路（不走 transition/emit、置回 seq、补 dc.approval，**X3**）；`structuralSignature` 纯 helper（排序去重 join、排除 assumptions/since，**X4**）；不变量 1 以 `00 §3.2` **唯一措辞源**、余文档引编号（**X6**）。

**不动/不做**：flush 触发点 `:2614`、单槽宽度（`p000143`）、`detectUnproductiveDialogue` 阈值、C2 语义、protocolTools 的 pending **执行**冻结（提议非动作）、allow 领域接线（t000073 另批）、`toolCallId` 配对（V2）、拒绝词表、输入通道三分、L5（Mac）。

---

## 1. 领域修订（ADR-015 v3）＝修批第一环（Task 1，门控再终审）
落 `intent-design` §2/§3.1/§3.4/§3.5/§4/§4.1 + `00-domain-authority §3.2`（唯一措辞源）+ `04 §1.1/§1.2` 注记 + `02`/`coverage-matrix` 改引编号。**X6**：改一处、余处引 `00 §3.2`，防散落双源。

## 2. 契约变更（= ADR-015 v3 落地）

| 载体 | 变更 | 锚点 |
|---|---|---|
| `ConversationState.decisionInstanceSeq:number`(0) + `DecisionContent{instanceId,signature}` | 新增 | `conversationState.ts:111-126`/`:103-108`/`:128-141` |
| `setPending:303-316` | **推进唯一处**：换 kind/sig 变→seq+1；**恒铺骨架** `{kind,since,instanceId:seq,signature}`（无 content 也铺，approval 除外见 :323）| X2 |
| `userDecided:149` | 首行**单门**（X1/X5，`pending==='none'` 放行）；confirm/reject+rejectStreak `:177/:218` 不变；**不叠 epoch** | — |
| `approvalDecided:262` | 携 answers、同单门；**不叠 epoch** | X2 |
| `clearPending` | 新领域 `clearPending(s)={pending:'none',decisionContent:undefined,lastRejectReason:undefined}`（**不叠 seq**）；`useConversationState.ts:86` 改调 | 承 §3-D2 |
| `restorePending(dc)` | 新领域：**置回 pending/decisionContent/decisionInstanceSeq=dc.instanceId**，**不走 transition/不 emit**（仿 `useConversationState.ts:97-104 restorePlanned`）| X3 |
| `structuralSignature(kind,content)` | 新纯 helper：goal=statement；plan=files.path集+verificationPlan；resolution=evidence.command集+diff.path；approval=toolName+subject；**排除 assumptions/since**；排序去重 join | X4 |
| `DecisionAnswer`/`isAnswerToCurrent` | 新导出 | — |
| `renderSendOpts` | `send` opts + `echo?/answer?`（`:2425`）；`sendRef:458` 同批 | D6/D7 |
| 兼容壳 `userConfirmed/userRejected:286/293` | 加 `answers:{instanceId,kind}` 形参 | X5 |
| `TimelineEventType`+`TIMELINE_EVENT_SPECS` | `conversation.stale_input_discarded` 双写，不扩 domain 枚举 | D9 |
| `sessionStore.ts:11-18` StoredMsg | 序列化 `decisionInstanceSeq`+`decisionContent.instanceId/signature`；恢复走 `restorePending`；补 `dc.approval`（`:351`）| X3 |
| `ConversationPanel.tsx:323` | 补传 ApprovalRequest（toolName+subject）使 approval 卡有签名+instanceId 载体 | X2 |

**兼容性红线**：门对所有 `userDecided`/`approvalDecided` 调用一致；pending='none' 一律放行（护 `:748`）；`answers` 由调用点提供（文本入队冻结、按钮 render 冻结）。

## 3. 文件结构（精确行锚，串行独占区）

| 文件 | 职责 | Task |
|---|---|---|
| `intent-design`+`00-authority`+`04`+`02`+`coverage-matrix` | 模型原稿落稿 + X6 单源 | 1 |
| `src/domain/conversationState.ts` | decisionInstanceSeq + setPending 铺骨架/推进 + 单门(userDecided/approvalDecided) + clearPending + restorePending + structuralSignature + DecisionAnswer/isAnswerToCurrent | 2 |
| `src/renderer/useConversationState.ts` | `:86 clearPending` 改调；`transition/confirm/reject` 透传 answers | 2 |
| `src/renderer/ConversationPanel.tsx` | `send opts:2425`/`sendRef:458`；队列 `:758/:2416-2420/:2447/:809`；路由块 `:2454-2498`（fromUser gate + 门 + 问句旁路）；回声 8 站点 `:3000…3496` echo:true；按钮 9 站点 `:2997…3479` render 冻结 instanceId；`:323` 补传；`:802/804` 退还；`:332-358` 恢复改 restorePending | 3,4 |
| `src/domain/timeline.ts` | stale 事件 union+spec | 4 |
| `src/renderer/sessionStore.ts`（或 `src/**/sessionStore.ts`）| 序列化/续号 | 2 |
| `src/domain/agentLoop.ts` | `isDecisionCardEcho` 兜底；不新增 `isDeclineIntent` | — |
| `tests/unit/conversationState.test.ts` | 门 carve-out（pending='none' 放行 goal-confirm 护 `:748`）、同 kind 续提议迟确认 no-op、restorePending round-trip、`setPending` 铺骨架不叠 epoch；**保 `:733-757`** | 2 |
| `tests/unit/*` (sessionStore/agentLoop/timelineEvents) | 序列化续号 / 回声 / 事件三段式 | 2,4 |
| `tests/interaction/cards-...interaction.ts` | S7-1/S7-2/#7-1 不变；**T-ECHO**（8 站点 echo 不复活）、**T-BOUND-1**（manualEmit 单链双 propose_plan(A,B)+working 期入队"行"→flush instanceId 失配→no-op，第九轴命门守卫版）、**T-STALE-1**；断言 stale 拒时有可见重提示 | 3,4 |

**独占区**（勿并行）：Task3 路由块+队列+8回声+9按钮+`send/sendRef`；Task4 `:801-818`+timeline+`:323`。

---

## Task 0 · 改前基线（不改码/原稿）
串行四命令 + **L3 跑满 ≥3 取交集**（补上轮截断的 RUN1）；**★先复核 `core:161`** 是否稳定红（上轮交集仅 3 例，与 `t000069`「4 稳定红」冲突→基线未定不进修批）。S7-1 现断言须绿。Gate：基线取到 + 工作树净。

## Task 1 · 领域原稿正文落稿（ADR-015 v3）
**前提：再终审通过 + §9.2 X1–X3 修法核过。** 按修订草案 v3 diff 落 5 处文档，X6 采"`00 §3.2` 唯一措辞源"。一次 docs commit。Gate A13（三源无漂移）。

## Task 2 · 领域层代码（双概念 + 单门 + restore 旁路 + 序列化）
- Step1 失败测试：门 carve-out（`pending='none'` goal-confirm 仍重置、护 `:748`）；同 kind 续提议（sig 变）→ seq+1、旧 instanceId 答复 → `isAnswerToCurrent` false；结构等价重提议 → 同 seq（A-026）；`setPending` 无 content 仍铺骨架；`restorePending` round-trip 置回 seq 不 +1、不重复 emit；`structuralSignature` 确定性（乱序 files 同 sig、改 assumptions 不改 sig、改 since 不改 sig）；**`:733-757` 全绿**。
- Step2 实现 §2 表；导出纯函数。Gate：L1 新增绿 + 双 tsc。

## Task 3 · renderer：刀一回声 + 队列载荷 + 门（文本+按钮 render 冻结）
- Step1 `fromUser=!silent&&!echo` gate C2/`message_sent:2486`/`noteUserTextReply:2488`；回声保留气泡+role user（§3-D1）；达公共尾 `:2604` 续跑。
- Step2 队列 `{text,echo?,answer?}`：入队 `:2447` 冻结 `answer={instanceId:stateRef.current.decisionInstanceSeq,kind:stateRef.current.pending}`（**仅 fromUser 且有 pending**）；flush `:2420` **原样回传**（不重冻，第十轴 B 承重）。
- Step3 8 回声站点 `echo:true`；9 按钮站点从 `decisionContent.instanceId` prop 闭包冻结、经兼容壳传 answers；`:323` 补 ApprovalRequest。
- Step4 路由块 C2 前门（`s.pending!=='none' && !isAnswerToCurrent` → stale 事件+可见重提示+return）；相符且非问句 → 照旧 C2。
- Step5 T-ECHO/T-BOUND-1/T-STALE-1；S7-1/S7-2/#7-1 不变。Gate 双 tsc（`:458`+`:2425` 同批）+ L3 ⊆ 改前。

## Task 4 · D7 删 :809 + ③退还 + 新事件登记
`:809`→统一经 send/队列（echo:true）；③ evidence 迟到作废 + `evidenceGuideCountRef--`（`:802`）；`stale_input_discarded` timeline union+spec（不扩 domain 枚举）+`timelineEvents.test`；`system_nudge` vs `pending_set{resolution}` seq 定案（转红即停）。Gate `S4-3b` 不新增红。

## Task 5 · 全链 + 矩阵 + 交接
串行四命令贴新输出；worktree 复算取红（禁 `git stash`）；`coverage-matrix` 加"决策点实例寻址"↔不变量1(精确化)；`S7-1` 标领域正确；handoff 收口 `t000071`；不 push。

---

## 6. DoD（闸门＝不新增失败）
A1 8 回声不改动决策点(含队列,answer 不重冻) · A2 相符真新意图仍走 C2(S7-1绿) · A3 回声不推 T2 · A4 实例不符→`stale_input_discarded`+**可见重提示**+不吞不回喂(§6-D2) · A5 `setPending` 铺骨架/推进唯一、userDecided/approvalDecided/clearPending 不叠 epoch · **A6 单门：`pending==='none'` 放行 goal-confirm(护 `:748`)、system_clarify 递归透传不误杀** · **A7 同 kind 续提议(sig 变)→新实例→旧答复 no-op=T-BOUND-1 命门闭合** · A8 `:733-757` 不坏 · A9 ③退还(不变量4不削) · A10 删`:809`+`sendRef:458`+事件双写 · **A11 `restorePending` round-trip：seq 置回不 +1、不重复 emit、补 dc.approval** · **A12 `structuralSignature` 确定性(乱序同/改 assumptions 或 since 不改)** · A13 L3 改后⊆改前(N≥3) · **A14 原稿/ADR/代码三源无漂移、不变量1 单措辞源(X6)**。

## 7. 风险/回滚
MINOR 领域演进（双概念+单门+restore+序列化），落 S1，调用点/测试面广。残留：仅改 assumptions/措辞的重提议＝同实例（§6-D1 已裁可接受）；单槽 last-write。回滚＝`git revert` 链 + ADR status 回退。

## 9. 待再终审（修批硬前置）
1. **L3 基线重取 + `core:161` 稳定性**（§Task0，冲突未结不进修批）。
2. **X1–X3 修法回写后再核一轮**（门 carve-out 不误伤 approval 重开同 sig、restore round-trip、签名规范化确定性）——可派第十一轴。
3. **push 授权**（ahead origin 20 + 本会话 docs）。

> 十轴 + 终审连续对撞：双概念方向成立、X1–X6 已内建于 ADR-015 v3/v7。语义(§6-D1/D2)已锁。余基线 + X 修法再核 + 再终审 → 通过才落原稿/改码。
