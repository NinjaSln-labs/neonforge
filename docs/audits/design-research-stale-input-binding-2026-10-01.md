# 设计调研：β 修法方向对不对（stale 输入 ↔ 决策点代次绑定）

日期：2026-10-01 ｜ 类型：外部实践对照 / 方向校验（**不改产品、不改断言**——ADR-012）
输入根因：`docs/audits/uat-ghost-busy-remeasure-2026-10-01.md`「★ 原始根因（最终层）」
待裁修法候选（同文 L122）：① 入队绑代次令牌 + flush 时不符则丢弃/降级；② 对迟到 flush 来源禁 C2 方向性拒绝；③ evidence 引导发前判 `pending`

**问题**：我们缺的到底是「消息 ↔ 决策点代次绑定」，还是别的？业界（学术 / 协议标准 / 头部竞品）同一问题的既有设计叫什么、怎么做、有没有支持 C2「非确认文本＝隐式拒绝」。

---

## 0. 一句话结论

**方向对，且不是我们发明的东西**：外部全部收敛到同一机制——**异步输入/批准必须携带其生成代次标识，由消费端在应用点校验，不符即作废**；命名即 **fencing token / epoch**（并发控制）与 **request id / interrupt id 配对**（协议与框架）。

但证据同时打出**两条我们没料到的修正**：
1. **C2（任意非确认文本＝隐式方向性拒绝）在外部没有支持**。协议标准里「没回答」是**第三种状态**（MCP 有 Accept / Decline / **Cancel**，Cancel ≠ Decline）；学术侧对含糊输入的默认路由是**重新询问/保持待决**（Safety Sentry「ambiguous ⇒ ASK」、Verifiable Action Card「divergence ⇒ 作废动作并**重发卡片**」），不是悄悄把卡拒掉。
2. **迟到输入的业界默认处置是「降级为下一轮上下文」，不是丢弃**。Claude Code 官方：排队消息在工具调用结束后**作为模型可见内容送入同一轮**——它从来不被当作「当前那个提示的答案」。

⇒ 建议：① 保留且升格为**唯一正统解**（含确认侧与拒绝侧都要校验代次）；②/⓪ 从「给迟到来源打豁免标记」改为**取消 C2 的文本拒绝分支**（打字确认白名单留下，打字拒绝去掉）；③ 保留。

---

## 1. 并发控制／协议标准（机制与命名的权威来源）

| # | 来源 | 关键事实（引文经 fetch 摘要，见 §5 取证局限） | 对我们哪一条 |
|---|------|------|------|
| A1 | Kleppmann, *How to do distributed locking* (2016) | fencing token 是**单调递增编号**；存储端**拒绝 token 低于已处理值**的写入，用于防「进程暂停/网络延迟后的过期写入」 | ① 的骨架；β 正是「暂停期写下的文本在延迟后落到新状态」 |
| A2 | primitives.pub, *Fencing Tokens and Lock Safety* | "issued with each lock acquisition, **presented to the resource server on every protected operation**"；"**The resource server rejects** any request carrying a token less than or equal to the highest token it has already processed" | **校验点在消费端**——即我们的 `send()` pending 路由（`ConversationPanel.tsx:2459`），不是只在入队处 |
| A3 | Kafka 生产者幂等/事务（PID + epoch + seq） | 接管后旧实例被 **`ProducerFencedException`** 挡下："The old instance can no longer complete its transaction" | 死代次的在途工作**不得完成**；且拒绝是**显式报错**、不是静默 |
| A4 | MCP 规范 · Cancellation | 取消后 "**SHOULD ignore any response to the request that arrives afterward**"（取消与响应交叉的竞态要优雅处理） | ③ 的正统化：迟到的结果必须作废；协议层已把这条写成规范 |
| A5 | MCP 规范 · Elicitation（2025-11-25） | 响应按 **JSON-RPC `id`** 与请求配对；合法响应**只有 Accept / Decline / Cancel**；**不存在自由文本被解释成批准** | 直接否 C2；并给出「拒」与「没答」必须分型 |
| A6 | LangGraph · interrupts | `interrupt` **返回 ID**，恢复值**按 interrupt id 映射**；文档警告"Matching is **strictly index-based**, so the order of interrupt calls within the node is important" | 「按位置/按当前挂起项配对」是被点名的**脆弱设计**＝我们现状（`pending` 只是个标签） |

## 2. LLM-agent 学术（2026，直接命中我们的失败类）

| # | 来源 | 关键事实 | 对我们哪一条 |
|---|------|------|------|
| B1 | arXiv **2609.38983** *Systematizing Approval–Execution Binding Failures in AI Coding-Agent Harnesses* | 失败分型 **Scope / Argument / Temporal / Tool / Delegation / Semantic**；Temporal laundering＝"an approval granted in one session ... exercised in a later, distinct session **without a fresh confirmation**"；缓解＝**Approval Token** 绑定 principal/agent_id/session_id/tool/arguments/scope/**expiry** | 我们的 β **就是这篇的 Temporal 类**。命名应采纳「approval **binding**」；修法＝令牌含过期，不是靠语义词猜 |
| B2 | arXiv **2609.21081** *Loopjacking: Hijacking Human-in-the-Loop Approval* | "hijacks HITL approval by **replaying stale tokens** or injecting prompts that **mimic consent**"；循环中途文本可被「误当作同意」；防御＝批准绑**唯一 ID/nonce + 过期 + one-shot 消费** | 我们出的是镜像事故（中途文本被**误当作拒绝**），同族同类；**one-shot 消费**是缺失的不变量：卡只能被消费一次 |
| B3 | arXiv **2609.18411** *The Verifiable Action Card* | 批准经 dispatch 时**实质参数复核**绑定；状态发散 ⇒ **中止动作并重发卡片**；默认拒绝、需显式批准 | 正解形态：代次不符不是「吃掉卡」，而是**作废 + 重新出示**。⚠️ 该文对「含糊文本如何处置卡片」**未置一词**（首轮 fetch 曾误报「silent rejection is acceptable」，定向复查询得 "silent on that point"，故不采信） |
| B4 | arXiv **2607.13594** *Safety Sentry: ... EXECUTE-ASK-REFUSE Routing* | 意图/target 不明确的输入路由到 **ASK**："Ask covers admissible actions whose intent or target is **under-determined**"；**无「撤销待决」逻辑**，保持等待人 | 对 C2 的最直接反例：含糊输入 ⇒ 保持待决，不 ⇒ 判定为改方向 |
| B5 | arXiv **2607.14166** *Stop Means Stop: ... Enforcement Gap in Agent-Framework Control Primitives* | LangGraph stop 被忽略、AutoGen 取消泄漏；修复＝**epoch counter 丢弃迟到的工作** | ① 与 ③ 的同一处方；也解释我们簇2（busy 闩锁吞插话）是**同一缺代次的另一侧** |
| B6 | arXiv **2608.03836** *Resume Means Resume: A Machine-Checked Conformance Contract…* | 逐实现：LangGraph **fork violation + silent validity**（"#6663 is not a slip but the shadow of a design choice"）、CrewAI 重跑已完成工作、LlamaIndex at-least-once 重放、Pydantic-graph 不可恢复 | 「静默把无效输入当有效」是**设计选择的影子**，不是偶发——正合我们对 RC1b「静默判 busy」的处置哲学 |
| B7 | Horvitz, *Principles of Mixed-Initiative User Interfaces* (CHI 1999) | "If the system is uncertain... **it should ask for clarification**"；询问仅在期望值超过打断成本时才发起 | 学理锚：不确定 ⇒ 再问，不是猜成拒绝（也不是无限追问） |

## 3. 头部竞品的官方设计（文档层；源码层由另路取证，见 §6）

- **C1 Claude Code（官方 interactive-mode 文档）**："if you queue a message while Claude is running tool calls, Claude Code **passes it to Claude** as soon as those tool calls finish, **within the same turn**." ⇒ 排队文本的目的地是**模型上下文**，不是「当前挂起提示的答案」；权限批准走**显式按键**，不靠文本语义识别。
- **C2 agentpatterns.ai · Steering Running Agents**："Typed messages **queue until the next turn boundary**"；打断的目的是 "prevent **stale input** from being treated as valid model context during a tool call" ⇒ 业界把「stale input 被当有效」直接列为需要防的事故类。
- **C3 反查**：这些设计里**没有**「未识别文本＝方向性拒绝」。它们只有两条通道——**显式决策**（按 y/n/always）或**送模型**。

## 4. 落到我们代码上的差异（自证据）

| 我们的事实 | 位置 | 外部对照 |
|---|---|---|
| pending 只是标签，**无 id/代次**；决策快照仅有 `since`（诊断用时间戳） | `domain/conversationState.ts:103-108,115,120` | A5/A6/B1：批准必须可按 id 配对、带过期 ⇒ 我们是「index/当前项」配对（被点名的脆弱设计） |
| 任何到达文本按**当前** pending 解释；`else` 分支 ⇒ `reject(pendingKind,{kind:'direction'})`＝C2 | `renderer/ConversationPanel.tsx:2459-2469` | A5（无自由文本解释）、B3/B4（含糊 ⇒ 重发/保持）、C1（文本只送模型）——**四条独立反证** |
| busy 期文本写**单槽**；flush 用 `setTimeout(...,50)` 直送 `send` | `ConversationPanel.tsx:2447`、`2415-2421` | C1 也是「排队后在边界投递」——差别在**投递目标**（模型上下文 vs 决策路由）。⇒ 多槽（`t000068`/RC3）在无代次绑定时**严格更差**，与本审计「方向反转」结论一致 |
| 第二个发射器：对账引导写同一槽 | `ConversationPanel.tsx:809` | A4：取消/失效后迟到的结果**必须忽略** ⇒ ③ 成立且可独立先做 |

## 5. 结论与修法候选的裁定建议（供裁决，不自动执行）

**方向判定：① 正确且是主流正统**（A1–A6、B1–B5、C1–C3 收敛）。命名采纳 **fencing token / epoch / 代次令牌**，学术表述采纳 **approval–execution binding（Temporal 类）**；协议表述采纳 **request-id / interrupt-id 配对 + 取消后忽略迟到响应**。

三点外部证据带来的收紧（①②是收紧口径，③是实质改动）：

1. **① 的校验点必须在应用点**（`send()` pending 路由），不是只在入队处——A2「enforced by the resource server」。①原文「入队即绑定 `pendingKind`」易被实现成「入队时判一次就了事」；入队只是*携带*代次，路由时才*裁决*。
2. **确认侧与拒绝侧都需代次匹配**——这是对 ① 的**确认**而非修正（①原文「不再走 C2 隐式拒」已含此意）；B1/B2 的令牌语义是「不符即整体失效」，两个分支都必须先验代次。
3. **迟到输入应「降级为普通文本 / 下一轮上下文」，而不是丢弃**（C1、C2）——① 原文写作「丢弃/降级」二选一，外部证据支持**默认降级**；丢弃只留给系统自发文本（③ 的 nudge）。若最终选择丢弃，**必须显式打点**（A3 的 `ProducerFencedException` 先例：拒绝是可见事件）——建议新增 timeline 事件 `conversation.stale_input_discarded`，与 RC1b「fail-closed 且可见」同谱。

由此**新增候选 ⓪（比 ① 更小、可先行）**：删掉 `ConversationPanel.tsx:2463-2468` 的文本拒绝分支——打字确认白名单（`isConfirmIntent`）保留，未识别文本一律作为普通用户消息走下一轮，**卡片保持待决**。
- ⓪ 单独即可切断 β 的因果链（stale 文本不再能拒卡），代价最小。
- 但 ⓪ **不足以替代 ①**：stale 的**确认词**（如「可以开始」）仍可能迟到并确认*新*卡。⇒ **⓪ + ① 组合**，② 被 ① 吸收（代次不符自然不能成为答案，无需给「迟到来源」打豁免标记）。

**不建议**：多槽队列（维持本审计「方向反转」结论，外部证据一致）。

**待验证的开放项**：one-shot 消费（B2）在我们这里对应「同一 `decisionContent` 只能被消费一次」——现无此不变量；是否纳入 ① 的实现范围，请裁决。

## 6. 取证局限（诚实标注）

- 所有引文经 WebFetch 的**摘要模型**返回，非逐字对照原文 PDF；arXiv 编号/标题为检索所得。**任何写进代码注释或 ADR 的引文需回原文复核**。
- B3 的首轮摘要有**误读**（已定向复查订正），说明二手摘要不可全信——本文只采用可定向复核到的表述。
- 竞品**源码级**证据（批准是否带 id、pending 期输入如何处置、有无 epoch/stale 字段）由并行取证照独立产出，将另附 §7；本文 §3 仅为官方文档层。
- Horvitz 引文取自 UW 课程镜像 PDF，非 ACM 原版；仅作学理锚点。
