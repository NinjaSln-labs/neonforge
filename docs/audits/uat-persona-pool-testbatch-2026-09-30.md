# UAT 人格池测批 · ADR-012 只记（2026-09-30 测批）

> **模式：只记不修。** 汇总后等用户裁决再开修批。  
> seed=`pilot30` · asar `2026-09-30 13:44` · 日志 `/tmp/nf-uat-pool-testbatch.log` · 结果 `/tmp/nf-uat-pool-results.txt`  
> 水位说明：asar 含 Task3/4/6 修批，以及此前违规半路追加的 stuck/deliverables 微调（解释结果时勿当成「仅裁决修批」）。

## 汇总

| 指标 | 值 |
|------|-----|
| PASS（exit 0） | **5/12** |
| 收口失败 `timeout`/`stuck_*` | **7** |
| 关单硬闸（pass≥10 且收口失败=0） | **未达标** |

PASS：p106、p076、p018、p005、p069  
FAIL：p002、p087、p068、p114、p042、p091、p055

## 分条（末动作摘要）

| id | rc | terminal | 摘记 |
|----|-----|----------|------|
| p002 | 1 | timeout | 拒方案×2→确认执行→type-ask 后空转 |
| p087 | 1 | stuck_after_plan | 确认执行后 **拒绝**（refuse_once）→ stuck |
| p068 | 1 | timeout | 确认执行→scope-ask→interrupt×6 后空转 |
| p114 | 1 | timeout | 确认执行→type-ask→boundary-probe 后空转 |
| p106 | 0 | resolved | PASS（含 close-wait-evidence） |
| p076 | 0 | resolved | PASS（interrupt 在确认执行后） |
| p042 | 1 | timeout | 确认执行→web-ask 后空转 |
| p018 | 0 | resolved | PASS |
| p005 | 0 | resolved | PASS（ask_what→允许→已解决） |
| p091 | 1 | stuck_after_plan | 确认执行→boundary→ask_what→批准后 stuck |
| p069 | 0 | resolved | PASS |
| p055 | 1 | timeout | 确认执行→boundary 后空转 |

## 原根簇（供裁决，本文件不修）

1. **确认执行后空转 / stuck_after_plan**（p002/p068/p114/p042/p055/p091）— 边界探针与 web-ask 后常见  
2. **refuse_once 拒授权后不恢复**（p087）  
3. **已改善对照**：ask_what 路径（p005）、plan 后插话（p076/p069）本批可绿  

## 任务轴 tiers

> 日志 `/tmp/nf-uat-tiers-testbatch.log` · 结果 `/tmp/nf-uat-tier-results.txt`  
> 首跑 T*=127（nohup 无 `node` PATH）→ 仅补 PATH 重跑取证（ADR-012 环境例外，未改产品/harness）。

| 档 | rc | terminal | 记 |
|----|-----|----------|-----|
| T1 | 0 | resolved | PASS |
| T2 | 0 | resolved | PASS |
| T3 | 1 | stuck_after_plan | FAIL |
| T4 | 0 | resolved | PASS |

## 裁决请求（ADR-012）

请拍板是否开下一修批、修哪些簇（池 7 条收口失败 / T3 stuck / 或先接受水位只记坑）。**未裁决前不改码。**
