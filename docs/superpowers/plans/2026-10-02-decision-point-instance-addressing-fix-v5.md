# β（决策点答复归属）修法完整方案 · v5（九轴综合·模型修订为主轴）

> ⚠️ **已被 v6 取代（`2026-10-02-decision-point-instance-addressing-fix-v6.md`）——勿据本 v5 改码。** 终审 `docs/audits/final-review-adr015-v5-2026-10-02.md` 判 v5/ADR-015 v1「setPending 永不递增」自相矛盾、关不上第九轴命门（F1–F6）。v6 采**双概念**（决策点槽 kind/rejectStreak ⊥ 实例 instanceId）重铸。本文留历史链。

> **For agentic workers:** 逐 Task 实现，Task 间设 review 闸。**本文自顶向下重写，综合四轴（技术可编译/治理授权/因果/外部证据）→ 第五轴（领域忠实）→ 第六轴（证伪五轴）→ 第七轴（证伪 v3）→ 第八轴（v4 待决项领域裁定）→ 第九轴（命门可达性双路确认）全部结论，取代 v1/v2/v3/v4（四者留历史链，勿据其改码）。**
> **权威**：领域裁定＝ADR-014（β 方向·保留 C2）＋ **ADR-015（决策点实例寻址取代 kind 寻址——β 真模型缺陷修复）**；模型原稿落稿依据＝`docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`（定点修订草案，现文→拟改 diff）。
> **本方案属"另开修批"规划。ADR-014/015 终审点头前，不得据此改产品码、不得改两份领域原稿正文（ADR-012）。**

**Goal**：把「用户对某决策点做出的答复」绑定到它被写就的**决策点实例**（代次），代次不符即作废——在**领域模型**层以 ADR-015 确立"决策点实例身份"，代码为其投影；同时把产品按钮自发回声整体移出用户输入通道。C2（改变意图的新文本→方向拒）作为领域 `intent-design:215` 规定的路由**保留**。

---

## 0. 一页结论

### 0.1 β 是**真·模型缺陷**（第九轴命门已证，非"实现未照模型做"可解释）

- 现模型决策点 `pending` 只有 **kind**、无实例/代次身份（`design-research:58` 点名"index/当前项配对＝被点名脆弱设计"）。
- **同 kind 续提议的迟到确认＝可达**（第九轴构造路 + steelman 路独立均判"可达，无门可挡"）：`protocolTools.ts:409-414` `propose_plan` 不查 `pending`（不变量 3 对协议工具未实施）＋ `gateway.ts:685-691/727-744` 一次响应可双 `propose_plan`（A→B 同 kind 覆盖落同一收口窗）＋ `busyGate.ts:5-14` working 期入队 → `finally:2610-2614` flush 时 `confirm(pendingKind)`（`:2462`）**错误确认 B**。
- ⇒ 只有引入**决策点实例身份 + 答复携代次校验**才能在模型层闭合；这是领域演进，非纯实现。

### 0.2 三刀（第九轴钉死分工，**刀二、刀三不可互替**）

| 刀 | 承什么 | 机制 | 契约风险 |
|---|---|---|---|
| **刀一·回声退用户通道**（前提） | 产品按钮自发文本 | `send` 加来源标记 `opts.echo`；路由对 echo 旁路 C2 分类 + `message_sent` + `noteUserTextReply`（模型调用在块外公共尾 `:2604`，旁路不误伤续跑）；**echo 标记须随队列载荷恢复**（否则 busy 期回声经 `:2447→:2420` 复活为用户通道＝β 活口） | 零领域契约；可见性已裁（§3-D1） |
| **刀二·代次归属门**（**文本路唯一有效防线**） | 文本迟到误确认/误作废 | 领域新增 `decisionEpoch`＝决策点实例身份（ADR-015）；`answer={epoch,kind}` 入队冻结、flush 恢复；C2 前 `isAnswerToCurrent` 校验，**确认侧与拒绝侧皆先验代次**（`:75`），不符→作废 + `conversation.stale_input_discarded`。**kind 守卫对文本路恒真无效**（`confirm(pendingKind)` 传的 point 就是 `s.pending`） | **MINOR 领域演进**（ADR-015：触 §3.4 转换签名 + 不变量 1 精确化 + §3.1 加字段 + §2/§3.5 措辞） |
| **刀三·控件守卫**（仅按钮路） | 点旧卡清当前 pending | `userDecided:149` 首行 `if (s.pending!=='none' && point!=='system_clarify' && point!==s.pending) return s`（F-A `pending!=='none'` 前置，护 `:748` goal-confirm） | 零（回归不变量 1+7，只用已有概念） |

### 0.3 不动 / 关键澄清（防执行者好心改坏）

- **flush 触发点不动**（`ConversationPanel.tsx:2614` finally）；**队列宽度不动**（单槽保持——多槽方向反转 `p000143`/`t000068`）。
- **不补 `protocolTools.ts:409-414` 的 pending 检查**——模型重提议覆盖同 pending 是 `conversationState.ts:308` 明示的"延续"设计语义；β 的解不是禁止覆盖，而是**让旧实例的答复作废**（刀二）。补检查会破坏 ADR-001/§4.1 协商保护链。
- **`detectUnproductiveDialogue` 阈值不动**（`conversationState.ts:244-259`）；**C2 语义不动**（`intent-design:215`，ADR-014 保留）。
- **approval 的 `toolCallId` 精确配对不动**（V2 另叶 t000073）；本批仅补 approval 族 `pending→none` 的 epoch 递增（防御性，见 §4）。

---

## 1. 领域修订（ADR-015）＝修批第一环

模型原稿正文须先落"决策点实例寻址"，代码随其后（防双源：ADR 有、原稿无＝违反落位规则）。落稿内容＝`docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md` 的 diff：
- `intent-confirmation-domain-design.md`：§2（DecisionPoint 携 `decisionEpoch`、Decision 携被应答代次）、§3.1（ConversationState 加 `decisionEpoch:number`）、§3.4（`userDecided`/`approvalDecided` 由 kind 寻址→携 `targets:epoch` 且确认拒绝双侧先验）、§3.5（`decision.requested/resolved` 带 epoch）、§4 不变量 1（精确化"针对当前决策点实例"）、§4.1/ADR-001（延续 vs 新点由代次显式承载）。
- `docs/domain/00-domain-authority.md`：§3.2 不变量 1 同步精确化措辞。
- 语义不变处：ADR-001/006 正文不动（ADR-015 仅换显式载体/确认非取代）。

---

## 2. 实现现状锚点（直读源码·v5 基，执行前须重验漂移）

- `send` opts 现仅 `{silent?,text?}`（`ConversationPanel.tsx:2425`）；单槽 `pendingSendRef=useRef('')`（`:758`），写 `:2447`（排队）+ `:809`（对账直写·D7 待删），读 flush `:2416-2420`（`setTimeout 50` 仅回传 `{text}`）→ echo/answer 标记今天丢失。
- C2 路由块 `:2454-2482`（`confirm/reject(pendingKind)`）；块内无 `isDecisionCardEcho`（全仓零消费者）。
- 回声 `sendRef({text})` **8 站点**：`:3000/3018/3075/3095/3134/3446/3468/3496`（`:3444` `onPlanConfirmed` 先于 send 落定决策）。
- `userDecided:149`（`:171 pending:'none'` 无条件、`:177` confirm 重置 rejectStreak、`:218` reject 累加、`:158-170` system_clarify 委派、`:209-211` approval 防御）；`approvalDecided:262`（`:270` 清 pending）；`approvalGranted:320`（`:323` 清 pending）；`clearPending`=`useConversationState.ts:86` 直写、调用点 `ConversationPanel.tsx:325`。
- `ConversationState`/`DecisionContent`（`:111-126`/`:103-108`）**无 epoch**；`setPending:303-316` 只置 kind + `notePendingSet:233`。
- 既有 rejectStreak 测试 `conversationState.test.ts:733-757`（`:748` goal-confirm @ pending='none' 须重置——刀三 F-A 约束）。
- `timeline.ts`：`TimelineEventType` union `:20-92`、`domain` 枚举 `:96-110`（含 `conversation`）、`TIMELINE_EVENT_SPECS:116 = Record<TimelineEventType,…>`（加成员强制双写，F-D）。

---

## 3. 决策表（九轴浓缩；⚑=已终审裁定）

| 编号 | 决策 |
|---|---|
| **D1**⚑ | 保留 C2（不改 `intent-design:215`）；不取代 `ADR-001/006`（ADR-015 仅换显式载体）。四轴 ⓪"废 C2"判否（六轴降级：三契约机制不依赖 C2，保留依据＝领域显式规定） |
| **D2**⚑ | `decisionEpoch`＝**决策点实例身份领域概念**（ADR-015，取代 kind 寻址），随 pending 存 `ConversationState`（非 renderer 影子——否则与领域抢 pending 权威＝双源） |
| **D3**⚑ | 递增绑**全部 `pending→'none'` 转换**（`userDecided:171`+`approvalDecided:270`+`approvalGranted:323`+`clearPending:86`——F-B）；`setPending:303` **永不**递增（对齐 `ADR-001` 延续） |
| **D4**⚑ | 归属门 `isAnswerToCurrent`：`answer.epoch===s.decisionEpoch && answer.kind===s.pending`；**确认侧与拒绝侧皆先验**（`:75`）；不符→作废 + `conversation.stale_input_discarded`。文本路唯一下线（第九轴） |
| **D5**⚑ | 控件守卫 `if (s.pending!=='none' && point!=='system_clarify' && point!==s.pending) return s`（F-A 前置护 `:748`）；**仅按钮路有效**（文本路 point 恒等 pending，第九轴） |
| **D6**⚑ | 队列载荷 `{text, echo?, answer?}`（`:758`）+ flush `:2420` 恢复标记（F-E：刀一完备性前置）；单槽宽度不动 |
| **D7**⚑ | 落地 `d000008`：删 `:809` 第二写入口，对账引导统一经 `send`/队列；同批改 `sendRef:458` 类型（破四轴 F4 自锁） |
| **D8**⚑ | ③ 迟到 `evidence` 引导作废 + **退还 `evidenceGuideCountRef`**（`:802` 先自增者回退，四轴 C2/不变量 4） |
| **D9**⚑ | `stale_input_discarded`：加 `TimelineEventType` 成员 + `TIMELINE_EVENT_SPECS` 双写，**不扩 `domain` 枚举**（F-D）；命名对齐 §3.5 |
| **D10**⚑ | 回声用 `opts.echo`，**弃串表作主判据**（`isDecisionCardEcho` 降兜底）——覆盖全部 8 站点 |
| **D11**⚑ | 不新增打字拒绝词表（无 `isDeclineIntent`；用户 Q2）；`isQuestionLike` 问句不判方向拒→纳入（八轴 §3，一处 `&& !isQuestionLike(text)` 隔离，无附加冻结层） |
| **§3-D1**⚑ | 回声可见性＝**保留气泡 + `role:'user'`，仅退 C2/`message_sent`/`noteUserTextReply`**（八轴 §1；备选完全 silent 否——翻转 ≥4 契约） |
| **§3-D2**⚑ | clearPending 本批仅**领域函数化**（清 `pending+decisionContent+lastRejectReason`+叠 epoch）；**allow 同步领域化另批 t000073**（β 真身＝plan→resolution，approval 族＝叶因 α） |
| **§3-D4**⚑ | `t000069` 经 CLI **并入 `core:161`＝第 4 稳定红**；N≥3 硬门槛（八轴 §4） |

---

## 4. 领域契约变更（执行清单·= ADR-015 落地）

| 载体 | 变更 | 锚点 |
|---|---|---|
| `ConversationState.decisionEpoch: number`（init 0） | **新增领域字段**（ADR-015 决策点实例身份） | `conversationState.ts:111-126`/`:128-141` |
| `setPending:303` | **不递增**（重提议＝延续） | 保 `:733-757` |
| `userDecided:149` | 首行守卫（D5）；`:222 return` 前 `next.decisionEpoch=s.decisionEpoch+1`（confirm/reject/approval 分支皆叠） | `:171/:177/:218` 不动 |
| `approvalDecided:262`/`approvalGranted:320` | 各 `pending:'none'`（`:270`/`:323`）`decisionEpoch+1` | D3/F-B |
| `clearPending` | 新领域函数 `{pending:'none', decisionContent:undefined, lastRejectReason:undefined, decisionEpoch:+1}`；`useConversationState.ts:86` 改调（§3-D2） | F-B/八轴 §2 |
| `DecisionAnswer`/`isAnswerToCurrent` | 新导出纯函数 | — |
| `renderSendOpts` | `send` opts + `echo?/answer?`（`:2425`）；`sendRef:458` 同批 | D6/D7 |
| `TimelineEventType`+`TIMELINE_EVENT_SPECS` | 加 `conversation.stale_input_discarded` 成员 + spec `{domain:'conversation',role:'system',detailKeys:['kind','?wantEpoch','?curEpoch']}` | D9/F-D |

**兼容性红线**：epoch 递增须覆盖全部 `pending→'none'`（含 approval 族/clearPending）；`userDecided` 是 `confirm`/`reject`/兼容壳共同落点，守卫+递增对所有经它的路由一致生效。

---

## 5. 文件结构（改动落位）

| 文件 | 职责 | Task |
|---|---|---|
| `docs/design/intent-confirmation-domain-design.md` + `docs/domain/00-domain-authority.md` | **模型原稿正文修订**（ADR-015 落稿，据修订草案 diff） | **1** |
| `src/domain/conversationState.ts` | `decisionEpoch` + `initialState` + `setPending` 不递增 + `userDecided`/`approvalDecided`/`approvalGranted` 递增 + 新 `clearPending` + `DecisionAnswer`/`isAnswerToCurrent` | 2 |
| `src/renderer/useConversationState.ts` | `:86 clearPending` 改调领域函数 | 2 |
| `src/renderer/ConversationPanel.tsx` | `send` opts `echo/answer`（`:2425`）+ `sendRef:458`；队列载荷（`:758/:2416-2420/:2447/:809`）；路由块（`:2454-2498`）回声旁路 + 归属门 + 问句旁路；回声 8 站点打标；`:802/804` 退还；`:809` D7 删除 | 3,4 |
| `src/domain/timeline.ts` | `stale_input_discarded` union+spec | 4 |
| `src/domain/agentLoop.ts` | `isDecisionCardEcho` 保留兜底；**不新增 `isDeclineIntent`** | — |
| `tests/unit/conversationState.test.ts` | epoch 全转换递增、`isAnswerToCurrent`、控件守卫（含 `pending==='none'` 放行 goal-confirm）、**保 `:733-757`** | 2 |
| `tests/unit/timelineEvents.test.ts` | `stale_input_discarded` 三段式（照 `completion.evidence_missing` `:261-283`） | 4 |
| `tests/interaction/cards-from-decision-content.interaction.ts` | **S7-1/S7-2/#7-1 不变**；新增 **T-ECHO-***（8 站点含 `确认，继续`/`已解决，谢谢`/队列回声）、**T-BOUND-1**（manualEmit：同 kind 续提议 A→B，旧 plan 答复作废——第九轴可达序列的守卫版）、**T-STALE-1**（补 write 轮使 resolution 弹出） | 3,4 |
| `docs/tests/coverage-matrix.md` / `.handoff/` | 矩阵/交接 | 5 |

**独占区**（串行勿并行）：Task 3 碰路由块 `:2454-2498` + 队列 `:758/:2416-2420/:2447/:809` + 8 站点 `:3000-3496` + `send`/`sendRef`；Task 4 碰 `:801-818`（退还）+ `send` 顶守卫 + timeline。

---

## Task 0 · 取改前基线（**不改码/不改原稿**）

- Step1 串行四命令 + **同命令跑满 3 次取 L3 稳定红交集**（`u000010`）。Step2 逐字记（预期含 `t000069` 现 4 例含 `core:161`）。Step3 证伪保护：`-g "S7-1"` 现断言（打字换目标→卡消失）须**绿**（本批不翻转，A2）。Step4 Gate：基线取到（N≥3 交集）+ 工作树干净才进。**取不到→停并汇报。**

## Task 1 · 领域原稿正文修订（ADR-015 落稿）

**前提：ADR-014/015 已终审点头。** 按 `docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md` diff 落 `intent-confirmation-domain-design.md`（§2/§3.1/§3.4/§3.5/§4/§4.1）+ `00-domain-authority.md §3.2`。一次 docs commit `docs(领域模型): ADR-015 决策点实例寻址`。Gate：原稿、ADR、后续代码签名三者无漂移（A12）。

## Task 2 · 领域层代码（decisionEpoch + 控件守卫 + clearPending 领域化）

**Files**：`conversationState.ts` + `useConversationState.ts:86` + `conversationState.test.ts`
- Step1 失败测试：`setPending` 不递增；`userDecided`/`approvalDecided`/`approvalGranted`/`clearPending` 各递增；守卫 `s.pending==='plan'` 点 'goal'→原样返回；`s.pending==='none'` goal-confirm→仍执行、rejectStreak→0（F-A）；`isAnswerToCurrent` 真/假；**`:733-757` 全绿**。
- Step2 实现 §4 领域变更 + 导出 `DecisionAnswer`/`isAnswerToCurrent` + 新 `clearPending`。
- Step3 Gate：L1 新增绿 + 既有不坏 + 双 tsc 0 错。

## Task 3 · 刀一（回声退用户通道）+ 队列载荷 + 刀二归属门

**Files**：`ConversationPanel.tsx` + interaction
- Step1 `const fromUser = !silent && !opts.echo`；C2 路由块 + `message_sent`/`noteUserTextReply` 由 `fromUser` gate；回声按 §3-D1 **保留气泡 + `role:'user'`**，仅退三侧效应；回声仍达公共尾 `:2604` 续跑。
- Step2 队列载荷 `{text,echo?,answer?}`；入队 `:2447` 冻结 `answer:{epoch:stateRef.current.decisionEpoch, kind:stateRef.current.pending}`；flush `:2420` 恢复。
- Step3 8 站点 `sendRef.current({text, echo:true})`。
- Step4 归属门：路由块内 C2 前，非 echo 且 `opts.answer` → `if(!isAnswerToCurrent(...)){tlog('conversation.stale_input_discarded',{...});return}`；相符且非问句（D11）→ 照旧 C2/confirm。
- Step5 测试：T-ECHO-1（`确认，继续` 撞 resolution 活卡→不误拒/误确认）、T-ECHO-2（队列回声不复活）、T-BOUND-1（**第九轴可达序列守卫版**：manualEmit 单链双 propose_plan(A,B) + working 期入队确认词 → flush 时旧代次作废、不误确认 B）、T-STALE-1（resolution 卡真弹出）。断言 `unresolvedTextReplies` 不因回声增长。**S7-1/S7-2/#7-1 保持绿**。
- Gate：L1 新增绿 + 双 tsc（`:458`+`:2425` 同批）+ L3 失败清单 ⊆ 改前。

## Task 4 · D7 删第二写入口 + ③ 引导作废退还 + 新事件登记

- Step1 D7：删 `:809` 直写，改 `if(workingRef.current) pendingSendRef.current={text:nudge,echo:true}; else void sendRef.current({silent:true,text:nudge})`；grep `pendingSendRef` 命中数登记。
- Step2 ③ 作废退还：`evidence` 家族迟到/代次不符 → 作废 + **`evidenceGuideCountRef.current--`**（`:802` 回退，D8）。
- Step3 新事件（D9）：`timeline.ts` union + spec 双写；`timelineEvents.test.ts` 照 `completion.evidence_missing` 模板。
- Step4 交错定案（四轴 F5）：`system_nudge` vs `pending_set{resolution}` seq 断言，**转红即停**。
- Gate：`S4-3b` 不因退还新增红；全链 ⊆ 改前。

## Task 5 · 全链验证 + 规范/矩阵/交接（单一写入口）

- Step1 串行四命令贴新鲜输出。Step2 β 反向确认（证伪保护）：一次性 worktree（`git worktree add /tmp/nf-beta-revert <改前基线>`）跑 T-ECHO-*/T-BOUND-1/T-STALE-1 取**红**，`git worktree remove`（**禁 `git stash`**，共享工作树）。Step3 `coverage-matrix.md` 加"决策点实例寻址"规则行 ↔ 不变量 1（精确化）↔ 新测试；`S7-1` 标"领域正确·不翻转"。Step4 handoff CLI 收口 `t000071`、新批登记；不 commit/push（需授权）。

---

## 6. DoD 断言矩阵（闸门＝不新增失败）

| # | 断言 | 判定 |
|---|---|---|
| A1 | 8 站点回声皆不改动任何决策点，含 busy 期经队列回声（D6） | T-ECHO-1/2 绿 |
| A2 | 代次相符的真新意图**仍走 C2 方向拒**（`intent-design:215`） | **S7-1 保持绿** |
| A3 | 回声不推高 `unresolvedTextReplies`（T2 不被污染） | L1/L3 |
| A4 | 代次不符答复作废 + `conversation.stale_input_discarded`，不 confirm/reject 当前卡 | T-BOUND-1/T-STALE-1 绿 |
| A5 | `setPending` 不递增；**全部 `pending→'none'`（含 approval 族/clearPending）递增** | L1 绿（F-B） |
| A6 | 有活 pending 时点旧卡不清（守卫）；`pending==='none'` goal-confirm 仍重置 | L1 绿（F-A，护 `:748`） |
| A7 | `:733-757` rejectStreak 既有断言不坏 | L1 绿 |
| A8 | ③ 丢弃退还 `evidenceGuideCountRef`（不变量 4 不削） | `S4-3b` 不新增红 |
| A9 | `:809` 第二写入口删除；`sendRef:458` 含 `echo/answer`；`stale_input_discarded` union+spec 双写 | grep + 双 tsc |
| **A10** | **同 kind 续提议的迟到确认被归属门作废（第九轴可达序列的守卫版不复发）** | T-BOUND-1 显式断言 |
| A11 | 全链不新增失败；**L3 改后清单 ⊆ 改前同次运行**（N≥3 交集，非历史数字） | §7 逐字表 |
| **A12** | **模型原稿（intent-design/00-authority）正文与代码签名无漂移、无"ADR 有模型无"双源** | Task 1 diff 对照 + grep |

## 7. 影响 / 风险 / 回滚

- **这是 MINOR 领域演进**（加决策点实例身份 + 收紧不变量 1），落 S1「领域层重写」既有阶段；波及 §3.4 全部转换签名（userDecided/approvalDecided 携 `targets:epoch`）与所有调用点。
- **残留**：① C2 coarse 尾巴（「等下」/问句式改意图）——epoch 门 + rejectStreak 上限 + 按钮路径兜底，判可接受（YAGNI）。② 单槽 last-write 覆写——本批不扩队列（`p000143`），已知限制。③ approval「允许」异步旁路＝即存不变量 1 违例，非 β 真身→**另批 t000073**。
- **回滚**：Task 1（docs）+ 2-4（码）顺序 commit；回滚＝`git revert` 链 + ADR-014/015 status 相应改；取证＝A11 改前/改后清单 + Task 5 红→绿对照表。

## 8. 明确不做（本批范围外）

废 C2 / 翻转 S7-1 / 新增拒绝词表 / 多槽队列 / 边缘 flush / **补 `protocolTools` pending 检查**（会破坏延续设计，第九轴） / approval 允许同步领域化（t000073） / approval `toolCallId` 精确配对（V2 另叶） / 输入通道三分/回声领域词汇（无缺陷证据，§4.12/ADR-013 已足） / L5 基线（Mac 权威，另批）。

## 9. 待终审（用户 gate——非领域可裁）

1. **ADR-014 + ADR-015 + v5 定稿点头** → 授权另开修批：Task 1 落两份领域原稿正文（据修订草案 diff）→ Task 2-4 S1 领域层按新签名实现 → Task 5 验证。
2. **push 授权**（ahead origin 20 + 本会话全部 docs 未 commit）。

> 九轴连续对抗已全部收敛：β 方向（保留 C2）第五/六轴定、刀法分工第九轴定、待决项第八轴按领域裁定、命门可达性第九轴证。**无新增阻断**。剩余仅上述二 gate。
