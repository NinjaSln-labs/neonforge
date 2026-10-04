# as-is 调研：决策点呈现与答复绑定——β 的干净解候选（非方案·待用户定调）

日期：2026-10-02 ｜ 性质：**理解报告**（停止 v1–v7 补丁累积）。目的：as-is 讲清"决策点呈现 ↔ 用户答复"现有机制，据十一轮审计沉淀的事实，给出**比 ADR-015 v3/v7 更简单**的解候选与残余待定问题。**不含实施、不改任何文件。**

---

## 1. as-is：机制其实已经存在，只是用错了层

**分层（`05-architecture §1/§6`）**：RENDERER（应用编排）→ DOMAIN（纯同步归约器）。领域层 `deriveDecisionPoint`/转换＝纯函数，"模型措辞不参与"（`intent-design §3.3`）。

**写路径单点已存在**：`useConversationState.ts:40-49`
```
transition(fn): prev = stateRef.current; stateRef.current = fn(prev); emit(deriveStateEvents(prev,next)); setVersion(v+1)
```
全部 15 处 mutation 中 **13 处经 transition**；仅 2 处直写泄漏：`ConversationPanel.tsx:2488`（`noteUserTextReply`＝回复计数，非呈现）、`:2355`/恢复 `:98`（合法 fresh）。

**两个已在手的事实**：
1. `transition` 持有 `prev` 与 `next` ⇒ 可判定"这次转换是否改变决策点呈现"。
2. 改变"呈现"（`pending`/`decisionContent`）的转换是**已知子集**：`setPending:315`、`userDecided:171`、`approvalDecided:270`、`approvalGranted:323`、`clearPending:86`。`applyTool`/`addPlannedFiles`/`setFilesApproved`/`resetRejectStreak` **不改呈现**。
3. `version`（A-005）在**每次** transition 都自增 ⇒ **太吵**（无关工具落账也自增），不能直接当答复归属键——但这恰说明**机制（单调快照号）已存在**，只缺"只在呈现变化时推进"的收窄。

**结论（重新理解）**：β 不是"缺代次概念"，是"呈现快照号存在于应用层 `transition`、却从未被答复侧消费"。前十一轮的 `decisionEpoch`(入 ConversationState)+结构签名+render 冻结穿领域+持久化+approval 携 answers，**都是在应用 chokepoint 之外重新发明这个计数器**，于是长出 X1–X6/N1–N5 一串症状。**根因＝分层错位**（把时序/呈现身份塞进纯归约器）。

## 2. β 的正确抽象

一条交互（按钮点击 / 排队文本）是针对**某次呈现** P 做的；到它被应用时，呈现可能已推进到 P+k（重提议、换 kind、被别处决策清除）。**干净解＝在 `transition` 这一单点，令交互携带"它应答的呈现号"，与"当前呈现号"比对，不符则 no-op。** 领域归约器保持纯净（只管"状态怎么变"），呈现/时序身份归应用 hook。

## 3. 候选设计（比 ADR-015 v3/v7 简单）

**C1 — 应用层 present-序号（推荐方向）**
- `useConversationState` 加 `presentSeqRef`（非领域字段）；`transition` 末尾：`if (next.pending!==prev.pending || samePresentation(prev.decisionContent,next.decisionContent)===false) presentSeqRef.current++`。
- 卡按钮/文本入队**发起时**捕获 `answer = {seq: presentSeqRef.current, kind: pending}`（按钮 render 闭包、文本 enqueue 各一处）。
- 交互**应用时**（transition 前）：`if (pending!=='none' && answer.seq!==presentSeqRef.current) → stale no-op`。
- 领域 `userDecided` **保持 kind 级**不变量门（`point===s.pending`，即 014#5——那本就是领域不变量 1/7，不是时序）。**时序门在应用 hook，领域只管状态合法性**。
- **收益**：无 `ConversationState` 新字段、无领域结构签名、无持久化 presentSeq（重启后队列已空、无 stale 存活→fresh 即可）、approval 不再被迫携 answers 穿领域（其绕过 hook 的 allow 另议）。X1(:748)/X3(恢复跳号)/X5(双守卫)/N1(approval 半接) 大半**因分层正确而消失**。

**C2 — 领域 decisionInstanceSeq（＝现 ADR-015 v3）**：身份入领域、须序列化+render 穿+approval 接线+结构签名。更"正统"但把异步概念焊进纯归约器，复杂度与回归面大。

**取舍**：C1 把"呈现身份"当**应用层时序**（与 React 队列/effect 同域），C2 当**领域不变量**。事实检验：不变量 1（状态推进唯一经用户决策）+ 不变量 7（单一 PENDING）是**领域**的（C1 也保留，kind 级）；而"哪一次呈现"是**交互↔快照的时序关系**，领域归约器天生不建模时间（同步）——故 C1 分层更贴 `05 §6`"领域＝纯函数"。

## 4. 残余问题（C1 未自动消解，须定）

1. **呈现身份等值仍在**：`samePresentation(prev,next)` 要判"逐字重提议＝同呈现 vs 实质变＝新呈现"。C1 下它是**一个应用层纯 helper**（比 `decisionContent` 的 kind + 结构化字段，忽略 `since`/措辞）——比领域签名简单，但**仍需回答 §6-D1 那个内容粒度**（files/verification/evidence/command 入、assumptions/summary 排除）。十一轮命门（同 kind 迟到确认）能否关，仍取决于此等值判据——**分层变简单，判据问题不变**。
2. **回声 / 系统文本**：`opts.echo` 退用户通道（014#2）与 presentSeq 正交，仍需（回声根本不携 answer、不进路由 C2）。
3. **approval 面**：allow（`useToolApproval.ts:121`）与文本批准（`:2470`）**不经 `transition` hook** ⇒ C1 的 presentSeq 门**覆盖不到**它们（同 t000073 现状）。要么把它们也收进 hook 单点，要么承 ADR：本批只覆盖 goal/plan/resolution/system_clarify（userDecided 全经 hook）、approval 留 t000073。⇒ C1 天然把"门只挂经 hook 的转换"，**回避 N1 半接**（不给 approvalDecided 强塞 answers）。
4. **恢复**：presentSeq 不持久化 ⇒ 恢复后 fresh、队列内存态本已空 ⇒ 无 stale 存活，安全；但审计事件 `decision.requested` 若要跨重启按呈现配对，则需另存（次要，非 β）。
5. **2 处直写泄漏**（`:2488` noteUserTextReply、`:98` 恢复）：`:2488` 不改呈现→不误推 presentSeq，但要确认它在路由块内、回声/问句旁路后计数语义仍对（十一轴 D：stale 答复经它仍涨 T2→梯度兜住）。

## 5. 十一轮审计→事实（供 C1 取用，不再当补丁）
- C2 保留（`:215` 领域规定）；回声退用户通道；**β＝交互↔呈现未绑定**（非"缺代次"）；呈现快照号机制**已在 `transition`**、只是未被消费；approval/allow 绕过 hook（单点不彻底）；不变量 1 精确化里"当前呈现"属**时序**、宜落应用层，kind 级合法性留领域。

## 6. 给用户的定调问题
1. 采 **C1（present-序号落应用 `transition` hook，领域保持纯）** 作主线，还是 C2（现 ADR-015 v3 领域字段路线）？（我的倾向：C1——十一轮所有"载体/持久化/渲染穿领域/approval 半接"之痛皆源于把时序塞领域，C1 从根上避开。）
2. 若 C1：**呈现等值判据（问题 1）粒度**你已裁 §6-D1（排除 assumptions），是否直接复用？
3. 若 C1：**approval 是否本批收进 hook 单点**，还是维持"门只挂 userDecided、approval 留 t000073"？
4. 定了 C1/C2 后我再据十一轮全部事实**从零写一份方案**（不叠 v 号补丁），并先重取 L3 基线（`core:161` 冲突）。

> 全程只读，未改任何文件；两份领域原稿正文、产品码未动（ADR-012）。
