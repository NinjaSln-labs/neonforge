# V1.5 立项文档审计报告（2026-08-31）

> 审计员：独立 agent（对照代码 file:line 验证）；审计对象 ADR-009 + stage-spec r1 + 调研四源

> 结论：不能开工（blocker 2）→ 已按本报告修订 ADR-009 r2 + stage-spec r2（附录 A 逐条对应）

审计完成（已对照代码验证）。以下按 A-F 给出 findings。

## A. 一致性三角
- **[major] 拒绝原因闭环未传递**：调研 §3#5 明言「工具化后拒绝原因=下轮 tool message 天然闭环」，但四工具 args 均无 rejection/feedback 字段，ADR 与 spec S1-S4 均未承接用户拒绝后原因如何回模型（现状走文本注入）。
- [minor] 调研 §4.4「声明式确认策略」、dsh blocked≥3 轮未承接，可归 V2。

## B. DoD 可执行性
- **[major] S2「与原文本路径行为一致」**（V1.5:29）无判定标准，仅靠 L3 断言锚定勉强可测；建议枚举派生路径清单。
- [major] S5「零解析 P1」未定义「解析类」P1 枚举，真机后归类会扯皮。
- [minor] ADR「渲染层不动」vs spec S2「renderer 接线」措辞冲突（实为卡组件不动、接线新增），建议统一为「卡渲染组件零改动」。

## C. 可实施性（对照代码）
- **[blocker] 拦截层归属错位**：`src/main/gateway.ts` 是 SSE 传输客户端+TOOL_DEFS 定义（gateway.ts:95,358），不执行工具；工具执行在 `main/tools.ts` ToolRegistry（tools.ts:98）；置 pending 的协议逻辑全在 renderer（ConversationPanel.tsx:809-916 直接调 setPendingState）。`decideProtocolToolCall(state,...)` 需要 renderer 持有的 ConversationState，spec 未说明拦截点落哪层、state 如何跨层可达——S1「gateway：调用拦截」与现实架构不自洽。
- **[major] report_completion 无法映射 CompletionClaim**：`CompletionEvidence.diffs` 必填（conversationState.ts:45-56），工具 args 无 diffs 来源（现靠系统 diff 对账）；且 verification 字段名 `result` vs `output` 不一致——「结构沿用现有」假设不成立。
- [major] revision CAS 与 pending 冻结共存未说清：pending 期工具调用本被禁（conversationState.ts:430），revision 如何递增、模型从何获知新 revision 未定义。
- **[blocker] 阶段时序断裂**：S2 就把标记降级为不产卡，但 sysPrompt ⑬⑭⑮ 到 S3 才改写——S2-S3 之间模型仍被指令输出标记且两路都不产卡=流程必断。降级须随 S3 同步。另 S4 兜底「引导事件→模型改用工具」谁推动下一轮（forceTool/require-advance？）未定义，兜底期双通道死锁无解法。

## D. 风险覆盖
- **[major] Consequences 夸大**：「provider 层格式保证」不成立——Command Code 网关 `response_format` 400、`tool_choice required` 被拒（stage-review-provider-compat-2026-08-21.md:66、structured-output-research.md:42），约束解码不可用，args 合格率只是概率（spike-2 ≥95%）。ADR Context 未记此关键约束。
- spike 缺三项：并行多工具调用（BFCL 风险）、args 流式分片重组/双重序列化（crush 教训）、tool_choice 支持性（硬序门依赖重推）。

## E. ADR 惯例
Context 真实性总体好；上述「格式保证」为唯一夸大点。Consequences 缺负面项（中间态双通道风险、兜底死锁、工具化后延迟增加一轮）。

## F. 流程完整性
S0→S5 依赖大体成立（S2 依赖 S1 工具定义可验证）；但 C 项时序断裂使 S2 独立 DoD 不成立；红线在补充 P1 分类枚举后可测。

## 判定：不能开工
Blocker 2 项：①拦截层归属与 state 可达性未设计；②S2 降级/S3 sysPrompt 时序断裂。修清 blocker 并补 diffs 映射与 Consequences 后方可开工。