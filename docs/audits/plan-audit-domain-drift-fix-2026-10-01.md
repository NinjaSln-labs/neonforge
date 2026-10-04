# Plan audit — 领域偏离修批方案 v2

> 对象：[`docs/superpowers/plans/2026-10-01-domain-drift-fix.md`](../superpowers/plans/2026-10-01-domain-drift-fix.md)（v2 — independent tasks）  
> 证据源：`ConversationPanel.tsx` · `candidates.ts` · `busyGate`（拟）· `uat-lib.mjs` · `serviceManager.ts` · `gateway.ts` · `timeline.ts` · `systemNudge.ts` · `mockBridge.ts` · `cards-from-decision-content.interaction.ts` · `docs/audits/domain-design-impl-drift-audit-2026-10-01.md` · ADR-012/013  
> 日期：2026-10-01  
> 本文件：Audit R1（独立；未写方案）

---

## Audit R1

# **PASS**

### Verdict

漂移审计全部 P0/P1（及文档 P2）一对一落到 Task；ADR-013 三条 Consequences + ADR-012 复测均有归属。七 Task 无「依赖 Task N」边，`ConversationPanel` 独占区与实码行块不交叉；Task 2 把 silent 排队 + `recoverInterrupt` + working 全回合合并为单交付，避免 escalate 半残。API / busy-continue / flush silent 路径对照实码可执行。可开修。

---

### Blocking（R1）

无。

---

### Checklist R1

| ID | 项 | 结果 | 说明 |
|----|-----|------|------|
| **A** | Drift coverage | **PASS** | P0 G→T1；P0 C-silent + C-working + P1 B-escalate→T2；P1 H→T3；P1 A→T4；P2 I→T5；P0 C-uat→T6；关单→T7。ADR-013 Consequences：产品 busy/silent 排队、escalate 显式恢复、UAT continue、ADR-012 只记——均覆盖。 |
| **B** | Task independence | **PASS** | 全文无「依赖 Task N」；独占区表与实码分区一致（见 Spot-check）。Task 2 合并三刀正确——若拆分则 escalate 在 silent 排队后必坏，须依赖边；合并后任一 Task 可单独开修。T7 复测假定 1–6 已落地——允许。 |
| **C** | Executable vs repo | **PASS** | `candidates.ts` / `chunk.content` / `toolCall.askUser` / helpers 均在；`shouldQueueWhileBusy` / `startServerRejectReason` / `recoverInterrupt` 为拟建且步骤完整。`goalFallback`/`execFallback` 仍在渲染路径。busy→`continue` 在 acted/nudge 前。flush：`send({text})` + `isSystemNudgeText` 对现有带前缀 silent 足够；escalate 走 recover 不入 queue。 |
| **D** | False confidence / half-fix | **WARN** | Task 2 合并完整、单 commit、Done when 含三刀——半成品不可关单。T6 仍用 UI 正则 busy、T2 改 working 文案同源有残余风险（独立性成立，关单靠 T7）。`pendingSendRef` 只存字符串——无前缀 silent 若误入 queue 会丢 silent（当前 escalate 不走此路）。 |
| **E** | Red lines | **PASS** | Global Constraints：不扩 `SERVER_COMMAND_WHITELIST`；ADR-012 T7 只记；禁 `tool_choice:required`；不缩池/不去 rejectPlan。 |
| **F** | Contradictions | **PASS** | 删 `stopGeneration('silent')` 与 recover=`stop('recovery')`+silent send 不矛盾（先停再 silent，working=false）。T4 只收渲染触发、不动 `deriveDecisionPoint` done 路径——与 drift「done 已对齐、渲染仍兜底」一致。 |
| **G** | Done-when / rg | **PASS** | 各 Task 有 vitest/playwright/rg/commit。T2 rg 钉死无 `stopGeneration('silent')` + recover/shouldQueue 存在；T6 rg 钉 `continue` 与 `!forced`。T2 interaction「interrupted source≠silent」未钉死用例补丁——靠 rg+既有 stuck.escalated，不升 Blocking。 |

---

### Spot-check（对照真实代码）

| 方案声称 | 核对 |
|----------|------|
| P0 G：ask_user `toolCalls.map((tc,i)` → `messages.slice(i+1)` | **属实** — Panel L3209 / L3245；candidates L2871 用外层消息 `i` 已正确。 |
| P0 C-silent：`working && silent → stopGeneration('silent')` | **属实** — L2411–2416；`stopGeneration` 签名 `'button' \| 'silent'`（L2370）。 |
| P0 C-working：流式 done「及时释放 / 快速确认」 | **属实** — L1479 注释；L2204–2215 `doneNotifier` 提前结束 await；L2581–2585 finally `setWorking(false)`+`flushPendingSend`。 |
| P1 B：escalate → `send({silent:true})` | **属实** — L1409–1412。 |
| P1 A：`goalFallback` / `execFallback` 仍参与弹卡 | **属实** — L2928–2957 / L3023；注释自称「唯一依据=pending+dc」与代码不符。 |
| P1 H：start-server 描述「打开网页前」；拒文无 open | **属实** — `gateway.ts` L381–382；`serviceManager.ts` L133–136 内联 error，**无** `startServerRejectReason`（拟建 OK）。`isServerCommand('python…')===false` 成立。 |
| P0 C-uat：`modelBusy` 只喂 stuckIdle | **属实** — uat-lib L994–1002；L668+ acted 链无 busy 门；L689 早段 `getByRole('确认执行')` **无** `.nf-forcedcard`（产品 L3433 有卡；harness 零引用）。 |
| ADR-013 Consequences ↔ Tasks | **对齐** — 产品三刀=T2；UAT continue=T6；复测=T7。 |
| 独占区不冲突 | **OK** — T1：`replied` L2871 + L3245（及 map 参数改名）；T2：send/stop/escalate/doneNotifier/finally（~L1409–1412、1479、2204、2370–2424、2581）；T4：确认卡块 ~L2886–3175。三区无同分支双主。forcedcard ~L3433 不在 T4。 |
| `candidates.ts` + `hasUserReplyAfter` | **OK** — 文件在；现仅 parse/strip；末尾导出可行。`candidates.test.ts` 存在。 |
| Task 1 interaction：`chunk.content` | **OK** — `mockBridge.ts` L17–18 `chunk.content`；`toolCall.askUser` / `enterWorkspace` / `sendChat` / `expectVisible`/`expectText` 均在。 |
| `flushPendingSend` + silent | **OK（有条件）** — L2387–2392：`send({text:pending})`；L2401 `isSystemNudgeText`。协议 nudge 均带 `【系统提示·非用户发言】`（agentLoop）；对账带 `【系统对账…】`。escalate 文案无前缀，但 T2 经 `recoverInterrupt` 显式 `silent:true` 且先停——不依赖 flush 推断。 |
| `shouldQueueWhileBusy` approval 例外 | **对齐 ADR-013** — Decision 2 待授权用户可直送；方案 silent+approval 仍排队——正确。 |
| timeline `conversation.interrupted` | **OK** — `detailKeys:['source']`（timeline L133）；补 `recovery` 注释/取值不影响校验严格枚举（宽松 detailKeys）。 |
| T4 不碰 derive | **安全** — done 路径已 `deriveDecisionPoint`（drift ~L1068）；只删渲染兜底充分条件。 |
| 不扩白名单 / 无 tool_choice:required 恢复 | **OK** — Constraints 明文；代码 whitelist 仍严；deepseek 拒 required。 |

---

### Nits（非阻塞 · 不挡开修）

- Task 2 `recoverInterrupt` 伪代码先 `tlog(interrupted)` 再 `stopGeneration('recovery')`（内部再 tlog）→ 双打点；落地时只留一处。
- Task 2 Files 写「断言 interrupted source≠silent」，Step 8 仅跑既有 S5-2（只断言 `stuck.escalated`）——开修时补一条 timeline `source==='recovery'` 或改 Done when 只认 rg。
- Task 4 伪代码 `isLastAssistant` 需保留现有 `lastSignalIdx` 挂载（方案括号已写「或挂信号消息」）——勿字面换成仅 isLastAssistant 以免连发漂移回潮。
- Task 5 Done when `rg gate.denied docs/ =0`：除 A0 外 `02`/`04`/`06`/design/stage-specs 亦有命中；Files「及 rg 命中处」已覆盖，落地时把 stage-specs 历史句进脚注或例外清单，避免 rg 与「仅 ADR/审计」歧义。
- Task 6 与 ADR-013「modelBusy 与产品 busy 同源」仍差一步（UI 正则）；独立性允许，T7 列「busy 中确认词」可观察；若 working 文案变更须同步正则。
- `pendingSendRef` 不存 `silent` 标志——长期可改为 `{text,silent?}`；本批靠前缀+recover 可过。
- Task 2 Step 6「凡 doneNotifier…不 setWorking(false)」：`doneNotifier` 本身只 `r()` 解 await，真正早释在 maybeContinue/`setWorking` 多点——执行时按 rg「及时释放/快速确认」意图扫全，勿只改 notifier。

---

### 修订后预期

**PASS — 可进入执行。** 建议排期仍按方案：`1∥3∥5 → 2∥4 → 6 → 7`；并行须守独占区。Nits 不强制回写方案正文。
