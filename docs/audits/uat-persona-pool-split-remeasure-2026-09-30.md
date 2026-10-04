# UAT 人格池 · 分裂叶因修批 v2 复测只记（ADR-012 Task 8）

> **模式：只记不修。** 未达标 → 停，等用户裁决。禁止本轮再改产品/harness/断言。  
> seed=`pilot30` · asar mtime `2026-10-01 01:15` · app=`/tmp/nf-uat-main3r/apps/desktop/release/mac/NeonForge.app`  
> app-path 文件 `/tmp/nf-uat-app-path.txt` · key `/tmp/nf-uat-key-keep`  
> 池日志 `/tmp/nf-uat-pool-split-remeasure.log` · 结果 `/tmp/nf-uat-pool-results.txt`  
> tiers 日志 `/tmp/nf-uat-tiers-split-remeasure.log` · 结果 `/tmp/nf-uat-tier-results.txt`  
> 方案：`docs/superpowers/plans/2026-09-30-uat-leaf-split-fix-v2.md`（Tasks 1–7 入包后复测）

## Dist / asar 门禁

| 项 | 值 |
|----|-----|
| asar mtime | **2026-10-01 01:15** |
| `授权已被拒绝` | HIT |
| `已允许执行` | HIT |
| `目标尚未确认` | HIT |
| `确认后未写入`（字面连续子串） | MISS |
| `执行方案已确认且尚未写入`（产品 nudges 实文） | HIT |

## 三计数汇总

| 指标 | 定义 | 值 |
|------|------|-----|
| **pass** | `resolved` | **8/12** |
| **收口失败** | `stuck_after_plan\|stuck_no_plan\|timeout` | **4** |
| **环境失败** | `config\|web_env` | **0** |
| T1–T4 全绿 | 四档 `resolved` / rc=0 | **否**（T4=`stuck_after_plan`） |
| **硬闸** | `pass≥10/12` ∧ `收口失败=0` ∧ `环境失败≤2` ∧ T1–T4 全绿 | **未达标** |

PASS：p087、p114、p076、p042、p018、p091、p069、p055  
收口失败：p002=`timeout`、p068=`timeout`、p106=`stuck_after_plan`、p005=`stuck_after_plan`  
环境失败：无（含 L6/`webAsk` 的 p042 本轮 `resolved`，**非** `web_env`）

对照 leaf-remeasure（asar 19:40，pass 6/12 · 收口失败 6 · T3 红）：本轮 **pass +2**（p087/p042/p091 新绿；p005 由绿转 stuck）；**T3 转绿**；T4 仍红。**仍低于 pass≥10 且 收口失败≠0。**

## 分条（terminal + 末动作摘要）

| id | rc | terminal | 摘记（harness actions） |
|----|-----|----------|-------------------------|
| p002 | 1 | timeout | 拒方案×2→confirm miss→after-miss→锁清→再确认→type-ask 后 timeout（**L1a 形残留**） |
| p087 | 0 | resolved | 拒授权→允许→`nudge-approval-reject`→evidence→已解决（测批/leaf 曾 stuck；**L2 本轮绿**） |
| p068 | 1 | timeout | 拒方案×2→confirm miss→after-miss→`nudge-propose-plan`→timeout（**L1a 形残留**） |
| p114 | 0 | resolved | PASS（boundary + 允批） |
| p106 | 1 | stuck_after_plan | 拒方案→确认→ask-approval→允许执行→stuckIdle=8（**L7/允许后空转残留**） |
| p076 | 0 | resolved | PASS（interrupt/boundary） |
| p042 | 0 | resolved | web-ask→允许→evidence→已解决（**L6 本轮非 web_env**） |
| p018 | 0 | resolved | PASS |
| p005 | 1 | stuck_after_plan | 确认→ask-approval→允许执行→stuckIdle=8（测批曾 PASS；**新残/回退**） |
| p091 | 0 | resolved | PASS（曾 timeout；**L5 形本轮绿**） |
| p069 | 0 | resolved | PASS |
| p055 | 0 | resolved | PASS（拒授权恢复后 close-more） |

## 任务轴 tiers

| 档 | rc | terminal | 记 |
|----|-----|----------|-----|
| T1 | 0 | resolved | PASS |
| T2 | 0 | resolved | PASS |
| T3 | 0 | resolved | PASS（leaf-remeasure 曾 timeout；**本轮绿**） |
| T4 | 1 | stuck_after_plan | FAIL：确认执行→boundary-probe→stuckIdle=8（先验跑曾 Page crashed=`exception`；本轮 Task8 复跑为 stuck） |

## 叶因残留（供裁决，本文件不修）

| 叶因 | 本轮是否仍命中 | 证据条 |
|------|----------------|--------|
| **L1a** 死卡/确认 miss | **仍命中** | p002、p068 timeout（after-miss/锁已触发仍未收口） |
| **L2** 拒授权 | **本轮未再红** | p087 resolved |
| **L7** 允许后催写 | **仍命中** | p106、p005 允许后 stuck_after_plan |
| **L4b** 证据门 | **疑改善** | T3 resolved；池内多条 nudge-evidence 后绿 |
| **L5** early propose_goal | **本轮未再红** | p091 resolved |
| **L6** web_env | **本轮未触发** | p042 resolved（ensure 成功路径） |
| **新残** | T4 / p005 | T4 boundary 后 stuck；p005 由绿转 stuck |

## 关单判定

**Gate met: no**

- pass 8/12 ＜ 10  
- 收口失败 4 ≠ 0  
- 环境失败 0 ≤ 2（满足子条件）  
- T4 ≠ 0  

## 裁决请求（ADR-012）

请拍板是否开下一修批、修哪些残留簇（L1a 双拒/miss 后仍 timeout · L7 允许后 stuck · T4 boundary 后 stuck · p005 回退），或接受水位只记坑。**未裁决前不改码。**
