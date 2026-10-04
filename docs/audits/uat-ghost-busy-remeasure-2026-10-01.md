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

## 簇2（busy 门闩吞插话/探针）：本轮不动，仍是主要残留

> **订正**：本节原写「6 条失败全部落此域」——逐条 timeline 取证后**不准确**。实际仅 4 条（探针/插话被吞）属此；p063/p066 各另有产品侧原始根因。完整归因见文末「原始根因追溯（RCA）」节。

- **p110、p060、p035、p098**：探针/插话被吞（`interruptCount=0` 或 `boundaryProbeSent=false`）。
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

## 原始根因追溯（RCA · 2026-10-01 补 · **修正本审计前文「6 失败全落簇2」的粗判**）

前文按症状把 6 条失败都记为「簇2」。逐条拉 timeline + autopilot actions 后，实际是 **3 类不同原始根因**：

### 簇2 真身＝harness 结构根因（p110 · p060 · p035 · p098 — 探针/插话被吞）
`uat-lib.mjs:706-711` 外层 busy 门 `if (busy) continue` 位于**所有**插话块（L885）/边界探针块（L835）/审批点选**之前**——上批 Task6「busy→acted 与全部 typeAndSend 同禁」的字面落地。
⇒ 插话/探针只能在「该 6s tick 恰为 非busy ∧ 未acted ∧ 无卡挂起」时触发；真实模型快收敛时该窗口不出现 → `interruptCount=0` / `boundaryProbeSent=false`。
**属测试脚本结构，非产品缺陷，且正是用户裁「本轮不动」的簇2**。（RC1b 把 busy 读状态栏后，此结构性吞没依旧——因为是真 busy，不是假阳性。）

### 新叶因 α＝产品模型授权循环不收敛（p066 stuck_after_plan）
timeline：`decision.requested approval` × 多次（seq 186/196/321/341/385）；autopilot：r38/r40/r44 连点 3 次「允许执行」，夹真 busy 轮。
末态：最后一次授权执行完，模型**既不 report_completion 也无卡挂起** → `status=ready` 连 8 轮 → stuckIdle=8 → stuck_after_plan。
**原始根因＝产品侧模型「要授权→执行→再要授权」不发完成声明的不收敛循环**，与预存在红 `core.interaction.ts:1859`（问题 A：approve-files 卡悬挂→模型续轮被拦后停续聊）**同族**。

### 新叶因 β＝产品「成功收口被协议 nudge 冲掉」（p063 timeout）★关键 · 已零成本多样本取证
收口已达成：seq 306 `tool.requested report_completion`（带 pendingQuestions）→ 307 `proposal.completion ok` → 310 `decision.requested resolution` → 311 `card.shown achieve-confirm` → **312 `status=ready`（RC1a 正确：decision-pending 非 busy）**。
**但 313 `conversation.system_nudge`「完成声明已被证据门拒绝，请重新提交 report_completion」迟到注入** → 314 `working` → 318 `assistant_start` 起新回合 → busy 锁死 autopilot 从 r56 起一路 `skip-act+nudge modelBusy`（r63 偶点允许执行）→ maxRounds 耗尽 → timeout。

**发射点（校正——非 `verifyThenResolve` 证据回填）**：`shouldNudgeReportAfterEvidenceMissing`（`agentLoop.ts:386`，接线 `ConversationPanel:1307-1321`）。守卫 `pending!=='none'→不催`（L374）却在卡已弹后仍发 ⇒ 疑真根＝**done handler 内 `verifyThenResolve`（异步 await `bridge.verify` 才置 resolution L767/793）与 nudge 守卫（同步读 `stateRef.current.pending`，此刻仍 none）微任务竞态**。

**零成本多样本取证（扫 12 条已有 timeline，不跑新模型）**：
- **签名频率 2/12**：`resolution 卡后 protocol nudge 又起回合`＝p035(131→153/155)、p063(310→313→318)；**p035 自行恢复 resolved，仅 p063 致命** ⇒ β 真实复发，非必死（取决后续能否再收口）。
- **RC3 杠杆证伪**：逐条 nudge 送达路径——p063×11、p119×2，`prevStatus=ready` 者**全部直发起回合**（send 未被 workingRef 挡，**未进 pendingSendRef 槽**）；落 working/approval-pending 者（p063 seq70/298）也恢复。**本批 0 例单槽死信** ⇒ 「单槽/flush 时机」（RC3 所押根因）**对 p063/p119 症状不适用**。
- 坑 `p000142`：排查簇3 先分「nudge 直发(ready) vs 入槽(working)」，别默认排队槽。

### β 插桩复现结论（2026-10-01 · 一次性 worktree 插桩 `window.__betaTrace`，**不入库**）
p063 solo 复跑 **3 把，全部 `terminal=resolved`**——**未复现**池跑那一次致命 timeout。逐把 trace 顺序：
- 成功路径恒为 `verifyEnter → verdict ok:true → evidenceReset → pendingSetResolution`，**resolution 之后不再出现任何 protocol nudge**（成功时 `evidenceReset` 把 `evidenceGuideCountRef` 归零，守卫 `evGuideCount>0` 不再成立）。
- 较早一把捕获到「证据门拒 → 稍后纯文本回合 → `nudgeGuardRead(pending=none, evGuideCount=1)` → `nudgeSent` → **`sendQueued`**」：nudge **经 `send()` 进了 `pendingSendRef` 单槽**。

**据此修正本审计前文两处过强结论（诚实记）：**
1. ~~「done-handler 内 resolution 异步 vs nudge 守卫同步的微任务竞态」~~ → **未观察到**（成功路径干净）。致命那次需「一次 report 失败(arm evGuide) + 一次 report 成功(靠 evidenceReset) + 其间纯文本回合触发守卫」的**特定两-report 交错**，3 样本未撞上 ⇒ β 是**低概率竞态**（解释 p035 恢复、p063 偶致命），**尚未被复现确认**。
2. ~~「nudge 全直发、`pendingSendRef` 槽对 p063 不适用 ⇒ RC3 押错杠杆」~~ → **过头**。`sendQueued` 证明证据拒绝 nudge 会进单槽；前文据 timeline `prevStatus=ready` 判"直发"**不可靠**（`conversation.status_change` 滞后于 `workingRef.current`）。⇒ **RC3 的排队槽嫌疑未被洗清，也未证实**。

**净结论（更新：β 已由构造性 mock 复现坐实）**：见下「β 构造性复现」节——**β 确认为 p063 真根因，RC3（`pendingSendRef` 单槽）被排除为此路径之因**；上文 3 把真实模型 p063 solo 未撞致命交错＝低概率，故改由 mock 确定性重放。RC1a/RC1b 零回归结论不变。

### β 构造性复现（2026-10-01 · `beta-repro` 一次性 mock 件·跑完即删·未入库·不花模型额度）
令 `completion.verify` 首次**慢失败**(1500ms)、二次**快成功**：
- `已解决` 卡先弹出（`decision.requested`@cardTs）；
- 随后 verify#1 的 **evidence 引导迟到**——`verifyThenResolve` 失败分支（`ConversationPanel:801-810`）**只判 `workingRef`、不判 `pending`** → 成功收口后仍无条件 `send`；
- 结果**在已成功的收口上又起额外模型回合**：`chatCount 5→7`，卡后 `evidence`+`protocol` 引导各 1 条。
**确定性通过（非运气）**，正是池内 p063 的 `310 卡→313 system_nudge→318 assistant_start` 形态。
**⇒ RC3 判定**：该复现**跑在未装 RC3 的单槽 `pendingSendRef` 代码上即重现**，且 evidence 引导走 `else` 直发/silent 重入，**与排队槽大小、flush 时机无关** ⇒ **`pendingSendRef 单槽死信`（RC3 所押根因）被排除**，不必也不应为此改 RC3。

**稳定性 + 双发射器（多轮·边界扫描）**：`beta-stable` 一次性件（跑完删）——1500ms 连跑 **5 次结果完全一致**（extraRounds=2 / lateEvidence=1 / lateProtocol=1，零抖动）；变延迟扫描 `0/200/500/800/1200/1500/2500ms`：

| 慢失败延迟 | 卡后额外回合 | 发射器 |
|-----------|------------|--------|
| 0 / 200 / 500 / 800ms | +1 | evidence 引导 ×1 |
| 1200ms | +2 | protocol nudge ×2（evidence 0）|
| 1500ms | +2 | evidence ×1 + protocol ×1 |
| 2500ms | +3 | 两者都有 |

### ★ 原始根因（最终层 · pending-transition 全链路探针坐实）
`useConversationState.transition()` 是状态写唯一入口（L40-50，**同步**改 `stateRef.current`）；在其上打「pending 变迁」标记 + `window.__bt2` 逐步探针（一次性、**已 revert**，主仓 L1 703/双 tsc 0 复验干净），1500ms 实测：

```
n6  t=1882 sendQueued   qlen=8      ← busy 期把「确认，按方案执行」写入单槽（且已覆盖掉 n3 的「确认，目标清楚了」）
n9  t=3368 resolutionSet → n10 none->resolution   ← verify#2 快成功，「已解决」卡弹出
n11 t=3924 resolution->none                        ← ★迟到的那条 stale 确认文本 flush 到达并清掉刚成功的卡
n12 t=3976 protocolGuardRead pending=none          ← 守卫看到 none（是真 none，非读滞后）→ 合法放行
n14 t=4262 evidenceGuideSend working=true         ← verify#1 慢失败(2762+1500)落地，引导发出
```

**原始根因**：`send()` 的 pending 路由（L2447-2470）按**当前** `pending` 解释**任何到达**的文本——而排队文本是在**旧决策点**（plan 卡）时代写下的。`isConfirmIntent('确认，按方案执行')` **判 false**（L90 需连续子串 `确认执行`；实际为「确认，按方案」+「执行」），于是落入 **`reject(..., {kind:'direction'})` ＝ C2 隐式拒绝** → **把刚弹出的 `resolution` 卡当"用户改方向"拒绝掉** → pending 归 none → 后续 protocol 守卫与慢失败 evidence 引导都**合法**放行 → 额外模型回合 → 收口被毁 → harness 撞 busy 点不到卡 → timeout。
⇒ 缺的是**「消息 ↔ 决策点代次」绑定**（一条文本只能对它被写就时的那个决策点生效），不是 pending 读得不准。

### ⚠ 对 RC3/t000068 的**方向性反转**（重要）
- 当前**单槽的"静默覆盖"丢掉了第一条确认文本，反而偶然掩盖了这个 bug**；
- ⇒ 若按 RC3（"顺带修单槽覆盖"）/ `t000068` 改成**多槽**让每条都送达，**会加剧 β**：更多 stale 文本活到 flush、更多卡被 C2 误拒。
- 即「多槽 + idle flush」不只是"没对着因"，**方向是反的**。上批把簇3 押在 `pendingSendRef` 属误判，但"排队机制有锅"这点方向没错——锅在**无代次绑定**，不在槽宽窄。
- 修法候选（待裁）：① **入队即绑定 `pendingKind` + 代次令牌**，flush 时若当前 pending 代次不符则丢弃/降级为普通文本（不再走 C2 隐式拒）；② `send()` pending 路由对"迟到 flush 来源"禁用 C2 方向性拒绝；③ evidence 引导发前判 `pending!=='none'` 作废（治第二个发射器，独立）。
**修法候选**：见下「★ 原始根因」节的三条（本行初稿曾疑「`stateRef.pending` 读滞后」，**已被 transition 同步写 + 全链路探针证伪**——守卫看到的是真 `none`，成因是 stale 文本被 C2 误拒，非读得不准）。

### 归因汇总（取代前文）
| 失败项 | 原始根因 | 域 | RC1a/RC1b 责任 |
|--------|----------|----|----|
| p110 p060 p035 p098 | harness busy-门结构吞插话/探针（簇2 真身） | 测试脚本 | 无 |
| p066 | 产品模型授权循环不收敛（同族 core:1859） | 产品 | 无（新发现，非回归） |
| p063 | 产品 verifyThenResolve 证据引导并行竞态 | 产品 | 无（新发现；且反证 RC3 归因存疑） |

**关键结论不变**：RC1a（幽灵 0 复现）、RC1b（同源哨兵 0 drift、skip-act 全真 busy）**本身零回归**；p110 从「幽灵堵门」变「卡能点、仅探针被吞」即其正证。

## 裁决请求（下一步方向，仅提不实施）

1. **簇2 门闩放行口径**（4/6 失败）：busy 期是否放行「预排插话/边界探针/审批卡点选」——需**先改方案 Task6 全禁口径**（harness 侧：把插话/探针移到 busy 门外，或给 busy 期一条「排队注入」通道）。这是 pass 6→≥10 的主要缺口。
2. **新叶因 α · 产品授权循环不收敛**（p066）：与预存在红 `t000069 / core:1859` 合并立独立叶因修批（模型侧 force-tool 收敛 / 卡挂起兜底）。
3. **新叶因 β · verifyThenResolve 竞态**（p063）：证据引导 nudge 须在「本轮已成功收口」时作废，防迟到冲卡。立为簇3/RC3 的**候选真根因**，先取证再改。
4. **RC3**：维持 deferred——β 的发现**加强**了「不要在归因未清时改 pendingSendRef」的判断。
5. **预存在红 t000069**：按 d000008 可启动另批（与 α 同族，宜并案）。

**未裁决前不改码。** 现场证据（pool/tiers 日志、userData timeline、探针输出）均在 Mac `/tmp`；worktree `/tmp/nf-uat-rc1`、Mac `refs/uat/rc1`、备份 tar、`/tmp/nf-uat-key-keep`（含 key）暂留，清理与 push 待用户指令。
