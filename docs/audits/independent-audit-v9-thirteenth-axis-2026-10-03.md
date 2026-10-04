# 第十三轴三向审计：详版实施计划（对照已落地设计合同）

日期: 2026-10-03 ｜ 被审: `plans/2026-10-03-decision-point-identity-detailed.md` ＋ 两份独立计划
方法: 三独立 agent——A 覆盖遗漏轴（设计条目→计划步骤映射）、B 技术击穿轴（计划代码片段 vs 现码实推）、C 方法/出口一致性轴。结论已全部折回计划 v2。

## 必须修（已应用进计划）

**blocking**
- B#1 计划自炸：`DecisionContent.instanceId` 必填后，`setPending` content 参数 `Omit<DecisionContent,'kind'>` 强制调用方传号——T1.3 未改双键 Omit。点名涟漪：protocolTools.ts:333/355（完整字面量）、conversationState.test.ts:1331/1344/1366、sessionStore.test.ts×2、useConversationState.test:30、hook :84。→ 计划改 `Omit<…,'kind'|'instanceId'>`＋构造点清单逐一补型。
- A#1 旧会话恢复：localStorage 存量 dc 无 `instanceId`→`seq=undefined`→后续 NaN、活卡答复全被门杀。→ T2.3 补 `dc.instanceId ?? s.decisionInstanceSeq + 1` 回退（存量卡视作新实例）。

**major**
- A#2 `decision.requested` 现仅 none→pending 发射（timeline.ts:284）——pending 中 descriptor 变的新实例（强制卡 underlying 轮转即此形态，β 命门呈现面）无事件。→ T2.1 改"随 decisionInstanceSeq 推进发射"。
- B#4 stale 处置"降级为普通消息"仍走 streamChat＝变相回喂，违 §6-D2。→ 改"气泡保留可见＋状态栏重确认提示，**不发起模型轮**"。
- B#5/B#6 断链：hook 无 restorePending 创建步骤（T2.3 悬空引用）；**骨架×clearPending 残留 decisionContent→持久化→恢复→再清＝approval 幽灵循环新破口**→ clearPending 同步清 decisionContent/activeDescriptor。
- B#2 真涟漪：骨架使 conversationState→面板 :530 持久化路径 truthy——列入 T2 恢复断言面。

**补强（C 轴）**
- 1859 候选面漏 500ms working 窗口（ConversationPanel.tsx:790/1851）与 ADR-013 恢复链→补。
- T4 次序文不完整→补"T4 初验只过不劣化闸；整轮出口＝独立案绿后合验三例全绿"。
- 负载判据→补"新 3/3 红先对照 T0 瞬时红清单、低载重跑 ×3 再定性"。
- 时序耦合→两独立案 E 取证基线＝β T3 落地前工作树，T3 后复跑 E1 重估；bisect 前停 dev server（reuseExistingServer 旧树服务风险，playwright.config.ts:16-21 retries=0 已核实可行，main..HEAD 43 commit ≈6 步现实）。

**minor（已注记）**
- echo:true 正文语义（不写 message_sent/noteUserTextReply、仍驱动续跑）；grantPlan 不携 answers（allow 族 t000073，B#2 证明无旧答复命中面：none→approval 必推号）；按钮路 stale＝静默 no-op 注记（UI 由 render 冻结+卸载保证）；approvalGranted/clearPending 不叠 seq 注记（kind 恒失配必推号）；coverage-matrix 补 Inv7 行；"逐一补 L1 编译错"机制改 grep 清单（vitest 不做类型检查、tsc 兜底）；T3.1 加"单槽覆盖有气泡未发送"审计注（宽度不动）；门与不变量 8 次序（无 reason 的 reject 仍 throw——按钮站恒带 reason，可接受）；system_clarify 委派 answers 复过门自洽确认；:748 组不回归确认；685"点击时同步渲染气泡"最小修可绿且不违"不动队列宽度"判定成立。

## 总判定
详版计划：**修正后可执行→已修正（v2）**；两独立案：**补强后可执行→已补强**。覆盖核对：设计合同全条目→步骤映射闭合（轴 A 核对表通过项从略，见 v2 计划正文）。
