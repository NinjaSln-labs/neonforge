# 幽灵/busy 修批 · RC1a+RC1b 关单复测审计（ADR-012 只记不改）

> 批次：[`2026-10-01-ghost-busy-deadletter-fix-v2.md`](../superpowers/plans/2026-10-01-ghost-busy-deadletter-fix-v2.md)（裁决 `d000006`→审计修订 `d000007`→RC3 摘除 `d000008`）
> 日期：2026-10-01 · 执行人：Mac worktree `/tmp/nf-uat-rc1`（sindeMacBook-Pro）
> **水位**：branch `test/uat-persona-3round` @ `9c46a8c`（经 bundle 传 Mac，非主检出）· asar 2026-10-01 20:39 ·
> 交付内容＝**仅 RC1a（`d402e4f`）+ RC1b（`d8e6f17`）**；**RC3 未装**（用户裁「先不处理」`d000008`）
> seed=12（与上批 [`uat-domain-drift-remeasure-2026-10-01.md`](./uat-domain-drift-remeasure-2026-10-01.md) 同 seed，可逐条对照）
> 日志：`/tmp/nf-uat-rc1-pool.log` `/tmp/nf-uat-rc1-tiers.log`；隔离 userData `/tmp/nf-uat-G-pool-<id>-ud`；结果 `/tmp/nf-uat-pool-results.txt` `/tmp/nf-uat-tier-results.txt`
> **前置**：Mac 主检出原有 94 处未提交＝跨机同步残渣（详见 `handoff` t000070 记录，已备份 `~/mac-nf-wt-backup-20261001-2035.tar.gz` 后清空），本批在独立 worktree 测，不受污染

## 结果总览（对照上批 Task7）

| 轴 | 上批 Task7 | 本轮 | 硬闸要求 | 判定 |
|----|-----------|------|----------|------|
| 池 12 条 | 4/12 | **6/12** | pass≥10/12 | **FAIL** |
| 收口失败（terminal≠resolved） | 8 | **2**（p063 timeout / p066 stuck_after_plan） | =0 | **FAIL** |
| 环境失败 | 0 | **0**（全程无 config/env 终态；T3 涉网正常） | ≤2 | **PASS** |
| 任务轴 T1–T4 | T1✅T2✅T3✅**T4❌** | **T1✅T2✅T3✅T4✅（4/4）** | 全绿 | **PASS** ✅（T4 转绿） |
| 红线 violations | 0 | **0（全 12）** | 0 | **PASS** |
| `WARN busy-source-drift`（RC1b 哨兵） | — | **0** | — | 同源一致（见下） |

**结论**：硬闸（pass≥10/12 ∧ 收口=0）**仍 FAIL → 停，等用户裁决**。但**失败构成彻底改变**：见下节，这是本审计的核心。

## 簇1（幽灵）：RC1a 达成——0 复现

- **forced_clarify 触发仍频繁**（p065×2、p066×2、p060×2、p063 亦达），但尾态一律 `status=ready` 且 `assistant_start ≤ assistant_done`（**无悬挂**）⇒ 卡弹出后不再残留 `.nf-msg__body--thinking` 幽灵（p065 单跑 DOM 探针 `thinking=0/breath=0/ghostText=0`）。
- 上批「forcedcard+幽灵→busy 假死→timeout」5 条中：**p065→通过、p060→resolved(仅探针被吞)、p110→resolved(仅探针被吞)、p119→通过**；仅 p063 仍 timeout 但**换因**（见簇2/审批）。
- 唯一「上批簇1 → 本轮仍失败且非纯簇2」的遗留＝p063（approve-files 卡挂起 + write 被拦 + 模型持续在飞＝真 busy，autopilot 撞 working `skip-act` → 从不点批准卡）。属 **harness 审批覆盖 + 产品审批循环**，非 RC1a 失效。

## 簇2（busy 门闩吞插话/探针）：本轮不动，果然仍是主残留

6 条失败**全部落此域**（用户裁「本轮不动」，符合预期）：
- 探针/插话被吞（`interruptCount=0` 或 `boundaryProbeSent=false`）：p110、p060、p035、p098。
- 审批卡挂起处理缺失：p066（末 decision=approval、ready、stuckIdle=8）、p063（同上形态）。
- 关键：本轮 **RC1b 未制造假阳性**——状态栏同源后 `modelBusy` 与时间线 `conversation.status_change` 全程一致（哨兵 0 报警）；skip-act 处均为**真 busy**（末条 status=working + start>done），不是被幽灵/文案骗的假 busy。

## 簇3（排队死信 p119）：本轮 resolved，但**不作 RC3 可免依据**

p119 `terminal=resolved`、`system_nudge×2 其后均有 assistant_start（死信 0/2）`。但：
- 上批 p119 亦仅**单样本**；真实模型 UAT 有随机性，**一次通过 ≠ 根因消失**。
- 本轮 RC3 **未装**（旧 send-finally flush 仍在），死信本是「nudge 恰晚于 finally 同步读点」的竞态——这次没撞上窗口而已。
- ⇒ **RC3 保持 deferred 不变**（`t000067` blocked）；如需坐实需多样本或结构性消除竞态（方案 §14 转裁决 5 三选）。

## 与授权一致性（ADR-012）

- 本批复测＝处置轮（RC1a/RC1b 已获裁 `d000006`）后的**独立回归轮**，符合 ADR-012 第 4 条轮次分离。
- 测批全程**未改产品/harness/断言**；观察记录落 `.scratch/neonforge-v1/audit-items/regression-rc1-observations.md`（本机草稿）。
- 硬闸未达标 → 本审计完成态＝**汇总 + 等待裁决**，非「修到绿」。

## 裁决请求（下一步方向，仅提不实施）

1. **簇2 门闩放行口径**（上批遗留、本轮主残留）：busy 期是否放行「决策卡/审批卡点选」与「预排插话/边界探针」？——这是 pass 从 6→≥10 的主要缺口，且**需先改方案口径**（Task6 全禁 vs 选择性放行）。
2. **审批卡挂起处理**（p063/p066）：autopilot 遇 approve-files/授权卡 `pending + working` 反复时的兜底（可能与簇2 合并裁）。
3. **RC3**：保持 deferred / 换更外科死信修法 / 多样本坐实 p119 现状后再判（§14 三选）。
4. **预存在红 t000069**（L3 3 红）：按 `d000008` 本批后另开修批——现可启动。

**未裁决前不改码。** 现场证据（pool/tiers 日志、userData timeline、探针输出）均在 Mac `/tmp`；worktree `/tmp/nf-uat-rc1` 暂留（清理与 push 待用户指令）。
