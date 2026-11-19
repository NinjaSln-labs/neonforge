# 外部评估文档

- [外部基准评估方案](external-benchmark-plan.md)
- [能力卡模板](capability-card-template.md)
- [2026-11-18 评估覆盖总览](baselines/2026-11-18-eval-coverage-summary.md)
- [2026-11-17 DeepSeek 沙箱基线](baselines/2026-11-17-deepseek-sandbox-baseline.md)
- [2026-11-17 Magpie DSV4.1F 适配器 v0 基线](baselines/2026-11-17-magpie-dsv41f-adapter-baseline.md)
- [2026-11-17 Magpie 策略门 v1](baselines/2026-11-17-magpie-policy-gate-v1.md)
- [2026-11-18 Magpie 策略门 v2](baselines/2026-11-18-magpie-policy-gate-v2.md)
- [2026-11-18 Magpie 策略门 v2 审批回调](baselines/2026-11-18-magpie-policy-gate-v2-approval.md)
- [2026-11-18 Magpie 策略门 v2 + tool_knowledge 攻击](baselines/2026-11-18-magpie-policy-gate-v2-tool-knowledge.md)
- [2026-11-18 Magpie 策略门 v2 + ignore_previous / injecagent](baselines/2026-11-18-magpie-policy-gate-v2-ignore-previous-injecagent.md)
- [2026-11-19 Magpie 策略门 v2 + system_message / direct](baselines/2026-11-19-magpie-policy-gate-v2-system-message-direct.md)
- [2026-11-18 Magpie BFCL 十四类全量（含 multi_turn_base）](baselines/2026-11-18-magpie-bfcl-category-full.md)
- [2026-11-18 Magpie BFCL multi_turn_long_context（DSV4.1FE-OD）](baselines/2026-11-18-magpie-bfcl-multi-turn-long-context.md)
- [2026-11-18 Magpie BFCL multi_turn_miss_func（DSV4.1FE-OD）](baselines/2026-11-18-magpie-bfcl-multi-turn-miss-func.md)
- [2026-11-18 Magpie BFCL multi_turn_miss_param（DSV4.1FE-OD）](baselines/2026-11-18-magpie-bfcl-multi-turn-miss-param.md)
- [2026-11-19 NeonForge 产品审批边界（L1 + L3 UI）](baselines/2026-11-19-neonforge-approval-boundary.md)
- [2026-11-18 用户体验与治理差距评估（初版）](governance-gap-assessment-2026-11-18.md)
- [2026-11-19 AI 风险登记册（初版）](ai-risk-register-2026-11-19.md)
- [2026-11-19 NeonForge 威胁模型（初版）](threat-model-2026-11-19.md)
- [2026-11-19 事件响应 Runbook（初版）](incident-response-runbook-2026-11-19.md)

运行脚本与沙箱定义在 `evals/sandbox/`。所有外部基准必须在一次性容器中运行；不要在本机直接执行。
