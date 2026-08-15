# 产品文档审计报告：NeonForge（第 14 轮——2026-08-16 · 行为边界/服务角色深查 + 第 13 轮修复抽验）

- 审计对象：领域文档 00-09 + 产品文档 00/01/02/04/07 + 设计文档 + **测试域现状对照（tests/ 28 个 L1 文件 + L3）+ 竞品调研报告原文** + spot-check 第 13 轮修复
- 审计日期：2026-08-16（**第 14 轮**——行为边界/服务角色语义级深查——第 13 轮查枚举/状态名一致性，本轮查「边界判定」与「服务模型」的实现依据分歧 + 第 13 轮修复闭环抽验）
- 审计方式：三层审计 + 既有审计 spot-check（第 13 轮 5 项）+ 测试域现状对照（设计 §9 vs tests/ 实际）+ 就绪度评分
- 结论：**就绪度 81/100，可交付 Yes**（0 Critical / **2 Major**——行为边界与服务角色实现依据分歧 / 5 Minor——第 13 轮修复 5/5 采信 L3 闭环）→ **2026-08-16 全修后 90/100**（#1-#7 已修——见五）

---

## 一、文档全景核查（层①）

与第 13 轮同（10 份领域 + 8 份产品 + 设计文档 + 调研报告 + 索引）——**新增核查项**：

| 项 | 现状 | 判定 |
|----|------|------|
| 竞品调研报告（三视角）| 内容完好（90 行——9 竞品全景表/源码修正 5 条/学术共识 10 条/6+3 启示）——**但物理位置在项目外** `~/Documents/myself/analysis/competitor-crawler/`——文档引用（04-alignment/设计 §1/01）在仓库内**解析失败** | ⚠️（问题 #5）|
| 测试域（tests/unit 28 文件 + tests/interaction 1 文件 27 用例）| 存在——组织方式与设计 §9.1 诊断一致（按函数堆叠、锁旧 API `userConfirmed(s,'goal')`/`pendingCardToShow`/`forceToolInput`——pendingCardToShow 已被新设计推翻——S1 重写计划正确）| ✅（设计 §9 描述准确——无冲突）|
| 组件↔值对象映射 | 02-components 意图确认组件章（PlanCard/ResolutionCard/RejectReasonPicker）字段与值对象逐一对应；RejectReasonPicker 选项与 kind 枚举对齐（modify 由「修改方案」按钮直触——设计使然）| ✅ |

## 二、逐类独立审计（层②——行为边界/服务角色深查）

| 文档 | 检查点 | 判据 | 速评 |
|------|--------|------|------|
| A0 §3.1（PlanConfirmed 活动边界）| 一致性 | 可实现性 | 有「探索性只读命令放行」澄清（2026-08-14）——但**引用旧名 classifyAction**（§3.1 括号——02 §5 已更名 classifyReadonly）|
| 02 §4.1（PlanConfirmed 行）| 一致性 | 可实现性 | 「只给方案（不 write/edit/bash）」——**无 A0 的只读 bash 例外澄清**（#1）|
| 04 §1.1（不变式）| 一致性 | 可实现性 | 「未批准方案 → 不产生执行动作（write/edit/bash）」——**与 A0 §3.1 例外冲突**；且与**同文档 §3.6 actionGate 只读自动**有内部张力（#1）|
| 04 §3.1（ProgressGuarantee）| 完整性 | 可实现性 | mode 枚举 3 档 ✓——**require-action 档位触发条件未说明**（设计 §3.3 注释有：确认后无产出且工具可用——04 只写 require-advance）（#6）|
| 04 §3.6 / 设计 §3.3（服务签名）| 完整性 | 可实现性 | **参数形状未定义**：`proposals`/`pendingActions`/`systemState`/`policy`（#7）|
| 02 §5 / 04 §3.2（ProgressionGate）| 一致性 | 可实现性 | **ProgressionGate 新模型角色未对齐**——设计 §3.3 服务清单无 ProgressionGate（sessionGate×actionGate）；02 §5/04 §3.2 保留；A0 §2 保留职责——sessionGate 与 ProgressionGate 语义重叠未澄清（#2）|
| 02-components 意图确认组件章 | 产品对齐 | 可行动 | PlanCard/ResolutionCard/RejectReasonPicker 与值对象/事件/S 阶段映射齐全——无问题 |
| D0 §4.2（问题状态机表）| 完整性 | 可行动 | **6 行状态表缺 failed-recoverable**（01-user-flows L84 有 7 项——D0/01 不一致）（#3）|
| D0 §十一 / A0 §8（范围）| 产品对齐 | 一致性 | V1 清单与 A0 §8 矩阵 9 行逐项对应（DoD ⏸V2 一致）——无问题 |
| 07 §2（埋点）| 一致性 | 可行动 | 指标组与事件名基本对应——**`approval.requested` 埋点名在事件目录（06/设计 §3.5）不存在**（应为 decision.requested kind=approval）（#4）|
| 测试域对照（设计 §9 ↔ tests/）| 一致性 | 可实现性 | §9.1 现状诊断（按函数组织/剧本堆叠/L4 阶段残留）与实际一致——T0/S1 计划正确——无冲突 |

## 三、交叉验证矩阵（层③）

| 对齐关系 | 文档 A 说法 | 文档 B 说法 | 判定 |
|---------|-----------|-----------|------|
| **A0 §3.1 ↔ 02 §4.1 ↔ 04 §1.1（方案未确认时 bash 边界）** | 探索性只读 bash 放行（ls/cat——preApproval 同源判定）| 「不 write/edit/bash」「不产生执行动作（write/edit/bash）」——无例外 | ❌ **冲突（#1）——行为边界实现依据分歧（S1/S3 门控）** |
| **设计 §3.3 ↔ 02 §5 ↔ 04 §3.2 ↔ A0 §2（ProgressionGate）** | 服务清单 = sessionGate×actionGate（无 ProgressionGate）| ProgressionGate 保留（推进门控——确认点活动边界）| ❌ **角色未对齐（#2）——sessionGate 与 ProgressionGate 语义重叠** |
| 04 §3.1 ↔ 设计 §3.3（require-action 档）| 不变式只列 require-advance | 注释含 require-action（无产出且工具可用）| ⚠️ 档位说明缺失（#6）|
| 07 §2 ↔ 06/设计 §3.5（埋点↔事件）| approval.requested→decision.resolved 时长 | 事件目录无 approval.requested（授权请求出现 = decision.requested kind=approval）| ⚠️ 埋点名未映射（#4）|
| D0 §4.2 ↔ 01 L84 ↔ 02 §4.13（Problem 状态）| 6 行状态表 | 7 态（含 failed-recoverable）| ⚠️ D0 缺行（#3）|
| 文档引用 ↔ 实际文件（crawler 路径）| `analysis/competitor-crawler/...`（04-alignment/设计/01）| 实际在 `~/Documents/myself/analysis/competitor-crawler/` | ⚠️ 引用悬空（#5）|

**spot-check 第 13 轮修复（抽验 5/5——修复闭环核验）**：

| 第 13 轮修复 | 抽验结果 | 采信级别 |
|------------|---------|---------|
| #1 A0 §5 RejectReason 6 值 | 枚举含 modify；与 04 §2.3b/设计 §3.2 逐值一致 | 采信（L3 闭环——三处统一）|
| #2 04 §1.1 状态机 5 态 | unresolved 仅存于修正注记；图/§6 类型/设计三布尔一致 | 采信（L3 闭环）|
| #3 05 §3 管线新语义 | require-advance + pending 恒不强制 + goal/plan 名——与 A0 §4/07 §1.1 一致 | 采信（L3 闭环）|
| #4 07 §6 stageAgent 移除 | 仅存移除注记——路由无 stageAgent 引用 | 采信（L3 闭环）|
| #5 索引补全 | 04-alignment 含 A0/08/09/07 + README v4.0/v2.2 | 采信（L3 闭环）|

## 四、问题

1. **[Major] 方案未确认时只读 bash 边界三处不一致（行为边界实现依据分歧）**
   - 现象：A0 §3.1 PlanConfirmed「只给方案（不 write/edit/**有副作用 bash**——探索性只读命令如 ls/cat 放行，判定与 preApproval 同源）」；02 §4.1「只给方案（不 write/edit/bash）」；04 §1.1 不变式「未批准方案 → 不产生执行动作（write/edit/bash）」——且 04 §3.6 actionGate 只读自动与 §1.1 有内部张力
   - 影响：S1/S3 门控实现按 A0 会放行只读 bash（模型出方案时可探索环境），按 02/04 会全拦——行为边界分歧；04 同文档 §1.1 与 §3.6 语义冲突
   - 附带：A0 §3.1 括号仍引用旧名 classifyAction（02 §5 已更名 classifyReadonly）
2. **[Major] ProgressionGate 新模型服务角色未对齐**
   - 现象：设计 §3.3 服务清单（S1 实现依据）为 sessionGate×actionGate——无 ProgressionGate；02 §5 服务表保留 ProgressionGate（推进门控）；04 §3.2 保留；A0 §2 保留职责——sessionGate（会话冻结判定）与 ProgressionGate（确认点活动边界）语义重叠，关系未澄清
   - 影响：S1 服务实现清单分歧（按 04 §3.6 还是 02 §5？ProgressionGate 并入 sessionGate 还是保留为活动边界策略层？）——需权威裁决
3. **[Minor] D0 §4.2 问题状态机表缺 failed-recoverable 行**（01-user-flows L84 有「失败可恢复」7 项；D0 表 6 行）——产品状态可见性不一致
4. **[Minor] 07 §2 埋点名 `approval.requested` 在事件目录不存在**（06 §1.3/设计 §3.5 无此事件——授权请求出现 = decision.requested kind=approval；方案未批准挂起 = tool.pending_confirmation）——埋点↔事件映射未标注（实现埋点时按错名挂点）
5. **[Minor] crawler 引用路径悬空**：文档引用 `analysis/competitor-crawler/reports/...`（04-alignment/设计 §1/01-reference）在仓库内解析失败——实际位于项目外 `~/Documents/myself/analysis/competitor-crawler/`（内容完好——缓解：调研结论已内化设计文档与 A0——但证据链在仓库内不可复核）
6. **[Minor] 04 §3.1 ProgressGuarantee 未说明 `require-action` 档位触发条件**（设计 §3.3 注释：「确认后无产出且工具可用 → require-action（原 required——pending 时自动降级）」——04 不变式只列 require-advance——实现者不知 require-action 何时用）
7. **[Minor] 服务签名参数形状未定义**：`deriveDecisionPoint` 的 `proposals`（{goal?, plan?, completion?}?）、`pendingActions`（ActionAttribute[]?）、`verifyCompletion` 的 `systemState`、`actionGate` 的 `policy`——04 §3.6/设计 §3.3 均无形状——S1 前定型（可 S1 内定，但签名权威应补）
8. **[信息] README L107「L1 单测锁定状态机 8 组合穷举」**——S1 重写后为「不变量 1-8 矩阵」（届时随 S1 更新）

## 五、建议

- **修复序**：
  1. **#1 行为边界统一**（S1 前置）：以 **A0 §3.1 为准**（方案未确认时探索性只读 bash 放行——判定与授权 preApproval 同源）——02 §4.1/04 §1.1 补例外澄清；04 §1.1 不变式措辞与 §3.6 actionGate 对齐；A0 §3.1 旧名 classifyAction → classifyReadonly
  2. **#2 ProgressionGate 角色裁决**（S1 前置）：建议——**ProgressionGate 并入 sessionGate**（确认点活动边界 = 会话冻结判定的一部分：goal-confirmed 只给方案 / executing 执行 / resolution-pending 证据对账——sessionGate 输出 ok/reason 覆盖活动边界；04 §3.2 标注「角色并入 §3.6 sessionGate——保留为活动边界策略层描述」）——或裁决为独立策略层（二选一，S1 前定）
  3. #3 D0 §4.2 补 failed-recoverable 行；#4 07 标注 approval.requested ≡ decision.requested(kind=approval)；#5 crawler 引用路径更新（移入项目或标注项目外路径）；#6 04 §3.1 补 require-action 档说明；#7 签名补参数形状（proposals/pendingActions/systemState/policy）
- **权威裁决**：
  - 行为边界（只读 bash）：**以 A0 §3.1 为准**——02/04 回写澄清
  - 服务模型：**以设计 §3.3 为准**（sessionGate×actionGate）——ProgressionGate 角色二选一裁决（建议并入 sessionGate，04 §3.2 标注）
  - 埋点事件名：**以 06-domain-events.md 为准**——07 映射标注（approval.requested ≡ decision.requested kind=approval）
- **修复后验证**：grep 确认 A0 §3.1 无 classifyAction、02/04 含只读例外、04 §3.2 有角色标注、D0 §4.2 有 failed-recoverable、07 有 approval.requested 映射——全部命中即闭环。

## 六、验收标准

- [x] #1 行为边界三处统一（A0 §3.1 为准——02/04 补例外 + A0 旧名清理）——2026-08-16 修复：A0 §3.1 classifyReadonly 更名；02 §4.1/04 §1.1 补「探索性只读命令放行」例外——S1 前置
- [x] #2 ProgressionGate 角色裁决并回写（并入 sessionGate——04 §3.2 标注）——2026-08-16 修复：04 §3.2 角色裁决注 + 02 §5 标注 + A0 §2 职责归并——S1 前置
- [x] #3 D0 §4.2 补 failed-recoverable 行——2026-08-16 修复：状态表 7 行（对齐 01/02 §4.13）
- [x] #4 07 埋点映射标注（approval.requested ≡ decision.requested kind=approval）——2026-08-16 修复：指标定义行 + 测量方法行事件名对齐
- [x] #5 crawler 引用路径修复（标注实际路径）——2026-08-16 修复：04-alignment/01-reference/设计文档三处标注仓库外物理位置
- [x] #6 04 §3.1 补 require-action 档触发条件——2026-08-16 修复：不变式补行（无产出且工具可用；两档均映射 required——措辞区别）
- [x] #7 服务签名补参数形状（proposals/pendingActions/systemState/policy）——2026-08-16 修复：04 §3.6 补形状块
- [x] 就绪度 ≥85（#1-#2 修复后）——90/100
- [x] 第 13 轮修复闭环维持（5/5 采信 L3——本轮已验）

## 七、备注

- 本次审计**未修改被审文档**；第 14 轮为行为边界/服务角色深查（第 13 轮查枚举/状态名——本轮查「判定边界」与「服务模型」）
- 第 13 轮报告已归档 `docs/PRODUCT-DOC-AUDIT-r13.md`
- spot-check 第 13 轮修复 5/5 全采信（L3 闭环）；测试域对照确认设计 §9.1 诊断准确（无新冲突）
- 报告路径：`docs/PRODUCT-DOC-AUDIT.md`（r4-r13 归档）
