# t000073 底层根因：allow 决策从未进入 Conversation 状态机

日期: 2026-10-03 ｜ 状态: **根因报告（待裁修法，未动码）** ｜ 承接: ADR-015 遗留批 t000073（allow/文本批准接线）
取证面: useToolApproval.ts:121-177/306-310、ConversationPanel.tsx:320-335/2594/2745-2752/3351/3497-3510/3668、useConversationState.ts:80-81、conversationState.ts approvalDecided/approvalGranted/setPending、02 §2 判定表（授权裁决=Workspace；确认点状态机=Conversation）。

## 根因（一句话）

**「允许」在领域模型里是决策（§3.4 approvalDecided confirm 分支），在实现里只是现象**——`approvalDecided` 的 `confirm:true` 分支自落地起**零调用方**；四个 allow 入口（单卡允许 :3497、允许并记住 :3508、批量全允许 :3351/3542、文本「批准」:2594）全部直连 `approveToolCall` → 只执行工具＋打 UI 卡事件，不碰状态机。

## 由此派生的四个事实缺陷

1. **pending 清除靠 effect 代理**：授权卡消失（hasApproval false）→ D5 effect `clearPending()`——「用户决策是下一状态唯一输入」（00 §3.2）在 approval 面被 UI 现象替代；invariant 1 字面违背（reject 面已走 approvalDecided，独 allow 面缺）。
2. **decision.resolved(approval, confirm) 与 answeredInstanceId 永不可发**：allow 无转换 ⇒ 时间线上授权批准只能靠 tool.approved/card.resolved 侧面推断，实例回放键断链（T2 载荷白设了 approval-confirm 半边）。
3. **allow 面门旁路是既成事实**：stale 批准（帧过期卡点击）＝照执行真工具；approveAll 文本路径 live 重绑 lastMsg——当前被 T3 前置探测保护的部分仅是**文本**「批准」的排队形态（冻结 answers 命中 stale 会作废），按钮面完全无实例概念。
4. **决策单位错位**：领域里 pending 单一 ⇒ 一个授权窗口＝一个决策实例（可含多张同窗卡）；实现单位是 toolCall——批量批准会 N 次执行 N 次"决策"。这正是当初"allow 接门"被搁置的真实难度（第十二轴 N1"半接"所指）。

## 修法形状（待裁）

**窗口级 `approvalAllowed(request, answers)` 单点**：四入口汇聚——
1. 点击当场（执行工具前）调 `approvalDecided(s, request, { confirm: true }, answers)`：pending 清除转决策驱动、resolved 事件补全、answers 进门。
2. `answers` 取**渲染帧 dc**（面板消息 map :2964 作用域内 dc 即渲染帧，批量按钮同样可达）——与 reject 面同规则。
3. 批量＝**一次决策、N 次执行**（循环只执行不再决策）；单卡批准后同消息余卡＝下一窗口（effect re-arm 恒推新 seq，天然新实例——12 轴 B#2 已证 none→approval 必推号，无旧答复命中面）。
4. 文本「批准」：live 路径现场 answers（{approval, 当前 seq} 必配平），排队路径由既有前置探测保护——统一走 approvalAllowed。
5. toolCallId 精确配对维持 V2 不变（单 pending＋re-arm 模型下窗口语义已闭合）。

## 需拍板的语义分叉（一个）

**gate no-op 是否连工具执行一起否决？**
- A（推荐）：**否——决策与执行分域**。门 no-op ⇒ 状态机不动（不重复清 pending/不发 resolved），但工具执行照常（Workspace 域对用户点击的服从；卡可见即可批是授权架构 v4 的既成安全模型——main 每调用独立 needApproval 裁决兜底）。
- B：no-op 连执行一起拦（"旧卡按钮死透"）——UI 欺骗面最小，但把 Conversation 门变成工具执行的强制前置，跨了 02 §2 判定表的域界，且单卡批准后余卡（re-arm 前）的点击会被自家门误杀。

> 取 A 则 t000073 是纯 Conversation 侧记账接线（低风险）；取 B 需先改域界表述＋处理 re-arm 竞态，风险高一档。

## 验证预告（获批后）

L1：approvalAllowed confirm 分支转换（stale no-op 不重复清、pending 驱动源改决策）；L3：0-1 授权 v4 全链（core:1135 族）、P2 双卡（core:2001）、S7-3 文本批准、A-016；decision.resolved(approval/confirm/answeredInstanceId) 事件断言补进 timelineEvents.test。
