# Plan audit — 人格池试点收口失败修批

> 对象：`.cursor/plans/池超时修批_44761555.plan.md`  
> 对照：`docs/audits/uat-persona-pool-pilot30-2026-09-30.md`；A–D 关单；ADR-012；`uat-lib.mjs`  
> 本文件：R1 FAIL → R2 FAIL → **R3 PASS**

---

## Audit R1

# **FAIL**

（历史）关单软闸、跳号、Harness 必做与插话改义、缺 scripts 同步。详见原 R1 节（已消化）。

---

## Audit R2

# **FAIL**

### Verdict

R1 Blocking 多已回写，但引入 Task1b 后出现 **新阻塞**：早停误杀面、任务顺序与 Architecture 矛盾、残差门控仍只写 timeout。

### Blocking（R2）

| # | 问题 | 要求 |
|---|------|------|
| 1 | `stuck_no_plan` 用 `r >= maxRounds/2` | 拒方案/慢节奏未确认前会被误杀 → 改为 **仅 idle≥15 且无决策卡** |
| 2 | `stuck_after_plan` 未排除授权/方案卡 | 卡可见时不得早停 |
| 3 | Architecture：早停→烟测；正文 Task1 先烟测再 1b | 统一为 dist → 1b → 烟测 → Task2 |
| 4 | 残差门控 / Task6 / mermaid 仍写 timeout=0 | 改为 **收口失败**含 stuck_* |
| 5 | 「可选」stuck_after_approve | 删除可选；不采用第三门或并入 A 并有决策卡门闩即可 |
| 6 | Task7 pass/resolved/例外计数含糊 | 定义 pass / 收口失败 / 环境失败三计数 |

### Checklist R2

| ID | 结果 |
|----|------|
| A 攻击序 | WARN（1b 与烟测顺序乱） |
| B 红线 | PASS |
| C 关单 | WARN（计数不清） |
| E 可执行 | FAIL（早停误杀 + 门控词汇） |
| F harness 改义 | PASS（Task3 已定性） |
| G 包门禁 | PASS（已写同步 scripts） |

---

## Audit R3

# **PASS**

### Verdict

**PASS — 可按正文执行 Task1。** R2 Blocking 1–6 已写入现行方案。

### Checklist R3

| ID | 项 | 结果 | 证据 |
|----|-----|------|------|
| **A** | 攻击序 | **PASS** | Task1 dist+sync → Task1b stuck+烟测 → Task2 只记 → 条件 3–6 → Task7 |
| **B** | 红线 | **PASS** | Constraints + Task6 禁 verify/required |
| **C** | 关单硬闸 | **PASS** | pass≥10；收口失败=0；环境失败≤2 且定义清晰 |
| **D** | 假信心 | **PASS** | 簇 A=换包；B/C=条件 harness；Goal 成功态=resolved |
| **E** | 可执行无矛盾 | **PASS** | 决策卡集合写死；禁 half-rounds；门控用收口失败；无「可选」门 |
| **F** | harness 冒充产品 | **PASS** | Task3 定性句保留 |
| **G** | dist/scripts | **PASS** | Task1 同步；1b 后烟测防误杀 |

### Spot-check（R3）

| 方案声称 | 核对 |
|----------|------|
| 决策卡禁止 stuck | 方案列出 7 按钮 + nf-candidates；与 autopilot 可点集对齐 |
| idle 递增仅 !acted | 与现 `uat-lib.mjs` idleRounds 语义一致 |
| terminalResolved 仅 resolved | 与现 `uat-G-persona.mjs` `terminal === 'resolved'` 一致 |
| Task2 新水位基线 | 正文残差门控节已写明 |

### Nits（非阻塞 · 不挡执行）

- 执行开始时复制方案到 `docs/superpowers/plans/2026-09-30-uat-persona-pool-timeout-fix.md`（Task7 已列，可提前）
- runner 对 `config` 标注若尚未实现，Task5 第一步补结果文件约定即可

### 修订后预期

**无需 R4。** 用户批准后从 Task1 开工。
