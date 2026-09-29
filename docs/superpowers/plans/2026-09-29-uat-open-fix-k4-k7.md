# UAT 未决修复方案（t000057 · K4–K7 / K5）

> **For agentic workers:** implement task-by-task; checkbox steps for tracking.  
> Spec / RCA：`docs/audits/uat-open-issues-rootcause-2026-09-29.md`  
> **方案状态：Audit R4 PASS**（独立审计：`docs/audits/plan-audit-uat-open-fix-2026-09-29.md`）。允许按执行选项开工；改 G1–G12 / 关单门槛 / 叶因表须重开审计。  
> 已收口勿回滚：K1/K2 leftover · K3 ADR-011（R2：T1 + G-boundary PASS）

**Goal:** 证绿 **K5**，取证后仅按叶因窄修 **K4/K6/K7**，Mac **8/8 脚本 rc=0** 后方可 `close t000057`。  
**不在范围：** 放宽 `verifyCompletion`、删 T3 调研、force `propose_*`/`report_completion`、关 StuckDetector / ProgressGuarantee、K8（附录）。

**Architecture（Mac 单实例 · 严格串行）：**

```
0  构建 → 部署 → asar/字符串门禁
1  K5：T3 → G-web
2  K7/K6：T4 → G-picky（叶因；无证禁止模块补丁）
2b 条件：叶因 A/B/C/D + timeline 行引用 → 补丁（模块或 harness）
3  条件 K4：外网已开 ∩（T3 **或** G-web 脚本未 PASS）∩ 澄清卡证据 → 仅 candidate 多轮
4  全量 tiers + personas → 8/8 rc=0 + 过审清单 → close t000057
```

**Tech Stack:** Mac `NeonForge.app` · `scripts-cdp/*` · 条件改 `apps/desktop` · handoff CLI。

---

## Global Constraints

| ID | 约束 |
|----|------|
| G1 | 设计门槛未达 → 禁止借 timeout 改门/任务语义（p000128/d000002） |
| G2 | 不 force 协议工具（propose_* / report_completion） |
| G3 | 禁静默 `/public`（p000134）。UAT **关单路径必须** `NF_UAT_KEENABLE_KEY` 非空；无 Key **禁止**进入 Task4。试用仅允许 Task1 **诊断**（须打 `keenSource=trial`），不得用于关单证明 |
| G4 | 凭据只经 env / 本机路径，不入库 |
| G5 | Mac **串行**（p000016）；禁止并行占 9222 |
| G6 | Task1 结束 **不得**跳过 Task2 |
| G7 | **关单硬闸：** `/tmp/nf-uat-tier-results.txt` 含 `T1=0`…`T4=0` **且** `/tmp/nf-uat-persona-results.txt` 含 `G-impatient=0`…`G-web=0`（脚本约定 0=PASS）。任一非 0 → **禁止** `close t000057`；只 `edit` + `add action` 拆残留。禁止用部分断言冒充绿 |
| G8 | 模块或 K4/2b 产品补丁后：先 `uat-T1.mjs` PASS，再单跑被修档 |
| G9 | 未要求不 commit；Conventional Commits |
| G10 | 硬闸 **ADR-012**（p000127：测完再修；测试轮禁止临修） |
| G11 | Task4 启动前 shell 必须 `test -n "${NF_UAT_KEENABLE_KEY}"` |
| G12 | asar 门禁只用 **稳定字面量**（URL/中文文案）；不用易被 minify 吞掉的函数名作唯一依据 |

---

## 文件地图

| 文件 | 职责 |
|------|------|
| `apps/desktop` dist / Mac asar | 水位 |
| `scripts-cdp/uat-lib.mjs` | Keenable；**Task1.0 待加** `keenSource=` 日志；candidate 澄清 |
| `scripts-cdp/uat-T*.mjs` / `uat-G-*.mjs` | 硬断言 |
| `scripts-cdp/run-uat-tiers.sh` | → `/tmp/nf-uat-tier-results.txt` |
| `scripts-cdp/run-uat-personas.sh` | → `/tmp/nf-uat-persona-results.txt` |
| `src/domain/*` 等 | 仅 2b/3b |
| Mac `/tmp/nf-uat-*-ud/` | 取证 |
| t000057 | 关单 |

---

### Task 0: 构建 / 部署 / 门禁

**Done when:** Gate A 全命中；Gate B 在构建机命中；输出贴进 t000057 detail。

**Gate A（Mac asar · 必过）字面量：**

```text
https://api.keenable.ai/health
https://api.keenable.ai/v1/search
允许无 Key 公共试用
外网资料已连续检索多轮
```

**Gate B（构建机 `dist/` · 必过，防 minify 假阴）：**

```bash
rg -q 'matchesPlannedPath' dist/ || exit 1
rg -q 'shouldNudgeProposeAfterResearch' dist/ || exit 1
rg -q 'keenablePublicTrial' dist/ || exit 1
```

- [ ] **Step 1:** `cd apps/desktop && npm run dist`
- [ ] **Step 2:** 跑 Gate B；失败则停（打包内容不对）。
- [ ] **Step 3:** 部署到 Mac：`$HOME/Documents/ninjasin-labs/neonforge/apps/desktop/release/mac/NeonForge.app`
- [ ] **Step 4:** Mac（cwd=`apps/desktop`）Gate A：
  ```bash
  cd ~/Documents/ninjasin-labs/neonforge/apps/desktop
  ASAR=release/mac/NeonForge.app/Contents/Resources/app.asar
  for s in \
    'https://api.keenable.ai/health' \
    'https://api.keenable.ai/v1/search' \
    '允许无 Key 公共试用' \
    '外网资料已连续检索多轮'
  do
    strings "$ASAR" | grep -F -q "$s" || { echo "MISSING $s"; exit 1; }
  done
  echo "asar gate A OK"
  ```
- [ ] **Step 5:** detail 记：构建时间、Gate A/B OK、部署主机。

---

## 叶因定义表（Task2 唯一权威 · 内联）

对 **T4** 与 **G-picky** 分别勾选；每档 **恰好一个**字母。判定顺序：**先扫证据 → 自上而下第一条命中即勾；皆不命中 → E**。

| 叶因 | 触发证据（须在 timeline/UI 可观察） | 互斥（不当成其它字母的理由） | → 2b |
|------|--------------------------------------|------------------------------|------|
| **A** | ≥2 次 `completion.evidence_missing`（或等价），且中间无 `decision.resolved`；detail 列出 missing 键名 | 不是「从未 report」→ 那是 C；不是「forced 空转主因」→ B | 模块：backfill / V1a 边角 |
| **B** | `execution.forced`（或 force 打点）密集，且 `plannedComplete` 语义上应完成仍 require-action；附 planned vs produced **路径字符串各 ≥1 例** 形态不一致 | 有 evidence_missing 循环仍优先 A（证据门未过才是主因） | 模块：`matchesPlannedPath` 调用点 |
| **C** | 边界/人格探针已发（或 T4 探针断言相关事件已出现），其后 **无** `report_completion` / 无 completion 提议直至超时 | 已多次 evidence_missing → A；已 resolved → D | 文本 nudge / sysPrompt；禁 force report |
| **D** | timeline 已有 `decision.resolved`（或 UI 已解决卡），但脚本 `terminal!==resolved` / exit≠0 | 产品未到已解决 → 非 D | **仅 harness** 认终态 |
| **E** | 证据不足、矛盾、或非模块/harness 可修（纯模型超时且无 A–D 模式） | — | **禁止 2b**；关单轮若仍 FAIL → 拆残留 action |

R1#7 止损操作化：**勾 E ⇒ 禁止 Task2b 任何代码**；该档 Task4 FAIL ⇒ 不得 close t000057。

---

### Task 1: K5 — T3 → G-web

**Preconditions:** Task0 OK；`NEONFORGE_COMMANDCODE`；诊断可用试用，但须标明。

#### 1.0 harness 观测（若尚无精确日志则先做）

- [ ] `ensureWebAccessEnabled` 在选定路径后打印 **恰好一行**：
  - `keenSource=key` 或 `keenSource=trial`
  - （可保留原有中文 log，但不替代本行）

#### 1.1 跑档

- [ ] 清 Electron；9222 空闲。
- [ ] `uat-T3.mjs` → 再 `uat-G-web.mjs`（串行）。

#### 1.2 记录两层结果（不得混为一谈）

| 层 | 含义 | 判定 |
|----|------|------|
| **K5-env** | 外网可开可搜 | `keenSource=*` ∧ `webAccessUiOk=true` ∧ 非 probe failed ∧ 见 web 工具 |
| **K5-script** | 该档脚本验收 | 进程 exit 0 且脚本打印 PASS |

- [ ] **分叉：**

| 情况 | 下一步 |
|------|--------|
| K5-env 假 | **停**。查 Key/试用/health/代理。禁止改探活回 example.com / 改 verifyCompletion |
| K5-env 真 ∧ K5-script 假 | → Task2；detail 标 **K4 候选** |
| K5-env 真 ∧ K5-script 真（两档） | → Task2（**仍必做**） |

**Done when:** 上表一行 + 日志路径入 detail。

---

### Task 2: K7 / K6 取证

**序：** `uat-T4.mjs` → `uat-G-picky.mjs`。不与 Task1 并行。

- [ ] 保留 UD；`rg -n` 摘录 evidence_missing / forced / report_completion / propose_plan / decision.resolved / reject。
- [ ] T4：**恰好勾一叶因**（上表 A–E；自上而下首命中）。
- [ ] G-picky：确认 planRejects≥2 后行为；**恰好勾一叶因** A–E。
- [ ] **进入 2b 门禁：** 叶因 ∈ {A,B,C,D} **且** detail 含 ≥1 条 timeline **原文行**。**E → 禁止 2b。**

**Done when:** 两档叶因齐；非 E 有行引用。

---

### Task 2b:（条件）补丁

| 叶因 | 允许 | 禁止 | 补丁后 |
|------|------|------|--------|
| A | backfill / V1a 边角（合 ADR-011） | 空 verification 放行 | G8：T1→该档 |
| B | matchesPlannedPath 调用点 | 关 ProgressGuarantee | G8 |
| C | sysPrompt / 文本 nudge | force report_completion | G8 |
| D | **仅 harness** 认 resolved | 改产品已解决语义 | 该档脚本 |
| E | — | 任何代码 | — |

- [ ] L1 先红后绿（文件+用例名入 detail）。
- [ ] 最小实现。
- [ ] G8。
- [ ] 「补丁摘要 ↔ timeline 行」入 detail。

---

### Task 3: K4 candidate 多轮（条件）

**门禁（全满足，否则整节跳过）：**
1. Task1 **K5-env** 真  
2. Task1 中 T3 或 G-web **K5-script** 假  
3. **新鲜** T3（或 G-web）timeline/UI：存在未消化的候选澄清 / 新一轮 ask_user（非探活失败）— 允许为取证再单跑一次 T3

#### 3a（默认唯一代码路径）

- [ ] 只改 **candidate** 路径；**禁止**改 `__ask_typed__` / `__ask_typed_2__` 语义。
- [ ] 指纹 = 可见候选文案 **排序后 join**（禁止 dump 切片）。
- [ ] 每指纹 1 次；全局 `clarifyAnswerCount≤3`。
- [ ] 首次应答仍置 `__clarify__`（急躁门兼容）。
- [ ] `node --check scripts-cdp/uat-lib.mjs`
- [ ] 单跑 T3；detail 记 clarify 次数。

#### 3b（默认关闭）

额外：3a 后仍 web **失败**（policy/网络）且无 propose；timeline 排除「检索成功不提议」。  
只许改 `shouldNudgeProposeAfterResearch` 的 **message 字符串** 或与其同文件的并列窄谓词（输入仍为 web streak / 失败标志）；**禁止**改 `verifyCompletion` / `evidenceVerifiable` / 任何对账谓词。L1 +2 用例；禁 forceTool；G8。

**Done when:** 跳过合法，或 T3 K5-script 真，或书面「模型超时非澄清门」（附 timeline）。

---

### Task 4: 整轮 + 关单

**Preconditions:** Task0–2 Done；2b/3 按门禁做完或跳过；**G11 Key 非空**。

- [ ] `test -n "${NF_UAT_KEENABLE_KEY}"`（失败则不得跑关单轮）。
- [ ] `bash scripts-cdp/run-uat-tiers.sh` → 出示 `/tmp/nf-uat-tier-results.txt` 四行 `T*=0`。
- [ ] `bash scripts-cdp/run-uat-personas.sh` → 出示 `/tmp/nf-uat-persona-results.txt` 四行 `G-*=0`。
- [ ] **裁决：**

| 条件 | 动作 |
|------|------|
| 8/8 且下方「收卷过审清单」全 ✅ | `handoff close t000057 --outcome '…'` |
| 任一 FAIL | **禁止 close**；edit t000057 + 每残留档一条新 action（summary 含叶因） |

- [ ] `handoff check` OK。
- [ ] （非门禁）RCA 可补 R3 结果表。

---

## 收卷过审清单（close 前 · 证据可出示）

| # | 检查 | 证据形态 |
|---|------|----------|
| 1 | Task0 Gate A+B | 终端输出 / detail |
| 2 | Task1 keenSource + webAccessUiOk | 日志 |
| 3 | Task2 两叶因；非 E 有 timeline 原文 | detail |
| 4 | 若 2b/3a/3b 改了产品或 nudge：G8 T1 PASS | 日志 |
| 5 | tier-results 四 0 + persona-results 四 0 | 文件全文 |
| 6 | G11 Key 非空（关单轮） | `test -n` 记录；**无密钥值** |
| 7 | 未改 verifyCompletion / 未删 T3 调研 / 未 force propose_* | diff 或声明+抽查 |
| 8 | `handoff check` OK | 输出 |

缺任一项 → **方案执行未收**，t000057 保持 open。

---

## 审计台账（修订闭环）

### Audit R1 — 初版方案（已否决）

| # | 意见 | 处置 |
|---|------|------|
| 1 | Task1 绿跳过 Task2 | G6；分叉表强制 Task2 |
| 2 | 「并行取证」与单实例冲突 | Architecture 改串行；G5 |
| 3 | 部署步骤空心 | Task0 |
| 4 | Key vs 试用含糊 | G3；关单强制 Key（R2 再收紧） |
| 5 | 3a dump 指纹抖动 / 动 typed 路径 | 稳定候选指纹；禁改 typed |
| 6 | 3b 易削弱调研 | 默认关闭 + 额外门禁 |
| 7 | 2b 止损不清 | **叶因表 E 判定句 + 禁 2b + FAIL 拆 action**（R4 修订） |
| 8 | 部分断言冒充 PASS | G7 |
| 9 | 补丁无 T1 回归 | G8 |
| 10 | K8 噪音 | 附录 |

### Audit R2 — 收紧版（本轮审查 · 曾未通过）

| # | 意见 | 本版处置 |
|---|------|----------|
| 1 | Architecture 把 K4 写在 2b 前 | 改为 2→2b→3→4 |
| 2 | asar 用函数名不稳 | G12；Gate A 字面量 + Gate B dist |
| 3 | keenSource 与代码 log 不一致 | Task1.0 强制 `keenSource=` 行 |
| 4 | 试用可混进关单 | G3/G11：关单禁止无 Key |
| 5 | 叶因 D 进不了 2b 但表里有 D | Task2 门禁含 D（harness-only） |
| 6 | personas 结果路径未写死 | `/tmp/nf-uat-persona-results.txt` |
| 7 | K5-env 与 script PASS 混谈 | Task1.2 两层表 |
| 8 | Task3 缺新鲜 T3 证据 | 门禁 3 允许再单跑 T3 |
| 9 | 缺审计台账/再审出口 | 本节 + 下方 R3 |

### Audit R3 — 复审结论（**独立审计推翻**）

独立进程审计（`docs/audits/plan-audit-uat-open-fix-2026-09-29.md`）判定 **FAIL**：

| 阻塞 | 内容 |
|------|------|
| E | 「叶因定义同前版」不可执行 |
| F | 自报 R3 PASS 无效 |

**本版修订（R3→R4 入口）：** 内联叶因表；撤回通过声明；文件地图 keenSource=待加；3b 排除 verifyCompletion；Gate A 写死 cwd；Architecture 与 Task3「T3 或 G-web」对齐；R1#7 止损句写入叶因表。

### Audit R4 — 独立进程结论

**PASS**（`docs/audits/plan-audit-uat-open-fix-2026-09-29.md`）。允许按执行选项开工。

---

## 附录 · K8 L5（不挡关单）

串行 visual；另开 action。

---

**执行选项：**

1. **Subagent-Driven（推荐）** — 每任务新代理；主代理按收卷过审清单复核后才允许 close  
2. **Inline** — 本会话执行（Mac + `NF_UAT_KEENABLE_KEY` 就绪）

选哪个？
