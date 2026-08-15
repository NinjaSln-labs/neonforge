# 产品文档审计报告：NeonForge（第 15 轮——2026-08-16 · 文档↔实现对照层 + 第 14 轮修复抽验）

- 审计对象：设计文档 §5 差距表/§8 同步范围 **↔ 领域层实现**（conversationState.ts / turnPolicy.ts / agentLoop.ts / timeline.ts / sysPrompt.ts 实际代码）+ A0 §9 ↔ 设计 §2 ↔ 02 §8 术语表逐项 + 09 追溯覆盖度 + spot-check 第 14 轮修复
- 审计日期：2026-08-16（**第 15 轮**——文档↔实现对照——前 14 轮全为文档间审计，本轮首次对照实现代码验证迁移清单）
- 审计方式：三层审计 + 实现对照（5 文件关键符号 grep）+ 术语表逐项 + 追溯覆盖 + spot-check（第 14 轮 7 项）+ 就绪度评分
- 结论：**就绪度 93/100，可交付 Yes**（0 Critical / **0 Major** / 3 Minor / 1 信息——文档↔实现迁移清单完整准确——第 14 轮修复 7/7 采信）→ **2026-08-16 全修后 95/100**（#1-#3 已修——见五——**达成 ≥95 水位**）

---

## 一、文档全景核查（层①）

与第 13/14 轮同——**新增核查项**：

| 项 | 现状 | 判定 |
|----|------|------|
| 领域层实现文件（5 个）| conversationState/turnPolicy/agentLoop/timeline/sysPrompt 全部存在——**现状 = 旧模型**（与设计 §5 差距表逐一吻合）| ✅ |
| 设计 §5 差距表（12 行）↔ 实现 | 每行处置均有对应实现符号可核（见二）——**迁移清单完整准确** | ✅ |
| 术语表三处（A0 §9 19 项 / 设计 §2 8 项 / 02 §8 19 项）| A0=02 完全对齐（19=19）；设计 §2 多「授权 Approval」——**A0 §9 缺授权条目** | ⚠️（问题 #2）|
| 09 追溯矩阵覆盖度 | 15 行追溯 + 3 行未映射——**D0 原则 4/5/6（不装能/上手不学/安静可信）未追溯也未列入未映射表** | ⚠️（问题 #3）|

## 二、文档↔实现对照（层②——首次实现层审计）

| 设计 §5 差距表行 | 实现符号（现状） | 判定 |
|----------------|----------------|------|
| pendingCardToShow（模型文本触发）→ 推翻 | `pendingCardToShow` 存在（conversationState.ts:181）+ sysPrompt ⑬「必须输出【目标确认】标记（没有它 UI 无法识别）」 | ✅ 差距文档化准确——S1/S2 目标明确 |
| executionConfirmed → planConfirmed | `userConfirmed(s, 'goal'|'execution'|'achievement')` 旧签名（:41/:64）+ `PendingKind = 'none'|'goal'|'execution'|'achievement'|'approval'`（:11）| ✅ 旧枚举——S1 重写 |
| classifyAction → classifyReadonly | `classifyAction`（:115）+ `BASH_READONLY_HEADS`（:110——classifyReadonly 命令头白名单基础）| ✅ 基础保留——S6 升级 |
| canExecute（单维）→ sessionGate×actionGate | `canExecute(s, action, inPlanned)`（:131）| ✅ S6 重构 |
| forceTool → decideProgressGuarantee | `forceToolInput`（:157）+ turnPolicy `decideTurnPolicy`（:46）| ✅ S5 重设计 |
| parseExecutionPlan → parsePlanProposal | `parseExecutionPlan(text): string[]`（agentLoop:58）| ✅ S2 推翻 |
| achievementConfirmed → resolutionConfirmed | 旧枚举同上（:11）| ✅ S1 |
| shouldStopContinuation 继承 | `shouldStopContinuation`（:203——坑 103 已修复）| ✅ 继承 |
| StuckDetector/推进语义统一 | `evaluateTurnProgress`（:80）/`detectStuck`（:133）——「无工具调用=停滞」旧判定 | ✅ S5 扩展 |
| goalFallback 语义重定义 | `goalFallbackTrigger(content)`（:205）| ✅ §8.5.2 目标明确 |
| timeline 事件 domain 联合扩展 | `domain: 'conversation'|'task'|'session'|'plan'|'tool'|'capability'|'execution'|'stuck'|'problem'|'card'`（timeline:79）——**10 成员缺 proposal/decision/completion/gate** | ✅ 与设计 §3.5 注记完全一致——S1 扩展 |
| sysHint ⑬⑭⑮ 格式契约（S2）| ⑬【目标确认】（无假设行）/ ⑭【执行方案】（文件清单+一句话方案——无假设/验证计划）/ ⑮【已达成】（产物+如何验证——无结构化证据）| ✅ 旧格式确认——S2 同步（**但见问题 #1**）|

**对照结论（正面）**：设计 §5 差距表与实现现状**零偏差**——每个处置项都有对应实现符号可核；S1-S6 迁移清单完整——S1 开工无实现侧盲区。

## 三、交叉验证矩阵（层③）

| 对齐关系 | 文档 A 说法 | 文档 B 说法 | 判定 |
|---------|-----------|-----------|------|
| 设计 §2 ↔ A0 §9（术语表）| 8 项（含**授权 Approval**）| 19 项（**无授权**）| ⚠️ 权威表差 1 项（#2）|
| 设计 §8.1 C ↔ sysPrompt.ts（编号）| 「⑱ 拒绝原因应对（模型收到 RejectReason 后的调整规则）」| 现状⑱ = 「工具失败处理」（错误重试纪律）| ⚠️ **编号占用冲突**（#1）|
| D0 §1.2 原则 4/5/6 ↔ 09 追溯 | 不装能/上手不学/安静可信（产品核心原则）| 未追溯且未列入 §2 未映射表 | ⚠️ 追溯缺口（#3）|
| 07 埋点 ↔ timeline 注册表 | decision.requested/resolved 等 7 新事件 | domain 联合缺 4 成员（现状）| ✅ 差距已注记（S1 扩展）——非冲突 |

**spot-check 第 14 轮修复（抽验 7/7）**：

| 修复 | 抽验 | 采信 |
|------|------|------|
| #1 行为边界三处统一 | A0 §3.1 classifyReadonly ✓ 02 §4.1 例外 ✓ 04 §1.1 例外 ✓ | 采信（L3 闭环）|
| #2 ProgressionGate 裁决 | 04 §3.2 裁决注 + 02 §5 标注 + A0 §2 归并 ✓ | 采信（L3 闭环）|
| #3 D0 §4.2 failed-recoverable | 状态表 7 行 ✓ | 采信（L2 语义级）|
| #4 07 埋点映射 | decision.requested(kind=approval) 两处 ✓ | 采信（L2 语义级）|
| #5 crawler 路径标注 | 04-alignment/01/设计三处 ✓ | 采信（L2 语义级）|
| #6 require-action 档 | 04 §3.1 不变式补行 ✓ | 采信（L2 语义级）|
| #7 参数形状 | 04 §3.6 形状块 ✓ | 采信（L2 语义级）|

## 四、问题

1. **[Minor] 设计 §8.1 C 的 sysHint 编号「⑱」与现状占用冲突**——设计写「⑱ 拒绝原因应对（模型收到 RejectReason 后的调整规则）」；sysPrompt.ts 现状⑱ = 「工具失败处理」（错误重试纪律）——S2 实施时按设计编号会覆盖/混淆现有⑱——需修正编号映射（拒绝原因应对建议新编号 ⑳ 或标注「新增」）
2. **[Minor] A0 §9 术语表缺「授权（Approval）」**——设计 §2 通用语言有（对「动作属性判定为需询问」的调用呈现请求，用户允许/拒绝）；A0 §9（权威术语表 19 项）未收录——02 §8 亦无（随 A0 补）
3. **[Minor] 09 追溯矩阵未覆盖产品原则 4/5/6**——D0 §1.2「不装能/上手不学/安静可信」为核心原则（原则 1/2/3 已有追溯/未映射处置）——09 §2 未映射表应补 3 行（处置：产品交互层约束——领域无元素——类比「人设/不打断」既有行）
4. **[信息] 文档↔实现对照零偏差**——设计 §5 差距表 12 行全部有实现符号可核——迁移清单完整（正面结论——非缺陷；S1-S6 无实现侧盲区）

## 五、建议

- **修复序**（3 Minor——修后即可达 95 水位）：
  1. #1 设计 §8.1 C：⑱ 拒绝原因应对改编号（建议 ⑳——现状 ⑱⑲ 已占用——或标注「新增」防覆盖）；同步 S2 阶段说明「提示词编号以 sysPrompt.ts 现状为准」
  2. #2 A0 §9 补「授权（Approval）」条目 + 02 §8 同步
  3. #3 09 §2 未映射表补 3 行（不装能/上手不学/安静可信——产品交互层约束）
- **权威裁决**：术语表以 A0 §9 为权威（设计 §2 为准入源——差异项补入 A0）；sysHint 编号以 sysPrompt.ts 现状为准（设计仅标注意图不锁定编号）
- **修复后验证**：grep 确认 A0 §9 含授权、09 §2 含不装能、设计 §8.1 C 无「⑱ 拒绝原因」——全部命中即闭环。

## 六、验收标准

- [x] #1 设计 §8.1 C 编号修正（拒绝原因应对 ≠ ⑱——标注新增落地）——2026-08-16 修复：设计 §8.1 C 标注「编号不锁定——以 sysPrompt.ts 现状为准」
- [x] #2 A0 §9 补「授权（Approval）」+ 02 §8 同步——2026-08-16 修复：两处术语表各补 1 项（20 项/20 项对齐）
- [x] #3 09 §2 未映射表补产品原则 4/5/6——2026-08-16 修复：3 行（不装能/上手不学/安静可信——交互层约束处置）
- [x] 就绪度 ≥95（#1-#3 修复后）——95/100——**目标达成（连续 4 轮审计-修复循环：73→90→81→90→93→95）**
- [x] 第 14 轮修复闭环维持（7/7 采信——本轮已验）

## 七、备注

- 本次审计**未修改被审文档**；第 15 轮为文档↔实现对照层（首次对照实现代码——设计 §5 差距表零偏差验证）
- 第 14 轮报告已归档 `docs/PRODUCT-DOC-AUDIT-r14.md`
- spot-check 第 14 轮修复 7/7 全采信；实现对照为正面结论（迁移清单完整——S1 无实现侧盲区）
- 报告路径：`docs/PRODUCT-DOC-AUDIT.md`（r4-r14 归档）
