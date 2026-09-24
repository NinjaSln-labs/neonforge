# AGENTS.md — Agent 工作入口

NeonForge：为 DeepSeek 打造的 AI 问题工作台（Electron 桌面应用，monorepo——工程实体在 `apps/desktop`，仓库根无 `package.json`）。

## 交接存储（`.handoff/`，v3）

- 项目交接存储**唯一落点** `.handoff/`——纯文本 9 槽（status / summary / actions / pitfalls / commands / decisions / scope / exit，基础设施 index / next / unconfirmed / closed / log）。
- **未决项只写 `.handoff/`**（白名单硬契约）——其余处的待办文本是**候选**，非未决项。
- 条目**只经** `scripts/handoff.py` CLI 写（单一写入口 `add` / `close` / `import`）；日期脚本盖、id 脚本分配、`index` 由脚本重建——**不手写 `.handoff/`**。
- 旧 v1 模型（`HANDOFF.md` / `HANDOFF-ARCHIVE/`）已于 2026-09-21 迁入，原件归档 `.handoff/legacy/2026-09-21/`。
- 原 `.agents/session.md`（会话进度载体）已于 2026-09-24 退役——活跃进度与未决一律以 `.handoff/` 为准。

## 上下文恢复（接手必读，按序）

1. `.handoff/`——交接存储（v3；status/summary/actions/pitfalls/decisions/scope/exit + next/index）——旧 `HANDOFF.md` / `HANDOFF-ARCHIVE/` 已迁入并归档
2. `docs/decisions/`——语义裁定 ADR；`docs/design/stage-specs/`——阶段契约（详情见下「文档权威」）
3. 私有不入库清单（`.git/info/exclude`）：`.scratch/` · `research/` · `scripts/` · `HANDOFF*` · `.handoff/`——**不提交、不删除**

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
| 最新索引            | 上表 + `.handoff/status`（旧 `HANDOFF.md` §5 已废） |

## 验证链（一律在 `apps/desktop` 下执行）

| 层        | 命令                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| L1 单元   | `npx vitest run`                                                              |
| L2 类型   | `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` |
| L3 交互   | `npx playwright test --project=interaction`                                   |
| Lint      | `npx eslint .`                                                                |
| L4 端到端 | `npm run e2e` 系（入口前自动检测 main/preload 产物过期并重 build）            |

基线计数与当前状态见 `.handoff/status`，不在此硬编码。

## 工作约定

- Conventional Commits（`type(scope): subject`——feat / fix / docs / test / refactor / chore / perf）
- pre-commit（lefthook → lint-staged）自动 ESLint + Prettier——不绕过
- 写操作先确认；**禁止明文凭据**（凭据走环境变量或本机凭据文件，只引用位置不写值）
- 长任务（>60s）持续反馈进度
- 发现即入账：坑 → `.handoff/`（pitfalls）；未决动作 → `.handoff/`（actions）；审计发现 → `docs/audits/` + 本机 `audit-items/`（候选）
- 阶段收口跑 stage-gate（DoD 断言逐条执行）；语义裁定写决策日志（ADR）

## 已知环境坑速查（详情 `.handoff/pitfalls`；历史原文 `.handoff/legacy/2026-09-21/`）

- vitest / playwright 必须在 `apps/desktop` 下跑（根 `node_modules` 仅缓存，非依赖根）
- 改 `src/main/*` / `preload.ts` 后 e2e 会自动 build 过期产物——无需手动 build，但别怀疑它为什么慢
- e2e 依赖 `/tmp/nf-e2e-test`，脚本入口自动创建
