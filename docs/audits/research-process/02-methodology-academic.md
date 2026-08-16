# 调研主题 B：基础方法论（经典 + 学术）

> 调研代理：delegated-research · 主题：DoD / TDD+LLM / 需求追溯 / 变更与裁定 / 质量反馈循环
> 规范：每项发现标注 [Fact]（有来源）或 [Inference]；每子主题给出「对 NeonForge 的启示」。
> NeNeonForge 现状：S0–S7 阶段+门禁、TDD 纪律待恢复、无覆盖矩阵、裁定散落、事后审计循环。

---

## 1. Definition of Done（DoD）

- [Fact] DoD 源于 Scrum/XP：Scrum 将 DoD 定义为「完成某项工作所需的、团队一致同意的验收标准清单」，可分级为 团队级（sprint/release）与 任务级/用户故事级；其要点是"完成"应是**可验证**的，而非任意的口头判断。[scrum.org](https://www.scrum.org/resources/blog/definition-done-dod-explanation-and-example)。Nygard/LESS 亦强调 DoD「层级化」（story ↔ sprint ↔ release）、可测试性与可观察证据。[LESS](https://conference.less.works/less/framework/definition-of-done)
- [Fact] 2022 调查（Nawrocki 等，*JSS* / 预印 arXiv:2208.04003）：团队用 DoD 带来进度可见性、质量一致性与验收一致性等益处，但主要问题是**完成标准模糊**（缺乏客观/量化准则）、成员对 DoD 理解不一致、DoD 维护困难——「完成」的歧义是普遍痛点。[arXiv:2208.04003](https://ar5iv.labs.arxiv.org/html/2208.04003)
- [Fact] LLM 时代 DoD 演进的学术对应：可执行/可验证验收标准（machine-verifiable assertions）成为主题，与"test oracle 问题"研究同源——LLM 时代 doD 的"可验证断言"逐步迁移到 自动化测试期与规范断言（见 §2）。[ASE2025-oracles](https://homes.cs.washington.edu/~mernst/pubs/neurosymbolic-oracles-ase2025-abstract.html)
- **对 NeonForge 的启示**：S0–S7 阶段门禁应把每个阶段 DoD 显式化为**机器可验证断言清单**（而非散文），并分级（阶段级/任务级），以消除"完成"歧义。

## 2. TDD 与 LLM 生成代码

- [Fact] 经典 TDD（Kent Beck 红-绿-重构）在 LLM 编码下的实证：ICSE 2024（Fakhoury 等）*LLM-based Test-driven Interactive Code Generation*——用户先写失败测试再让 LLM 补实现，实证评估其在 LLM 辅助场景下的有效性。[ICSE2024](https://conf.researchr.org/details/icse-2024/icse-2024-posters/70/)；完整版见 [TSE 2024](https://dl.acm.org/doi/10.1109/tse.2024.3428972)。
- [Fact] arXiv:2402.13521 *Test-Driven Development for Code Generation*：证明「测试先行约束生成」可显著提升 LLM 生成代码的正确性——测试提供可执行约束/验收准则。[arXiv](https://huggingface.co/papers/2402.13521)
- [Fact] 但学术证据同时揭示瓶颈：ASE 2025 *Do LLMs Generate Useful Test Oracles?*——LLM 生成的 test oracle 有显著不可靠/有偏问题，提示"测试先行"不能对 oracle 质量盲目信任。[ASE2025 或acle](https://conf.researchr.org/details/ase-2025/ase-2025-papers/10/)；[Washington PDF](https://homes.cs.washington.edu/~mernst/pubs/neurosymbolic-oracles-ase2025-abstract.html)
- [Fact] spec-driven 方向：*Specification Grounding Drives Test Effectiveness for LLM Code*（arXiv:2607.06636）与 SGCR（ASE 2025）表明：**规范/不变量"接地（grounding）"驱动测试有效性**——先有规范断言，再测，比盲目加测试更可靠。[scirate](https://scirate.com/arxiv/2607.06636)；[SGCR ASE2025](https://dl.acm.org/doi/abs/10.1109/ASE63991.2025.00315)
- **对 NeonForge 的启示**：恢复 TDD 时应采用「规范/不变量先于测试」的 spec-first + test-first 组合；且先验证 LLM 生成的断言可靠，否则红绿循环的"绿"是假绿。

## 3. 需求追溯（Traceability）与覆盖矩阵

- [Fact] IEEE 定义层面，traceability 指需求↔设计↔实现↔测试 之间的链接；覆盖矩阵是经典载体。学术最新进展：*Requirements Classification for Traceability Link Recovery*（IEEE 2024）——LLM 用于自动恢复追溯链接，提升 recall/precision。[IEEE-10628507](https://ieeexplore.ieee.org/abstract/document/10628507)
- [Fact] ACM TAAAS/Moran 等 *Who's Who? LLM-assisted Software Traceability with Architecture Entity Recognition*（arXiv:2511.02434）——用架构实体识别辅助 LLM 做追溯，缓解 LLM 混淆同名实体的问题，展示 2025 自动追溯的新方法。[arXiv](https://arxiv.org/abs/2511.02434v1)；[ACM](https://dlnext.acm.org/doi/10.1145/3807453)
- [Fact] *Code Gradients: Towards Automated Traceability of LLM-Generated Code*——专门研究 LLM 生成代码的自动追溯，指出 AI 输出缺少可追溯性是大问题。[Durham](https://durham-repository.worktribe.com/output/2433851/)
- **对 NeonForge 的启示**：建立测试↔不变量↔事件覆盖矩阵时应引入 **LLM 辅助半自动链接恢复**（降低纯手工维护成本），但需实体识别防同名混淆——矩阵可作为门禁的最小分母。

## 4. 变更管理与决策记录（ADR / 裁定）

- [Fact] ADR 源于 Michael Nygard《Record Architecture Decisions》模式（浅层文档、每条含 context/decision/status），被 OSS 广泛采用。MSR 研究 *Using ADRs in Open Source Projects—An MSR Study on GitHub*（IEEE 2023）实证其使用现状、结构差异与维护实践。[IEEE-10155430](https://ieeexplore.ieee.org/document/10155430)。[Nygard 原模式示例](https://github.com/joelparkerhenderson/architecture-decision-record)；[nhsx 模板](https://nhsx.github.io/il-hans-infrastructure/adrs/000-Record-Architecture-Decisions)
- [Fact] LLM/agent 项目中的「裁定记录」工业实践：*Automated Decision Logs in AI-Assisted Coding*（Addy Osmani）——主张在 AI 辅助编码中自动记录决策/裁定日志，使设计裁决可留痕、可回放。[Osmani](https://addyosmani.com/blog/automated-decision-logs/)；学术侧 *Automated Extraction and Analysis of Developer's Rationale in OSS*（arXiv:2506.11005）支持从 commit/讨论自动提取 rationale。[arXiv:2506.11005](https://ar5iv.labs.arxiv.org/html/2506.11005)
- **对 NeonForge 的启示**：S 阶段的「裁定」应写入**轻量 ADR/决策日志**（context/decision/status 模板），并按 Nygard 模式设状态机，使散落裁定集中、可追溯、可回滚。

## 5. 质量反馈循环（事后审计 vs 前置防线）

- [Fact] Fagan inspection、IEEE 1028（软件评审）等经典前置审查模型被广泛使用；实证显示评审在缺陷检测上有效，但需要投入与机制。[An analysis of defect densities (Semantic Scholar)](https://www.semanticscholar.org/paper/An-analysis-of-defect-densities-found-during-Kelly-Sherif/952e7bbaa1469f2d47609c1fdfedb5dbdf47b75c)
- [Fact] 经典 Boehm 缺陷成本曲线（缺陷越晚修复成本越高，经《Software Engineering Economics》/DIE 数据）在 2020 后被重新审视：arXiv/缺陷成本研究显示成本随阶段增长的曲线整体形态仍成立，但**无/弱证据支持"10x/100x"这类固定倍数**，实际倍数高度依赖项目；因此"前置防线优先"的方向成立，但量化应谨慎。[arXiv:1609.04886](https://ar5iv.labs.arxiv.org/html/1609.04886)。配套：*A Business Case for SW Process Improvement*（早期审查 ROI，[csiac](https://csiac.dtic.mil/wp-content/uploads/2021/06/A-Business-Case-for-SW-Process-Improvement-Measuring-ROI-from-SWE-Mgmt-SOAR.pdf)）
- [Fact] *Quantifying value of adding inspection effort early in the development process*（IET SEN）实证前置审查投入的量化价值，支持"防线前置"。[IET-SEN](https://www.booksci.cn/literature/78988126.htm)
- **对 NeonForge 的启示**：当前「事后审计循环」应前移为「阶段门禁内的前置审查（inspection）+ 机器断言」双防线——方向符合成本曲线，但勿依赖固定倍数来论证收益。

---

## 来源 URL 汇总

1. https://www.scrum.org/resources/blog/definition-done-dod-explanation-and-example
2. https://conference.less.works/less/framework/definition-of-done
3. https://ar5iv.labs.arxiv.org/html/2208.04003（DoD 调查研究，JSS2022）
4. https://conf.researchr.org/details/icse-2024/icse-2024-posters/70/（ICSE2024 test-driven LLM）
5. https://dl.acm.org/doi/10.1109/tse.2024.3428972（TSE 版）
6. https://huggingface.co/papers/2402.13521（TDD for Code Generation）
7. https://conf.researchr.org/details/ase-2025/ase-2025-papers/10/（LLM test oracles 实证）
8. https://homes.cs.washington.edu/~mernst/pubs/neurosymbolic-oracles-ase2025-abstract.html
9. https://scirate.com/arxiv/2607.06636（Specification Grounding）
10. https://dl.acm.org/doi/abs/10.1109/ASE63991.2025.00315（SGCR 规范接地）
11. https://ieeexplore.ieee.org/abstract/document/10628507（Requirements Classification for Traceability）
12. https://arxiv.org/abs/2511.02434v1（Who's Who LLM traceability）
13. https://durham-repository.worktribe.com/output/2433851/（Code Gradients）
14. https://ieeexplore.ieee.org/document/10155430（ADR MSR Study）
15. https://nhsx.github.io/il-hans-infrastructure/adrs/000-Record-Architecture-Decisions（Nygard ADR 模板）
16. https://addyosmani.com/blog/automated-decision-logs/（AI 自动决策日志）
17. https://ar5iv.labs.arxiv.org/html/2506.11005（Developer rationales 自动提取）
18. https://ar5iv.labs.arxiv.org/html/1609.04886（缺陷成本曲线重新审视）
19. https://csiac.dtic.mil/wp-content/uploads/2021/06/A-Business-Case-for-SW-Process-Improvement-Measuring-ROI-from-SWE-Mgmt-SOAR.pdf（前置审查 ROI）
20. https://www.semanticscholar.org/paper/An-analysis-of-defect-densities-found-during-Kelly-Sherif/952e7bbaa1469f2d47609c1fdfedb5dbdf47b75c（inspection 缺陷密度）
