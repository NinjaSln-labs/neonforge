# ADR-009: 确认协议工具化（V1.5 重构——承载层从文本标记迁移到 schema 工具调用）

## Status

Accepted（2026-08-31——用户拍板：全方位调研后重构，重构完成后再做 Mac 真机验证）
修订 r2（2026-08-31——立项文档审计修正：拦截层归属/时序/Consequences 夸大/CAS 出 scope，见 stage-spec 附录审计记录）

## Context

- #6 真机两轮（08-22 / 08-30）7×P1 公共根因：确认协议 = 模型自由文本标记（【目标确认】【执行方案】【已达成】）+ 正则解析。同模型同任务跨 run 格式漂移实证（方案块三种形状、候选卡有无不定、目标确认跳过）→ 解析器三连补丁不收敛。
- 全方位调研（`structured-protocol-full-research.md` + `research/01-04`）：14 个竞品/harness 仓库**零文本协议**，全部工具化 + 客户端确定性渲染 + 声明式策略门控；DeepSeek 官方 harness（dsh）同为工具 + 事件溯源状态机。学术支撑：约束解码把格式合法率提升至保证级（PICARD/Synchromesh/Outlines/XGrammar）；反向证据已吸收（aider 代码载荷教训 / NLT 方差反例 / schema≠语义）。
- **关键网关约束**（本环境）：Command Code 网关 `response_format` 实测 400、`tool_choice: required` 被拒（ADR-007 + stage-review-provider-compat-2026-08-21）——**约束解码在本环境不可用**，工具 args 格式合格率是概率目标而非保证。
- 机制层诊断：NeonForge 状态机/不变量/事件审计不落后，唯一结构性落后 = 协议承载层。
- **架构现实**（审计 C 项证实）：工具**定义**在 gateway TOOL_DEFS（随请求下发）；模型返回的 tool_calls 由**renderer 流式处理**（gateway 是 SSE 传输客户端，不执行工具）；pending/决策点逻辑全在 renderer（ConversationPanel → conversationState 状态机）；工具执行经 renderer → `tools:execute` IPC → ToolRegistry。协议拦截点必须在 renderer 层。

## Decision

1. **确认协议承载层工具化**（V1.5——机制层与卡渲染组件不动，renderer 协议接线新增）：
   - 新增四个**扁平 schema** 虚拟工具：`propose_goal(statement, assumptions[])`、`propose_plan(files[{path,reason}], summary, assumptions[], verification_plan[])`、`report_completion(summary, verification[{command,output,passed}], pending_questions[])`、`ask_user(question, options[], type)`（type 枚举含 approach_choice/risk_confirmation——deer-flow 类型集）
   - **拦截点 = renderer 协议处理器**：gateway TOOL_DEFS 增补四工具定义（模型可见）；renderer 流式 chunk 处理器新增协议工具分支——经 L1 纯函数 `decideProtocolToolCall(state, tool, args)` 三分支：置决策点（pending + decisionContent 载荷 = 规范化 args）/ 硬序拒绝（合成引导文本回模型——approve-files 模式推广）/ 参数校验失败（路径化错误模板回模型）
   - sysPrompt ⑬⑭⑮ 改写为工具契约（S3）；文本标记解析**与改写同步**降级为兜底探测（不再直接产卡——降级不早于 sysPrompt 改写，避免双通道断流）
2. **不塞进 JSON 的**：大段代码/diff/长输出——验证证据 command 为短命令行可内联，长内容用文件引用（aider 教训）；schema 保持扁平（NLT 方差反例）；`diffs` 不进工具 args（保持 V1b 系统派生——工具无法自证对账）
3. **拒绝原因闭环**：用户拒绝（确认卡 reject）的原因随下一轮消息回模型（现状机制保留）；工具化后 proposal 校验失败/硬序拒绝的原因 = 合成 tool result 文本——两条通道都在 spec 承接
4. **确认卡 UI 不退场**：工具化只换承载层；确认疲劳对策（文件级绑定/风险分级/少而重）与 ADR-008 知情呈现保持
5. **不在本版 scope**：revision CAS 乐观锁（pending 冻结已防并发决策——CAS 是强化非必需，归 V2 recorded）；声明式确认策略引擎（归 V2）
6. **spike 前置**（六项）：① 网关 TOOL_DEFS 增 4 工具透传 ② V4 扁平 schema args 合格率采样（≥95% 红线）③ `thinking:{type}`/`extra_body.reasoning_effort` 非标请求体适配 ④ 并行多工具调用行为 ⑤ tool_calls 流式分片重组 + args 双重序列化对抗（crush 教训）⑥ tool_choice 支持性确认（硬序门重推依赖）

## Consequences

**正**：解析层 P1 类缺陷结构性消失（args 格式合格率概率目标 ≥95% + 状态机校验兜底，残余由引导拒绝消化）；拒绝原因闭环；确认点机器可校验（diff 高亮/风险标注成为可能）。
**负（如实）**：① 本环境无约束解码——格式保证是概率非绝对，坏 args 走「错误回模型重试」多耗一轮；② 工具化使「提议」多占一轮工具往返（延迟 +1 RTT）；③ S3 前后中间态存在双通道（工具 + 文本标记并存）——需时序纪律防断流（stage-spec S2/S3 排序承接）；④ 兜底探测触发时需 forceTool/advance 语义推动模型改道（S3 定义，防双通道死锁）。
**中性**：解析器退役但保留兜底探测；测试场景助手迁移；decisionContent 快照结构不变（卡渲染组件零改动）。

## Evidence

- 调研主报告 `docs/design/structured-protocol-full-research.md` + 子报告 `research/01-04`
- 真机取证 `.scratch/neonforge-v1/real-device-findings-20260830.md`
- 立项文档审计：`docs/audits/v15-spec-review-2026-08-31.md`（blocker×2 修正记录）
