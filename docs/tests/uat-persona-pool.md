# 多样性人格池（100+ · 抽 12）

> 入口：`bash scripts-cdp/run-uat-persona-pool.sh`  
> 池：`scripts-cdp/persona-pool.json`（生成器 `generate-persona-pool.mjs`）  
> 硬闸：**ADR-012**（测完再修）

## 与任务轴正交

| 轴 | 入口 | 测什么 |
|----|------|--------|
| **人格池**（本文） | `run-uat-persona-pool.sh` | 用户如何对待确认/授权/节奏/意图/收口/边界 |
| **任务** | `run-uat-tiers.sh` | T1–T4 难度梯度（驱动固定中性） |
| **环境** | `uat-D-network.mjs` 等 | 网络抖动等——不进人格主维 |

Legacy 固定 3×4：`run-uat-persona-rounds.sh`（保留对照，非推荐入口）。

## 必有维（每轮抽 12 必须分层盖住）

| 字段 | 取值 | 必抽 |
|------|------|------|
| decisionPolicy | instant_confirm / reject_then_confirm / defer_then_confirm | ≥1 reject_then_confirm |
| approvalPolicy | allow / allow_remember / refuse_once / ask_what | ≥1 非 allow |
| tempo | fast / normal / slow | ≥1 fast |
| intentQuality | clear / vague / contradictory | ≥1 vague 或 contradictory |
| closeAttitude | accept_fast / want_evidence / want_more | ≥1 非 accept_fast |
| boundaryProbe | none / ssh_sysprompt | ≥1 ssh_sysprompt |
| capabilityNeed | local_only / needs_web | ≥1 needs_web |

## 可加维（自由层）

channelBias · rejectKind · scopeCreep · literacy · anxiety · clarifyPatience · trustMemory · voice

## 禁止进人格主维

- taskDifficulty（T1–T4）
- envFault（D-network）
- 人口统计、纯装饰口吻碎刻度

## 抽签

```bash
export NF_UAT_SEED=pilot30   # 缺省=日期哈希；同 seed 可复现
bash scripts-cdp/run-uat-persona-pool.sh
# → /tmp/nf-uat-draw.json（12 ID + assert tags）
# → /tmp/nf-uat-pool-results.txt
```

## 断言

一律：`terminal=resolved` + 红线 0。  
按 tag 叠加：拒方案次数 / 插话下限 / webTool / boundary 探针与隔离。

失败态（均为 FAIL，非成功）：`stuck_after_plan` · `stuck_no_plan` · `config` · 兜底 `timeout`。成功只认 `resolved`。

## 生成与校验

```bash
cd apps/desktop/scripts-cdp
node generate-persona-pool.mjs --limit=30   # 试点
node generate-persona-pool.mjs             # 默认 120
node generate-persona-pool.mjs --check
```
