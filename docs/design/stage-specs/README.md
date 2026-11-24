# Stage Specs（阶段契约）

> 用途：把设计 §6 的阶段计划升级为**机器可验证的阶段契约**（spec-kit 模式）——每阶段一份 spec：
> DoD 断言（可逐条执行勾选）+ TDD 网格（红→绿→重构）+ 产出物 + 边界。
> 消费方：`stage-gate`（阶段门禁执行——SKILL-1，skill 库）；`project-handoff`（HANDOFF §3 阶段视图）。
> 维护规则：阶段开工前定稿（DoD 变更需当阶段 ADR 记录）；阶段完成后 DoD 全勾选 + 审计项状态核对；
> 防双源：DoD 断言直接引用既有门禁命令/测试，不复制门禁输出。

## 模板

```markdown
# Stage S{N} Spec（{阶段名}）

> 来源：docs/design/intent-confirmation-domain-design.md §6；开工日期：YYYY-MM-DD

## DoD（机器可验证断言——stage-gate 逐条执行）

- [ ] L1 全量绿：`npx vitest run`（新增用例 ≥N 条——见 TDD 网格）
- [ ] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [ ] L3 交互：`npx playwright test --project=interaction`（相关场景 + 全量回归）
- [ ] 行为验收：<本阶段可验证行为断言——命令/测试/可观察结果>
- [ ] 审计状态：上阶段 open 项全部 fixed / recorded（docs/audits/ + audit-items）
- [ ] 覆盖矩阵已更新（S2 起——docs/tests/coverage-matrix.md）
- [ ] 决策日志同步：本阶段裁定 → docs/decisions/ 有 ADR
- [ ] 已 push + CI 绿（qa.yml run）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能 | 规范断言（先写——来源 §4/§3.3） | 失败测试（红） | 实现（绿） | 重构 |
|------|--------------------------------|---------------|-----------|------|

## 产出物

- <文件/模块/测试清单>

## 边界（不做——防蔓延）

- <明确排除项——如「XX 属 S{N+1}」>
```

## 现有 spec

- [S2 提议解析](S2.md)（初稿——开工前定稿）
- [S3 触发权切换](S3.md)（已关闸——`docs/audits/stage-gate-S3-2026-08-16.md` PASS；DoD 原文保留未逐条勾选）
- [S4 完成对账](S4.md)（已关闸——`docs/audits/stage-gate-S4-2026-08-16.md` PASS；DoD 原文保留未逐条勾选）
- [S5 推进保障](S5.md)（已关闸——`docs/audits/stage-gate-S5-2026-09-07.md` PASS；DoD 原文保留未逐条勾选）
- [S6 门控双维](S6.md)（已关闸——`docs/audits/stage-gate-S6-2026-08-16.md` PASS；DoD 原文保留未逐条勾选）
- [V2 任务快照跨重启](V2-task-snapshot.md)（GitHub #11——2026-11-15）
- [V2 结构化澄清与假设来源](V2-structured-clarify.md)（GitHub #13——2026-11-16）
- [V2 信任模式预设与低危委托边界](V2-trust-modes.md)（GitHub #12——2026-11-16）
- [V2 机制拒绝事件 gate.denied](V2-gate-denied-events.md)（GitHub #16——2026-11-17）
- [V2 多模型网关与扩展能力治理](V2-multi-model-plugin.md)（GitHub #14——2026-11-17，开工前定稿）
- [V2 问题台账 Local-first 同步](V2-problem-ledger-sync.md)（GitHub #15——2026-11-17，开工前定稿）
- 说明：S3–S6 的 DoD 复选框在 spec 中保留原文作历史契约；关闸判定以对应 stage-gate 报告的逐条断言结果为准（2026-11-24 审计澄清）。
