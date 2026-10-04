# Plan audit — UAT 领域对齐残留修批

> 对象：[`docs/superpowers/plans/2026-10-01-uat-domain-aligned-residue-fix.md`](../superpowers/plans/2026-10-01-uat-domain-aligned-residue-fix.md)  
> 证据源：`ConversationPanel.tsx` · `candidates.ts` · `uat-lib.mjs` · `serviceManager.ts` · `gateway.ts` · `envManager.ts` · `mockBridge.ts` · `cards-from-decision-content.interaction.ts` · `docs/domain/00-domain-authority.md` §3.6 · `docs/domain/02-domain-model.md` §4.10/§4.12 · ADR-012  
> 日期：2026-10-01  
> 本文件：Audit R1

---

## Audit R1

# **FAIL**

### Verdict

叶因 A/B/C 与代码证据对齐，领域方向（不扩白名单、harness 等 idle、ask_user 用消息下标）正确；但 **Task 3 控制流自相矛盾**——busy 时跳过决策点击的推荐写法会让既有 `if (!acted)` nudge 仍可发送，与同 Task「nudge 文本发送亦跳过」冲突，且可在 `assistant_start` 叠跑时再打穿叶因 B。**不可从 Task 1 无歧义执行。**

---

### Blocking（R1）

| # | 问题 | 要求（回写入方案正文） |
|---|------|------------------------|
| **1** | **Task 3：busy skip vs nudge 仍可发** | Step 2 注释写「nudge 文本发送亦跳过」；「优先可读性」却是 `if (busy) { 只更新 stuck } else { 完整 acted 链 }`。现行 `uat-lib.mjs` 中 nudge 全在 `if (!acted)` 内——busy 时 `acted` 仍为 `null` → **nudge 仍会 `typeAndSend`**，可在 streaming / `assistant_start` 时叠跑，与叶因 B「人格等模型结束再决策」及本 Task 自述冲突。须钉死**唯一**控制流，例如：`(a)` busy 时在 stuckIdle 更新后 `continue`（整轮禁止 acted **与** nudge）；或 `(b)` 将 nudge 段显式包进 `if (!busy && !acted)`。禁止只改 acted 门闩、nudge 门闩靠注释。Step 3 `rg` Done-when 须同时能核对 nudge 亦在非 busy 分支（或 `continue` 在 nudge 之前）。 |

---

### Checklist R1

| ID | 项 | 结果 | 说明 |
|----|-----|------|------|
| **A** | Leaf/evidence fidelity | **PASS** | A/B/C 均能在实码复现（见 Spot-check） |
| **B** | Domain alignment | **PASS** | 不扩白名单符合 §4.10；busy 不点符合 §4.12 真人模拟；ask_user 消息下标符合面板既有「本消息之后」契约（§3.6 引用略宽，修向不打架） |
| **C** | Red lines / Global Constraints | **PASS** | ADR-012 只记复测；禁 tool_choice:required；不扩 whitelist；关单公式完整 |
| **D** | False confidence | **WARN** | candidates 路径本已正确（仅 ask_user 坏）—方案已承认；Task 3 仅 `rg`、无行为测；Task 4 Step 1 首段硬编码 `err` 字符串可恒绿（「推荐」纯函数路径可救，须删 tautology 或标废弃） |
| **E** | Executable without contradiction | **FAIL** | Blocking 1（busy/nudge） |
| **F** | Harness masquerading as product | **PASS** | B 修 harness 正确：产品 `send` 已排队（§4.12）；尸体是 UAT 点钮，不是产品缺 queue |
| **G** | dist / remasure ADR-012 | **PASS** | Task 5：build → 池复测 → 只记审计 → 未达标停等裁决；完整够用 |

---

### Spot-check（对照真实代码）

| 方案声称 | 核对 |
|----------|------|
| A：`toolCalls.map((tc, i)` → `messages.slice(i+1)` | **属实** — `ConversationPanel.tsx` L3209 `m.toolCalls.map((tc, i)`；L3245 `messages.slice(i + 1)`。外层 `messages.map((m, i)` 在 L2820；内层 `i` 阴影。 |
| A：candidates 同语义已用消息下标 | **属实** — L2871 `messages.slice(i + 1)` 的 `i` 来自外层消息 map → **已正确**；方案「只 ask_user 坏」成立。 |
| B：`modelBusy` 只喂 stuckIdle | **属实** — `uat-lib.mjs` L994–1002：`modelBusy` 仅影响 `stuckIdle` 累加；决策点击链 L668+ **无** busy 门闩。 |
| B：`.nf-forcedcard` + 钮文「确认执行」 | **属实** — Panel L3433 / L3441–3463；确认后 goal underlying 发「确认，目标清楚了」（L3448–3460）—与证据叙事同构。`uat-lib` **无** `.nf-forcedcard` 引用；`getByRole('确认执行')`（L689）可点到强制卡。 |
| C：`isServerCommand` vs `isServerLikeCommand` | **属实** — `serviceManager.ts` L92–117：严格白名单无 python；宽松 RE 含 `python…http.server`。拒文案 L136 **无** `open` 重定向。 |
| C：`normalizeServerCommand` vite-only | **属实** — `envManager.ts` L192–198：仅 vite 注端口。 |
| C：`open` 工具存在 | **属实** — `gateway.ts` L183–201；`tools.ts` open executor。 |
| C：gateway start-server「打开网页前用它」过宽 | **属实** — `gateway.ts` L381–382。 |
| `candidates.ts` 可导出纯函数 | **OK** — 文件存在；现仅 `parseCandidates`/`stripCandidates`；加 `hasUserReplyAfter` 可行。 |
| Task 2：`chunk.text` | **名不存在** — `mockBridge.ts` 为 `chunk.content`；方案有「若名不同跟同文件」adapt 句 → **不升 Blocking**。`toolCall.askUser` / `expectVisible` / `enterWorkspace` / `sendChat` **均存在**。 |
| `startServer` 零 spawn 测 | **OK** — 既有单测注释写明不真起进程；抽 `startServerRejectReason` 路径可行。 |
| 不扩白名单 | **正确** — 与 §4.10「严格白名单」同向；扩表须端口规范化+URL，方案另开设计单——对。 |

---

### Nits（非阻塞 · 不挡回写后 R2）

- Task 2 正文示例写 `chunk.text`——开修时改成 `chunk.content`（或删示例里的错误名，只留 adapt 句）。
- Task 3 Step 2 伪代码未点名早段 L673–699 的 `getByRole('确认执行')`：钉死策略 3–4 已要求「无 forcedcard 才走方案卡」，回写时把该早段显式纳入 busy + forcedcard 门闩，避免只改后段 `has('确认执行')`。
- Task 4 Step 1 首段硬编码 `const err = \`…\`` 恒绿——删掉或改成「禁止」；只保留测 `startServerRejectReason` / 真实 `startServer` 返回。
- Task 3 拒绝钮除「我要重新描述」外还有「由搭档全权决定」——人格对应可一句带过。
- A0 §3.6 主要讲 Goal/Plan/Resolution 派生；ask_user「已回应」锚点写 UI 契约 / candidates 注释更准，少绑 §3.6 以免读者找错节。
- Task 5 可补一句既有 Mac dist 入口指针（与 v2 关单同）；非必须。

---

### 修订后预期

回写 **Blocking 1**（busy/nudge 唯一控制流 + Done-when 可核对）后开 **Audit R2**。未 PASS 前 **不进入执行**。

---

## Plan revision note（2026-10-01 · 待 R2）

方案正文已吸收 R1 Blocking 1 + nits：

| 项 | 回写落点 |
|----|----------|
| B1 busy/nudge | Task 3 选定 `(a)`：`busy → stuckIdle=0 → continue`（acted+全部 typeAndSend 同禁）；Done-when `rg` 核 `continue` |
| Nit early getByRole | Task 3 forced 块置于 L673 前；早段/后段加 `!forced` |
| Nit chunk.text | Task 2 → `chunk.content` |
| Nit tautology | Task 4 只测 `startServerRejectReason` |
| Nit §3.6 绑宽 | Architecture A 改 UI/candidates 契约 |
| Nit 全权决定 | 本批不点，仅「确认 / 我要重新描述」 |

**下一步：Audit R2（对象＝同 plan 文件）。**