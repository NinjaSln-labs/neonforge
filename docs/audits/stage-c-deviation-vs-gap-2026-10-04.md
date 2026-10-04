# 阶 C 前置：实现偏离 vs 模型空白（分家表）＋驱动拓扑外部佐证

日期：2026-10-04 ｜ 触发：S7-1/#7-1 族定层「确认轮归属无权威」后的拓扑分析——用户裁**「那就是实现偏差了」**，据此必须把"照原文纠偏即可"与"必须新增模型"分开，两批的成本、审批门槛、顺序依赖都不同。
关系：`docs/audits/stage-c-precheck-confirm-round-ownership-2026-10-03.md`（§4 原三条落点，本文件重述其性质）｜ `docs/decisions/019-*.md`（拓扑裁定 ADR）｜ `docs/product/00-product-design.md` §4.5（C1–C12 契约）｜ 外部对标证据 `conversation-etiquette-benchmark-2026-10-04.md`。
本文件**不改实现**，只出分家表与判据。

---

## 0 结论前置

1. **当前驱动拓扑＝实现偏离，但不是全部。** 本机抽验的 8 家 CLI/桌面 agent ＋ OpenHands 后端中，**无一家在同一回合序列内允许多条自推进链并发在飞**；一致形态是「意图入队/注入 → 单一仲裁点在回合边界决定下一轮」。**框架段已降级**（四轴审计的外部证据保真度轴否证原引法）：LangGraph 的 channel 单写者规则管的是"一次图执行内并行分支在同一超步 fan-in 写 state"，与"用户在回合未完时又提交"**不同构**——该问题的正名是 **double texting**，而 LangGraph 给的是**可选策略**（Enqueue 默认／Reject／Interrupt／Rollback），不是硬约束，且明写"not available in the LangGraph open source framework"；AutoGen v0.4 的 actor 说法为真，但"每 actor 串行处理 mailbox／状态单一所有者"**无原文支撑**（官方反把 Concurrent Agents 列为 Core 设计模式），且 `arXiv:2308.08155` 属 v0.1 对话驱动架构＝**版本错绑**，只可作"状态封装在单一所有者"的软证据。
2. **但纠偏的措辞必须精确**：不是"消除抢占/禁止代次作废"——Codex 恰恰用 `abort_all_tasks(Replaced)` 做 turn 级抢占，并用 CancellationToken＋generation 语义。**偏离点是"抢占的形态"**：竞品＝单一入口持有＋**同步取消**；我们＝26 个入口各自异步 ++sid、旧链靠 500ms 轮询迟滞自杀，**在被判过期期间仍在写会话状态**。
3. **因此阶 C 拆两批**：C-纠偏批（**仅 D1／D2a／D3**，照既有权威文本回归）→ C-补模批（**D2b**＋G1–G3，须 ADR＋域归属卡＋用户终裁）。依赖的根据已更正（原写"字段无处可写"是错判，见 §5）。
4. **准入形态是四种、不是两种**（原稿只列两种）：`折入现役回合`（Codex `Steered`、pi `steer`、gemini-cli InjectionService、crush fold）、`排队下一回合`（LangGraph 默认 Enqueue）、`拒绝 admission`（opencode `run-state.ts:70-73 busyError`、OpenAI Realtime "Conversation already has an active response"）、**`派生为有身份的子执行`**（Cursor `/multitask` async subagents、Claude Code Agent Teams、Codex threads）。四者都必须经同一仲裁点，**没有一种允许调用点自己 ++sid**。我们采排队（§4.5 C3 已裁），不是唯一正解；真实代价是**必须把 refused 与 side-execution 留成显式可选态**，否则 V2 放开并行时本表会自相矛盾。

## 1 现场拓扑（2026-10-04 实测，行号＝HEAD `229fb99`）

26 个驱动点全部直调 `send()`，且每个调用点都丢弃返回（`void`）——**没有"提交意图"这一层**：

| 类别             | 站点（ConversationPanel.tsx）                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户/外部        | `:708` initialPrompt、`:719` externalRequest、`:3195`、`:3535`                                                                                     |
| 按钮回声（8）    | `:3259` `:3283` `:3348` `:3376` `:3423` `:3778` `:3802` `:3834`                                                                                    |
| 系统自发轮（13） | `:837` 对账引导、`:1260` `:1279` `:1310` `:1332` `:1349` `:1371` `:1388` `:1406` 催推进/重提议、`:1487`、`:2557` recoverInterrupt、`:2876` `:2953` |
| 队列回投（1）    | `:2570`（flush 里再开一条链）                                                                                                                      |

关键三行：`sid = ++sessionRef.current`（`:2734`，另 `:3041`）；旧链唯一自杀点＝500ms poll 里 `sessionRef.current !== sid`（`:1993` `:1995`）；drain 位＝**链尾 finally**（`:2851`）。

## 2 D 表＝实现偏离（权威文本已有，实现没照做）

| #   | 模型原文（权威）                                                                                                                                   | 实现现状                                                                                                                                                                                                | 判                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D1  | `02 §4.12`：busy 时发送 → 入 pending 队列，"**当前回合收口后自动发送**"                                                                            | drain 在 `:2851`＝任意一条链的 finally；**被抢占的孤儿链照样 flush**（finally 无条件跑）⇒ 模型说的"当前回合"≠ 实现里的"最后死的那条链"                                                                  | **偏离**                                                              |
| D2a | `04 §3.2:412`：「状态机未到下一态——**结构性，非拦截**」＋ `00 §3.2 要点 5` 已裁的"不得用镜像/轮询代理领域状态"原则                                 | 过期链靠 500ms 轮询迟滞自杀（`:1993`/`:1995`），**且在过期窗内继续写会话状态**（`runChat` 入口无 sid 复核、`:2143` 可抢回 `streamingSidRef`）                                                           | **偏离（主项）**                                                      |
| D2b | —（**现行文本无任何一句规定"回合发起的消费者应为一个"**；`00 §3.2 要点 1`"槽只有一个"经核指 pending 槽、非发起权）                                 | 26 站点各自 `++sid` 立即开启新模型轮 ⇒ 发起权分散                                                                                                                                                       | **模型空白，非偏离**——须用户终裁方向＋出域归属卡（治理授权轴击穿·高） |
| D3  | **引文更正**：真正的权威句是 `02 §4.12`「UI `working` 与 UAT `modelBusy` **与上表同源**」（原稿引 `00 §3.2 要点 5`——该句只管 pending，属引文错位） | busy 门闩 `workingRef` ＝ `setWorking` 的 effect 镜像（`:2448-2450`，滞后≈100ms）＋三处手动同步清（`:2548` `:2845` `:2996`）；harness `modelBusy` 另读 DOM ⇒ 同一原则只贯彻到 pending、没贯彻到 working | **偏离**                                                              |
| D4  | `02 §4.12`／ADR-013 #2：待授权时用户发送**仍可直接处理**（明确保留的例外）                                                                         | `:2625` 逐字"未排队：仅 working＋非 silent＋`pending==='approval'` 落入直送"                                                                                                                            | **有据例外**——纠偏时须**显式保留**，不得顺手统一掉                    |
| D5  | `00 §4`／`§4.1`：确认后无推进 → 强制推进（StuckDetector/escalate 承载）                                                                            | 13 个系统 silent 轮＝模型要求的功能，本身不是偏离；**偏离的是投递方式**（自己 ++sid 抢占，而非在回合边界经同一入口投递）                                                                                | **功能保留、通道收编**（正对 §4.5 C4 披露条）                         |

⇒ **只有 D1／D2a／D3** 落在 p000128 门槛的"实现偏离产品定义"一侧（免新设计批准）；**D2b 落在"设计方向本身遗漏"一侧**，须另行批准。与 §4.5 C1/C4/C2a/C2b 的落地是同一次改动（21 个站点重叠），应并刀。

## 3 G 表＝模型真有空白（须新增，走 ADR-016 规则 1 出域归属卡）

| #   | 空白                                                                           | 证据                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **轮次（Turn）无身份与归属**——`02 §4.12` 用了"回合"一词，但回合不是实体        | `timeline.ts:128-131`：`conversation.assistant_start` 声明载荷**仅** `['forceTool']`（发起侧无 driver/answers/roundOrdinal）；对照 `:81` `decision.resolved` 已带 `answeredInstanceId` ⇒ **答复侧有身份、发起侧无归属** |
| G2  | **未规定一个会话至多几条在飞自推进链**                                         | `02 §4.2 自推进`只说"确认点内部模型自主执行工具链"；`04 §1.1:14` 自认 Task/pending"结构合并"却没写链数与归属约束                                                                                                        |
| G3  | **输入意图（Intent）无值对象**——"入队时刻冻结归属"是实现的承重，模型里没这个词 | ADR-015 #4 ＋ `ConversationPanel.tsx:2609-2618`（注释逐字"第十轴 B 承重"），领域侧零对应条目                                                                                                                            |

## 4 外部佐证

**竞品（本机源码 `/mnt/f/neonforge-competitors`，以下四条已逐行抽验为真）**

| 家                                      | 形态                                                                                                                                                        | 出处                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Codex                                   | `submission_loop` 独占消费所有 Op；抢占集中在入口：`abort_all_tasks(TurnAbortReason::Replaced)` **同步取消**后再 `start_task`；mailbox 起 turn 只在 idle 时 | `codex-rs/core/src/session/handlers.rs:409`、`tasks/mod.rs:276-278`、`tasks/mod.rs:438-442` |
| Goose                                   | `Agent::steer()` **纯 push_back 入队**；`SteerOperation` 在回合边界（`between_turns`）drain；审批在同一条 reply 流内暂停/恢复                               | `crates/goose/src/agents/agent.rs:561-566`、`state_machine/ops_steer.rs:47-58`              |
| opencode                                | 每 session 恰一个 Runner（`if (existing) return existing`）；busy 时第二次输入**报错拒绝**而非并链                                                          | `packages/opencode/src/session/run-state.ts:56-73`                                          |
| Cline                                   | durable FIFO run queue，"One run executes at a time per session"；审批 `askResponse` 注入**现役 task 循环**                                                 | `hub-run-queue.ts:5-8`、`core/controller/task/askResponse.ts:15-20`                         |
| 其余（pi / gemini-cli / crush / aider） | 同为单循环：pi 外环接 follow-up＋内环轮询 steer；gemini-cli 每 turn 一个 AbortSignal、插话走 InjectionService 注入在飞会话；aider `run_one`                 | 见 subagent 调研记录（本报告只固化上表四条抽验项，其余标〔源-未复核〕）                     |

**框架/学术**：LangGraph＝Pregel/BSP 超步，channel **单写者**、同一步多节点写同一 channel 必须带 reducer 否则报错；AutoGen v0.4＝actor 模型（每 actor 串行处理 mailbox，状态单一所有者）；OpenAI Agents SDK HITL＝interruption 在同一条 run 上暂停/恢复；Anthropic《Building Effective Agents》＝人反馈是**循环内 checkpoint**，不是新循环的触发器。

⇒ **四轴审计否证了我原稿的三处，均已改正**：① Codex 确有抢占 ⇒ 目标是「**每回合序列一个驱动消费者＋同步取消令牌**」，不是"消除代次作废"；② 准入形态四种（见 §0.4），不是两种；③ **约束的单位是回合序列（Turn/Task/thread），不是会话**——Codex 把并发数做成配置项、Claude Code 一屏 N 条在飞、Cursor 有 /multitask，原措辞"会话内单消费者"过窄，会把自家 V2 并行能力判成违规。另新增两条可直接抄的蓝本：Codex `TurnInputSubmission{Started,Steered,NotSubmitted}`＋`NotSubmittedReason`（含 `ExpectedTurnMismatch` 代次 CAS、"declines without recording or enqueueing"）＝§5 的 submitIntent；OpenAI Agents SDK "atomic owner-checked transition… cannot resume the same snapshot twice"＝G1/G3 的归属与防重放。

## 5 两批的判据与风险

**C-纠偏批**（D1–D3；保留 D4/D5 语义）

- 形态目标：`send()` 拆为 `submitIntent(kind, text, answers?, reason?)` → 入队＋**返回显式准入结果**（折入／排队／拒绝／派生四选一）；scheduler 在回合边界决定是否发起下一轮并**持有同步取消令牌**（取代 26 处异步 `++sid`＋500ms 迟滞）。`maybeContinue` 缩为"本回合内的工具等待"。busy 改为 scheduler 非响应式槽的投影，删三处手动同步清。
- **最小残留竞态（因果完整性轴给出，六条 DoD，缺一即族红原样复活）**：①令牌须门控**每个 await 恢复点的状态写**（`:2126`/`:2143`/`:2147`/`:2362`/`:2845`/`:2849`/`:2851`）而非只门控续跑决策，且 `gateway.streamChat`（`:2340`）**须增 abort 句柄**——否则重叠窗＝流剩余时长＋50ms，"同步取消"名不符实；②五个共享单槽（`chatRef`/`roundChunksRef`/`streamingSidRef`/`roundStreamRef`/`doneNotifierRef`）改挂 round 对象，否则旧链醒来抢走 `streamingSidRef`、**新轮**chunk 被 `:401` 全丢；③**词表路由（`:2671-2680`）必须同刀退役**——只收口入口而不撤词表，S7-1 在单消费者形态下**完整复活**（绑定时机从"消费时"换成"仲裁时"，击杀照旧）；④busy 权威 V1 **必须留 renderer**（同步可读硬约束；搬 main 即跨 IPC ms 往返），此为对 ADR-017"判定权归 main"的**成文例外**，不登记则后续审计按规则 2 反判错位；⑤harness `modelBusy` 改读 scheduler 投影；⑥≥6 轮验收批中**每一例红须附 timeline 逐例归因**（归属类／挂载类／其他），否则"归属无权威"只是**最简解释**而非**排他解释**——`确认执行` locator 在计划卡 `:3355` 与强制卡 `:3781` **同名并存**，分类须先消歧。
- 风险＝**轮序变动**：A/B 实测证明它会打到 `retry:188`／`core:388`／`factory.self:30`＋`:73`（≈6–8 例桩把轮序当标定）。本批与 A/B 的**实质区别**：可以指着 `02 §4.12`＋`04 §3.2:412` 说"新轮序才是被规定的轮序"——桩重标是**按权威文本重标**，不是"为了让它绿"。此区别必须写进 DoD，否则又会滑成 014→015 那条补丁链。
- 验收（沿用 §4.5 已改写口径）：≥6 轮整项目冷启 0 红 ＋ TMP 确定性复现不再红 ＋ 事件流中不再出现"同轮内新实例被随后的 reject 打掉" ＋ 挂载类与归属类分开计 ＋ **孤儿链不得再 flush**（D1 专项断言）。

**C-补模批**（G1–G3）

- 需 ADR＋`00/02/04/06` 四份同步（`00 §3.2` 是不变量 1 唯一措辞源，牵动面最大），每条新概念出域归属卡三问（权威域／为何在此层／移除后谁兜底）。
- **依赖根据已更正**（原写"字段无处可写"是**前提错位**：`driver` 在 26 个调用点当下皆可知，纯记录前置批技术可行且零轮序风险）。真依赖是两条：①**归属语义的消费**（回声去重、"同 answers 一轮至多驱动一制轮"、按 ordinal 断言归属）会改投递次序 ⇒ 须与纠偏同刀；②**G2 在飞链数量不变量在收口前永假**（D4 直送、auto-retry `:3017-3026`、queue 回投 `:2570` 都合法并链）⇒ 断言先行即桩全红。措辞由"无处可写"改为"**无权威可绑**"；顺序结论不变。

## 6 复核后的账（四轴外部证据保真度轴已把原"待核"清零或改名）

1. **OpenHands 产品名错引**：本机 `/mnt/f/.../openhands` 实为 **`@openhands/agent-canvas`**（ACP 前端，可跑 Goose/Codex/Gemini），不是 OpenHands agent 运行时 ⇒ 凡从该目录得出的"OpenHands"结论须改名。后端另核于 `OpenHands/software-agent-sdk`：`state.py:253 FIFOLock`＋`ConversationExecutionStatus` 单态机＋`local_conversation.py:1807-1868 send_message()` 只追加事件（且带 **`sender`** 字段做来源归属）＋`:1902-1916` confirmation mode 两次调用语义＋`conversation_lease.py` owner/generation/TTL 45s 租约 ⇒ **单消费者成立，升为〔源〕**。
2. **行号漂移与张冠李戴已修**：pi busy 拒绝真身在 `agent-session.ts:1220-1223`（原引 `:247` 只是选项注释）；gemini-cli 消费在 `useMessageQueue.ts:70-86`（原引 `:38` 是 useState 声明）＋每回合单在飞的真证据是 `useGeminiStream.ts:1698-1724`（非 `client.ts` 签名），且 `injectionService` 的消费者是 **子执行**（`agents/local-executor.ts:640-646`），写"注入在飞会话"须限定；crush 机制在 `agent.go:580-587`（原子 busy 检查＋单仲裁点原文"cannot both pass the busy check and start two runs on the same session"）/`:620-637`/`:363-378`，**drain 不在 coordinator 入口**而在**现役回合的步界**（`agent.go:828 PrepareStep` 回调 → `:399 drainQueueForStep`）——修正后与 pi/gemini/goose 同形，反而更利本裁定。
3. **C1「无一竞品向模型发 user 角色回声」有两条未记例外**，且都走"来源标记"路线、可反向支撑 C1：Aider `base_coder.py:1572-1579` 把 `"^C KeyboardInterrupt"` 以 **user 角色**写进 `cur_messages`；OpenHands `local_conversation.py:1955-1965` 把 stop-hook 反馈作为 `source="environment"` 的 `role="user"` 消息投递。
4. Codex `debug_assert!(turn.task.is_none())` 已抽验为真（`tasks/mod.rs:318`/`:330`，配 `:314-317 active_turn.lock()`）⇒ P6 升为**双条佐证**。
5. 仍待核一条：D3 的"harness `modelBusy` 读 DOM"须与 `scripts-cdp/` 现状再核（UAT 人格池在 Mac，本机不可跑）——已升为纠偏批 DoD ⑤，不再当作已验证事实引用。
