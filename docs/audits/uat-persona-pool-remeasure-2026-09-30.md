# UAT 人格池复测（新水位）· ADR-012 只记 · 2026-09-30

> asar `2026-09-30 10:35`（含 A–D）· stuckIdle 早停 · seed=`pilot30`  
> 日志：Mac `/tmp/nf-uat-pool-remeasure.log` · 结果 `/tmp/nf-uat-pool-results.txt`

## 汇总

| 指标 | 值 |
|------|-----|
| PASS | **2/12**（p018、p069） |
| 收口失败（stuck/timeout） | **9** |
| resolved 但 tag FAIL | **1**（p002 planRejects） |

## 分条

| id | rc | terminal | 簇提示 |
|----|-----|----------|--------|
| p002 | 1 | resolved | planRejects✗（拒方案次数不足） |
| p087 | 1 | stuck_after_plan | 确认执行→拒绝→空转 |
| p068 | 1 | timeout | **B** 插话在确认目标前 |
| p114 | 1 | timeout | plan+boundary 后空转 |
| p106 | 1 | stuck_after_plan | **C** ask_what→允许后 stuck |
| p076 | 1 | （exception/红线） | **B** 插话×6 在确认目标前 |
| p042 | 1 | timeout | web+批准后 nudge-evidence 空转 |
| p018 | 0 | resolved | PASS |
| p005 | 1 | stuck_after_plan | **C** ask_what→允许后 stuck |
| p091 | 1 | stuck_after_plan | **C**+boundary |
| p069 | 0 | resolved | PASS（含 interrupt） |
| p055 | 1 | timeout | plan+boundary 后空转 |

## 残差门控结论

收口失败≥4 → 开齐已命中簇：**B→Task3 · C→Task4 · 产品 stuck_after_plan→Task6**。  
D（config/web_env）未单独成条（无钥匙失败；p042 为收口失败非 web_env）→ **跳过 Task5**。

测批结束，开修。
