# 流程行业调研汇总（2026-08-16）——工业最佳实践 + 学术研究方向

> 背景：整体流程审视（DoD/门禁/TDD/CI 节奏/审计跟踪/覆盖矩阵/基线管理/变更记录/会话管理）→ 对照行业。
> 方法：4 主题并行 delegated-research（web_search 一手来源），每发现标注 [Fact]/[Inference] + URL。
> 明细文件（本目录）：`01-agentic-engineering-practices.md`（工业：agent 工程流程）/ `02-methodology-academic.md`（经典+学术）/ `03-skills-ecosystem.md`（skill 能力向）/ `04-tooling-quality-feedback.md`（工具门禁与质量反馈）。

---

## 一、流程审视缺口 × 行业/学术发现 × 修正后建议（核心映射）

| 我的缺口 | 行业/学术证据（[Fact]） | 修正后建议 |
|---|---|---|
| **P0-1 阶段 DoD 缺失** | Scrum/LESS：DoD 分级（团队/任务级）+ 可验证断言 [B1]；JSS2022 调查「完成歧义」是普遍痛点 [B1]；Anthropic evaluator-optimizer：生成→验证→再迭代，验收须可执行 [A1]；Devin verification-as-first-class（agent 自证：测试/lint/构建）[A1] | 每阶段 DoD = **机器可验证断言清单**（非散文）+ 分级（阶段级/任务级）；阶段门禁 = 生成→验证双重检查，不只一次 passes |
| **P0-2 设计文档入库** | Claude Code 最佳实践：长期意图靠**可提交规范文件**（CLAUDE.md/HANDOFF）承载，交接=文件而非对话回放 [A4] | 实施依据（设计文档/审计报告）脱敏入库——「从记忆迁移到 git 常量」 |
| **P1-3 无 lint/hooks** | ESLint flat config + typescript-eslint preset（type-checked 抓类型问题）；Prettier=format、ESLint=lint 分工（eslint-config-prettier 关冲突）；lefthook（原生 hooks+并行）正替代 husky；lint-staged 增量扫描 [D1]；AI 代码风格漂移下门禁价值放大 [D1]；agent 时代 lint/hooks 是最廉价第一道门禁 [A3] | eslint（recommended + 少量 strict）+ prettier + lefthook + lint-staged；门禁只拦「快且确定」项，复杂度交 CI |
| **P1-4 红→绿 TDD 纪律缺失** | ICSE2024/TSE2024：测试先行约束生成实证有效 [B2]；arXiv:2402.13521 同样支持 [B2]；GitHub spec-kit：TDD 网格（红/绿/重构）写进 spec 作为 agent 最小上下文——纪律变成自动执行约束 [A2]；**ASE2025 警示：LLM 生成 test oracle 有偏——假绿风险** [B2]；spec grounding（规范先接地再测）更可靠 [B2] | S2 起 spec-first + test-first 组合：先写规范断言/不变量 → 再写失败测试 → 实现；**测试断言本身要验证**（oracle 不可盲信——本会话 S1 就修了 6 处测试语义错误，正是此风险的实证） |
| **P1-5 push/CI 节奏缺失** | trunk-based：small-and-frequent commit + CI 持续绿作合并/部署 gate [D2]；Copilot coding agent：CI 作为 agent 行动的**即时反馈环**（开 PR→CI 红/绿→修正再推）[A3]；GitHub Actions `paths` filter（文档改动不触发全量）+ `workflow_dispatch`（手动 L4/L5）[D2] | 每阶段 push + CI 绿作下一阶段前置；qa.yml 加 paths/手动触发优化；「19 commit 未 push」= 反馈链断裂的直接证据 |
| **P1-6 审计跟踪 + 审计时机** | 问题落 review thread/issue（id+验收），修复绑回归测试，CI 绿为关闭条件；SonarQube quality gate + 技术债量化 [D3]；Fagan/IEEE1028 前置审查实证有效 [B5]；Boehm 缺陷成本曲线方向成立但固定倍数无证据 [B5]；**CodeRabbit/LLM-as-judge 已是 CI 无人值守门禁** [A5]；Anthropic 内部 evaluator 循环 [A5] | **审计前移**：每次 stage 完成后立即增量评审（LLM-as-judge 或两轴子代理）而非攒 2 阶段追账；审计项 issue 化 + CI 绿关闭；勿用「10x 成本倍数」论证 |
| **P2-7 覆盖矩阵未产出** | IEEE traceability 定义 + LLM 自动追溯恢复（Requirements Classification 2024 / Who's Who 2025——架构实体识别防同名混淆）[B3]；Code Gradients：LLM 代码缺追溯是大问题 [B3]；BASIL/TestCollab RTM 工具 [D5] | LLM 辅助半自动链接恢复（手工维护不可持续）；L1-L5 分层作 traceability 骨架 + 分层报告聚合作发布 gate |
| **P2-8 L5 基线漂移** | 基线显式更新 + 人工 approve（baseline rot 治理）；macOS vs Linux 渲染差异真实——统一 CI 容器作唯一基准 [D4] | L5 baseline 收敛到单一 **Linux Chromium CI 容器**（本地跑=基线漂移源）；基线更新走「显式 + approve」 |
| **P2-9 裁定/变更记录** | ADR（Nygard：context/decision/status + 状态机）+ MSR 实证 [B4]；LLM 自动决策日志（Osmani、arXiv:2506.11005 自动提取 rationale）[B4] | 轻量 ADR/决策日志集中裁定（设计 §7.1 模式升级为带 status 的决策日志） |

## 二、调研揭示的新维度（原审视清单未覆盖）

| 新维度 | 发现 | 对 NeonForge 启示 |
|---|---|---|
| **skill 评估机制缺失（skill 能力向）** | Anthropic：skill 评估须面向**行为聚合**（N 次有/无 skill 的 pass-rate 对比，agent 非确定性）；OpenAI eval-skills：定义度量→脚手架→捕获→打分→回归 [C3] | 60+ skills 无评估是最大短板——为高频 skill（code-review/handoff/writing-plans）建「代表性任务 + N 次 pass-rate」基线 |
| **skill description 触发优化** | SKILL.md 的 description 是主触发机制，需「pushy」+「何时用/关键词」；启动只预载 name+description（progressive disclosure）[C1] | 性价比最高的即时改进：补 description 的场景/关键词密度（skill-description-audit 已有雏形） |
| **原子 vs 流程编排取舍** | mattpocock 极简 vs superpowers 详编（689 行 meta-skill）之争：过度规定降低 agent 自适应；流程 skill 给「原则」不给逐字步骤 [C2] | process skills（handoff/code-review）保持原则式；编排型 skill 防流程僵硬 |
| **skills 与 MCP 分工** | MCP=外部连接能力（18 个月 9700 万月下载、官方 registry 5800+ server、漏洞率 43%）；skills=程序性知识/工作流 [C4] | skills 聚焦「教 agent 怎么用工具」，不复刻连接层 |
| **spec-kit 模式：TDD 网格写进 spec** | GitHub 官方：spec 含 AC+验证步骤+TDD 网格，作 agent 最小完整上下文 [A2] | S 阶段计划可升级为「阶段 spec」（DoD 断言 + TDD 网格），agent 自动执行纪律 |
| **覆盖率不设整体门槛** | Fowler/Kent Beck：覆盖率是有用信号非达标目标；业界用 diff-level coverage + mutation testing 补充 [D5] | 不设「≥X%」死门槛；新增代码 diff coverage + 关键路径 mutation 抽查 |

## 三、对原流程审视的修正（证据驱动的调整）

1. **审计时机（P1-6）**：原建议「阶段末轻量自审 + 阶段末两轴审计」——行业证据进一步指向**每次 stage 完成后立即增量评审**（Anthropic evaluator 循环 / CodeRabbit 模式），并把审计项 issue 化闭环。本会话「T0+S1 攒批审计发现 P0」正是被批评的模式。
2. **TDD（P1-4）**：原建议「严格红→绿」——学术证据补充：**oracle 可靠性前置**（spec grounding 先于测试；LLM 生成的断言需验证）——单纯红→绿纪律不够，假绿比不测更危险。
3. **L5 基线（P2-8）**：原建议「定义更新流程」——证据更强：**基线源应迁到 Linux CI 容器**，本地 macOS 跑=漂移源（当前 playwright webServer 本地起、L5 仅本地跑）。
4. **DoD（P0-1）**：原建议「可验证断言」——学术补充分级与「完成歧义」实证，强化「机器可验证」方向（spec-kit 的 TDD 网格是现成模板）。

## 四、落地顺序（调研后更新版）

```
立即（S2 开工前）：
  1. P1-5 push 一次 + CI 绿（qa.yml 加 paths/手动触发）
  2. P0-1 S2 DoD 写进设计 §6（机器可验证断言 + TDD 网格——spec-kit 模式）
  3. P1-4 spec-first + test-first（oracle 验证前置）
  4. P1-3 eslint+prettier+lefthook+lint-staged（最小集）
  5. P0-2 设计文档/审计报告脱敏入库（你拍板边界）
S2 期间：
  6. P1-6 阶段末即时增量评审（两轴子代理）+ 审计项状态化
  7. P2-9 裁定集中（轻量 ADR/决策日志——§7.1 模式升级）
  8. C 线：skill description 触发优化（复用 skill-description-audit）
S2 末：
  9. P2-7 覆盖矩阵（LLM 辅助半自动）
  10. P2-8 L5 基线迁 Linux CI 容器
  11. C 线：高频 skill eval 基线（N 次 pass-rate）
```

## 五、来源索引

- 工业 agent 工程：`01-agentic-engineering-practices.md`（Anthropic building-effective-agents / OpenAI eval-skills / Cognition testing-development / GitHub spec-kit / Copilot coding agent / Claude Code session-management / CodeRabbit / arXiv 2412.18531）
- 基础方法论：`02-methodology-academic.md`（scrum.org DoD / JSS2022 DoD 调查 / ICSE2024+TSE2024 TDD-LLM / arXiv 2402.13521 / ASE2025 test-oracle / arXiv 2607.06636 spec-grounding / IEEE traceability 2024 / arXiv 2511.02434 / ADR MSR 2023 / Osmani 决策日志 / arXiv 1609.04886 缺陷成本）
- skills 生态：`03-skills-ecosystem.md`（Anthropic agent-skills / SKILL.md 规范 / skills-explained / deephaven evals / OpenAI eval-skills / MCP 生态统计 / superpowers vs pocock）
- 工具门禁：`04-tooling-quality-feedback.md`（typescript-eslint / lefthook / trunkbaseddevelopment / GitHub Actions / SonarQube / CodeRabbit / Playwright snapshots / Chromatic / martinfowler 覆盖率 / BASIL）
