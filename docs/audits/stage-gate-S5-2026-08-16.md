# Stage Gate S5 报告（推进保障）

- 日期: 2026-08-16
- spec: docs/design/stage-specs/S5.md（定稿——随 7e0eb99 入库，复审登记节补记 d0137a6）
- 基线: 阶段 commit 7e0eb99 + 复审修复 d0137a6——实际验证 HEAD d0137a6
- 结论: **全绿 ✅**（CI run 31941315869 success）

## 断言结果

| # | 断言 | 判定 | 证据（新鲜输出） |
|---|------|------|-----------------|
| 1 | L1 全量绿（新增 ≥14 条） | PASS | vitest: **407 passed / 0 failed**（33 文件——新增 21：progressGuarantee 12 + agentLoop 5 + timelineEvents 3 + isConsumedProposal 4（含迁移）） |
| 2 | L2 契约 0 错（turnPolicy.ts 移除无悬挂引用） | PASS | 双 tsc 0 errors（renderer + main——turnPolicy.ts/forceToolInput 已删） |
| 3 | L3 交互（相关场景重写 + 全量 ≥40） | PASS | playwright interaction: **42 passed**（40 旧 + 2 新 S5 场景——零回归；根因 3/T0-1 forceTool 强制回归绿） |
| 4 | Lint 门禁 | PASS | eslint: 0 errors（6 既有 warnings）；prettier: All matched files |
| 5 | decideProgressGuarantee 唯一判定器（吸收 turnPolicy 状态空间） | PASS | progressGuarantee.test.ts 12 用例（pending/未确认/lastToolFailed/累积完成度 plannedComplete∪resolutionConfirmed/require-action/require-advance）+ conversationState.test.ts 继承锁定迁移 5 用例——turnPolicy.ts 删除 |
| 6 | 推进检测统一（proposed/providedEvidence） | PASS | agentLoop.test.ts::evaluateTurnProgress S5 2 用例（【目标确认】/【执行方案】/【已达成】信号——isStructuredProposal 领域单源 + parseCompletionClaim 证据判定） |
| 7 | StuckDetector 对齐 | PASS | detectStuck S5 3 用例（proposed/providedEvidence 轮重置；纯文本承诺 2 轮仍 escalate）+ L3 S5-1（连续提议不打断）/S5-2（纯文本 escalate stuck.escalated 打点） |
| 8 | renderer 切换（ref 读 + mode→forceTool 映射 + toolsAvailable） | PASS | ConversationPanel send 判定改 decideProgressGuarantee（stateRef 直读——坑 93）+ isConsumedProposal 单源过滤（已确认决策点提议不计推进——根因 3 回归）+ capReadyRef 能力快照（无数据默认 true） |
| 9 | execution.forced/released 事件语义（mode/reason） | PASS | timeline.ts detailKeys ['reason','?mode'] + timelineEvents.test.ts 3 断言（schema/两形态载荷/缺 reason warn）+ 接线打点 {mode,reason} |
| 10 | 审计状态 | PASS | audit-items：A-001~010 全 fixed；无 open（本阶段无新增审计项——复审 2 fixed 3 recorded 全闭环） |
| 11 | 覆盖矩阵已更新 | PASS | docs/tests/coverage-matrix.md（表 6 S5↔测试 7 行 + 缺口清单） |
| 12 | 决策日志同步 | PASS | 无新语义裁定（require-advance API 表达 = forceTool false——沿用既有布尔契约，无需 ADR） |
| 13 | 已 push + CI 绿 | PASS | 已 push（7e0eb99 + d0137a6）；qa.yml run 31941315869 **success** |

## 差异清单（交回开发）

- 无 FAIL。复审闭环已并入本 gate：S5 阶段末双轴复审（docs/audits/stage-review-S5-2026-08-16.md）发现 5 项（Standards 1 fixed：坑 97 proposalConsumed 双源下沉领域层单源；Spec 1 fixed：execution 事件 mode/reason 断言；3 recorded）——全部在 gate 前闭环，无 open。

## 备注

- 红→绿实证：L1 先红 8（累积完成度判定缺失——写完计划仍被逼工具（坑 12 冒烟 11/12 相反面回归）/lastToolFailed 缺失/proposed/providedEvidence 字段不存在）→ 实现后全绿；L3 红阶段 2 处 oracle 修正：根因 3 回归（S5 的 proposed 维度误报——已确认决策点的上轮提议仍计推进 → auto → 不逼执行——isConsumedProposal 单源过滤修复）+ capReadyRef 默认语义（mock check-capability 空 caps 曾把 toolsAvailable 置 false → require-advance → forceTool false——未知不降级修复）
- S5 核心语义落地：**推进 ≠ 逼调工具**——require-advance（工具不可用）允许模型输出提议/证据/提问；StuckDetector 不再打断决策点流程（坑 99 教训扩展）但「只说不做」（纯文本承诺）保留 escalate（坑 79）
- turnPolicy.ts 移除 = 领域层瘦身（decideTurnPolicy/TurnPolicyInput 语义并入 decideProgressGuarantee——单判定器，消除双判定器分裂风险）
