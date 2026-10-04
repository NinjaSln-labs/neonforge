# 终审：ADR-015 + v5——独立对抗审计·判定＝未通过（回炉）

审计日期：2026-10-02 ｜ 对象：`docs/decisions/015-...`（accepted）+ v5 `...-fix-v5.md` + 修订草案 `domain-model-amendment-...`
方法：三路并行独立对抗（A 模型正确性 · B 协议工具不变量3 · C 持久化/调用点/DoD/治理），互不通气，任务是**在改权威原稿前证伪整个 ADR-015 路线**。
**总判定：不通过。ADR-015 存在致命内部矛盾 + 若干未覆盖的结构性缺口；修批 Task 1（改两份领域原稿）必须叫停，ADR-015/014 的 decisionEpoch 条款须回炉重推。** 附带：L3 基线交集与 `t000069`「4 稳定红」对不上（另务）。

---

## 命门级（阻断，A+B 独立同判）

### F1 「setPending 永不递增」与「内容变才换代」互斥 → β 命门自己关不掉
- ADR-015/v5 D3 定：`setPending` 重提议**永不**递增 epoch（绑用户行为对齐 ADR-001）。但第九轴命门＝**同 kind 续提议 A→B 之间无 `pending→none` 跳变** ⇒ epoch 恒 e ⇒ 队列里针对 A 的"行"(targets=e) flush 时 `isAnswerToCurrent` **恒通过** → 错误确认 B。**刀二关不掉它点名的 β**。
- 修订草案 `:21` 却写「内容未实质变化才延续」（＝内容变要换代）——与 v5 D3「永不递增」**直接冲突**，草案 `:91` vs `:40-41` 自相矛盾。
- 根因＝**把 epoch（决策点实例身份）与 rejectStreak（协商计数）当成同一根轴**。二者正交：`conversationState.ts:313` notePendingSet 本就是独立计数通道。正确解须二者解耦（见下"回炉方向"）。

### F2 活卡被无决策偷换＝UI 欺骗，重于 β 文本误确认（B）
- `protocolTools.ts:398-438`：propose_goal/plan/completion **均不读 `s.pending`**（不变量 3 对协议提议确不适用——`intent-design §2:40`「提议不产生状态变化」，故 v5「不补 pending 检查」方向对）；但"提议≠动作"不等于"可在用户正看 A 卡时把可见正文换成 B 且系统无感"。v5 §0.3 把 §308「计数延续」误引为「正文任意覆盖合法」，将缺陷固化进不动清单。
- ⇒ 重提议实质换内容必须产生**新实例**（换代次），使旧实例答复作废 + 可见重示卡（外部 arXiv 2609.18411 "mismatch→discard+re-show"）。

## 结构性缺口（C，均"必须补"）

### F3 持久化：decisionEpoch 不随会话序列化
- `sessionStore.ts:11-18` StoredMsg 无 epoch；v5 §5 文件清单**根本不含 sessionStore**。恢复链 `ConversationPanel.tsx:332-358` 经 `setPending`（不递增）→ 重启 decisionEpoch 恒回 0。
- `decision.requested` 携 epoch 落盘（`useConversationState.ts:44-47`）⇒ 盘上旧 1..N 与重启 0..N **重号**，实例配对审计（015:30 卖点）失效。**附带缺口**：`:349-352` 恢复丢 `dc.approval`。

### F4 兼容壳/按钮路拿不到点击时的正确 epoch → 按钮校验恒真
- 文本路可在入队冻结 epoch（`:2462`）。但按钮 9 站点（`:2997/3010/3066/3085/3128/3144/3431/3457/3479`）只传字面 point，兼容壳 `userConfirmed/userRejected:286/293` 无 targets 形参 → 只能填 `s.decisionEpoch`＝**点击时现值＝恒真校验**（草案 `:77` 自认）。按钮路同 kind 迟误（F2）**根本没被校验**。`approvalDecided` 壳（`useConversationState.ts:74`）+ `ApprovalRequest:58-63` 无 epoch 同病。system_clarify 递归 `:169` 须透传 targets。
- ⇒ 须**渲染时把实例 id 冻结进按钮载荷/卡快照**（非点击时读现值）——这是 v5/015 完全遗漏的设计件。

### F5 DoD 缺条（C）
v5 §6 A1–A12 无：恢复会话代次正确、按钮 epoch render 时冻结、协议工具对活卡处置。A10 仅 manualEmit 守卫文本路。

### F6 治理：ADR-014(accepted) ↔ ADR-015(accepted) decisionEpoch 递增规则互斥
- `014:22`「setPending 永不递增·绑行为」 vs `015:24`「新实例才递增·同 kind 逐字不递增·隐含绑内容」——两口径互斥，**两份都 accepted＝权威冲突**。`015:32`「二者一致」仅指命名。→ 015 为后出精化，回炉须与 014 统一为**单一递增判据**。

## 回炉方向（非指令，供重推）

β 的正解要的是一个自洽的「决策点实例身份」，须同时满足：
1. **实例 id 随「呈现给用户的卡内容发生实质变化」推进**（含同 kind 实质重提议）；**rejectStreak 独立通道**（不随实例推进而重置，保 ADR-001/§4.1 协商保护）。
2. 判据用**结构化字段等值**（files 集合/assumptions/verificationPlan/statement），**非散文 summary**（破「LLM summary 必变→死代码」的第六/七轴两难）；等价重提议＝同实例（A-026 队列确认语可落地）。
3. **id 渲染时冻结进卡按钮载荷 + 入队答复载荷**，消费时比对（补 F4）；不等→作废 + 可见重示（补 F2）。
4. **id 随 sessionStore 序列化**，恢复时续号或配对去歧（补 F3）。
5. 014/015/草案三处递增判据统一（补 F6），并补 DoD（F5）。

代价明确：实质重提议会使**在途旧答复作废 + 用户须对新卡重确认**——这是"宁可不确认、不可错确认"的安全取向，与外部正统一致，但改变现 UX（旧行为是静默误确认）。此为**产品可感知的语义变化**，须用户裁决，非纯技术回炉。

---

## 附：L3×3 基线（本会话，Task 0）
- L1 **703/47** ✓、双 tsc **TSC-OK** ✓。
- L3 RUN2 失败 {`cards:440`,`core:685`,`core:1615`,`core:1859`}；RUN3 {`cards:440`,`core:685`,`core:1859`,`core:2001`}。可见交集＝**{`cards:440`,`core:685`,`core:1859}`}（3 例）**；`core:161` 本轮两跑未红；`core:1615`/`core:2001` flake。
- ⇒ **与 `t000069` 第八轴「并入 core:161＝第 4 稳定红」不符**。须跑满第 1 次记录 + 复核 `core:161` 是否稳定（RUN1 输出被 tail 截断）。基线本身也待重取，但不影响本次终审"回炉"判定。

## 处置
- **修批暂停**：Task 1（改权威原稿）**不执行**。t000071 回 blocked。
- ADR-015 回退 `proposed`（标注"终审未过·回炉"）；ADR-014 decisionEpoch 条款待与 015 统一。
- 回炉须产出 ADR-015 v2（上述 1–5）+ 修订 v5 + 重跑第九/十轴，再请终审。
- **产品码、两份权威原稿正文：全程未动。**
