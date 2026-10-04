# 第十一轴独立审计：击穿 v7 / ADR-015 v3

审计日期：2026-10-02 ｜ 对象：ADR-015 v3 + 修订草案 v3 + v7 ｜ 方法：四路并行独立对抗（A 按钮 render 冻结假阴性 · B approval 门一致性 · C 结构签名碰撞/可计算 · D rejectStreak 梯度回归 + T-BOUND 确定性 + DoD 缺口）
**总判定：双概念方向成立、核心命门与 goal/plan/resolution 面闭合；但 v7 有 2 处 P0（approval 门半接→合法拒绝全误拒；system_clarify 无签名→委派错 underlying）+ 规格精度若干，必须内建修才能再终审/落原稿。路线未被否——v7 需 v8 收紧。**

## 闭合面（确证）
- goal/plan/resolution/clarify 卡按钮渲染同帧读 `stateRef.current.decisionContent`（`ConversationPanel.tsx:2957/3412`）→ render 冻结 instanceId 与呈现同源，无滞后假阴性（A）。
- T-BOUND 命门测可构造（manualEmit 同 R0 双 propose_plan，gateway 双 tool-call）（D，需钉 A.files≠B.files）。
- stale 文本梯度：门在 `userDecided` 首行 return，路由块 `:2462/2464`(reject)→`:2488`(noteUserTextReply) 顺序执行，故 T2 `unresolvedTextReplies` 仍累加、`detectUnproductiveDialogue:254` 经 max(T1,T2) 兜住——退化 1 轮、非死区（D）。

## P0 阻断（v8 必解）

### N1 approval 面门半接 → 合法拒绝全误拒（B）
- v7/ADR-015 v3 把单门写进 `approvalDecided:262`。但审批拒绝链 `ConversationPanel.tsx:3293/3354 rejectToolCall`→`useToolApproval.ts:185`→`useConversationState.ts:73-74 approvalDecided` **全程不碰 decisionContent/stateRef、无法 render 冻结 answers**（v7 §3 文件表无 useToolApproval 行、兼容壳 point 型不含 approval）。门上线后 answers 缺省 → `undefined!==seq` → **合法拒绝全 no-op**，且 `:2649` wrapper 已置 rejection 态+催模型 → 模型以为拒、state 仍 pending → sessionGate 冻死全部工具。approval 现有测试（`conversationState.test.ts:716-729/1195-1245`、`timelineEvents.test.ts:185-192`、`core.interaction.ts`）**必红**。
- **v8 解（采 B 推荐）**：门**只挂 `userDecided`**（goal/plan/resolution/system_clarify）；`approvalDecided`/`approvalGranted`/allow/文本批准（`:2470`）**本批不接领域门**，approval 全族对称留 **t000073** 同批统一。文本批准 `:2470-2481` 可**仅 renderer 路由块层**加门（不碰 approvalDecided 签名）。⇒ 无"拒经门、放不经门"双标，无回归。代价＝approval 同 kind 迟到窗残留（ADR §5 已声明）。

### N2 system_clarify 无签名 → 委派错 underlying（A+C）
- `ConversationPanel.tsx:2172-2179` clarify 卡 underlying 可轮换（goal↔plan↔resolution）；X4 白名单**未定义 clarify 签名** → sig 空/同 → 同实例不推进 → 旧冻结钮过门后 `userDecided:158-169` 按**当前** dc.underlying 委派 → **错 underlying 落地**（β 假阳性）。
- **v8 解**：`structuralSignature('system_clarify',dc)` ＝ `underlying + '\u0000' + statement`；轮换 underlying ⇒ 新实例 ⇒ 旧答复门 no-op。

## 规格精度（v8 钉死）

### N3 `structuralSignature` 字段白名单（C）
- goal=`statement`；plan=`files[].path` 集 + `verificationPlan` 集（排 summary/reason/assumptions/since）；resolution=`evidence.verification[].command`（+建议含 `passed`，防红转绿迟确认）+ `diffs[].path` 集；approval=`toolName+'\u0000'+subject`（排 reason/risk）；**system_clarify=`underlying+statement`**（N2）。
- 无 content 置位 → 哨兵 `kind+':none'`（防空 sig 归并）；`:323` 补传 ApprovalRequest。
- statement 规范化：trim + `\s+`→单空格 + NFC，**不折标点**；集合序列化 `JSON.stringify([...new Set(arr)].sort())`（防分隔符注入）。
- 现 `derivePlannedFiles:837` 是插入序 Set，**不可直接当签名**，须新写~10 行规范化纯函数。

### N4 门 return 作用域（D X1）
- 门须在 `userDecided` 内 return（只跳过该转换），**不得 return 出 `send()`**——否则跳过 `:2488` noteUserTextReply → T2 死区。v7 Task3 Step4 措辞须钉"门在领域转换内、路由块后续计数仍执行"。

### N5 残留（列明，非阻断）
- 按钮路 stale 拒（无文本）任何计数不涨 → 无升级兜底（D X1b）——已知限制。
- DoD 缺三条：①approval 面本批不接门的**显式豁免断言**；②clarify 轮换 underlying 新实例测（N2）；③"stale 后 T2 兜住"测（N4）。

## 结论 / 处置
- **双概念路线经十一轴仍成立**；v7 差 N1（approval 门范围）、N2（clarify 签名）两处 P0 设计收紧 + N3–N5 规格钉死。
- 均**可修于文档**、不改模型内核；修法清晰（门缩到 userDecided；补 clarify 签名；白名单定稿）。
- **v8 = 双概念 v4：门只 userDecided + clarify 签名 + 白名单/规范化定稿 + 门 return 作用域 + DoD 补三条 + approval 对称留 t000073。** 再终审前不改两份原稿正文/产品码（ADR-012）。
- 修批硬前置仍含 **L3 基线重取（`core:161` 冲突）**。
