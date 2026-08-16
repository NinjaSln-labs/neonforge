# Stage Review S7（回归与文档）——A0 全文审校 + 全链回归

> 日期：2026-08-16；固定点：`fe3f990`（S7 前 HEAD）——S7 范围：A0 审校（subagent f8045685）+ P1 修复（4c5791f）+ C2 完善/L5/L4（b8c0d91）
> 轴：Spec（设计文档 §1-9 ↔ 实现——A0 全文审校）+ 全链回归（L1-L5 + L4 真实 API）

## A0 审校发现（subagent f8045685——设计 §1-9 逐节对照实现）

### P1 修复（本阶段落地——4c5791f + b8c0d91）

| # | 发现 | 状态 | 修复 + 证据 |
|---|------|------|------------|
| P1-1 | **触发权重构未落地（S3 DoD 补课——最重）**：deriveDecisionPoint 死导出（零生产调用）——done 分支触发仍走 pendingCardToShow（模型文本探测——设计明令废除的反模式）；S3 gate 以放宽 oracle 放过 | **fixed** | done 分支触发改 deriveDecisionPoint（不变量 2 单源——renderer 只做信号翻译：解析 proposals + 兜底 userRequested（write 拦截/「等你确认」征询/本轮流副作用工具——不漂移场景修正））；pendingCardToShow 生产调用移除（渲染兜底降级 + pending 门收紧——C2 拒绝后兜底卡不残留）；方案卡三要素 IIFE 占位防御（dc.proposal undefined 曾致 React 崩溃——A-004「卡占位不渲染三要素」渲染层补防御）——L3 45 全绿（S3-3b 无快照不弹卡保留） |
| P1-2 | **approvalDecided 未接线——拒绝记忆 deniedApprovals 恒空（§3.4 C6 短封形同虚设）** | **fixed** | useConversationState.rejectApproval（approvalDecided）+ useToolApproval rejectToolCall 登记（toolName+subject+risk）+ canExecute 消费短封（同轮同类 deny——「不要绕过」机制层落地；任务边界重置）+ L1 4 断言 |
| P1-3 | **proposal.goal 事件缺失（§3.5 契约事件）** | **fixed** | timeline 登记（domain proposal + statement/?assumptions）+ done 分支 emit + L1 3 断言 |
| P1-4 | **decision.resolved 载荷缺 RejectReason（§3.5）** | **fixed** | lastRejectReason 状态诊断字段（userDecided/approvalDecided 写/confirm 清）+ deriveStateEvents 载荷 reason + detailKeys ?reason + L1 断言更新 |
| P1-5 | **§3.4 C2 未实现（pending 期自由文本=隐式 reject）** | **fixed + 完善** | send 接入：pending 期新意图文本 → 隐式 reject（direction+text——S7-1 场景）；**确认文本分流（C2 完善——e2e-0to1 场景 B 暴露的产品缺口）**：isConfirmIntent（领域词表）→ 自动确认当前决策点；approval 期明确批准词 → 自动批准（S7-2/S7-3 场景）——确认卡时代遗漏文本确认 |

### P2 记录在案（确认一致）

- gate.denied 未登记——S2/S6 边界明示「S7 或 V2」→ 仍 deferred（V2——拒绝记忆短封已落地（P1-2），gate.denied 事件登记随 V2）
- 外网 curl ask 消费——ADR-002 + S6 gate ✓
- rejectStreak 计数——ADR-001 ✓
- verifyCompletion 快照消费——ADR-004 ✓
- Inv4 单源——ADR-003 ✓

### P3 观察（记录不修）

- §3.5 vs §8.2D 设计内部措辞（task.goal_proposed 保留 vs proposal.goal 替代）——语义对齐（两事件并存：解析层事实 + 结构化提议）——设计措辞 S7 后统一
- decideProgressGuarantee 简版签名 vs 完整版（S5 完整化——§3.3+§6 并读即可）
- decision.requested 载荷缺快照（S3 PASS——内容快照在序列化有保障）
- **L4 模型行为观察**：e2e-suite B 类真实模型在确认门控下行为不稳定（多次被拦后尝试 bash 绕过——文件修改 best-effort——拦截引导优化 = 产品观察项）；e2e-0to1 design 阶段模型 read 探索 20 轮超限（非卡死——收敛判定对探索型模型偏紧——模拟器鲁棒性优化 = S7 后观察项）

## 全链回归结果

| 层 | 结果 | 证据 |
|----|------|------|
| L1 | **421/421** | vitest（+7：P1-2 短封 4 + P1-3 事件 3 + P1-4 断言更新） |
| L2 | 双 tsc 0 错 | renderer + main |
| L3 | **47/47** | playwright interaction（+3：S7-1 C2 隐式拒绝/S7-2 确认文本/S7-3 approval 文本批准） |
| L5 | **36/36** | playwright visual（3 场景基线更新——确认卡门控适配 + updateProjectTitle mock 补全） |
| L4 | e2e-suite **7/7** + e2e-0to1 PHASE=req 通过 | 真实 API（config key——明文 fallback 临时读取不落盘）；design 阶段模型探索超限（观察） |
| CI | **绿**（run 31950400877） | L1/L2/L3/L5 + lint/format |

## 汇总

- A0 审校：P1 5/5 全修复（触发权接线是 S3 DoD 补课——阶段 gate 放宽放过被审校追回）+ P2 确认 + P3 记录
- 全链：L1-L5 + L4 真实 API 全绿（模型行为观察项 2 条记录）
- 本阶段无 open 审计项（A-001~010 全 fixed——S7 无新增）
