# 002 — 网络只读 S1 过渡语义（外网 curl 双门放行）

- Status: accepted
- Date: 2026-08-16（S1 实现 + S1.1 审计锁定）
- 相关：docs/design/intent-confirmation-domain-design.md §7.1 拍板 3；docs/audits/intent-confirmation-impl-audit.md S4

## Context

拍板 3：curl 对 localhost 自动放行，外网 GET ask。
S1 领域层：classifyReadonly 返回 network-read；actionGate 对外网 network-read 返回 ask；
但 sessionGate 放行 network-read（内外网不分）+ canExecute 对 ask 放行（S6 前过渡）——领域层组合对外网 curl 双门 ok:true。
运行时无洞（renderer 仍走 classifyAction 壳 fail-closed——curl 一律需授权）。

## Decision

- S1 阶段保持过渡语义（sessionGate 放行 network-read + canExecute ask 放行）——运行时由 classifyAction 壳兜底
- 以 L1 测试锁定过渡语义（「S1 过渡语义锁定：外网 network-read 双门放行」）——防误改
- **S6 变更点**：actionGate 接入执行流后，ask 必须由执行层消费为授权卡（外网 curl → 授权卡）；main preApproval 同源引用

## Consequences

- 过渡语义有测试锁定 + S6 清单项跟踪（docs/audits 遗留清单首项）
- 若 S2/S3 接线误读 canExecute（ask=放行）→ 外网 curl 自动放行风险——接线时必读本 ADR
