# ADR-015：决策点一等身份与两轴分离（定稿）

- 状态: **accepted（2026-10-02 定稿）**——权威文本＝提案 `docs/design/decision-point-identity-model-proposal-2026-10-02.md`（accepted，§7 三问已裁：resolution descriptor **含 passed**；instanceId **会话内单调 int、恢复续号、不设溢出防护**；落地序 原稿 diff→新实现计划→基线重取→修批）。本文件 v1–v3 Decision 条目中 `signature/structuralSignature` 术语统一改 `descriptor/DecisionDescriptor`，其余结论有效；与提案冲突处以提案为准。
- 落位记录: **干净版修订定稿**（整段替换文本，原稿仅对照不做 diff）`docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`；实现计划 `docs/superpowers/plans/2026-10-02-decision-point-identity.md`（新起、不叠 v 号，T0 基线重取先行）。
- 日期: 2026-10-02
- 取代: 本 ADR v1/v2 单 epoch 形态与 v3 补丁形态 + `014` #3 递增判据、#5 控件守卫（并入单门）。其余 014 裁定（#1 保留 C2、#2 回声退通道、#6 stale 事件）保留。语义不改 `ADR-001`（提供正交显式载体）、不改 `ADR-006`。**后继（2026-10-03）：本 ADR 的 approval 面条款（#2 铺骨架含 approval、#5 approvalGranted 不叠代次、#6 `dc.approval` 恢复）由 `ADR-017` 取代**——确认卡族条款全部有效；正文不回改（ADR-016 代价条款）。
- 相关: 轴报告四→十一 + 终审（`docs/audits/`，含 `as-is-decision-presentation-binding-2026-10-02.md`）；`intent-design` §2/§3.1/§3.4/§3.5/§4/§4.1/§8.2E、`00-domain-authority §3.2`（不变量 1 唯一措辞源）、`04 §1.2`；handoff `d000012`–`d000029`。

## Context

第九轴坐实 β＝真模型缺陷（决策点无实例身份 → 同 kind 续提议的迟到确认关不掉）。终审判 v5 单 `decisionEpoch` 兼两职（协商延续 + 答复归属）自相矛盾。第十轴确认**双概念方向成立**（四路击穿失败：pending 唯一写点=setPending、system_clarify 递归闭合、回声经队列闭合、A-026 闭合），但揪出 6 处必须内建修的规格缺陷（X1 门破 `:748`、X2 approval 无载体、X3 恢复跳号、X4 签名含/排矛盾、X5 双守卫、X6 不变量措辞散落）。v3 = 双概念 + X1–X6 原生闭合。

## Decision

1. **双概念**：
   - **决策点槽** `pending: PendingKind`（kind 级）→ 承载 `rejectStreak`（§4.1/ADR-001 语义**不变**）。
   - **决策点实例** `decisionInstanceSeq: number`（+ `decisionContent.instanceId/signature`）→ 承载答复寻址。
2. **实例只在 `setPending` 推进**：`kind!==s.pending || structuralSignature 变` → `seq+1`（新实例）；否则同实例。**`userDecided`/`approvalDecided`/`approvalGranted`/`clearPending` 不叠 epoch**（清 pending 后 `s.pending!=='none'` 门自然拒一切在途答复；下一呈现由 setPending 给新 seq）。
3. **单一身份门**（`userDecided`/`approvalDecided` 首行；X1＋X5，**取代 014#5 kind 守卫**）：
   ```
   if (s.pending !== 'none'
       && !(answers.kind === s.pending && answers.instanceId === s.decisionInstanceSeq)) return s   // stale → no-op
   ```
   - `s.pending==='none'` ⇒ **跳过门**（放行清理 / 任务边界 goal-confirm / 兼容 `:748`；X1）。
   - 门比 `s.pending`（**不比 `point`**）⇒ system_clarify 递归透传原 answers、顶层过、落 underlying（X5：无 system_clarify 例外分支，避免旧强制卡委派落空触 `conversationState.ts:164-165`）。
   - 拒时 → `conversation.stale_input_discarded` + **可见重提示**（§6-D2 作废+重确认），**不吞文本、不回喂**。
4. **答复携带**：`DecisionAnswer {kind, instanceId}`。
   - 文本路：**入队(:2447)冻结、flush(:2420)原样回传**，**绝不在 flush 按当时 pending 重冻**（第十轴 B 承重）。
   - 按钮/授权路：**render 时从 `decisionContent.instanceId` prop 冻结**进 onClick 闭包（非点击读现值，修 UI 偷换）。
5. **`setPending` 恒铺 decisionContent 骨架**（X2）：`{kind, since, instanceId:seq, signature}` 即使调用方不传 proposal——保证**每张活卡都有 instanceId 载体**；approval 置位（`ConversationPanel.tsx:323`）**补传 `ApprovalRequest`（toolName+subject）** 以算签名。**本批不覆盖 approval allow 异步接线**（仍 t000073 另批）——门只保证"旧实例答复不误命中新卡"，allow 改走 approvalDecided 属另批。
6. **恢复旁路**（X3）：新增领域 `restorePending(s, dc)`——直置 `pending/decisionContent/decisionInstanceSeq = dc.instanceId` **与 `activeDescriptor = descriptorOf(dc)`**，**不走 transition、不 emit**（仿 `restorePlanned`）；`loadSession` 改用它（现 `ConversationPanel.tsx:346-355` 走普通 setPending 会 seq 复位 1 + 重复 emit 污染）。补 `:351` 现漏的 `dc.approval` 恢复。
7. **`descriptorOf` 纯函数**（X4＋§6-D1；原 `structuralSignature` 术语已统一为 descriptor）：规范化键＝goal `statement`；plan `files[].path` 集 + `verificationPlan`；resolution **`(command+passed)` 对集**（第十二轴勘误：§7-1 已裁含 passed）+ `diffs[].path`；approval `toolName+subject`。**排除** `assumptions` 及一切模型措辞 + `since`。files/command **排序+去重 join**（需新写~10 行纯 helper；现 `derivePlannedFiles:837` 是插入序 Set，不可直接用作签名）。
8. **不变量 1 精确化 + 单一措辞源**（X6）：`00-domain-authority §3.2` 定为不变量 1 **唯一措辞源**——"状态推进只能由针对当前决策点实例（instanceId+kind 匹配、且存在活 pending）的用户决策发生；实例不符＝no-op"。`intent-design §4`/`:215`/§3.4、`04 §1.1/:1.2`、`02`、`coverage-matrix` 全部**改引 ADR-015 编号**、不各写一份（防双源）。
9. **§4.1/ADR-001 正交载体**：同实例＝延续（seq 不变、rejectStreak 不重置）；换 kind/实质换内容＝新实例（seq+1、rejectStreak 按 ADR-001 slot 规则）——两轴解耦，消除旧"一 id 兼两职"矛盾。
10. **C2 保留**（`intent-design:215`，014#1）、**回声 `opts.echo` 走非用户通道**（014#2）、**不新增拒绝词表**（§D13）。

## 命门闭合（对第十轴）
- 同 kind 续提议 A→B 实质变 ⇒ setPending 判 sig 变 ⇒ **新 seq** ⇒ 队列旧答复 instanceId 失配 ⇒ 门 no-op ⇒ 确认不了 B。✓（X1 的 `pending!=='none'` 前置不误伤任务边界。）
- 强制卡/跨 kind/approval 旧答复 ⇒ kind/instanceId 失配 ⇒ no-op。✓ UI 偷换 ⇒ 按钮 render 冻结旧 id ⇒ no-op。✓

## 明确不做
不废 C2；不新增输入通道三分/回声领域词汇（§4.12/ADR-013 已足）；不补 protocolTools 的 pending **执行**冻结（提议非动作）；allow 领域接线留 t000073；approval `toolCallId` 精确配对留 V2；不动 flush/队列宽度/rejectStreak 阈值/L5。

## Consequences
- **正面**：一条单一门 + setPending 推进 + render/enqueue 冻结 id + restore 旁路，闭合 β 两形态与两集成面；014#3/#5 并入无残留二源；不变量 1 单措辞源。
- **改动面**：MINOR 领域演进——`ConversationState` 加 `decisionInstanceSeq`、`setPending` 恒铺骨架+签名推进、`userDecided`/`approvalDecided` 首行单门 + 携 `answers`、新 `restorePending`/`structuralSignature` helper、`sessionStore` 序列化、9 按钮 + 8 回声站点 render/echo、兼容壳 `userConfirmed/userRejected` 加 `answers`。调用点/测试面广。落 S1。
- **残留**：仅改 assumptions/措辞的重提议 ⇒ 同实例（旧答复仍命中）——§6-D1 已裁可接受；C2 coarse 尾巴（非回声非问句杂文本）由门+streak 上限兜底。
- **回滚**：Task 顺序 commit，`git revert`；ADR status 回退。

## 前置（定稿后落地序，据提案 §7-3）
1. ✅ 已完成（2026-10-02）：干净版定稿（A1–A7/B1/C1）按落位表整段替换落三份原稿＋D 行单源化（02/04/coverage-matrix 改引措辞源）。
2. ✅ 已完成（2026-10-03）：T0 基线（三稳定红 685/1859/440；core:161 三跑全绿＝t000069"4 稳定红"不成立勘误）→ 裁决并入 → **修批 T1–T4 全绿收官**：commits 0d79ac8/c2d828e/df8eff0（T1-T3）＋独立案 3881929/27712a0＋isAnswerStale 判据提取；三稳定红全部转绿、零新增稳定红（S7-1 等瞬时红 bisect 定性既有 flaky 族非本案回归）；执行记录＝详版计划 §7。β-1 typed-stale 的 L3 构造经 manualEmit 取证判不可行（轮末 finally 即时排空已消灭竞态窗）——由 L1 门用例（T1.8 a-i）＋判据四态锁承载。
3. approval allow 接线另批（t000073）；push/整支合并授权。
> 语义（§6-D1/D2＋§7 三问）已锁。修批已按 ADR-012（T0 测批→裁决→修批）完成。
