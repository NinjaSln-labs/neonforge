# AGENTS.md — Agent 工作入口

NeonForge：为 DeepSeek 打造的 AI 问题工作台（Electron 桌面应用，monorepo——工程实体在 `apps/desktop`，仓库根无 `package.json`）。

## 上下文恢复（接手必读，按序）

1. `HANDOFF.md`——交接权威，6 节结构（元信息 / 快照 / 下一步 / 即时操作 / 引用索引 / 维护规则）
2. `HANDOFF-ARCHIVE/`——`pits.md`（已修坑 + 教训）/ `cycles.md`（历史周期）/ `done.md`（已完待办）
3. `.agents/session.md`——活跃会话进度
4. 私有不入库清单（`.git/info/exclude`）：`.scratch/` · `research/` · `scripts/` · `HANDOFF*` · `.agents/session.md`——**不提交、不删除**

## 文档权威（防双源：引用不复制）

| 主题                | 权威                                            |
| ------------------- | ----------------------------------------------- |
| 领域模型            | `docs/domain/00-domain-authority.md`（A0）      |
| 产品设计            | `docs/product/00-product-design.md`（D0）       |
| Timeline 事件注册表 | `apps/desktop/src/domain/timeline.ts`           |
| 阶段契约            | `docs/design/stage-specs/`                      |
| 语义裁定            | `docs/decisions/`（ADR 001-009…）               |
| 覆盖矩阵            | `docs/tests/coverage-matrix.md`                 |
| 阶段评审            | `docs/audits/`                                  |
| 最新索引            | 以 `HANDOFF.md` §5 为准（本文档不重复维护清单） |

## 验证链（一律在 `apps/desktop` 下执行）

| 层        | 命令                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| L1 单元   | `npx vitest run`                                                              |
| L2 类型   | `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` |
| L3 交互   | `npx playwright test --project=interaction`                                   |
| Lint      | `npx eslint .`                                                                |
| L4 端到端 | `npm run e2e` 系（入口前自动检测 main/preload 产物过期并重 build）            |

基线计数与当前状态见 `HANDOFF.md` §2，不在此硬编码。

## 工作约定

- Conventional Commits（`type(scope): subject`——feat / fix / docs / test / refactor / chore / perf）
- pre-commit（lefthook → lint-staged）自动 ESLint + Prettier——不绕过
- 写操作先确认；**禁止明文凭据**（凭据走环境变量或本机凭据文件，只引用位置不写值）
- 长任务（>60s）持续反馈进度
- 发现即入账：坑 → `HANDOFF.md` §4 / `HANDOFF-ARCHIVE/pits.md`；审计发现 → `docs/audits/` + 本机 `audit-items/`
- 阶段收口跑 stage-gate（DoD 断言逐条执行）；语义裁定写决策日志（ADR）

## 已知环境坑速查（详情 `HANDOFF-ARCHIVE/pits.md`）

- vitest / playwright 必须在 `apps/desktop` 下跑（根 `node_modules` 仅缓存，非依赖根）
- 改 `src/main/*` / `preload.ts` 后 e2e 会自动 build 过期产物——无需手动 build，但别怀疑它为什么慢
- e2e 依赖 `/tmp/nf-e2e-test`，脚本入口自动创建
