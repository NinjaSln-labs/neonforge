# 调研主题 A：AI 编码代理（Agentic Coding）的工程流程工业实践

> 调研人：delegated-research 子代理。NeonForge 现状对照项：S0–S7 阶段计划+门禁、事后审计循环、无 lint/hooks、19 commit 未 push、TDD 纪律缺失、事后批量审计。

---

## 1. Agent 工作流的验证与完成定义

- [Fact] Anthropic 官方框架（"Building effective agents"）区分 **workflows**（预编排代码路径）与 **agents**（模型动态决定下一步），并明确给出基础构造块：augmented LLM、prompt chaining、routing、evaluator–optimizer loop、orchestrator-workers。核心原则是 agent 只在「复杂度/灵活性正当」时使用，且 **verification 是让 agent 安全的核心**——用 evaluator 循环验证输出，而不是放养。来源：[anthropic.com/engineering/building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents)

- [Fact] OpenAI 对 agent 技能（skills）做了**系统性 evals**：为每条 skill 定义真实子任务的 eval 集，跑回归来检验「完成」是否稳定，防止 prompt 改动引入退化。skill 是 agent 行为单元，其「完成」以 eval 结果而非模型自述判定。来源：[developers.openai.com/blog/eval-skills](https://developers.openai.com/blog/eval-skills)

- [Fact] Cognition / Devin 把**验证（verification）当作规模化 agent 开发的一等公民**：为每个任务定义可执行的验收，agent 在沙箱跑测试、lint、构建来自证完成，人工/系统门禁复核。来源：[cognition.com/blog/testing-development](https://cognition.com/blog/testing-development)

> **启示（NeonForge）**：S0–S7 阶段门禁是对的，方向正确——但补上「evaluator–optimizer」式的双重检查（生成→验证再迭代），不要靠一次 passes 宣称 done；验收准则应可执行而非散文。

## 2. AI 编码的测试策略演变

- [Fact] GitHub 官方 **Spec-Driven Development**（spec-kit）把 "Agents as Interpreters" 制度化：以 spec（含 AC、验证步骤、TDD 网格表）作为 agent 执行的最小完整上下文，spec 中的 TDD 网格表（红/绿/重构）明确要求 tests-before，让代理按测试驱动编写。来源：[github/spec-kit → docs/concepts/sdd.md](https://github.com/github/spec-kit/blob/b7e67f55/docs/concepts/sdd.md)；工业解读 [xebia.com/blog/building-software-with-spec-kit](https://xebia.com/blog/building-software-with-spec-kit/)

- [Fact] 实测厂商（Cognition）明确把 **测试当作 agent 的护栏**：agent 用测试自证，验证 loop 是规模化 agent 开发的核心差异点，而非附赠。来源：[cognition.com/blog/testing-development](https://cognition.com/blog/testing-development)

> **启示**：引入 spec-kit 式 TDD 网格（tests-before）重建 NeonForge 的红绿纪律——把「无 TDD」从习惯性问题变成可被 agent 自动执行的 spec 约束。

## 3. CI/CD 左移与 agent 门禁

- [Fact] GitHub Copilot 新一代 **coding agent** 直接向真实 GitHub 环境操作（PR、Actions），CI 作为**agent 行动的即时反馈环**：agent 开 PR→CI 跑测试→根据红/绿修正再推送，形成 trunk-based 高频小步回环。来源：[github.blog 官方公告](https://github.blog/news-insights/product--news/github-copilot-meet-the-new-coding-agent/)

- [Inference] pre-commit hooks / lint 在 agent 时代仍是**最廉价的第一道门禁**（比 CI 快、在本地提交前就拦），主流水准普遍将 lint/format/test 前置到 agent 提交动作本身，避免废 PR。

> **启示**：把 19 个未 push commit 拆成高频小 push + CI 绿灯，让推送即反馈；补 lint/hooks 到提交前，让 agent 在本地就修静态问题（现状「无 lint/hooks」是断反馈链的头号缺口）。

## 4. 上下文 / 会话管理

- [Fact] Anthropic 官方明确 **compaction**（Claude Code 自动压缩对话上下文）是会话管理核心，配 CLAUDE.md、CLAUDE.local 保存持久决策；实践要点是「用瘦上下文文件承载长期意图，代码历史靠 git manifest」而非回放长对话。来源：[claude.com/blog/using-claude-code-session-management-and-1m-context](https://claude.com/blog/using-claude-code-session-management-and-1m-context)、[code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices)

- [Fact] Anthropic 官方把**最佳实践写成可提交的 CLAUDE.md 文件**（agent 每次启动自动载入），使 long-running agent 跨进程/跨 session 靠**文件交接**而非对话记忆续接。来源：[code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices)

> **启示**：NeonForge 的「事后审计 + 长会话切换」应靠**可提交的工程规范文件**承载（类似 CLAUDE.md / HANDOFF.md），而非在大上下文里保留原始对话——把交接从记忆迁移到 git 常量。

## 5. 质量反馈闭环（LLM-as-judge 代码评审）

- [Fact] 工业界 LLM-as-judge 自动评审已成产品（CodeRabbit 等），在 CI 里对每个 PR 给出上下文评审、按规则门禁合并；其护栏价值在「无人值守质量门禁」。来源：[CodeRabbit 官方访谈 vmblog](https://vmblog.com/qa/vmblog-expert-interview-contextual-code-reviews-with-ai-a-qa-with-coderabbit/)

- [Fact] 学术界亦验证自动代码评审落地（CERN/arXiv 实验），指出**评审质量取决于上下文与评审者能力，需与人类评审配合**。来源：[arxiv 2412.18531 v2](https://arxiv.org/html/2412.18531v2)

- [Fact] Anthropic 官方用 evaluator 循环（Evaluator/Linguistic Acuity）教 agent「生成后自我批评」——judge 是 agent 内部 step，不只外部工具。来源：[anthropic.com/engineering/building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents)

> **启示**：NeonForge 的「事后批量审计」应改为**每次 stage 完成后立即 LLM-as-judge 评审**（增量而非积压 19 commits 后追账），必要时对准验收点做 evaluator 双重检查再放行下一 S。

---

## 来源汇总
1. https://www.anthropic.com/engineering/building-effective-agents
2. https://developers.openai.com/blog/eval-skills
3. https://cognition.com/blog/testing-development
4. https://github.com/github/spec-kit/blob/b7e67f55/docs/concepts/sdd.md
5. https://xebia.com/blog/building-software-with-spec-kit/
6. https://github.blog/news-insights/product--news/github-copilot-meet-the-new-coding-agent/
7. https://claude.com/blog/using-claude-code-session-management-and-1m-context
8. https://code.claude.com/docs/en/best-practices
9. https://vmblog.com/qa/vmblog-expert-interview-contextual-code-reviews-with-ai-a-qa-with-coderabbit/
10. https://arxiv.org/html/2412.18531v2
11. https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
