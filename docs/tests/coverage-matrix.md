# 覆盖矩阵（Coverage Matrix）

> 生成：2026-08-16（S2 首版）→ **更新：D3 完成（2026-08-16）**
> 数据源版本：L1 769 用例（2026-10-05 实跑）· 事件注册表 59 事件（`timeline.ts` 实测——旧稿 48/44 均为过期快照） · 不变量 Inv 1-8 · S2/S3 DoD · L3 49 场景（interaction）
> 维护：阶段末更新（coverage-matrix skill）；缺口入 audit-items

## 表 0.7：轮次与驱动权不变量 ↔ 测试（2026-10-04 新增·**登记不桩红**）

> ADR-020 顺序：领域落位（本批已完成）→ **实现批**（C-纠偏批）→ 断言转正。下表状态全为**待实现**——按 ADR-012 精神与 §4.5 派生待办⑧，**无实现地基的断言先入账、不预先桩红**；实现批同批转正，届时逐行填"载体用例"。

| 不变量           | 拟用层级                     | 拟用判据（已定形，可执行前须补组件定名）                                                                                                                                                                                                                            | 状态                                                    |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| I-T1/I-T3/I-T13  | L1（`TurnAdmission` 纯函数） | 并发提交两 TurnInput → 至多一个 `admitted-now`，另一个必为 `queued`；turnId 严格 +1；**I-T1 主句判据（互审批补）**＝任一时刻持效租约发起 Round 的序列计数 ≤1（以 I-T2 写入计数为代理）；**I-T13 尾句判据**＝事件排序键与呈现序中 `turnId` 出现次数＝0（两序不互推） | **待实现**                                              |
| I-T2/I-T17       | L1（租约复核）               | `generation` 失效后对会话聚合的写入计数＝0；槽仍为 approval 时准入被拒（假推进反例）                                                                                                                                                                                | **待实现**（a14 同批转正）                              |
| I-T4/I-T5        | L1＋L3                       | 每轮恰一终态；`isPartnerBusy ≡ ∃ Running`——busy 呈现与派生量一致（a5 已有窄判据，不回退）                                                                                                                                                                           | **待实现**                                              |
| I-T6/I-T14       | L3                           | 连发 N 条不丢、顺序＝队列序；系统 nudge 不得插队顶掉用户条目（a3/a4，需先定"排队中徽标"选择器）；**三终局各有痕**＝成轮／撤回（`conversation.input_withdrawn`，互审批补事件）／有痕作废；**跨重启队列仍在且保序**（`00 §3.7.1` 补裁）                               | **待规格**（组件未定名）                                |
| I-T7             | L1                           | ①同一 `decisionInstanceSeq` 的 `turn_admitted(source=decision-followup)` 计数 ≤1；②单次交互产生的 `role=instruction` TurnInput ≤1；③同一 binding 重复准入必拒（β 案双发射器反例）——**①②是互审批补的判据，原行只测③**                                                | **待实现**                                              |
| I-T9             | L1                           | **三分场景各一条**：①确认卡族活卡存续 → 打字**不成轮**（排队，C2b）；②授权批复 → **同轮续跑**（不新增轮）；③待授权期新指令 → **先换焦释放槽再准入**（出口③）。**互审批更正**：旧判据"准入不被误挡"是 I-T9 被松绑时期的写法，与恢复后的准入门相反                    | **待实现**                                              |
| I-T10/I-T18      | L1＋L3                       | 换焦不写决定轴（记录仍可决、卡重弹）；批复迟到时效果归**当时轮**，原轮零写入                                                                                                                                                                                        | **待实现**（含 `approval_defocused` 事件注册）          |
| I-T11            | L1                           | **限 Round 级**（互审批收窄，与网关层解耦）：渲染层续跑同轮新增 Round ≤1，静默多次判违规；网关瞬态重试不产 Round、不占此预算，但须发 `conversation.auto_retry(layer='gateway-transport')`——C10-②(ii) 另立可见性判据，不与本条混计                                   | **待实现**                                              |
| I-T12            | L1                           | Turn 绑定 activeTask 不漂移（C12 反例：切任务后旧输入归属仍为原任务）                                                                                                                                                                                               | **待实现**                                              |
| I-T15            | L1                           | 非终态轮至多一活动决策点实例；`system_clarify` 透传不被误读成"同轮禁两卡"                                                                                                                                                                                           | **待实现**                                              |
| I-T16            | —                            | **V1 不断言**（「回合序列」未定义＝缺口 G5，须 G10/G5 设计后才有判据）                                                                                                                                                                                              | **射程外**                                              |
| I-T8（取证义务） | L1（注册表）＋L3             | 八新事件注册（六轮次＋`input_withdrawn`／`auto_retry`）＋`turnId` 入 assistant_start/tool._/decision._ 载荷                                                                                                                                                         | **待实现**（`06 §1.0` 声明未注册）                      |
| I-FOCUS-1        | L1（`deriveFocus` 纯函数）   | 任意态下 `front` 基数 ≤1；`back` 项仍可经 `requestId`／instanceId 答复成功（**降可决性即违规**）；澄清卡与底层卡只计一项（委派呈现）                                                                                                                                | **待实现**（不桩红）                                    |
| I-FOCUS-2        | L1                           | 确认卡族恒排在授权记录前；同族按入态序（授权＝入窗序、确认卡＝`decisionInstanceSeq`）；**不新增全局计数器**（grep 断言：无新 seq 字段）                                                                                                                             | **待实现**                                              |
| I-FOCUS-3        | L1＋静态                     | 焦点仅经 `deriveFocus` 可读：判定路径（准入／stale／可决闸）输入含焦点位 → 违规；存档 `state` 值读入即重算、不信存值                                                                                                                                                | **待实现**（"绕过投影入口"须配 lint，半可验——诚实标注） |
| I-FOCUS-4        | L1                           | 换焦前后决定面五值不变（`pending→queued` 不写 `approved/denied/expired`）；换焦必发 `approval_defocused` 且对话可见；**反模式判据**＝窗内 ≥2 条未决时文本批准**必不生效**（"恰一可决"＝基数 1，非恰一 front）                                                       | **待实现**（此判据是去物化唯一可能引入回归处）          |

## 表 1：不变量 ↔ L1 测试

| 不变量                              | 语义                                                                                                                                                                                                           | 覆盖测试（文件::用例）                                                                                                                                                                                                                                                                | 判定                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Inv 1                               | 决策唯一输入——无决策无推进（**含预先规则裁决**：命中＝decidedBy:'rule' 同门登记；确认卡 instanceId+kind、授权面 requestId 寻址——措辞源 00 §3.2 规则 2·ADR-015/ADR-017）                                        | conversationState.test.ts::Inv 1 决策唯一输入 ＋ ::ADR-015 决策点实例身份与身份门（a-i＋hydrate/isAnswerStale——stale no-op/等值重提议/passed 翻转/确定性/委派轮转/骨架/续号）（**授权面用例随 ADR-017 施工 B7 改按窗转换族八函数重写＋§7 七防线——措辞列先行，用例指向 B7 批次同步**） | ✅（现存用例锁定旧态至 B7） |
| Inv 2                               | 决策点确定性——deriveDecisionPoint 纯函数                                                                                                                                                                       | conversationState.test.ts::Inv 2 决策点确定性                                                                                                                                                                                                                                         | ✅                          |
| Inv 3                               | 门控顺序——sessionGate × actionGate 双维正交                                                                                                                                                                    | conversationState.test.ts::Inv 3 门控顺序                                                                                                                                                                                                                                             | ✅                          |
| Inv 4                               | 无证据不对账——verifyCompletion 单源；≥1 条可代跑通过对账（ADR-011）                                                                                                                                            | conversationState.test.ts::Inv 4 + verifyCompletionSystem.test.ts（V1a/V1b 扩展）                                                                                                                                                                                                     | ✅                          |
| Inv 5                               | 推进保障——decideProgressGuarantee                                                                                                                                                                              | conversationState.test.ts::Inv 5 推进保障                                                                                                                                                                                                                                             | ✅                          |
| Inv 6                               | 方案单一来源——derivePlannedFiles                                                                                                                                                                               | conversationState.test.ts::Inv 6 + planProposalParser.test.ts（解析→派生链）                                                                                                                                                                                                          | ✅                          |
| Inv 7                               | PENDING 单一——**改述：槽单值不变 ＋ 授权面单窗 N 可寻址**（窗 requests 集合、requestId 签发跨重启唯一→同 id 幂等；同 kind 跨实例延续仅限确认卡族；答复绑被应答对象＝instanceId 或 requestId——ADR-015/ADR-017） | conversationState.test.ts::Inv 7（+B7 新增：签发唯一性/撞号吞请求封堵、槽呈现互斥（确认卡占槽→窗 queued 不置槽）、drainQueued）                                                                                                                                                       | ✅（同上行注）              |
| Inv 8                               | 拒绝带原因——签名强制 + 运行时校验                                                                                                                                                                              | conversationState.test.ts::Inv 8                                                                                                                                                                                                                                                      | ✅                          |
| S2 新增：parsePlanProposal 失败降级 | 格式漂移 → no-block/malformed 不产生决策点                                                                                                                                                                     | planProposalParser.test.ts::无标记/有标记无文件行                                                                                                                                                                                                                                     | ✅                          |
| S2 新增：坑 102 过滤继承            | 垃圾条目不进清单                                                                                                                                                                                               | planProposalParser.test.ts::坑 102 过滤 + 路径形态判定                                                                                                                                                                                                                                | ✅                          |
| S2 新增：verifyCompletion V1a/V1b   | 系统复核 + diff 派生（非模型自述）                                                                                                                                                                             | verifyCompletionSystem.test.ts::V1a/V1b 用例                                                                                                                                                                                                                                          | ✅                          |

## 表 2：事件 ↔ 测试

| 事件 id                                             | 语义                                                                                    | 断言测试                                                                                                     | 判定                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| conversation.message_sent                           | 用户消息                                                                                | timelineEvents.test.ts                                                                                       | ✅                                     |
| conversation.assistant_start                        | 模型轮开始（forceTool）                                                                 | timelineEvents.test.ts                                                                                       | ✅                                     |
| conversation.assistant_done                         | 模型轮完成                                                                              | timelineEvents.test.ts                                                                                       | ✅                                     |
| conversation.interrupted                            | 打断                                                                                    | timelineEvents.test.ts                                                                                       | ✅                                     |
| task.goal_proposed                                  | 目标提议                                                                                | timelineEvents.test.ts::detectProposed                                                                       | ✅                                     |
| task.goal_confirmed / _rejected                     | 目标确认/拒绝                                                                           | timelineEvents.test.ts::deriveStateEvents                                                                    | ✅                                     |
| task.execution_proposed                             | 执行方案提议（历史）                                                                    | timelineEvents.test.ts                                                                                       | ✅                                     |
| task.execution_confirmed / _rejected                | 执行确认/拒绝（历史）                                                                   | timelineEvents.test.ts                                                                                       | ✅                                     |
| task.achievement_proposed                           | 达成提议（历史）                                                                        | timelineEvents.test.ts                                                                                       | ✅                                     |
| task.achievement_confirmed / _rejected              | 达成确认/拒绝（历史）                                                                   | timelineEvents.test.ts                                                                                       | ✅                                     |
| session.pending_set / _cleared                      | 状态机冻结/解冻（approval 值置/清者＝窗派生——ADR-017，B5 改接）                         | timelineEvents.test.ts                                                                                       | ✅（随行注）                           |
| plan.approved                                       | 批准清单（追加语义）                                                                    | timelineEvents.test.ts::计划清单追加                                                                         | ✅                                     |
| plan.rejected                                       | 清单外被拒                                                                              | timelineEvents.test.ts                                                                                       | ✅                                     |
| tool.requested / executing / executed / failed      | 工具生命周期                                                                            | timelineEvents.test.ts                                                                                       | ✅                                     |
| tool.blocked                                        | 拦截 gate                                                                               | timelineEvents.test.ts                                                                                       | ✅                                     |
| tool.approved / rejected / remembered               | 授权三态（载荷 +requestId/decidedBy/tier——ADR-017，B7/B8 随行）                         | timelineEvents.test.ts                                                                                       | ✅（随行注）                           |
| capability.checked / ledger_updated                 | 能力检查/回填                                                                           | timelineEvents.test.ts                                                                                       | ✅                                     |
| environment.injected                                | 环境快照                                                                                | timelineEvents.test.ts                                                                                       | ✅                                     |
| conversation.created                                | 会话创建                                                                                | timelineEvents.test.ts                                                                                       | ✅                                     |
| execution.forced / released                         | forceTool 强制/释放                                                                     | timelineEvents.test.ts                                                                                       | ✅                                     |
| execution.force_input                               | 三集合取证                                                                              | timelineEvents.test.ts                                                                                       | ✅                                     |
| stuck.escalated / needs_human                       | 停滞升级                                                                                | timelineEvents.test.ts                                                                                       | ✅                                     |
| problem.created / rerun / snapshot_updated / closed | 问题台账生命周期                                                                        | timelineEvents.test.ts                                                                                       | ✅                                     |
| card.shown / resolved / rejected / dismissed        | 卡 UI 生命周期                                                                          | timelineEvents.test.ts                                                                                       | ✅                                     |
| decision.requested / resolved                       | 领域决策点（按族二选一载荷——授权族 requestId+outcome+decidedBy；ADR-017 §6-1，B3 随行） | timelineEvents.test.ts::deriveStateEvents（decision.*）                                                      | ✅（随行注）                           |
| **proposal.plan / proposal.completion**             | **提议解析事件（S2 登记 + S3 接线）**                                                   | **timelineEvents.test.ts::proposal.\*（schema/成功/失败/缺必选 4 断言）**                                    | ✅（A-003 关闭 + A-007 两形态 schema） |
| **completion.evidence_missing**                     | **完成声明被拒诊断（S4 登记 + 接线打点）**                                              | **timelineEvents.test.ts::completion.evidence_missing（schema/载荷/缺必选 3 断言）+ L3 S4-1a/S4-3 打点断言** | ✅（S4——A-010 关闭）                   |
| conversation.status_change / error                  | 状态/错误                                                                               | timelineEvents.test.ts                                                                                       | ✅                                     |

## 表 3：DoD ↔ 门禁（S2 spec）

| DoD 断言（spec 原文）                          | 门禁方法（stage-gate 执行方式）                                                          | 判定                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| L1 全量绿（新增 ≥20 条）                       | `npx vitest run`（371——新增 27）                                                         | ✅ 可执行                                  |
| L2 契约 0 错                                   | 双 `npx tsc --noEmit`                                                                    | ✅ 可执行                                  |
| L3 交互 31/31                                  | `npx playwright test --project=interaction`                                              | ✅ 可执行                                  |
| Lint 门禁                                      | `npx eslint .` + `npm run format:check`                                                  | ✅ 可执行                                  |
| 行为验收：parsePlanProposal 契约               | planProposalParser.test.ts（9 用例）                                                     | ✅ 可执行                                  |
| 行为验收：parseCompletionClaim 契约            | completionClaimParser.test.ts（6 用例）                                                  | ✅ 可执行                                  |
| 行为验收：verifyCompletion V1a/V1b             | verifyCompletionSystem.test.ts（8 用例）                                                 | ✅ 可执行                                  |
| 行为验收：sysPrompt 互锁                       | sysPrompt.test.ts::契约互锁（3 用例）                                                    | ✅ 可执行                                  |
| 行为验收：proposal.* 事件登记                  | timeline.ts 注册表 + timelineEvents.test.ts（4 断言——A-007 `?` 可选标记）+ S3 emit 接线  | ✅（A-003 fixed——c91079e + A-007 a666459） |
| 行为验收：completion.evidence_missing 事件登记 | timeline.ts 注册表（domain 'completion'）+ timelineEvents.test.ts（3 断言）+ S4 接线打点 | ✅（S4）                                   |
| 审计状态：S1.1 遗留核对                        | audit-items 索引（本阶段项 fixed）                                                       | ✅ 可执行                                  |
| 覆盖矩阵首版已产出                             | 本文件                                                                                   | ✅                                         |
| 决策日志同步                                   | docs/decisions/ 有 ADR                                                                   | ✅ 可执行                                  |
| 已 push + CI 绿                                | qa.yml run                                                                               | ✅ 可执行                                  |

## 表 4：S3 renderer 接线 ↔ L3 场景（2026-08-16 新增）

| S3 行为                                                                                                             | 场景（interaction）                                                                                | 判定 |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| 方案卡渲染 PlanProposal 三要素（文件含原因/假设/验证计划）                                                          | cards-from-decision-content::S3-1                                                                  | ✅   |
| 拒绝方案带原因 → 卡隐藏 + 模型收到方向                                                                              | cards-from-decision-content::S3-2                                                                  | ✅   |
| 触发权切换——goal 卡内容来自 decisionContent 快照（含关键假设）                                                      | cards-from-decision-content::S3-3                                                                  | ✅   |
| 触发权切换——无 decisionContent 不弹卡（C3 降级）                                                                    | cards-from-decision-content::S3-3b（a666459 新增）                                                 | ✅   |
| 拒绝超限回退——rejectStreak ≥2 强制澄清卡（ADR-010 阈值覆盖旧「≥3 澄清提示」，.nf-reject-overflow 保留为更深层兜底） | cards-from-decision-content::S3-4（9f70c0b 后对齐）                                                | ✅   |
| 决策点持久化往返（decisionContent 序列化）                                                                          | sessionStore.test.ts::decisionContent 序列化（3 用例）（授权窗快照信封字段随 ADR-017 阶段 C 扩列） | ✅   |

## 表 5：S4 完成证据对账 ↔ 测试（2026-08-16 新增）

| S4 行为                                                                    | 场景/用例                                                                                   | 判定 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| 已解决卡条件 = verifyCompletion 通过（不变量 4 接线——ok=false 不置决策点） | L3 S4-1a（证据不足不弹卡）+ L1 verifyCompletion（8 用例）                                   | ✅   |
| V1a 系统代跑（真实只读命令 → 结果表 → verifyCompletion 闭环）              | verificationRunner.integration.test.ts（7 用例——A-010）+ L3 S4-2（复核通过弹卡）            | ✅   |
| V1a 复核失败推翻自报（missing verification:cmd）                           | L3 S4-3 + integration 拒绝侧                                                                | ✅   |
| V1b diff 派生（planned/produced 匹配——缺失 → diff:planned-not-produced）   | integration deriveDiffs 2 用例 + verifyCompletionSystem V1b 2 用例                          | ✅   |
| completion.evidence_missing 打点（ok:false + missing 清单）                | timelineEvents.test.ts 3 断言 + L3 S4-1a/S4-3 打点断言                                      | ✅   |
| 证据不足回填引导（buildEvidenceBackfill 纯函数 + 注入闭环）                | conversationState.test.ts 3 断言 + L3 S4-1a（引导 send 触发 chatCount）/S4-1b（重输出弹卡） | ✅   |

## 表 6：S5 推进保障 ↔ 测试（2026-08-16 新增）

| S5 行为                                                                                                      | 场景/用例                                                                                                                     | 判定 |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| decideProgressGuarantee 唯一推进判定器（吸收 turnPolicy 状态空间——pending/未确认/lastToolFailed/累积完成度） | progressGuarantee.test.ts 12 用例（S5 新建）+ conversationState.test.ts 继承锁定迁移 5 用例                                   | ✅   |
| 推进 ≠ 逼调工具（require-advance——工具不可用不逼工具，允许输出推进）                                         | progressGuarantee.test.ts（toolsAvailable=false → require-advance）                                                           | ✅   |
| 推进检测统一（proposed/providedEvidence——结构化提议/完成声明带证据 = 推进）                                  | agentLoop.test.ts::evaluateTurnProgress S5 2 用例（【目标确认】/【执行方案】/【已达成】检测 + parseCompletionClaim 证据判定） | ✅   |
| StuckDetector 对齐（提议/证据轮重置——模型走决策点流程不被打断；纯文本承诺仍 escalate——只说不做保留）         | agentLoop.test.ts::detectStuck S5 3 用例 + L3 S5-1（连续提议不打断）/S5-2（纯文本 escalate 打点）                             | ✅   |
| renderer 切换（decideTurnPolicy → decideProgressGuarantee——已确认决策点提议过滤 + toolsAvailable 能力快照）  | L3 全量 42（根因 3/T0-1 forceTool 强制回归 + S5-1/2）                                                                         | ✅   |
| 对话健康度 T1/T2/T4（无进展对话检测——同决策点重复/文本拒绝循环/总回合上限）                                  | conversationState.test.ts ADR-010 7 用例（notePendingSet/noteUserTextReply/detectUnproductiveDialogue + system_clarify 委派） | ✅   |
| 强制澄清卡（system_clarify 三选项 + loop guard 注入 + C2 隐式拒绝循环拦截）                                  | L3 forcedClarify T-FORCE-1/2/3 + gatewayRetry 3 用例（A-024 放大器）                                                          | ✅   |
| execution.forced/released 事件语义（mode/reason 可回放）                                                     | timeline.ts detailKeys ['reason','?mode'] + 接线处打点                                                                        | ✅   |
| turnPolicy.ts/forceToolInput 移除（无悬挂引用）                                                              | L2 双 tsc 0 错（turnPolicy.ts 已删）                                                                                          | ✅   |

## 表 7：S6 门控双维 ↔ 测试（2026-08-16 新增）

| S6 行为                                                                                      | 场景/用例                                                                                                       | 判定 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| isSideEffectAction 领域层同源（拍板 3：readonly/localhost 非副作用；外网/写类副作用）        | conversationState.test.ts 4 用例（S6 新增）+ 继承锁定迁移 1 用例                                                | ✅   |
| isLocalhostCommand 单源（actionGate 与 isSideEffectAction 共享）                             | conversationState.test.ts 1 用例                                                                                | ✅   |
| main preApproval 改引用 classifyReadonly（curl localhost 自动/外网 ask——拍板 3 main 侧同步） | tools.test.ts isReadOnlyBash 升级断言（localhost 自动/外网 fail-closed/-o 写副作用 hazardous——S6 暴露缺口修复） | ✅   |
| classifyAction 兼容壳移除（renderer 6 处 + main + agentLoop 全切换——无悬挂引用）             | L2 双 tsc 0 错 + L1 412（isSideEffectAction 直连）                                                              | ✅   |
| 拍板 3 全链（curl localhost 自动放行/外网 ask 授权卡）                                       | L3 S6-1（localhost done 无授权卡）/S6-2（外网 need-approval 弹卡——executeResults 模拟 main preApproval）        | ✅   |
| actionGate 策略接线（不变量 3 全量——ask 走授权卡闭环既有）                                   | L1 actionGate 既有用例 + L3 授权场景回归（write 需授权/清单内自动/合并授权）                                    | ✅   |

## 表 8：D3 PlannedFiles 下沉 main ↔ 测试（2026-08-16 新增）

| D3 行为（ADR-005）                                                                                      | 场景/用例                                                                                                                        | 判定 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PlannedFilesStore 持久化仓库（IPlannedFilesRepository——追加幂等/reset/损坏容错/approved 联动/路径注入） | plannedFilesStore.test.ts 12 用例（D3 新建）                                                                                     | ✅   |
| 批准事实跨重启（new 实例 load 恢复 files+approved——断点续做迁移）                                       | plannedFilesStore.test.ts::持久化往返 + reset 后恢复空                                                                           | ✅   |
| main 门控跨重启一致（registerIpc → syncPlanApprovedFromStore——write 不再被规划引导拦）                  | tools.test.ts::D3 syncPlanApprovedFromStore 恢复 approved → needApproval 判定（L1 新增 1）                                       | ✅   |
| IPC 契约三件套（planned-files:load/add/reset——preload 类型化/无悬挂引用）                               | L2 双 tsc 0 错 + L3 D3-1（load 挂载被调/add 批准链单次）                                                                         | ✅   |
| 恢复接线（挂载 load → 本地镜像——StrictMode 双挂载 ≥1）                                                  | L3 D3-1（load 计数 + 主流程正常）                                                                                                | ✅   |
| 批准链走 IPC（approvePlan → planned-files:add——与 grantPlan 同清单 trustPath）                          | L3 D3-1（done 卡 + add 恰一次 + 无授权卡）                                                                                       | ✅   |
| 任务边界重置（目标确认 → clearTrust → planned-files:reset 同步 main——批准事实不跨任务）                 | L3 D3-2（reset 计数 1 + 方案卡流程正常）+ 既有 clearTrust→filesApprovedReset 语义回归                                            | ✅   |
| 三基准统一（未修 1——planned/produced/projectFiles 绝对基准一致 + plannedComplete 判定单源）             | conversationState.test.ts::plannedComplete 绝对路径既有断言（回归）+ plannedFilesStore.test.ts::相对路径原样保留（变换归调用方） | ✅   |
| **#8 拦截引导优化（sessionGate 拒绝回填下一步明确动作——对齐 sysPrompt ⑬⑭ 提议格式契约）**               | **conversationState.test.ts::#8 目标未确认引导【目标确认】/方案未确认引导【执行方案】（L1 +2 断言——940773e）**                   | ✅   |

> **e2e 模拟器域**（`2603afa` DDD 重构——设计 `docs/design/e2e-simulator-domain-design.md`）：领域层纯函数 **L1 可测 44 用例**（e2eSim.test.ts——信号派生 15/收敛守卫 5/决策策略 14/旅程 5/验证 5）；收敛守卫（原 #9 `9604016` 域对象化——探索容忍/停滞判死）；真机复验依赖 NF_TEST_KEY（记录于 issue #9）。

## 表 9：V1.5 协议工具 ↔ 决策点 ↔ 断言三向（2026-09-05 S4 新增）

| 协议工具                 | 决策点                       | 入口断言（schema/契约）                                                | 逻辑断言（判定）                                                                                                                       | 渲染断言（卡）                                                                                          |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `propose_goal`           | pending:goal                 | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS 四工具 schema 存在性        | `protocolTools.test.ts` decideProtocolToolCall goal 分支（乱序矩阵——goal 未确认分支）                                                  | `cards-from-decision-content.interaction.ts` S3-3 goal 卡内容来自 decisionContent 快照                  |
| `propose_plan`           | pending:plan                 | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema                      | `protocolTools.test.ts` decideProtocolToolCall plan 分支（goal 未确认 → reject 引导/已确认 → pending；A-016 硬序门）                   | `cards-from-decision-content.interaction.ts` S3-1 plan 卡三要素渲染                                     |
| `report_completion`      | pending:resolution（证据门） | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema                      | `protocolTools.test.ts` decideProtocolToolCall completion 分支（双未确认/plan 未确认 reject）+ `verifyCompletionSystem.test.ts` 证据门 | `cards-from-decision-content.interaction.ts` S4-1a/S4-3 已解决卡（证据不足不弹 + 系统复核推翻）         |
| `ask_user`               | 无（clarify 不置决策点）     | `protocolTools.test.ts` PROTOCOL_TOOL_DEFS schema + getDef('ask_user') | `protocolTools.test.ts` decideProtocolToolCall ask_user 分支（任何 state → clarify）                                                   | `cards-from-decision-content.interaction.ts` S3-4 选项按钮化（点选发送/已回应禁用/文本备选）            |
| `protocol.text_fallback` | 降级通道（打点不产卡）       | `timeline.ts` 事件注册表（dev 校验——timelineEvents L1 既有机制）       | `ConversationPanel.tsx` done 分支降级路径（fallbackDetected 守卫——标记命中不产卡）                                                     | L3 `cards-from-decision-content.interaction.ts` V1.5-S3-1 一轮改道（text_fallback 打点 + 引导后工具轮） |

> 断言锚点经 grep 实证（S4 Task 4.3 收口）：`protocolTools.test.ts` 63 处命中、L3 卡渲染场景 11 处命中、text_fallback 由 L3 timeline 捕获承载（无独立 L1 文件）。

## 表 10：Keenable 合规外网 ↔ 测试（2026-09-29）

| 行为                                                       | 场景/用例                                                            | 判定       |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| 禁静默 `/public`；无 Key 且试用关 → policy                 | webTools.test.ts                                                     | ✅         |
| Key → `/v1/search` + `X-API-Key`；试用 → `/public` + Title | webTools.test.ts                                                     | ✅         |
| probe：DDG→keyed search / health；从不打 public            | webTools.test.ts                                                     | ✅         |
| UAT 显式试用或 `NF_UAT_KEENABLE_KEY`（T3/G-web）           | uat-lib `ensureWebAccessEnabled` + `docs/tests/uat-tier-baseline.md` | ✅ harness |

## L5 视觉基线纪律（K8）

- 基线权威宿主 = **macOS**；仅在 Mac 上 `--update-snapshots` 后入库（见 `apps/desktop/playwright.config.ts`）。
- WSL/Linux 渲染 ≠ 基线宿主——禁止在非 Mac 上 update 后入库。
- 勿与 eslint / UAT 等重任务并行跑 L5（资源竞争假失败——p000114 / K8）。
- `.nf-start` 超时（K8-C）：2026-09-30 WSL solo `start.visual` + 若干 `.nf-start` waiter 绿，未能证伪为产品/mock bug；关单前仍须 Mac solo 全量 L5（日志 `/tmp/nf-l5-solo-start.txt`）。

## 缺口清单

- **无**（A-003 已关闭——proposal.* 事件断言 c91079e 补齐；A-010 已关闭——S4 V1a integration 7 用例 + L3 4 场景；S3/S4/S5 行为全部有测试承载——S5 新增 progressGuarantee.test.ts 12 用例 + agentLoop 5 + L3 2 场景；D3 全行为有测试承载——plannedFilesStore 12 + tools 1 + L3 D3-1/2；#8 引导有 L1 断言锁定；#9 e2e 脚本无单测基建——真机复验跟踪中）

## 表 N：新树 V1.0.0 追溯矩阵（段2 起，ADR-026 流水线）

> 载体约定（pipeline-0to1 追溯矩阵约定）：产品轴裁定→L0 条目→上下文/子域→stage-spec DoD→测试用例；后两列由段4/段7 回填，每段出口审计查上游引用无悬空。新树工件＝`docs/neonforgeV1.0.0/`（00=段0、01=L0 母本、02=段2 领域战略 v1.1、03=段3 领域战术 v1.1）。
>
> **段4 列口径（2026-10-05 回填）**：格式＝`V1-S{n}`（实现阶段号）＋承担该轴的 DoD 条目号＋spec 路径。计划载体＝`docs/design/v1.0.0-stage-plan.md`（阶段表 §3、不变量映射 §4、事件映射 §5）；采点映射与常量唯一源＝`docs/design/v1.0.0-metric-event-mapping.md`。**spec 铺设裁定（用户 2026-10-05）＝计划写全阶段＋spec 只详写 S1**：故本列中仅 `stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md` 已存在，S2–S7 的 spec 于各阶段开工前按 stage-spec 技能出（落 `stage-specs/V1-S{n}-{slug}.md`），其 DoD 条目号届时回填本列并把「测试（段7）」列由 ⏳ 换为用例文件——**未出的 spec 不预绿、未跑的测试不预绿**（登记不桩红纪律）。

| 轴（裁定） | L0 条目 | 上下文/子域（段2） | stage-spec DoD（段4） | 测试（段7） |
|---|---|---|---|---|
| 1 Job（信任·先窄后宽） | 01 §1/§6 | 核心域四子域全体（委托生命周期为首） | **V1-S1**（最小可信闭环：DoD C1–C13／F1；`stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md`）＋**V1-S4**（产物谓词 DoD＝收尾必有变更集类证据，ADR-027／段3 v1.1 I-16；计划 §3 S4 行） | ⏳ |
| 2 用户（个人开发者+dogfooding） | 01 §2 | 呈现投影（单一 persona 呈现） | **V1-S1** F1／F2（单用户单视图、未持久化态显式呈现）＋**V1-S6**（呈现完整化；计划 §3 S6 行，spec 待出） | ⏳ |
| 3 北极星（二次委托率） | 01 §4 | 度量采点（timeline 事件流消费） | **V1-S7**（计算与口径＝映射表件 §2.1，分母＝已收尾件、已放弃件不进分母）；采点面自 **V1-S1** 就绪（DelegationAccepted／Rejected／Reopened 发射，DoD B1–B3） | ⏳ |
| 4 定位（委托工作台） | 01 §1 | 贯通核心四子域（差异化承载） | 贯通：**V1-S1**（骨架闭环）＋**V1-S2**（授权拍板深化）＋**V1-S4**（证据核验深化）＋**V1-S5**（推进驱动深化）——各阶段 DoD 全体即差异化的可验收面（计划 §3） | ⏳ |
| 5 交互模型（委托单中心） | 01 §8 | 委托生命周期＋推进驱动（partnership） | **V1-S1** F1（委托单列表／时间线视图＝中心面；对话降为委托内通道）＋**V1-S6**（对话通道按 delegationId 过滤 timeline） | ⏳ |
| 6 能力边界（单件+排队/无自动记忆） | 01 §6 | 推进驱动（在飞唯一/队列归宿）＋委托生命周期（归档只读） | **V1-S1** C1（6a 在飞 ≤1）／C3（队列至多准入一次＋排队可见）／C7（I-9 无归宿等待＝0）＋**V1-S3**（归档只读可溯回归）；6b 无自动记忆＝各阶段 spec 边界节的显式排除项 | ⏳ |
| 7 信任安全（作用域+授权闸） | 01 §7 | 授权拍板（作用域/决策点/高影响清单） | **V1-S1** C6（I-7 无拍板不执行，副作用计数＝0）／C2（决策点归属）／D1–D3（S-1／S-2／S-4 静态与落账前闸）／A5（G-1）＋**V1-S2**（作用域版本链 I-8／I-17＋高影响清单 S-3 CI diff） | ⏳ |
| 8 形态（桌面 Electron） | 01 §9 | 推进驱动（崩溃恢复 X6/X7） | **V1-S3**（I-12 恢复只还原账本＋SessionInterrupted／DelegationRestored）＋**V1-S1** E1／E2（桌面壳内真网关与流级取消令牌、`npm run e2e` 真跑） | ⏳ |
| 9 质量属性（P1-P4） | 01 §3 | P1→推进驱动+证据核验；P2→证据核验；P3→推进驱动；P4→呈现投影+推进驱动 | P1＝**V1-S1** C9（否定事实必有痕）／B3（追加失败整事务回滚）＋**V1-S3**；P2＝**V1-S1** C4／C13＋**V1-S4**；P3＝**V1-S3**（I-12）；P4＝**V1-S1** F1／F2＋**V1-S5**（卡滞可见）＋**V1-S6**（等待项与焦点完整呈现） | ⏳ |
| 10 度量（三层指标·仅本地） | 01 §4 | 度量采点 | **V1-S7**（三层指标逐条按映射表件 §2 采点行实现；常量＝映射表件 §3：卡滞窗 120s、7 天窗维持 L0 原值；仅本地不外发）；采点事件面自 **V1-S1** 起分阶段就绪（计划 §5） | ⏳ |
| 11 版本射程 | 01 §9 | —（射程外清单不建上下文） | — | — |
| 12 商业分发（射程外） | 01 §9 | — | — | — |
| 13 约束（C1-C7） | 01 §10 | C2→模型供给；C3→全域纪律热点（凭据不落证据/日志/产出）＋授权拍板（修改凭据配置须拍板）；C4→全域（脱敏闸） | C1／C7＝**V1-S1** A 组（工程实体不变、归档批与段6 闸）；C2＝**V1-S1** E2／E3＋D2（核心域零 provider 专名）；C3＝**V1-S1** D3（落账前判据）＋**V1-S4**（三类型载荷全覆盖）；C4＝每阶段出口 `python3 tools/desens-scan.py`（**V1-S1** A6.3 起）；C5／C6 假设重估触发器＝**V1-S7** | ⏳ |
