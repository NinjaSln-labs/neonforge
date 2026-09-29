# Plan audit — UAT open fix (t000057 · K4–K7)

> 对象：`docs/superpowers/plans/2026-09-29-uat-open-fix-k4-k7.md`  
> 对照：`docs/audits/uat-open-issues-rootcause-2026-09-29.md`；R3 §6 验收标准；准则 A–G。  
> 本文件含 **Audit R3（FAIL）** 与 **Audit R4（PASS）**。审计者不改写方案正文；未 commit。

---

## Audit R3

# **FAIL**

## 1. Verdict

**FAIL** — 不得按现行正文开工；须先修订方案再开 Audit R4。

## 2. Auditor posture

- 独立审计：本文件作者**未**撰写被审方案，亦不执行其任务。
- 日期：2026-09-29
- 审阅对象：`docs/superpowers/plans/2026-09-29-uat-open-fix-k4-k7.md`（自称「过审通过版 · Audit R3 PASS」）
- 对照：`docs/audits/uat-open-issues-rootcause-2026-09-29.md`；`.handoff/decisions/d000002.md` / `p000128`；代码 spot-check 如下表。
- 本审计**不改写**方案正文；仅裁决。未 commit。

---

## 3. Checklist A–G

| ID | 项 | 结果 | 证据 |
|----|----|------|------|
| **A** | RCA 攻击序覆盖（K5→取证 K7/K6→条件修→K4→整轮） | **PASS** | RCA §6：K5 → 取证 K7 → 取证 K6 → 窄修 K4 → 回归。方案 Architecture L14–19 / Task1→2→2b→3→4：T3→G-web 后 T4→G-picky，2b 有证才补丁，K4 在 2b 后，Task4 全量。未把 K4 提到取证前；K8 附录不挡关单。 |
| **B** | 设计红线泄漏（放宽 verifyCompletion / 删 T3 调研 / force propose） | **PASS** | Goal「不在范围」L9；G1→p000128/d000002；G2 禁 force；2b-A 禁「空 verification 放行」；2b-C/3b 禁 forceTool；收卷#7。对照 d000002：「未达门槛只动模块/harness」。未开「为绿改门」口子。 |
| **C** | 关单软闸（无 8/8 也可 close） | **PASS** | G7 L36：两结果文件须 `T1=0`…`T4=0` 且 `G-impatient=0`…`G-web=0`，否则禁 close。Task4 + 收卷#5/#8 同构。脚本约定见 `run-uat-tiers.sh:71` / `run-uat-personas.sh:74`：`$name=$rc`，0=脚本 exit 0。 |
| **D** | 假信心（env OK≠script PASS；试用关单） | **PASS** | Task1.2 分 K5-env / K5-script；分叉表禁混谈。G3/G11：关单强制 `NF_UAT_KEENABLE_KEY`；试用仅 Task1 诊断且须 `keenSource=trial`。收卷#2+#5+#6 并列，单靠 env 不能 close。 |
| **E** | 步骤可执行（路径/门禁/无矛盾） | **FAIL** | 见 Blocking #1：Task2「勾且仅勾一叶因 A\|B\|C\|D\|E（**定义同前版**）」——仓库内**无前版**可引用（仅此一份 plan）；2b 表只给「允许补丁类型」，**无诊断判据**。Agent 无法唯一勾选 → 2b 门禁与 G8 补丁路径不可执行。 |
| **F** | 台账称 R3 PASS 但 R1/R2 未消化 | **FAIL** | 方案 L258–269 宣称 R1(10)+R2(9)「全部有对应条款」「残留歧义：无阻塞歧义」且 **判定严格通过**。但 R1#7「2b 止损」依赖叶因 **E=不修** 可判定；叶因定义缺失 → R1#7 **未操作化**，R3「无阻塞歧义」为假。其余 R1/R2 条款多已落字（G5–G8、Gate A/B、keenSource 步骤、路径写死等），但台账 **R3 PASS 结论不可接受**。 |
| **G** | asar/dist 门禁假阴/假阳 | **PASS** | Gate A 字面量均在源码：`webTools.ts:11–13`（health/search URL）；`SettingsPanel.tsx:213`（「允许无 Key 公共试用」）；`agentLoop.ts:271`（「外网资料已连续检索多轮」）。Gate B 符号：`matchesPlannedPath` / `shouldNudgeProposeAfterResearch` 为 tsc 保留 export；`keenablePublicTrial` 在 main/renderer 配置面。G12 正确：asar 不用函数名作唯一依据。注：工作区现有 `dist/` 陈旧（无 Keenable / nudge），**须** Task0 `npm run dist` 后才跑 Gate B——方案 Step1→2 顺序正确，非假阳设计。 |

### Spot-check 摘要

| 声称 | 代码实况 |
|------|----------|
| RESULTS 路径 + rc=0 | `run-uat-tiers.sh:26,71` → `/tmp/nf-uat-tier-results.txt`；`run-uat-personas.sh:26,74` → `/tmp/nf-uat-persona-results.txt`。**一致**。 |
| `keenSource=` 日志 | `ensureWebAccessEnabled`（`uat-lib.mjs:307+`）现打 `Keenable Key from…` / `public trial on`，**尚无** `keenSource=key\|trial`。Task1.0「若尚无则先做」可执行；文件地图 L50 把该日志写成既成事实 → 措辞偏满（非阻塞，见 nits）。 |
| clarify / candidate | `uat-lib.mjs:502–541`：`__clarify__` 一轮 + fallback；`__ask_typed__` / `__ask_typed_2__` 存在。3a「只改 candidate、禁改 typed」与现状可对齐。 |
| asar nudge 串 | `shouldNudgeProposeAfterResearch` message 含 Gate A 子串（`agentLoop.ts:270–271`）。 |
| KEENABLE_* | `KEENABLE_HEALTH` / `KEENABLE_SEARCH` / `KEENABLE_SEARCH_PUBLIC`（`webTools.ts:11–13`）。 |

---

## 4. Blocking defects（FAIL · 执行前必须修）

1. **叶因 A–E 诊断定义缺失（准则 E，并击穿 F/R1#7）**  
   - 现状：Task2 L140–141「定义同前版」；仓库仅 `2026-09-29-uat-open-fix-k4-k7.md` 一份，无前版；RCA 亦无 A–E 枚举。  
   - 2b 表（L150–156）只规定「勾中后允许改什么」，不规定「timeline 何种证据勾 A/B/C/D/E」。  
   - 后果：无法「勾且仅勾一叶因」→ 2b 门禁、E 止损、补丁范围全部漂移。

2. **审计台账 R3 自通过无效（准则 F）**  
   - 在 #1 未修前，不得维持「Audit R3 PASS / 无阻塞歧义 / 允许开工」。  
   - 修订后须 **独立 R4** 再判；方案头「过审通过版」须撤回或改为「待审」。

---

## 5. Non-blocking nits

| # | 说明 |
|---|------|
| N1 | 文件地图 L50 写 `keenSource=` 日志已在 `uat-lib.mjs`——实为 Task1.0 待做；易误导跳过 1.0。 |
| N2 | 3b「窄谓词」未锚到 `shouldNudgeProposeAfterResearch`（或显式排除 `verifyCompletion` 谓词）；有误读风险，但 G1/收卷#7 已兜底 → 不升阻塞。 |
| N3 | Task0 Step4 `ASAR=release/mac/...` 未写死 `cd apps/desktop`（与 scripts 惯例一致，建议一句 cwd）。 |
| N4 | Architecture L18「T3/G-web 未脚本 PASS」与 Task3 门禁「T3 **或** G-web 假」口语略歧；以 Task3 正文为准即可。 |

---

## 6. 要求方案修订的验收标准（R4 再审入口）

**本审计不重写方案。** 修订版须同时满足：

1. **内联叶因定义表**（T4 与 G-picky 可分列或共用）：每条含  
   - 触发证据（timeline/UI 可观察条件）；  
   - 互斥规则（为何不是其它字母）；  
   - 与 2b 允许/禁止补丁的一一对应；  
   - **E** = 证据不足 / 非模块可修 → 禁 2b。  
   删除或替换「定义同前版」——不得依赖已不存在的文档。
2. **撤回**正文与台账中的「Audit R3 PASS / 严格通过 / 允许开工」；改为待 R4。
3. R1#7 / R2 相关行更新为「叶因定义已内联」处置，不得仅写「E 禁补丁」而无 E 的判定句。
4. （建议）文件地图与 Task1.0 对齐：`keenSource=` 标为待加；3b「窄谓词」加半句排除 verifyCompletion。

满足 1–3 后另开 **Audit R4**；未通过前禁止执行 Task0+ 与 `close t000057`。

---

## Audit R4

# **PASS**

## 1. Verdict

**PASS** — **允许按方案执行选项开工**。

审阅对象为现行 `docs/superpowers/plans/2026-09-29-uat-open-fix-k4-k7.md`（头标「待 Audit R4」）。本轮独立审计**未**撰写或修订该方案。日期：2026-09-29。未改方案文件；未 commit。

---

## 2. R3 §6 验收标准（入口门槛）

| # | 标准 | 结果 | 证据（现行方案） |
|---|------|------|------------------|
| 1 | 内联 A–E 叶因表：触发证据、互斥、→2b、E=禁 2b；无「定义同前版」 | **PASS** | 「叶因定义表」段：A–E 四列齐全；判定序「自上而下首命中 / 皆不命中→E」；正文已无「定义同前版」（仅台账 R3 回顾引用历史缺陷）。 |
| 2 | 无「Audit R3 PASS / 允许开工」；待独立 R4 | **PASS** | 头：`方案状态：待 Audit R4`；`未获独立 R4 PASS 前禁止 Task0+ 与 close`。台账 R3 节诚实记录独立 FAIL；R4 节写「待独立进程」。无自报通过。 |
| 3 | R1#7 经 E 判定句操作化 | **PASS** | 叶因表 E 行 + 紧随句：「勾 E ⇒ 禁止 Task2b 任何代码；该档 Task4 FAIL ⇒ 不得 close」。台账 R1#7 处置指向「叶因表 E 判定句 + 禁 2b + FAIL 拆 action」。 |
| 4 | （建议）R3 nits | **PASS** | N1：文件地图标 `Task1.0 待加 keenSource=`。N2：3b 显式禁 `verifyCompletion` / `evidenceVerifiable` / 对账谓词。N3：Gate A Step4 写死 `cd …/apps/desktop`。N4：Architecture「T3 **或** G-web 脚本未 PASS」与 Task3 门禁对齐。 |

§6 全真 → 进入准则 A–G 复评。

---

## 3. Checklist A–G（复评现行正文）

| ID | 项 | 结果 | 证据 |
|----|----|------|------|
| **A** | RCA 攻击序 | **PASS** | Architecture / Task1→2→2b→3→4：K5(T3→G-web) → 取证(T4→G-picky) → 有证 2b → 条件 K4 → 8/8 关单。对齐 RCA §6；K8 仍附录。 |
| **B** | 设计红线 | **PASS** | Goal 不在范围；G1/G2；2b-A 禁空 verification；2b-C 禁 force report；3b 禁 verifyCompletion / forceTool；收卷#7。无「为绿改门」口子。 |
| **C** | 关单硬闸 | **PASS** | G7 + Task4 裁决表 + 收卷#5/#8：两结果文件须 `T1=0`…`T4=0` 且 `G-impatient=0`…`G-web=0`，否则禁 close。脚本 `run-uat-tiers.sh:26,71` / `run-uat-personas.sh:26,74` 仍写 `$name=$rc` 至上述路径。 |
| **D** | env≠script；试用≠关单 | **PASS** | Task1.2 K5-env / K5-script 分叉；G3/G11 + 收卷#6：关单强制 Key；试用仅 Task1 诊断且须 `keenSource=trial`。 |
| **E** | 步骤可执行 | **PASS** | R3 阻塞已消：叶因表可唯一勾选；2b 门禁「∈{A,B,C,D} ∧ timeline 原文行；E→禁 2b」与表一致；Task0 Gate A/B 路径与 cwd 可跑。无「定义同前版」依赖。 |
| **F** | 台账诚实 | **PASS** | 不宣称 R3 PASS；R3 节记录独立 FAIL 与修订点；R1#7 已绑 E 判定句；R4 待本审计。无「无阻塞歧义 / 严格通过」自报。 |
| **G** | asar/dist 门禁 | **PASS** | Gate A 字面量仍在源：`webTools.ts:11–13`；`SettingsPanel.tsx:213`；`agentLoop.ts:271`。Gate B 符号仍为可 rg 的 export/配置面。G12：asar 仅稳定字面量。Task0 Step1→2 顺序正确。 |

### Spot-check 摘要（R4）

| 声称 | 代码实况 |
|------|----------|
| RESULTS + rc=0 | 与 R3 一致；路径未改。 |
| `keenSource=` | `uat-lib.mjs` `ensureWebAccessEnabled` **仍无** `keenSource=` 行 — 与「Task1.0 待加」一致，非假既成。 |
| 叶因表可执行性 | A/B/C/D 触发条件 timeline/UI 可观察；互斥指向其它字母；E 兜底禁 2b。与 Task2 / 2b 表无矛盾。 |
| Gate A / nudge | 四字面量与 `shouldNudgeProposeAfterResearch` 文案子串仍在源码。 |

---

## 4. Blocking defects

无。

---

## 5. Non-blocking nits（不挡 PASS）

| # | 说明 |
|---|------|
| N1 | 叶因 B「forced … **密集**」略定性；但要求 planned/produced 路径各 ≥1 例，足以落地。 |
| N2 | Task3 Done when 主写「T3 K5-script 真」；若仅 G-web 脚本假进入 Task3，收口表述略偏 T3——以门禁 1–3 + 允许再单跑 T3 为准即可。 |

---

## 6. 开工许可

**允许按方案执行选项开工**（从 Task0 起；仍受方案 G1–G12、叶因门禁与收卷过审清单约束）。  
`close t000057` 仍仅当 Task4 8/8 + 收卷清单全 ✅。
