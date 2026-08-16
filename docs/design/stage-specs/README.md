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
- S3-S7：随开工前补（来源设计 §6 行）
