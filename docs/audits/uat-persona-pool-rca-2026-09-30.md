# 人格池测批 · 原始根因汇总（ADR-012 只析不修）

> 权威测批：[`uat-persona-pool-testbatch-2026-09-30.md`](./uat-persona-pool-testbatch-2026-09-30.md)  
> seed=`pilot30` · asar `2026-09-30 13:44` · UD timeline 实证  
> **不要**把 `timeout`/`stuck_*` 当成根因——那是终点形态。

## 一句话

本批 **7/12 收口失败** 不是「轮次不够」，而是三条可分叶因：  
① **双拒方案后从未真正 `execution_confirmed`→无 write**（主簇）；  
② **refuse_once 拒 bash 后无恢复**；  
③ **已交付（write/bash 成功）却不 `report_completion`**。  
T3 同构于「确认后不写、又 propose_plan」。

对照 PASS（p005/p106/p076…）证明：ask_what、plan 后插话、证据门二次 report **可以**走通——失败集中在上列叶，而非人格池框架本身坏掉。

---

## 总览

| 叶因 ID | 原始触发（证据） | 致死近因 | 本批命中 | 类属 |
|---------|------------------|----------|----------|------|
| **L1** | `rejectPlan` 双拒后会话进 `ask_user` / `system_clarify` 循环 | **无 `task.execution_confirmed` → 无 write**；harness 偶记「确认执行」但 timeline 无 plan confirm | p002 p068 p114 p042 p055 | 拒方案后推进断裂 |
| **L2** | `approvalPolicy=refuse_once` 点拒绝 bash | 拒后 **不重提授权/不改道 write 收尾** → stuck | p087 | 授权拒绝无恢复 |
| **L3** | write×N + bash 已批已执行 | **从不 `report_completion`**（亦无 evidence_missing 路径）→ stuck | p091（及历史同类） | 交付后不收口 |
| **L4** | T3：`execution_confirmed` 后 force | 模型 **再次 `propose_plan`** 而非 write | T3 | 确认后工具选错 |

已排除 / 降级：

| 曾疑 | 本批结论 |
|------|----------|
| 插话过早（簇 B） | 修后 interrupt 已在确认执行后；p076/p069 **PASS** → 非本批主因 |
| ask_what 伪 type-ask（簇 C） | p005 **PASS** → 非本批主因 |
| 单纯 dist 缺 A–D | 10:35/13:44 包已含；PASS 增多 → 水位差已消化大半 |
| `timeout` 本身 | 终点标签；下方叶因才是因 |

---

## L1 — 双拒方案后无执行确认（主簇）

**因果链（p002 / p114 / p055 / p068 等同构）：**

```
goal_confirmed
  → propose_plan → decision.resolved plan=reject   (#1)
  →（ask_user / 再 propose_plan）→ plan=reject     (#2)
  → system_clarify 乱跳（reject/confirm）± 再次 goal_confirmed
  → ask_user …
  → ✗ 无 task.execution_confirmed
  → ✗ 无 write
  → harness timeout / stuck
```

**实证摘录**

- p002：goal confirm → plan reject → ask_user → plan reject → clarify 混战 → ask_user；**无 execution_confirmed / 无 write**  
- p114 / p055 / p068：同一骨架（拒×2 → clarify → ask_user）  
- p042：另有 `web_search` failed，但仍落在 **无 plan confirm / 无 write** 同族  

**旁证噪声：** harness 动作日志里可能出现 `button:确认执行`，但对应 UD **无** `task.execution_confirmed` → 点击未变成领域确认，或确认前/后被拒绝与澄清打掉。根因仍落在 **「拒方案人格无法收敛到一次有效 plan confirm」**，不是「写文件失败」。

**致死近因：** 有效执行门未打开（无 confirmed plan）→ 不可能交付 → 不可能 resolved。

---

## L2 — 拒一次授权后无恢复（p087）

```
execution_confirmed → write OK
  → bash needApproval → decision.resolved approval=reject（refuse_once）
  → tool.rejected bash
  → ✗ 无再授权 / 无改用其它核验 / 无 report
  → stuck_after_plan
```

**叶因：** 产品在 **approval reject** 后缺少「再申请授权或跳过该核验并仍能收口」的推进；harness `refuse_once` 只负责点一次拒绝，之后空等。

---

## L3 — 已交付不 report（p091）

```
execution_confirmed → write×多 → start-server OK
  → bash 批准并 executed
  → ✗ 无 tool.requested report_completion
  → ✗ 无 completion.evidence_missing（未走证据门）
  → stuck_after_plan
```

**叶因：** 交付后模型停在「可收口而未收口」；与历史 contradictory「补证后不重报」同族，但本例 **连第一次 report 都没有**。  
对照 p005 PASS：同有 deliverables nudge → 出现 `report_completion` → resolved。说明叶因在 **催收口是否咬合 / 模型是否听从**，不是「不能 report」。

---

## L4 — T3 确认后改再出方案

```
task.execution_confirmed
  → execution.forced require-action
  → tool.requested propose_plan   ← 应 write
  → 又进入 plan 决策卡
  → stuck_after_plan
```

**叶因：** 确认执行后软强制下仍选 `propose_plan`，与 G-impatient 历史「确认后纯文字催点卡」同属 **确认后推进选错工具**；T3 特化为再规划。

---

## 与 PASS 对照（为何不是全面坏）

| PASS | 说明 |
|------|------|
| p005 | ask_what→允许→deliverables 催 report→resolved |
| p106 | evidence_missing→bash→再 report 路径通 |
| p076/p069 | 插话在 plan 后仍能写完收口 |
| p018 | 短路径无双拒/无拒授权 |
| T1/T2/T4 | 中性驱动无拒方案压力 |

---

## 裁决用优先级（仍不修）

| 优先 | 叶因 | 建议修向（方向 only） | 禁止 |
|------|------|----------------------|------|
| P0 | **L1** 双拒后无 execution_confirmed | 拒满 N 次后强制收敛到可确认方案 / 拒后 clarify 不得冲掉 plan 门；核对 harness「确认执行」与领域 confirm 一致 | 放宽拒方案断言装绿；去掉分层必抽 reject |
| P0 | **L3** 交付后不 report | 加强「有 produced + bash 已执行 → 必催 report」（现有 deliverables nudge 未覆盖本例） | 放空 verification |
| P1 | **L2** 拒授权无恢复 | 拒后系统催再批或改只读核验再 report | 取消 refuse_once 人格 |
| P1 | **L4** T3 确认后再 propose_plan | 确认后 Stuck/nudge 禁 propose_plan、催 write | 恢复 tool_choice:required |

---

## 明确不是根因

- 人格池抽签 / schema 本身  
- 单纯「一轮跑 12 个太多」  
- 插话过早、ask_what 伪 type-ask（本批已有 PASS 证伪为主因）  
- tiers PATH=127（环境，已重跑取证）
