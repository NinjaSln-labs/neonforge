# 第十轴独立审计：证伪双概念模型（ADR-015 v2 + v6）

审计日期：2026-10-02 ｜ 对象：ADR-015 v2 + 修订草案 v2 + v6 ｜ 方法：四路并行独立对抗（A 实例推进规则 · B system_clarify+回声队列 · C 持久化+签名可计算 · D 治理双源）
**总判定：双概念（决策点槽 ⊥ 决策点实例）方向成立，goal/plan/resolution 面击穿失败＝闭合。但存在 6 处实现级接缝必须先修才能改权威原稿；其中 X1 是我在 v6/草案写错的规格缺陷（会破既有 `:748` 测试）。非模型路线被否——是落地规格需收紧。**

---

## 闭合面（四路确认，无需改）
- **实例推进规则**（A）：非 `'none'` 的 pending 全仓唯一写点＝`setPending:315`；清点到 `userDecided:171`/`approvalDecided:270`/`approvalGranted:323`/`clearPending:86` 只置 none。所有"弹新点"（含恢复、approveFiles、deriveDecisionPoint）皆经 setPending ⇒ seq 必推进。`transition` 同步写 stateRef 先于 send 宏任务 ⇒ 首卡 seq 就位。**无绕过写点反例。**
- **system_clarify 递归 × 身份门**（B）：按钮 answers{kind:'system_clarify',instanceId=强制卡 seq}，门比 `s.pending`（=system_clarify）顶层过 → 递归透传原 answers、s 未变 → 自洽落 underlying。**须锁"门比 `s.pending` 不比 `point`"**，否则递归重判误杀。
- **回声经队列**（B）：漏标某 echo 站 → 入队时 pending 已清 → answer.kind='none' → flush 时门 no-op（不误确认新卡），代价仅该轮丢弃 + stale 事件。**承重**：answer 必**入队(:2447)冻结、flush(:2420)原样回传，绝不在 flush 按当时 pending 重冻**。
- **A-026 逐字重提议**（A/C）：同 sig→同 seq→队列确认语命中。**承重**：`since` 必排除出 sig。

---

## 必修接缝（改原稿前消除）

### X1【规格缺陷·我写错】身份门会破既有 `:748` 测试
- 我在 v6/草案把门写成 `isAnswerToCurrent = … && s.pending!=='none' && …`，令"pending='none' 时 goal-confirm 任务边界"被门拒 → `conversationState.test.ts:748`（r3.pending='none' 的 goal-confirm 须重置 rejectStreak）**红**——与 v6 自己"护 :748"的 DoD A7 直接冲突。
- **修**：门只在**有活 pending 时**生效：`if (s.pending!=='none' && !(answers.kind===s.pending && answers.instanceId===seq)) return s`。pending='none' ⇒ 跳过实例校验（放行清理/任务边界）。承 F-A 早先 `pending!=='none'` 前置，二者归一。

### X2【阻断】approval/兜底卡无 `decisionContent` → 身份门无载体
- `ConversationPanel.tsx:323 setPendingState('approval')` **不传 content** ⇒ `conversationState.ts:315` decisionContent=undefined ⇒ 授权卡按钮 render 冻结无 instanceId 载体、门恒失配 **挂死**；allow 实走 `useToolApproval.ts:121`、文本批准 `:2470-2481` 直调 approveAllToolCalls，**均不经身份门**。⇒ ADR-015 v2"顺带覆盖 approval 异步窗"**是过度主张**。
- **修**：`setPending` 恒铺 `{kind,since,instanceId,signature}` 骨架；`:323` 从 toolCall 补传 ApprovalRequest（toolName+subject）。allow 真接线仍属 **t000073 另批**——ADR-015 v2 不得声称本批覆盖 approval 面。

### X3【阻断】恢复走普通 setPending → seq 复位 1 + 重复 emit 污染
- `ConversationPanel.tsx:346-355` 恢复经 setPendingState → 自 initialState(seq 0) `kind!==pending` 必 +1 → seq=1，**置不回持久 instanceId**、与落盘旧 `decision.requested` 重号；且每次启动经 transition 重复 emit `session.pending_set`/`decision.requested`（`timeline.ts:284-289`）污染计数。
- **修**：仿 `restorePlanned`（`useConversationState.ts:97-104`"恢复≠用户转换、不走 transition、不 emit"）新增 **`restorePending(dc)`** 直置 pending/decisionContent/`decisionInstanceSeq=dc.instanceId`；补 `:351` 现漏的 `dc.approval`。→ 修 ADR-015 v2 待终审 #2（恢复续号）。

### X4【矛盾】结构签名含/排 assumptions——ADR-015 v2 正文自相打架
- `015:30`(#4) 仍写 goal/plan 签名**含** `assumptions[]`，与用户 §6-D1 裁定 + `015:62`/草案/v6 的"排除"冲突。**修**：015#4 正文改"排除 assumptions 及措辞"。且需**新写~10 行纯规范化函数**（files/verification command 排序去重 join；现 `derivePlannedFiles:837` 是插入序 Set，不可直接当签名）；`since` 排除。

### X5【双源守卫】014#5 控件守卫 与 015/v6 身份门并存矛盾
- 014#5 的 kind 守卫含 `point!=='system_clarify'` 例外；015 身份门无例外（且**无例外更安全**——避免旧 system_clarify 卡委派落空触 `conversationState.ts:164-165` TypeError）。阻塞集上门 ⊇ 守卫，唯 system_clarify 例外相反。
- **修**：014#5 删守卫原文，注"并入 015 身份门（含 X1 的 pending==='none' 放行）"。单一门，无二源。

### X6【不变量 1 精确化散落】Task1 未全覆盖
- "针对当前决策点实例"精确化，草案只覆盖 `00:102` + `intent-design:252`。旧措辞残留：`00:114`、`intent-design:31/:217`、`04:14/:56/:91`、`02-domain-model:84`、`coverage-matrix:11`（`08-audit:49/51` 自标历史、可豁免）。
- **修**：Task1 落稿枚举全部上述 file:line，或声明 **`00 §3.2` 为不变量 1 唯一措辞源**、余处改引编号（合项目"单一写入口/防双源"规约）。

---

## 结论与处置
- **双概念路线未被否**；A/B 确认核心命门（同 kind 迟到确认）与两集成面闭合。
- **但 X1–X6 是改权威原稿前必消除项**（X1/X2/X3 为规格缺陷/阻断，X4/X5/X6 为双源/矛盾）。多数可由我按已裁语义就地修文档；X1（门 carve-out）、X2（approval 载体 + 不声称覆盖 approval 面）、X3（restorePending 旁路）为**设计收紧**，需回写 ADR-015 v2 / 草案 / v6。
- 修毕后仍余：L3 基线重取（`core:161` 冲突）、第十轴 X1–X3 修法的再核、最终再终审、push。**修批仍 blocked。**
