# 阶段评审报告：V1.5-S1 协议工具定义与接线（7bc5f89..9b46eb9，2026-08-31）

> 双轴评审（code-review 阶段末模式）。质量门：L1 552 / L3 52 / 双 tsc / lint / CI run 33342906559 全绿。

## Standards 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S1-St-1 | decideProtocolToolCall 内 `new Date().toISOString()`——纯函数名实有瑕（不触不变量 2） | 判断题 | **recorded**（S2 顺手改：since 由调用方传入） |
| S1-St-2 | ConversationPanel:771 注释引「不变量 2」实为 1/7 语境 | minor | **fixed**（本次更正注释） |
| S1-St-3 | hardOrderGate.test 用例按缺陷号命名（design §9.5 要求场景命名） | 可能违规 | **fixed**（本次改为场景命名，坑号入注释） |
| S1-St-4 | validateProtocolArgs 字符串校验模式重复 + schema/校验 if 链双写（「单源」只覆盖提示词侧） | 可能 | **recorded**（S2 演进：校验器从 schema 派生） |
| S1-St-5 | 协议分支与文本解析分支载荷构造并存 | 可能 | **recorded**（S4 解析退役时自然收敛） |
| S1-St-6 | clarify content.type 裸 string 未复用枚举联合 | 可能 | **recorded**（minor） |
| S1-St-7 | rejectWith 单行包装 Middle Man | 轻微 | **recorded**（不改——可读性净值） |

## Spec 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S1-Sp-1 | 普通工具并存挂起半做：goal 确认后协议工具与普通工具同轮并存时普通工具照常执行（无挂起分支、无并存测试） | major（DoD 半做） | **open**（A-017——S2 首任务：同轮并存时普通工具挂起分支 + 并存场景测试；风险注：现存机制已挡写副作用——pre-goal 门控/write 规划门控/bash 授权卡，残余风险为 readonly 兄弟先执行） |
| S1-Sp-2 | parse 失败重试 1 次缺失：gateway toolCallRepair 失败即 continue 静默丢弃（附录 B 承诺进 S1） | major（DoD 缺失） | **open**（A-018——S2 首任务与 Sp-1 同 commit：rawArguments 保留 + 重试 1 次） |
| S1-Sp-3 | 「diffs 由 deriveDiffs 填充」字面未落地：diffs 恒 []，deriveDiffs 只用于 missing 判定（与文本路径行为一致） | 文档措辞 | **fixed**（stage-spec DoD 措辞更正为「diffs 置 []——V1b 系统对账在 verifyCompletion 消费」） |
| S1-Sp-4 | 范围纪律：文本标记仍产卡/sysPrompt 未改/CAS 未实现——零越界 | — | ✅ |
| S1-Sp-5 | report_completion 走 verifyThenResolve（证据门）而非直接置位——有意偏离且正确（不变量 4） | — | ✅（S1 报告备案） |
| S1-Sp-6 | 其余声明逐项核实相符（schema 单源/四分支/路径化错误/乱序矩阵修订语义/拒绝回灌通道/output 对齐） | — | ✅ |

## 汇总

- Standards：7 findings——fixed 2 / recorded 5 / open 0
- Spec：6 findings——fixed 1 / open 2 / recorded 0 / 通过 3
- **open 2 项（A-017/A-018）**：S2 首任务一并修（并存挂起分支 + parse 重试，同 commit + 测试）
- 最重问题：S1-Sp-1/Sp-2（DoD 半做——S2 开工即清）

## 修复证据（本评审当场修）

- S1-St-2/S1-St-3 注释与命名更正、S1-Sp-3 stage-spec 措辞更正：本次 commit
- 回归：修复后重跑 L1/L3（见 commit message）
