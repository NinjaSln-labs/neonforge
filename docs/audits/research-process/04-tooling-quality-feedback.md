# 04 · 工具链门禁与质量反馈：工业实践调研

> 主题 D：lint/format/pre-commit 门禁、trunk-based 与 CI 节奏、审计跟踪与质量债、视觉基线管理、覆盖率/可追溯性。
> 每条标注 [Fact]（有来源）或 [Inference]（推断）；每条给「对 NeonForge 启示」。中文为主，术语英文保留。

---

## 1. Lint / Format / Pre-commit 门禁（2024–2026）

- [Fact] ESLint 的 flat config 已是默认配置格式；typescript-eslint v8 提供 `recommended` / `recommended-type-checked` / `strict` / `strict-type-checked` 等 preset，type-checked 变体能捕捉类型层面的问题（需 parser 消耗类型信息，代价是速度）。来源：https://typescript-eslint.io/getting-started/ 、https://typescript-eslint.io/users/configs/ 、https://typescript-eslint.io/getting-started/typed-linting/
- [Fact] Prettier 与 ESLint 分工：formatting（换行/引号/缩进）交给 Prettier，linting（正确性/反模式/语义）交给 ESLint；ESLint 官方建议用 flat config 的 `eslint-config-prettier` 关闭冲突的规则，避免两个工具打架。来源：https://raw.githubusercontent.com/typescript-eslint/typescript-eslint/main/docs/users/What_About_Formatting.mdx
- [Fact] hook 管理工具选择：husky（老牌、Node 生态、需 `core.hooksPath` 或手动 install）；lefthook（用原生 git hooks 文件 + 并行，启动快，越来越多项目弃 husky 换 lefthook 以提速 pre-commit）；`pre-commit`（Python 框架，跨语言）。来源：https://www.edopedia.com/blog/lefthook-vs-husky/ 、https://dev.to/recca0120/ditch-husky-speed-up-git-hooks-with-lefthook-hkm
- [Fact] `lint-staged` 的增量扫描模式是标准实践：只对暂存(staged)文件跑 lint，避免全量 lint 拖慢 commit。来源：https://www.cnblogs.com/longmo666/p/19364089 等社区实践
- [Inference] 门禁拦什么：门禁应做「快、确定性、无歧义」的检查（语法、风格、typescript 类型、import order、安全敏感规则），复杂度门槛通常不放进 pre-commit（太慢、易误报），交给 CI 的深度分析。
- [Inference] AI 生成代码下 lint 门禁价值放大：AI 代码常出现一致但非团队惯例的风格(style drift)、未使用/重复导入、类型松弱，门禁把「AI 代码是否符合可接受基线」变成机器判定，而非人工 code review 兜底。

> **对 NeonForge 启示**：引入 flat-config ESLint + Prettier，用 lefthook（或 husky）+ lint-staged 对 staged 文件增量 lint/format；门禁只拦语法、类型、风格、安全敏感规则，复杂度交给 CI。

---

## 2. Trunk-based Development 与 CI 节奏

- [Fact] trunk-based development：开发者直接提交到主分支（短期特性分支 ≤2 天），CI 必须保持持续绿，主分支始终可部署；PR 短小、「small and frequent commits」是它的核心主张。来源：https://trunkbaseddevelopment.com/ 、https://mergify.com/learn/trunk-based-development
- [Fact] Google 实践（持续交付社区共识）：trunk-based 下推送节奏以「天」为单位，CI 绿（green）作为合并/部署的门禁（gate），红了优先处理、全员停新提交修复。来源：https://trunkbaseddevelopment.com/ 、https://www.wsbctechnicalblog.github.io（分支策略讨论）
- [Fact] 单人多项目（个人 OSS）：trunk-based 的轻量版本是「direct-to-main + CI 绿再 merge」，可用语义化提交 + 标签发布；不必上复杂 branching。(Inference-ish, 社区普遍做法)
- [Fact] GitHub Actions 支持 `paths`/`paths-ignore` path filter（按变更文件决定 job 是否跑，避免文档改动触发全量测试），以及 `workflow_dispatch`（手动触发，供按需跑 L4/L5/重跑基线）。来源：https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow 、https://github.com/orgs/community/discussions/9182

> **对 NeonForge 启示**：19 commit 未 push 说明推送节奏断了——应回归 small-and-frequent push；用 `paths` 让文档/lint 改动不浪费 CI，用 `workflow_dispatch` 手动触发 L4/L5 与基线重跑，CI 绿作为合并门禁。

---

## 3. 审计跟踪与质量问题生命周期

- [Fact] GitHub code review 用 PR review thread 承载问题对话；CodeRabbit/LLM review 以 inline 评论 + 「问题标记」形式在 PR 内跟踪，可 issue 化或 thread 化闭环。来源：https://coderabbitai-docs coderabbit 生态（npm: https://www.npmjs.com/package/coderabbitai-mcp ）
- [Fact] SonarQube 通过「quality gate + 技术债(sqale)」把问题量化、设门槛，并在 CI 拦截不合格合入；技术债清单(register/backlog)是持续识别-优先级-消除的闭环实践。来源：https://www.sonarsource.com/resources/library/technical-debt-reduction/ 、https://www.sonarsource.com/zh/blog/why-technical-debt-is-still-your-teams-biggest-productivity-drain/
- [Inference] 「审计→修复→验证→关闭」最小闭环：把问题落到 issue/review thread（有 id、负责人、验收），修复后由其绑定的测试/CI 验证，关闭时引用验证证据；手工「待办表格」无法工具化，容易石沉大海。

> **对 NeonForge 启示**：审计问题应「每项一个 issue + 关联 review thread/get commit」，修复配回归测试，用 CI 绿作为关闭条件；可引入 CodeRabbit 让 AI 在 PR 内初筛。

---

## 4. 视觉回归与基线管理

- [Fact] Playwright `toHaveScreenshot()` 本地首跑生成 baseline，后续 diff 用 `--update-snapshots`/`--update-sourcemaps` 显式更新；CI 上靠截图 diff 识别回归。来源：https://runebook.dev/zh/docs/playwright/api/class-locatorassertions/locator-assertions-to-have-screenshot-2 、https://stackoverflow.com revisions
- [Fact] Chromatic/Percy 把 visual test 集成到/PR，baseline 随合并更新，diff 需人工 approve（review/accept），形成「PR 内视觉 gate」。来源：https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/
- [Fact] 基线漂移治理共识：基线在「有意视觉变更」时显式更新，每次更新应有人 review；不加 diff review 的自动更新会让截图退化（baseline rot）。来源：https://raw.githubusercontent.com/stevekinney/stevekinney.net/main/courses/enterprise-ui/testing-at-scale.md
- [Fact/Inference] 多平台渲染差异（macOS vs Linux 字体/抗锯齿/hinting）是真实问题：Chromium 在不同 OS 截图像素可能不同，需统一 CI 容器(e.g. Linux image)作为唯一 baseline 基准，或按平台分别存 baseline。来源：stevekinney 同上
- [Inference] NeonForge「L5 仅本地跑」使 baseline 依赖开发者本机渲染，多人/macOS 差异会让测试不稳定——应锁用 CI 容器（Linux Chromium）生成并比对 baseline，本地跑仅供预览。

> **对 NeonForge 启示**：把 L5 baseline 收敛到一个固定 CI 容器（Linux Chromium）统一生成与比对，避免 macOS 漂移；基线更新走「显式更新 + 人工 approve」而非自动覆盖。

---

## 5. 覆盖率与测试门禁

- [Fact] 覆盖率「不是目的」是主流共识：Martin Fowler 总结覆盖率是有用信号但非达标目标，常用「Kent Beck 名句」表达。来源：https://martinfowler.com/bliki/TestCoverage.html 、https://www.ssw.com.au/rules/do-you-use-the-kent-beck-philosophy
- [Fact] 业界不把单一百分比当门禁，而用「覆盖率做 diff 级门槛 + mutation testing 补充」：突变测试测「测试是否真的能抓失效」，弥补 line/statement 覆盖率的虚假安全感。来源：https://groups.io/g/extremeprogramming/message/26578 、martinfowler
- [Fact/Inference] 覆盖矩阵（测试↔需求↔事件）的追溯有专门工具（BASIL、TestCollab RTM、索爱平台），把每条需求/用例映射到测试与代码，支持需求变更影响分析。来源：https://github.com/elisa-tech/BASIL 、https://testcollab.com/features/requirements-traceability-matrix
- [Inference] NeonForge 的 L1–L5 分层本身可作 traceability 骨架：需求/AC ↔ 各层测试断言可追溯；测试报告聚合（汇总所有层通过率）作为发布 gate，比单一覆盖率数字更有意义。

> **对 NeonForge 启示**：不要设「整体 ≥X%」死门槛，改用「新增/变更代码 diff coverage」+ 关键路径 mutation 抽查；用 L1–L5 分层报告做需求↔测试追溯与聚合 gate。

---

## 来源清单

- typescript-eslint Getting Started: https://typescript-eslint.io/getting-started/
- typescript-eslint Shared Configs: https://typescript-eslint.io/users/configs/
- typescript-eslint typed linting: https://typescript-eslint.io/getting-started/typed-linting/
- typescript-eslint formatting vs lint: https://raw.githubusercontent.com/typescript-eslint/typescript-eslint/main/docs/users/What_About_Formatting.mdx
- Lefthook vs Husky: https://www.edopedia.com/blog/lefthook-vs-husky/
- Ditch Husky → Lefthook: https://dev.to/recca0120/ditch-husky-speed-up-git-hooks-with-lefthook-hkm
- Trunk Based Development: https://trunkbaseddevelopment.com/
- Mergify TBD: https://mergify.com/learn/trunk-based-development
- GitHub Actions trigger a workflow: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- paths empty-commits discussion: https://github.com/orgs/community/discussions/9182
- SonarSource tech-debt reduction: https://www.sonarsource.com/resources/library/technical-debt-reduction/
- Sonar tech-debt productivity drain: https://www.sonarsource.com/zh/blog/why-technical-debt-is-still-your-teams-biggest-productivity-drain/
- CodeRabbit MCP: https://www.npmjs.com/package/coderabbitai-mcp
- Playwright toHaveScreenshot: https://runebook.dev/zh/docs/playwright/api/class-locatorassertions/locator-assertions-to-have-screenshot-2
- Chromatic visual testing with Playwright: https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/
- stevekinney visual testing at scale: https://raw.githubusercontent.com/stevekinney/stevekinney.net/main/courses/enterprise-ui/testing-at-scale.md
- Martin Fowler Test Coverage: https://martinfowler.com/bliki/TestCoverage.html
- Kent Beck philosophy (SSW): https://www.ssw.com.au/rules/do-you-use-the-kent-beck-philosophy
- XP coverage analysis: https://groups.io/g/extremeprogramming/message/26578
- BASIL traceability: https://github.com/elisa-tech/BASIL
- TestCollab RTM: https://testcollab.com/features/requirements-traceability-matrix
