# 产品文档审计报告：NeonForge（第 13 轮——2026-08-16 · 领域文档全量精读 + 既有审计 spot-check）

- 审计对象：`docs/domain/` 全量（00-09，10 份）+ `docs/product/` 领域相关（00/01/02/04/07）+ 对照源（设计文档 `intent-confirmation-domain-design.md` 全文 438 行 + 竞品调研报告）+ spot-check 第 11/12 轮
- 审计日期：2026-08-16（**第 13 轮**——语义级领域审计——第 12 轮为值对象符号级核对，本轮逐份精读 + 交叉 + 抽验既有结论）
- 审计方式：三层审计（全景 → 逐类语义级 → 交叉验证）+ 既有审计结论 spot-check（抽验 6/6 项）+ 就绪度评分
- 结论：**就绪度 73/100，可交付 Yes**（0 Critical / 5 Major——4 项为 2026-08-16 重设计同步遗漏 + 1 项为第 12 轮验收漏网——S1 前置 2 项）→ **2026-08-16 全修后 90/100**（#1-#14 已修——见五）

---

## 一、文档全景核查（层①）

| 文档 | 阶段 | 必需性 | 现状 | 判定 |
|------|------|--------|------|------|
| `docs/domain/00-domain-authority.md`（A0 v4.0——实现权威）| ③ 设计 | 必需 | 有 | ✅（问题见四 #1/#8）|
| `docs/domain/01-reference-analysis.md` | ① 发现 | 可选 | 有（历史标注完备）| ✅ |
| `docs/domain/02-domain-model.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #6/#9）|
| `docs/domain/03-strategic-design.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #10）|
| `docs/domain/04-tactical-design.md` | ③ 设计 | 必需（值对象权威）| 有 | ✅（问题见四 #2/#7/#8）|
| `docs/domain/05-architecture.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #3/#11）|
| `docs/domain/06-domain-events.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #7/#8）|
| `docs/domain/07-api-gateway.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #4/#12）|
| `docs/domain/08-domain-design-audit.md` | 全程 | 必需 | 有（历史——演进标注完备）| ✅ |
| `docs/domain/09-traceability.md` | ③ 设计 | 必需 | 有 | ✅（问题见四 #13）|
| `docs/product/00-product-design.md`（D0 v2.2）| ② 定义 | 必需 | 有 | ✅（确认卡/方案卡/解决卡已同步）|
| `docs/product/01-user-flows.md`（v2.2）| ② 定义 | 必需 | 有 | ✅（Flow 5 已同步）|
| `docs/product/02-components.md` | ② 定义 | 必需 | 有 | ✅（意图确认组件章节已补）|
| `docs/product/07-success-metrics.md`（v1.1）| ② 定义 | 必需 | 有 | ✅（确认交互指标组已同步）|
| `docs/product/04-alignment.md`（索引）| 全程 | 必需 | 有但**不完整** | ⚠️（问题见四 #5）|
| `README.md`（文档表）| 全程 | 必需 | 有但**版本陈旧** | ⚠️（并入 #5）|
| `.scratch/neonforge-v1/intent-confirmation-domain-design.md` | ③ 设计 | 必需（重构期权威）| 有 | ✅（签名/枚举权威源）|
| `analysis/competitor-crawler/reports/neonforge-intent-confirmation-research.md` | ① 发现 | 可选 | 有 | ✅ |
| tickets/spec 拆解 | ④ 交付 | 必需 | S0-S7 阶段计划（设计文档 §6——重构期 tickets 即 S 计划）| ✅（非独立文档，可接受）|

**判定**：无缺失必需文档；索引完整性 2 处不足（04-alignment 清单缺 A0/08/09/07；README 版本标注陈旧）。

## 二、逐类独立审计（层②——领域文档语义级）

| 文档 | 类型检查点 | 核心审查维度（判据）| 速评 |
|------|-----------|---------------------|------|
| A0 00 | 一致性边界/权威单一 | 一致性 · 可实现性 | 权威自洽；**RejectReason 枚举缺 modify（#1）**、ApprovalRequest 内嵌签名缺 toolName（#8）|
| 02 | 一致性边界/可追溯 | 一致性 · 完整性 | 确认点/服务/事件同步良好；**AchievementProposed 未标历史（#6）**、术语表缺 9 新术语（#9）|
| 03 | 一致性边界 | 一致性 · 完整性 | BC 文字/衡量指标已同步；**全景图与映射缺 Delivery BC（#10）**|
| 04 | 一致性边界/无占位 | 可实现性 · 一致性 | §2.3b 值对象组落地 ✅；**状态机图杂散态 unresolved（#2）**、§6 类型缺 PendingKind（#7）、deriveDecisionPoint 签名多 userRequested（#8）|
| 05 | 产品对齐/无占位 | 可实现性 · 一致性 | §2 管线已新；**§3 推进保障管线图为旧语义（#3）**、模块目录缺 problemStore（#11）|
| 06 | 一致性边界 | 一致性 | 追加段 7 事件 ✅；**goal_proposed 未标替代（#6）**、card.* 措辞未同步设计 C 修正（#8）、时序图 forceTool 列旧名（#8）|
| 07 | 无占位/产品对齐 | 可实现性 | §1.1 推进保障传递已新 ✅；**§6 ModelRouter stageAgent 残留（#4）**、§3.1 标准前缀工具清单旧（#12）|
| 08/01 | 历史文档 | 证据性 | 演进/历史标注完备——不构成缺陷（信息）|
| 09 | 可追溯 | 一致性 | 矩阵/增量落点 ✅；**表头残留 v3.0（#13）**|
| D0/01/02/07（product）| 结构完整/范围明确 | 产品对齐 · 可行动 | 方案卡/解决卡/证据对账/RejectReason/指标组全部同步 ✅——产品层无实质问题|

## 三、交叉验证矩阵（层③）

| 对齐关系 | 文档 A 说法 | 文档 B 说法 | 判定 |
|---------|-----------|-----------|------|
| 设计 §3.2 ↔ 04 §2.3b（RejectReason）| kind 6 值含 modify | 同（6 值含 modify）| ✅ 一致 |
| **设计 §3.2 ↔ A0 §5（RejectReason）** | kind 6 值含 modify | **5 值缺 modify** | ❌ **冲突（#1）** |
| 设计 §3.3 ↔ 04 §3.6（deriveDecisionPoint）| (state, proposals, pendingActions) | + userRequested 参数 | ⚠️ 04 更完整——设计签名未回写（#8）|
| A0 §4 ↔ 05 §3（推进保障）| 强制推进≠调工具；pending 恒不强制 | **旧语义：required 强制动手；无 pending 分支；goal/execution 旧名** | ❌ **冲突（#3）**|
| A0 §1/02 ↔ 07 §6（ModelRouter）| 无阶段 Task 无 stageAgent | route 依赖 task.stageAgent（analyst/architect）| ❌ **冲突（#4）**|
| 04 §1.1 ↔ 04 §6 ↔ 设计 §3.1 ↔ 02 §4.1（状态机）| 图含 6 态（unresolved）| §6 类型 5 态 / 三布尔 / 三确认点——无 unresolved | ❌ **冲突（#2）**|
| 设计 §3.5 ↔ 06 追加段（card.* 关系）| 「并入」澄清为「语义对齐」非合并 | 仍写「语义并入」| ⚠️ 措辞未同步（#8）|
| 02 §6 ↔ 04 §4（事件历史标注）| AchievementProposed 无历史标注 | 已标「历史——由 proposal.completion 替代」| ⚠️ 不一致（#6）|
| 04-alignment/README ↔ 实际文件（索引）| 清单 7 份 domain + 6 份 product | 实际 10 份 domain（含 A0 权威）+ 8 份 product + v2.2/v4.0 | ❌ **索引缺权威文档/版本陈旧（#5）**|
| D8 07 ↔ D0（指标↔目标）| 确认交互指标组（滞留率/修改率/核验率/解决率）| 解决确认闭环（证据对账——D0 §4.1）| ✅ 一致（方案修改率依赖 kind=modify——受 #1 牵连）|
| D0 ↔ A0（产品门禁）| 方案卡/解决卡/触发权在系统 | §3.1/§3.6/§4.2 同语义 | ✅ 一致 |
| 09 追溯 ↔ A0 v4.0 | 矩阵行已更名（Plan/Resolution）| 表头残留「A0 v3.0」| ⚠️ 标注不一致（#13）|

**spot-check 既有审计结论（抽验 6/6——领域内部 4 + 产品↔领域 2）**：

| 既有断言 | 抽验结果 | 采信级别 |
|---------|---------|---------|
| 第 12 轮「04 §2.3b 补 6 值对象」| 6 个值对象存在、字段与设计 §3.2 逐字段一致 | 采信（L2 语义级）|
| 第 12 轮「A0 §3.5b ActionAttribute 定义」| kind/basis 枚举与设计 §3.2 一致 | 采信（L2 语义级）|
| **第 12 轮「值对象三处一致性达成」** | **RejectReason.kind 枚举 A0 §5 缺 modify（5 vs 6）——三处不一致** | **需复核（L3 失败——第 12 轮只查「存在」未查「枚举逐值」）** |
| 第 12 轮「就绪度 92/100」| 本轮语义级精读发现 5 Major（上轮符号级口径漏检）| 需复核（评分口径覆盖不足）|
| 第 11 轮「服务表补齐设计 §3.3 全部服务」| 11 服务在 02 §5/04 §3.6 全部落地（decideProgressGuarantee 以 ProgressGuarantee 容器呈现；§3.4 转换函数不属服务表——合理）| 采信（L2 语义级）|
| 第 11 轮「事件表补 7 事件」| 02 §6/04 §4/06 追加段三处 7 事件齐全一致 | 采信（L2 语义级）|

## 四、问题

1. **[Major] A0 §5 RejectReason.kind 枚举缺 `modify`**（权威层与战术层口径打架）
   - 现象：A0 §5（L221）`{ kind: direction|scope|complexity|missing-info|other, text?, target? }`——5 值；04 §2.3b 与设计 §3.2 为 6 值（含 `modify`）
   - 证据：A0 L221 vs 04 §2.3b L198 vs 设计 §3.2 L122-128
   - 影响：S1 按 A0 §5 实现 RejectReason 将丢失「修改方案」决策表达（modify=拒绝+修正内容→模型重提议）；07 方案修改率指标（kind=modify 埋点）无法落地；**第 12 轮「三处一致性」验收断言不成立**
2. **[Major] 04 §1.1 Task 状态机图含未定义状态 `unresolved`**
   - 现象：状态机图（L37-39）出现 `unresolved ← resolved-pending`，且图语义混乱（「持续澄清 ← unresolved」暗示解决被拒后回澄清）；§6 类型汇总（L475-476）为 5 态（clarifying/goal-confirmed/executing/resolved-pending/resolved）；设计 §3.1 三布尔；02 §4.1 三确认点——均无 unresolved
   - 影响：S1 状态机实现依据分歧（6 态 vs 5 态）；「还要改」语义无权威落点（应回 executing 调整——推进保障保持不收敛）
3. **[Major] 05 §3 推进保障管线图为旧语义**
   - 现象：`确认状态(goal/execution)` 旧名 + 「执行未确认 → auto」+「确认+无产出 → required（强制动手）」——2026-08-16 重设计后应为 goal/plan + require-advance（强制推进≠调工具）+ pending 恒不强制分支
   - 证据：05 L61-70 vs A0 §4 / 04 §3.1 / 07 §1.1（均已新语义）
   - 影响：S5 实现者按 05 §3 会重建旧 forceTool——与 A0 §4 直接冲突（同文档内 §2 已新、§3 未同步——内部自相矛盾）
4. **[Major] 07 §6 ModelRouter 残留六阶段概念 `stageAgent`（analyst/architect）**
   - 现象：route() 依赖 `task.stageAgent === 'analyst'|'architect'`——无阶段领域 Task 无此字段（04 §1.1）；07 全文无历史标注
   - 影响：实现期按 07 §6 引用不存在的 stageAgent 字段；旧概念残留未标注（对比 01/08 均有标注）
5. **[Major] 文档索引不完整 + 版本陈旧（04-alignment 清单 + README 文档表）**
   - 现象：04-alignment §文档清单仅列 domain 01-07（**缺 00 领域权威总纲**/08/09）与 product 00-06（**缺 07-success-metrics**）；README 文档表标注 D0 v2.1/A0 v3.0（实际 v2.2/v4.0）
   - 影响：新读者按索引入口漏读实现权威 A0 与成功指标 07；版本标注误导
6. **[Minor] 02 §6 `AchievementProposed` 未标注历史替代**（04 §4 已标「由 proposal.completion 替代」）——事件表标注不一致
7. **[Minor] 04 §6 类型汇总缺 `PendingKind`/`DecisionKind`**（§3.6 签名 `PendingKind | 'none'` 用而未定义）
8. **[Minor] 重设计细节回写不全 4 处**：
   - 04 §3.6 `deriveDecisionPoint` 签名比设计 §3.3 多 `userRequested`（04 注「含用户主动通道」——设计 §3.6 性质 4 有语义但 §3.3 签名未含——权威签名两处不一）
   - 06 追加段「card.shown/resolved 语义并入 decision.requested/resolved」——设计 §3.5 注记 C 修正明确「『并入』措辞澄清为『语义对齐』非事件合并」——06 未同步（实现者可能误删 card.* 事件）
   - 06 §2.2/2.3 时序图 `forceTool` 列旧机制名（§1.5 已更名 execution.forced/released）
   - A0 §3.5b（L153）ApprovalRequest 内嵌签名缺 `toolName` 字段（04/设计有）
9. **[Minor] 02 §8 Ubiquitous Language 缺 9 个新术语**（提议/决策点/决策/证据/方案提议/完成声明/拒绝原因/动作属性/问题台账/确认卡——A0 §9 已含、02 §8 未同步）
10. **[Minor] 03 §1 全景图缺 Delivery BC 节点 + §5 上下文映射缺 Conversation→Delivery 行**（§3.3 有文字描述——图文不一）
11. **[Minor] 05 §5 模块目录缺 `problemStore.ts`**（Problem 聚合已建模 02 §4.13/04 §1.5 且 V1 已落地）
12. **[Minor] 07 §3.1 标准前缀工具清单旧**（无 check-capability/approve-files/start-server 等 A0 §7 工具、无环境注入/推进保障说明）
13. **[Minor] 09 §1 表头「领域元素（A0 v3.0）」vs 文档头 v4.0**——版本标注未更新
14. **[信息] 04 §1.1 实现形态注记（L14）旧状态名 `achieved-reported`**（2026-08-15 历史注记——图/类型已更名——标注即可）

## 五、建议

- **修复序（S1 前置 2 项优先）**：
  1. **#1 A0 §5 RejectReason 补 `modify`**（权威层枚举对齐 04 §2.3b/设计 §3.2——S1 类型实现依据）
  2. **#2 04 §1.1 状态机图修正**（删除/定义 unresolved——建议：解决被拒 → 回 executing（推进保障保持不收敛），图回到 5 态与 §6 一致）
  3. #3 05 §3 管线图同步新语义（goal/plan + require-advance + pending 恒不强制分支）
  4. #4 07 §6 ModelRouter 移除/标注 stageAgent 分支（无阶段后废弃——按 userRequestedPro/thinking 路由）
  5. #5 04-alignment 文档清单补 A0/08/09/07 + README 版本标注更新（v2.2/v4.0）
  6. #6-#13 Minor 随 1-5 回写（02 事件标注/06 措辞/03 图/05 模块/04 §6 类型/09 表头/02 §8 术语/A0 toolName）
- **权威裁决**：
  - 状态机/值对象/事件签名冲突处：**以设计文档（`intent-confirmation-domain-design.md`）为重构期权威**——A0/04 回写（RejectReason 6 值、deriveDecisionPoint 签名含 userRequested 由 04 回写设计 §3.3 或标注 04 扩展）
  - 推进保障：以 **A0 §4 + 07 §1.1** 为准（05 §3 旧图为过时表述）
  - ModelRouter：无阶段后 stageAgent 分支废弃——**以 02 §4.1 Task 模型为准**（V1 DeepSeek-only：Flash/Pro 按 userRequestedPro/thinking 路由）
  - 事件体系：**06-domain-events.md 为事件目录权威**（card.* 与 decision.* 并存——语义对齐非合并）
- **修复后验证**：grep 确认 A0 RejectReason 含 modify、04 §1.1 无 unresolved、05 §3 无 required/execution 旧词、04-alignment 清单含 A0——全部命中即闭环。

## 六、验收标准

- [x] #1 A0 §5 RejectReason.kind 补 `modify`（S1 前置）——2026-08-16 修复：A0 §5 枚举 6 值（含 modify+「修改」决策说明）
- [x] #2 04 §1.1 状态机图回到 5 态（unresolved 消除/定义化——S1 前置）——2026-08-16 修复：删除 unresolved；「还要改」→ 回 executing 继续执行；§1.1 实现形态注记旧状态名同步更名（#14）
- [x] #3 05 §3 推进保障管线图新语义（goal/plan + require-advance + pending 恒不强制）
- [x] #4 07 §6 stageAgent 分支移除/标注历史
- [x] #5 04-alignment 清单补 A0/08/09/07 + README 版本更新（D0 v2.2 / A0 v4.0）
- [x] #6-#13 Minor 回写（02 事件标注/04 §6 PendingKind/设计签名 userRequested 回写/06 措辞+时序图/03 图+映射/05 模块目录/07 前缀/09 表头/02 §8 术语/A0 toolName）
- [x] 就绪度 ≥85（#1-#5 修复后）——90/100
- [x] 第 12 轮「三处一致性」断言复核通过（RejectReason 枚举逐值一致——6 值三处统一）

## 七、备注

- 本次审计**未修改被审文档**；第 13 轮为语义级全量精读（第 12 轮符号级——本轮发现上轮口径的盲区：存在性≠枚举逐值一致）
- **修复记录（2026-08-16，第 13 轮全修）**：#1 A0 RejectReason 补 modify + #2 04 状态机图 5 态化 + #3 05 §3 新语义 + #4 07 stageAgent 移除 + #5 索引补全（04-alignment/README）+ #6-#13 Minor 全部回写 + #14 状态名注记——第 12 轮「三处一致性」断言复核通过——S1 前置就绪（值对象枚举/状态机/服务签名/事件/索引五处一致）
- 第 12 轮报告已归档 `docs/PRODUCT-DOC-AUDIT-r12.md`
- spot-check 抽验 6/6（第 12 轮 4 项 + 第 11 轮 2 项）——领域内部落点 4 + 产品↔领域落点 2（07 指标 kind=modify 依赖、索引完整性）——均衡覆盖
- 报告路径：`docs/PRODUCT-DOC-AUDIT.md`（r4-r12 归档）
