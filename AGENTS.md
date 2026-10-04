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

1. 领域模型 → `docs/neonforgeV1.0.0/`（V1.0.0 射程设计树；工作分支 `docs/neonforge-v1.0.0`，基点 main）
2. 产品设计 → 同上目录。**旧设计文＝只读调阅层，两份都在盘上、都不得编辑**：main 重构前版在 `docs/domain/`／`docs/product/` 原路径（与现网实装对应），冻结基线 `be6e299` 版在 `docs/frozen-be6e299/{domain,product}/`（含 ADR-022～025 引用的 `00 §3.7/§3.8` 与 `08` 锚）。迁入只从 `docs/frozen-be6e299/`（＝`git show be6e299:<路径>`）取；迁入完成即退役，不在新树里留指向旧树的活引用（索引见 `docs/neonforgeV1.0.0/ARCHIVE-INDEX.md`）
3. Timeline 事件注册表 → `apps/desktop/src/domain/timeline.ts`
4. 阶段契约 → `docs/design/stage-specs/`；收口跑 stage-gate（按对应 DoD）
5. 语义裁定与流程硬闸全文 → `docs/decisions/`
6. 覆盖矩阵 → `docs/tests/coverage-matrix.md`
7. 阶段评审审计 → `docs/audits/`；产品文档审计 → `docs/PRODUCT-DOC-AUDIT.md`（历史同目录 `r*`）；本机审计草稿 → `.scratch/neonforge-v1/audit-items/`；**交接台账经验汇总（只留可迁移部分，属经验不属依据）→ `docs/experience/`**
8. 私有本机 → `.git/info/exclude`，**`.handoff/` 交接台账在内＝本地私有、禁止入库**（用户 2026-10-05 裁定；调阅走 CLI：`view`／`log`／`next`／`check`）；旧交接 → `.handoff/legacy/`；环境例外 → `.handoff/pitfalls/<domain>.jsonl`（ops / e2e / mac / wsl / uat）
