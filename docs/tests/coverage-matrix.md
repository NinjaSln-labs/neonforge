# 覆盖矩阵（Coverage Matrix）

> 首版：2026-08-16（S2）→ 增补：2026-09-29（Keenable 合规）
> 当前快照（2026-11-25，PR #141–#161 合并后）：L1 **79 文件 / 974 用例** · 事件注册表 **93 事件** · 不变量 Inv 1-8 + I17-I21 · L3 interaction **96 收集 / 93 通过 + 3 跳过**
> 表 1-表 10 保留各阶段时点的基线记录；当前总数以本快照为准。
> 维护：阶段末更新（coverage-matrix skill）；缺口入 audit-items

## 表 1：不变量 ↔ L1 测试

| 不变量 | 语义 | 覆盖测试（文件::用例） | 判定 |
|--------|------|------------------------|------|
| Inv 1 | 决策唯一输入——无决策无推进 | conversationState.test.ts::Inv 1 决策唯一输入 | ✅ |
| Inv 2 | 决策点确定性——deriveDecisionPoint 纯函数 | conversationState.test.ts::Inv 2 决策点确定性 | ✅ |
| Inv 3 | 门控顺序——sessionGate × actionGate 双维正交 | conversationState.test.ts::Inv 3 门控顺序 | ✅ |
| Inv 4 | 无证据不对账——verifyCompletion 单源；≥1 条可代跑通过对账（ADR-011） | conversationState.test.ts::Inv 4 + verifyCompletionSystem.test.ts（V1a/V1b 扩展） | ✅ |
| Inv 5 | 推进保障——decideProgressGuarantee | conversationState.test.ts::Inv 5 推进保障 | ✅ |
| Inv 6 | 方案单一来源——derivePlannedFiles | conversationState.test.ts::Inv 6 + planProposalParser.test.ts（解析→派生链） | ✅ |
| Inv 7 | PENDING 单一——单值 + 状态空间 | conversationState.test.ts::Inv 7 | ✅ |
| Inv 8 | 拒绝带原因——签名强制 + 运行时校验 | conversationState.test.ts::Inv 8 | ✅ |
| S2 新增：parsePlanProposal 失败降级 | 格式漂移 → no-block/malformed 不产生决策点 | planProposalParser.test.ts::无标记/有标记无文件行 | ✅ |
| S2 新增：坑 102 过滤继承 | 垃圾条目不进清单 | planProposalParser.test.ts::坑 102 过滤 + 路径形态判定 | ✅ |
| S2 新增：verifyCompletion V1a/V1b | 系统复核 + diff 派生（非模型自述） | verifyCompletionSystem.test.ts::V1a/V1b 用例 | ✅ |

## 表 2：事件 ↔ 测试

> 2026-11-25 判定口径（取代 2026-11-24「判定 ✅ 仅表示已登记」的模糊表述）：**✅ = 有载荷语义或行为断言（来源列在该行）；⚠️ = 仅注册/结构，或注册表有但全代码库无发射点（死事件）**。2026-11-24 已补**注册表遍历校验**（`timelineEvents.test.ts::TIMELINE_EVENT_SPECS 注册表遍历`：全部 93 事件的命名/domain/role/detailKeys 形态 + 必选载荷强制执行 + 未登记拒绝）。2026-11-25 起逐事件**载荷语义**覆盖分批补课：deriveStateEvents 载荷（point/kind/reason/content）、detectProposed 载荷、queue 八类、changeset 四类、acceptance 五类、extension 六类、L3 card.resolved/conversation.created/proposal.clarify、授权 v4 tool.approved/remembered/tool.rejected/card.rejected、任务边界 problem.created/assistant_start/done/environment.injected、停止 interrupted、对话健康 loop_guard/forced_clarify——明细见下表与「缺口清单」。历史事件名 `task.execution_*`/`task.achievement_*` 仅保留读取窗口，canonical 为 `task.plan_*`/`task.resolution_*`。

| 事件 id | 语义 | 断言测试 | 判定 |
|---------|------|----------|------|
| conversation.message_sent / system_nudge | 用户消息 / 系统引导 | system_nudge：cards-from-decision-content.interaction.ts（kind/content 载荷）；message_sent 仅注册 + timelineLogger 存根名 | ✅（nudge）；⚠️ message_sent 载荷未断言 |
| conversation.assistant_start / assistant_done / interrupted / status_change | 模型轮/打断/状态 | taskBoundary（start 的 forceTool/progressMode + done 的 content）+ queue（interrupted source=button）；status_change 仍仅注册 | ✅（2026-11-25 补课；status_change ⚠️） |
| conversation.created | 会话创建 | taskBoundary.interaction.ts（created 载荷 session——两次新问题两个会话） | ✅（2026-11-25 补课） |
| conversation.error | 错误分类 | evals/product::network-exhausted（errorType=service 计数） | ✅ 行为（探针） |
| conversation.auto_continue | 已确认后瞬态失败的一次自动续跑（ADR-011） | timelineEvents.test.ts 注册键 + evals/product::network-auto-retry（`auto_continue ≥1`） | ✅（审计批次 3） |
| task.goal_proposed | 目标提议 | timelineEvents.test.ts::detectProposed（goalText 精确裁剪） | ✅ |
| task.goal_confirmed / _rejected | 目标确认/拒绝 | timelineEvents.test.ts::deriveStateEvents（point/reason 精确） | ✅ |
| task.plan_proposed | 方案提议 | detectProposed（plan 原文） | ✅ |
| task.plan_confirmed / _rejected | 方案确认/拒绝 | deriveStateEvents（point/reason 精确） | ✅ |
| task.resolution_proposed | 解决提议 | detectProposed（summary 原文） | ✅ |
| task.resolution_confirmed / _rejected | 解决确认/拒绝 | deriveStateEvents（point/reason 精确） | ✅ |
| task.files_produced | 产出文件 | deriveStateEvents（files 精确） | ✅ |
| task.execution_* / achievement_* | 历史别名（读取窗口） | 仅注册——无产线发点（canonical 为 plan_*/resolution_*） | ⚠️ 历史别名 |
| session.pending_set / _cleared | 状态机冻结/解冻 | deriveStateEvents（kind 精确——goal/plan/resolution） | ✅ |
| plan.approved | 批准清单（追加语义） | deriveStateEvents（files 追加精确） | ✅ |
| plan.rejected | 清单外被拒 | 仅注册——无产线发点（拦截事实由 tool.blocked 承载） | ⚠️ 死事件 |
| tool.requested / executed | 工具请求/执行事实 | timelineLogger.test.ts 往返/负断言；行为由 tools.test + L3 工具卡覆盖（载荷未断言） | ⚠️ 间接 |
| tool.executing | 执行开始（approvalSource） | timelineEvents.test.ts（注册/载荷）+ evals/product 委托审计（delegate/auto 计数） | ✅ |
| tool.failed | 工具失败 | evals/product::tool-failure-recovery（≥1） | ✅ 行为（探针） |
| tool.blocked | 拦截 gate | timelineEvents.test.ts（注册/载荷）+ evals/product（policy/gate 计数） | ✅ 行为 |
| gate.denied | 机制拒绝（拒绝记忆/策略 deny，非 ask） | gateDenied.interaction.ts（name/gate/attribute/risk 载荷）+ timelineEvents.test.ts（注册/缺必选） | ✅ |
| tool.approved / remembered | 授权批准/记住 | core.interaction.ts 授权 v4（approved name / remembered name+file 载荷） | ✅（2026-11-25 补课） |
| tool.rejected | 授权拒绝 | gateDenied.interaction.ts（name/args 载荷 + card.rejected card/action/name/reason） | ✅（2026-11-25 补课） |
| security.trust_delegation_denied | 委托越界被 main 二次校验拒绝 | timelineEvents.test.ts（注册/载荷/缺 reason）+ evals/product 委托审计（计数） | ✅ 行为 |
| capability.checked / ledger_updated | 能力检查/回填 | 仅注册（发点在 useChatStream/main tools） | ⚠️ 注册 |
| environment.injected | 环境快照 | taskBoundary（rootPath/caps 载荷——mock 环境下 runtime 缺省） | ✅（2026-11-25 补课） |
| execution.forced / released | forceTool 强制/释放 | timelineEvents.test.ts（注册/载荷 schema）；判定语义由 progressGuarantee.test.ts 覆盖 | ✅（间接语义） |
| execution.force_input | 三集合取证 | 仅注册（发点 useChatEngine） | ⚠️ 注册 |
| stuck.escalated | 停滞升级 | cards-from-decision-content.interaction.ts（escalate 打点） | ✅ 行为 |
| stuck.needs_human | 升级转人工 | 仅注册（发点 useChatStream） | ⚠️ 注册 |
| dialogue.loop_guard / forced_clarify | 对话健康介入 | forcedClarify T-FORCE-3（loop_guard rounds 数值 + forced_clarify underlying=goal 载荷） | ✅（2026-11-25 补课） |
| dialogue.needs_human | 三级介入 | 仅注册——无产线发点 | ⚠️ 死事件 |
| problem.created / closed | 问题台账创建/关闭 | taskBoundary（created 的 problemId/title）+ factory.self 交付关闭（closed 的 problemId）；rerun/snapshot_updated 载荷仍未断言 | ✅（created/closed 2026-11-25 补课；rerun/snapshot ⚠️） |
| usage.recorded / budget_threshold_reached | 用量入账/预算提醒 | 仅注册（main ipc 发点） | ⚠️ 注册 |
| usage.period_closed | 周期关闭 | 仅注册——无产线发点 | ⚠️ 死事件 |
| changeset.proposed / applied / reverted / conflict_detected | 变更集生命周期 | changeSetService.test.ts（proposed+applied 载荷 / reverted changeId+files / conflict changeId+file） | ✅（2026-11-25 补课） |
| changeset.reviewed | 变更审核 | 仅注册——无产线发点（审核 UI 未实现） | ⚠️ 死事件 |
| queue.entry_enqueued / started / blocked / resumed / paused / completed / cancelled / reordered | 队列八态 | taskQueueStore.test.ts::事件载荷语义（entryId/taskRef/position/reason/outcome 逐项对应） | ✅（2026-11-25 补课） |
| extension.registered / activated / deactivated / invocation_denied / capabilities_changed / unregistered | 扩展治理（ADR-017） | pluginSystem.test.ts::生命周期事件载荷（digest diff added/removed、拒绝原因、回收 kind） | ✅（2026-11-25 补课） |
| acceptance.criteria_derived / item_passed / item_failed / item_waived | 验收项 | acceptanceStore.test.ts::事件载荷语义（证据引用/失败原因/豁免理由） | ✅（2026-11-25 补课） |
| quality_gate.evaluated | 门禁评估 | acceptanceStore.test.ts（verdict/blocking/waived 载荷） | ✅（2026-11-25 补课） |
| card.shown | 卡弹出 | timelineLogger.test.ts / timelineEvents.test.ts（注册 + 去重键） | ✅ 结构 |
| card.resolved | 卡确认 | taskBoundary.interaction.ts（goal/execution）+ core.interaction.ts 授权 v4（approval 卡 card/action/name 载荷） | ✅（2026-11-25 补课） |
| card.rejected / dismissed | 卡拒绝/消失 | gateDenied（approval 卡）+ forcedClarify（system_clarify 卡）载荷断言；dismissed 无发点 | ✅（rejected 2026-11-25 补课；dismissed ⚠️ 死事件） |
| decision.requested / resolved | 领域决策点 | deriveStateEvents（kind/since/content/point/action/reason 精确） | ✅ |
| proposal.goal / plan / completion | 协议提议事件 | timelineEvents.test.ts schema/载荷校验（4 断言）；产线载荷在渲染层 tlog，未断言 | ⚠️ schema |
| proposal.clarify | 会话级澄清 | structuredClarify.interaction.ts（question/type/assumptions 载荷） | ✅（2026-11-25 补课） |
| protocol.text_fallback | 文本降级打点 | cards-from-decision-content.interaction.ts（marker 载荷） | ✅ 行为 |
| **completion.evidence_missing** | **完成声明被拒诊断（S4 登记 + 接线打点）** | **timelineEvents.test.ts（schema/载荷/缺必选 3 断言）+ L3 S4-1b/S4-3（missing 载荷）** | ✅（S4——A-010 关闭） |

> 表 3-表 8 中的用例/场景数是各阶段 DoD 的时点记录，不是当前总数；当前总数见页首快照。

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
| 目标确认后直接 write 被拦 → 占位执行确认卡渲染（防「pending=plan 但无卡」死锁；2026-11-23 真机 approve-files-write 301 s 停等回归） | cards-from-decision-content::S3-3c（2026-11-23 新增） | ✅ |
| 拒绝超限回退——rejectStreak ≥2 强制澄清卡（ADR-010 阈值覆盖旧「≥3 澄清提示」，.nf-reject-overflow 保留为更深层兜底） | cards-from-decision-content::S3-4（拒绝超限场景，:175；2026-11-24 注：:1225 的 ask_user 场景沿用旧编号，见表 8） | ✅ |
| 决策点持久化往返（decisionContent 序列化） | sessionStore.test.ts::decisionContent 序列化（3 用例） | ✅ |

## 表 5：S4 完成证据对账 ↔ 测试（2026-08-16 新增）

| S4 行为 | 场景/用例 | 判定 |
|---------|-----------|------|
| 已解决卡条件 = verifyCompletion 通过（不变量 4 接线——ok=false 不置决策点） | L3 S4-1b（验证空 → 不弹卡 → 重输出带证据 → 弹卡）+ L1 verifyCompletion（14 用例） | ✅ |
| V1a 系统代跑（真实只读命令 → 结果表 → verifyCompletion 闭环） | verificationRunner.integration.test.ts（24 用例） | ✅ |
| V1a 复核失败推翻自报（missing verification:cmd） | L3 S4-3 + integration 拒绝侧 | ✅ |
| V1b diff 派生（planned/produced 匹配——缺失 → diff:planned-not-produced） | integration deriveDiffs 2 用例 + verifyCompletionSystem V1b/new 3 用例（2026-11-24 起 verifyCompletion 真正消费 deriveDiffs） | ✅ |
| completion.evidence_missing 打点（ok:false + missing 清单） | timelineEvents.test.ts 3 断言 + L3 S4-1b/S4-3 打点断言 | ✅ |
| 证据不足回填引导（buildEvidenceBackfill 纯函数 + 注入闭环） | conversationState.test.ts 3 断言 + L3 S4-1b（重输出弹卡）；S4-1a 只覆盖参数校验拒绝（无回填） | ✅（引用修正 2026-11-24） |

## 表 6：S5 推进保障 ↔ 测试（2026-08-16 新增）

| S5 行为 | 场景/用例 | 判定 |
|---------|-----------|------|
| decideProgressGuarantee 唯一推进判定器（吸收 turnPolicy 状态空间——pending/未确认/lastToolFailed/累积完成度） | progressGuarantee.test.ts 12 用例（S5 新建）+ conversationState.test.ts 继承锁定迁移 5 用例 | ✅ |
| 推进 ≠ 逼调工具（require-advance——工具不可用不逼工具，允许输出推进） | progressGuarantee.test.ts（toolsAvailable=false → require-advance）| ✅ |
| 推进检测统一（proposed/providedEvidence——结构化提议/完成声明带证据 = 推进） | agentLoop.test.ts::evaluateTurnProgress S5 2 用例（【目标确认】/【执行方案】/【已达成】检测 + parseCompletionClaim 证据判定）| ✅ |
| 兜底探测调用点边界（2026-11-25 S4 复核裁定——文本探测只服务纯文本轮；协议工具轮不计确认后推进） | progressGuarantee.test.ts::S4 兜底探测调用点 2 用例（propose_goal 轮 → not-confirmed auto；propose_plan 轮 → require-action 逼执行）| ✅ |
| StuckDetector 对齐（提议/证据轮重置——模型走决策点流程不被打断；纯文本承诺仍 escalate——只说不做保留） | agentLoop.test.ts::detectStuck S5 3 用例 + L3 S5-1（连续提议不打断）/S5-2（纯文本 escalate 打点）| ✅ |
| renderer 切换（decideTurnPolicy → decideProgressGuarantee——已确认决策点提议过滤 + toolsAvailable 能力快照） | L3 全量 42（根因 3/T0-1 forceTool 强制回归 + S5-1/2）| ✅ |
| 对话健康度 T1/T2/T4（无进展对话检测——同决策点重复/文本拒绝循环/总回合上限） | conversationState.test.ts ADR-010 7 用例（notePendingSet/noteUserTextReply/detectUnproductiveDialogue + system_clarify 委派） | ✅ |
| 强制澄清卡（system_clarify 三选项 + loop guard 注入 + C2 隐式拒绝循环拦截） | L3 forcedClarify T-FORCE-1/2/3 + gatewayRetry 3 用例（A-024 放大器） | ✅ |
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

## 表 8：D3 PlannedFiles 下沉 main ↔ 测试（2026-08-16 新增）

| D3 行为（ADR-005） | 场景/用例 | 判定 |
|--------------------|-----------|------|
| PlannedFilesStore 持久化仓库（IPlannedFilesRepository——追加幂等/reset/损坏容错/approved 联动/路径注入） | plannedFilesStore.test.ts 12 用例（D3 新建） | ✅ |
| 批准事实跨重启（new 实例 load 恢复 files+approved——断点续做迁移） | plannedFilesStore.test.ts::持久化往返 + reset 后恢复空 | ✅ |
| main 门控跨重启一致（registerIpc → syncPlanApprovedFromStore——write 不再被规划引导拦） | tools.test.ts::D3 syncPlanApprovedFromStore 恢复 approved → needApproval 判定（L1 新增 1） | ✅ |
| IPC 契约三件套（planned-files:load/add/reset——preload 类型化/无悬挂引用） | L2 双 tsc 0 错 + L3 D3-1（load 挂载被调/add 批准链单次） | ✅ |
| 恢复接线（挂载 load → 本地镜像——StrictMode 双挂载 ≥1） | L3 D3-1（load 计数 + 主流程正常） | ✅ |
| 批准链走 IPC（approvePlan → planned-files:add——与 grantPlan 同清单 trustPath） | L3 D3-1（done 卡 + add 恰一次（方案确认走独立 sync-plan）+ 无授权卡） | ✅ |
| 任务边界重置（目标确认 → clearTrust → planned-files:reset 同步 main——批准事实不跨任务） | L3 D3-2（reset 计数 1 + 方案卡流程正常）+ 既有 clearTrust→filesApprovedReset 语义回归 | ✅ |
| 三基准统一（未修 1——planned/produced/projectFiles 绝对基准一致 + plannedComplete 判定单源） | conversationState.test.ts::plannedComplete 绝对路径既有断言（回归）+ plannedFilesStore.test.ts::相对路径原样保留（变换归调用方） | ✅ |
| **#8 拦截引导优化（sessionGate 拒绝回填下一步明确动作——对齐 sysPrompt ⑬⑭ 提议格式契约）** | **conversationState.test.ts::#8 目标未确认引导【目标确认】/方案未确认引导【执行方案】（L1 +2 断言——940773e）** | ✅ |

> **e2e 模拟器域**（`2603afa` DDD 重构——设计 `docs/design/e2e-simulator-domain-design.md`）：领域层纯函数 **L1 可测 44 用例**（e2eSim.test.ts——信号派生 15/收敛守卫 5/决策策略 14/旅程 5/验证 5）；收敛守卫（原 #9 `9604016` 域对象化——探索容忍/停滞判死）；真机复验依赖 NF_TEST_KEY（记录于 issue #9）。

## 表 9：V1.5 协议工具 ↔ 决策点 ↔ 断言三向（2026-09-05 S4 新增）

| 协议工具 | 决策点 | 入口断言（schema/契约） | 逻辑断言（判定） | 渲染断言（卡） |
|----------|--------|------------------------|------------------|----------------|
| `propose_goal` | pending:goal | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS 四工具 schema 存在性 | `protocolTools.test.ts` decideProtocolToolCall goal 分支（乱序矩阵——goal 未确认分支） | `cards-from-decision-content.interaction.ts` S3-3 goal 卡内容来自 decisionContent 快照 |
| `propose_plan` | pending:plan | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema | `protocolTools.test.ts` decideProtocolToolCall plan 分支（goal 未确认 → reject 引导/已确认 → pending；A-016 硬序门） | `cards-from-decision-content.interaction.ts` S3-1 plan 卡三要素渲染 |
| `report_completion` | pending:resolution（证据门） | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema | `protocolTools.test.ts` decideProtocolToolCall completion 分支（双未确认/plan 未确认 reject）+ `verifyCompletionSystem.test.ts` 证据门 | `cards-from-decision-content.interaction.ts` S4-1a/S4-3 已解决卡（证据不足不弹 + 系统复核推翻） |
| `ask_user` | 无（clarify 不置决策点） | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema + getDef('ask_user') | `protocolTools.test.ts` decideProtocolToolCall ask_user 分支（任何 state → clarify） | `cards-from-decision-content.interaction.ts` S3-4（:1225，与拒绝超限场景同编号——历史遗留）选项按钮化（点选发送/已回应禁用/文本备选） |
| `protocol.text_fallback` | 降级通道（打点不产卡） | `timeline.ts` 事件注册表（dev 校验——timelineEvents L1 既有机制） | `ConversationPanel.tsx` done 分支降级路径（fallbackDetected 守卫——标记命中不产卡） | L3 `cards-from-decision-content.interaction.ts` V1.5-S3-1 一轮改道（text_fallback 打点 + 引导后工具轮） |

> 断言锚点经 grep 实证（S4 Task 4.3 收口）：`protocolTools.test.ts` 63 处命中、L3 卡渲染场景 11 处命中、text_fallback 由 L3 timeline 捕获承载（无独立 L1 文件）。

## 表 10：Keenable 合规外网 ↔ 测试（2026-09-29）

| 行为 | 场景/用例 | 判定 |
|------|-----------|------|
| 禁静默 `/public`；无 Key 且试用关 → policy | webTools.test.ts | ✅ |
| Key → `/v1/search` + `X-API-Key`；试用 → `/public` + Title | webTools.test.ts | ✅ |
| probe：DDG→keyed search / health；从不打 public | webTools.test.ts | ✅ |
| UAT 显式试用或 `NF_UAT_KEENABLE_KEY`（T3/G-web） | uat-lib `ensureWebAccessEnabled` + `docs/tests/uat-tier-baseline.md` | ✅ harness |

## 表 11：BC-10～BC-14 目标态领域 ↔ 测试（2026-11-14 落地，2026-11-15 复核）

| 领域 / 硬化项 | 覆盖测试 | 判定 |
|---------------|----------|------|
| BC-10 变更与版本 | `changeSet.test.ts`（状态机/不变量 I17）、`changeSetService.test.ts`（快照/应用/回滚）、`applyDiff.test.ts`（diff 审核） | ✅ |
| BC-02 权限规则持久化 | `permissionRulesStore.test.ts`（校验/去重/原子写/边界/单条坏规则容错）、`permissionRules.test.ts`（selectRule 优先级、canonical 参数防 decoy、路径归一、bash 链守卫）、`tools.test.ts`（allow/deny/ask 执行路径、auto/user 来源）、interaction「设置：权限规则添加/删除（双击串行化）」 | ✅ |
| BC-11 任务编排 | `taskQueue.test.ts`、`taskQueueStore.test.ts`、`queue.interaction.ts`（连续排队 FIFO、停止回填输入框） | ✅ |
| BC-12 用量与成本 | `usageLedger.test.ts`、`usageStore.test.ts`、`budgetStore.test.ts`、`priceStore.test.ts`、`gatewayUsage.test.ts` | ✅ |
| BC-13 扩展与集成 | `extension.test.ts`、`extensionRegistry.test.ts`、`mcpClient.test.ts`、`mcpConfig.test.ts`、`mcpManager.test.ts`、`gitBridge.test.ts`、`pluginSystem.test.ts` | ✅ |
| BC-14 验收与质量门禁 | `acceptance.test.ts`、`acceptanceStore.test.ts`、`applyDiff.test.ts`（交付 diff 与门禁联动） | ✅ |
| P1-04 IPC 契约校验 | `ipcSchema.test.ts`（结构/必填/nullable）、`ipcContractParity.test.ts`（main ↔ preload 静态对齐） | ✅ |
| P1-02 轻量 Outbox | `timelineOutbox.test.ts`（FIFO 投递/失败保留重放/outboxId 幂等/损坏条目跳过/尾部半行/读取失败可见/目标文件固定）、`timelineLogger.test.ts`（投递失败留 Outbox/启动重放/重启 seq 续接/崩溃窗口幂等/跨午夜重放/索引读失败重试/旧 DLQ 兼容） | ✅ |
| P1-02 跨存储事务性 Outbox | `stateTransaction.test.ts`（WAL 提交/失败保留/FIFO 重放/确定性 outboxId/损坏 WAL/半行尾丢弃/latestWriteContent）、`acceptanceStore.test.ts`/`taskQueueStore.test.ts`/`changeSetService.test.ts`（commit 回调：状态+基线+事件同事务） | ✅ |
| 任务状态机跨重启（ADR-013 / GitHub #11） | `taskSnapshot.test.ts`（全字段往返/损坏/版本/嵌套决策内容深校验/合法边界态）、`sessionStore.test.ts`（V2 消息+任务原子记录/旧 V1 兼容/待授权工具卡保留）、`sessionRestore.interaction.ts`（快照恢复 pending 方案卡与决策内容、planConfirmed 主进程镜像、待授权工具卡恢复且启动不伪造决策事件） | ✅ |
| 审查回归（2026-11-15） | `agentLoop.test.ts::isApprovalIntent`（否定不批准）、`retry.interaction.ts`（第二轮失败重试上下文）、`queue.interaction.ts`（FIFO/停止回填） | ✅ |
| 结构化澄清与假设来源（ADR-014 / GitHub #13） | `protocolTools.test.ts`（`ask_user.assumptions` ≤6/逐条非空、提议假设 `{text,source}` 校验与归一化、string→`model_inference`）、`taskSnapshot.test.ts`（v1 兼容/空串跳过/旧字符串归一化/来源保留/非法来源拒绝）、`clarifyAnswer.test.ts`（JSON 往返/换行冒号注入/损坏拒绝）、`assumptionEvidence.test.ts`（无证据来源降级/证据命中保留）、`planProposalParser.test.ts`（文本降级假设 → `model_inference`）、`structuredClarify.interaction.ts`（核对卡选择/修正/JSON 回答/双击防护/草稿保留、options 与 assumptions 并存、待决策点不被误拒、来源制裁与降级、3 场景） | ✅ |
| 审查修复批（2026-11-16，`a9f8a84..HEAD`） | `stateTransaction.test.ts`（写失败回退 mtime、非 ASCII 尾部截断、短写循环）、`timelineLogger.test.ts`/`timelineOutbox.test.ts`（DLQ outboxId 重放不重复、同 id 入队幂等）、`changeSetService.test.ts`（基线仍在 WAL 时回滚不误判 conflict）、`taskSnapshot.test.ts`（决策内容深层校验/合法边界态）、`sessionStore.test.ts`（待授权工具卡持久化）、`sessionRestore.interaction.ts`（恢复待授权卡且无伪造决策事件） | ✅ |
| P1-05 会话/轮次编排拆分 | `conversationHistory.test.ts`、`useConversationState.test.ts` + interaction 全量 84 场景 | ✅ |
| Web Key 来源与明文副本 | `configStore.test.ts`（env/file/config 来源、opt-in 明文、删除清理） | ✅ |

> 表 11 为 2026-11-15 增补；逐文件用例数不在此重复，避免与页首快照漂移。

## 表 12：信任模式预设 ↔ 测试（ADR-015 / GitHub #12，2026-11-16）

| 功能 | 覆盖测试 | 判定 |
|------|----------|------|
| 三档 trustMode 持久化（0600/原子写/损坏回退 standard） | `trustPolicyStore.test.ts`（缺失/损坏/非法值回退、三档往返、0600、非法 save 抛出） | ✅ |
| 计划确认与批量批准分离 | `plannedFilesStore.test.ts`（`addPlan` 置 planConfirmed 不置 approved、跨实例恢复、reset 撤销、落盘失败时进程内缓存立即撤销） | ✅ |
| IPC 契约 `trust:get`/`trust:set` | `ipcSchema.test.ts`（三档枚举 + mode 必填）、`ipcContractParity.test.ts`（main↔preload 通道静态对齐） | ✅ |
| renderer 判定单源 | `authModel.test.ts`（trusted 恒自动、strict 全否、standard 清单内 write、delegated 清单内 write/edit、清单外/未确认/bash 拒绝、来源 auto/delegate） | ✅ |
| main 委托执行边界 | `tools.test.ts`（清单内 write/edit 放行、清单外/根外/bash/方案未确认拒绝、ask 只接受 user、ENOTDIR 回授权卡不悬挂） | ✅ |
| 审计事件 | `timelineEvents.test.ts`（`security.trust_delegation_denied` 注册/载荷；`tool.executing` 带 approvalSource） | ✅ |
| 旧 localStorage 开关迁移 | `useTrustPolicy.test.ts`（读取不写标记、'1'→delegated、'0'→standard、main 成功后才删键、已迁移幂等、存储抛错不阻塞） | ✅ |
| 设置页三档切换 + 委托仅计划内放行 | `trustModes.interaction.ts`（设置页切换持久化/旧键迁移删除、delegated 清单内 edit 自动且来源 delegate、strict 清单内 write 仍弹授权卡） | ✅ |
| 委托模式全量任务回归 | `evals/product`：`--trust-mode delegated` 跑全量任务集（任务级 `trustMode` 优先），21 个可运行任务 ×3 轮 63/63；`remember-edit` 因依赖人工授权卡标记 `needsApprovalCard`（委托下计划内 edit 自动放行、卡不出现——ADR-015 语义跳过，非缺陷）；默认 standard 22×3 66/66 无回归 | ✅ |
| 任务套信任模式（strict / delegated） | `evals/product`：`strict-first-write`（`trustMode: 'strict'`、授权卡 1 次后写入）、`delegated-edit`（`trustMode: 'delegated'`、时间线 `approvalSource=delegate`、write/edit 无授权卡；standard 负控必失败——`--trust-override standard --expect-fail --expect-fail-check delegate`，2026-11-24 编码进运行器） | ✅ |
| 证据不足对账回填（显式任务） | `evals/product`：`evidence-gap`（mock-only 失败注入：首次声明引用不存在证据 → `completion.evidence_missing` → 【系统对账】回填 → 已解决；检查时间线 evidence_missing ≥ 1） | ✅ |
| 根外写入不自动放行 | `authModel.test.ts`（根外路径标准/委托判定均拒绝——显式 trusted 仍放行）、`conversationState.test.ts`（derivePlannedFiles 传 rootPath 过滤根外条目）、`tools.test.ts`（委托词法根外即使 realpath 落回根内也拒绝）、`evals/product`：`root-out-write`（规划门控拦截 → 批次卡显式授权 → 执行） | ✅ |
| 「允许并记住」任务信任路径 | `evals/product`：`remember-edit`（首个 edit 点记住 → 同文件第二次修改 `approvalSource=auto`、need-approval 仅 1 次；mock 45/45 与真实模型均通过） | ✅ |
| 工具执行失败恢复（显式任务） | `evals/product`：`tool-failure-recovery`（mock-only：首个 edit 失败 → write 恢复；检查时间线 tool.failed ≥1 且产物精确） | ✅ |
| 对话中途断网自动续跑 | `evals/product`：`network-auto-retry`（mock-only：放行前 3 个 chat 请求后在对话中途断开 ×3 → 网关重试耗尽 → renderer「目标/方案已确认后瞬态失败自动续跑一次」恢复 → 已解决；检查注入 ≥3 + 重试 ≥2 + 人工点击 = 0 + 产物精确） | ✅ |
| 流中途断网（stream-reset 重置） | `evals/product`：`network-midstream`（mock-only：首个 chat 请求先写一条 content delta 再断开 → 网关 `stream-reset` → 400 ms 后重试 → 已解决；检查断开 ≥1 + `[ipc] SEND stream-reset` ≥1 + 重试 ≥1 + UI 无半截残留 + 产物精确） | ✅ |
| 网关网络彻底不可达（重试预算耗尽） | `evals/product`：`network-exhausted`（mock-only：前 3 个 chat 请求被断开 → 网关 3 击全部耗尽 → 时间线 `conversation.error` errorType=service → 错误气泡「重试」→ 重放上一回合恢复 → 已解决；检查注入 ≥3 + 重试日志 ≥2 + 重试点击 ≥1 + 产物精确） | ✅ |
| 网关网络瞬态失败重试 | `evals/product`：`network-retry`（mock-only：前 2 个 chat 请求被服务器断开（`fetch failed`）→ 网关 3 击重试（间隔 400/800 ms）→ 第 3 次恢复 → 已解决；检查注入 ≥2 + 网关「transient — retrying」日志 ≥2 + 产物精确） | ✅ |
| 已解决卡拒绝（「还要改」）返工闭环 | `evals/product`：`reject-resolution`（mock-only：首轮写入草稿 → 对账通过 → 已解决卡点「还要改」→ 探针代表用户发返工要求 → 返工写入 → 第二次完成声明对账通过 → 再次确认；检查 `resolutionRejects ≥ 1` 与产物精确） | ✅ |
| bash 途径产出对账 | `verifyCompletionSystem.test.ts`（existingFiles 命中不判 missing / 缺失仍判 missing）、`evals/product`：`bash-produced-file`（bash 创建计划内文件 → 存在性核对 → 已解决卡；真机曾因 diff 恒 missing 与卡渲染二次否决停等） | ✅ |

## 表 13：机制拒绝事件 gate.denied ↔ 测试（ADR-016 / GitHub #16，2026-11-17）

| 功能 | 覆盖测试 | 判定 |
|------|----------|------|
| canExecute 结构化拒绝来源 | `conversationState.test.ts`（拒绝记忆 → `deniedBy=rejection-memory` + attribute/risk；策略 deny → `action-gate`；pending/清单边界 → `session-gate`） | ✅ |
| gate.denied 事件注册 | `timelineEvents.test.ts`（domain gate、role system、name/gate/reason/attribute/risk、缺必选 warn） | ✅ |
| 发送点与边界 | `gateDenied.interaction.ts`（首次授权 ask 不记；拒绝后同命令重试 → 不弹卡不执行 + 一条 gate.denied 且属性 hazardous/risk high） | ✅ |

## 表 14：审查修复批 ↔ 回归断言（2026-11-17，PR #18 后）

| 修复项 | 覆盖测试 | 判定 |
|------|----------|------|
| `web_fetch` SSRF：IPv4-mapped IPv6 字面量、DNS 解析到私网、重定向逐跳校验 | `webTools.test.ts`（字面量拒绝 / DNS resolver 私网拒绝 / 重定向私网阻断且只发第一跳） | ✅ |
| `read` 自动放行与执行路径一致：相对路径解析 + 根内 symlink 指向根外不放行 | `tools.test.ts`（read 相对路径误带项目名 + symlink 逃逸） | ✅ |
| 交付 diff 写入边界：`rootPath` 必需、路径归一 + realpath 根内校验（apply/revert 同一目标） | `tools.test.ts`（`resolveDeliveryTarget` 边界/symlink/无根拒绝）、预加载签名与 DeliveryPanel 接线 | ✅ |
| MCP 子进程环境隔离：默认不继承宿主全量 env，仅安全基础变量 + 显式 `envFrom` 名称（不存值） | `mcpClient.test.ts`（`buildMcpEnv` 不传宿主凭据）、`mcpConfig.test.ts`（`envFrom` 名称校验/去重/非数组拒绝） | ✅ |
| 权限前缀边界：目录 specifier 不匹配同前缀兄弟路径；URL host 精确匹配防 lookalike 域 | `permissionRules.test.ts`（路径 `src` vs `src-evil`、`trusted.example` vs 子域/假域） | ✅ |
| 进程组终止防护：无效 pid 不调用 `kill(-pid)`（避免 `kill(-0)` 打当前进程组） | `tools.test.ts`（`killProcessGroupBestEffort` 无效 pid 不调用 kill） | ✅ |
| 只读命令分类 fail-closed：换行/命令替换、网络读命令与链/管道/重定向混合、sed `w`、`find -fprint0`、`sort --compress-program`、`git branch` 写形态 | `conversationState.test.ts`（4 组新增断言） | ✅ |
| 状态事务：损坏 WAL 不报 applied 成功；保留 WAL 重放不覆盖更新磁盘 | `stateTransaction.test.ts`（pending 可见性、mtime 守卫） | ✅ |
| 变更集回滚：`.nf-restore` symlink 不跟随；恢复写入与状态同一事务，commit 非 applied 返回错误 | `changeSetService.test.ts`（symlink 防护 + 事务提交 mock） | ✅ |
| 验收豁免不覆盖已有验收项（防竞态把真实验收洗成豁免） | `acceptanceStore.test.ts`（已有 items → `acceptEmpty` 不覆盖） | ✅ |
| 新任务边界：目标/方案确认位复位、主进程计划门 reset、确认卡重新出现 | `taskBoundary.interaction.ts`（新任务后末次 `setPlanConfirmed(false)` 且新方案卡重现） | ✅ |
| 会话 ID 跨重启保留且按 rootPath 隔离（queue/acceptance/changeset 可再定位） | `sessionStore.test.ts`（往返/隔离/越界值）、`taskBoundary.interaction.ts`（reload 后 timeline 使用同一会话 ID） | ✅ |
| `approvePlan` 接入授权结果回调，挂起队列条目恢复 | 共用 `onApprovalResolved`；既有 `core.interaction.ts`「卡悬挂→批准后恢复续聊」与 `queue.interaction.ts` FIFO 回归（未新增专用队列场景） | ✅ |

## 表 15：#14 多模型网关与扩展能力治理 ↔ 测试（ADR-017，2026-11-17）

| 功能 | 覆盖测试 | 判定 |
|------|----------|------|
| 显式模型优先 + 旧配置路径 | `providersCatalog.test.ts`（显式 modelId 优先、空值回退档位、旧 fallback） | ✅ |
| ModelProfile：DeepSeek 参数不变；generic 不发 thinking | `providersCatalog.test.ts`（profile 参数矩阵）、`gatewayModelSelection.test.ts`（请求 body 无 thinking/reasoning_effort） | ✅ |
| 网关显式模型选择 | `gatewayModelSelection.test.ts`（列表有 DeepSeek 时显式非 DeepSeek 仍优先；无列表手填路径） | ✅ |
| 模型列表/切换 IPC 与持久化 | `configStore.test.ts`（setModelSelection 不清 Key/可清空）、`modelSelection.interaction.ts`（设置页列表/选择/IPC 捕获） | ✅ |
| 能力指纹稳定性与变化 | `extension.test.ts`（id+risk 顺序无关；风险变化改指纹） | ✅ |
| 能力变化信任重审 + 事件 | `extensionRegistry.test.ts`（user-authorized → untrusted；同能力保留；capabilities_changed 载荷）、`timelineEvents.test.ts`（事件登记/载荷） | ✅ |
| MCP 移除回收 + 事件 | `mcpManager.test.ts`（移除服务器 → unregister + extension.unregistered） | ✅ |
| 设置页扩展能力明细 | `extensionCapabilities.interaction.ts`（能力名称 + risk 展示） | ✅ |

## 表 16：#15 问题台账 Local-first 同步 ↔ 测试（ADR-018，2026-11-17）

| 功能 | 覆盖测试 | 判定 |
|------|----------|------|
| 台账规范化（白名单/跳过损坏/重复 id/活动上限 20） | `problemLedger.test.ts`（非法项/重复 id/快照白名单/上限） | ✅ |
| 确定性合并（revision → updatedAt → deviceId；冲突摘要） | `problemLedger.test.ts`（三条优先级 + deviceId tiebreak 冲突） | ✅ |
| 删除 tombstone 传播且不复活 | `problemLedger.test.ts`（删除优先）、`problemLedgerStore.test.ts`（renderer 回写不复活） | ✅ |
| main 权威存储（0600/原子写/损坏回退/revision 递增） | `problemLedgerStore.test.ts`（权限位/损坏/内容变化 revision） | ✅ |
| 加密快照（env/file 口令来源；AES-GCM roundtrip；错口令/篡改/超限/未知版本拒绝） | `problemSyncCrypto.test.ts` | ✅ |
| 同步编排（无目录/口令 → 不写快照；两设备往返；坏远端不覆盖本地） | `problemLedgerStore.test.ts`（folder-missing/passphrase-missing/两设备/remote-invalid） | ✅ |
| 同步目录边界（项目根/仓库子目录/realpath） | `problemLedgerStore.test.ts`（package.json、祖先 `.git`） | ✅ |
| renderer 权威加载/保存/降级/tombstone 过滤 | `problemStore.test.ts`（main 优先、回写迁移、不可用回退、上限、tombstone） | ✅ |
| IPC schema（problems 上限 20；目录 null 关闭）与通道漂移 | `ipcSchema.test.ts`、`ipcContractParity.test.ts` | ✅ |
| 设置页同步区块（目录选择/立即同步/关闭/口令来源只读） | `problemSync.interaction.ts` | ✅ |

## L5 视觉基线纪律（K8）

- 2026-11-17 macOS 宿主全量 **37/37** 通过并更新基线（trust-ladder、settings、delivery、toolcalls 7 张）；WSL/Linux 不复现像素，不更新基线。
- 设置页模型区块（ADR-017）与问题台账同步区块（ADR-018）已随 PR #24 在 macOS 15.8.3（x86_64）重刷 `settings-open.png`，visual 37/37；非 Mac 不更新。


- 基线权威宿主 = **macOS**；仅在 Mac 上 `--update-snapshots` 后入库（见 `apps/desktop/playwright.config.ts`）。
- WSL/Linux 渲染 ≠ 基线宿主——禁止在非 Mac 上 update 后入库。
- 勿与 eslint / UAT 等重任务并行跑 L5（资源竞争假失败——p000114 / K8）。
- `.nf-start` 超时（K8-C）：2026-09-30 WSL solo `start.visual` + 若干 `.nf-start` waiter 绿，未能证伪为产品/mock bug；关单前仍须 Mac solo 全量 L5（日志 `/tmp/nf-l5-solo-start.txt`）。

## 缺口清单

- **无**（A-003 已关闭——proposal.* 事件登记录入 + schema 载荷断言 c91079e（产线 tlog 载荷仍未断言，见下行）；A-010 已关闭——S4 V1a integration 用例 + L3 4 场景；S3/S4/S5 行为全部有测试承载——S5 新增 progressGuarantee.test.ts 用例 + agentLoop 5 + L3 2 场景；D3 全行为有测试承载——plannedFilesStore + tools 1 + L3 D3-1/2；#8 引导有 L1 断言锁定；#9 e2e 脚本无单测基建——真机复验跟踪中）。2026-11-24 计数刷新：planProposalParser 16、completionClaimParser 10、verifyCompletionSystem 14、progressGuarantee 18、plannedFilesStore 15、sysPrompt 8、conversationState 135、timelineEvents 49、authModel 16、taskSnapshot 13（V1.5-S4 退役后 conversationState 减 2；timelineEvents 含注册表遍历 3）。
- **2026-11-24 审计新增缺口（如实记录，未关闭）**：
  - 事件注册表 93 事件中约 8 组有直接断名**语义**断言；其余仅注册/由派生函数产生，逐事件语义断言仍缺（表 2 判定为「登记/产出」语义，非逐名断言）。注册表结构契约已 2026-11-24 由遍历校验锁定（命名/domain/role/detailKeys 形态 + 必选载荷强制执行 + 未登记拒绝）。**2026-11-25 进展**：已补 deriveStateEvents 载荷（point/kind/reason/content）、detectProposed 载荷、queue 8、changeset 4、acceptance 5、extension 6、L3 card.resolved/conversation.created/proposal.clarify、授权 v4 的 tool.approved/tool.remembered/card.resolved(approval)、任务边界 problem.created/assistant_start/assistant_done/environment.injected、question 关闭 problem.closed、停止 interrupted、对话健康 loop_guard/forced_clarify、拒绝 tool.rejected/card.rejected 载荷；**仍缺**：`card.dismissed`（全代码库无发射点）、`changeset.reviewed`/`usage.period_closed`/`plan.rejected`/`dialogue.needs_human`（注册表有、无发射点——死事件待裁定登记或删除）、`problem.rerun`/`problem.snapshot_updated`（渲染层 tlog 未断言）、`usage.recorded`/`budget_threshold_reached`（main 入账路径无断言）、`capability.checked`/`capability.ledger_updated`、`execution.force_input`、`stuck.needs_human`、`conversation.status_change`、`conversation.message_sent`、`tool.requested`/`tool.executed`、`proposal.goal`/`plan`/`completion` 产线载荷、`task.execution_*`/`achievement_*` 历史别名（无发点）、`execution.forced`/`released` 的产线载荷（仅注册 schema）。
  - ~~文本标记兼容壳（pendingCardToShow/goalFallbackTrigger）驱动门控/停止/兜底卡~~ 2026-11-24 已退役（V1.5-S4 主体，批次 9）：两函数删除；卡触发收敛到 decisionContent 快照 + 协议工具信号；文本标记只打 `protocol.text_fallback` 并引导改用协议工具。保留的 `agentLoop` 提议/证据推进探测属 StallDetector 输入，不参与决策点判定。**2026-11-25 复核裁定**（ADR-009 r5）：保留探测只服务纯文本轮（StallDetector 调用点有 `toolCalls.length===0` 门），不改为消费 protocol 事件（改则方案确认后不逼执行）；删除条件 = S5 兜底率≈0——与 `completionClaimParser` 一并退役。
  - 未入矩阵的已测模块：compaction、preheat、codeRag/context、diffRender、lsp、serviceManager、projectInit、sandboxPath/sandboxSymlink、envManager、useConversationState、gateway 各模块等（文件清单见 `apps/desktop/tests/unit/`）。
  - ~~`delegated` 的 standard 负控为手工临时改任务运行，未编码为运行器选项/负控任务。~~ 2026-11-24 已关闭（#158）：`--trust-override` + `--expect-fail` + `--expect-fail-check` 编码进运行器，standard 负控 3/3 EXPECTED-FAIL。
  - L5 视觉基线只在 macOS 刷新；WSL 不更新基线；L5 无 CI 承载。
