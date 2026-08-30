# 结构化交互协议全方位调研——四源汇总与领域模型对比（2026-08-31）

> 触发：#6 真机两轮 7×P1 公共根因（自由文本标记 + 宽松解析，同模型同任务行为漂移实证）→ 用户决策：全方位调研、评估重构（约束强制单一结构化输出）。
> 四源材料：本文件为**汇总与对比**；四份子报告在 `docs/design/research/01-04`（工业实践 / 学术论文 / CLI 组源码 / DeepSeek 系+harness 组源码）。
> 资产：竞品源码库 `F:\neonforge-competitors\`（23 repo，与远程 HEAD 对齐）；前期速览 `structured-output-research.md`（2026-08-31，本文件取代其"建议拍板"节）。

---

## 1. 总判断

**方向确认，且比预想更强**：四路独立调研（工业实践 / 学术 / 14 仓源码 / DeepSeek 官方 harness）收敛到同一结论——

> **用户决策点的工业标准形态 = 带类型化 schema 的工具调用 + 客户端确定性渲染 + 声明式策略门控**。
> 14 个被分析仓库中**零个**使用「自由文本标记 + 正则解析」承载确认流；唯一长期走文本协议的 aider，其官方文档自我记录了格式漂移的持续痛苦与宽容解析补丁链——正是 NeonForge 两轮真机 7×P1 的镜像。

同时调研给出了三个**必须吸收的反方向证据**（§4），避免把重构做成新的教条。

## 2. 四源关键结论速览

### 2.1 工业实践（子报告 1）
- Claude Code：27 个内置工具，用户决策点全工具化（AskUserQuestion/ExitPlanMode/TodoWrite）；Plan Mode = 状态机 + 注入提示词 + **计划写文件、工具只引用**（Ronacher 逆向）
- Codex：`update_plan` 工具 + 客户端声明式 `approval_policy × sandbox_mode`——**审批是策略不是模型行为**
- 官方实证：OpenAI strict structured outputs（约束解码）**100% schema 可靠**（对比 JSON mode 40-95%）；Anthropic《Writing tools for agents》——「工具是非确定性 agent 间的契约」
- Cursor/Windsurf：审批单元 = 工具调用类别（官方安全文档措辞）

### 2.2 学术论文（子报告 2）
- 支撑（强实证）：Synchromesh→PICARD→Outlines/XGrammar 十年脉络——解析器前移到解码期，格式合法率从概率提升至 ≈100% 保证
- 风险（实证）：**schema 合法 ≠ 值正确**——BFCL/NESTFUL：失败面上移到类型转换/嵌套参数填充；多函数并行场景全模型显著变差
- 风险（有争议）：「格式约束损害推理」（arXiv:2408.02442）原论文有方法缺陷，dottxt 复现为持平略升；但**深嵌套 schema** 与部分模型退化证据仍在（NLT：严格 JSON 使方差 +70% 的反例）
- 确认疲劳：Anthropic 遥测 **93-97% 盲批率**；HCI 文献共识「少而重 + 风险分级」
- 行为方差：温度=0 也不能消除；「工具序列一致但参数分歧」是文本漂移的结构性根源

### 2.3 大厂 CLI 组源码（子报告 3——codex/gemini-cli/qwen-code/opencode/crush/goose/claude-code）
- 七仓零文本协议；交互工具 schema 风格高度趋同（questions[]/header≤12/options{label,description}）
- 拒绝带原因是**协议字段**（codex `Denied{rejection}`/opencode `CorrectedError{feedback}`）
- 解析失败永不抛 UI（codex `RespondToModel` 二分法）；goose 完成声明带 schema 验证 + 逐条错误回模型
- crush 独门：模型双重序列化 args 时自动回退解析（宽松入口归一化的最低成本形态）

### 2.4 DeepSeek 系 + harness 组源码（子报告 4——deep-code/deepcode-hkuds/deepseek-harness/deer-flow/swe-agent/openhands/aider）
- **DeepSeek 官方 harness（dsh）**：goal = 持久域对象三工具 + **revision CAS 乐观锁** + `exit_plan_mode` 服务端校验 + blocked 硬下界（≥3 轮）+ approval asked/decided 审计配对
- **deer-flow todo_middleware**：模型想退出但 todo 未完 → 中间件强制打回——「已达成靠 harness 校验不靠模型自觉」
- **deepcode-hkuds forced capture**：交付物 = `submit_result` 工具参数而非 prose 刮取
- **aider（反面教材 + 正面遗产）**：文本编辑格式十年补丁链（宽容解析 5-9 标记字符/模糊匹配/… 展开）；同时贡献「错误反射回模型 ≤3 次」模式
- **DeepSeek V4 非标点**：`thinking:{type}` + `extra_body.reasoning_effort` 非标请求体；`reasoning_content` 流式 delta 独立解析

## 3. 与 NeonForge 领域模型逐项对比

对比基准：`docs/domain/00-domain-authority.md`（A0 v4.1）+ `docs/design/intent-confirmation-domain-design.md`（四决策点状态机）+ Timeline 事件注册表。

| # | NeonForge 现有机制 | 工业等价物 | 差距/领先判定 |
|---|---|---|---|
| 1 | 四决策点状态机（goal/plan/approval/resolution——pending 冻结、模型不能制造决策点） | codex ModeKind + 策略枚举；gemini ApprovalMode；dsh goal phase（active/paused/blocked/complete） | **设计等价**——状态机语义我们更深（不变量 1-8 + deriveDecisionPoint 纯函数单源）；差距不在状态机在承载 |
| 2 | 确认协议 = 自由文本标记 + parsePlanProposal/parseCompletionClaim/goalFallback | **全部工具化**：propose_goal/exit_plan_mode/complete_task/submit_result（schema args） | **落后（重构核心）**——子报告 3/4 零文本协议；解析层三连补丁不收敛实证 |
| 3 | decisionContent 快照（pending 冻结时内容定格） | gemini plan 文件 + 工具引用；qwen 内联三字段；openhands ActionEvent | **等价**；可吸收：dsh **revision CAS**（快照+乐观锁双保险——模型基于旧快照提议直接 INVALID_UPDATE） |
| 4 | approve-files 批量授权（清单内放行） | codex `ApprovedForSession`（会话缓存）；deep-code `always` 项目允许表；deepcode-hkuds `a=always` | **等价偏领先**——P1-5 文件级绑定已实现；可吸收：按 scope 的白名单表持久化 |
| 5 | 拒绝带原因（RejectReason 枚举 + 拒绝记忆 approvalDecided） | codex `Denied{rejection}` **协议字段**；opencode `CorrectedError{feedback}`；dsh 拒绝反馈 = tool result | **落后一层**——我们有状态机与记忆，但原因传递走文本注入；工具化后拒绝原因 = 下轮 tool message，天然闭环 |
| 6 | resolution 确认 + verifyCompletion 证据对账（S4，ADR-008） | goose `final_output` schema 验证逐条错误回模型；deer-flow todo_middleware 未完禁退；dsh blocked ≥3 轮硬下界 | **语义领先、执行形态落后**——我们的证据对账概念更深（V1a 系统代跑），但曾以「模型自觉文本声明」承载（→ S4 死锁）；工具化 + 中间件强制是行业答案 |
| 7 | <candidates> 澄清（文本块协议） | `ask_user`/`request_user_input`/`ask_clarification`（含 risk_confirmation 类型）——**全行业标准** | **落后（一并重构）**——且 deer-flow 的澄清类型枚举（missing_info/ambiguous/approach_choice/risk_confirmation）值得抄进 schema |
| 8 | gate classifyReadonly（三值 readonly/network-read/hazardous fail-closed） | qwen 两级 LLM 分类器 fail-closed；codex guardian；goose LLM judge；deer-flow RBAC | **方向一致**——qwen 的「规则引擎后置 LLM 兜底门 + 失败一律 block」可作 V2 演进 |
| 9 | Timeline 事件注册表（41+ 类型、asked/decided 式配对、注册表 dev 校验） | dsh approval asked/decided 审计配对；openhands 事件溯源 | **领先**——审计/回放能力多数竞品没有系统化；保持 |
| 10 | authorize 疲劳治理（P1-5 文件级绑定 + 授权卡「少而重」） | Anthropic 遥测 93-97% 盲批 → 行业转向「声明式权限 + 运行时强制」 | **方向一致**——学术（§2.2 题 5）支持我们的文件级绑定 + 风险分级路线 |

**结论**：机制层（状态机/不变量/gate 分类/事件审计）**不落后，部分领先**；唯一结构性落后 = **协议承载层**（#2/#5/#7）——正是重构对象。这份对比同时证明重构是「换承载层」而非「推倒领域模型」：decisionContent 快照结构、确认卡渲染、Timeline 全部保留。

## 4. 交叉验证与分歧点（重构设计必须吸收）

1. **aider 教训（工业）**：大段代码载荷用文本协议优于 JSON（转义伤害编辑质量）→ `propose_plan` 的 files[] 只放 {path, reason} 小结构项；**验证证据/代码不放深层 JSON**——report_completion 的 verification.command 为短命令行可 JSON，长输出用文件引用
2. **NLT 反例（学术）**：部分模型严格 JSON 反而加大行为方差（+18pp 是自然语言胜出的反例）→ schema 保持**扁平**（避免 files[].verification[] 深嵌套——拆成多个浅工具）；文本标记解析保留为**降级通道**（老端点/漂移兜底）
3. **schema 合法 ≠ 语义正确（学术 BFCL/NESTFUL）**：工具化消灭的是「解析失败」，参数语义校验（路径存在/清单合理性）仍由门控承担 + 解决卡呈现给用户（确认卡 UI 不退场）
4. **93-97% 盲批率（Anthropic 遥测）**：确认点「少而重」——P1-5 同文件免批、风险分级（classifyReadonly 三值）方向与文献一致；重构时把「哪些必须人工确认」写成声明式策略而非模型自觉
5. **BEHAVIOR 方差不可消除（学术）**：即使工具化，同任务跨 run 仍可能参数分歧——状态机 + 硬序门（approve-files 模式推广）是不确定性下的确定性骨架，这是 NeonForge 已有的独特资产

## 5. 重构建议（V1.5 立项材料）

**范围**：确认协议承载层工具化（§3 #2/#5/#7），机制层不动。
- 新工具（扁平 schema）：`propose_goal(statement, assumptions[])` / `propose_plan(files[{path,reason}], summary, assumptions[], verification_plan[])` / `report_completion(summary, verification[{command,result,passed}], pending_questions[])` / `ask_user(question, options[], type)`
- gateway 拦截 → 校验 → 置决策点（乱序 → 硬序门拒绝回模型——approve-files 模式推广）
- sysPrompt ⑬⑭⑮ 改写为工具契约；文本标记解析降级为兜底探测（不再直接产卡）
- **spike 前置**（拍板后半天）：① 网关加 4 个工具定义透传验证 ② V4 嵌套/扁平 schema args 合格率各 50 次采样 ③ `thinking`/`reasoning_effort` 非标请求体适配验证（DeepSeek 系双仓证据）
- **验收红线**：真机一轮全流程零解析 P1；DeepSeek V4 args 合格率 ≥95%

## 6. 材料索引

| 材料 | 位置 |
|------|------|
| 子报告 1：工业实践 | `docs/design/research/01-industry-practice.md` |
| 子报告 2：学术论文 | `docs/design/research/02-academic-papers.md` |
| 子报告 3：CLI 组七仓源码 | `docs/design/research/03-source-cli-agents.md` |
| 子报告 4：DeepSeek 系 + harness 七仓源码 | `docs/design/research/04-source-deepseek-harness.md` |
| 竞品源码库（23 repo） | `F:\neonforge-competitors\`（22 仓对齐远程 HEAD；本机私有） |
| 前期速览 | `docs/design/structured-output-research.md`（2026-08-31——其 §6 拍板点由本文件取代） |
| 真机取证（问题定性输入） | `.scratch/neonforge-v1/real-device-findings-20260830.md` |
| 覆盖缺口声明 | kilocode/continue/nanobot/openclaw/opencursor 未做仓级深析（均为已析架构的衍生/轻量框架——cline 分叉、IDE 助手、极简框架）；如需可补析 |
