# 方案独立审计：decision-epoch-binding-fix（β 修法 v1）

审计日期：2026-10-01 ｜ 对象：`docs/superpowers/plans/2026-10-01-decision-epoch-binding-fix.md`（v1）
审计方式：**四轴独立并行取证，互不通气**——A 技术事实与可编译性 ／ B 治理·规范·授权 ／ C 因果完整性与反证 ／ D 外部证据保真度。所有结论均由审计方或本会话**直读源码/规范**得出，引文行号已二次核对（发现两处漂移，见 P2）。

> **判定：v1 不可 copy-execute。GO-with-fixes。**
> 骨架（决策点代次 + 应用点校验 + 否 C2 + 可见打点）忠实于 RCA 与外部一手源，且域内改动可编译；但**三条 DoD 断言所依赖的测试构造被证伪**（改前即全绿／卡永不弹），**Task 3/4 存在自锁的编译依赖**，**同族危害有一条未被任何一刀覆盖（按钮通道）**，以及**根因表述本身需要收紧**（见 F0）。
> **可先行部分**：Task 1（域内代次）+ 控件守卫（F0/C1）不依赖上述缺陷，可作为最小安全单元；**Task 1+2 单独上线不安全**（见 F6）。

---

## 0. 审计方证据基线（fresh，非引用历史数字）

| 层 | 实测 | 说明 |
|---|---|---|
| L1 | **703 passed / 47 files / 0 failed** | 2026-10-01 00:41 |
| 双 tsc | **0 错**（`TSC-OK`） | `tsconfig.json` + `tsconfig.main.json` |
| L3 串行 run1 | **67 passed / 7 failed**（4.4m） | 计划期实测 |
| L3 串行 run2 | **68 passed / 6 failed**（4.1m） | 同一命令复跑 |

**关键：两次串行运行的失败清单不同。**

- 交集＝**稳定红 4 例**：`cards-from-decision-content:440`、`core.interaction:161`、`core.interaction:685`、`core.interaction:1859`
- 只红过一次（flake 名单 5 例）：`cards:738`(#7-2)、`cards:1071`(V1.5-S2-4b)、`core:585`(启动 A)、`cards:1006`(V1.5-S2-3)、`cards:1223`(S4-3b)

三条推论，直接改写计划的闸门：

1. `playwright.config.ts:15` 本就是 `workers: 1` ⇒ 上批出口的 **L3 71/3 与本轮 67/7 / 68/6 不可直接比较**，且红差**不是并发假失败**（坑 p000114 不适用）。src 自 `d402e4f`（RC1a）起零改动（`git log d402e4f..HEAD -- apps/desktop/src` 为空）。
2. `t000069` 登记的三例（`:440`/`core:685`/`core:1859`）**确认为稳定红**；`core:161`（信任阶梯 authorized 可回溯）是**新增的第 4 例稳定红**，未经用户裁决即存在于基线里 ⇒ 须 handoff CLI 显式并入 `t000069`（见 G5）。
3. 计划的 R8「两次取交集」方向正确但**不足**：Task 4 触碰的 `S4-3 / S4-3b / V1.5-S2-3` **三个全在 flake 名单里**，单次运行无法判回归 ⇒ 本批验证必须按「N 次运行的稳定红集合」判定，flake 单列（见 D-裁定表）。

---

## 1. P0 发现（阻断授权或阻断执行）

### F0 ★ 根因表述需收紧：β 的杀手文本是**产品自己的按钮回声**，且为其设计的豁免**从未接线**〔本会话直读核实；与 C 轴独立同结论〕

- 「确认，按方案执行」不是用户手打文本，而是**点「确认执行」按钮后产品自己发出的固定回声**：`ConversationPanel.tsx:3075`（`confirm('plan')` 之后 `void sendRef.current({ text: '确认，按方案执行' })`）；同类回声另有 `:3000`、`:3436-3438`、`:3486-3488`。
- commit `8210c14`（"decision-card echo **skips C2**; second evidence nudge…"）为此专门加了 `agentLoop.ts:56-65`：`DECISION_CARD_ECHO = ['确认，目标清楚了', '确认，按方案执行', '目标需要重新描述一下']` + `isDecisionCardEcho`，注释逐字写着「**迟到时不得走 C2 隐式拒/确认另一决策点**（UAT G-impatient：目标回声撞方案卡 → 误拒）」。
- 【源码事实】`grep -rn "isDecisionCardEcho\|DECISION_CARD_ECHO" src tests scripts-cdp` → **只有定义、零消费者**。豁免设计了、没接线。
- 后果：RCA 的因果链应从「用户在 busy 期打了一句迟到文本」收紧为「**产品自身回声进入用户文本通道，被分类为方向性拒绝**」。这解释了 β 在 UAT 的高复现率——**harness 每点一次按钮就生产一条杀手文本**（`uat-force2c.mjs:20`、`uat-force3.mjs:49` 等均点该按钮），与"用户是否插话"无关。
- 治理后果：AGENTS/ponytail 规则「**已存在就复用，别重写**」——v1 计划通篇未提这个 helper，直接新造 `decisionEpoch` 机制。新机制仍然需要（回声豁免只覆盖三个固定串，不覆盖用户迟到文本），但**计划必须补一条 wire-or-delete**，否则等于把一次已获授权但未落地的修复重新发明一遍，且留下双源。
- 修法建议进 v2：**Task 0.5**＝路由块加 `if (isDecisionCardEcho(text)) { /* 回声：不作答复、不拒卡，作普通消息进模型（D4 口径） */ }`（或把回声改走 silent——但 T-FORCE-2 断言气泡可见性，属契约变更，需裁）。此刀最小、命中 β 主要生产者，**应排在代次改造之前**，并重估 T-BOUND/T-STALE 的必要性顺序。

### C1 ★ 按钮通道同族危害，一刀未覆盖〔C 轴〕〔本会话核实〕

`conversationState.ts:149-171` 的 `userDecided(s, point, decision)` **不校验 `point === s.pending`**：`:171` 无条件 `pending: 'none'`。
⇒ 在 React 异步重渲染窗口内（`useConversationState.ts:40-49`：`transition` 同步写 `stateRef`，但 DOM 重渲染滞后），点击**旧卡**按钮会把**新**决策点清成 `none`——β 的危害经控件复现，`decisionEpoch` 只绑在文本上，管不到它。
⇒ v2 必加一行域守卫 + L1 断言：`if (point !== s.pending && point !== 'system_clarify') return s`（`system_clarify` 已在其上委派 underlying，`:158-170`，不受影响）。

### C2 ★ ③ 守卫烧掉引导预算却不派发〔C 轴〕

`ConversationPanel.tsx:802` `evidenceGuideCountRef.current++` 发生在**派发之前**；v1 的守卫在 `send` 入口丢弃引导，但**计数已消耗** ⇒ 下一次失败直撞 `maxGuides`（`:804`）⇒ 只剩 A-015 状态栏提示（`:814`）⇒ **模型永远不知道自己的完成声明被证据门推翻**，直接削弱不变量 4（假完成概率上升）。
⇒ v2 必加：丢弃时退还计数（或在 pending 清空后重发一轮）。旁证：本轮 flake 名单里 `S4-3b:1223`（"对账持续失败达引导上限 → 状态栏提示可见"）正是这条预算机制的测试。

### C3 ★ D2「同 kind 重提议一律 +1」会让队列里的确认语**永远落不了地**〔C 轴〕

若模型在等用户点卡期间**逐字重复**同一条 `propose_plan`（A-026 签名行为，`conversationState.ts:308-311` 注释即记着"重提议＝同一决策点延续"），每次都 +1 ⇒ 在途绑定每轮作废 ⇒ 用户即使打了确认词也会被降级成普通消息，**卡永远等不到文本确认**。
⇒ v2：只在 `kind` 变化或 `decisionContent` **实质不同**时递增（内容相等判据须写明，如 summary+files 的浅摘要比对）；且 014 必须**并立两种粒度**：决策点**实例**（epoch，换代）vs 决策点**延续**（streak，内容重复不改代次）。

### G1 ★ 撤销 C2 ＝ 契约语义变更，本身不在授权清单〔B 轴〕

`d000002`（`.handoff/decisions/`）：改设计/契约语义须**单独裁定、不夹带**。本批恰好达其门槛（β 实证 `uat-ghost-busy-remeasure:115` ＋ 外部零先例 `design-research...:§7.3`），达标声明应写进 ADR-014。
但计划 §14「需用户点头」只列了 4 项（S7-1 断言翻转 / 词表内容 / t000069 顺序 / push），**"废止 C2 归义"这一契约替换本身未点名**，仅隐含在 D1/D10 ⇒ 执行者拿到 S7-1 的点头就会顺带完成一次未点名的语义变更。
⇒ v2：§14 增设独立批准项，措辞含「批准 ADR-014 取代 `intent-confirmation-domain-design.md:215` 的 C2 归义，声明达 `d000002` 门槛」。

---

## 2. P1 发现（须在计划文本内修正）

### F1 T-BOUND-1 构造**不成立**——按现写法改前即全绿（测试无效）〔A 轴〕
三条独立否决理由，均已核实：
1. 卡挂起时 `working=false`（`shouldStopContinuation` 在 `ConversationPanel.tsx:1885` 阻断续跑；ADR-013.1「decision-pending 非 busy」）⇒ `sendChat` 走**现场直发**，`opts.answer===undefined` ⇒ `isAnswerToCurrent` 恒真，**根本不入队**——测试注释「working=true + pending='plan' → 入槽」为假。
2. `propose_plan` 之后的兄弟 `read` 被 A-017 的同轮挂起逻辑拦住不执行（`:376-379` 声明、`:887` 置位、`:1621` 强制）⇒ "只读工具撑 busy 窗口"失效。
3. 脚本项 B（第二个 `busyPlanRound`）由 **flush 的那次 send** 消费 ⇒ 应用点校验时当前仍是 A 的代次 ⇒ 绑定平凡通过。
⇒ v2 必改为 `manualEmit: true` 构造（选项真实存在：`mockBridge.ts:97,122,147,174,195`）：触发起一轮 → `emit([proposePlan(A)])` → 断言卡 A → `sendChat`（此时该轮未 done，working=true ⇒ **确证入队**）→ `emit([proposePlan(B), done])`；本轮收口 flush 时代次已 k→k+1。改前应红（A 的确认语把 B 确认掉）。**计划的硬规「不得弱化断言」同样适用于此——构造不成立即重写构造，不许改成别的断言蒙过去。**

### F2 T-STALE-1 的卡**永不弹**〔A 轴〕
脚本无 `write` 轮 ⇒ `producedFiles` 为空而 `plannedFiles={'/test/app.ts'}` ⇒ `verifyCompletion` 的 V1b 推 `diff:planned-not-produced` ⇒ 两次 `report_completion` 都过不了证据门 ⇒ 无 resolution 卡 ⇒ 断言的靶子不存在。
⇒ 现存绿例 S4-1b（`:248`）/S4-2（`:292`）/S4-3（`:345`）都插 `[[toolCall.write('/test/app.ts','x'), chunk.done()]]`——照此补 write 轮并后移脚本项。交错本身成立（`verifyThenResolve` 经 `:927` void 并行，verify#2 ~t+700ms < verify#1 t+1500ms）。

### F4 Task 3/4 自锁：Task 3 的 tsc 门过不去〔A 轴〕
改槽类型为 `{text, answer?}` 后，`:809` 的 `pendingSendRef.current = nudge`（字符串赋值）立即编译失败；而计划的独占区明令 Task 3 不得碰 `:804-810` ⇒ **依赖方向倒了**：删第二写入口（D7，Task 4 Step 5）必须先于/并入 Task 3。
⇒ v2 二选一：Task 3 顺带删 `:809`（把 D7 提前），或 3+4 合并。同时 F3：`sendRef` 声明在 `:458`（`useRef<(opts?: { silent?: boolean; text?: string }) => Promise<void>>`）**必须扩 `answer?`**——计划列的"6 处"漏了它，并把 `:2614`（调用点）误算作形状消费者。

### F5 Task 4 守卫 vs S4-3：两轴结论相反，**须执行期以顺序断言定案**
- A 轴：S4-3 的引导在 verify#1 失败时入槽，`:2614` 才 flush，届时续跑链已把卡弹起 ⇒ 守卫丢弃 ⇒ `conversation.system_nudge` 无日志 ⇒ S4-3 的 poll（`:370-380`）失败＝新红。
- C 轴：S4-3 的 chat5（第二次 report）必须由引导触发，引导派发时 pending 仍为 none ⇒ 守卫惰性 ⇒ 保持绿。
- 本会话读 `cards-from-decision-content.interaction.ts:321-397`：**两种交错都可达**，测试自身的注释 `:369` 写着「flush 可能晚于弹卡」并因此用 poll 容错 ⇒ 这不是纯逻辑可判的问题。
⇒ v2：Task 4 内加**顺序断言**（比较 `conversation.system_nudge` 与 `session.pending_set{resolution}` 的 seq）把交错钉死，并保留"转红即停并汇报"；不得用放宽 S4-3 断言的方式解决（那是拿别人的绿换自己的绿）。

### F6 Task 1+2 单独上线**不安全**（计划的 staging 隐含假设被否）〔C 轴〕
没有 Task 3，队列文本不带绑定 ⇒ `isAnswerToCurrent(undefined)=true` ⇒ 「行」/「确认」这类**确认词命中**的迟到文本会确认 flush 时那一张卡——β 的危害形态对确认侧完整存活（只是不再误拒）。⇒ 最小安全单元＝**Task 1+2+3**（外加 F0/C1），Task 4 可作独立后续刀。计划若被分批授权，必须以此划线。

### D1 拒绝词表的归属**超出 review 裁定**，与一手源相悖〔D 轴〕
- review §0（`:19`）与 §5 候选⓪（`:73`）明写「打字确认白名单留下，**打字拒绝去掉**」；计划 D1 却新增 `isDeclineIntent` 并归因「aider/deepcode/MCP 的共同形状」。
- 【源码事实】aider 词表 `["yes","no","skip","all"(,"don't")]`（`aider/io.py:831`，前缀匹配 `:893`），**miss → 报错重问**（`:874-898`，"Please answer with one of" `:897`）；deepcode-hkuds 精确词表 y/yes/a/always/n/no（`cli/tui/app.py:802-810`），**miss → 原样作新 turn（busy 时 "Queued — runs after the active turn" `:763/:782`），审批不动**（`:812-813`，dispatch `:946-953`）。两者都不把未识别文本映射为拒绝（此点 review §7.2 属实）。
- 但 review §7.1 亲自把 aider/deepcode 标注为**例外**：「阻塞式单提示 stdin……**无异步竞态窗口（我们没有这个条件）**」。计划引这两家为**异步队列里加打字拒绝**背书，与 review 自己的限定相悖。
- 【一手核对 MCP spec 2025-11-25 elicitation】accept/decline/cancel 三 action **全部由显式控件产生**（accept＝"explicitly approved and submitted"），**没有任何状态由文本语义识别产生**，且 cancel≠decline ⇒ 该先例精确否证 C2，但**同时否证"文本可以 Decline"**：正统实现是 review 的 ⓪（文本永不是答复）。
⇒ D1 可作产品选择（§14.2 已列，诚实），但必须：① 改写归属句（第三态才是收敛形；打字拒绝＝借用被 review 自标例外的阻塞式先例）；② §14.2 从"词表内容"升级为"**词表是否存在**"的独立裁决；③ 补「分歧与不采纳」表（上批计划有 §16，v1 没有）。

### G3 C2 废止的传播集缺 5 处〔B 轴〕
已覆盖：`design:215` 加指针不删原文（合规）、`:17` 声明、`conversationState.ts:168`/`:248-253` 注释。遗漏：
1. `docs/domain/06-domain-events.md:5`——事件目录为语义视图且明文"以注册表为准逐名登记" ⇒ 新事件 `conversation.stale_input_discarded` 未进计划 §2 文件表。
2. `docs/tests/coverage-matrix.md:107`——表 6 的 S5 行把「C2 隐式拒绝循环拦截」记为 ✅ 现行覆盖 ⇒ 014 后失效；Task 5 Step 4 只"新增行"不改此行。
3. `docs/decisions/006-goal-reconfirm.md:24`——「换目标的自由文本触发通道由现有 C2 分流承载」：C2 废止后条款悬空（#7-1 正依赖它；计划只断言 #7-1 转绿，未处置 ADR-006 文本）。
4. `conversationState.ts:306-310`——`setPending` 内注释（正是 Task 1 要改的函数），且与 C3 的粒度冲突同源。
5. 注释残留：`ConversationPanel.tsx:3456`、`agentLoop.ts:51-55/72`、`sysPromptConfirmWords.test.ts:3`、L3 `:571`/`:725`。
（历史 stage 审计 `stage-review-S7:16`、`stage-gate-S7:14/28`、S4/S5/S6 spec 行**不改写**＝正确姿态，但 014 Consequences 应点名"S7 P1-5 的 C2 落地被部分取代"。）

### G4 rejectStreak 的**重置侧**失去载体〔B 轴〕
ADR-001:17 + `design:303`：`rejectStreak`「随新提议重置」是经 C2（新意图 → reject → goal 边界）由应用层承载的。C2 撤销后，"用户新意图"不再产生任何决策事件 ⇒ **重置侧**（不只是累积侧）无机制。计划 D11 只谈累积阈值，未给替代。⇒ 014 需一节明述（例：goal 确认边界仍重置 / 词表与按钮 reject 保留重置 / 跨新意图的 streak 悬挂交 T2·T4 兜底）。

### G5 治理工件缺项〔B 轴〕
(a) **无回滚预案**——上批有整树回退先例（`d000009`）；须补「revert 本批 commits、证据留存」条款，尤其若 forced-clarify 回归不可达。
(b) 无「改后真机 β 是否仍现形」取证安排（§14 无 p063/池复跑行；3 把 solo 未复现见 `uat-ghost-busy-remeasure:82`）——留给回归批要明示。
(c) DoD → 产品条款映射缺（A3/A4 ↔ 设计 §3.4 等）。
(d) Task 0 把 `#7-2`/`core:161` 并入 `t000069`＝**扩充用户已裁工作项**，须经 handoff CLI 显式改写并列作转裁项（见 §0 表 2）。

### D9 内部漂移：事件名与载荷自相矛盾〔A 轴与 D 轴独立同报〕
§1 的 D9 声明载荷 `wantEpoch/curEpoch`，Task 4 实为 `detailKeys:['kind','pending','epoch']`；且 `kind: 'user_answer'` **永不发火**（用户文本按 D4 降级、既不发火也不丢弃）⇒ 事件叫 `stale_input_discarded` 而"用户输入"从不被 discard。⇒ 载荷字段对齐，并删 `user_answer` 或补其发火路径（若保留 D1，拒绝词表命中但因代次不符被拒时才是它该发火的时刻）。

---

## 3. P2（勘误，不动结论）

| # | 事实 | 位置 |
|---|---|---|
| a | S4-3 实为 `:321-397`（计划写 `:~490`；`:440` 是 S5-2） | `cards-from-decision-content.interaction.ts` |
| b | `#7-1` 实为 `:708-735`（计划写 `:712-735`） | 同上 |
| c | `workers: 1` 在 `playwright.config.ts:15`（计划写 `:14`） | — |
| d | forced-clarify 梯度实为 `ConversationPanel.tsx:2147-2192`（计划写 `:2140` 区） | — |
| e | **codex 证据行号漂移（本审计文档自身的 §7.1 也须订正）**：「查不到 → warn 丢弃」实在 `codex-rs/core/src/session/mod.rs:3441-3457`（`notify_approval`），非所引 `:3210-3257`（那是 `RequestUserInput` 的 `sub_id` 路径）。实质成立、行号错 | 竞品检出 |
| f | `tsconfig.json` **不含 `tests/`** ⇒ 双 tsc 从不校验新测试代码的类型；计划所称"双 tsc 兜底"对测试片段无效，只有运行时能验 | `apps/desktop/tsconfig.json` |
| g | reasonix / kilocode / goose / MCP elicitation / Horvitz 引文逐条一手复核 **PASS**（含 `reasonix prompt_identity.go:445-446,448-454,550,568-593`；`kilocode attached-state.ts:215,234,254,325,337,376`；`goose agent.rs:1593`） | — |
| h | 计划 §0/§1/D2/D3/D4/D9/Task 注释的**外部引文无捏造、无反向引用**；「~20 harness C2 零命中」为 review §7.3 双路结论的忠实转述（本轴独立复核 aider/deepcode/cline 三处 miss 处置后维持成立） | — |

---

## 4. 裁定与处置（v2 必改清单，按依赖排序）

0. **Task 0.5（新）＝接线 `isDecisionCardEcho`**（F0）：最小刀、命中 β 主要生产者、清偿 `8210c14` 未完成的授权；顺带决定回声是否改 silent（T-FORCE-2 可见性 → 若改则属契约变更，进 §14）。
1. **控件守卫**（C1）：`userDecided` 加 `point !== s.pending → return s` + L1 断言。
2. **D7 提前**（F4）：删 `:809` 第二写入口；**同批扩 `sendRef` 类型 `:458`**（F3）。
3. **代次粒度**（C3）：仅 kind/内容实质变化时 +1；014 并立「实例换代 / 内容延续」。
4. **测试构造重建**（F1/F2）：T-BOUND-1 改 `manualEmit` 交错；T-STALE-1 补 write 轮。
5. **预算退还**（C2）：③ 丢弃时 `evidenceGuideCountRef` 退还。
6. **交错定案**（F5）：Task 4 加 `system_nudge` vs `pending_set{resolution}` 的 seq 顺序断言；转红即停。
7. **归属与授权**（D1/G1）：改写 D1 归属句；§14 增设「C2 废止」与「拒绝词表存在性」两项独立批准；补「分歧与不采纳」表。
8. **闸门方法**（§0 表 3）：改「同命令 **N≥3** 次运行的稳定红集合」，flake 名单单列；`#7-2`/`core:161` 经 CLI 并入 `t000069`。
9. **传播集补全**（G3）＋ **rejectStreak 重置侧**（G4）＋ **回滚/取证/DoD 映射**（G5）＋ **D9 载荷对齐**＋ P2 勘误（含我 §7 的 codex 行号）。
10. **分批授权线**（F6）：最小安全单元＝Task 1+2+3（+0.5+控件守卫）；Task 4 可独立后续。

**不采纳的审计意见（如实记录）**：
- C 轴「⓪ 对 β 是冗余、可只保留代次绑定」——不采纳：F0 显示杀手文本主要是产品回声，回声词表命中与否**由不得用户**；只留绑定的话，回声在换代后仍会走"降级为普通消息"，与 D4 一致但少了 ⓪ 带来的"任意文本不再误杀卡"这层保护。两刀都要，且 ⓪ 有独立外部依据（review §7.3 零命中）。
- A 轴建议把 approval 文本批准守卫改由 `toolCallId` 精确配对——本批不做（v1 §15 已列后续独立叶），理由：β 未证 approval 侧，且引入 id 需动 `useToolApproval` 契约；本批先用 `answersCurrent` 覆盖同族风险。**这条与 A 轴无分歧（它只是列为后续），保留原判断。**

## 5. 与上批审计的格式对照（可复核）

沿用 `docs/audits/plan-review-ghost-busy-deadletter-2026-10-01.md` 的做法：判定前置、审计方自有证据基线、分级 findings 带 `文件:行`、分歧与不采纳单列、必改清单按依赖排序。差异：本批多一条**根因修订**（F0，属对 RCA 的追加而非对计划的否定）与一条**基线方法论修订**（§0 表，N 次运行取稳定红）。
