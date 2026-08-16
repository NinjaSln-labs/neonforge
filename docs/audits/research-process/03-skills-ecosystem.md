# 主题 C：Agent Skills 生态与设计（skill 能力向）

## 1. Agent Skills 规范与生态
- [Fact] Anthropic 于 2025-10-16 发布 Agent Skills，定义为「包含 SKILL.md 的文件夹（instructions + scripts + resources）」；2025-12-18 将其作为开放标准发布。SKILL.md 必须含 YAML frontmatter（`name` + `description`），其中 description 是主触发机制，需「pushy」以对抗 skill 欠触发倾向。https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- [Fact] Anthropic 官方规范：description 需同时包含「做什么」与「何时用」（具体场景/关键词）；主体建议 <500 行，超限用 reference 文件做渐进式加载；用「为什么」而非「ALWAYS/NEVER」；避免 over-specification。https://mintlify.wiki/anthropics/skills/spec/skill-format
- [Fact] **渐进式披露（progressive disclosure）**是核心设计原则：启动时仅把每个 skill 的 name+description 预载入 system prompt，触发时才读 SKILL.md 正文，需要时再读捆绑文件——context 可近乎无界。官方将 skills 与 prompts/Projects/MCP/subagents 作了定位区分：skills = 可复用能力包，prompts = 一次性指令。https://claude.com/blog/skills-explained
- [Inference] NeonForge 60+ skills 已合规于「文件夹 + description + progressive disclosure」，应补强 description 的「何时用/关键词」密度以提升触发率。

## 2. skill 设计最佳实践
- [Fact] 官方「开发与评估」指南：①先从评测开始，跑代表性任务找能力缺口→增量建 skill；②正文臃肿时拆分文件、互斥场景尽量分路径省 token；③以 Claude 视角监控实际使用轨迹、留意 overreliance；④迭代中用失败案例自省反哺 skill。https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- [Fact] 命名规范：lowercase-hyphen；description 双向触发；兼顾 generality 与具体 example（如 `service_action_resource`）。https://mintlify.wiki/anthropics/skills/spec/skill-format
- [Fact] 社区两大路线之争：mattpocock/skills 主张「极简骨架（~12 行）+ 交给 agent 自组织」，obra/superpowers 主张「详细 meta-skill（689 行）+ 强流程编排」。教训：过度规定写法（硬化模板）反而降低 agent 自适应；流程 skill 应给「原则」而非「逐字步骤」。https://dev.to/jamilxt/superpowers-vs-agent-skills-vs-pocock-three-philosophies-of-ai-coding-workflows-e6n
- [Inference] NeonForge 需在「原子 vs 流程编排」间显式取舍：原子技能（code-review、writing-plans）好维护，编排型 skill（含多子代理的）要防止流程僵硬。

## 3. skill 维护与质量
- [Fact] 官方明确 skill 评估须面向**行为聚合**（agents 非确定性）：跑 N 次对「有 skill vs 无 skill」做成功率对比，而非单次判断；并配合迭代反馈环衡量是否达成目标。https://deephaven.io/blog/2026/05/29/agent-skills-evals/
- [Fact] OpenAI 提供了系统化 evals-for-skills 方法（定义度量→测试脚手架→捕获输出→大模型打分→Summary stats→迭代闭环/Karpathy loop），用于跟踪 skill 更新是否破坏行为。https://developers.openai.com/blog/eval-skills
- [Inference] NeonForge 无 skill 评估机制是最短板：应先为高频 skill 建「代表性任务 + N 次 pass-rate」基线，再谈迭代。skill-description-audit 已是描述合规审计的雏形（可查描述 vs 正文不匹配、旧名残留、触发词不足）。

## 4. MCP 与 skills 的关系
- [Fact] MCP 18 个月达到 9,700 万月 SDK 下载、官方 registry 5,800+ 服务器（社区索引 16,000+），2026 初并入 Linux Foundation；但公共 server 漏洞率 43%——增长与安全债务并存。https://agentmarketcap.ai/blog/2026/04/06/mcp-18-months-5800-servers-security-debt-enterprise-adoption
- [Fact] Anthropic 将 skills 视为 MCP 的**互补层**：MCP = 外部工具/能力（连接外部系统），skills = 教 agent 如何使用工具与软件的**复杂工作流/程序性知识**；「知识 vs 能力」分工。https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- [Inference] NeonForge 的 skills 属于「知识/流程」向，应聚焦「教 agent 怎么用工具」，而非复刻 MCP 的连接能力。

## 5. 过程技能（process skills）
- [Fact] 业界实践（superpowers 的 brainstorming/writing-plans/handoff、matttpocock 的原子式 skills、obra 的 meta-techniques）表明：元流程技能的价值在「把质量门禁/交接约定固化成可复用 flow」，但必须警惕过度规定与「技能疲劳」——agent 会盲目套模板而不判断适用性。https://github.com/HundredBillion/dmi_superpowers , https://dev.to/jamilxt/superpowers-vs-agent-skills-vs-pocock-three-philosophies-of-ai-coding-workflows-e6n
- [Inference] NeonForge 的手写 process skills（project-handoff / code-review / executing-plans）正是这个方向，应加「每 skill 的完成标准 + 自查清单」并做行为验证，避免与 writing-plans 等相似 skill 的边界/触发重叠。

---

### 对 NeonForge 的启示汇总
1. description 触发优化（场景+关键词、pushy）是性价比最高的即时改进。2. 立即补 skill evals（N 次 pass-rate 基线），当前无评估机制是最大缺口。3. 在原子与编排间显式设定，防止流程 skill 过度规定。4. skills 聚焦「知识/流程」、与 MCP 连接层分工清晰。5. 为手写 process skills 加完成标准 + 触发去重审计（skill-description-audit 已部分覆盖）。

### 来源
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://mintlify.wiki/anthropics/skills/spec/skill-format
- https://claude.com/blog/skills-explained
- https://deephaven.io/blog/2026/05/29/agent-skills-evals/
- https://developers.openai.com/blog/eval-skills
- https://agentmarketcap.ai/blog/2026/04/06/mcp-18-months-5800-servers-security-debt-enterprise-adoption
- https://dev.to/jamilxt/superpowers-vs-agent-skills-vs-pocock-three-philosophies-of-ai-coding-workflows-e6n
- https://github.com/HundredBillion/dmi_superpowers
