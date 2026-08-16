# 001 — rejectStreak 计数语义（§4.1 C8 协商保护）

- Status: accepted
- Date: 2026-08-16（S1.1 审计裁定）
- 相关：docs/design/intent-confirmation-domain-design.md §4.1；docs/audits/intent-confirmation-impl-audit.md S2

## Context

设计 §4.1：「同一决策点连续拒绝计数上限（建议 3 次）——计数随决策点确认/新提议重置」。
字面冲突：若模型重提议（新 content）即重置计数，则「拒绝→重提议→再拒绝」循环永远到不了 3 次上限——协商保护失效。
实现初版按字面（setPending 带 content 重置 0），L1 测试立即暴露 r3.rejectStreak=1 而非 2。

## Decision

- 模型重提议（setPending 带新 content）属**同一决策点延续——不重置** `rejectStreak`
- 确认（userDecided confirm）→ 重置 0；任务边界（goal 确认）→ 重置 0
- 「随新提议重置」按 §3.4 C2 语义 = 用户新意图（pending 期间新自由文本 → reject(direction) + 新 GoalProposal）= 新决策点——由应用层经 goal 确认边界落实（S3 接线）
- 领域层只承载计数；超限回退（AskToAct 澄清/人工接管）消费方 = S3

## Consequences

- 协商保护可达（3 次拒绝触发超限）
- S3 接线时需实现「用户新意图重置」路径（不在领域层——避免区分重提议与新意图的隐式判定）
- 设计 §4.1 已加「S1.1 实现裁定」注记
