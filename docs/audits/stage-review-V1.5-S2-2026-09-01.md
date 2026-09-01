# 阶段评审报告：V1.5-S2 renderer 接线（双通道并存）（809f464..3f9aeda，2026-09-01）

> 双轴评审（code-review 阶段末模式）。质量门：L1 561 / L3 64 / 双 tsc / lint / CI run 33472528588 全绿。
> 固定点：8ba26a7（S1 收口 commit）→ HEAD 3f9aeda。评审对象 = S2 三个 commit：
> 809f464（A-017+A-018）/ 04195f2（Task 2.1 派生路径枚举）/ 3f9aeda（评审修复闭环）。

## Standards 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S2-St-1 | suspendRoundRef 只在 done 分支复位——stopGeneration/错误路径残留 → 下一轮兄弟工具误挂起 | 可能（correctness） | **fixed**（3f9aeda——runChat 起点复位，每轮入口重置） |
| S2-St-2 | 两处连续 `if (PROTOCOL_TOOL_NAMES.has(...))` 可合并 | 轻微 | **fixed**（3f9aeda——合并为单块 + pending 分支置位） |
| S2-St-3 | 注释引「suspendedRound」实为 suspendRoundRef | 轻微 | **fixed**（3f9aeda——注释重写） |
| S2-St-4 | lastSignalIdx 与卡渲染的信号判定重复（protoCalls 模式两处） | 可能 | **fixed**（3f9aeda——hasProtoCall 共享 helper 单源） |
| S2-St-5 | gateway emit 块（console.log + onDelta）重复两处 | 轻微 | **fixed**（3f9aeda——emitToolCall 局部 helper） |
| S2-St-6 | gateway 调用点注释误标「round 1 双重序列化剥层」（实为基态） | 轻微 | **fixed**（3f9aeda——注释更正） |
| S2-St-7 | `'"abc"'`（顶层 JSON 字符串 args）行为变化未覆盖（基态剥层抛错 → round 0 短路 null） | 轻微 | **recorded**（低实际风险——所有工具 args 为对象；L1 已覆盖剥层） |
| S2-St-8 | mockBridge askUser helper 未被本 diff 测试消费 | 轻微 | **recorded**（S3 candidates 迁移消费——comment 声明） |
| S2-St-9 | 派生路径断言块 verbatim 重复（S2-1/1b、2/2b、3/3b） | 轻微 | **recorded**（测试可读性——非 correctness；评审后留） |

## Spec 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S2-Sp-1 | suspend 触发于 reject/clarify 分支——结果文本「已提交协议提议」误导（实际未提交） | major（实现错） | **fixed**（3f9aeda——挂起标记只在 pending 分支置位；A-017-3 更新为 reject 并存 → 兄弟照常执行） |
| S2-Sp-2 | suspend 顺序依赖——协议工具在后时兄弟先执行（流式固有） | 可能 | **recorded**（SSE 按序成块、Spike-4 实证协议工具先到为常态；先到先执行与 deer-flow 一致） |
| S2-Sp-3 | DoD「pending 冻结与恢复」L3 断言缺失 + plan 卡 summary 未断言 | major（DoD 部分） | **fixed**（3f9aeda——V1.5-S2-5 断言工具路径 pending 冻结：chatCount 停 1 / shouldStopContinuation）+ **recorded**（summary 不渲染：卡组件零改动约束——DoD 允许） |
| S2-Sp-4 | S1-St-1（since 由调用方传入）未顺手改 | 可能（S1 recorded） | **fixed**（3f9aeda——decideProtocolToolCall 增 since 参数，事件层传入；纯函数不取时钟） |
| S2-Sp-5 | DoD 逐条核对：decisionContent 快照（line 1）✓ / 派生路径字段级相等（line 2，goal/plan/resolution 三条）✓ / 双通道并存（line 3，S2-4/4b）✓ | — | ✅ |
| S2-Sp-6 | 范围纪律：文本标记仍产卡/sysPrompt 未改——零越界；渲染层信号改动（lastSignalIdx/hasPlan/achievedMatch/content 条件放宽）判定为 A-017 必要后果（协议工具消息 content 空 → 卡信号缺失） | — | ✅ |

## 汇总

- Standards：9 findings——fixed 6 / recorded 3 / open 0
- Spec：6 findings——fixed 3 / recorded 2 / 通过 1
- **open 0 项**——S2 全部 DoD 达成，S1 评审 open 2 项（A-017/A-018）已关闭
- 最重问题：S2-St-1（correctness——stop 后挂起残留）与 S2-Sp-1（reject 分支误导文本）——均本次修复

## 修复证据（本次评审当场修，3f9aeda）

- S2-St-1/S2-Sp-1/S2-St-4/S2-Sp-4 等：3f9aeda 单 commit（commit message 逐条列证据）
- 回归：修复后重跑 L1 561 / L3 64 / 双 tsc / ESLint 0 errors（见 commit message）
