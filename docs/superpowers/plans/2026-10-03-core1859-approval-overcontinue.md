# 独立实施计划：core:1859 —— approve-files 卡悬挂期模型过度续聊（停续聊断链）

日期: 2026-10-03 ｜ 裁决: 并入本轮（2026-10-03），**独立计划、独立 commit 链，不与 β 主案混编**
症状（T0 基线 3/3 稳定红）：`core.interaction.ts:1859`——approve-files 授权卡悬挂（pending）期间，模型续轮应被拦后**停止自动续聊**（不循环）；断言 `__chatCount === 6`（:1990）实收 **9**——多出 3 轮＝悬挂期仍被持续续跑。
性质判定：跨会话稳定红＝真实回归。注意同文件 `core:1615 多卡并存`、`core:2001 双卡按 id`、`core:2130 硬序门` 三轮全绿——**批准功能面正常，坏在"pending 冻结→停续聊"判定链**（sessionGate/maybeContinue/shouldStopContinuation 一环），与 12 轴"allow 旁路 t000073"相邻但不同因。

## E（根因取证，先行）

- E1 隔离复跑 ×3：`npx playwright test core.interaction.ts -g "问题 A"`——排除负载。
- E2 计数复现表：读 :1859-1990 测试体，列出期望时序（哪次 chat 应发生/被拦）vs 实收打点位置；error-context.md 交叉。
- E3 **red-point bisect**（谓词＝该测试）：定位引入 commit；与 cards:440 计划的 bisect 结果对表——**若同 commit 引入（共同回归源，如续聊门控/flush 时序改动），两案合并根因句、仍各自出刀**（组织不混编，证据可共享）。
- E4 断链定位：候选面——①approve-files 置 pending 的时序（setPendingState :323 无 content 分支是否漏置 pending）②maybeContinue/sessionGate 读 pending 源（三判定器同源约定 00 §4）③被拦后停止逻辑（shouldStopContinuation/loop-guard）④**500ms working 窗口（ConversationPanel.tsx:790/1851）⑤ADR-013 恢复链**（第十三轴 C#2 补列）。插桩取证后删（commit 前 git diff 复核）。
- E0 基线约定（同 440 案）：取证基线＝β T3 落地前工作树，T3 后症状不复现须复跑 E1 重估；bisect 前停既有 dev server。

## FIX（依 E 结论定，最小刀）

- 只修断链环节。若坐实与 β 身份/回声通道同因，按 E4 出口判据转主案 T3 收编并在此计划标注，不重复造刀。
- 禁改：多卡并存/双卡 id 定位/硬序门三组绿测试的 harness（回归面保护）。

## 验证与出口

- `-g "问题 A"` ×3 连续绿；同文件邻组不劣化：`-g "approve-files|双卡|硬序门"` 全绿；全量 vitest + 双 tsc。
- commit 链独立：`fix(session-gate): …`。
- 收口：T0 基线报告追记"core:1859 已修＋根因句"；handoff 坑/行动关闭；若同因于 cards:440，两案互相引用 bisect commit。
