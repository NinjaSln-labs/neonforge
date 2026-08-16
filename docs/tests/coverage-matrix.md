# 覆盖矩阵（Coverage Matrix）

> 生成：2026-08-16（S2 首版）→ **更新：S3 完成（2026-08-16）**
> 数据源版本：L1 测试 31 文件 / 377 用例 · 事件注册表 48 事件 · 不变量 Inv 1-8 · S2/S3 DoD · L3 35 场景（interaction）
> 维护：阶段末更新（coverage-matrix skill）；缺口入 audit-items

## 表 1：不变量 ↔ L1 测试

| 不变量 | 语义 | 覆盖测试（文件::用例） | 判定 |
|--------|------|------------------------|------|
| Inv 1 | 决策唯一输入——无决策无推进 | conversationState.test.ts::Inv 1 决策唯一输入 | ✅ |
| Inv 2 | 决策点确定性——deriveDecisionPoint 纯函数 | conversationState.test.ts::Inv 2 决策点确定性 | ✅ |
| Inv 3 | 门控顺序——sessionGate × actionGate 双维正交 | conversationState.test.ts::Inv 3 门控顺序 | ✅ |
| Inv 4 | 无证据不对账——verifyCompletion 单源 | conversationState.test.ts::Inv 4 + verifyCompletionSystem.test.ts（V1a/V1b 扩展） | ✅ |
| Inv 5 | 推进保障——decideProgressGuarantee | conversationState.test.ts::Inv 5 推进保障 | ✅ |
| Inv 6 | 方案单一来源——derivePlannedFiles | conversationState.test.ts::Inv 6 + planProposalParser.test.ts（解析→派生链） | ✅ |
| Inv 7 | PENDING 单一——单值 + 状态空间 | conversationState.test.ts::Inv 7 | ✅ |
| Inv 8 | 拒绝带原因——签名强制 + 运行时校验 | conversationState.test.ts::Inv 8 | ✅ |
| S2 新增：parsePlanProposal 失败降级 | 格式漂移 → no-block/malformed 不产生决策点 | planProposalParser.test.ts::无标记/有标记无文件行 | ✅ |
| S2 新增：坑 102 过滤继承 | 垃圾条目不进清单 | planProposalParser.test.ts::坑 102 过滤 + 路径形态判定 | ✅ |
| S2 新增：verifyCompletion V1a/V1b | 系统复核 + diff 派生（非模型自述） | verifyCompletionSystem.test.ts::V1a/V1b 用例 | ✅ |

## 表 2：事件 ↔ 测试

| 事件 id | 语义 | 断言测试 | 判定 |
|---------|------|----------|------|
| conversation.message_sent | 用户消息 | timelineEvents.test.ts | ✅ |
| conversation.assistant_start | 模型轮开始（forceTool） | timelineEvents.test.ts | ✅ |
| conversation.assistant_done | 模型轮完成 | timelineEvents.test.ts | ✅ |
| conversation.interrupted | 打断 | timelineEvents.test.ts | ✅ |
| task.goal_proposed | 目标提议 | timelineEvents.test.ts::detectProposed | ✅ |
| task.goal_confirmed / _rejected | 目标确认/拒绝 | timelineEvents.test.ts::deriveStateEvents | ✅ |
| task.execution_proposed | 执行方案提议（历史） | timelineEvents.test.ts | ✅ |
| task.execution_confirmed / _rejected | 执行确认/拒绝（历史） | timelineEvents.test.ts | ✅ |
| task.achievement_proposed | 达成提议（历史） | timelineEvents.test.ts | ✅ |
| task.achievement_confirmed / _rejected | 达成确认/拒绝（历史） | timelineEvents.test.ts | ✅ |
| session.pending_set / _cleared | 状态机冻结/解冻 | timelineEvents.test.ts | ✅ |
| plan.approved | 批准清单（追加语义） | timelineEvents.test.ts::计划清单追加 | ✅ |
| plan.rejected | 清单外被拒 | timelineEvents.test.ts | ✅ |
| tool.requested / executing / executed / failed | 工具生命周期 | timelineEvents.test.ts | ✅ |
| tool.blocked | 拦截 gate | timelineEvents.test.ts | ✅ |
| tool.approved / rejected / remembered | 授权三态 | timelineEvents.test.ts | ✅ |
| capability.checked / ledger_updated | 能力检查/回填 | timelineEvents.test.ts | ✅ |
| environment.injected | 环境快照 | timelineEvents.test.ts | ✅ |
| conversation.created | 会话创建 | timelineEvents.test.ts | ✅ |
| execution.forced / released | forceTool 强制/释放 | timelineEvents.test.ts | ✅ |
| execution.force_input | 三集合取证 | timelineEvents.test.ts | ✅ |
| stuck.escalated / needs_human | 停滞升级 | timelineEvents.test.ts | ✅ |
| problem.created / rerun / snapshot_updated / closed | 问题台账生命周期 | timelineEvents.test.ts | ✅ |
| card.shown / resolved / rejected / dismissed | 卡 UI 生命周期 | timelineEvents.test.ts | ✅ |
| decision.requested / resolved | 领域决策点 | timelineEvents.test.ts::deriveStateEvents（decision.*） | ✅ |
| **proposal.plan / proposal.completion** | **提议解析事件（S2 登记 + S3 接线）** | **timelineEvents.test.ts::proposal.*（schema/成功/失败/缺必选 4 断言）** | ✅（A-003 关闭 + A-007 两形态 schema） |
| conversation.status_change / error | 状态/错误 | timelineEvents.test.ts | ✅ |

## 表 3：DoD ↔ 门禁（S2 spec）

| DoD 断言（spec 原文） | 门禁方法（stage-gate 执行方式） | 判定 |
|----------------------|--------------------------------|------|
| L1 全量绿（新增 ≥20 条） | `npx vitest run`（371——新增 27） | ✅ 可执行 |
| L2 契约 0 错 | 双 `npx tsc --noEmit` | ✅ 可执行 |
| L3 交互 31/31 | `npx playwright test --project=interaction` | ✅ 可执行 |
| Lint 门禁 | `npx eslint .` + `npm run format:check` | ✅ 可执行 |
| 行为验收：parsePlanProposal 契约 | planProposalParser.test.ts（9 用例） | ✅ 可执行 |
| 行为验收：parseCompletionClaim 契约 | completionClaimParser.test.ts（6 用例） | ✅ 可执行 |
| 行为验收：verifyCompletion V1a/V1b | verifyCompletionSystem.test.ts（8 用例） | ✅ 可执行 |
| 行为验收：sysPrompt 互锁 | sysPrompt.test.ts::契约互锁（3 用例） | ✅ 可执行 |
| 行为验收：proposal.* 事件登记 | timeline.ts 注册表 + timelineEvents.test.ts（4 断言——A-007 `?` 可选标记）+ S3 emit 接线 | ✅（A-003 fixed——c91079e + A-007 a666459） |
| 审计状态：S1.1 遗留核对 | audit-items 索引（本阶段项 fixed） | ✅ 可执行 |
| 覆盖矩阵首版已产出 | 本文件 | ✅ |
| 决策日志同步 | docs/decisions/ 有 ADR | ✅ 可执行 |
| 已 push + CI 绿 | qa.yml run | ✅ 可执行 |

## 表 4：S3 renderer 接线 ↔ L3 场景（2026-08-16 新增）

| S3 行为 | 场景（interaction） | 判定 |
|---------|---------------------|------|
| 方案卡渲染 PlanProposal 三要素（文件含原因/假设/验证计划） | cards-from-decision-content::S3-1 | ✅ |
| 拒绝方案带原因 → 卡隐藏 + 模型收到方向 | cards-from-decision-content::S3-2 | ✅ |
| 触发权切换——goal 卡内容来自 decisionContent 快照（含关键假设） | cards-from-decision-content::S3-3 | ✅ |
| 触发权切换——无 decisionContent 不弹卡（C3 降级） | cards-from-decision-content::S3-3b（a666459 新增） | ✅ |
| 拒绝超限回退——rejectStreak ≥3 澄清提示（不弹卡轰炸） | cards-from-decision-content::S3-4 | ✅ |
| 决策点持久化往返（decisionContent 序列化） | sessionStore.test.ts::decisionContent 序列化（3 用例） | ✅ |

## 缺口清单

- **无**（A-003 已关闭——proposal.* 事件断言 c91079e 补齐；S3 四场景全部有 L3 承载）
