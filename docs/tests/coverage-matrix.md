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
| **completion.evidence_missing** | **完成声明被拒诊断（S4 登记 + 接线打点）** | **timelineEvents.test.ts::completion.evidence_missing（schema/载荷/缺必选 3 断言）+ L3 S4-1a/S4-3 打点断言** | ✅（S4——A-010 关闭） |
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
| 行为验收：completion.evidence_missing 事件登记 | timeline.ts 注册表（domain 'completion'）+ timelineEvents.test.ts（3 断言）+ S4 接线打点 | ✅（S4） |
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

## 表 5：S4 完成证据对账 ↔ 测试（2026-08-16 新增）

| S4 行为 | 场景/用例 | 判定 |
|---------|-----------|------|
| 已解决卡条件 = verifyCompletion 通过（不变量 4 接线——ok=false 不置决策点） | L3 S4-1a（证据不足不弹卡）+ L1 verifyCompletion（8 用例） | ✅ |
| V1a 系统代跑（真实只读命令 → 结果表 → verifyCompletion 闭环） | verificationRunner.integration.test.ts（7 用例——A-010）+ L3 S4-2（复核通过弹卡） | ✅ |
| V1a 复核失败推翻自报（missing verification:cmd） | L3 S4-3 + integration 拒绝侧 | ✅ |
| V1b diff 派生（planned/produced 匹配——缺失 → diff:planned-not-produced） | integration deriveDiffs 2 用例 + verifyCompletionSystem V1b 2 用例 | ✅ |
| completion.evidence_missing 打点（ok:false + missing 清单） | timelineEvents.test.ts 3 断言 + L3 S4-1a/S4-3 打点断言 | ✅ |
| 证据不足回填引导（buildEvidenceBackfill 纯函数 + 注入闭环） | conversationState.test.ts 3 断言 + L3 S4-1a（引导 send 触发 chatCount）/S4-1b（重输出弹卡） | ✅ |

## 表 6：S5 推进保障 ↔ 测试（2026-08-16 新增）

| S5 行为 | 场景/用例 | 判定 |
|---------|-----------|------|
| decideProgressGuarantee 唯一推进判定器（吸收 turnPolicy 状态空间——pending/未确认/lastToolFailed/累积完成度） | progressGuarantee.test.ts 12 用例（S5 新建）+ conversationState.test.ts 继承锁定迁移 5 用例 | ✅ |
| 推进 ≠ 逼调工具（require-advance——工具不可用不逼工具，允许输出推进） | progressGuarantee.test.ts（toolsAvailable=false → require-advance）| ✅ |
| 推进检测统一（proposed/providedEvidence——结构化提议/完成声明带证据 = 推进） | agentLoop.test.ts::evaluateTurnProgress S5 2 用例（【目标确认】/【执行方案】/【已达成】检测 + parseCompletionClaim 证据判定）| ✅ |
| StuckDetector 对齐（提议/证据轮重置——模型走决策点流程不被打断；纯文本承诺仍 escalate——只说不做保留） | agentLoop.test.ts::detectStuck S5 3 用例 + L3 S5-1（连续提议不打断）/S5-2（纯文本 escalate 打点）| ✅ |
| renderer 切换（decideTurnPolicy → decideProgressGuarantee——已确认决策点提议过滤 + toolsAvailable 能力快照） | L3 全量 42（根因 3/T0-1 forceTool 强制回归 + S5-1/2）| ✅ |
| execution.forced/released 事件语义（mode/reason 可回放） | timeline.ts detailKeys ['reason','?mode'] + 接线处打点 | ✅ |
| turnPolicy.ts/forceToolInput 移除（无悬挂引用） | L2 双 tsc 0 错（turnPolicy.ts 已删）| ✅ |

## 表 7：S6 门控双维 ↔ 测试（2026-08-16 新增）

| S6 行为 | 场景/用例 | 判定 |
|---------|-----------|------|
| isSideEffectAction 领域层同源（拍板 3：readonly/localhost 非副作用；外网/写类副作用） | conversationState.test.ts 4 用例（S6 新增）+ 继承锁定迁移 1 用例 | ✅ |
| isLocalhostCommand 单源（actionGate 与 isSideEffectAction 共享） | conversationState.test.ts 1 用例 | ✅ |
| main preApproval 改引用 classifyReadonly（curl localhost 自动/外网 ask——拍板 3 main 侧同步） | tools.test.ts isReadOnlyBash 升级断言（localhost 自动/外网 fail-closed/-o 写副作用 hazardous——S6 暴露缺口修复） | ✅ |
| classifyAction 兼容壳移除（renderer 6 处 + main + agentLoop 全切换——无悬挂引用） | L2 双 tsc 0 错 + L1 412（isSideEffectAction 直连） | ✅ |
| 拍板 3 全链（curl localhost 自动放行/外网 ask 授权卡） | L3 S6-1（localhost done 无授权卡）/S6-2（外网 need-approval 弹卡——executeResults 模拟 main preApproval） | ✅ |
| actionGate 策略接线（不变量 3 全量——ask 走授权卡闭环既有） | L1 actionGate 既有用例 + L3 授权场景回归（write 需授权/清单内自动/合并授权） | ✅ |

## 缺口清单

- **无**（A-003 已关闭——proposal.* 事件断言 c91079e 补齐；A-010 已关闭——S4 V1a integration 7 用例 + L3 4 场景；S3/S4/S5 行为全部有测试承载——S5 新增 progressGuarantee.test.ts 12 用例 + agentLoop 5 + L3 2 场景）
