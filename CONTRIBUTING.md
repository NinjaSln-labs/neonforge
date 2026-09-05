# 贡献指南（CONTRIBUTING）

本仓以 solo 维护 + AI agent 协作为主，但所有变更遵循同一套标准化流程。

## 提交规范

- **Conventional Commits**：`type(scope): subject`——feat / fix / docs / test / refactor / chore / perf
- pre-commit（lefthook → lint-staged）自动跑 ESLint + Prettier，失败即阻断——不要 `--no-verify` 绕过
- push 后 GitHub Actions 跑全量验证链（单元 / 双 tsc / 交互测试 / lint），CI 绿才算收口

## 变更流程

1. **先恢复上下文**：读 `HANDOFF.md`（当前状态 / 下一步 / 未修坑）——防止基于过期假设改动
2. **行为变更必有测试**：领域逻辑 → L1 单元；UI 交互 → L3 交互测试（`apps/desktop/tests/`）
3. **语义裁定入决策日志**：`docs/decisions/`（ADR），不散落在 commit message 里
4. **阶段收口走门禁**：阶段 spec 的 DoD 断言逐条执行通过才允许关闭
5. **发现即入账**：缺陷与坑记录到 `HANDOFF-ARCHIVE/pits.md`（机制教训）或评审报告（`docs/audits/`）

## 分支模型

`main` 单分支推进；大改动开短生命周期分支，CI 绿后合入。

## 环境

见 `DEVELOPMENT.md` 与 `AGENTS.md`（agent 视角入口）。
