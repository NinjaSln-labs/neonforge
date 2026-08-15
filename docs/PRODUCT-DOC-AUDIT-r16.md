# 产品文档审计报告：NeonForge（第 16 轮——2026-08-16 · 事件体系全链对照 + 权威双源逐节 + 指标数字对齐）

- 审计对象：**事件四层全链**（02 §6 ↔ 04 §4 ↔ 06 目录 ↔ timeline.ts 注册表 44 事件）+ A0↔设计逐节对照 + 03 §2 衡量 ↔ 07 指标数字对齐 + spot-check 第 15 轮修复
- 审计日期：2026-08-16（**第 16 轮**——事件全链 + 指标数字——本轮为「审计时点评分」循环第 1 轮）
- 审计方式：三层审计 + 事件注册表逐名对照（44 事件 × 4 层）+ 逐节对照 + 数字对齐 + spot-check（第 15 轮 3 项）+ 就绪度评分（**审计时点诚实评分——发现即扣分**）
- 结论：**就绪度 87/100，可交付 Yes（S1 前置有 1 项）**（0 Critical / **1 Major**——事件体系文档↔实现双向不同步 / 3 Minor）

---

## 一、文档全景核查（层①）

与第 13-15 轮同——新增核查项：

| 项 | 现状 | 判定 |
|----|------|------|
| 事件四层（02 §6 / 04 §4 / 06 / timeline.ts 注册表）| 注册表 44 事件——与 06 目录**双向 15 项差异** | ⚠️（Major #1）|
| 03 §2 衡量 ↔ 07 指标 | 03 声称「对齐 07 v1.1」——引用「目标确认→方案批准转化率/方案批准→产出率」——**07 无此两项** | ⚠️（Minor #3）|
| 02 §6 事件表完整性 | 缺 TaskResolved/CapabilityLedgerUpdated（04 §4/06 有）| ⚠️（Minor #4）|

## 二、逐类独立审计（层②）

### A0 ↔ 设计逐节对照（权威双源——逐节）

| A0 节 | 设计对照 | 判定 |
|-------|---------|------|
| §1 模型策略（V1 DeepSeek-only/tool_choice）| 设计范围外（网关不动——§8.4）——07 §1.1 承接 | ✅ |
| §2 BC 清单（Conversation 职责）| 设计只动 Conversation BC（Task 聚合）——Problem 独立聚合不冲突 | ✅ |
| §3.1 三确认点 / §3.1b 语义 / §3.2 单一 PENDING | 设计 §3.1 三布尔 + pending ✓ | ✅ |
| §3.4 用户决策后放行 | 设计 §3.4 userDecided ✓ | ✅ |
| §3.5/§3.5b 门控优先级 + ActionGate | 设计 §3.3 sessionGate×actionGate ✓ | ✅ |
| §3.6 触发权 | 设计 §3.3 deriveDecisionPoint（userRequested 已回写）✓ | ✅ |
| **§4 推进保障决策表** | 设计 §3.3 decideProgressGuarantee——**A0 决策表单档（「强制推进」）vs 设计/04/07 三处两档（require-advance/require-action）** | ⚠️（Minor #2）|
| §4.1 推进判定 / §4.2 完成证据 | 设计 TurnProgress/verifyCompletion ✓ | ✅ |
| §5 宿主边界 / §6 能力 / §7 工具面 / §8 矩阵 / §9 术语 / §10 处置 | 设计全部对应 ✓ | ✅ |

### 事件四层全链（02 §6 ↔ 04 §4 ↔ 06 ↔ 注册表）

| 层 | 事件数 | 差异 |
|----|--------|------|
| 06 目录（语义权威）| ~30（§1.1-§1.7 + 追加段 7）| 见 Major #1 |
| timeline.ts 注册表（实现）| 44 | 见 Major #1 |
| 02 §6 事件表 | 21 | 缺 TaskResolved/CapabilityLedgerUpdated（Minor #4）|
| 04 §4 事件表 | 23 | 完整（含 TaskResolved/CapabilityLedgerUpdated）|

### 指标数字对齐（03 §2 ↔ 07）

03 §2 核心域衡量引用 5 项：转化率（目标→方案）/产出率（方案→产出）/解决确认率/授权卡滞留率/方案修改率——07 v1.1 有 3 项（解决确认率/滞留率/修改率）+ 证据核验通过率——**「转化率」「产出率」07 未定义**（07 的「任务完成率=发起→写入」≠ 方案批准→产出率语义）——Minor #3。

## 三、交叉验证矩阵（层③）

| 对齐关系 | 文档 A 说法 | 文档 B 说法 | 判定 |
|---------|-----------|-----------|------|
| **06 目录 ↔ timeline.ts 注册表（事件全量）** | §1.1-§1.7 + 追加段 ~30 事件 | 44 事件 | ❌ **双向 15 差异（#1）** |
| A0 §4 ↔ 设计/04/07（推进保障档位）| 「强制推进」单档 | require-advance/require-action 两档 | ⚠️（#2）|
| 03 §2 ↔ 07（衡量指标）| 转化率/产出率（对齐 07 v1.1）| 07 无此两项 | ⚠️（#3）|
| 02 §6 ↔ 04 §4（事件表）| 21 行 | 23 行（+TaskResolved/CapabilityLedgerUpdated）| ⚠️（#4）|

**spot-check 第 15 轮修复（抽验 3/3）**：① 设计 §8.1 C 编号标注 ✓（L2）；② A0 §9/02 §8 授权术语 ✓（L2）；③ 09 §2 原则 4/5/6 三行 ✓（L2）——全采信（L2 语义级——L3 闭环待事件链修复后复核）。

## 四、问题

1. **[Major] 事件体系文档↔实现双向不同步（06 目录 vs timeline.ts 注册表——15 项）**
   - 现象 A（06 缺——注册表有 9 个）：`conversation.assistant_start/assistant_done/error/interrupted/status_change`、`execution.force_input`、`tool.executing/tool.remembered/tool.requested`
   - 现象 B（注册表缺——06 有 6 个）：`task.resolved`、`message.appended`、`streaming.started/completed`、`conversation.archived`、`tool.pending_confirmation`
   - 影响：S1 按 06 扩展注册表（proposal/decision/completion/gate）时——06 声称的事件名在注册表落空（task.resolved 等）、注册表已有事件 06 未收录（重复登记风险）——事件登记依据分歧
2. **[Minor] A0 §4 推进保障决策表未含 require-action 档**（设计 §3.3/04 §3.1/07 §1.1 三处两档——A0 权威层单档「强制推进」）
3. **[Minor] 03 §2 衡量引用两项 07 未定义指标**（「目标确认→方案批准转化率」「方案批准→产出率」——03 声称对齐 07 v1.1 但 07 无对应行——需 07 补指标或 03 修正引用）
4. **[Minor] 02 §6 事件表缺 TaskResolved/CapabilityLedgerUpdated 两行**（04 §4/06 均有——02 事件表不完整）
5. **[信息] 逐节对照正面结论**：A0↔设计 12 节对照除 #2 外全部一致——权威双源收敛

## 五、建议

- **修复序**：
  1. **#1 事件体系同步（S1 前置）**：以 **timeline.ts 注册表为事件名实现权威**（06 为语义视图）——① 06 §1 补录 9 个实现事件（assistant_start/done/error/interrupted/status_change/force_input/tool.executing/remembered/requested——各带语义）；② 06 标注 6 个未实现事件的承接/别名（task.resolved → decision.resolved 承接（S1 登记）；message.appended/streaming.started/completed/conversation.archived → conversation.* 系列表达（注册表现状）；tool.pending_confirmation → tool.requested + tool.blocked 表达）；③ 04 §4/02 §6 表头注明「事件名以 timeline.ts 注册表为准」
  2. **#2 A0 §4 补 require-action 档行**（无产出且工具可用——两档均映射 tool_choice='required'）
  3. **#3 03 §2 修正衡量引用**（两项 07 未定义——建议 07 补「方案批准到产出率」（执行转化）或 03 标注「以任务完成率为近似」——裁决：07 补 1 行「执行转化率」（方案批准→首次写入，≥80%）+ 03 引用对齐）
  4. **#4 02 §6 补 TaskResolved/CapabilityLedgerUpdated 两行**
- **权威裁决**：事件名以 **timeline.ts 注册表**为权威（06 补录/标注）；指标以 07 为权威（03 引用对齐）；推进保障档位以 A0 §4 补齐后为准（两档统一）
- **修复后验证**：grep 确认 06 含 9 个补录事件、02 §6 含 TaskResolved、A0 §4 含 require-action、07 含执行转化率——全部命中即闭环。

## 六、验收标准

- [x] #1 06 补录 9 事件 + 6 事件承接标注 + 04/02 表头注明注册表权威（S1 前置）——2026-08-16 修复：06 补 tool.requested/executing/remembered + execution.force_input + conversation.assistant_start/done/status_change/error/interrupted；6 个未实现事件承接/别名标注；02/04 表头注「事件名以 timeline.ts 注册表为准」
- [x] #2 A0 §4 补 require-action 档——2026-08-16 修复：决策表补行（无产出且工具可用——两档均映射 required）
- [x] #3 07 补「执行转化率」+ 03 §2 引用对齐——2026-08-16 修复：07 v1.2 补指标行（≥80%）；03 标注转化率近似口径
- [x] #4 02 §6 补 TaskResolved/CapabilityLedgerUpdated——2026-08-16 修复：事件表补 2 行
- [ ] 就绪度 ≥95（**下一轮审计时点评分**——本轮 87——修复后待第 17 轮审计核验）
- [x] 第 15 轮修复闭环维持（3/3 采信）

## 七、备注

- 本次审计**未修改被审文档**；第 16 轮为事件全链对照（首次四层逐名核对——44 注册表事件）+ 权威双源逐节 + 指标数字对齐
- **审计时点评分 87/100**（发现即扣分——Major #1 一致性 -6、Minor #2-4 各 -2~-3）——未达 95——修复后须再审计一轮
- 第 15 轮报告已归档 `docs/PRODUCT-DOC-AUDIT-r15.md`
- 报告路径：`docs/PRODUCT-DOC-AUDIT.md`（r4-r15 归档）
