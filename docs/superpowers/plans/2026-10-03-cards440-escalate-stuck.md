# 独立实施计划：cards:440 —— S5-2 纯文本承诺 escalate 未触发（stuck 链）

日期: 2026-10-03 ｜ 裁决: 并入本轮（2026-10-03），**独立计划、独立 commit 链，不与 β 主案混编**
症状（T0 基线 3/3 稳定红）：`cards-from-decision-content.interaction.ts:440`——确认执行后模型连续 2 轮纯文本承诺（"我马上就去改"/"这就动手"）+ 用户「继续」，期望 `stuck.escalated` 打点 1 次（:472-481 poll 10s），实收 **0**；后续 `conversation.interrupted(source=recovery)` 断言未达。
性质判定：跨会话稳定红＝真实回归（非负载抖动），且首轮 `not.toContainText('没有产出改动')` 通过——**第一段无进展识别仍在，第二段 escalate 决策/触发断链**。

## E（根因取证，先行，禁止跳过）

- E0 基线约定（第十三轴 C#6/#1）：取证基线＝β T3 落地前工作树；bisect 前**停既有 dev server**（playwright reuseExistingServer 可能复用旧树服务）；retries 配置默认 0 已核实（playwright.config.ts:16），main..HEAD 43 commit ≈6 步可行。

- E1 隔离复跑：`npx playwright test cards-from-decision-content.interaction.ts -g "S5-2" --retries=0` ×3——确证非并发负载因素。
- E2 **red-point bisect**：以该测试为谓词在 main..HEAD（或上上次全绿记录点起）二分定位引入 commit；输出 commit、diff 摘要。候选面（按先验排序）：①decideProgressGuarantee/shouldStopContinuation 无进展计数语义改动 ②silent/recoverInterrupt（ADR-013 硬恢复）链上 emit 缺失 ③escalate 消费方（StuckDetector/ConversationPanel）阈值改后 L3 断言面漂移——**以证据定，不以先验定**。
- E3 断链定位：沿"模型 content-only 轮 → 无产出信号 → 计数/判定 → escalate 决策 → recoverInterrupt → timeline 打点"逐环节，临时 `console.log`/evaluate 观察插桩（取证后删除），找出信号断在哪一环。
- E4 出口判据：一句可复述的根因句（症状→成因链），写入执行记录；与第十二轴残留清单交叉（若坐实属 β 身份面，转并入主案 T3 而非独立修——裁决"独立计划"指组织形态，不禁止根因归并）。

## FIX（依 E 结论定，最小刀）

- 只修 E3 定位环节；不动 flush/队列宽度/rejectStreak 阈值（β 计划同款禁区）。
- 若涉及产品语义（如升级阈值本身），先落 ADR 再改。

## 验证与出口

- `-g "S5-2"` ×3 连续绿；相邻组不劣化：`-g "S5|escalate|stuck"` 全绿；全量 vitest + 双 tsc。
- commit 链独立：`fix(stuck): …`（测试断言若须调整另 commit，注明依据 E3）。
- 收口：T0 基线报告追记"cards:440 已修＋根因句"；handoff 对应坑/行动关闭。
