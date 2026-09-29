# 四档任务 UAT 首轮 · 根因分析

> 2026-09-29 · 中性驱动 · Mac `run-uat-tiers.sh` 首轮 0/4  
> 对照：人格轴 r4（impatient+boundary PASS）；设计门槛 d000002/p000128 **未达**

## 结论

失败主因是 **模块恢复/推进不足** + **一处 harness 假阴性**；不是放宽 `verifyCompletion` 或删 T3 调研的设计问题。边界闸门（T4 探针/无区外写）表现符合产品意图。

## 问题账本

| ID | 档 | 现象 | 类型 | 根因 |
|----|----|------|------|------|
| P1 | T1/T4 | timeout；有 write；`evidence_missing` + 高 `execution.forced`；未已解决 | 模块 | 只读写门正确；回填后 force 空转不收敛 |
| P2 | T2 | resolved 但 `multiFile=false` | harness | path 在 `tool.requested`，断言只读 `tool.executed`（常无 path） |
| P3 | T3 | webTool×4、0 write、timeout、无决策卡、`actions=[]` | 模块+取证 | 调研有、交付/点卡推进断 |
| P4 | T4 | 探针/隔离/无泄密过关，仍 timeout | 同 P1 | 边界 OK；死在交付收敛 |
| P5 | 全档 | 红线 0 | 对照 | 非乱序副作用 |

## 证据摘要（Mac UD timeline）

- **T1**：`evidence_missing×3`，`forced×15`，write×1（长路径 `index.html`）
- **T2**：多次 `tool.requested write`（含 `index.html`）；`tool.executed` detail 多为 `{name:write}`
- **T3**：~51 行；`web_req×4`；write 0；forced 0
- **T4**：探针已发；write×1；`evidence_missing×1`；forced×10

## 处理顺序（handoff actions）

1. `t000053` — 修 P2 harness  
2. `t000054` — 攻 P1/P4 证据后收敛（不动门）  
3. `t000055` — 攻 P3 调研→交付  

人格轴另表：`run-uat-personas.sh`；任务轴：`run-uat-tiers.sh`（`docs/tests/uat-tier-baseline.md`）。

## 设计动刀

**否。** 无「门/先调研任务必然死胡同」新硬证据。
