# 阶段评审报告：V1.5-S3 sysPrompt 契约改写 + 文本降级（73826cd..671633e，2026-09-01）

> 双轴评审（code-review 阶段末模式）。质量门：L1 561 / L3 62（+2 skip）/ 双 tsc / lint / CI run 33482252875 全绿。
> 固定点：6fb6c9d（S2 收口 commit）→ HEAD 671633e。评审对象 = S3 三个 commit：
> 73826cd（sysPrompt 工具契约 + 文本标记原子降级）/ f780432（T0 自测 skip）/ 671633e（评审 S3-St-3 修复）。

## Standards 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S3-St-1 | done 分支三处标记探测重复（goal/plan/completion——仅 regex/marker 不同） | 轻微 | **recorded**（可 map 折叠——可读性，非 correctness） |
| S3-St-2 | guideByMarker 与 sysPrompt ⑬⑭⑮ 工具 schema 跨文件漂移风险 | 轻微 | **recorded**（引导文本与提示词措辞——低风险） |
| S3-St-3 | 注释「标记不产卡」对 plan 不准确：parseExecutionPlan 未受 fallbackDetected 守卫——文本方案标记降级后 plannedFiles 仍并入 → write 绕过确认自动放行（语义漏洞） | 可能（correctness） | **fixed**（671633e——降级路径跳过并入；userRequested 信号保留产卡不受影响） |
| S3-St-4 | T0 自测 1/3 test.skip 注释 blame 生产 prop 竞态——若真则是产品 bug | 轻微 | **recorded**（S4 恢复重写——时间盒；语义已由 core 根因 3/P2 覆盖） |
| S3-St-5 | planPropose 的 _note 参数静默丢弃（原 summary 语义丢失） | 轻微 | **recorded**（工具形态下 summary 固定「执行方案」——测试意图经 args 表达） |
| S3-St-6 | completeClaim/planPropose 重实现领域解析（parseCompletionClaim/parsePlanProposal） | 轻微 | **recorded**（测试侧复制——S4 解析层退役时收敛） |

## Spec 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S3-Sp-1 | 降级引导用 silent send + 系统提示注入（escalate 模式），非 spec 字面「maybeContinue/forceTool + 合成 tool result」——forceTool 已删（S5 移除），文本标记轮无 toolCall → maybeContinue 不触发，需显式触发下一轮 | 可能（实现偏差） | **recorded**（语义等价：无工具轮时 silent send 是唯一推进方式；对齐 escalate 先例；机制偏差非功能缺陷） |
| S3-Sp-2 | L3 一轮改道断言是结果断言（V1.5-S3-1 断言改道完成），非机制断言（未锁 tool result 载荷/计数上限） | 轻微 | **recorded**（行为正确性已锁——机制细节在 S4 测试迁移时补） |
| S3-Sp-3 | candidates 部分迁移：⑧ 仍说「仅 <candidates> 候选块是允许的标记」+ renderer 仍渲染 <candidates> 按钮；ask_user options 是文本+序号（满足「clarify 分支渲染」，未按钮化） | 轻微 | **recorded**（⑧ 的 <candidates> 描述在 S4 解析层退役时清理；ask_user 按钮化是体验增强非 DoD 硬要求） |
| S3-Sp-4 | T0 自测 1/3 test.skip = 计划自验证机制被禁用 | 可能（DoD gap） | **recorded**（S4 scenarios 工具化时恢复——语义已由 core 覆盖） |
| S3-Sp-5 | DoD 逐条核对：sysPrompt ⑬⑭⑮（①）✓ / 原子降级（②）✓ / 一轮改道（③）部分（机制 recorded）/ candidates 迁移（④）部分（recorded）/ 词表校验（⑤）✓ | — | ✅（含 recorded） |
| S3-Sp-6 | 范围纪律：测试迁移（~8 文件）判定为必要（文本标记不再产卡 → 旧文本断言会腐化）；addPlannedFiles 于 propose_plan 判定为合理（清单内 write 放行对齐——超出 5 DoD 但必要） | — | ✅ |

## 汇总

- Standards：6 findings——fixed 1 / recorded 5 / open 0
- Spec：6 findings——fixed 0 / recorded 4 / 通过 2
- **open 0 项**——S3 DoD 达成（2 项部分实现记录为 S4 迁移）；S3-St-3 correctness 修复
- 最重问题：S3-St-3（plan 降级 write 绕过确认——本次修复）

## 修复证据（本次评审当场修，671633e）

- S3-St-3：fallbackDetected 时 parseExecutionPlan 跳过（plannedFiles 不并入）
- 回归：L1 561 / L3 关键 5 项 / 双 tsc / ESLint 0 errors（见 commit message）

## 下游（S4）

- T0 自测 1/3 恢复重写（scenarios 工具化时）
- ⑧ <candidates> 描述清理（解析层退役）
- ask_user 按钮化（体验增强）
