# 实现计划：决策点一等身份与两轴分离（β 根因修复）

> **已被详版取代（2026-10-03）**：`2026-10-03-decision-point-identity-detailed.md`（含裁决落地：core:685 本轮转绿、cards:440/core:1859 独立计划并入）。本文件保留作骨架索引。

> 日期: 2026-10-02 ｜ 依据: 提案 accepted `docs/design/decision-point-identity-model-proposal-2026-10-02.md` ＋ 干净版修订定稿 `docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`（整段替换文本，原稿仅对照；**第十二轴修后版**）＋ ADR-015（定稿）/ADR-014 #1 #2 ｜ 审计: `docs/audits/independent-audit-v8-twelfth-axis-2026-10-02.md`（命门闭合；P2 镜像穿透已排 T3.6）。
> 本计划**新起**（取代 v1–v7 补丁计划堆栈；结论承继、形态作废）。每步全绿再进；**T0 未获用户裁决前不进 T1**（ADR-012）。

## 范围

β＝stale 答复（在途文本/旧卡按钮/回声）按"当前 kind"解释、误击当前决策点实例。领域解＝DecisionPoint 一等身份（descriptor→instanceId，归属轴）⊥ rejectStreak（协商轴，不动）。
**不做**：approval allow 文本通道接线（t000073 另批）；`toolCallId` 精确配对（V2）；flush/队列宽度、rejectStreak 阈值、L5；废 C2。

## T0 基线重取（测批——只测只记，零改动）

- L3 interaction ×3（N≥3），交集稳定红清单；**专项裁 `core:161`**：本轮不红 vs t000069"并入＝4 稳定红"冲突——复核并归类（环境性/真实回归/已修）。
- 已知待定红候选：`cards:440`/`core:685`/`core:1859`（上轮交集）。
- 汇报汇总 → **等用户裁决**（哪些红属 β 修复面、哪些另批）→ 才进 T1。

## T1 领域层（conversationState.ts + L1 红→绿）

1. `ConversationState` 加 `decisionInstanceSeq: number`（初值 0）、`activeDescriptor?: string`；`decisionContent` 加必填 `instanceId`。
2. `descriptorOf(kind, content)` 纯函数（新，~15 行）：白名单 goal=`statement`；plan=`files[].path` 集+`verificationPlan` 集；resolution=`(command+passed)` 对集+`diffs[].path` 集；approval=`toolName+subject`；system_clarify=`underlying+statement`。集**排序+去重 join**（插入序 `derivePlannedFiles:837` 不可复用）；排除 summary/assumptions/reason/risk/output/since。
3. `setPending`＝归属轴唯一推进点：`kind!==pending || descriptor!==activeDescriptor → seq+1`，等值重提议同 seq；**恒铺骨架** `{kind, since, instanceId:seq}`（approval 置位须带 ApprovalRequest 才有描述符载体）。
4. `userDecided`/`approvalDecided` 加参 `answers: {kind, instanceId}`——**领域必填**；调用点迁移完成前实现层暂容缺省＝跳门（**过渡豁免非领域语义**，T4 零缺省审计后收紧）——**身份门**：`s.pending!=='none' && answers && !(answers.kind===s.pending && answers.instanceId===s.decisionInstanceSeq)` → 整转换 no-op（**连 rejectStreak 亦不动**）；门比 `s.pending` 不比 `point`（system_clarify 递归透传原 answers，无例外分支）。门后 confirm/reject/rejectStreak 逻辑**逐行不变**。
5. `restorePending(s, dc)`：直置 `pending/decisionContent/decisionInstanceSeq=dc.instanceId/activeDescriptor=descriptorOf(dc)`（续号不回 0；不走 transition/不 emit——仿 `restorePlanned:97-104`）。
6. 兼容壳 `userConfirmed/userRejected` 透传 answers。
7. L1 新测（不变量 1 矩阵下）：描述符变→新实例/等值重提议→同实例；**第九轴命门序列**（plan A→B 实质变 + 迟到"行"→ no-op）；`pending==='none'` 放行；system_clarify 透传；resolution `passed` 翻转→新实例、纯措辞/assumptions 变→同实例；descriptorOf 确定性（乱序输入同键）。

验证：`npx vitest run` 全绿 + 双 tsc。

## T2 事件与持久化（timeline.ts + sessionStore.ts）

1. `decision.requested` detail 加 `instanceId`；`decision.resolved` 加 `answeredInstanceId`（扩载荷不新增类型）；`deriveStateEvents` 同步。
2. 新事件 `conversation.stale_input_discarded`（domain 既有 'conversation'；detail＝被拒 answers × 当前 {pending, seq}）——注册表联合+SPEC **双写**（timeline.ts:116 坑）。
3. `StoredMsg` 序列化 `decisionInstanceSeq/activeDescriptor/decisionContent{instanceId}`；`loadSession` 改走 `restorePending`（现 `ConversationPanel.tsx:346-355` 普通 setPending 会复位 seq+重复 emit）；补 `:351` 漏的 `dc.approval`。
4. L1：恢复 round-trip（重显卡＝同实例；恢复后新 setPending 续号不撞落盘旧 instanceId）。

## T3 renderer 接线（ConversationPanel + 卡/按钮组件）

1. **文本路**：`send` 入队点（:2447）冻结 `{text, answers:{kind:s.pending, instanceId}}`；`flushPendingSend`（:2415-2420）**原样回传**——绝不在 flush 按当时 pending 重冻；C2 路由块（:2454-2482）携 answers 进 confirm/reject；路由块**前置探测** stale（hook stateRef 比对）→ `emit(conversation.stale_input_discarded)` + 状态栏可见重提示（"内容已更新，请重新确认"）——**不吞文本、不回喂**；域门为兜底防线。
2. **按钮路**（9 站点）：onClick 携**渲染帧** `decisionContent.instanceId`（prop 冻结，非点击读现值）——活卡被换内容后旧卡按钮 no-op。
3. **回声**（8 站点）：`opts.echo` 旁路（ADR-014 #2，与归属轴正交）。
4. approval 置位点补传 ApprovalRequest（X2 骨架）；rejectApproval 按钮携 answers；**allow 通道不动**（t000073）。
5. `isDecisionCardEcho`（agentLoop.ts:62，现零消费）接进回声判定或删——按接线实况裁。
6. **main 镜像联动（第十二轴 P2 穿透封堵）**：`useConversationState.ts:58-74` wrapper 的 `setPlanConfirmed` 镜像（plan confirm/reject 两处）**仅在门通过、转换真生效**（`stateRef.current` 前后非同一实例且 pending 确有推进）时执行——门 no-op 一律不翻镜像（否则 approve-files 硬序门 tools.ts:615 从门旁漏开）；goal confirm 任务边界镜像不动。

## T4 回归与收口

- L3 ×3 交集（对照 T0 基线：稳定红只减不增；β 新绿：第九轴序列、`core:685` 类 stale 误确认面）；**新增镜像联动断言**（stale plan 答复 → 门 no-op → approve-files 仍拒——P2 回归锁）。
- 全量门禁：L1 / 双 tsc / eslint / 契约测；`coverage-matrix.md` 加"决策点实例寻址 ↔ 不变量 1（精确化）"行。
- 文档收口：ADR-015 accepted 落定稿注；handoff 关 t000074 残留、开 t000073 后续批。

## 回滚

每 T 一 commit（Conventional Commits `feat(domain)`/`feat(renderer)`/`test`…）；`git revert` 按 T 退。设计文档不改语义只精确化，无需回滚。

## 风险与预留

- **T3 面广**（9 按钮+8 回声+路由）：逐站点小 commit，L3 分段跑。
- 迁移期 `answers` 缺省跳门＝残留面：T4 末审计零缺省调用后再论是否收紧为必填（不提前必填——防兼容壳炸整轮）。
- 描述符白名单变更须同步改提案 §3＋本计划 T1.2＋L1 测三处（唯一源＝提案）。
