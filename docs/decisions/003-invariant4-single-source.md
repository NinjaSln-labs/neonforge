# 003 — Inv4 单源（evidenceVerifiable 公共谓词）

- Status: accepted
- Date: 2026-08-16（S1.1 审计修复）
- 相关：docs/design/intent-confirmation-domain-design.md §4 不变量 4；docs/audits/intent-confirmation-impl-audit.md S1（P0）

## Context

审计实证：含非只读验证命令（如 `npm install`）的完成声明——
`verifyCompletion` 判 unverifiable → ok=false，但 `completionEvidenceComplete` 只查
verification 非空 && pendingQuestions 空 → true → `deriveDecisionPoint` 仍产生 resolution 决策点。
同一 claim 两套规则结论相反——不变量 4（无证据不对账）承载不全。

## Decision

- 抽公共谓词 `isSystemVerifiable(command)`（classifyReadonly 只读/network-read = 系统可代跑核验）
- `evidenceVerifiable(evidence)`：verification 非空 + 全部可代跑 + 无 pendingQuestions——单源
- `completionEvidenceComplete` 委托 evidenceVerifiable（兼容壳）；`verifyCompletion` 复用 isSystemVerifiable
- unverifiable 证据 → 不进入 resolution 决策点（deriveDecisionPoint 返回 'none'）

## Consequences

- Inv4 分歧消除；L1 新增用例锁定（unverifiable → 不进入对账）
- S2 扩展 V1a/V1b 时以 evidenceVerifiable 为不变量基础，不再引入第二套规则
