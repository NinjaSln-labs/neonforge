# Plan audit — 人格池分裂叶因修批

> 对象（现行可执行）：[`docs/superpowers/plans/2026-09-30-uat-leaf-split-fix-v2.md`](../superpowers/plans/2026-09-30-uat-leaf-split-fix-v2.md)  
> 对象（作废）：[`…-fix.md`](../superpowers/plans/2026-09-30-uat-leaf-split-fix.md)（v1）  
> 对照：leaf-rca · leaf-remeasure · ADR-012 · `uat-lib.mjs` / `uat-G-persona.mjs`  
> 本文件：R1 FAIL → R2 FAIL → **v2 · Audit R3 PASS**

---

## Audit R3（对象 = v2）

# **PASS**

### Verdict

**PASS — 可按 v2 从 Task 1 执行。** R2 Blocking 1–2 已用策略级修正吸收；R1 B1–5 在 v2 中保留且无回潮。无新阻塞。

### R2 消化核对

| R2 # | 结果 | 证据（v2） |
|------|------|------------|
| 1 死卡解锁 | **PASS** | `deadConfirmLock`；解锁仅 `fp≠frozen` / `proposal.plan` since `missSeq` / `planConfirmed`；**禁止** `has(确认执行)` 单独解锁；miss 后立即 after-miss |
| 2 web_env 返回形 | **PASS** | 选定路径：`webBlocked` → `driveScenario` 内 `return { terminal:'web_env', actions, events, startSeq }`；零 autopilot；`terminalResolved` 对 web_env 为 false |

### Checklist R3

| ID | 项 | 结果 | 说明 |
|----|-----|------|------|
| **A** | 攻击序 / 叶因 | **PASS** | L1a→L1b→L2→L7→L4b→L5→L6→复测；禁旧 L3/L4 |
| **B** | 红线 | **PASS** | 不恢复 tool_choice:required；不缩池；保留 refuse_once/ask_what |
| **C** | 关单硬闸 | **PASS** | 三计数公式完整；web_env≠PASS |
| **D** | 假信心 | **PASS** | L2/L7 当场 silent；L5 harness Required；L1a 不以按钮表象解锁 |
| **E** | 可执行无矛盾 | **PASS** | 指纹+proposal.plan 解锁自洽；web_env return 形与 `driveScenario` 对齐；Task 7「选定启动顺序」为唯一执行路径 |
| **F** | harness 冒充产品 | **PASS** | web_env 非绿；产品主路径仍在当场 silent |
| **G** | dist/scripts | **PASS** | Task 8 完整 |

### Spot-check R3

| 点 | 结果 |
|----|------|
| `proposal.plan` 事件存在于 timeline 注册表 | **OK**（`timeline.ts`） |
| 按钮集相同的新旧卡：fp 可能不变 | **OK（有意）** — 主解锁靠新 `proposal.plan`；锁至重提方案符合 L1a |
| miss 后同轮 after-miss | **OK** — 不等 idle=3 |
| ensure 在 workspace ready 之后 | **OK** — 选定顺序 1→4 |
| 当场 reject/allow silent | **OK** — Task 3/4 |

### Nits（非阻塞 · 不挡执行）

- Task 7 正文先出现「ensure 移入 callback」草稿块，后文 **选定** `webBlocked` 路径 — 执行时 **只跟选定块**；可在开修前删掉草稿块以免误读  
- Task 2 单测步骤仍有 `/* ... */` 缩写 — 以 Step 2 完整实现为准展开断言即可  
- `planCardFp` 仅含按钮名：写进实现注释「fp 变化是辅；新 proposal.plan 是主」  
- Task 4 挂点：包装 `approveToolCall` / `approveAllRemember` / `approvePlan` 成功入口（与 reject 对称）

### 修订后预期

**无需 R4。** 用户批准后从 **v2 Task 1** 开工；勿执行 v1。

---

## 策略调整纪要（v1→v2）

| R2 根因 | v2 对策 |
|---------|---------|
| 用 `has(确认执行)` 把死卡当新卡 | `planCardFp` 冻结；仅 fp 变化 / 新 `proposal.plan` / 已确认 解锁；miss 后立即 after-miss |
| web_env 无 driveScenario 返回形 | `return { terminal:'web_env', actions, events, startSeq }` 且零 autopilot |

---

## Audit R2

# **FAIL**（历史 · 针对 v1）

### Verdict

R1 Blocking 1–5 **意图已回写且大体到位**；但 Task 1 **解锁死卡条件与「新卡」散文矛盾**；Task 7 早退仍是注释级伪代码。**不可执行。**（已用 v2 重订策略，勿再改 v1。）

### R1 消化核对

| R1 # | 结果 | 证据 |
|------|------|------|
| 1 当场 silent | **PASS** | Task 3/4 回调当场 `sendRef.silent`；Task 3 另有 harness 兜底 |
| 2 L5 Required | **PASS** | Task 6 Step 1 Required；Done when 写「必有」 |
| 3 web_env 早退 | **PARTIAL** | 意图正确；可执行形不足 → 并入 R2 Blocking 2 |
| 4 禁点死卡 | **PARTIAL** | `blockDeadConfirm` + after-miss 卡在也发 OK；解锁条件回潮 → R2 Blocking 1 |
| 5 三计数 | **PASS** | Global Constraints 硬闸公式完整 |

### Blocking（R2）

| # | 问题 | 要求 |
|---|------|------|
| **1** | Task 1 解锁：散文写「新方案卡」，代码却是 `after-miss 已发 && has('确认执行')` → 清 `missedConfirmExec` | 死卡在 after-miss **当时仍有**「确认执行」。须 **强制卡指纹**：miss 时记下 `planCardFp`（如 `修改方案|确认执行`+可见摘要哈希）；仅当 `has('确认执行') && currentFp !== planCardFpAtMiss`（或 timeline 新 `proposal.plan`）才清 block。**禁止**仅凭 `has('确认执行')` 解锁。 |
| **2** | Task 7 Step 2 仅注释「构造兼容结果」 | 写死早退片段，例如在 `driveScenario` 回调内：`if (wantsWeb && !webOk) return { terminal: 'web_env', actions: ['ensureWebAccess:fail'], events: readLatestTimeline().filter(...), startSeq }`；外层 `assertions.webAccess=false`；`terminalResolved` 仍 false；**pool results 行可解析 `web_env`**。禁止只写注释。 |

### Checklist R2

| ID | 项 | 结果 | 说明 |
|----|-----|------|------|
| **A** | 攻击序 / 叶因 | **PASS** | 映射未回退 |
| **B** | 红线 | **PASS** | 仍禁 required / 缩池 / 取消 refuse_once |
| **C** | 关单硬闸 | **PASS** | 三计数已钉 |
| **D** | 假信心 | **PASS** | L2/L7 不再「只加次数」；L5 不靠产品 pending |
| **E** | 可执行无矛盾 | **FAIL** | R2 Blocking 1–2 |
| **F** | harness 冒充产品 | **PASS** | web_env 非 PASS；当场 silent 为产品主路径 |
| **G** | dist/scripts | **PASS** | Task 8 未改坏 |

### Spot-check R2

| 点 | 结果 |
|----|------|
| after-miss 不要求 `!has(确认执行)` | **OK**（已改） |
| 解锁用 has(确认执行) | **FAIL**（死卡误开） |
| Task 3 Files「Optional」vs Step3「Required」 | **Nit**：统一为 Required |
| `lastPlanCardFp` 声明未用 | **Nit**：并入 Blocking 1 指纹方案 |
| Task 4 允许回调挂点 | **WARN**：须落在 `useToolApproval` 允许成功实参包装（与 reject 对称）；不升 Blocking |
| Task 6 候选卡刷屏时 idle 难满 | **Nit**：可加 `clarifyAnswerCount>=clarifyCap && !goal` 亦催 |

### Nits（非阻塞）

- Task 3 Files 行删掉 Optional，与 Step 3 Required 对齐  
- Task 8 抽检字面量列产品 message，不列 harness 系统提示  
- Goal 一句可括号引用「三计数硬闸」免读者只看 Goal 误读  

### 修订后预期

回写 R2 Blocking 1–2 后开 **Audit R3**。未 PASS 前 **不进入执行**。

---

## Audit R1

# **FAIL**（历史；正文已按下列 Blocking 回写）

### Verdict

叶因映射方向大体正确（未再误钉旧 L3/L4），且 ADR-012 / 关单硬闸骨架可用；但存在 **5 条 Blocking**：会让 L1a/L2/L5/L6 在复测上再次「看起来修了、尸体仍在」，或把环境失败假分类成关单例外。须回写方案后再开 R2。

### 回写状态（方案 `2026-09-30-uat-leaf-split-fix.md`）

| Blocking | 回写落点 |
|----------|----------|
| 1 L2/L7 当场 silent | Task 3/4 主路径改回调当场；纯文本/harness 为辅 |
| 2 L5 harness Required | Task 6 harness early goal 标 Required |
| 3 web_env 早退 | Task 7 ensure 失败跳过 autopilot |
| 4 禁点死卡 | Task 1 `blockDeadConfirm` + after-miss 卡在也发 |
| 5 三计数 | Global Constraints 硬闸公式 |

---

### Blocking（R1）

| # | 问题 | 要求（回写入方案正文） |
|---|------|------------------------|
| **1** | **L2/L7 仍只等「纯文本收尾」才 nudge**（Task 3/4） | 上一修批 L2 单次 silent **已未打穿 p087**；只把 `maxNudges`→2 同构失败模式。须增加 **拒/允回调当场** `silent send`（不依赖下一轮 `toolCalls.length===0`），或 harness 在 `button:拒绝` / `允许执行` 后 idle≤2 注入恢复催。否则 stuckIdle=8 仍先杀。 |
| **2** | **L5 harness 写成 Optional**（Task 6） | p091 开局 `type-ask` 时产品侧常 `pending≠none`（ask_user）→ `shouldNudgeProposeGoalAfterClarifyIdle` **门控恒假**。Harness `__nudge_propose_goal_early__` 必须 **Required**，不可 optional。 |
| **3** | **L6 `web_env` 分类时机错误**（Task 7） | 现行 `uat-G-persona.mjs`：`ensureWebAccessEnabled` 失败仍继续 `autopilot` → 终点仍是 `timeout`。仅在「场景结束时改 terminal」会变成 **事后贴标签**，且已烧掉整轮。须：`capabilityNeed==='needs_web' && !ensureOk` → **立即** `terminal=web_env` 并 **跳过 autopilot**（assertions 记 `webAccess:false`，非 PASS）。 |
| **4** | **L1a after-miss 条件与死卡互斥不清**（Task 1） | 分支要求 `!has('确认执行')`。若 miss 后卡仍在，会继续点死钮、**永不** after-miss（p002 类二次点击形态）。须写明策略：**miss 后若卡仍在，禁止连点同一确认，优先 after-miss repropose**（或 miss 计数≥1 后跳过 confirm 点击直到新 `propose_plan` 卡指纹变化）。 |
| **5** | **关单例外与 Goal 计数未钉死**（Task 7/8） | Goal 写「零 stuck/timeout」；L6 变 `web_env` 后是否计入 pass、是否占用「例外≤2」——正文未给三计数公式。须显式：`pass` = resolved；`收口失败` = stuck_*∪timeout；`环境失败` = config∪web_env；硬闸 = pass≥10 ∧ 收口失败=0 ∧ 环境失败≤2 ∧ T1–T4 全绿。 |

---

### Checklist R1

| ID | 项 | 结果 | 说明 |
|----|-----|------|------|
| **A** | 攻击序 / 叶因覆盖 | **PASS** | P0→P1→P2→复测；L1a/b、L2、L7、L4b、L5、L6 均有任务；禁旧 L3/L4 叙事 |
| **B** | 红线 | **PASS** | 不恢复 tool_choice:required；不缩池；不取消 refuse_once/ask_what |
| **C** | 关单硬闸 | **FAIL** | 缺三计数；web_env 与「零 timeout」关系含糊（Blocking 5） |
| **D** | 假信心 / 打偏尸体 | **WARN** | 未误修 p091=L3；但 Task 3 重复「加次数」假信心（Blocking 1）；Task 2 依赖领域 confirm 已真——依赖 Task 1，序正确，须在 Task 2 Why 写明前提 |
| **E** | 可执行无矛盾 | **FAIL** | Blocking 1–4：回调时机、L5 optional、web_env 早退、miss 后死卡 |
| **F** | harness 冒充产品 | **WARN** | L1a/L5/L4b harness 催促合理；L6 分类若早退正确则 OK；禁止把 web_env 当 PASS（方案已禁，保留） |
| **G** | dist/scripts | **PASS** | Task 8 rsync src+scripts + asar 字面量抽检 |

---

### Spot-check（对照代码）

| 方案声称 | 核对 |
|----------|------|
| miss 后无二次 repropose 因 `__nudge_repropose__` 用尽 | **属实**（p068：r17 已 repropose，r32 miss 后无新催；PASS p114 用的是「尚未用尽的首次 repropose」） |
| `ensureWebAccess` 失败仍跑完 | **属实**（`uat-G-persona.mjs` L89–91 忽略返回值） |
| 设置钮文案为「设置」 | **产品有** `MainWorkspace`「设置」；p042 miss 更可能是 **时机/页态**，方案仅扩 selector **不够**——R1 要求 Task 7 加 **waitFor 设置可见**（超时再 web_env） |
| evidence 产品已 maxNudges=2 | **属实**（Panel 已接线）；T3 主路径是 harness UI「完成声明」——Task 5 以 harness `_2` 为主正确，但 Step 2「核对」过虚，须改成 **Done when：harness 二次路径存在**；产品核对列为非阻塞 |
| Task 2 `idleNoWrite` 扩面 | **风险**：确认后每一轮无工具纯文本都会咬（最多 2 次）——可接受；须保留「有产出不走空转催写」测试（已有） |
| `capabilityNeed === 'needs_web'` | 方案写 `needsWeb`/`web` 轴——**应用** `capabilityNeed === 'needs_web'`（或 adapt 后 `webAsk`），禁止臆造字段名 |

---

### Nits（非阻塞）

- Task 2 实现稿在 `producedCount>0` 时仍可能因 asksClickConfirm 落 write 催——与注释「有产出交给 deliverables」略拧；建议 `producedCount>0` **直接 return false**，催点卡/再 propose 另议。
- Task 1：`missedConfirmExec=false` 在 after-miss 后清空 + `sentTexts` 单次——若二次 miss 无第三次路径，可接受；写一句即可。
- Task 8 asar 抽检：harness 文案不进 asar；产品字面量列表与 Task 2/4/6 message 对齐即可。
- Task 5 与 Task 1 同改 `uat-lib.mjs`——合并冲突风险；建议 Task 5 基线含 Task 1，或注明 rebase 序。

---

### 修订后预期

回写 Blocking 1–5 后开 **Audit R2**。未 R2 PASS 前 **不进入执行**。
