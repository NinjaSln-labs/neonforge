# 阶段末补跑评审：S2 提议解析 + S3 renderer 接线——2026-08-16

> 模式：code-review 阶段末评审（P1-6 审计前移）——**补跑**（B1 后 S2/S3 曾直接 stage-gate 收口，漏掉增量评审——流程失误，本报告补齐）
> 固定点：S2 = `77169de`..`6212956`；S3 = `6212956`..`fe75f10`
> Spec 来源：`docs/design/stage-specs/S2.md` / `S3.md`（定稿版）+ 设计 §3.3/§3.4/§4.1/§8.1C/§8.2D/§8.2E/§8.3F
> 方法：双轴并行子代理 ×2 阶段（Standards = 仓库规范 + Fowler smell；Spec = spec 逐条核对）
> 结论：**S2 忠实实现（无硬违规/无蔓延）；S3 头号 DoD 触发权切换实现一半（渲染条件未切换）——待修复项**

---

## S2 复审（77169de..6212956）

### Standards 轴
**无硬违规**（isLikelyPath 单源化逐字一致无回归）。判断项：
- [S2-S1] completionClaimParser passed 判定靠正则（「通过」+「error」同行误判；0 error 残留误判）——judgement
- [S2-S2] deriveDiffs 命名误导（Mysterious Name——实现是 planned∩produced 交集，600 行当「planned 未产出」判——名字暗示缺口方向相反）
- [S2-S3] passed 正则「通过」重复（拼写级）
- [S2-S4] V1a 信任边界：systemState 传入但 verificationResults 无该命令记录时静默按模型自报通过（与 S1 无系统态同处置，边界未区分）
- [S2-S5] proposal.plan detailKeys 双形态（ok=false 时 files/summary 缺席）——宽松约定可接受
- [S2-S6] sysPrompt ⑬ 互锁断言仅 contains「关键假设」——局部互锁

### Spec 轴
**忠实实现**：DoD 全达（L1 27 新用例 ✅ / 行为验收 5 组 ✅ / 矩阵 ✅ / ADR-004 ✅）；无 missing 无蔓延。记录项：
- [S2-P1] parsePlanProposal summary 捕获盲区（方案句在文件清单后恒为空——低危，summary 非强制）
- [S2-P2] V1a「核对输出」仅查 ok 布尔不比对 output 内容——ADR-004 已声明移交 S4（integration 测试待 S4 补）
- [S2-P3] A-003 实体在 `.scratch/`（gitignored）——门禁「审计状态」断言无法 git 复核（可追溯性瑕疵）

## S3 复审（6212956..fe75f10）

### Standards 轴
**无硬违规**（Q5 inPlannedFiles 双实现确已删除——单源成立）。判断项：
- [S3-S1] **触发权双源（最重）**：渲染条件三处文本探测（goalMatch/hasPlan/achievedMatch——ConversationPanel:2025/2090/2173）与领域层 pendingCardToShow 同款 includes；**goal 正则两处分歧**（:2025 `/【目标确认[:：]\s*([^】]+)/` 无收尾 vs :712 `/【目标确认：([^】]+)】/` 无冒号容错）——全角冒号/空白下弹卡不一
- [S3-S2] extractAssumptions 与 planProposalParser assumptions 节解析重复 + 目标卡/方案卡各写一份 IIFE 假设渲染（Duplicated Code）
- [S3-S3] useConversationState.reject 缺省 `{kind:'other'}`——域层 userDecided 无 reason 即 throw（不变量 8），缺省静默掩盖调用方漏传（与不变量精神相背）
- [S3-S4] 持久化过期快照：确认后 clearPending 清 decisionContent，但历史消息对象上旧快照不清理——恢复倒序会命中过期快照重挂 pending
- [S3-S5] interaction 断言强度：DOM 文本断言无法证伪「内容仍来自文本解析」（S3-3 标题与实现同缺口）

### Spec 轴
- **[S3-P1] 触发权切换实现一半（最重——核心 DoD 未达）**：S3.md:14「卡渲染条件从模型文本标记改为领域状态派生……唯一来源 decisionContent」+ TDD 网格「删除 hasPlan/achievedMatch/goalMatch 文本判定路径」——实际只切内容（卡文本从 decisionContent.proposal 取），**渲染条件仍文本探测**；deriveDecisionPoint **零消费**；pendingCardToShow 兼容壳仍在（4 处调用）；「无 decisionContent 不弹卡」被违反；S3-3 测试与实现同缺口
- **[S3-P2] 坑 101 未根治（部分）**：rejectedCardIdx 仍为隐藏机制（onClick 同步 set 缓解时序但机制未重设计）——S3.md:16 要求「不再依赖 rejectedCardIdx 异步时序」
- **[S3-P3] useConversationState 拒绝原因单测缺失**：S3.md TDD 网格要求 useConversationState.test.ts（reject 带 kind/text；无 reason 转换被拦）——文件未改
- **[S3-P4] approval 卡未从 decisionContent 取**：DoD:14「四类卡均从快照取」——approval 走 useToolApproval 独立路径（setPendingState('approval') 无快照）
- [S3-P5] L1 新增 6 <10（严格按 spec 字面不达标——跨层合计 10 达标，计数口径问题）
- [S3-P6] proposal.plan detailKeys 收窄 ['ok'] 但实际 emit 带 summary/files——schema 与载荷不一致（改动 S2 定稿接口）

---

## 状态化清单

| # | 来源 | 发现 | 状态 | 处置 |
|---|------|------|------|------|
| S3-P1+S3-S1 | Spec a1 + Standards b1 | **触发权切换实现一半**（渲染条件文本探测 + deriveDecisionPoint 零消费 + goal 正则分歧） | **open** | 修复（本报告后随阶段处理）→ A-004 |
| S3-P2 | Spec a2 | 坑 101 未根治（rejectedCardIdx 机制未重设计） | **open** | 修复 → A-005 |
| S3-P3+S3-S3 | Spec a3 + Standards b3 | reject 缺省 reason 掩盖不变量 8 + 单测缺失 | **open** | 修复（reason 必传或测试强制）→ A-006 |
| S3-P4 | Spec a4 | approval 卡未从 decisionContent 取 | recorded | 裁决：approval 卡走 useToolApproval 独立授权流（S6 actionGate 接线时统一快照——记录理由） |
| S3-P6 | Spec c3 | proposal.plan detailKeys 与载荷不一致 | **open** | 修复（schema 对齐）→ A-007 |
| S3-S2 | Standards b2 | extractAssumptions 与解析器重复 + 双卡 IIFE 重复 | **open** | 修复（共享 helper）→ A-008 |
| S3-S4 | Standards b4 | 持久化过期快照时序风险 | **open** | 修复（确认后清历史快照）→ A-009 |
| S3-S5 | Standards b5 | 断言强度（S3-3 与实现同缺口） | 并入 A-004 | 触发权切换修复时同步加强断言 |
| S3-P5 | Spec wrong | L1 新增计数口径 | recorded | 裁决：跨层合计 10 达标——spec 计数口径修订（L1+L3 合并表述），gate 报告已注明 |
| S2-P1 | Spec c1 | summary 捕获盲区 | recorded | 裁决：summary 非强制（引导项）——提示词 ⑭ 方案句在前正常捕获 |
| S2-P2+S2-S4 | Spec c2 + Standards | V1a output 不比对 + 信任边界 | recorded | 裁决：ADR-004 已声明移交 S4（S4 补 integration 测试——A-010 跟踪） |
| S2-S2 | Standards | deriveDiffs 命名误导 | recorded | 裁决：纯命名问题——S4 接线时顺手改名（记录理由） |
| S2-S6 | Standards | ⑬ 互锁局部性 | recorded | 裁决：契约锚点已有——强化属锦上添花 |
| S2-P3 | Spec | A-003 实体 gitignored | recorded | 裁决：审计实体本机私有（仓库惯例）——gate 报告承担外部复核 |
| S2-S1/S2-S3 | Standards | passed 正则可靠性 | recorded | 裁决：容错设计（半结构化输入）——低危不阻断 |

## 下游

- open 7 项 → audit-items（A-004~A-010）
- 修复后重跑 S3 gate 相关断言 + 全量门禁 + push + CI 绿
- S2 无修复项（全部 recorded）——但记录本报告为 S2 的复审闭环
