# 第七轴独立审计：证伪 v3 方案

审计日期：2026-10-02 ｜ 对象：`docs/superpowers/plans/2026-10-02-decision-input-attribution-fix-v3.md`（β 现行方案）
方法：四路并行独立对抗取证（证伪为任务，不信 v3 自陈）——A 控件守卫与既有测试相容 / B epoch 递增路径完整性 / C 回声旁路是否仍续跑 / D 队列改造编译自洽 + timeline 事件登记 + 落点精度
判定：**v3 方向与三刀机制仍成立，但含 2 处 P0 阻断项 + 3 处 P1 精度项。已就地修订 v3；坑 p000148 登记。**

---

## 1. F-A（P0·必改）控件守卫式与 A7 矛盾——现有 rejectStreak 测试会红

v3 §1 契约表 + Task 1 Step2 写：`userDecided` 首行 `if (point !== s.pending && point !== 'system_clarify') return s`。

- `tests/unit/conversationState.test.ts:733-757` 的 `:748` `userDecided(r3, 'goal', { confirm: true })`：`r3` 由 `userDecided(s2, 'plan', reject)` 得来 → `conversationState.ts:171` 已把 `pending` 清成 `'none'`；此处 `point='goal' !== s.pending='none'` → **守卫提前 `return s`** → 跳过 `:177` 的 `next.rejectStreak = 0` 重置 → 断言 `toBe(0)` 实为 `2`，**红**。
- 即 v3 的 A6（点旧卡不清新 pending）与 A7（`:733-757` rejectStreak 既有测试不坏）**互斥**。

**修订**：守卫加 `s.pending !== 'none'` 前置：
```ts
if (s.pending !== 'none' && point !== 'system_clarify' && point !== s.pending) return s
```
- β-C1 场景（新卡 pending 期点旧卡）：`s.pending!=='none'` ∧ `point!==s.pending` → 挡住（A6 保持）。
- 任务边界 `pending==='none'` 时 goal-confirm：前置短路 → 正常执行 → `:748` 重置生效（A7 保持）。
- 不变量 7 无损失（无活 pending 可被破坏）；真迟到答复由刀二归属门 `isAnswerToCurrent`（要求 `answer.kind===s.pending`）兜底。

## 2. F-B（P0·必改）epoch 递增仅覆盖 userDecided——approval 族与 clearPending 是盲区

v3 §1 规则「`decisionEpoch` 只在 `userDecided` 递增；`setPending` 永不递增」漏了三条**终结 pending 却不经 userDecided** 的转换：

| 路径 | 现锚点 | 缺陷 |
|---|---|---|
| `approvalDecided:270`（`conversationState.ts:262-283`） | 授权决策直置 `pending:'none'` | 授权卡 epoch=E → approvalDecided 解除（不递增）→ 模型再 `setPending('approval')` 仍 E → 迟到 `{epoch:E,kind:'approval'}` **双匹配放行、误应用到新授权卡** |
| `approvalGranted:323` | approve-files 批准清 `pending:'none'` | 同上重开合同零换代 |
| `clearPending`（`useConversationState.ts:86`，调用点 `ConversationPanel.tsx:325`） | 绕领域函数直写 `pending:'none'` | 同上 |

**修订**：递增判据由「仅 userDecided」改绑「**所有 pending→'none' 转换**」——`userDecided:171`、`approvalDecided:270`、`approvalGranted:323`、`clearPending`（后者应收敛为领域函数再叠）各 +1；`setPending` 仍**不**递增（对齐 `ADR-001` 延续语义、不破 A5/A7）。

> **v3 §1 原「approval 走 `approvalDecided`、`userDecided:209-211` 不推进确认位但仍递增」的兼容红线覆盖不到真实 approval 循环**——`userDecided` 的 approval 分支只是防御，实际不由它决策。

## 3. F-C（P1·必改）§0.1-3 落点漂移

v3 §0.1-3 写「喂 `detectUnproductiveDialogue`（`:2452-2457`）」——错。`:2452-2457` 是 `console.log('待授权中发送')` + `if(!silent)` 起始 + S7 注释。

**修订**：`detectUnproductiveDialogue` 定义 `conversationState.ts:244-259`，调用点 `ConversationPanel.tsx:2148`（import `:35`）。

## 4. F-D（P1·必改）§1 timeline 措辞自相矛盾

v3 §1 表写「`TimelineEventType` 加 `conversation.stale_input_discarded`（domain=conversation，**不扩 union 成员**）」——但 `TimelineEventType`（`timeline.ts:20-92`）**本身就是 union**；`domain` 枚举是 `TimelineEventSpec` 内的另一 union（`:96-110`），`conversation` 已在其中。且 `TIMELINE_EVENT_SPECS:116` 是 `Record<TimelineEventType,…>`，加 union 成员**强制同批加 spec 否则 tsc 报错**（双写；四轴已提示）。

**修订**：措辞改「**不扩 `domain` 枚举成员，但加 `TimelineEventType` 成员 + `TIMELINE_EVENT_SPECS` 一条**（双写强制）」。§2 与 Task 4 Step1 表述已正确，仅 §1 与之冲突。

## 5. F-E（P1·必改）队列丢标记：Task 2 单独先上会留 β 活口

Agent 3 证伪：busy 期回声经 `shouldQueueWhileBusy`（`busyGate.ts:12`，pending 已清则排队）→ 写 `pendingSendRef.current = text`（`:2447`）→ flush（`:2420`）现仅 `{text}` → **回声复活为用户通道 → β 经此路径存活**。

v3 §2 独占区把 Task 2 与 Task 3 分列、DoD 隐含 A1/A3 由 Task 2 单独成立——错。**刀一（回声退用户通道）完备性依赖队列载荷改造（Task 3 Step1）**：`echo`/`answer` 必须随 flush 恢复。

**修订**：
- Task 2 单独先上＝**部分**修好（busy 之外站点直接生效；busy 期回声经队列仍复活）。要么 Task 2+3 同批合入，要么显式登记"Task 2 先行期间队列回声活口，Task 3 后闭"。
- Agent 3 另指残留：`:2512`/`:2517` `role: silent?'system':'user'` 仍以 `silent` 判——若 §14.2 定"完全退通道"须一并 gate `role`；若定"保留可见退计数"，`role='user'` 保持即可（bubble 保留，T-FORCE-2 不破）。

## 6. 通过项

- **模型调用在 `!silent` 块之外**（`ConversationPanel.tsx:2500-2615` 公共尾 + `runChat :2604` + `finally :2614`）——把回声从用户块旁路出去**不会误伤续跑**；β 不会从"误拒毁卡"变"确认后停滞"。刀一机制在结构上成立。
- 单槽载荷改对象类型 `useRef<{text;echo?;answer?}|''>`：`:2417 !pending return` 在联合下仍正确（`''` 唯一 falsy，object 恒 truthy，收窄合法）；`:2418 =''` 合法；`DecisionAnswer`/`isAnswerToCurrent` 由 `conversationState` 导出，ConversationPanel 已有运行时 import 链 `:54`——双 tsc 可过。
- `sendRef:458` + `send:2425` 同批改已在 §1/§2 列出。
- Q2（plan 重提议 kind/epoch 双匹配放行迟到答复）属**有意**（ADR-001 延续，v3 §7 残留①已承认 kind 级粒度）；Q3（跨任务边界）覆盖——goal/resolution 边界同在 `userDecided` 内经 `:222` 递增，代次自然隔断。

## 7. 已就地修订 v3 摘要

1. 控件守卫式加 `s.pending !== 'none'` 前置（F-A）。
2. epoch 递增点从"仅 userDecided"扩到"所有 `pending→'none'`"（F-B）。
3. `detectUnproductiveDialogue` 锚点改 `conversationState.ts:244-259` / 调用 `ConversationPanel.tsx:2148`（F-C）。
4. §1 timeline 措辞改「不扩 `domain` 枚举，加 `TimelineEventType` 成员 + `TIMELINE_EVENT_SPECS` 一条」（F-D）。
5. Task 2+3 队列回声活口显式登记；`role` 判据 §14.2 关联条款补入（F-E）。
6. A6/A7/A5 措辞随守卫/递增修订同步。
