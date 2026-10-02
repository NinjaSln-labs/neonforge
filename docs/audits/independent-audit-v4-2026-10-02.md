# 第八轴独立审计：v4 待决项领域裁定 + 新事实

审计日期：2026-10-02 ｜ 对象：`docs/superpowers/plans/2026-10-02-decision-input-attribution-fix-v4.md`
方法：四路并行独立取证——A clearPending 领域合法性 · B 问句旁路 D10 自洽性 · C 审批允许旁路核审 · D 领域裁定 §3-D1/D2 + β 真身范围校准 + 越界检查
用户令：待裁决项按领域模型驱动设计**自行适配定夺**。本文＝裁定结果 + v4 就地修订。

---

## 1. §3-D1 回声可见性——**裁定：保留气泡 + `role:'user'`，仅退 C2 / `message_sent` / `noteUserTextReply`**

领域证据：
- `intent-confirmation-domain-design.md:42`——「决策＝用户对决策点的响应」；按钮点击**即决策本体**，回声是决策的文本化投递（用户发起），**≠ ADR-013:30 的 silent**（silent＝机器非用户通道：协议催/对账引导）。回声属"决策的投递"，不属"自由文本输入"。
- ⇒ 回声**该**可见（用户操作反馈），但**不该**按"用户打字回复"计入 `message_sent`/`noteUserTextReply`/C2 分类。

**备选档修正**（v4 §3-D1 曾只列 T-FORCE-2）：完全走 silent **翻转 ≥4 处既有交互契约**——`forcedClarify.interaction.ts:48`（T-FORCE-2）、`:66`（T-FORCE-3）、`core.interaction.ts:818`（`确认，按方案执行`须现于 `.nf-chat__list`）、`factory.self.interaction.ts:46`。契约面被低估。

**裁决**：**锁 §3-D1 推荐档**（保留气泡 + `role:'user'`，退计数/C2）。备选档因契约翻转面大且领域上回声属"决策投递"（非机器 silent），**否**。

## 2. §3-D2 clearPending 领域化——**必要但不充分；本批仅叠 epoch，允许路径同步化另开叶因批**

前序未证自：v4 §3-D2 拟"clearPending 领域函数化 + 叠 epoch"。核审结果：
- **深层缺陷**：审批"允许"路径 `useToolApproval.ts:121-177 approveToolCall` **从不调** `approvalDecided`/`approvalGranted`——`conversationState.ts:262 approvalDecided` 全仓唯一调用点 `useConversationState.ts:74` **硬编 `{confirm:false}`**（拒绝侧）；allow 的 `pending→none` 靠 `ConversationPanel.tsx:317-328` effect **异步** `clearPending:86` 完成。
- ⇒ 现状即存**不变量 1 旁路**（无用户决策的 pending→none）；且异步窗口内点击→effect 期间迟到文本仍按 C2 命中该 approval 决策点＝**β 同族危害**。
- `clearPending:86` 现仅写 `pending:'none'`，**不清 `decisionContent`、不复位 `lastRejectReason`**（领域转换 `:171/:270/:280` 都做）。

**范围校准（β 真身 vs sibling）**：β 实际 UAT 复现（`uat-ghost-busy-remeasure-2026-10-01.md:108-116`）＝**plan→resolution 代次缺绑**，全程不经 approval 转换；approval 族失败已被 p000071/p066 单列**叶因 α 另批**（`docs/audits/...-2026-10-01.md:137`）。构造性复现亦不经 approval 窗。

**越界检查**：allow 同步领域化只在 Conversation BC（`intent-design:5` 排除的是 main `tools.ts` preApproval 执行层，属 S6/V2；allow 的 pending→none 是 Conversation BC 决策转换，不碰执行）。

**裁决**：
- **本批 v4 范围**＝§3-D2 仅把 clearPending 从 renderer 直写**收敛为领域函数**（清 `pending + decisionContent + lastRejectReason`，叠 `decisionEpoch+1`，对齐 `:171/:270/:280`）。**不改 allow 触发链**（不引入 `approvalDecided({confirm:true})`）——避免本批扩至 approval 面（β 未证，且 approval 面属叶因 α 已裁另批）。
- **另开叶因批 t000073**（登记）：allow 路径补走 `approvalDecided(s, req, {confirm:true})` 于点击时同步；`clearPending` 退为撤权/停止**纯兜底**；`useConversationState.ts:74` 增 allow 形参。此为 sibling，不阻塞 β 本批。

## 3. D10 问句旁路——**裁定：纳入本批，无附加改动**

- 现路由块（`ConversationPanel.tsx:2454-2499`）confirm/reject **不 return**，文本一律落 `message_sent:2486` / `noteUserTextReply:2488` / 气泡 `:2495` / 公共尾 `:2500+` 进模型。D10 仅把"卡消失（reject 清 pending）"改为"卡保持"——冻结**反而更强**（coarse C2 拒绝即清 pending 解除冻结；D10 保留冻结）。
- 问句轮内模型仍受 `sessionGate`（`conversationState.ts:501-503`）+ `pendingBlocked`（`ConversationPanel.tsx:1613/1639`）强制工具冻结——按状态而非触发源，不违不变量 1/3。纯文本答复不推进。
- "问句子集"是 v1-D1 三态的局部复活，但 v1-D1 被第五轴判否的是**全杂文本第三臂**（打字换目标失效，R1）；D10 不触碰非问句新意图，C2 主干完好。一处 `&& !isQuestionLike(text)` 隔离，可撤销。
- 残留：问句式改意图（"改成 X 行吗？"）被 `isQuestionLike`（`agentLoop.ts:48-50`，窄表）豁免→不 pivot；ADR-014 已认此 coarse 尾巴对称存在，可接受。`noteUserTextReply` 把问句计入"文字确认尝试"语义不精确——但恰达 A-024 升级网（`detectUnproductiveDialogue:244-259`），**不宜改**。
- **裁决：D10 锁定纳入**，无附加冻结层。

## 4. §3-D4 基线——**裁定：`core:161` 并入 `t000069` 为第 4 稳定红；N≥3 强制**

- `core:161` 已由 N=2 交集证实为稳定红（四轴 §0 表：两次串行运行清单交集含 core:161；本轮 Task 0 Step1 补第 3 次达 N≥3）。留待并入＝"未经用户裁决即存在于基线里"（四轴 G5）——本令既授权按领域/证据自裁，且**数据已足**。
- **裁决**：t000069 经 handoff CLI 扩为 4 例（`cards:440` / `core:161` / `core:685` / `core:1859`）；N≥3 为 Task 0 硬门槛。flake 名单（`#7-2`/`core:585`/`cards:1006`/`cards:1071`/`S4-3b:1223`）单列、不计入稳定红。

## 5. push 授权——**留用户 gate**

非领域问题；`git push` 属"共享状态变更"，即便用户已授权域内自裁，push 需显式点头。§9 保留此项。

## 6. 净结论

**v4 三刀方向经第八轴全域适配后成立、无新增阻断**；两处措辞/范围就地修正：§3-D1 备选档契约面（≥4 而非 1）、§3-D2 范围（本批仅领域化收敛+叠 epoch，allow 同步化另批 t000073）。ADR-014 状态从 `proposed` **升 `accepted`**（用户已授权域适配自裁余项）。
