# UAT 人格池 · L1–L4 修批复测只记（ADR-012 Task 6）

> **模式：只记不修。** 未达标 → 停，等用户裁决。禁止本轮再改产品/harness/断言。  
> seed=`pilot30` · asar mtime `2026-09-30 19:40` · app=`/tmp/nf-uat-main3r/.../NeonForge.app`  
> 池日志 `/tmp/nf-uat-pool-leaf-remeasure.log` · 结果 `/tmp/nf-uat-pool-results.txt`  
> tiers 日志 `/tmp/nf-uat-tiers-leaf-remeasure.log` · 结果 `/tmp/nf-uat-tier-results.txt`  
> 修批入包 commits：`21af73b`（L3）· `13ce924`（L1 plan-reject）· `e457987`（L1 harness）· `caae0ac`（L2）· `3205c2c`（L4）

## Dist / asar 门禁

| 项 | 值 |
|----|-----|
| asar mtime | **2026-09-30 19:40** |
| `方案已被拒绝两次仍未确认` | HIT |
| `上一工具授权已被拒绝` | HIT |
| `文件已写入且核验命令已执行` | HIT |
| `无需再 propose_plan` | HIT |

## 汇总

| 指标 | 值 |
|------|-----|
| PASS（exit 0 / `resolved`） | **6/12** |
| `stuck_*` / `timeout` | **6**（非 0） |
| T1–T4 全绿 | **否**（T3=1） |
| 关单硬闸（pass≥10 且 stuck/timeout=0 且 T1–T4 全绿） | **未达标** |

PASS：p114、p076、p018、p005、p069、p055  
FAIL：p002、p087、p068、p106、p042、p091

对照测批（asar 13:44，5/12）：本轮 **+1 PASS**（p114/p055 新绿；p106 由绿转红）。**仍远低于 ≥10/12。**

## 分条（terminal + 末动作摘要）

| id | rc | terminal | 摘记（harness actions） |
|----|-----|----------|-------------------------|
| p002 | 1 | timeout | 拒方案×2→确认执行→`nudge-propose-plan`→再确认执行→空转（L1/L4 形） |
| p087 | 1 | stuck_after_plan | 拒方案×1→确认执行→**拒绝**（refuse_once）→ stuck（**L2 残留**） |
| p068 | 1 | timeout | 拒方案×2→确认执行后 timeout（**L1 残留**） |
| p114 | 0 | resolved | PASS（测批曾 timeout） |
| p106 | 1 | stuck_after_plan | 拒方案×1→确认→type-ask-approval→允许执行→ stuck（测批曾 PASS；**新残**） |
| p076 | 0 | resolved | PASS |
| p042 | 1 | timeout | 仅 candidate；planRejects=0、web=1 → 早段空转（**L1 形弱/早挂**） |
| p018 | 0 | resolved | PASS |
| p005 | 0 | resolved | PASS |
| p091 | 1 | timeout | 动作面几乎停在 type-ask；无 resolved（**L3 形残留/早挂**） |
| p069 | 0 | resolved | PASS |
| p055 | 0 | resolved | PASS（测批曾 timeout） |

## 任务轴 tiers

| 档 | rc | terminal | 记 |
|----|-----|----------|-----|
| T1 | 0 | resolved | PASS |
| T2 | 0 | resolved | PASS |
| T3 | 1 | timeout | FAIL：确认执行→web-ask→`nudge-evidence`→timeout（测批为 stuck_after_plan；**L4/交付后收口仍红**） |
| T4 | 0 | resolved | PASS |

## L1–L4 残留（供裁决，本文件不修）

| 叶因 | 本轮是否仍命中 | 证据条 |
|------|----------------|--------|
| **L1** 拒方案后推进断裂 | **仍命中** | p002、p068；p042 早期 timeout |
| **L2** 拒授权无恢复 | **仍命中** | p087 stuck_after_plan（末动作「拒绝」） |
| **L3** 交付后不 report | **疑仍命中** | p091 timeout（动作短，未到明确 write/bash 证据面） |
| **L4** 确认后再规划/不写 | **仍命中（变体）** | p002 确认后 `nudge-propose-plan`；T3 确认+web 后 timeout（非再 propose 字面，仍未 resolved） |
| **新残** | p106 曾绿转 stuck | 允许执行后 stuck_after_plan |

已改善对照：p114、p055 本轮 resolved；interrupt 系 p076/p069 仍绿；T1/T2/T4 绿。

## 关单判定

**Gate met: no**

- pass 6/12 ＜ 10  
- stuck/timeout = 6 ≠ 0  
- T3 ≠ 0  

## 裁决请求（ADR-012）

请拍板是否开下一修批、修哪些残留簇（L1 双拒后仍 timeout / L2 refuse_once / L3·p091 / L4·T3 / p106 回退），或接受水位只记坑。**未裁决前不改码。**
