# β（决策点答复归属）修法完整方案 · v4（四~七轴综合重写）

> ⚠️ **已被 v5 取代（`2026-10-02-decision-point-instance-addressing-fix-v5.md`）——勿据本 v4 改码。** v5 据第九轴把 β 确立为**真·模型缺陷**，将「领域原稿正文修订（ADR-015）」升为修批第一环、代码为其投影，并钉死「刀二承文本路 / 刀三仅承按钮路，不可互替」。本文留历史链。

> **For agentic workers:** 逐 Task 实现，Task 间设 review 闸。**本文自顶向下重写，综合四轴（技术/治理/因果/外部）、第五轴（领域忠实）、第六轴（证伪五轴自身）、第七轴（证伪 v3）、第八轴（v4 待决项领域裁定）全部结论，取代 v1/v2/v3（三者留历史链，勿据其改码）。领域裁定＝ADR-014（β 修法方向）＋ ADR-015（决策点实例寻址——β 模型缺陷修复，精化 ADR-014 的 `decisionEpoch`）。本方案属"另开修批"规划，ADR-014/015 终审前不得据此改产品码（ADR-012）。**
>
> 轴报告：`plan-review-decision-epoch-binding-2026-10-01.md`（四）· `ddd-model-review-decision-epoch-binding-2026-10-02.md`（五）· `independent-audit-v2-and-fifth-axis-2026-10-02.md`（六）· `independent-audit-v3-2026-10-02.md`（七）· `independent-audit-v4-2026-10-02.md`（八）。
> 模型修订草案：`docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`（ADR-015 落稿依据，待第九轴证伪其立论）。

**Goal**：让「对某决策点做出的答复」只作用于它被写就的那个决策点；**把产品按钮自发回声整体移出用户输入通道**（不退 C2 误杀、不虚增无进展计数、且经队列复活的路径一并堵死）。C2（新意图文本→方向拒）作为领域 `intent-confirmation-domain-design.md:215` 规定的路由**保留**。

---

## 0. 一页结论（六轴收敛后定形）

β 病根＝**C2 分类器输入越界**（回声/问句塌缩成"方向拒"）＋**答复无决策点归属**（迟到文本按当前 pending 解释）。非 C2 规则本身错（第五轴 R2 保留；第六轴降级 R1，保留依据改订为"领域显式规定，改它需勘误/契约同步"）。三刀：

| 刀 | 内容 | 契约风险 | 依赖 |
|---|---|---|---|
| **一·回声退用户通道** | `send` 加来源标记 `opts.echo`；路由对 echo 旁路 C2 分类 + `message_sent` + `noteUserTextReply`（模型调用在块外公共尾，旁路不误伤续跑——第七轴排除）；**回声标记须随队列载荷恢复**（否则 busy 期回声经 `:2447→:2420` 复活为用户通道＝β 活口，F-E） | 零（领域契约）；可见性见 §3-D5 | **须与队列载荷同批**（Task 2） |
| **二·代次归属门**（＝ADR-015 决策点实例寻址的实现投影） | 领域新增 `decisionEpoch`（**非 β 实现字段，是决策点实例身份领域概念**——ADR-015 取代 kind 寻址），**递增绑每个 `pending→'none'` 转换**（`userDecided:171`＋`approvalDecided:270`＋`approvalGranted:323`＋`clearPending:86`——F-B 补全，仅 userDecided 会漏授权族重开合同误命中新卡）；`setPending:303` **永不**递增（对齐 `ADR-001` 延续）；应用点 `isAnswerToCurrent` 校验，**确认侧与拒绝侧皆先验代次**（`:75` 同 kind 迟到确认，kind 守卫挡不住），不符→作废 + `conversation.stale_input_discarded` | **MINOR 领域演进**（触 §3.4 转换签名 + 不变量 1 精确化；见 ADR-015 / 修订草案） | Task 2 |
| **三·控件守卫** | `userDecided:149` 首行 `if (s.pending!=='none' && point!=='system_clarify' && point!==s.pending) return s`（**F-A `pending!=='none'` 前置**——否则挡掉 `:748` goal-confirm 任务边界重置、破既有 rejectStreak 测试）。**⚠️ 第九轴：此守卫仅覆盖按钮/点旧卡路径**——文本 flush 路 `confirm(pendingKind)` 的 `point` 恒等于 `s.pending`（`:2459→:2462`），守卫永不触发 ⇒ 文本路迟到误确认**靠刀二** | 零（回归不变量 1+7） | Task 1 |

**不动**：flush 触发点（`ConversationPanel.tsx:2614` finally）、队列宽度（单槽保持——多槽方向反转 `p000143`/`t000068`）、`detectUnproductiveDialogue` 阈值（`conversationState.ts:244-259`）、C2 语义、approval 的 `toolCallId` 精确配对（后续独立叶，本批仅补 epoch 递增一行）。

---

## 1. Global Constraints（每 Task 隐含）

- **ADR-012**：测批/修批/回归批三分离；本方案＝修批规划，未终审不改码。
- cwd `apps/desktop`；>60s 步骤中途报进度；命令串行（`playwright.config.ts` workers 本就 1；坑 p000114 并发假失败不适用）。
- Conventional Commits；lefthook→lint-staged；**禁 `--no-verify`**。凭据只引用占位符。
- 未决/坑/交接只经 handoff CLI 写 `.handoff/`；语义裁定正文进 `docs/decisions/`，其它只引编号。
- **Mac 为 L5 权威**，本批不碰 L5。
- **预存在红不在本批**：`t000069`（`cards:440`/`core:685`/`core:1859`）不得顺手改/关；闸门＝**不新增失败**（同次运行改后清单 ⊆ 改前，**不用历史数字**）。
- **基线 N≥3**（`u000010`/p000145）：L3 稳定红＝同命令串行 ≥3 次取交集（现仅 N=2，Task 0 补第 3 次）。`core:161` 第 4 稳定红、`#7-2`/`core:585`/`cards:1006`/`cards:1071`/`S4-3b:1223` flake——`core:161` 是否并入 `t000069` **另裁（§3-D4）**。
- **实证硬约束**：不改 flush 触发点（边缘 flush 多派发破 `retry:187`）；不做多槽（`p000143`）；回声**非丢弃**（丢＝误拒变停滞，回声驱动续跑）。
- 词表教训：整句锚定 + 条件/否定/问句排除（`agentLoop.ts:67-89` 现网）。
- **兼容性红线（第七轴 F-B）**：epoch 递增须覆盖**全部 `pending→'none'`**：`userDecided:171`、`approvalDecided:270`、`approvalGranted:323`、`clearPending`（`useConversationState.ts:86`——建议**新增领域函数** `clearPending(s)` 收敛该 renderer 直写，再叠递增）。

---

## 2. 已核实现状（直读源码，v4 锚点基）

- `send` opts 现仅 `{silent?,text?}`（`ConversationPanel.tsx:2425`）；单槽 `pendingSendRef=useRef('')`（`:758`），写点 `:2447`（排队）+ `:809`（第二写入口/对账直写），读点 `:2416-2420`（flush 仅回传 `{text}`）→ **echo/answer 标记今天丢失**。
- C2 路由块 `:2454-2482`：`if(!silent){ pendingKind… if(isConfirmIntent)confirm else reject(direction) }`；后接用户侧效应 `message_sent:2486`、`noteUserTextReply:2488`、气泡 `:2495`。**块内无 `isDecisionCardEcho`**（全仓零消费者，p000144/p000146）。
- **模型调用在 `!silent`/`else` 块之外**：公共尾 `:2500-2615`（`runChat :2604`、`finally flush :2614`），两分支汇流后抵达；silent 经 `:2517 role:'system'` 也驱动模型（`:810→:2604` 实证）→ **回声旁路用户块不伤续跑**。
- 按钮回声 `sendRef({text})` **8 站点**：`:3000/:3018/:3075/:3095/:3134/:3446/:3468/:3496`（含强制卡两按钮；`:3444` `onPlanConfirmed` 先于 send 落定决策）；`DECISION_CARD_ECHO` 仅 3 串。
- `userDecided:149-223`：`:171 pending:'none'`（无条件，不校验 point）、`:177` confirm 重置 rejectStreak、`:218` reject 累加、`:158-170` system_clarify 委派、`:209-211` approval 防御分支。
- `setPending:303-316` 只置 `pending:kind` + `notePendingSet`，**不触碰 rejectStreak、不递增任何代次**。
- `ConversationState`（`:111-126`）/`DecisionContent`（`:103-108`）**无 epoch/generation**（grep 确认）；`decision.requested`（`timeline.ts`）已带 `kind+decisionContent` 快照。
- 既有 rejectStreak 测试 `conversationState.test.ts:733-757`（`:748` goal-confirm @ `pending==='none'` 须重置为 0——F-A 关键约束）。
- `timeline.ts`：`TimelineEventType`（`:20-92`，本身即 union）、`domain` 枚举（`:96-110`，含 `conversation`）、`TIMELINE_EVENT_SPECS:116 = Record<TimelineEventType,…>`（加成员强制双写，F-D）。

---

## 3. 决策表（已定 D + 待终审 §3-D*）

| 编号 | 决策 | 依据 |
|---|---|---|
| **D1** | 保留 C2（不废止、不改 `intent-design:215`），**不取代** `ADR-001`/`ADR-006` | 第五轴 R1/R2 + 第六轴降级；用户 Q1 |
| **D2** | 回声用显式 `opts.echo` 标记，**弃串表作主判据**（`isDecisionCardEcho` 降兜底）；回声整体退用户通道（退 C2+message_sent+noteUserTextReply），仍续跑 | 六轴 F0/p000146 + 七轴 F-E |
| **D3** | `decisionEpoch` 递增绑**全部 `pending→'none'`**；`setPending` 不递增；应用点 `isAnswerToCurrent` 归属门 | `ADR-001` + 四轴 C3 + 七轴 F-B |
| **D4** | 控件守卫加 `s.pending!=='none'` 前置 | 七轴 F-A（护 `:748`） |
| **D5** | 队列载荷改 `{text, echo?, answer?}`，flush 恢复标记；**刀一与队列同批（Task 2）** | 七轴 F-E |
| **D6** | `stale_input_discarded` 加 `TimelineEventType` 成员 + `TIMELINE_EVENT_SPECS`（双写），**不扩 `domain` 枚举** | 七轴 F-D |
| **D7** | 落地 `d000008`：删 `:809` 第二写入口，对账引导统一经 `send`/队列；同批改 `sendRef` 类型 `:458`（破四轴 F4 自锁） | 四轴 F4/F3 + d000008 |
| **D8** | ③ 迟到引导作废 + **退还 `evidenceGuideCountRef`**（`:802` 先自增者回退，`:804` maxGuides 前） | 四轴 C2（否则削不变量 4） |
| **D9** | 不新增打字拒绝词表（无 `isDeclineIntent`） | 用户 Q2（C2 保留已承载"打字取消＝direction pivot"） |
| **D10** | `isQuestionLike` 问句不判方向拒——**纳入本批**（第八轴 §3 锁定：问句≠改变意图；冻结反更强，不复活 v1-D1；无附加冻结层） | 八轴 §3；撤销＝删一处 `&& !isQuestionLike(text)` |
| **§3-D1**〔**已裁·第八轴 §1**〕 | 回声可见性＝**保留气泡 + `role:'user'`，仅退 C2/`message_sent`/`noteUserTextReply`**（领域：回声属"决策的文本化投递"用户发起，≠ ADR-013 机器 silent）。备选"完全 silent"**否**——翻转 ≥4 契约（`forcedClarify:48`/`:66`、`core.interaction:818`、`factory.self:46`），v3/v4 初稿仅计 T-FORCE-2 系低估 | 八轴 §1 |
| **§3-D2**〔**已裁·第八轴 §2**〕 | 本批仅：clearPending 从 renderer 直写**收敛为领域函数**（清 `pending+decisionContent+lastRejectReason`，叠 `decisionEpoch+1`，对齐 `:171/:270/:280`）。**allow 同步化（走 `approvalDecided({confirm:true})`）另开叶因批 t000073**（β 真身＝plan→resolution，approval 族＝叶因 α 已裁另批；不碰 main 执行层＝不越界 §5） | 八轴 §2 |
| **§3-D3（终审）** | 跨任务/换目标：依赖 D3 递增自然隔断，**不额外加 task-gen 维度** | YAGNI |
| **§3-D4**〔**已裁·第八轴 §4**〕 | `core:161` 经 handoff CLI **并入 `t000069`＝第 4 稳定红**（N=2 交集已证，Task0 补第 3 次达 N≥3）；flake 名单单列 | 八轴 §4 |

---

## 4. 领域契约变更（执行清单）

| 载体 | 变更 | 锚点 |
|---|---|---|
| `ConversationState.decisionEpoch: number`（init 0） | 新增字段 | `conversationState.ts:111-126`/`:128-141` |
| `setPending`（`:303`） | **不递增**（重提议＝延续） | 保 `:733-757` |
| `userDecided`（`:149`） | 首行守卫（D4）；`:222 return` 前 `next.decisionEpoch=s.decisionEpoch+1`（confirm/reject/approval 分支皆叠） | `:171/:177/:218` 计数逻辑不动 |
| `approvalDecided`（`:262`）/`approvalGranted`（`:320`） | 各 `pending:'none'` 处（`:270`/`:323`）`decisionEpoch+1` | D3/F-B |
| `clearPending` | 新增领域 `export function clearPending(s)={...s, pending:'none', decisionContent:undefined, lastRejectReason:undefined, decisionEpoch:s.decisionEpoch+1}`（对齐 `:171/:270/:280`——**八轴 §2**：现 `useConversationState.ts:86` 直写只清 pending，漏 decisionContent/lastRejectReason）；`:86` 改调 | F-B/§3-D2 |
| `DecisionAnswer` + `isAnswerToCurrent` | 新导出：`isAnswerToCurrent(a,s)=a.epoch===s.decisionEpoch && a.kind===s.pending` | — |
| `renderSendOpts` | `send` opts + `echo?:boolean; answer?:DecisionAnswer`（`:2425`）；`sendRef` 类型 `:458` 同批 | D7 |
| `TimelineEventType` + `TIMELINE_EVENT_SPECS` | 加 `conversation.stale_input_discarded` 成员 + spec `{domain:'conversation',role:'system',detailKeys:['kind','?wantEpoch','?curEpoch']}` | D6/F-D |

---

## 5. 文件结构（改动落位·精确行锚）

| 文件 | 职责 | Task |
|---|---|---|
| `src/domain/conversationState.ts` | `decisionEpoch` 字段 + `initialState` + `setPending` 不递增 + `userDecided`/`approvalDecided`/`approvalGranted` 递增 + 新 `clearPending` 领域函数 + `DecisionAnswer`/`isAnswerToCurrent` | 1 |
| `src/renderer/useConversationState.ts` | `:86 clearPending` 改调领域函数；`transition/confirm/reject`（`:40-69`）透传无逻辑改 | 1 |
| `src/renderer/ConversationPanel.tsx` | `send` opts `echo/answer`（`:2425`）+ `sendRef:458`；队列载荷（`:758/:2416-2420/:2447/:809`）；路由块（`:2454-2498`）回声旁路 + 归属门 + 问句旁路；回声 8 站点打标；`:802/804` 退还；`:809` D7 删除 | 2,3 |
| `src/domain/timeline.ts` | `stale_input_discarded` union+spec | 3 |
| `src/domain/agentLoop.ts` | `isDecisionCardEcho` 保留兜底；**不新增 `isDeclineIntent`** | — |
| `tests/unit/conversationState.test.ts` | epoch 全转换递增、`isAnswerToCurrent`、控件守卫（含 `pending==='none'` 放行 goal-confirm）、**保 `:733-757`** | 1 |
| `tests/unit/timelineEvents.test.ts` | `stale_input_discarded` 三段式（照 `completion.evidence_missing` 模板 `:261-283`） | 3 |
| `tests/interaction/cards-from-decision-content.interaction.ts` | **S7-1/S7-2/#7-1 不变**；新增 **T-ECHO-1/2**（8 站点含 `确认，继续`/`已解决，谢谢`/队列回声）、**T-BOUND-1**（manualEmit 交错，真迟到新意图）、**T-STALE-1**（补 write 轮使 resolution 卡弹出） | 2,3 |
| `docs/decisions/014-*.md`（已随各轴修订）/`000-decision-log.md`/`docs/tests/coverage-matrix.md` | 规范/矩阵 | 4 |
| `.handoff/`（经 CLI） | `t000071` 收口、新批 | 4 |

**独占区**（串行勿并行）：`ConversationPanel.tsx`——Task 2 碰路由块 `:2454-2498` + 队列 `:758/:2416-2420/:2447/:809` + 8 站点 `:3000-3496` + `send`/`sendRef` `:2425/:458`；Task 3 碰 `:801-818`（退还）+ `send` 顶守卫 + timeline。

---

## Task 1 · 领域层：`decisionEpoch` + 控件守卫（纯函数·L1）

**Files**：`conversationState.ts`（`:111-126`/`:128-141`/`:149`/`:262`/`:303`/`:320`）+ `useConversationState.ts:86` + `conversationState.test.ts`
- [ ] Step1 失败测试：
  - `setPending` 重提议 epoch **不**递增；`userDecided`(confirm/reject)、`approvalDecided`、`approvalGranted`、`clearPending` 各递增。
  - 守卫：`s.pending==='plan'` 时 `userDecided(s,'goal',…)`→原样返回；**`s.pending==='none'` 时 `userDecided(s,'goal',{confirm:true})`→仍执行、rejectStreak→0**（F-A）。
  - `isAnswerToCurrent({epoch:0,kind:'plan'}, s)` 真/假（s.decisionEpoch 0→1）。
  - **`:733-757` rejectStreak 既有断言全绿**。
- [ ] Step2 实现 §4：守卫式 `if (s.pending!=='none' && point!=='system_clarify' && point!==s.pending) return s`；递增绑**全部 `pending→'none'`**；新 `clearPending` 领域函数（§3-D2）；导出 `DecisionAnswer`/`isAnswerToCurrent`。
- [ ] Step3 Gate：L1 新增绿 + 既有不坏 + 双 tsc 0 错。

## Task 2 · 刀一 + 队列载荷（同批，F-E）

**Files**：`ConversationPanel.tsx`（`:2425/:458/:758/:2416-2420/:2447/:2454-2498/:809` + 8 站点）+ `cards-...interaction.ts`(T-ECHO/T-BOUND/T-STALE)
- [ ] Step1 结构：`send` 内 `const fromUser = !silent && !opts.echo`；C2 路由块（`:2454`）与 `message_sent`（`:2486`）/`noteUserTextReply`（`:2488`）改由 `fromUser` gate；回声按 §3-D1 推荐**保留气泡 `:2495` + `role:'user'`**（若终审改完全 silent，则一并 gate `:2517 role` 且翻转 T-FORCE-2）。
- [ ] Step2 队列载荷：`pendingSendRef: useRef<{text;echo?;answer?}|''>('')`；入队 `:2447` 写 `{text, echo:opts.echo, answer:{epoch:stateRef.current.decisionEpoch, kind:stateRef.current.pending}}`（**入队冻结当前代次**，仅 fromUser 且有 pending 时带 answer）；flush `:2420` `sendRef.current({text:p.text, echo:p.echo, answer:p.answer})`。
- [ ] Step3 8 站点：`sendRef.current({ text, echo: true })`。echo 仍达公共尾 `:2604` 续跑（无需额外改）。
- [ ] Step4 归属门：路由块内（C2 前）非 echo 且 `opts.answer` 存在 → `if(!isAnswerToCurrent(opts.answer,stateRef.current)){ tlog('conversation.stale_input_discarded',{kind:opts.answer.kind, wantEpoch:opts.answer.epoch, curEpoch:stateRef.current.decisionEpoch}); return }`；相符且非问句（D10）→ 照旧 C2。
- [ ] Step5 测试：T-ECHO-1（`确认，继续` 撞 resolution 活卡→不误拒/误确认）、T-ECHO-2（`已解决，谢谢`/`方案需要调整一下`/队列回声 `echo` 复活）、T-BOUND-1（manualEmit：卡 A 弹出→`sendChat`（working=true 确证入队，epoch k）→`emit[卡 B,done]`（k+1）→flush 时 k 答复作废）、T-STALE-1（补 write 轮使 resolution 卡真弹出）。断言 `unresolvedTextReplies` 不因回声增长。**S7-1/S7-2/#7-1 保持绿**。
- [ ] Gate：L1 新增绿 + 双 tsc（`:458` 与 `:2425` 同批改）+ L3 失败清单 ⊆ 改前。

## Task 3 · 刀三：D7 删第二写入口 + ③ 引导作废退还 + 新事件登记

**Files**：`ConversationPanel.tsx`（`:801-818/:809`）+ `timeline.ts` + `timelineEvents.test.ts`
- [ ] Step1 D7：删 `:809` 直写，改 `if(workingRef.current) pendingSendRef.current={text:nudge,echo:true}; else void sendRef.current({silent:true,text:nudge})`（统一经队列；grep `pendingSendRef` 命中数登记）。
- [ ] Step2 ③ 作废退还：`systemNudgeKind==='evidence'` 家族在归属门/迟到处置时 **`evidenceGuideCountRef.current--`**（`:802` 自增者回退，四轴 C2）。
- [ ] Step3 新事件（D6）：`timeline.ts` `TimelineEventType` 加成员 + `TIMELINE_EVENT_SPECS` 一条（双写，Record 强制）；`timelineEvents.test.ts` 照 `completion.evidence_missing` 模板加断言。
- [ ] Step4 交错定案（四轴 F5）：`system_nudge` vs `pending_set{resolution}` seq 顺序断言，**转红即停**。
- [ ] Gate：`S4-3b` 不因退还新增红；全链 ⊆ 改前。

## Task 4 · 全链验证 + 规范/矩阵/交接

- Step1 串行四命令贴新鲜输出。Step2 β 反向确认（证伪保护）：一次性 worktree 复算改前基线跑 T-ECHO-*/T-BOUND-1/T-STALE-1 取红，`git worktree remove`（**禁 `git stash`**，共享工作树）。Step3 `coverage-matrix.md` 新增映射，`S7-1` 标「领域正确·不翻转」。Step4 handoff CLI 收口 `t000071`、新批登记；不 commit/push（需授权）。

---

## 6. DoD 断言矩阵（闸门＝不新增失败）

| # | 断言 | 判定 |
|---|---|---|
| A1 | 8 站点回声皆不改动任何决策点，**含 busy 期经队列回声**（D5） | T-ECHO-1/2 绿 |
| A2 | 代次相符的真新意图**仍走 C2 方向拒** | **S7-1 保持绿** |
| A3 | 回声不推高 `unresolvedTextReplies`（T2 不被污染） | L1/L3 |
| A4 | 代次不符答复作废 + `conversation.stale_input_discarded`，不 confirm 当前卡 | T-BOUND-1/T-STALE-1 绿 |
| A5 | `setPending` 不递增；**全部 `pending→'none'`（含 approval 族/clearPending）递增** | L1 绿（F-B） |
| A6 | 有活 pending 时点旧卡不清（守卫）；`pending==='none'` 时 goal-confirm 仍重置 | L1 绿（F-A，护 `:748`） |
| A7 | `:733-757` rejectStreak 既有断言不坏 | L1 绿 |
| A8 | ③ 丢弃退还 `evidenceGuideCountRef`（不变量 4 不削） | `S4-3b` 不新增红 |
| A9 | `:809` 第二写入口删除；`sendRef:458` 类型含 `echo/answer`；`stale_input_discarded` union+spec 双写 | grep + 双 tsc |
| A10 | 全链不新增失败；**L3 改后清单 ⊆ 改前同次运行**（基线 N≥3 交集，非历史数字） | §6 逐字表 |

## 7. 影响 / 风险 / 回滚

- **零领域契约扰动**：不废 C2、不动不变量 1 路由、不改 `ADR-001/006`（即便废 C2，三契约机制亦不受伤——六轴降级，故属"零风险"非"避炸"）。
- **回滚**：Task 1-3 顺序 commit，`git revert` 该链；取证＝A10 改前/改后清单 + Task 4 红→绿对照表；`ADR-014` status 相应改。
- **残留**：① C2 coarse 尾巴（「等下」类非意图文本仍判方向拒；问句式改意图「改成 X 行吗」被 isQuestionLike 豁免不 pivot）——epoch 门 + `rejectStreak` 上限 + 按钮路径兜底，判可接受（YAGNI，八轴 §3）。② 单槽 last-write 覆写（用户文本 vs 回声/nudge 争一槽）——本批不扩队列（`p000143`），列已知限制。③ 回声可见性＝**已裁保留气泡+退计数**（§3-D1，八轴 §1）。④ **approval「允许」异步旁路**＝即存不变量 1 违例（`approveToolCall` 不走领域、靠 effect 清 pending），**非 β 真身**（β＝plan→resolution）→ 另开**叶因批 t000073**（八轴 §2/§6）。

## 8. 明确不做（本批范围外）

废 C2 / 翻转 S7-1 / 新增拒绝词表 / 多槽队列 / 边缘 flush / **approval「允许」同步领域化（叶因批 t000073）** / approval `toolCallId` 精确配对（后续独立叶）/ L5 基线（Mac 权威，另批）。

## 9. 用户令「待裁决项按领域模型驱动适配」——已裁定 + 剩余 gate

**已由领域模型自裁（不再逐条问）**：
- §3-D1 回声可见性 → **保留气泡 + `role:'user'`，退 C2/`message_sent`/`noteUserTextReply`**（八轴 §1）。
- §3-D2 clearPending → **本批仅领域函数化收敛 + 叠 epoch + 清 decisionContent/lastRejectReason**；allow 同步化 → **另批 t000073**（八轴 §2）。
- D10 问句旁路 → **纳入，无附加冻结层**（八轴 §3）。
- §3-D4 基线 → **`core:161` 并入 `t000069`＝第 4 稳定红；N≥3 硬门槛**（八轴 §4）。

**仍需用户显式 gate（非领域可裁）**：
1. **ADR-014 + ADR-015 + v4 定稿点头** → 授权另开修批（Task 1 领域层可先行；刀一 Task 2 须与队列同批；刀二落 S1 领域层按 ADR-015 新签名）。**注**：第八轴后确认 β＝真·模型缺陷（`design-research:58/:75`），故 `decisionEpoch` 升为 ADR-015 领域概念（决策点实例寻址取代 kind 寻址）；模型原稿落稿见 `docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`，**待第九轴证伪其立论**（kind 守卫能否已挡同 kind 迟到确认——若能，ADR-015 降级 rejected、v4 退回 renderer 影子代次）。
2. **push 授权**（ahead origin 20 + 本会话 docs）——领域适配不覆盖共享状态变更，须显式 OK。
