# 实施计划（详版）：决策点一等身份——β 主案 T1–T4

日期: 2026-10-03 ｜ 状态: **ready-v2（第十三轴三向审计修后，`docs/audits/independent-audit-v9-thirteenth-axis-2026-10-03.md`）** ｜ 取代: `2026-10-02-decision-point-identity.md`（骨架版，保留为索引）
依据: 原稿已落地版 `intent-design §2/§3.1/§3.4/§3.5/§4/§4.1/§8.2E`（ADR-015 landed）＋第十二轴报告（T3.6 镜像封堵）＋ T0 基线报告（`docs/audits/t0-l3-baseline-retake-2026-10-02.md`）。
裁决: `core:685` β 同族本轮转绿；`cards:440`/`core:1859` 并入本轮但**独立计划**（见 §6）；回归 N≥3 交集。
纪律: 每 T 一 commit；每步验证命令实跑；vitest 目标跑 `-t`，收口全量。

## 现状锚点（代码事实）

- `conversationState.ts`：`DecisionContent`:103-108 无 instanceId；`ConversationState`:111-126；`initialState`:128-141；`userDecided`:149-223（clarify 委派 :158-169、pending 清除 :171、streak :177/:218）；`approvalDecided`:262-283；兼容壳 :286-300；`setPending`:303-316（无 content 时 decisionContent=undefined——X2 违规点）；`approvalGranted`:320-324；`notePendingSet`:233。
- hook `useConversationState.ts`:40-49 transition 单点；:58-74 confirm/reject 含 **main 镜像 setPlanConfirmed 无条件执行（P2 位点）**；:86 clearPending。
- 面板 `ConversationPanel.tsx`：入队 :2447（pendingSendRef 单槽）、flush :2415-2420、C2 路由 :2454-2482、恢复 :316-358（:349-352 丢 dc.approval）、approval 置位 :323（无 content）、9 按钮站点/8 回声站点清单见第十二轴报告。
- `timeline.ts`:20-116（联合+SPEC 双写）、:242/:284-289 deriveStateEvents；`sessionStore.ts`:11-18 StoredMsg。

## T1 领域层（conversationState.ts，L1 红→绿）

**T1.1 类型与初值**：`DecisionContent` 加 `instanceId: number`；`ConversationState` 加 `decisionInstanceSeq: number`、`activeDescriptor?: string`；`initialState` 加 `decisionInstanceSeq: 0`。新导出 `export interface DecisionAnswers { kind: PendingKind; instanceId: number }`。
**T1.2 `descriptorOf(kind, content?): string`**（导出，纯函数；集排序+去重 join）：
```ts
goal: `${statement}`                                  // GoalProposal.statement
plan: `${sortUniq(files[].path).join('|')}::${sortUniq(verificationPlan).join('|')}`
resolution: `${sortUniq(verification.map(v=>`${v.command}=${String(v.passed)}`)).join('|')}::${sortUniq(diffs[].path).join('|')}`   // 含 passed（§7-1）
approval: `${toolName}::${subject}`
system_clarify: `${underlying}::${statement}`
// 缺字段一律以空串参与（骨架卡 descriptor 仍可算）；排除 summary/assumptions/reason/risk/output/since
```
**T1.3 `setPending` 改造**（:303-316）——**content 参数类型改 `Omit<DecisionContent, 'kind' | 'instanceId'>`**（第十三轴 B#1：instanceId 必填若不裁双键＝所有调用方编译自炸；hook :84 同步）：
```ts
const descriptor = descriptorOf(kind, content)
const seq = kind !== s.pending || descriptor !== s.activeDescriptor ? s.decisionInstanceSeq + 1 : s.decisionInstanceSeq
const noted = notePendingSet(s, kind)
return { ...noted, pending: kind, decisionInstanceSeq: seq, activeDescriptor: descriptor,
  decisionContent: { since: content?.since ?? '', ...content, kind, instanceId: seq } }   // 恒铺骨架（X2）
```
**类型涟漪点名（grep 后逐一补型，不改断言语义）**：protocolTools.ts:333/355（完整 DecisionContent 字面量）、conversationState.test.ts:1331/1344/1366、sessionStore.test.ts×2、useConversationState.test:30；renderer 9 个 setPending 站点（Panel:323/349/793/899/911/1077/1106/1127/1153/2179）在双键 Omit 下**不需动**。
**T1.4 `userDecided` 身份门**：签名尾加 `answers?: DecisionAnswers`（迁移期实现豁免可缺省＝跳门；用户作答站点必携）。在不变量 8 校验后、clarify 委派**前**：
```ts
if (answers && s.pending !== 'none' &&
    !(answers.kind === s.pending && answers.instanceId === s.decisionInstanceSeq)) return s   // no-op（连 streak 不动）
```
clarify 递归 `return userDecided(s, underlying, decision, answers)`（原 answers 透传）。
**T1.5 `approvalDecided`** 同加 `answers?: DecisionAnswers` + 同门（allow 无 answers＝天然旁路，t000073）。
**T1.6 `restorePending(s, dc)`**：直置 `pending=dc.kind, decisionContent=dc, decisionInstanceSeq=dc.instanceId, activeDescriptor=descriptorOf(dc.kind, dc)`；不 emit 语义（纯函数返回，应用层不经 transition）。
**T1.7 兼容壳** `userConfirmed/userRejected` 尾加可选 answers 透传。
**T1.8 L1 新测**（conversationState.test.ts 追加，先红后绿）：
| # | 用例（断言） |
|---|---|
| a | 命门序列：plan A 置位→reject(direction)→重提议 B（files 变）→seq+1；携 answers{plan,seqA} confirm → **整状态恒等**（toBe 引用级 no-op）且 rejectStreak 不变 |
| b | 等值重提议：同 descriptor → seq 不变；旧 confirm 命中 → 正常推进（A-026 队列确认语） |
| c | resolution：verification 项 `{command,passed:false→true}` 翻转 → seq+1；仅 summary/assumptions 变 → seq 不变 |
| d | 纯措辞白名单：descriptorOf 对 files 乱序输入同键（确定性） |
| e | `pending==='none'`：无 answers/有 answers goal confirm → 正常（既有 :748 组不回归） |
| f | system_clarify：underlying 轮转（goal→plan）→seq+1；委派路径 answers 透传命中 underlying |
| g | setPending('approval') 不传 content → 骨架存在、instanceId 有值（X2） |
| h | restorePending：dc{instanceId:5} → seq=5；后续 setPending → 6（续号不撞） |
| i | 无 answers 旧行为逐项不变（快照对比既有矩阵用例，迁移豁免证据） |

**验证**：`npx vitest run src/domain/conversationState.test.ts` 全绿 → 全量 vitest → `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`（第十三轴 A#4：类型涟漪由**双 tsc 兜底**＋按 T1.3 点名清单补型——vitest 不做类型检查，不存在"跑出编译错逐一补"机制；既有 `decisionContent).toBeUndefined()` 断言（:123/:703、useConversationState.test:30）全在清除路径，无"无 content setPending 断 undefined"用例，骨架化不冲突）。

## T2 事件与持久化

1. `timeline.ts`：TIMELINE_EVENT_SPECS 加 `conversation.stale_input_discarded`（domain 'conversation'，detail{answers,pending,decisionInstanceSeq}）——**union+SPEC 双写**；`decision.resolved` 加 answeredInstanceId（deriveStateEvents 读 prev.decisionContent.instanceId）。**`decision.requested` 发射条件改「随 decisionInstanceSeq 推进」**（第十三轴 A#2：现仅 none→pending 沿发射 :284——pending 中换 kind/换 descriptor 的新实例＝强制卡轮转形态，β 命门呈现面，无事件则"新实例唯一记录"落空）。
2. `sessionStore.ts` StoredMsg：加 `decisionInstanceSeq?/activeDescriptor?/decisionContent 内 instanceId`；save/load 透传。**骨架涟漪断言入测**：decisionContent 恒 truthy 后面板 :530 持久化路径开始带审批快照——恢复断言须覆盖（第十三轴 B#2）。
3. `ConversationPanel` 恢复链（:316-358）：**先建 hook 新方法 `restorePending(dc)`**（仿 :97-104 restorePlanned：直置 stateRef+setVersion、不经 transition/不 emit——第十三轴 B#5，T1.6 只造了领域函数）；恢复调用改走它；补 `:349-352` 漏的 `dc.approval`。**旧会话兼容（blocking，第十三轴 A#1）**：存量 dc 无 `instanceId` → `dc.instanceId ?? s.decisionInstanceSeq + 1` 回退（存量卡＝视作新实例，拒 NaN 静默杀全门）。
4. L1：round-trip（存→读→重显卡同实例→新 setPending 续号）；恢复不产生 decision.requested（防时间线污染，仿 restorePlanned 先例断言）。

**验证**：目标 vitest + 双 tsc。

## T3 renderer 接线（逐站点小 commit）

**T3.0 E-685 根因取证先行**（裁决 1 的"根治"前提）：685 失败现象＝两次确认点击的用户回声气泡**均缺失**但决策生效（write 放行、chat#3 发生）。候选因：①pendingSendRef 单槽覆盖丢文（宽度 1）②flush 时 C2/路由把回声文本吞掉。取证法：test-results error-context + 本地单跑 `npx playwright test core.interaction.ts -g "根因 3"` ×3 + 在 flush/enqueue 加一次性 `console.log` 临时观察（**取证后即删**）。若坐实①→与 β 正交，处置方案当场记审计并最小修气泡渲染（点击时同步渲染、flush 仅发送——正是 ADR-014 #2 opts.echo 通道本意）；若坐实②→T3.3 顺带闭合。
1. `send` 路由：opts 加 `echo?: boolean`、`answers?: DecisionAnswers`；**入队时刻**冻结 `{text, answers}`（:2447），flush（:2415-2420）原样回传，绝不按当时 pending 重冻。**echo 正文语义（A#5）**：echo 文本照常渲染气泡＋驱动续跑，但**不写 message_sent tlog、不喂 noteUserTextReply**（不进 C2 判定）。审计注：pendingSendRef 单槽覆盖＝"有气泡未发送"既有残余（本轮宽度不动，只记不修）。
2. C2 路由块（:2454-2482）：调 confirm/reject 前**前置探测** stale（对比 stateRef.current 的 pending/seq）→ 命中：**气泡保留可见＋状态栏"内容已更新，请重新确认"＋emit stale 事件，不发起模型轮**（第十三轴 B#4：禁止"降级为普通消息"仍进 streamChat＝变相回喂，违 §6-D2；也不得重入 C2 误确认当前实例）；未命中→携 answers 进 C2（direction reject 语义不变）。
3. 9 按钮站点：onClick 从**渲染帧** `decisionContent.instanceId` 组 answers；hook `confirm/reject/rejectApproval` 签名透传。**grantPlan 不携 answers**（approve-files＝allow 族，t000073 另批；B#2 证明 none→approval 必推号＝无旧答复命中面）。注：按钮路 stale＝静默 no-op（UI 由 render 冻结＋旧卡卸载保证），事件与提示只挂文本路。
4. 8 回声站点（含 :2415 flush）统一 `echo:true`；`isDecisionCardEcho`（agentLoop.ts:62 零消费）接入回声判定或删（按 ③ 实况）。
5. approval 置位（:323）补传 ApprovalRequest（toolName+subject 真值——从授权事件载荷取）；rejectApproval 按钮携 answers。
6. **T3.6 镜像联动（P2）**：hook :58-74 `setPlanConfirmed` 镜像仅当转换真生效（transition 前后 stateRef 引用不等）才调用；门 no-op ⇒ 不翻镜像。
7. **clearPending（hook :86）同步清 `decisionContent`/`activeDescriptor`**（第十三轴 B#6 破口：骨架恒 truthy 后，旧 `{...s,pending:'none'}` 残留 decisionContent→:530 持久化→恢复误置→再清＝approval 幽灵循环）。
8. `:2488 noteUserTextReply` 直写现状保留（十一轴 D 已裁梯度兜底）。

**验证**：双 tsc + L3 目标单跑（`-g "根因 3"`、`-g "强制澄清"`、`-g "双卡"`、`-g "S7"`）逐组绿。

## T4 回归与收口

- L1 全量 + 双 tsc + eslint；L3 ×3 交集对照 T0 基线：`core:685` **转绿**、`cards:440`/`core:1859` **不劣化**（其修复在独立计划批，见 §6）、β 新绿（T1.8 命门在 L3 层的镜像场景：新增 interaction 断言 stale 队列确认语不推进 + **P2 回归锁**：stale plan 答复后 approve-files 仍拒）。
- **次序与负载判据（第十三轴 C#4/#5）**：T4 初验只过"不劣化闸"（440/1859 允许仍红＝合法中间态）；**整轮出口＝独立案绿后合验三例全绿**。交集若冒出 T0 之外的新 3/3 红：先对照 T0 瞬时红清单（retry:173、cards:58、core:111 等 9 例）、低载重跑 ×3 再定性，不得直接判劣化。
- `coverage-matrix.md`：Inv 1 行加"实例寻址（ADR-015）→ T1.8 a-i"映射；**Inv 7 行补"答复绑被应答实例"注**（A#5）。
- 收口：ADR-015 落地注；handoff 关 T 任务、开 t000073 提示、排"零缺省审计→answers 收紧必填"后续。

## 回滚

T1/T2/T3 各站点分 commit；`git revert` 按 commit 退；answers 缺省跳门设计保证未接线站点行为不变（半程可停）。

## §6 独立计划索引（并入本轮、不混编）

- `2026-10-03-cards440-escalate-stuck.md`——S5-2 escalate 未发（stuck 链）。
- `2026-10-03-core1859-approval-overcontinue.md`——approve-files 悬挂期过度续聊。
执行次序建议：β T1→T2→T3→T4 为主线；两独立计划各自 E（根因取证）→修→绿后，在 T4 终回归合并验证（三例全绿 + 交集只减不增为整轮出口）。**时序耦合（第十三轴 C#6）**：两案 E 取证基线＝β T3 落地前工作树（T3 改 send/echo/flush 会改变 chatCount/气泡症状面）；T3 落地后症状未复现者须复跑 E1 重估，不得凭 T3 前结论直接出刀。commit 纪律：T3.0 插桩删除后 `git diff` 复核无残留 console.log 再提交。

## §7 T4 执行记录（2026-10-03，全部完成）

- **commits**：T1 `0d79ac8` → T2 `c2d828e` → T3 `df8eff0` → 独立案 core1859 `3881929` → 独立案 cards440 `27712a0` → `isAnswerStale` 判据提取（refactor）。
- **β-1 L3 判定（记录性撤销）**：typed-stale 竞态在"轮末 finally 即时排空"下不可确定性构造——窗口被 β 修复本身消灭；语义由 L1 门用例（T1.8 a-i）＋`isAnswerStale` 四态判据用例＋685/T-FORCE/A-016 组合承载。探针实验（manualEmit）留证：pending 仅 done 时置位、flush 与打字赛跑必输。
- **全量串行 ×3（workers=1，@refactor 前后各态）**：RUN1 1 红（S4-3b）/RUN2 3 红（S7-1＋两枚已删临时探针文件）/RUN3 2 红（S7-1、A-017-1）。**对照 T0 交集：440/685/1859 三例三轮全绿＝转绿达成；零新增稳定红**。瞬时红定性：S7-1 既有 flaky（测试自注"D3 回归暴露的既有 flaky"；bisect 率对比 pre-β 3/4 vs HEAD 3/4 等概率复现＝非 β 回归），S4-3b/A-017-1 单跑绿。
- **门禁**：L1 719（含 isAnswerStale 4 断言并入既有例）全绿；双 tsc 零错；lint-staged/eslint 全过；coverage-matrix Inv 1/7 行已更新映射。
- **出口**：整轮三例全绿＋只减不增＋新绿（685 类）达成；t000073（approval allow 接线）与 E-685 单槽覆盖残余（已被 FIFO 顺带修复，仅注记）留档；push 待授权。
