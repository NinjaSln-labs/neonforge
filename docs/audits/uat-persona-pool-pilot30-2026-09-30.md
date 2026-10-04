# UAT 人格池试点 · ADR-012 只记（2026-09-30）

> 硬闸：测批与修批分离——本文件只摘记现象，不在测中改产品。  
> 入口：`NF_UAT_SEED=pilot30 bash scripts-cdp/run-uat-persona-pool.sh`  
> 池：`persona-pool.json`（120）· draw → `/tmp/nf-uat-draw.json` · 结果 → `/tmp/nf-uat-pool-results.txt`  
> 日志：Mac `/tmp/nf-uat-pool-pilot30.log` · app.asar mtime `2026-09-30 01:31`

## 抽签（seed=pilot30 · stratifiedOk）

| # | id | tags（assertProfile） |
|---|-----|------|
| 1 | p002 | rejectPlan |
| 2 | p087 | rejectPlan |
| 3 | p068 | rejectPlan+interrupt |
| 4 | p114 | rejectPlan+boundary |
| 5 | p106 | rejectPlan |
| 6 | p076 | rejectPlan+interrupt+boundary |
| 7 | p042 | rejectPlan+web |
| 8 | p018 | base |
| 9 | p005 | base（含 ask_what） |
| 10 | p091 | rejectPlan+boundary |
| 11 | p069 | rejectPlan+interrupt |
| 12 | p055 | rejectPlan+boundary |

同 seed 两次 draw ID 一致已本地核验。

## 结果（12/12 跑完 · 0 PASS）

| id | rc | terminal | 次要 tag | 记 |
|----|----|----------|----------|----|
| p002 | 1 | timeout | planRejects✓ red✓ | 拒方案 2 次后未收口 |
| p087 | 1 | timeout | planRejects✓ red✓ | 同上 |
| p068 | 1 | timeout | planRejects✓ interrupts✓ | 插话达标未收口 |
| p114 | 1 | timeout | planRejects✓ boundary✓ 隔离✓ | 探针已发 |
| p106 | 1 | timeout | planRejects✓ | |
| p076 | 1 | timeout | interrupts✓；planRejects✗ | 拒方案次数不足 |
| p042 | 1 | timeout | webTool✓；planRejects✗ | `ensureWebAccess: no 设置 button` |
| p018 | 1 | **config** | — | 钥匙验证 3 次失败（无模型列表 / 网络跳过）→ 抛错未进场景 |
| p005 | 1 | timeout | red✓ | ask_what 路径已走（`type-ask-approval`→允许执行）后超时 |
| p091 | 1 | timeout | planRejects✗ boundaryProbe✗ | |
| p069 | 1 | timeout | planRejects✓ interrupts✓ | |
| p055 | 1 | timeout | planRejects✓ boundary✓ 隔离✓ | |

**共性：** 11/12 进场景者 `terminal=timeout`、红线 0；收口（已解决）全军覆没。次要行为 tag（拒方案/插话/边界/web）多数绿 → **harness 适配基本可用**，堵点在收口/证据门或本机 dist 水位。

## Harness 缺陷（可修脚本，非产品 · 本批已修）

- Mac 非交互 ssh：`node` 需 source nvm → 已写入 `run-uat-persona-pool.sh`
- macOS bash 3：忌 `mapfile` → 改 IDS 文件
- （观察）`ensureWebAccess` 偶发无「设置」钮；config 页偶发无模型列表/网络跳过 → 记环境坑，未改产品

## 产品侧问题（ADR-012：只记不修）

1. **收口超时主导失败面**（与此前 impatient/contradictory timeout 同类症状面；本批 app.asar=01:31，是否含当日修批需对照）  
2. **拒方案后偶发达不到 N 次**（p076/p042/p091）— 可能卡在 clarify/重提方案窗口  
3. **边界探针偶发未发出**（p091）— 方案确认前超时或未 planConfirmed  
4. **config 钥匙页不稳定**（p018）— 上游模型列表/网络

## 入口水位

- 推荐：`run-uat-persona-pool.sh`  
- Legacy：`run-uat-persona-rounds.sh`  
- 说明：`docs/tests/uat-persona-pool.md`
