# ADR-017 阶段 A 完成报告 ＋ 阶段 B 风险预检清单

日期: 2026-10-03 ｜ 计划: `docs/superpowers/plans/2026-10-03-approval-window-journal.md`（commit f679162）｜ 执行方式: Subagent 驱动（每任务一 agent＋主会话双段评审：agent 报告 ↔ diff 核对＋独立复跑）｜ 分支: test/uat-persona-3round（**未 push**）

## 一、阶段 A 完成报告

### 1.1 交付

| 任务 | Commit | 内容 | 评审证据 |
|---|---|---|---|
| A1 | `b524a9b` | `src/main/approvalJournal.ts`＋`.instance.ts`＋L1（4 案：bootNonce 跨实例防撞／阶段序 latest-wins／损坏行容错／指纹键序无关） | diff 与计划逐字一致；独立复跑 4/4 绿。`require` 改 import（eslint no-require-imports，计划预留适配） |
| A2 | `3ca62a7` | needApproval 咽喉签发：`ToolResult.approvalRequestId/approvalFingerprint`（可选字段）＋journal `issued` 落账＋ipc/preload/types 面 requestId 透传声明 | tools.test 22/22 独立复跑绿；rule-allow 通道不签发锁定；deviation 4 处均最小适配（describe 嵌套继承 hooks／保留 T2 注释／data 联合类型保形／preload 实际透传） |
| A3 | `8217164` | 执行阶段链 `approved→started→done`（**只记不判**）：done 记于纯 ok 与 ADR-011 内层透传两径；catch 不记——`started∧¬done` 恢复判 C 数据形态锁定（含 boom 工具防回归案） | tools.test 24/24 独立复跑绿；全量 727 绿；deviation＝journalDone 局部闭包（计划建议形） |

### 1.2 出口门禁（全部通过）

- 全量 L1：**727/727 绿**（48 文件；基线 723→727 纯增量）
- 双 tsc（renderer+main）：通过
- eslint：0 error（6 条既有 react-hooks warning 与本批无关）
- L3 interaction：**74/74 全绿，5.9m，零红**（对照 β 轮：无新增稳定红；S7-1 既往 flake 本轮未现）
- ADR-012 合规：L3 为独立测批，跑前无产品改动、跑后只记录。

### 1.3 现状语义（阶段 A 边界）

行为零改动：`approved:true` 无 requestId 仍可执行（盲信面关闭属 B7）、renderer 未消费 approvalRequestId（B4 接线）、journal 文件随 userData/workspace 落盘且旧档无该文件＝空账（C2 恢复三判对"无行"走退化分支，语义已定）。**阶段 A 满足"中途可发"**——是否发布/推送由用户裁。

## 二、阶段 B 风险预检清单（B1–B8 原子对）

> 用法：每任务开工前核"触发面"列，收口时核"验证抓手"列。B 期整体中途不可发——任何中断须回到原子对起点或整对完成。

### R1（高）D5 退役 = 续转停止供料断链 → 问题 A 十四轮循环回归
- 触发面：B5 删 `ConversationPanel.tsx:320-350` effect 时，`:1932-1936` `shouldStopContinuation` 供料（原读 `pending==='approval'` 槽，槽由该 effect 置）随之失源。
- 缓解：计划已锁 B5.2 改窗直读 `decidableRequests(...).length>0 ∨ pending==='approval'`；删 effect 与改供料**必须同 commit**。
- 验证抓手：`core.interaction.ts:1859`（问题 A）与 `:2014`（P2 双卡）单跑先行，绿后才动 B5 其余消费者（`:703` status、`:2766` deps、busyGate）。

### R2（高）槽↔窗双向同步写反（计划自审已抓一次，实现期同型错）
- 触发面：B2 `drainQueued(windowResolved(...))` 调用序；B5.5 确认卡让位回槽（hook confirm/reject/clearPending 外包 windowResolved）。
- 缓解：L1 防线④双向案（d1 批准后 d2 顶上→归零 none；taken 释放→回 approval）已进计划测试码——先抄测试后写实现。
- 验证抓手：conversationState.test.ts::ADR-017 describe 全绿前不进 B4。

### R3（高）B4 五锚点同文件交织（`:320/:703/:1788/:2588/:2766`）
- 触发面：首执行入窗、文本恰一、hook 装配、状态打点四处都在 ConversationPanel（3.5k 行）；改任一易牵其余。
- 缓解：B4 按锚点分四刀分跑（每刀后跑 `cards-from-decision-content` 组＋core 案）；文本路由改动锁定 S7-1/S7-3 案。
- 验证抓手：`git diff` 每锚点独立可读；stale 前置探测（ADR-015 回声豁免）不受文本改动影响——`core.interaction` 问题 A 的 staleNotice 断言复核。

### R4（中）L3 mock 新通道缺桩 → 噪声/假绿
- 触发面：preload 新增 `approval:reconcile/issue`，interaction addInitScript mock 未含即 undefined——B4 过渡路径打 `approval-id-missing` 事件，部分用例可能把噪声当行为。
- 缓解：B8 清单已列三桩（reconcile→rows:[]、issue→自增 id、execute 返回 approvalRequestId）；**mockBridge 若有集中桩工厂一并改**。
- 验证抓手：改桩后全量 L3 与阶段 A 基线（74/74, 5.9m）计数比对。

### R5（中）盲信面关闭（B7 tools）砸既有自动通道
- 触发面：`approved:true 无 requestId 拒` 一刀可能波及 rule/preApproval/delegateLowRisk/execPlanApproved 四自动通道（它们 opts.approved 传 false/undefined——计划已界定仅布尔在场才拒）。
- 缓解：S6 组（curl localhost 自动放行）、`:685`（清单内 write 自动放行）、`:1135`（允许并记住同文件自动）三案是精准哨兵。
- 验证抓手：三案先单跑；`agentLoop/busyGate/hardOrderGate` 全量 L1 复跑。

### R6（中）reject idx→id 定位改型（B6）伤旧档 fallback
- 触发面：`patchToolCall` id 分支＋name+args 兜底并存（:82-119 注释即 a08d1775 取证史）；stopToolCall 加窗收敛（停止＝denied）是新语义。
- 缓解：B6 只动 reject/stop 两处；旧档无 id 用例行为=兜底路径不变。
- 验证抓手：`:2014` 双卡案（id 精确定位）是主哨兵。

### R7（低）规则回写双源决定（C3 前置于 B 的窗口期）
- 触发面：B 期 renderer `addTrust` 仍局部生效，`decidedBy:'rule'` 的 `by` 参已存在但无生产者——无害；风险仅在中途有人"顺手"接 rule 路径。
- 缓解：rule-decided 生产归 C3 任务，B 期 L1 以"by 缺省 user"锁定。
- 验证抓手：conversationState L1 不出现 `decidedBy==='rule'` 断言外溢。

### R8（低）Prettier/lefthook 跨任务重排
- 触发面：agent 提交后 prettier 重排与计划文本行号漂移，后续任务锚点定位失败（β 轮旧坑）。
- 缓解：锚点定位一律用"精确旧文本"非行号；行号仅作近似指引。

### 基线快照（B 期回归比对锚）
- L1：48 文件 / **727** 用例全绿（commit 8217164）
- L3：interaction **74/74** 全绿 5.9m（同 commit）
- 双 tsc/eslint 0 error（同）

**开工闸**：R1–R3 的哨兵案（1859/2014/685/S7 组）在 B1 前单跑一次取"当前绿"证据——绿则开工，红则停并汇报（测批纪律同 ADR-012 精神）。
