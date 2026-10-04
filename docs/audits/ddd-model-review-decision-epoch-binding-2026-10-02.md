# 领域模型驱动独立审计：decision-epoch-binding（β 修法）——第四类视角

审计日期：2026-10-02 ｜ 触发：用户裁决「先依据产品领域模型驱动设计做一次独立审计」，再定 β 四项待裁
审计基准（领域权威链，全部直读原文）：
- `docs/design/intent-confirmation-domain-design.md`（意图确认 BC 重设计——§2 通用语言 / §3.1 聚合 / §3.4 状态转换 / §4 不变量 1-8 / §4.1 协商保护）
- `docs/domain/00-domain-authority.md` §3.2/§3.4/§3.5（单一 PENDING 冻结——不变量 1「用户决策是下一状态的唯一输入」）
- `docs/domain/04-tactical-design.md` §1.1/§1.2（Task/Conversation 聚合与不变量承载）
- `docs/domain/06-domain-events.md`（decision.* / session.* / proposal.* 事件目录）
- `docs/decisions/001-rejectstreak-semantics.md`、`006-goal-reconfirm.md`、`013-partner-busy-and-silent-channel.md`（已 accepted ADR）
- 被审对象：`docs/superpowers/plans/2026-10-01-decision-epoch-binding-fix.md`（v1）＋ `docs/audits/plan-review-decision-epoch-binding-2026-10-01.md`（四轴审计 GO-with-fixes）
- 源码核对：`apps/desktop/src/renderer/ConversationPanel.tsx:2459-2474`（C2 实现）／`src/domain/agentLoop.ts:55-64`（回声豁免）／`src/domain/conversationState.ts:149-171`（userDecided）／`tests/interaction/cards-from-decision-content.interaction.ts:541-569`（S7-1）

> 与四轴审计的关系：四轴 = 技术可编译性 / 治理授权 / 因果完整性 / 外部证据保真度。本文是**第五轴——领域模型忠实度**，独立取证，不通气四轴。结论**部分推翻四轴的 ⓪ 建议**（废 C2），并给出域忠实的替代修法。

---

## 0. 判定（结论前置）

**v1 的方向 ⓪（废止 C2「任意非确认文本＝隐式方向性拒绝」）与 S7-1 断言取反，均与已 accepted 的领域权威直接冲突，属领域回归，不应执行。**

β 的真正领域级病根是**输入越界**，不是 C2 规则本身错：
- 领域 `intent-confirmation-domain-design.md:215` 明确把 C2 限定为「**改变意图的新自由文本** → 等价 reject + 新 GoalProposal」；
- 实现 `ConversationPanel.tsx:2460-2464` 把**任何**非 `isConfirmIntent` 文本一律判为方向拒绝——**产品按钮回声**（`agentLoop.ts:55-64` 的 `确认，按方案执行`）、问句、澄清都落进来了；
- 为回声专门设计的豁免 `isDecisionCardEcho` **零消费者＝未接线**（p000144 已坐实）。

⇒ **域忠实修法 = 恢复实现↔领域边界（过滤非意图输入）＋ 精化 C2 的归属判定（epoch 决定文本针对哪个决策点），而非删除 C2。** 代次绑定（decisionEpoch）在"只精化、不废止 C2"的口径下与领域模型完全相容，且四轴 F0/C1/C3/G4 的每一条都能在"保留 C2"下解决。

**领域级 P0 冲突三处（各有 accepted 载体，废 C2 会同时打断）**：
1. **不变量 1 路由**（`00-authority:102` / `intent-design §3.4:217`）——"全部走 userDecided 入口，状态推进唯一输入＝用户决策"。废 C2 让"新意图文本不进 userDecided、只作普通消息进模型"＝pending 期出现一条不改状态却驱动模型的输入旁路。
2. **换目标通道**（`ADR-006` 末段逐字）——「换目标的自由文本触发通道由**现有 C2 分流**——非确认意图文本 → 模型重提议」。废 C2 ⇒ ADR-006 的"打字换目标 = 新任务提议"整条已裁路径失去承载。
3. **协商保护重置侧**（`ADR-001` + `intent-design §4.1`）——rejectStreak 的「随新提议重置」被**定义在** C2 语义上（用户新意图 = 新决策点）。废 C2 ⇒ §4.1 C8 三次拒绝上限的清零触发器无载体（四轴 G4 不是实现缺口，而是领域依赖）。

---

## 1. 关键源码取证（本审计直读）

### 1.1 C2 实现比领域更宽（β 真正病根）

`ConversationPanel.tsx:2460-2464`：
```
const pendingKind = stateRef.current.pending
if (pendingKind !== 'none' && pendingKind !== 'approval') {
  if (isConfirmIntent(text)) confirm(pendingKind)
  else reject(pendingKind, { kind: 'direction', text })   // ← 任何非确认词 = 方向拒
}
```
- 回声串 `确认，按方案执行`（`DECISION_CARD_ECHO[1]`，`agentLoop.ts:60`）**不匹配** `isConfirmIntent`：其精确词表要求整串等于 `确认` 等（`agentLoop.ts:72`），子串兜底要求连续 `确认执行`（`agentLoop.ts:89`）；带全角逗号回声两者皆不中 → 落 `else` → `reject(direction)` → 刚弹的决策点被清空。
- `isQuestionLike`（`agentLoop.ts:50`）存在于领域层，但此 send 路由**未使用** ⇒ 问句/澄清（非新意图）同样被误判为方向拒。
- 结论：实现的分类器把"新意图 / 回声 / 问句"三类**塌缩成一类**处理。领域只授权其中"新意图"走 reject。这是**实现偏离领域**，非领域错。

### 1.2 回声豁免＝为领域边界设计、从未接线（复用优先，ponytail）

`agentLoop.ts:55-56` 注释逐字：「确认卡按钮合成回声……**迟到时不得走 C2 隐式拒/确认另一决策点**（UAT G-impatient：目标回声撞方案卡 → 误拒）」。`grep isDecisionCardEcho src tests scripts-cdp` = 只有定义、零消费者。commit `8210c14` 加了 helper 未接线。⇒ β 主要生产者（每次点按钮产一条回声）本应在此被挡，从未被挡。

### 1.3 userDecided 不校验 point＝会话级单一 PENDING 的领域违规（四轴 C1 域证成立）

`conversationState.ts:149-171` `userDecided(s, point, decision)` 无条件 `:171 pending:'none'`，不校验 `point === s.pending`。
- `00-authority §3.2/§3.4` 不变量：pending 是**会话级、只有一个**；决策点＝状态×提议×动作的确定性派生（不变量 2）。点旧卡按钮清空当前 pending = 让"一个不存在的决策点"驱动状态推进 = **同时违反不变量 1 与不变量 7（PENDING 单一）**。
- ⇒ 控件守卫（`if (point !== s.pending && point !== 'system_clarify') return s`）在领域层不是"新增防护"，而是**把 userDecided 拉回领域已规定的单一-PENDING 语义**。域忠实，应优先执行，风险最低。

### 1.4 S7-1 测的是领域已裁定的正确行为——翻转＝制造回归

`cards-from-decision-content.interaction.ts:541-569` S7-1 输入 = `sendChat(page, '换个思路，做桌面版')`——**教科书级的"改变意图新文本"**。断言：卡消失 → 模型重提议 → 卡重现。这正是 `intent-design:215` + `ADR-006` 要求的 pivot 行为。
- v1 Task2/§14.1 提议把它**整段改写为相反断言（卡保持）**。对 S7-1 的输入类而言，"卡保持"= 用户打字说"换个思路"却清不掉当前方案卡 = **违反 ADR-006 换目标门槛**。
- β 杀手文本（回声）根本不在 S7-1 覆盖内。用翻转 S7-1 去修回声＝修错了断言、坏了正确的路径。

---

## 2. 代次绑定（decisionEpoch）在领域模型里的落位——相容，但须复用既有概念

领域已把"这是同一决策点的延续，还是新决策点"建模为一等概念，**不需要新造平行术语**：
- `intent-design §3.4` + `ADR-001`：模型逐字/同 kind 重提议 = **同一决策点延续**（rejectStreak 不清零）；用户新意图 = **新决策点**。
- `ADR-006`：`goalProposal undefined`（无标记复述）= 不弹卡；带新标记 = 新任务提议。
- `intent-design §3.1 decisionContent{kind, proposal, since}` = 决策点内容快照，已是"代次身份"的判据源。

⇒ v2 的 decisionEpoch 应**定义为 `decision.requested` 的计数/键**：`kind` 变化或 `decisionContent` 实质变化 → 新代次（+1）；逐字重提议 → 同代次。这与四轴 C3（只在实质变化才 +1，否则队列确认语永不落地）同结论，且**复用 decisionContent 比对**而非另立内容等价判据（复用优先）。C2 保持不变，只是**入参前多一道 epoch 归属门**：文本携带/推断的目标代次 ≠ 当前代次 → 作废（走新事件 `conversation.stale_input_discarded`）；= 当前代次且真为新意图 → 照旧走 C2 pivot。

**事件层落位**（`06-domain-events.md`）：
- `decision.requested`（§185）新增 `epoch` 载荷字段；`decision.resolved`（§186）不变。属载荷扩展，非新事件——与 §3.5 注记「decision.* 与 card.* 两层并存、语义对齐」一致。
- `conversation.stale_input_discarded` = **新事件**，必须按三步登记（`timeline.ts` TIMELINE_EVENT_SPECS → tlog → 测试），domain 归 `conversation`（复用既有 domain，不必像 proposal.* 那样扩联合）。四轴 D9 记的事件名/载荷自相矛盾须在登记前对齐本表。

---

## 3. 领域模型五维评分（本 BC，公式复算）

> 复算口径：统计对象 = 意图确认 BC 的建模工件（§2 通用语言 7 术语 / §4 不变量 8 条 / 04 五聚合 / 06 事件目录）；扣分项以**本文 §0–§2 已列证据**计数。相同输入得相同分数。

| 维度 | 公式 | 计数来源 | 得分 |
|---|---|---|---|
| 术语一致性 | 10 −⌊冲突/术语×10⌋₀.₅ | 术语 7（§2）；冲突 2：`decisionEpoch` 与既有"延续/新决策点"未复用（§2 本文）、`stale_input_discarded` 名↔载荷矛盾（四轴 D9）→ 2/7×10=2.86→扣 2.5 | **7.5** |
| 边界合理性 | 10 − 跨上下文不变量×2 | 不变量 1-8 全落 Conversation BC；epoch 在 Conversation、plannedFiles 属 Workspace 不受扰 → 跨上下文 0 | **10** |
| 不变量表达率 | 带不变量聚合/聚合×10 | 04 五聚合中 Task/Conversation/PlannedFiles/CapabilityRegistry 有明确不变量行，Problem 无 → 4/5 | **8.0** |
| 事件完整性 | 已登记事件/引用事件×10 | β 引用 6（decision.requested/resolved、session.pending_set/cleared、proposal.*、stale_input_discarded）；后者未在 06 登记 → 5/6=8.33 | **8.3** |
| 耦合度 | 10 −（同步依赖+共享对象，下限0） | 同步依赖 2（send→userDecided/transition、回声过滤→分类器）；共享对象 3（decisionContent、pendingSendRef、evidenceGuideCountRef）→ 10−5 | **5.0** |

**注**：不变量表达率与事件完整性的**风险全来自变更本身**——若执行 ⓪ 废 C2，则承载不变量 1 的 Conversation 聚合失去一条已表达不变量的载体（表达率降）、且 ADR-001/006 两条 accepted 决策的领域锚点悬空。

---

## 4. 问题清单（领域忠实度轴，带证据）

| # | 问题 | 影响 | 证据 | 建议修复 | 优先级 |
|---|---|---|---|---|---|
| R1 | 废 C2 冲突不变量 1 / ADR-006 / ADR-001 | 三条 accepted 领域契约同时悬空；打字换目标路径失效 | `intent-design:215`、`ADR-006 末段`、`ADR-001` | **不废 C2**；改为"输入过滤 + epoch 归属门" | P0 |
| R2 | S7-1 翻转制造领域回归 | 真新意图文本清不掉卡，违反换目标门槛 | `interaction.ts:563` 输入 `换个思路，做桌面版` | **S7-1 保持原断言**；β 回声另立用例 | P0 |
| R3 | C2 分类器输入越界（回声/问句误判方向拒） | β 主要生产者；不变量 2 确定性被措辞污染 | `ConversationPanel.tsx:2460-2464`、`agentLoop.ts:55-64` 零消费者 | Task0.5 接线 `isDecisionCardEcho`；评估问句走 `isQuestionLike` 不作方向拒 | P0 |
| R4 | userDecided 不校验 point | 违反不变量 1+7（旧卡驱动新 pending） | `conversationState.ts:149-171` | 控件守卫 `point!==s.pending→return`（域忠实，风险最低） | P0 |
| R5 | decisionEpoch 另立平行术语 | 术语双源；与 decisionContent 身份判据重复 | §2 本文、`intent-design §3.1/§4.1` | epoch 复用 decisionContent 比对定义，仅作 decision.requested 载荷字段 | P1 |
| R6 | stale_input_discarded 未登记、名↔载荷漂移 | 事件完整性<100%，CI 追溯缺口 | 四轴 D9、`06-domain-events` | 按三步登记，domain=conversation | P1 |
| R7 | 回声是否改 silent | 触 ADR-013 通道语义 + T-FORCE-2 可见性（契约变更） | `ADR-013 §3` | 优先：回声不进用户文本通道（点按钮已由 userDecided 记账，勿二次 send 冒充用户） | P1 |

---

## 5. 回溯触发（本 BC）

| 触发条件 | 回溯目标 | 说明 |
|---|---|---|
| R1/R2：变更与 accepted 领域权威冲突 | `intent-confirmation-domain-design.md` §3.4 + ADR-006/001 | 出 **ADR-014 前须先撤销"废 C2"**，改述为"精化 C2 输入归属" |
| R5：decisionEpoch 与决策点延续术语重复 | `ddd-aggregates`/§3.1 | 复用 decisionContent 身份判据，不扩聚合概念 |
| R6：新事件未入目录 | `ddd-domain-interactions`/`06` | 补登记 `conversation.stale_input_discarded` |

同一路径最多回溯 3 次；若第 3 次仍触发（尤其 R1——若产品坚持废 C2），标记为「需人工介入的架构决策」：那将是一次跨 ADR-001/006/不变量1 的**领域重设计**，不是 β 单批能吸收的改动。

---

## 6. 实施就绪判定

**Not Ready（针对"执行代码修批"）**。阻塞项：
1. 撤销四轴 ⓪"废 C2"，采纳 §0 的域忠实替代（输入过滤 + epoch 归属门）。
2. 从 v2 必改清单剔除"S7-1 断言取反"（R2），S7-1 保留。
3. 回声通道定性（R7）与 stale 事件登记（R6）定稿。
4. u000010：L3 稳定红集合 N=2 未达 N≥3，执行前补第 3 次运行（方法学，域中性）。

**可立即先行（域忠实、零契约风险）**：Task0.5 接线回声豁免 + 控件守卫（R4）——两者都把实现拉回领域已规定的边界，不触碰 C2 语义，可作为最小安全单元先行评估。

---

## 7. 对 β 四项待裁的域模型推荐（供裁决）

| 待裁项 | 四轴/原 v1 立场 | **领域模型推荐** | 理由 |
|---|---|---|---|
| **Q1 C2 废止** | 批准废止（⓪） | **不废止；改"输入过滤+epoch 归属门"** | 废 C2 冲突不变量1/ADR-006/ADR-001（R1）；域根因是分类器越界（R3） |
| **Q2 拒绝词表** | 升格为"是否存在"独立裁决 | **不新增独立拒绝词表** | 领域拒绝＝显式三态（卡片按钮 + RejectReason，§7.1#2）；C2 保留即已承载"打字取消＝direction pivot"，词表冗余 |
| **Q3 S7-1 取反** | 批准取反 | **不取反，保持原断言** | S7-1 输入是真新意图（`换个思路`），当前 pivot 行为＝领域正确（R2）；回声另立用例 |
| **Q4 批次/基线** | 最小安全单元先行 + t000069 扩 4 | **方法学沿用；但批次内容随 Q1-Q3 重定**：单元＝Task0.5 接线 + 控件守卫 + epoch 门（保留 C2）；T-BOUND/T-STALE 重述为 epoch 归属用例，非废 C2 用例 | 域中性部分保留；修批刀法随方向修正而变 |

> 若产品仍坚持废止 C2（Q1=废止），则本审计结论为「需人工介入的架构决策」：必须先重写 `intent-design §3.4` + supersede `ADR-006`、`ADR-001` 重置侧，并重表达不变量 1 的输入路由——这超出 β 单批范围。
