# 主分支未预发 · 三轮×4 多样性人格 UAT（12 种）

> 产品水位：`main` 未 GitHub Release 预发（测前打 Mac dist）。  
> 硬闸：**ADR-012**——测中只记问题，三轮汇总后等用户裁决再修。  
> 入口：`bash scripts-cdp/run-uat-persona-rounds.sh <1|2|3>`

## 轮次（人格跨轮不重复 · 共 12）

| 轮 | 人格 key | 标签 | 脚本 |
|----|----------|------|------|
| **R1** | impatient · picky · boundary · webcurious | 急躁 · 挑剔 · 越界 · 会查资料 | 既有 `uat-G-*.mjs` |
| **R2** | novice · contradictory · silent · neutral | 小白 · 矛盾 · 沉默 · 中性 | `uat-G-persona.mjs` |
| **R3** | scopecreep · terse · expert · anxious | 加需求 · 惜字 · 懂行 · 怕搞坏 | `uat-G-persona.mjs` |

结果：`/tmp/nf-uat-r{N}-results.txt`（`*=0` 为 PASS）。

## 记录模板（失败）

轮次 / 人格 / rc / 症状 / `/tmp/nf-live.log` / UD timeline / **不临修**

## 跑次日志

### 旧方案（作废）
- 曾按「每轮 2 人设」跑 R1：G-impatient=0、G-picky=0（06:30–06:36）
- R2 G-novice：写完无 `report_completion` → 无「已解决」→ autopilot 空等（已杀进程）；见会话取证

### 新方案 3×4（执行中追加）

### R1 · 2026-09-30 06:41–06:55 · asar 06:30
| 人格 | rc | 摘记 |
|------|-----|------|
| G-impatient | **1** | interrupt×6 / 无死锁双发 / 红线0；**terminal=timeout**（确认执行后未到已解决；无批准/写后动作） |
| G-picky | **0** | resolved；reject×2；rounds=9 |
| G-boundary | **0** | resolved；boundary-probe 已发 |
| G-web | **0** | resolved；webTool×5；曾 nudge-evidence |

问题（只记）：
1. **G-impatient timeout**：目标确认后插话×6 → nudge-propose-plan → 确认执行 → 随后无批准/已解决，空等到超时。日志 `/tmp/nf-uat-r1-run.log`；UD `/tmp/nf-uat-G-impatient-ud`

### R2 · 2026-09-30 06:56–07:09 · asar 06:30（G-neutral 07:10 补跑）
| 人格 | rc | 摘记 |
|------|-----|------|
| G-novice | **0** | resolved；曾 type-ask；批准→允许→已解决 |
| G-contradictory | **1** | **terminal=timeout**；确认执行后多次允许执行 + nudge-evidence，无已解决 |
| G-silent | **0** | resolved；纯按钮路径短闭环 |
| G-neutral | **0** | resolved（补 TASKS.neutral 后单跑）；候选→确认→执行→已解决 |

问题（只记）：
2. **G-contradictory timeout**：确认执行 → 允许×3 + nudge-evidence → 仍无已解决。日志 `/tmp/nf-uat-r2-run.log`；UD `/tmp/nf-uat-G-contradictory-ud`

### R3 · 2026-09-30 07:12–07:23 · asar 06:30
| 人格 | rc | 摘记 |
|------|-----|------|
| G-scopecreep | **0** | resolved；批准后 scope-ask 已发 |
| G-terse | **0** | resolved；澄清×2 + 允许×4 → 已解决 |
| G-expert | **0** | resolved；批准→允许×2→已解决 |
| G-anxious | **0** | resolved；interrupt×4；曾 nudge-evidence |

问题（只记）：无新 FAIL。

---

## 三轮汇总（ADR-012 · 待用户裁决再修）

| 轮 | 结果 | 产品问题 |
|----|------|----------|
| R1 | 3/4 | **#1 G-impatient `terminal=timeout`** |
| R2 | 3/4 | **#2 G-contradictory `terminal=timeout`** |
| R3 | 4/4 | — |
| **合计** | **10/12** | **2** |

### 问题清单（产品，测中未修）

1. **G-impatient timeout**（R1）  
   - 路径：确认目标 → 插话×6 → nudge-propose-plan → 确认执行 → **无批准/已解决，空等到超时**  
   - 断言旁证：interrupts≥6 ✓、无死锁/无双发 ✓、红线0 ✓；仅 `terminalResolved=false`  
   - 证据：`/tmp/nf-uat-r1-run.log` · UD `/tmp/nf-uat-G-impatient-ud`

2. **G-contradictory timeout**（R2）  
   - 路径：确认目标 → 确认执行 → 允许执行×3 + nudge-evidence → **仍无已解决**  
   - 红线0；无拒方案/插话  
   - 证据：`/tmp/nf-uat-r2-run.log` · UD `/tmp/nf-uat-G-contradictory-ud`

### harness 备注（非产品）
- `TASKS.neutral` 初缺 → G-neutral 首次 rc=2；补 key 后补跑 PASS。已写回 `uat-lib.mjs`。

**水位**：main 未预发 · Mac dist asar `2026-09-30 06:30` · `/tmp/nf-uat-main3r/.../NeonForge.app`  

---

## 根因分析（timeline 实证 · ADR-012 只析不修）

证据：`/tmp/nf-uat-G-impatient-ud/logs/timeline-*.jsonl` + `chat-*.jsonl`；`/tmp/nf-uat-G-contradictory-ud/logs/…`。  
对照既有：`docs/audits/uat-open-issues-rootcause-2026-09-29.md`（K3/K6 证据环）；ADR-007（tool_choice 恒 auto）。

### 总览

| # | 症状 | 叶因（原始） | 类属 |
|---|------|--------------|------|
| 1 | G-impatient timeout | **确认目标合成消息晚到误拒方案** → 确认执行后模型仍出「请点确认执行」纯文字、无 write；**软强制（forceTool 不进 API）+ 循环层未再 escalate** 接不住 | 竞态 + 推进兜底失效 |
| 2 | G-contradictory timeout | **verification 填不可核验伪命令** → evidence_missing → bash 补证已批并执行 → **未再 `report_completion`，改纯文字要授权** → 无已解决 | 证据回填环断裂 |

两例终点形态不同（#1 几乎无交付；#2 写完卡在证据门），**不要并成一个「timeout」修**。

---

### #1 G-impatient · 因果链

```
确认目标按钮
  → confirm('goal') + 异步 send("确认，目标清楚了")     [ConversationPanel ~2796]
  → 模型立刻 propose_plan → 方案卡 pending
  → 延迟到达的「确认，目标清楚了」撞上 plan pending
  → C2：非确认意图 → reject(plan, direction)             [~2282；timeline 22:42:23.612]
  → 模型进入「请点确认执行」话术（以为卡还在）
  → harness nudge-propose-plan → 二次 propose_plan
  → 真·确认执行 → execution.forced require-action
  → assistant_start forceTool=true 但 API tool_choice=auto（ADR-007 已知）
  → 模型再次纯文字催点卡，无 write                       [chat 末条；timeline 止于 ready]
  → 无 escalate/二次 nudge → harness timeout
```

**时间线锚点（UTC）**

| ts | 事件 | 含义 |
|----|------|------|
| 22:42:18.876 | `task.goal_confirmed` | 目标已确认 |
| 22:42:23.053 | `proposal.plan` + `plan.approved`(清单先涨) + 方案卡 | 首张方案 |
| 22:42:23.612 | `decision.resolved` action=**reject** reason=「确认，目标清楚了」 | **合成确认消息误拒方案** |
| 22:42:39 | `system_nudge` prompt propose_plan | harness/系统补救 |
| 22:42:47.324 | `task.execution_confirmed` + `execution.forced` | 真正确认 |
| 22:42:52.948 | assistant 纯文字「就等你点确认执行」 | **确认后仍催点卡，无工具** |
| 之后 | status=ready，无 write / 无 completion | 空等到 timeout |

**旁证**

- chat 仅 2 条用户气泡（目标确认词 / 方案确认词）；harness 记 interrupt×6，但 chat/timeline **未见**「还没好吗」等插话落盘——插话对本次 FAIL **非主因**（可能排队覆盖或未进日志；不挡上列叶因）。
- 首张 `propose_plan` 同期出现 `plan.approved`（plannedFiles 先追加）——拒绝后 `force_input.planned` 仍带路径，加重「已批准却在等确认」错觉。
- `forceTool` 仅 timeline 取证、**不进 API**（`gateway.ts` 注释；领域 A0/ADR-007）——本轮软强制失败时，StuckDetector/escalate **未**把会话推回工具调用。

**叶因判定**

1. **原始触发**：目标确认合成 `send` 与方案卡竞态 → 隐式拒方案（产品时序）。  
2. **致死近因**：真正确认执行后模型纯文字、无 write，且推进兜底未再咬合。  
3. **非叶因**：红线/死锁/双发均绿；不是「插话弄崩」。

---

### #2 G-contradictory · 因果链

```
确认执行 → write(index.html) OK → open OK
  → report_completion
       verification = 自然语言伪命令
       「node -e "读 index.html，抽取 <script>…"」
  → completion.evidence_missing
       missing=[]  unverifiable=[上述伪命令]          [23:02:06.194]
  → protocol nudge：用只读 shell 重提 report_completion
  → bash 需 L3 → 用户「允许执行」→ tool.executed
  → 模型输出：「请点一下确认卡放行…」纯文字            [23:02:37.963]
  → 无第二次 report_completion → 无已解决卡 → timeout
```

**旁证**

- 交付侧已成功：`produced` 含 index.html；卡在 **证据门闭环**，非写文件失败。
- 途中 `start-server` 拒 python http.server（旁路噪音，非终点）。
- evidence nudge 与 approval-pending 交错（`pending-user-decision` 时仍 force 一轮）→ 批准执行后模型 **忘了重提 completion**，改复读要授权话术。
- 与历史 K3/K6「evidence_missing 后不重报」同族；本例多一步：补证 bash **已跑通** 仍不重报。

**叶因判定**

1. **原始触发**：completion verification 提交不可核验命题（伪命令/未真实 stdout）。  
2. **致死近因**：补证 bash 成功后未再 `report_completion`，纯文字空转。  
3. **非叶因**：矛盾人格文案本身；红线 0。

---

### 与 PASS 人格对照（为何不是「全面坏」）

| 人格 | 差异 |
|------|------|
| silent / neutral / picky / … | 无「目标合成消息撞方案卡」竞态窗口，或确认后模型直接 write |
| anxious（亦有 interrupt） | interrupt×4 且最终 resolved——说明插话≠必然死；impatient 死在确认后无 write |
| contradictory vs anxious | 两者都曾 nudge-evidence；anxious **重报成功**，contradictory **补证后停在要授权话术** |

---

### 裁决用结论（仍不修，等用户拍板）

| 优先级 | 问题 | 建议修向（仅方向，未开工） | 禁止借此动的 |
|--------|------|---------------------------|--------------|
| P0 | #1 确认目标 `send` 与方案 pending 竞态 | 确认按钮：先发合成消息再放行后续轮 / 或确认词在 goal 刚确认的宽限内不触发 plan 隐式拒 | 放宽 C2 隐式拒语义本身（未证明过宽） |
| P0 | #1 确认后纯文字无 write | 加强确认后 StuckDetector/escalate（或确认后专用 nudge）——在 tool_choice 恒 auto 约束下 | 恢复 `tool_choice:required`；关 force 语义 |
| P0 | #2 evidence 后不重报 | 批准只读补证后硬门再逼 `report_completion`（对齐既有 shouldNudgeReportAfterEvidenceMissing 加强） | 放空 verification / 拆 unverifiable 硬挡 |
| P1 | #2 伪命令 verification | 提示词/校验：拒绝非真实已执行命令形态 | 改 G 任务文案降难度 |

**下一步**：用户裁决开修哪些叶；开修前保持 ADR-012（测中未改产品）。

---

## 修复关单 · 2026-09-30

方案：`docs/superpowers/plans/2026-09-30-uat-persona-12-fix.md`  
水位：asar `2026-09-30 07:49` · `/tmp/nf-uat-main3r/.../NeonForge.app`

| 叶因 | 修复 | 验证 |
|------|------|------|
| #1 确认目标合成消息撞方案卡 | `isDecisionCardEcho` 跳过 C2；C2 拒 plan 置 `planWasRejectedRef` | L1 + Mac **G-impatient=0** |
| #1 确认后纯文字催点卡 | `shouldNudgeWriteAfterPlanConfirm` | 同上 resolved；路径含确认执行→允许→已解决 |
| #2 补证后不重报 | `shouldNudgeReportAfterEvidenceMissing` 二次催 + readonly 打标 | Mac **G-contradictory=0** |
| #2 伪命令 verification | `buildEvidenceBackfill` 禁伪命令措辞 | L1 文案断言 |

日志：`/tmp/nf-uat-fix-verify-results.txt` → `G-impatient=0` `G-contradictory=0`（07:50–07:54）。  
L1：`agentLoop` + `conversationState` 191 passed；双 tsc 0。
