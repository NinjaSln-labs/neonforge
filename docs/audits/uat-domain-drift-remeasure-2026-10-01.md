# 领域偏离修批 · Task 7 关单复测审计（ADR-012 只记不改）

> 方案：[`2026-10-01-domain-drift-fix.md`](../superpowers/plans/2026-10-01-domain-drift-fix.md) Task 7
> 日期：2026-10-01 · 执行人：Mac `/tmp/nf-uat-main3r`（sindeMacBook-Pro）
> **水位**：branch `test/uat-persona-3round` @ `185dfd0` · asar 2026-10-01 06:00 ·
> 符号验证 `isDecisionCardEcho` / `shouldNudgeWriteAfterPlanConfirm` / `startServerRejectReason` / `conversation.interrupted` 均在包内
> seed=12（用户指定；抽签 stratifiedOk=true）· 日志 `/tmp/nf-uat-t7-pool.log` `/tmp/nf-uat-t7-tiers.log`
> 现场备份：Mac 旧脏树 → `/tmp/mac-main3r-dirty-20261001.patch` + untracked tar + stash `task7-sync-20261001-drift-scene-backup`

## 结果总览

| 轴 | 结果 | 硬闸要求 | 判定 |
|----|------|----------|------|
| 池 12 条 | **4/12**（p029 p106 p084 p017 ✅） | pass≥10/12 | **FAIL** |
| 收口失败 | 8（timeout×4 · resolved-but-assert-FAIL×3 · stuck_after_plan×1） | =0 | **FAIL** |
| 环境失败 | 0（全程无 config/env 终态；ssh 瞬断 1 次未影响测批） | ≤2 | PASS |
| 任务轴 | T1 ✅ T2 ✅ T3 ✅ **T4 ❌**（probeSent=false） | T1–T4 全绿 | **FAIL** |
| 红线 | violations=0 全 16 条 | 0 | PASS |

**结论：硬闸未达标 → 停，等用户裁决（禁止本审计内开修）。**

## 漂移核对列（方案 Step 3 钉死列）

| persona | terminal | rc | ask 未点已回复? | busy 中确认词×2? | start-server 拒文含 open? | interrupted source=silent 仍现? |
|---------|----------|----|----------------|------------------|---------------------------|--------------------------------|
| p029 | resolved | 0 | 未见 | 未见 | 未触发 | 0 次 |
| p106 | resolved | 0 | 未见 | 未见 | 未触发 | 0 次 |
| p063 | timeout | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p110 | resolved | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p065 | timeout | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p084 | resolved | 0 | 未见 | 未见 | 未触发 | 0 次 |
| p119 | stuck_after_plan | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p066 | timeout | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p060 | timeout | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p035 | resolved | 1 | 未见 | 未见 | 未触发 | 0 次 |
| p017 | resolved | 0 | 未见 | 未见 | 未触发 | 0 次 |
| p098 | resolved | 1 | 未见 | 未见 | 未触发 | 0 次 |
| T1–T4 | T4 resolved（assert FAIL） | 0/0/0/1 | 未见 | 未见 | 未触发 | 0 次 |

- **原三条漂移（叶因 A/B/C）本轮均未复现**：ask_user 提前已回复 0 例；busy 中确认词双发 0 例（Task 6 门闩生效）；
  `conversation.interrupted` 全批 0 事件——silent 不再打断、排队路径工作（ADR-013 产品面达成）。
- start-server 拒文含 open：本批无人格触发 start-server 调用，**未测到**（非绿证）。

## 失败簇（新，非本批漂移回归）

### 簇 1 · working 悬挂（回合以等待决策收尾时状态栏谎报 busy）— 5 条

p063 p065 p066 p060（forcedcard + `status:ready` 后 spinner「搭档处理中…」仍挂 → busy 门闩锁死 → timeout）
+ p110（收口卡 achievement 弹出后同形态 → 点不到「已解决」→ resolved-but-FAIL）。

CDP 探针实证 ×4（p110/p065/p060/p066 现场快照 `/tmp/nf-t7-probe-*.txt`）：timeline 已
`pending_set → card.shown → status_change:ready`，UI 仍 spinner+卡同屏 ≥80s。
真实用户可直接点卡自救（卡按钮不经 send 排队），故产品面=P0 状态栏谎报；harness 面=busy 门闩无「决策卡可见」豁免。

### 簇 2 · busy 门闩连带吞插话/探针 — 3 条

p035 p098（resolved 红线 0，但 `interruptsAtLeast=false` `boundaryProbeSent=false`）+ T4（`probeSent=false`）。
Task 6「busy → acted 与全部 typeAndSend 同禁」在慢回合窗口把人格必发的插话/边界探针全吞 → 断言失败。
设计张力：真实用户就是会在 busy 中插话（ADR-013 排队正为此设计）；全禁等于**取消排队路径的覆盖**。

### 簇 3 · silent nudge 注入后无模型回合 — 1 条

p119：`assistant_done`（纯文字）→ `system_nudge(protocol 催 report_completion)` → `ready` → **零事件**
（无 assistant_start）→ stuckIdle=8 → stuck_after_plan。疑 silent nudge 在回合刚 yield 的窗口被吞。

### 附 · 排队可见性缺口（观察类，未判 FAIL）

1. busy 排队时**非 silent 用户消息也不 push 气泡、无「排队中」指示**（ConversationPanel send 在 push 前 return）——用户点选项后看似无反应。
2. ask_user 卡无已选记忆（chosen 仅 `<candidates>` 路径有；ask_user 回复后所有选项统一「·（已回复）」）。
3. `pendingSendRef` 单槽，busy 中第二条发送静默覆盖第一条（本批未观察到实际丢失）。

## 与上批（pool-testbatch 09-30）对照

- 上批 7 条收口失败 → 本批 8 条；但**构成完全变了**：上批主簇「确认执行后空转」本轮仅 p119 一例（且形态变为 nudge 吞失）；
  本批 5/8 死于新暴露的 working 悬挂——Task 2 full-turn working 引入的回归族（spinner 覆盖到等决策窗口）。
- T3 由 stuck_after_plan → **转绿**；ask_user 提前已回复、busy 双确认、silent 打断三漂移 **0 复现**。
- 结论：漂移修批本身（叶因 A/B/C）达成；**新回归簇 1 是关单阻塞项**，簇 2 属测批纪律与设计张力，簇 3 待复现定位。

## 裁决请求（ADR-012）

建议开修批范围（仅方向）：
1. **P0 产品**：回合以 pending_set/card.shown 收尾时释放 working（或状态栏改「等待你选择」态）——簇 1 根
2. **P1 harness**：busy∧decisionPending 放行卡点选；busy 中放行「人格脚本预排的插话/探针」typeAndSend（走产品排队路径，顺带覆盖观察 1）——簇 2 根
3. **P1 产品**：silent nudge 在 yield 窗口的送达性排查——簇 3
4. P2 排队气泡/已选高亮/单槽覆盖（观察类）

**未裁决前不改码。** 现场证据：pool/tiers 日志、探针快照、截图 `/tmp/nf-cdp/uat/G-pool-p035/99-final.png` 等均在 Mac /tmp。
