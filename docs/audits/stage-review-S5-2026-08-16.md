# Stage Review S5（推进保障）——双轴复审

> 日期：2026-08-16；固定点：`7e0eb99`（S5 唯一 commit）——`git diff 155a270...HEAD`
> 轴：Standards（仓库标准 HANDOFF-ARCHIVE/pits.md 坑 93/97/79/99/12 + ADR-004 + Fowler smell 基线）× Spec（docs/design/stage-specs/S5.md DoD + TDD 网格）
> 方式：并行双 subagent（Standards 6ce2f0f8 / Spec ff013fc6）→ 状态化清单（fixed/recorded）——修复 commit 随本报告

## Standards 轴

### S1. [fixed] proposalConsumed 双源文本探测（硬违规——坑 97）

- **发现**：`ConversationPanel.tsx` send 内 proposalConsumed 三正则（/【目标确认/、/【执行方案/、/【已达成/）与领域层 `agentLoop.proposed` 正则（/【(目标确认|执行方案|已达成)/）是同一组结构化标记的两份探测——坑 97「判定类逻辑必须同源，渲染层与异步链各写一份必双源」明文禁止；且 proposalConsumed 无任何测试锁定（progressGuarantee.test.ts 只测领域函数）
- **修复**：下沉领域层单源——`conversationState.isStructuredProposal`（唯一探测——agentLoop.evaluateTurnProgress 与 renderer 共用）+ `isConsumedProposal`（已确认决策点的已消费提议判定）；renderer 删除三正则改调领域函数；L1 4 断言锁定（三种标记命中/各决策点消费/未确认不消费/纯文本恒非消费）
- **回归证据**：L1 407 + L3 42/42（根因 3/T0-1 forceTool 强制回归 + S5-1/2）全绿

### S2. [recorded] decideProgressGuarantee 判定顺序（判断项）

- **观察**：pending→not-confirmed→tool-failed→has-progress→累积完成度→toolsAvailable 顺序清晰；lastToolFailed 置本轮推进前符合坑 93 失败诊断优先；plannedComplete 复用既有导出——记录不修
- **备注**：resolutionConfirmed &&【已达成 时 providedEvidence 恒被 proposalConsumed 吞掉（收敛态）——isConsumedProposal 注释已说明（累积完成度分支已 auto，证据维度无意义）

### S3. [recorded] capReadyRef 能力快照（判断项）

- **观察**：caps 空→默认 true；仅明确 missing/failed 判不可用（未知不降级）——语义合理 + 判定读 ref（坑 93）——记录不修

## Spec 轴

### P1. [fixed] execution.forced/released 事件 mode/reason 无测试承载（硬缺口——TDD 网格末行）

- **发现**：spec TDD 网格要求「timelineEvents.test.ts（detail 含 mode/reason 断言）」，实际仅 schema（detailKeys ['reason','?mode']）+ renderer 打点落地——timelineEvents.test.ts 未修改；coverage-matrix 标 ✅ 属以非测试冒充测试
- **修复**：timelineEvents.test.ts 新增 3 断言（schema detailKeys / mode/reason 载荷通过校验（require-action 与 require-advance 两形态）/ 缺 reason warn）
- **回归证据**：L1 407 全绿

### P2. [recorded] proposalConsumed 为合理但未登记蔓延（Spec 轴——已补记）

- **发现**：proposalConsumed 过滤（已确认决策点的上轮提议不计「本轮推进」）spec/设计源无此条——自创
- **裁决**：**合理蔓延**——修复 L3 根因 3 回归（方案确认后模型重发被消费提议 → 无过滤判 auto → 新一轮不逼执行）；S5.md 已补「复审登记」节记录；且经 S1 下沉领域层单源——记录不修

### P3. [recorded] spec-first 顺序（回填风险观察）

- **观察**：S5.md 与实现同 commit 新建——红阶段测试先行（progressGuarantee/agentLoop 先红 8 后绿）已兑现 TDD 实质，但 spec 文档与实现同批入库——记录观察（后续阶段 spec 先行 commit 保持）

**核对通过**：唯一推进判定器状态空间与 DoD 逐条一致（pending/未确认/lastToolFailed/本轮推进/累积完成度/toolsAvailable）；require-advance 不逼调工具；S4 交互保留（引导重输出轮带证据【已达成】→ auto + detectStuck 重置）；边界遵守（main preApproval/actionGate/classifyReadonly 未动——S6；未注入 require-advance sysHint——S6/S7 观察；check-capability 仅消费能力快照）

## 汇总

- Standards：3 发现（1 fixed / 2 recorded）——最重 S1（坑 97 双源）
- Spec：3 发现（1 fixed / 2 recorded）——最重 P1（事件无测试承载）
- 本阶段无 open 项——S5 复审闭环完成
