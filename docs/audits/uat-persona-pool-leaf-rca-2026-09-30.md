# 人格池叶因复测 · 原始根因汇总（ADR-012 只析不修）

> 权威复测只记：[`uat-persona-pool-leaf-remeasure-2026-09-30.md`](./uat-persona-pool-leaf-remeasure-2026-09-30.md)  
> 对照测批 RCA：[`uat-persona-pool-rca-2026-09-30.md`](./uat-persona-pool-rca-2026-09-30.md)  
> seed=`pilot30` · asar `2026-09-30 19:40` · 修批 commits `21af73b`/`13ce924`/`e457987`/`caae0ac`/`3205c2c`  
> 池：`/tmp/nf-uat-pool-leaf-remeasure.log`（本机 tee：`…-local.log`）· tiers：`…-tiers-leaf-remeasure.log`  
> UD 约定：`/tmp/nf-uat-G-pool-<id>-ud/logs/timeline-*.jsonl` · T3：`/tmp/nf-uat-T3-ud/…`（或 tiers harness 等价 UD）  
> **证据等级：** 本文件以 **Mac remasure harness 动作链 + harness 内嵌 timeline 门检** 为叶因主证（`click-confirm-exec but no task.execution_confirmed yet` / `stuck_after_plan` 仅在 `planConfirmed===true` 时触发 / `nudge-evidence` 仅当 UI 含「完成声明已提交」）。本会话 **未能 SSH 拉取 raw UD jsonl**（子 agent sandbox 禁 LAN）；凡写「须 UD 复核」的点，下一裁决轮补 cat timeline 即可，**不改本叶因骨架结论**。

## 一句话

复测 **6/12 FAIL + T3 红** 不是「旧 L1–L4 原样未修」，而是形态已分裂：  
① **L1 仍在但须分裂**：首次「确认执行」无 `execution_confirmed` 在 PASS（p114/p055）也常见——**不是**独有致死点；p068 死在 miss 后无二次收敛（**L1a**）；p002 二次确认后仍不交付（**L1b**）；  
② **L2 仍在**（p087 refuse_once 后 stuck，且已确认过执行）；  
③ **旧 L3/L4 标签对不上本轮主尸**——p091 根本没走到 write（**L5**）；T3 已出现「完成声明」+ evidence nudge（**L4b**），不再是字面「确认后再 propose_plan」；  
④ **新残**：p106 ask_what→允许后空转（**L7**）；p042 `ensureWebAccess` 失败后早挂（**L6**）。

PASS（p114/p055/p005/p076）证明：双拒后二次确认、ask_what 短路径、interrupt+boundary **可以**绿——失败不是池框架整体坏掉。

---

## 总览（形态更新后的叶表）

| 叶因 ID | 原始触发（证据） | 致死近因 | 本轮命中 | 相对旧 L1–L4 |
|---------|------------------|----------|----------|----------------|
| **L1a** | 拒满后首次「确认执行」无 `execution_confirmed`，且 **无二次收敛** | 执行门始终未开 → timeout | **p068** | 旧 L1；**首次 miss  alone 非致死**（PASS 也 miss） |
| **L1b** | 同 L1a 首次无 confirm；随后 `nudge-propose-plan` + 二次「确认执行」**无**「no execution_confirmed」日志 | 二次点击后 `planConfirmed` 很可能已真，但 **无批准/无收口** → timeout（非 `stuck_after_plan`） | **p002** | 旧 L1 × 确认后不写；**勿再与 L1a 并一条** |
| **L2** | `approvalPolicy=refuse_once` → `button:拒绝` | 拒后无再授权/改道/report → `stuck_after_plan`（**隐含已 `execution_confirmed`**） | **p087** | 旧 **L2** 仍准确 |
| **L3\*** | （旧）write+bash 后无 `report_completion` | — | **本轮 harness 面未见** | 旧 L3 **不宜再钉 p091** |
| **L4\*** | （旧）T3 确认后 `propose_plan` | — | **本轮非主形态** | 旧 L4 **须改名/降级** |
| **L5** | `ask_what`/`vague` 开局 `type-ask` 后无目标卡/方案卡 | 从未进入 plan 门 → timeout | **p091** | **新叶**（测批曾是确认后 stuck，复测早挂） |
| **L6** | `needs_web` + `ensureWebAccess: no 设置 button` | 模型澄清「请去设置开外网」→ 点候选后空转；`planRejects=0` | **p042** | **新叶 / web-env**（测批曾走过双拒+confirm+web-ask） |
| **L7** | `ask_what` 在确认执行后追问授权 → `允许执行` | 允许后 **idle≥8** → `stuck_after_plan`（无后续批准写文件/收口动作） | **p106** | **新残**（测批同人格曾 PASS） |
| **L4b** | T3（remasure harness）：`确认执行`→`web-ask`→**`nudge-evidence`**→ timeout | 已出现「完成声明」证据催，仍未 resolved；**非**字面再 `propose_plan` | **T3** | 旧 L4 **分裂**：证据/web 收口失败。注：`/tmp/nf-uat-evidence/T3-timeline.jsonl` 为 **09-29 旧档**，不可当本轮 UD |

已排除 / 降级：

| 曾疑 | 本轮结论 |
|------|----------|
| 「旧 L1–L4 原样全灭」 | **否**；p114/p055 从测批 timeout → 本轮 resolved，说明 L1 修批 **部分生效** |
| 插话过早 | p076 interrupt×6 仍 PASS → 非主因 |
| ask_what 一律有毒 | p005 PASS；毒在 **L5 早挂** 与 **L7 允许后空转**，非 ask_what 本身 |
| 单纯 timeout | 终点标签；下表叶因才是因 |
| p091=旧 L3（已交付不 report） | **证伪于本轮 harness**：仅 `type-ask`，无 confirm/write 面 |
| T3=旧 L4（确认后再 propose_plan） | **形态变**：已有 evidence nudge，须 UD 复核是否仍夹杂 propose_plan |

---

## L1a — 双拒后确认点击未成领域确认（p068）

**因果链：**

```
goal_confirmed
  →（方向插话）→ nudge-propose-plan
  → reject-plan #1 → nudge-repropose → reject-plan #2
  → button:确认执行
  → harness: ✗ no task.execution_confirmed yet
  → ✗ 无后续批准/write/report 动作
  → timeout
```

**实证：** remasure 动作面止于 r32 确认。**关键对照：** PASS p114/p055 **同样**出现首次 `no task.execution_confirmed`——该 miss **不是**独有致死信号，而是双拒后常见瞬态。  
p068 致死差在：miss 之后 **没有** `nudge-repropose → 二次确认成功` 收敛（卡死在首次假确认），执行门始终未开。

**致死近因：** 拒满后无法收敛到一次有效 `task.execution_confirmed`（非「按钮没点到」）。

---

## L1b — 二次确认后仍不交付（p002）

**因果链：**

```
goal_confirmed → reject×2 → 确认执行
  → ✗ 首次无 execution_confirmed
  → nudge-propose-plan（repropose 配额已用过）
  → 二次 确认执行（无「no execution_confirmed」日志 → planConfirmed 很可能已 true）
  → ✗ 无 批准这批文件 / 允许执行 / 已解决
  → timeout（非整段 stuck_after_plan）
```

**与 L1a 差：** 很可能已经跨过 timeline confirm，却停在 **确认后不写/不收口**（靠近旧 L4 近因，但是池人格而非 T3）。

**须 UD 复核：** 二次确认后是否出现 `task.execution_confirmed`、`tool.requested write|propose_plan|report_completion`、`execution.forced`。

---

## L2 — 拒一次授权后无恢复（p087）— 仍准确

```
（reject×1 → repropose →）确认执行   ← 无 miss-confirm 日志
  → button:拒绝   (refuse_once)
  → stuck_after_plan stuckIdle=8
```

**叶因：** `stuck_after_plan` 门控要求 `planConfirmed` → **execution_confirmed 已发生**；拒 bash/授权后无再批、无改道只读核验、无 report。  
**相对修批：** L2 silent nudge（「上一工具授权已被拒绝…」）**未把本例推过 stuck**（是否发出须 UD `conversation.system_nudge` 复核；致死近因仍是拒后无恢复动作）。

---

## L5 — 开局 type-ask 早挂（p091）— 替换旧 L3 钉法

```
开局 → type-ask:「…动文件前先跟…」(ask_what / vague)
  → ✗ 无 确认目标 / reject-plan / 确认执行 / write 面
  → timeout（~11min）
```

**叶因：** 会话卡在澄清/追问，**从未进入方案门**。  
**明确不是：** 「已交付不 report」（旧 L3）。测批同 id 曾是 confirm→boundary→ask_what 授权→允许→stuck；**复测形态已变**，不得沿用旧 L3 关单叙事。

---

## L6 — web 环境门失败早挂（p042）— 替换「弱 L1」钉法

```
ensureWebAccess: no 设置 button     ← harness/环境
  → clarify: 请用户去设置开「允许外网检索」
  → button:nf-candidate#0
  → webToolCount=1, planRejects=0
  → timeout
```

**叶因：** 外网能力未就绪 + 模型停在「等用户开设置」；**不是**双拒后无 confirm。  
**类属：** web-env / 能力门（关单硬闸里「非收口例外」候选），与产品 L1 分离。

---

## L7 — 确认后 ask_what→允许→空转（p106）— 新残

```
reject×1 → 确认执行（无 miss 日志）
  → type-ask-approval（ask_what）
  → button:允许执行
  → stuck_after_plan
```

**专项问题（用户点名）：** 允许执行之后 — harness **无** `批准这批文件` / 再授权 / `已解决`；是否 write / report 须 UD。  
**对照：** 测批同人格 **resolved**（含 close-wait-evidence）→ 本轮为 **回退残**，不是「ask_what 从未能绿」（p005 仍绿）。

---

## L4b — T3 确认+web 后证据门未收口（替换旧 L4 字面）

```
确认目标 → 确认执行 → web-ask
  → webToolCount=3
  →（中段无 harness 可见 write/批准动作）
  → nudge-evidence   ← 仅当 UI「完成声明已提交」
  → timeout
  旁证: researchProposeNudgeCount=8
```

**叶因：** 确认后并非「纯再 propose_plan 卡死」；已进入 **完成声明 + 证据不合格/未点已解决**。旧 L4（确认后再规划）可能仍挟杂（须 UD 查 `tool.requested propose_plan` after `execution_confirmed`），但 **主致死近因应记为证据/收口**，建议 ID **L4b**（或并入 L3 族「report 弱」）。

---

## 与 PASS 对照（为何不是全面坏）

| PASS | 说明 |
|------|------|
| **p114** | 双拒 → 首次 miss confirm → nudge-repropose → **二次确认成功** → boundary → close-more → resolved。证伪「双拒必灭」；衬托 L1a/L1b 差在二次收敛与确认后推进 |
| **p055** | 同骨架；二次确认后 boundary → refuse 一次仍能 **允许** → resolved。说明 refuse 面 **可恢复**（对比 p087 L2） |
| **p005** | instant_confirm + ask_what 短路径：确认→已解决。ask_what 非全局毒药 |
| **p076** | 拒×1→确认→type-ask→批准文件→boundary→interrupt×6→允许×2→evidence→resolved。interrupt/boundary 非主因 |

---

## 修批「打偏 / 未打穿」什么（方向 only，不给补丁）

| 旧叶 | 修批意图 | 复测结论 |
|------|----------|----------|
| L1 | 拒后 nudge + harness 以 timeline 为准 | **部分生效**（p114/p055 新绿）；**未打穿** L1a（p068）与 L1b（p002 二次后仍不交付） |
| L2 | 拒授权后催再批/改道/report | **未打穿** p087（仍 stuck_after_plan） |
| L3 | 交付后加强 report nudge | **打在错误尸体上**：本轮 p091 未交付；旧 L3 叙事失效 |
| L4 | 确认后禁再 propose、催 write | T3 **主形态已变为 L4b 证据门**；是否仍夹杂 re-plan 须 UD；池内 L1b 确认后不写 **未被 T3 修向覆盖** |

---

## 明确不是根因

- 人格池抽签 / schema 本身（同 seed 下有 6 PASS）  
- 「一轮 12 个太多」  
- interrupt 过早、ask_what 伪 type-ask 作为 **全局** 主因（有 PASS 证伪）  
- 把 `timeout`/`stuck_*` 当根因  
- 继续用 **未分裂的 L1–L4** 关单（会误修 p091/p042/T3）

---

## 裁决用优先级（仍不修）

| 优先 | 叶因 | 建议修向（方向 only） | 禁止 |
|------|------|----------------------|------|
| P0 | **L1a/L1b** | 拒满后强制可确认方案；确认点击→领域 `execution_confirmed` 一致性；确认后若仍无 write 走 L4 催写（覆盖池人格不只 T3） | 放宽拒方案断言；去掉分层 reject |
| P0 | **L2** | 拒授权后系统催再批/只读核验/report 必须能打破 stuckIdle | 取消 refuse_once 人格装绿 |
| P0 | **L7** p106 | ask_what 允许后若无 tool 推进，催 write/report（与 L2/L3 邻接） | 去掉 ask_what |
| P1 | **L4b** T3 | 完成声明后证据门收口；确认+web 后禁空转；UD 确认是否仍有 propose_plan | 恢复 tool_choice:required |
| P1 | **L5** p091 | 开局 vague/ask_what 死循环打破（催 propose_goal/plan） | 把 p091 当交付后 L3 修 |
| P2 | **L6** p042 | 修 `ensureWebAccess`/设置入口，或标 web-env 例外 | 当 L1 产品叶硬修 |

---

## UD 补证清单（下一会话 SSH，不改码）

对每个 FAIL：`ls /tmp/nf-uat-G-pool-<id>-ud/logs/timeline-*.jsonl`，抽：

1. `task.goal_confirmed` / `task.execution_confirmed` 有无、相对 harness「确认执行」序号  
2. `decision.resolved` plan=reject|confirm；approval=reject|allow  
3. `tool.requested|executed|rejected`：write / bash / propose_plan / report_completion / web_*  
4. `conversation.system_nudge`：approval-reject / deliverables / post-confirm-no-replan / research  
5. 专项：p106 允许后有无 write；p091 有无任何 write；T3 确认后有无再次 propose_plan；p087 拒后有无 L2 nudge  

---

## 关单含义（本文件不修）

Gate 仍 **未达标**（见 leaf-remeasure）。叶因表须按上表 **分裂/改名** 后再开修批，避免按旧 L3/L4 误修。
