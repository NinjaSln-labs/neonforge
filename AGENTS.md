# 工作区规则

工程实体在 `apps/desktop`（仓库根无 `package.json`）。人类向介绍见 `README.md`。

## 通用规则

1. 凭据只引用环境变量或本机凭据文件路径，不写值（防入库泄密）。
2. 提交用 Conventional Commits（`feat` / `fix` / `docs` / `test` / `refactor` / `chore` / `perf`）；走 lefthook → lint-staged（钩子与历史一致）。
3. 单步预计超过 60s 时中途报告进度（防会话假死）。
4. 未决、坑、交接状态只经 project-handoff 的 handoff CLI 写入 `.handoff/`；接手 / 交接 / 收尾先跑下方 check（单一写入口）。
5. 测试与回归遵守硬闸 ADR-012（测完再修 / p000127；防测中改码与擅自开修）。正文：`docs/decisions/012-test-batch-then-fix.md`。
6. 工具私货目录（如 `.cursor/rules`）只写一行指针到本文件（全 agent 入口在此）。

## 命令

```bash
# cwd: apps/desktop（根 node_modules 不是依赖根）
npx vitest run                                                          # L1 单测
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit  # 双 tsconfig 类型检查
npx playwright test --project=interaction                               # L3 interaction
npx eslint .                                                            # lint
npm run e2e   # 依赖 /tmp/nf-e2e-test（入口会建）；改 main/preload 后会重 build

# cwd: 仓库根
python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py" check  # 交接门禁
```

## 内容落位

1. 领域模型 → `docs/domain/00-domain-authority.md`
2. 产品设计 → `docs/product/00-product-design.md`
3. Timeline 事件注册表 → `apps/desktop/src/domain/timeline.ts`
4. 阶段契约 → `docs/design/stage-specs/`；收口跑 stage-gate（按对应 DoD）
5. 语义裁定与流程硬闸全文 → `docs/decisions/`
6. 覆盖矩阵 → `docs/tests/coverage-matrix.md`
7. 阶段评审审计 → `docs/audits/`；产品文档审计 → `docs/PRODUCT-DOC-AUDIT.md`（历史同目录 `r*`）；本机审计草稿 → `.scratch/neonforge-v1/audit-items/`
8. 私有本机 → `.git/info/exclude`；旧交接 → `.handoff/legacy/`；环境例外 → `.handoff/pitfalls/<domain>.jsonl`（ops / e2e / mac / wsl / uat）
