# ADR-009: 确认协议工具化（V1.5 重构——承载层从文本标记迁移到 schema 工具调用）

## Status

Accepted（2026-08-31——用户拍板：全方位调研后重构，重构完成后再做 Mac 真机验证）

## Context

- #6 真机两轮（08-22 / 08-30）7×P1 公共根因：确认协议 = 模型自由文本标记（【目标确认】【执行方案】【已达成】）+ 正则解析。同模型同任务跨 run 格式漂移实证（方案块三种形状、候选卡有无不定、目标确认跳过）→ 解析器三连补丁不收敛。
- 全方位调研（`structured-protocol-full-research.md` + `research/01-04` 子报告）：14 个竞品/harness 仓库**零文本协议**，全部工具化 + 客户端确定性渲染 + 声明式策略门控；DeepSeek 官方 harness（dsh）同为工具 + 事件溯源状态机。学术支撑：约束解码把格式合法率提升至保证级（PICARD/Synchromesh/Outlines/XGrammar）；反向证据已吸收（aider 代码载荷教训 / NLT 方差反例 / schema≠语义）。
- 机制层诊断：NeonForge 状态机/不变量/事件审计不落后，唯一结构性落后 = 协议承载层。

## Decision

1. **确认协议承载层工具化**（V1.5——机制层/渲染层不动）：
   - 新增四个扁平 schema 虚拟工具：`propose_goal(statement, assumptions[])`、`propose_plan(files[{path,reason}], summary, assumptions[], verification_plan[])`、`report_completion(summary, verification[{command,result,passed}], pending_questions[])`、`ask_user(question, options[], type)`
   - gateway 拦截：校验 args → 置决策点（pending + decisionContent 载荷 = args）；乱序调用走硬序门拒绝回模型（approve-files 模式推广）
   - sysPrompt ⑬⑭⑮ 改写为工具契约；文本标记解析**降级为兜底探测**（不再直接产卡——漂移时打引导事件）
2. **不塞进 JSON 的**：大段代码/diff/长输出——验证证据 command 为短命令行可内联，长内容用文件引用（aider 教训）；schema 保持扁平（NLT 方差反例）
3. **确认卡 UI 不退场**：工具化只换承载层；确认疲劳对策（文件级绑定/风险分级/少而重）与 ADR-008 知情呈现保持
4. **spike 前置**：① 网关 4 新工具定义透传 ② V4 扁平 vs 嵌套 schema args 合格率采样 ③ `thinking:{type}`/`extra_body.reasoning_effort` 非标请求体适配（DeepSeek 系双仓证据——现 gateway 疑按标准 OpenAI 参数处理）

## Consequences

- 解析层 P1 类缺陷结构性消失（provider 层格式保证 + 状态机校验兜底）；参数语义校验仍由门控承担（schema 合法 ≠ 语义正确——BFCL/NESTFUL）
- 解析器退役但保留兜底探测；测试场景助手迁移（scenarios.ts 工具化）
- 验收：重构后 Mac 真机完整轮（替代 #6 旧复验清单）——零解析 P1 + 全流程 0-1 + 解决闭环
- 文本标记协议在 V1.5 前的版本中仍有效（降级通道双向兼容一个版本周期）

## Evidence

- 调研主报告 `docs/design/structured-protocol-full-research.md` + 子报告 `research/01-04`
- 真机取证 `.scratch/neonforge-v1/real-device-findings-20260830.md`
