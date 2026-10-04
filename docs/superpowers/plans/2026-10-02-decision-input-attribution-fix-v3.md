# β（决策点答复归属）修法完整方案 · v3

> ⚠️ **已被 v4 取代（`2026-10-02-decision-input-attribution-fix-v4.md`）——勿据本 v3 改码。v4 综合第七轴对 v3 的证伪（控件守卫加 `pending!=='none'` 前置、epoch 递增扩至全部 `pending→none`、Task2+3 队列回声同批、timeline 双写、detect 锚点更正），把 v3 的增量修补重铸为自顶向下完整方案。本文留历史链（其内已含七轴就地修订注记）。**

> **For agentic workers:** 逐 Task 实现，Task 间设 review 闸。**本文取代 v1（`2026-10-01-decision-epoch-binding-fix.md`）与 v2（`2026-10-02-decision-input-attribution-fix-v2.md`）——二者为历史链，勿据其改码。** 领域裁定见 **ADR-014**（`docs/decisions/014-decision-input-attribution-binding.md`）。**本方案属"另开修批"的规划，ADR-014 终审前不得据此改产品码（ADR-012）。**
>
> 依据轴：四轴（技术/治理/因果/外部）`plan-review-decision-epoch-binding-2026-10-01.md` · 第五轴（领域忠实）`ddd-model-review-decision-epoch-binding-2026-10-02.md` · 第六轴（证伪第五轴自身）`independent-audit-v2-and-fifth-axis-2026-10-02.md`。

**Goal**：让「对某决策点做出的答复」只作用于它被写就的那个决策点；**并把产品按钮自发回声整体移出用户输入通道**（既不退 C2 误杀，也不虚增无进展计数）。C2（新意图文本→方向拒）作为领域 `intent-design:215` 规定的路由**保留**。

**Architecture（三刀同一因，六轴收敛后定形）**：
- **刀一·回声归非用户通道**（主刀·零领域契约风险）：给 `send` 加显式来源标记 `echo`，8 个按钮回声站点打标；路由对 echo **整体旁路用户侧效应**——不进 C2 分类、不写 `conversation.message_sent`、不调 `noteUserTextReply`（否则污染 T2 `unresolvedTextReplies`）。回声仍驱动一次续跑轮（确认后模型需继续）。
- **刀二·代次归属门**（域精化）：领域新增 `decisionEpoch`，**换代只绑用户决策**（`userDecided` 落定 +1；`setPending` 重提议永不 +1——对齐 `ADR-001` 延续语义）；应用点校验 `answer.epoch===decisionEpoch`，不符 → 作废 + 可见事件。解 β 第二形态（真·迟到新意图撞活卡）。
- **刀三·控件守卫**（域忠实·一行）：`userDecided` 校验 `point===s.pending`——把"点旧卡清当前 pending"拉回不变量 1+7（会话级单一 PENDING）。

**不动**：flush 触发点（`ConversationPanel.tsx:2614` finally）、队列宽度（单槽保持——多槽方向反转，`p000143`/`t000068`）、`detectUnproductiveDialogue` 阈值。

**Tech Stack**：TypeScript（双 tsconfig renderer+main）、React 18（renderer ref 单源）、Vitest（L1）、Playwright `--project=interaction`（L3：vite dev + MockBridge，含 `manualEmit`）、lefthook→lint-staged。

---

## 0. Global Constraints（每 Task 隐含）

- **ADR-012**：测批/修批/回归批三分离；本方案＝修批规划，未终审不改码。
- cwd `apps/desktop`；>60s 步骤中途报进度；命令串行（坑 p000114 L3 并发假失败；但 `playwright.config.ts` workers 本就 1）。
- Conventional Commits；lefthook→lint-staged；**禁 `--no-verify`**。凭据只引用占位符。
- 未决/坑/交接只经 handoff CLI 写 `.handoff/`；语义裁定正文进 `docs/decisions/`，其它文档只引编号。
- **Mac 为 L5 权威**；本批不碰 L5 基线。
- **预存在红不在本批**：`t000069` 三例（`cards:440`/`core:685`/`core:1859`）本批**不得顺手改/关**；闸门口径＝**不新增失败**（同次运行内改后清单 ⊆ 改前清单，**不用历史数字**）。
- **基线 N≥3**：L3 稳定红集合须同命令串行跑 ≥3 次取交集（`u000010`/p000145；现仅 N=2，Task 0 补第 3 次）。`core:161` 为第 4 稳定红、`#7-2`/`core:585`/`cards:1006`/`cards:1071`/`S4-3b:1223` 为 flake——`core:161` 是否并入 `t000069` **另裁（终审 §14.4）**。
- **实证硬约束**：不改 flush 触发点（上批边缘 flush 多派发一回合破 `retry:187`）；不做多槽（`p000143`）；回声**非丢弃**（丢弃＝误拒变停滞，回声驱动续跑）。
- 词表教训：整句锚定 + 条件/否定/问句排除（`agentLoop.ts:67-89` 现网）。

## 0.1 落位前提（第六/七轴新增，v1/v2 未纳）

1. **`send` opts 现仅 `{ silent?, text? }`（`:2425`），单槽队列 `pendingSendRef` 现仅存 `string`（`:758`/`:2416-2420`）** ⇒ `echo` 与 `answer` 必须**入队列载荷**（`{ text, echo?, answer? }`），flush（`:2420`）须**恢复**这两标记——否则迟到即丢标记、门失效。**（第七轴 F-E：故刀一完备性依赖队列载荷——Task 2 单独先上，busy 期回声仍经队列 `:2447→:2420` 复活为用户通道、β 留活口；Task 2 队列活口须 Task 3 闭合，或二 Task 同批。）**
2. **按钮回声实为 8 站点**（`:3000/:3018/:3075/:3095/:3134/:3446/:3468/:3496`），`DECISION_CARD_ECHO` 串表仅覆盖 3 串（漏 `方案需要调整一下`/`已解决，谢谢`/`确认，继续`/`方案需要调整`）⇒ **弃串表作主判据**，用显式 `echo` 标记（robust，去脆弱枚举）；`isDecisionCardEcho` 降为兜底。
3. **回声现走 `!silent` 块 → 经 `message_sent`（`:2486`）+ `noteUserTextReply`（`:2488`）虚增 `unresolvedTextReplies`**，喂 `detectUnproductiveDialogue`（定义 `conversationState.ts:244-259`，调用点 `ConversationPanel.tsx:2148`——**第七轴 F-C 更正锚点，`:2452-2457` 是 send 内 `console.log`+`if(!silent)` 非该函数**）⇒ 回声须整体退用户通道，不止退 C2。
4. **模型调用在 `!silent`/`else` 块之外**（公共尾 `:2500-2615`：`runChat :2604`、`finally flush :2614`）——把回声旁路出用户块**不会误伤续跑**（第七轴 F 证伪已排除）。但 `role: silent?'system':'user'`（`:2512/:2517`）仍以 `silent` 判：§14.2 若定"完全退通道"须一并 gate `role`；定"保留可见退计数"则 `role='user'` 保持（气泡留、T-FORCE-2 不破）。

---

## 1. 领域契约变更清单（ADR-014 已裁，执行=落地）

| 载体 | 变更 | 锚点 |
|---|---|---|
| `ConversationState.decisionEpoch: number`（initial 0） | **新增字段**（现无 epoch/generation，grep 确认） | `conversationState.ts:111-126`/`:128-141` |
| `setPending`（`:302-316`） | **不递增 epoch**（重提议＝同决策点延续）；仅 `notePendingSet` 维持现状 | 保持单测 `:733-757` 不坏 |
| `userDecided`（`:148-223`） | ① 首行加守卫 `if (s.pending !== 'none' && point !== 'system_clarify' && point !== s.pending) return s`（**第七轴 F-A**：`pending==='none'` 前置，保 `:748` goal-confirm 任务边界重置不被挡）② 落定（confirm/reject 处理后）`next.decisionEpoch = s.decisionEpoch + 1` | 计数 `:218`、重置 `:177`、清零 `:173-174` 不动 |
| **所有 `pending→'none'` 转换递增 epoch**（**第七轴 F-B**） | `userDecided:171`、`approvalDecided:270`、`approvalGranted:323`、`clearPending`（`useConversationState.ts:86`——宜先收敛为领域函数）各 `+1`；否则 approval 族重开合同 `setPending('approval')` 复用同 epoch → 迟到 `{epoch,kind:'approval'}` 误命中新授权卡 | `setPending` 仍**不**递增（对齐 `ADR-001`，不破 A5/A7） |
| `DecisionAnswer` 类型 + `isAnswerToCurrent` | 纯函数：`answer.epoch===s.decisionEpoch && answer.kind===s.pending` | 新导出（`conversationState.ts`） |
| `renderSendOpts` | `send` opts 扩 `{ echo?: boolean; answer?: DecisionAnswer }` | `ConversationPanel.tsx:2425`/`sendRef` 类型 `:458` |
| `TimelineEventType` 加 `conversation.stale_input_discarded`（**第七轴 F-D**：不扩 `domain` 枚举成员——`conversation` 已在；但**须加 `TimelineEventType` 成员 + `TIMELINE_EVENT_SPECS:116` 一条**，`Record<TimelineEventType,…>` 强制双写否则 tsc 报错） | 三步登记 | `timeline.ts:19-92`/`:116-123` |

> **兼容性红线**：`userDecided` 是 `confirm`/`reject` 与兼容壳 `userConfirmed`/`userRejected`（`:285-300`）的共同落点；守卫与 epoch 递增须对**所有经 userDecided 的决策**一致生效（按钮、C2 文本、approval 委派 system_clarify）。**（第七轴 F-B）** 除 userDecided 外，`approvalDecided:270`、`approvalGranted:323`、`clearPending`（`useConversationState.ts:86`→`ConversationPanel.tsx:325`）也清 `pending→'none'`，**必须各叠 `decisionEpoch+1`**（否则授权族重开合同复用同 epoch → 迟到 `{kind:'approval'}` 误命中新授权卡）；本批只补**递增**这一机械动作，approval 的 `toolCallId` 精确配对仍留后续独立叶（用 `answersCurrent` 覆盖同族风险）。

---

## 2. 文件结构（改动落位·精确行锚点取自本次直读）

| 文件 | 职责 | Task |
|---|---|---|
| `src/domain/conversationState.ts` | `decisionEpoch` 字段 + `initialState` + `setPending` 不递增 + `userDecided` 守卫&递增 + `DecisionAnswer`/`isAnswerToCurrent` | 1,2 |
| `src/renderer/useConversationState.ts` | `transition`/`confirm`/`reject`（`:40-69`）——透传，无逻辑改（决策仍走 userDecided） | 1（只读确认） |
| `src/renderer/ConversationPanel.tsx` | `send` opts 扩 `echo/answer`（`:2425`）+ `sendRef` 类型 `:458`；单槽载荷（`:758`/`:2416-2420`/`:2447`）；C2 路由块（`:2454-2482`）回声旁路 + 归属门；回声站点打标（`:3000/3018/3075/3095/3134/3446/3468/3496`）；`evidenceGuideCountRef` 退还 + `:809` 直写槽删除（D7）；system_nudge 打点分叉（`:2486-2498`） | 1,2,3,4 |
| `src/domain/timeline.ts` | `conversation.stale_input_discarded` 登记（union + spec） | 4 |
| `src/domain/agentLoop.ts` | `isDecisionCardEcho` 降兜底（不删，供 `:809` 删除后回归兜底）；**不新增 `isDeclineIntent`**（Q2） | — |
| `tests/unit/conversationState.test.ts` | epoch 语义（setPending 不递增 / userDecided 递增）、`isAnswerToCurrent`、控件守卫；**保持 `:733-757`** | 1,2 |
| `tests/unit/agentLoop.test.ts` | 回声旁路判据（若抽纯函数）；`isConfirmIntent`/`isQuestionLike` 现有不坏 | 1 |
| `tests/unit/timelineEvents.test.ts` | `stale_input_discarded` 三段式（照 `:261-283` completion.evidence_missing 模板） | 4 |
| `tests/interaction/cards-from-decision-content.interaction.ts` | **S7-1/S7-2/#7-1 保持不变**；新增 **T-ECHO-***（8 站点回声不误伤）+ **T-BOUND-1**（manualEmit 交错，真迟到新意图）+ **T-STALE-1**（补 write 轮使 resolution 卡弹出） | 2,3,4 |
| `docs/decisions/014-*.md`（已成）/ `000-decision-log.md`（已加 014）/ `docs/tests/coverage-matrix.md` | 规范/矩阵 | 5 |
| `.handoff/`（经 CLI） | `t000071` 收口、新批状态 | 5 |

**独占区**（串行勿并行）：`ConversationPanel.tsx` 各区——T2 路由块 `:2454-2482` + 打点分叉 `:2486-2498`；T3 队列 `:758/:2416-2421/:2447` + 站点打标 `:3000-3496` + `send`/`sendRef` `:2425/:458`；T4 `:801-818` + `send` 顶迟到守卫。

---

## Task 0 · 取改前基线（**不改码**）

- Step1 串行：`npx vitest run` → 双 `tsc --noEmit` → `npx playwright test --project=interaction` → `npx eslint .`。**同命令跑满 3 次**取 L3 稳定红交集（`u000010`）。
- Step2 逐字记 L1 passed/files、双 tsc 错数、L3 `N/M` 与**失败例 file:line 清单**（预期含 `t000069` 三例；`core:161` 若稳定红如实记，待 §14.4 裁）。
- Step3 证伪保护：`npx playwright test --project=interaction -g "S7-1"` → 现断言（打字换目标→卡消失）须**绿**（本批不翻转，A2 锚点）。
- Step4 Gate：基线取到（N≥3 交集）+ 工作树干净才进。**取不到 → 停并汇报。**

## Task 1 · 领域层：`decisionEpoch` + 控件守卫（纯函数·L1）

**Files**：`conversationState.ts`（`:111-126`/`:128-141`/`:148-223`/`:302-316`）+ `conversationState.test.ts`
- [ ] Step1 失败测试：
  - `setPending` 重提议（带新 content）**不递增** epoch；`userDecided` confirm/reject 后 epoch+1；**`approvalDecided:270` / `approvalGranted:323` / `clearPending` 亦递增 epoch**（第七轴 F-B）。
  - 控件守卫：`s.pending==='plan'` 时 `userDecided(s,'goal',{confirm:false,reason})` → 原样返回 `s`（pending 仍 'plan'、epoch 不变）。
  - **`s.pending==='none'` 时 goal-confirm（任务边界）仍执行、rejectStreak→0**（第七轴 F-A：守门 `pending!=='none'` 前置，护 `:748`）。
  - `isAnswerToCurrent({epoch:0,kind:'plan'}, s)` 真/假（s.decisionEpoch 0→1）。
  - **既有 `:733-757` rejectStreak 测试仍全绿**（setPending 不触 streak；守卫 `pending==='none'` 前置放行 goal-confirm）。
- [ ] Step2 实现上表 §1 领域变更；`DecisionAnswer`/`isAnswerToCurrent` 新导出。**守卫式 = `if (s.pending !== 'none' && point !== 'system_clarify' && point !== s.pending) return s`**（置于 system_clarify 委派 `:158-170` 之前）。递增：**每个 `pending→'none'` 转换点**各 `decisionEpoch+1`（`userDecided` confirm/reject 皆于 `:222 return next` 前叠，含 approval 分支 `:209-211`；`approvalDecided`/`approvalGranted`/`clearPending` 各叠一行）。`setPending` **不**叠。
- [ ] Step3 Gate：L1 新增绿 + 既有不坏 + 双 tsc 0 错。

## Task 2 · 刀一：回声整体退用户通道（主刀）

> **第七轴 F-E**：Task 2 单独先上＝**部分**修好——busy 期回声经 `shouldQueueWhileBusy`→`:2447` 排队、`flushPendingSend :2420` 现仅回传 `{text}` → 回声**复活为用户通道**、β 留活口。**须 Task 3 Step1 队列载荷（echo/answer 随 flush 恢复）闭合，或 Task 2+3 同批合入**再验 A1/A3。

**Files**：`ConversationPanel.tsx`（`:2425`/`:458`/`:2454-2498`/8 站点）+ `agentLoop.ts`（`isDecisionCardEcho` 兜底）+ interaction 新增 T-ECHO-*
- [ ] Step1 结构：`send` 内 `const fromUser = !silent && !opts.echo`；C2 路由块条件由 `if (!silent)`（`:2454`）改为 `if (fromUser)` 驱动 C2/confirm/reject 与 `message_sent`/`noteUserTextReply`；`echo` 与 `silent` 共走"系统/非用户侧"打点分叉（`:2486-2498`）。
- [ ] Step2 8 站点：`void sendRef.current({ text, echo: true })`。echo 仍执行后续**模型续跑轮**（保持现状语义：确认后模型继续——见 `:3429-3430` 注释「强制卡确认后必须续转」）。
- [ ] Step3 echo 打点：`tlog('conversation.system_nudge', { content, kind:'echo' })` 或（终审 §14.2 若否）保留 `message_sent` 但**排除 `noteUserTextReply`**。**可见性（T-FORCE-2）依 §14.2 定**——若改完全 silent，须同步改 T-FORCE-2 断言（另列契约翻转，非本批默认）。
- [ ] Step4 测试：T-ECHO-1（`确认，继续` 撞 resolution 活卡 → 卡不被拒/不误确认）；T-ECHO-2（`已解决，谢谢`/`方案需要调整一下` 同理）；断言 `unresolvedTextReplies` 不因回声增长（L1/L3 择一）。**S7-1/S7-2/#7-1 保持绿**。
- [ ] Gate：L1+双 tsc+L3 失败清单 ⊆ 改前。

## Task 3 · 刀二应用点：队列携带 + 归属门 + 第二写入口统一（D7）

**Files**：`ConversationPanel.tsx`（`:758`/`:2416-2421`/`:2447`/`:809`/路由块）
- [ ] Step1 队列载荷：`pendingSendRef: useRef<{text:string; echo?:boolean; answer?:DecisionAnswer}|''>('')`；入队（`:2447`）写 `{ text, echo:opts.echo, answer:{epoch:stateRef.current.decisionEpoch, kind:stateRef.current.pending} }`（**入队冻结当前代次**）；flush（`:2420`）`sendRef.current({ text:pending.text, echo:pending.echo, answer:pending.answer })`。
- [ ] Step2 `sendRef` 类型（`:458`）扩 `echo?/answer?`。
- [ ] Step3 归属门：路由块（C2 前）——非 echo 且 `opts.answer` 存在时，`if (!isAnswerToCurrent(opts.answer, stateRef.current)) { tlog('conversation.stale_input_discarded', {kind:opts.answer.kind, wantEpoch:opts.answer.epoch, curEpoch:stateRef.current.decisionEpoch}); return /* 不 confirm/reject、不进 C2 */ }`。相符 → 照旧 C2/confirm。
- [ ] Step4 D7：删 `:809` 直写槽特例，`if (workingRef.current) pendingSendRef.current={text:nudge,echo:true}; else void sendRef.current({silent:true,text:nudge})`——统一经队列；grep `pendingSendRef` 命中数登记。
- [ ] Gate：双 tsc（改槽类型 + sendRef 类型同批，破四轴 F4 自锁）+ L3。

## Task 4 · 刀三：③ 证据引导迟到作废 + 预算退还 + 新事件

**Files**：`ConversationPanel.tsx`（`:801-818`）+ `timeline.ts` + `timelineEvents.test.ts`
- [ ] Step1 新事件三段式：union `:19-92` 加 `conversation.stale_input_discarded`；spec `:116` 加 `{ domain:'conversation', role:'system', detailKeys:['kind','?wantEpoch','?curEpoch'] }`；`timelineEvents.test.ts` 照 completion.evidence_missing 模板加登记断言。
- [ ] Step2 ③ 迟到作废：`evidence` 家族（`systemNudgeKind==='evidence'`）在归属门处若代次不符/或 pending 已清 → 作废，**且退还 `evidenceGuideCountRef.current--`**（`:802` 先自增者回退，四轴 C2——否则削不变量 4）。
- [ ] Step3 交错定案（四轴 F5）：`system_nudge` vs `pending_set{resolution}` seq 顺序断言；**转红即停**。
- [ ] Gate：L3 `S4-3b` 不因退还新增红；全链 ⊆ 改前。

## Task 5 · 全链验证 + 规范/矩阵/交接（单一写入口）

- Step1 串行全链四命令；逐条贴**新鲜输出**。
- Step2 β 反向确认（证伪保护）：一次性 worktree 复算 `git worktree add /tmp/nf-beta-revert <改前基线>` 跑 T-ECHO-*/T-BOUND-1/T-STALE-1 取**红**，跑完 `git worktree remove`（**禁 `git stash`**——共享工作树）。红→绿对照表进 §6。
- Step3 `docs/tests/coverage-matrix.md`：新增 `T-ECHO-1/2 / T-BOUND-1 / T-STALE-1` → 映射「回声非用户通道」「代次归属」「迟到引导作废」；`S7-1` 标注「领域正确·不翻转」。
- Step4 handoff CLI：`t000071` 收口、新批登记；**不 commit/push**（push 需授权）。

---

## 6. DoD 断言矩阵（闸门＝不新增失败）

| # | 断言 | 判定 |
|---|---|---|
| A1 | 8 站点回声皆不改动任何决策点（confirm/reject 皆不触发）；**含 busy 期经队列回声**（依赖 Task 3 载荷，F-E） | T-ECHO-1/2 绿 |
| A2 | 代次相符的真新意图**仍走 C2 方向拒**（`intent-design:215`） | **S7-1 保持绿** |
| A3 | 回声不推高 `unresolvedTextReplies`（T2 不被回声污染） | L1/L3 断言 |
| A4 | 代次不符答复作废、发 `conversation.stale_input_discarded`、不 confirm 当前卡 | T-BOUND-1/T-STALE-1 绿 |
| A5 | `setPending` 重提议 epoch 不递增；**所有 `pending→'none'` 转换递增**（`userDecided` confirm/reject + `approvalDecided`/`approvalGranted`/`clearPending`） | L1 绿（对齐 `ADR-001`；F-B） |
| A6 | 控件点旧卡不清新 pending（`s.pending!=='none' ∧ point!==s.pending`→原样返回）；`pending==='none'` goal-confirm 仍执行 | L1 绿（不变量 1+7；F-A 护 `:748`） |
| A7 | `:733-757` rejectStreak 既有断言不坏 | L1 绿 |
| A8 | ③ 丢弃退还 `evidenceGuideCountRef`（不变量 4 不削） | `S4-3b` 不因此新增红 |
| A9 | `:809` 第二写入口删除（D7/d000008）；`sendRef` 类型含 `echo/answer` | grep + 双 tsc |
| A10 | 全链不新增失败：L1/双 tsc/eslint 干净；**L3 改后失败清单 ⊆ 改前同次运行**（清单对照，非历史数字；基线 N≥3 交集） | §6 逐字表 |

## 7. 影响 / 风险 / 回滚

- **降**：本批不废 C2、不动领域不变量 1 路由 → 无 `ADR-006`/`ADR-001`/`intent-design:215` 契约扰动（第六轴：即便废 C2，三契约机制亦不受伤，故此处属"零风险"而非"避炸"）。
- **残留**：① C2 coarse 尾巴（「等下」类非意图文本仍判方向拒）——epoch 门 + `rejectStreak` 上限 + 按钮路径兜底，判可接受（YAGNI）。② echo 可见性/通道（system_nudge vs message_sent）依 §14.2。③ 单槽 last-write 覆写（用户文本 vs 回声/nudge 争一槽）——本批不扩队列（`p000143`），列已知限制。
- **回滚**：本批 5 Task 顺序 commit；回滚＝`git revert` 该链（决策 `docs/decisions/014` status 相应改）。取证＝A10 改前/改后清单 + Task5 红→绿对照表。

## 14. 待终审（执行前须用户点头）

1. ADR-014 定稿（保留 C2 + 三刀口径 + 「确认非取代 ADR-001/006」）。
2. **回声通道定性**：完全走系统/silent（不进 `message_sent`/气泡）vs 保留可见仅退 `noteUserTextReply`——后者不破 T-FORCE-2 可见性，前者更干净但属契约变更（触 `ADR-013`/T-FORCE-2）。**默认推荐：保留可见、退 reply 计数**（最小契约面）。
3. `isQuestionLike` 问句不作方向拒——是否纳入本批（倾向纳入：领域 §215 限定"改变意图"，问句非新意图）。
4. `t000069` 并入 `core:161`（第 4 稳定红）与否 + N≥3 达标确认。
5. 修批完成后 push 授权（ahead origin 20 + 本会话 docs）。

## 15. 明确不做（本批范围外）

废 C2 / 翻转 S7-1 / 新增拒绝词表 / 多槽队列 / 边缘 flush / approval 侧 `toolCallId` 精确配对（后续独立叶）/ L5 基线更新（Mac 权威，另批）。
