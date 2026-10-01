# 幽灵占位 / busy 同源 / 排队死信 修批方案 v2.1（Task7 裁决落地 · 已审计修订）

> **实施进度（2026-10-01）**：Task 1(RC1a) ✅ 提交 `d402e4f` 全绿 · Task 2(RC1b) ✅ 提交 `d8e6f17` 全绿 · **Task 3(RC3) ⛔ 暂停**——边缘 flush 实测破 `retry:187`（见 §5 实施发现 + §14 转裁决 5）。Task 0/4/5 未开始（Task 5 需先解 Task 3）。
> **For agentic workers:** REQUIRED WORKFLOW: implement **one task at a time**，每 Task 结束过 review gate。Steps 用 checkbox（`- [ ]`）。
> **版本链：** v1 骨架（作废）→ v2 详尽版 → **v2.1（本版，吸收双份审计 F1-F11/B1-B4/C1-C7/D1/E 后重写，见 §15 审计修订记录）**
> **审计记录：** [`docs/audits/plan-review-ghost-busy-deadletter-2026-10-01.md`](../../audits/plan-review-ghost-busy-deadletter-2026-10-01.md)
> **取代：** [`2026-10-01-ghost-busy-deadletter-fix.md`](./2026-10-01-ghost-busy-deadletter-fix.md)（v1）· [`…-fix-v2.md`](./2026-10-01-ghost-busy-deadletter-fix-v2.md) 的 v2 原文（同文件已就地升至 v2.1）
> **裁决来源：** handoff `d000006`（2026-10-01 用户）——批准 **RC1a + RC1b（仅换读取源）+ RC3**；簇 2 门闩放行口径**待 RC1a 复测后再裁**；P2 观察项 `t000068` 不修
> **根因权威：** [`uat-domain-drift-remeasure-2026-10-01.md`](../../audits/uat-domain-drift-remeasure-2026-10-01.md)（文末 RCA 节）
> **设计权威：** [`ADR-013`](../../decisions/013-partner-busy-and-silent-channel.md)（busy 边界 + silent 通道，正文不改）· 领域 [`§4.12`](../../domain/02-domain-model.md)（输入衔接＝队列）· [`ADR-012`](../../decisions/012-test-batch-then-fix.md)（测完再修）
> **四级梯度判据：** 代码 `src/domain/conversationState.ts:244-259 detectUnproductiveDialogue` + 单测 `tests/unit/conversationState.test.ts:1275,1315,1382`（**注意**：`ConversationPanel.tsx:2141` 注释与上批审计把它标成「ADR-010」是误标——`docs/decisions/010` 是多源 Provider 目录，四级梯度无对应 ADR 正文。本批不改正错误标，仅在此声明，勿据编号去找 ADR）
> **改前基线（2026-10-01 本机 WSL，HEAD 8baf919）：** L1 **703 passed / 47 files** ✅ · 双 `tsc --noEmit` **0 错** ✅ · L3 interaction **70 passed / 3 failed ❌（预存在红，CI run 36782657278 与本机逐项一致）** → 已登记 `t000069`（非本批范围）

**Goal（一句话）**：让「busy」在**产品 UI、harness、测试断言**三处回到同一事实来源，并让**每一条入队的消息都必然被送达或被记录**——消掉关单复测 8 条失败里的 6 条（簇 1 ×5 + 簇 3 ×1），且**不借机改任何设计口径**。

**范围硬边界**：只动 3 个源文件（`ConversationPanel.tsx`、`scripts-cdp/uat-lib.mjs`、`scripts-cdp/cdp-lib.mjs`，加一处 `step-reply.mjs` 同源化）+ 测试与文档。**不改** ADR、领域模型、决策卡渲染、梯度判据（`detectUnproductiveDialogue`）、门闩放行策略、`busyGate.ts`。

---

## 0. 现状机制与证据（改什么，先把它讲清楚）

### 0.1 流式占位（placeholder）生命周期 —— 簇 1 的解剖

`apps/desktop/src/renderer/ConversationPanel.tsx`（行号已逐条实读核对）：

| # | 位置 | 行为 |
|---|------|------|
| **push①** | `send()` L2494-2497 | push `{role:'assistant', content:'', status:'streaming', id:nextMsgId()}` 占位（`sid` 已在 L2492 生成） |
| **push②** | 工具轮转 L1971-1976 | 续聊前**再 push 一个新占位**，`await runChat(toolMsgs, depth+1, sid)`（外层 sid），中间 `setTimeout(50)` L1975 |
| **push③** | `retryFailedTurn()` L2744-2754 | 「重试」push 占位（**带 `toolCalls: last.toolCalls`**），L2758 才生成 `sid`，L2761 `await runChat(...)` **无 try/finally** |
| 渲染 | L2837 / L2840 / L2846-2847 | streaming → `.nf-breath`；空 content → `.nf-msg__body--thinking` + 文案 **「搭档处理中…」** |
| 正常收尾 | chunk updater L1452-1466 | `done` chunk → **从尾向前找最后一条 streaming assistant** → `status='done'`（唯一正常收尾点；更早的 streaming 永远回不到 → 必为孤儿） |
| 裸退 A | `runChat` L1997-2003（`depth > 40`） | `setWorking(false)` + `onWorkingChange?.(false)` + `setWorkingStage('就绪')` + `return`（**不碰 messages**）→ 留幽灵 |
| 裸退 B | `runChat` L2164-2179（`forced-clarify`） | `setPendingState('system_clarify')` + `tlog` + `return`（**既不碰 messages，也不释放 working**）→ 幽灵 **+（走 send/retry 时）busy 悬挂** |
| 有收尾 | `finishError` L2686-2730 | 释放 working + 末条转 `error` + 文案（对照组：证明「裸退才是漏」） |

**关键订正（审计 F1）**：裸退 B 不释放 working，今天**只**在 `send` 的 finally（L2596-2601）被兜住；`retryFailedTurn` 没有那层兜底 → 重试链撞 B = **状态栏永久「搭档处理中…」+ 幽灵**（比簇 1 更重的真 hang，非谎报）。故根因修法是 **B 自己收尾**（覆盖全部三个调用者），而不是给 `send` 打补丁。
**现场坐实**（p063 单跑 CDP DOM 探针）：状态栏=就绪、工具卡全 done、`.nf-forcedcard` 挂着，聊天流 **2 条**幽灵气泡＝push①→B 裸退、flush 后再 push①→B 裸退 的两轮累积。

### 0.2 harness 的 busy 判定 —— 簇 1 的共犯

「搭档处理中」在 DOM 里有**三个渲染源**，语义不同：

| 源 | 位置 | = busy 事实？ |
|----|------|----------------|
| 状态栏 | `MainWorkspace.tsx` L427-452（`footer.nf-statusbar[role=status]` → `.nf-statusbar__left`，innerText 实为「搭档处理中… │ 项目名」） | **是**——ADR-013.1 指定的同源锚点 |
| 消息行内联 | `ConversationPanel.tsx` L3346-3350（`working && i===messages.length-1` 时 `.nf-working`） | 是（同一 `working` 派生） |
| **占位气泡正文** | L2846-2847 | **否**（push→裸退 的永久残留，即幽灵） |

`scripts-cdp/uat-lib.mjs` 却按整页文本判定：`isModelBusy` L619-626 = `dump(page)`（`cdp-lib.mjs` L19-21，`document.body.innerText`）+ `/搭档处理中|处理中|思考中|生成中|正在回复|Streaming/i` → 命中幽灵与模型正文 → **永久假 busy** → L686-691 `skip-act + continue` 死锁 → p063/p065/p066/p060 timeout + p110 收口 FAIL。
**同族判定共 5 处**（AGENTS/ponytail：改共享判定必须清点全部调用点）：`uat-lib.mjs` L619-626（主）、L1041-1047（早停内联**复制体**）、L891-892（插话门）、`step-reply.mjs` L16-20（手工步进，靠「就绪」兜住，未受害但同源不一致）、`uat-force1.mjs` L41（legacy 探针，池路径不经过 → §11 豁免）。
时间线侧另有同一事实的孪生事件：`conversation.status_change`（发射点 L661-673，派生自同一 `working`）——Task 2 用它做同源哨兵。

### 0.3 排队（pendingSend）—— 簇 3 与观察 1-③

领域 §4.12:156 用词是「存入 pending **队列**——当前回合收口后自动发送」。实现是**单槽字符串**：

| 位置 | 行为 |
|------|------|
| L755 | `const pendingSendRef = useRef('')` ← **单槽** |
| L806 | `verifyThenResolve` 对账引导 `if (workingRef.current) pendingSendRef.current = nudge` ← **绕过 `send` 的第二写入口** |
| L2426-2438 | `send()` busy 门 → `pendingSendRef.current = text` → `return`（**赋值＝静默覆盖**）；注：入队 return 发生在 `tlog('conversation.system_nudge')` L2486 **之前** |
| L2403-2409 | `flushPendingSend`：读槽→清槽→`setTimeout(50ms)` 直送 |
| L2596-2601 | **唯一 flush 点**：`send` finally（跑在 React commit 之前，同步读槽） |

`workingRef.current` 读写点全集（不变量论证要用）：声明 L2289、effect 写 L2291、同步写 `stopGeneration` L2389、同步写 `finishError` L2699、读 L806、读 L2426、读 `retryFailedTurn` L2734。

两类结构性缺陷：**(a) 单槽覆盖**；**(b) flush 只有一个「commit 前的同步读点」**——晚到一瞬间入槽者无人继承。
`core.interaction.ts` L811-812 注释「每步必须等上一步 flush 完成再继续，**防排队覆盖丢消息**」＝测试在绕坑，不是坑已修。
附带发现（**不在本批**，§11）：`timeline.ts` L43 注册的 `dialogue.needs_human` 全仓无发射点（死事件）。

---

## 1. 设计决策与备选（每条都记「为什么不选另一个」）

| 编号 | 选定 | 备选与否决理由 |
|------|------|----------------|
| D1 占位收尾位置 | **裸退 B 内自己收尾 + 释放 busy**（A 只补收尾）——共享函数一次修好，覆盖 send/工具轮/重试三个调用者 | ① 在 `send` finally 统一扫（v2 初稿倾向）：**漏 retry 链**（L2761 无 finally，审计 F1）；② 首 chunk 才 push 占位：改 `send` 即时反馈 UX + 牵动以占位存在为同步信号的既有 L3（`factory.self.interaction.ts:27`、`core.interaction.ts:329-331`）；③ 渲染层隐藏：只遮症状，数据里仍永久 streaming |
| D2 收尾范围 | 只收尾「**本轮占位(anchor) 及其更早**」的 assistant streaming；`anchor<0` 或 anchor 非 streaming → **直接 return** | 盲扫全表（v2 初稿 `anchor<0 → prev.length-1` 回退）会删**并发链刚 push 的活占位**——其 chunk 因 updater `target===-1` 被静默丢弃（审计 B2）。更早的 streaming 必为孤儿（P3 只认最后一条），扫它们才是修幽灵 ×2 |
| D3 anchor 身份 | `roundStreamRef = useRef<{sid:number; id:string} \| null>(null)`——**id 与 sid 配对** | 单存 id（v2 初稿）不够：approval 期非 silent 直送（`busyGate.ts:12`）让 B 链在 A 链持锁期间覆盖 anchor → A 在 B 裸退时拿 B 的占位当锚点 → 误删活占位（审计 B2 实路径）。加 `roundStreamRef.current?.sid !== sid` 早退即封死 |
| D4 busy 同源 | harness 只读 `.nf-statusbar__left`（失败回退 `[role=status]`），**读不到时 fail-closed 判 busy** | ① 产品暴露 `window.__nfBusy`：为测试改产品面，未获授权，且状态栏已是 `role=status` 权威；② 静默 `''`→判 idle（v2 初稿）：选择器失效时会在真 busy 期放行动作、污染取证（审计 F3）→ 改 fail-closed + WARN |
| D5 排队触发点 | flush 只在 **`working` true→false 边缘**（`[working]` effect 内，先同步 ref 再 flush） | ① 保留 `send` finally 的同步读点（v2 初稿「两触发点都留」）：commit 前读＝死信本源，留着只是重复；② 轮询 watcher：新语义且更费；③ 一次全部出队：见 §5.1 自愈论证（不需要，但也不会出事） |
| D6 写入路径 | **删 L806 直写槽特例**，一律 `void sendRef.current({silent:true,text:nudge})` | L806 的存在理由是 p000125「勿 silent-interrupt 打断核验轮」——ADR-013.3 已把「busy 时 silent＝排队」做进 `send`（L2426-2438），特例退化成**第二写入口**。审计 F2 曾列为可否决项 → **2026-10-01 用户已裁接受**（`d000008`） |
| D7 簇 3 归因 | **先取证再改**（Task 0 三假设判别表） | RCA 原文自带「疑…」；且 `system_nudge` tlog 位于入队 return **之后**（L2486 vs L2437），与「入槽死信」并不自洽——不改清楚就动手＝修错因风险 |

---

## 2. Task 0 · 前置取证（簇 3 归因判别，**不改码**）

| 假设 | 机制 | 判别签名（timeline / DOM） | 修法 |
|------|------|---------------------------|------|
| **H3a** 排队死信（RCA 现口径） | nudge 于 L806/L2435 入槽，晚于 finally 同步读点 | `conversation.system_nudge` **缺失**（入队先 return）＋无 `assistant_start`＋无新气泡＋`status_change:ready` | D3/D5/D6 |
| **H3b** 独立授权续聊链收口 | `useToolApproval` L168-175 的 setTimeout 续聊链**不经 `send` 包体**→ 该链收口时旧代码根本没有 flush 点 | 同 H3a，但 nudge 前该链有 `tool.executed` / `execution.*` 收尾 | 同 D5（边缘触发天然覆盖——这正是选「边缘」的理由） |
| **H3c** 裸退 B 吞 nudge | 计数器已 ≥ 阈值 → 之后每条 send 都在 B 裸退（连 silent 协议 nudge 也吞） | `assistant_start`（L2132 先于判据 L2142）**＋** `dialogue.forced_clarify` **反复成对**＋`.nf-forcedcard` 常驻 | **停下汇报**（属 ADR-010 误标所指「silent 是否参与无进展计数」口径，非本批授权） |

- [ ] **Step 1** Mac 取 p119 timeline：`Host mac`（`sin@192.168.31.229`，坑 p000131）→ `NF_TEST_USERDATA/logs/timeline-*.jsonl`，按 p119 seq 段导出。
- [ ] **Step 2** 若已被 Mac `/tmp` 清理（坑 p000137）→ 单跑复现：`uat-G-persona.mjs --from-pool p119`（seed=12 池成员），停滞时 CDP evaluate 读 DOM（坑 p000139；取证脚本须在项目目录内跑，坑 p000138）。**证据取不到就不许猜**：Task 3 降级为「仅做结构性改造 + 审计注明未证实」（R5）。
- [ ] **Step 3** 结论写 §14；据此勾 Task 3 分支。**Gate**：H3a/H3b → 进 Task 3；H3c → **停并汇报**。

---

## 3. Task 1 · RC1a —— 裸退自收尾（覆盖三调用者）

**独占区**：`ConversationPanel.tsx` —— 新 `roundStreamRef` + 新 helper（放 `finishError` 附近）+ 三个 push 点各记 anchor（push① L2494-2497 / push② L1971-1976 / push③ L2744-2754）+ 两处裸退（L1997-2003 / L2164-2179）。**不碰** `send` finally 的 flush 行（属 Task 3）、`finishError`、`maybeContinue` 判定。

### 3.1 不变量（写完拿它自证）

> **I1** 任一时刻 `status==='streaming'` 的 assistant 消息中，**只有最新一条**可能被 chunk updater 收尾（L1457-1465 从尾向前只取第一条命中）→ 更早的必为孤儿。
> **I2** `runChat` 每条 `return` 要么已进过 `streamChat`（占位交给 chunk/`finishError`），要么**自己收尾并释放 busy**。今天违反 I2 的是 A（缺收尾）与 B（缺收尾＋缺释放）。
> **I3** anchor 的 `(sid,id)` 配对是 D3 的安全边界：`sid` 不匹配＝该链已被 stop/新会话接管 → 一律不动。

### 3.2 Steps

- [ ] **Step 1（先红）** `tests/interaction/forcedClarify.interaction.ts` 追加 `T-FORCE-4：强制卡弹出后不得残留流式占位（RC1a 幽灵）`——**注意：该文件现仅 T-FORCE-1..3，新用例编号 4**（审计 F9/A）。复用 T-FORCE-1 的起手（`installMockBridge({project:'none', script:loopScript()})` + `startFromScratch` + 三次文本回复，同 L20-31）后：
  ```ts
  await expect(page.locator('.nf-forcedcard')).toBeVisible({ timeout: 15000 })
  await expectChatReady(page)                                                          // helpers/assertions L74-76
  await expect(page.locator('.nf-msg--assistant .nf-msg__body--thinking')).toHaveCount(0) // L2840
  await expect(page.locator('.nf-msg--assistant .nf-breath')).toHaveCount(0)              // L2837（后代选择器成立）
  ```
  **改前必红论证**（审计 C5 已核）：`repeated>=3 → forced-clarify`（`conversationState.ts:256`），与已通过的 T-FORCE-1 同一 mock 路径 → 确实进 B 裸退 → 占位空且 streaming、`send` finally 只释放 busy 不清占位 → 幽灵存在。
  **禁止弱化**：若实测改前即绿，视为「L3 未复现裸退形态」→ 记审计并在 Mac 回归轮用 DOM 探针兜，**不得改成弱断言放行**。
- [ ] **Step 2** anchor 记录（三处 push 点，`Msg.id` 由 `nextMsgId()` L310 保证会话内唯一）：
  ```ts
  const roundStreamRef = useRef<{ sid: number; id: string } | null>(null) // RC1a：本轮占位（id 与 sid 配对——D3）
  ```
  · push①（L2492 后）：`const placeholderId = nextMsgId(); roundStreamRef.current = { sid, id: placeholderId }` 再 push 该 id。
  · push②（L1971-1974）：同样先取 id 记 `{ sid, id }`（`sid` 为 `runChat` 形参，外层链同 sid）。
  · push③（`retryFailedTurn`）：`const placeholderId = nextMsgId()` → 用于 L2746-2753 字面量 → **L2758 生成 sid 之后** `roundStreamRef.current = { sid, id: placeholderId }`。
- [ ] **Step 3** helper（`Msg` 见 L121-129；`messagesRef` L304-307 由 commit 后 effect 同步——push②→B 之间有 L1975 的 50ms 等待兜住，注释里点破）：
  ```ts
  // RC1a（关单复测簇1）：runChat 裸退前收尾本轮占位并释放 busy。空占位不收尾 → 永久渲染「搭档处理中…」
  // （L2846）而状态栏已就绪 → 用户看到假忙、UAT busy 判定被毒化；不释放 busy → 重试链（retryFailedTurn
  // L2761 无 finally）撞裸退时真·悬挂。范围＝本轮 anchor 及其更早的孤儿（不变量 I1）；anchor 之后不碰。
  const finalizeOrphanStream = (sid: number): void => {
    const round = roundStreamRef.current
    if (streamingSidRef.current !== sid || round?.sid !== sid) return // 已被 stop/新会话接管 或 anchor 属别链（D3）
    const prev = messagesRef.current
    const anchor = prev.findIndex((m) => m.id === round.id)
    if (anchor < 0) return // anchor 不在表内——不猜范围（D2）
    const isStreaming = (m: Msg): boolean => m.role === 'assistant' && m.status === 'streaming'
    if (!isStreaming(prev[anchor])) return // 本轮已被 done chunk 收尾——无事可做
    const isGhost = (m: Msg): boolean => isStreaming(m) && !m.content.trim() && !(m.toolCalls?.length ?? 0)
    const next = prev
      .map((m, i) => (i <= anchor && isStreaming(m) && !isGhost(m) ? { ...m, status: 'done' as const } : m))
      .filter((m, i) => !(i <= anchor && isGhost(m)))
    messagesRef.current = next
    setMessages(next)
  }
  ```
  语义：有内容或有工具卡 → 转 `done`（卡片不丢，`ToolCallMsg` 渲染依赖 `m.status`）；空且无卡 → 丢弃幽灵（引导文案由卡本身承载）。对照先例：挂载恢复也一律 `status:'done'`（L335-343）。
- [ ] **Step 4** 接入两处裸退：
  · **B（`forced-clarify` L2179 前）**：`finalizeOrphanStream(sid)` + `setWorking(false)` + `onWorkingChange?.(false)` + `setWorkingStage('就绪')` → **decision-pending 非 busy**（ADR-013.1），三调用者一次覆盖（D1）。
  · **A（`depth > 40` L1999 前）**：只补 `finalizeOrphanStream(sid)`（busy 释放该行已有）。
- [ ] **Step 5（自证 I2）** 逐条核 `runChat` 体内所有 `return`（不只 grep 计数）：A/B 已收尾、`finishError` 路径有收尾、`streamChat` 之后交给 chunk updater；把每条的归属写进 helper 注释或本文件 §14。同族 push 点计数须与 Step 2 的三处一致（`grep -n "status: 'streaming'" src/renderer/ConversationPanel.tsx`）。
- [ ] **Step 6** 验证：`npx vitest run`（703 基线不变，不新增单测——纯组件时序）→ `npx playwright test --project=interaction tests/interaction/forcedClarify.interaction.ts`（T-FORCE-1..4 绿）→ 双 `tsc --noEmit` → `npx eslint .`。
- [ ] **Step 7 Commit**：`fix(renderer): release working and finalize round placeholder on forced-clarify/depth bail (RC1a)`

**Done when**：T-FORCE-4 绿；`.nf-forcedcard` 出现时状态栏「就绪」且消息流零 `--thinking`/`.nf-breath`；T-FORCE-1..3 与 `factory.self`（依赖占位存在的同步点）不回归。
**回滚**：单 commit revert（纯追加 helper + 三处 anchor + 两处调用）。
**残留风险**：重试链撞 B 的形态 L3 难以廉价构造（需 error 气泡 + 计数器已 ≥ 阈值）→ 由 I2 自检 + Mac 回归轮观测兜（不为它造脆断言）。

---

## 4. Task 2 · RC1b —— harness busy 判定状态栏同源

**独占区**：`scripts-cdp/cdp-lib.mjs`（新 helper）、`scripts-cdp/uat-lib.mjs` L619-626 / L1041-1049 / L891-892、`scripts-cdp/step-reply.mjs` L16-20。
**不动**：L686-691 门闩本体（`busy → skip-act + nudge + continue`）、半门闩禁令、决策卡/插话/探针**放行策略**（簇 2＝下一刀）。

- [ ] **Step 1** `cdp-lib.mjs`：
  ```js
  // busy 同源（ADR-013.1）：只读状态栏。禁整页 innerText——幽灵占位与模型正文都会写出「搭档处理中/生成中」，
  // 幽灵即假 busy（RC1b 根因）。innerText 实为「搭档处理中… │ 项目名」，故取子串匹配。
  export async function statusText(page) {
    for (const sel of ['.nf-statusbar__left', '[role="status"]']) {
      try {
        const t = await page.locator(sel).first().innerText({ timeout: 2000 })
        if (t) return t
      } catch {
        /* 试下一个选择器 */
      }
    }
    throw new Error('busy-source-missing: 状态栏不可读') // 不静默当 idle（D4 fail-closed）
  }
  ```
- [ ] **Step 2** `uat-lib.mjs` 四处换源：
  ① `isModelBusy` → `try { return /搭档处理中/.test(await statusText(page)) } catch { console.log('  WARN busy-source-missing → 保守判 busy'); return true }`。
  ② L1041-1047 早停内联复制体 → `const modelBusy = await isModelBusy(page)`（**去重复**）。
  ③ L891-892 插话门 → `if (/搭档处理中/.test(await statusText(page)))`。
  ④ `step-reply.mjs` L16-20 → `!(/搭档处理中/.test(await statusText(page)))`（同源化；`已发送`/`就绪` 判定保留）。
- [ ] **Step 3** 语义注释（防后人放宽）：状态栏三态与 ADR-013 busy 表一致——`搭档处理中…`＝在飞（含工具执行/续链，`maybeContinue` 期间 working 保持 true L1835-1839）；`有操作待你批准`／卡常驻的 decision-pending＝**非 busy**；`就绪`＝idle。
- [ ] **Step 4 同源哨兵（观测件，不改判定）** `autopilot` 首轮比对：状态栏 busy ⇔ `readLatestTimeline()` 最近一条 `conversation.status_change.status`（发射点 `ConversationPanel.tsx:661-673`）不一致 → 打印 `WARN busy-source-drift` 并计入审计，供发现「状态栏文案被改动」这类静默致盲（F11）。
- [ ] **Step 5** 静态自检（v2 原写法是坏命令——审计 D1：`|` 在 BRE 里是字面量）：
  ```bash
  node --check scripts-cdp/cdp-lib.mjs && node --check scripts-cdp/uat-lib.mjs
  grep -rnE '思考中|生成中|正在回复|Streaming' scripts-cdp/*.mjs   # 期望：仅 uat-force1.mjs:41（§11 豁免）
  ```
- [ ] **Step 6 Commit**：`test(uat): read busy from statusbar single source, drop whole-page regex (RC1b)`

**Done when**：harness 无整页 busy 正则；豁免项外 `grep` 0 命中；（加强验证，Mac）临时 revert Task 1 造出幽灵后跑一次 tier 快测——仍不误判 busy。
**转裁决项**：状态栏**文案子串**成为 harness 契约（新跨层耦合）→ 建议后续以 `data-nf-status` 属性锚定；本批不引入（D4①）。

---

## 5. Task 3 · RC3 —— 排队多槽 + idle 边缘 flush

> **⚠ 实施发现（2026-10-01，Task 3 实测后回写）：D5「idle 边缘 flush」论证被证伪，Task 3 暂停待裁决。**
> 实装「flush 触发点从 send-finally 移到 `[working]` 边缘」后，全量 L3 出现**新回归**：
> `retry.interaction.ts:187`（计划确认后 service 自动续跑一次，A-029）由**绿转红**——「自动续跑成功」计数 1→2（数组版 1→4）。
> CDP/window 打点取到真实派发序：`enqueue 目标 → enqueue 执行(覆盖) → flushPOP 执行 → enqueue 执行 → flushPOP 执行`
> ⇒ 边缘触发在 **confirm-card + auto-retry 的多回合链**上会**多次 false 边缘**，每次重派同一条确认文本、各起一个模型回合。
> 旧 send-finally flush 只在整链收口时 flush 一次，故无此问题。**这不是测试脆，是边缘 flush 的真行为回归。**
>
> **连带发现**：数组化（多槽）会把预存在红 `core.interaction.ts:685`（根因3 同事件 send）**修绿**——但数组化＝`t000068`（P2 排队可见性·静默覆盖），本轮用户未批。
> ⇒ `t000067` 的「死信」与 `t000068` 的「覆盖」在实现上**解不开**：真正修死信要么用边缘 flush（破 retry），要么用数组（触 t000068）。
>
> **当前处置**：Task 1(RC1a) + Task 2(RC1b) 已各自独立提交、全绿（L1 703 / 双 tsc 0 / L3 失败集合＝基线 3 红，无新增）。
> Task 3 工作树改动**已回退**（保留旧 send-finally flush，retry:187 复绿）。死信修法等裁决（见 §14 转裁决 5 + handoff）。

**独占区**：`pendingSendRef` L755、写入点 L806 / L2435、`flushPendingSend` L2403-2409、working effect L2289-2292、`send` finally L2596-2601。
**前置**：Task 0 Gate 判 H3a/H3b（H3c 停）。

### 5.1 为什么「边缘」而非「finally 补一处」（订正版论证——审计 E/B1）

> 入队当且仅当 `workingRef.current === true`（L2426；L806 经 D6 删除后不再存在第二写入口）。`workingRef` 的写点只有三处：`[working]` effect L2291、`stopGeneration` L2389、`finishError` L2699。
> 后两处**同步清 ref 时都紧跟一次 `setWorking(false)`**（L2390 / L2700）→ busy 窗口的每一次结束都表现为一次 `working` true→false 提交，而该提交的 effect 里**先 `workingRef.current = false` 再 flush** ⇒ 任何入队严格早于该 flush，「晚到一瞬间」的死信窗口在结构上不存在。旧代码的读点在 commit **之前**，所以才漏。
> **重复 flush 是否危险**（v2 初稿 D4③ 称会「两条链 sessionRef++ 互杀」——审计 E 判为**论证错误**，此处订正）：不危险。`flushPendingSend` 每次只取一条并 `setTimeout(50ms)`；被抢占/重入时最多让第二条 `send` 撞进另一条链，而 `send` 自身仍会走 L2426 排队判定把文本重新入队 → **自愈、不丢**。故「多触发点」不需要，但「万一有」也不会造成损失——真正的理由只有一个：**覆盖非 `send` 链的收口**（H3b 的独立授权续聊链）与 commit 时序正确性。
> **审批卡挂着时 flush**（审计 F4）：边缘 flush 触发 `send` 时若 `pending==='approval'` 且非 silent → `busyGate.ts:12` 直送 → `sessionRef++` 使旧授权链作废。这与「用户此刻自己打字」完全同路径、同语义，属 ADR-013.2 既有例应的延伸，非新口径；Task 5 观测项盯它。

### 5.2 Steps

- [ ] **Step 1（先红）** 新建 `tests/interaction/queue.interaction.ts`。**busy 窗口的确定性构造**（审计 C4：`streamDelay` 撑不开窗口——mock `streamChat` 立即 ok，窗口≈800ms done 超时 + 500ms `maybeContinue` 首 tick ≈1.3s 封顶，与 `streamDelay` 无关；`approval:'all'` 也不可用——`busyGate.ts:12` 让非 silent 用户在审批期直送不排队）：用 **`approval:'none'` + 多轮自动执行的只读工具脚本**拉长窗口：
  ```ts
  import { test, expect } from '@playwright/test'
  import { installMockBridge, chunk, toolCall } from './mockBridge'
  import { compose, startFromScratch, sendChat } from './scenarios'
  import { expectChatReady, expectUserMsg, expectLastUserMsg } from '../helpers/assertions'

  // 每轮 read（approval:'none' → 自动执行、pending 恒 none）→ 续链持续在飞 → busy 窗 ≥1s 可加长
  const busyScript = () => compose(...Array(8).fill([[toolCall.read('a.txt'), chunk.done()]]))

  // T-QUEUE-1（RC3·单槽覆盖）：busy 期连发两条 → 两条都落地、顺序保持（改前：甲被乙静默覆盖）
  test('T-QUEUE-1: busy 期两条排队消息都不丢', async ({ page }) => {
    const h = await installMockBridge(page, { project: 'none', approval: 'none', script: busyScript(), capture: { chatCount: true } })
    await startFromScratch(page, '做一个待办清单页面')
    await sendChat(page, '排队消息甲')
    await sendChat(page, '排队消息乙')
    await expectUserMsg(page, '排队消息甲')       // 存在性（不可用 last——审计 C3）
    await expectLastUserMsg(page, '排队消息乙')   // 乙必须是最后一条（顺序保持）
    await expect(page.locator('.nf-msg--user')).toHaveCount(3) // 启动 initialPrompt 也进气泡（L677-683 + L2483）→ 1+2
    expect(await h.chatCount()).toBeGreaterThanOrEqual(3)      // capture 开关必开（审计 C1）
  })
  ```
- [ ] **Step 2** 系统文案不入用户气泡（订正：v2 用甲/乙测这条**无效**——它们本就不是 nudge 文本，审计 C2）：
  ```ts
  // T-QUEUE-2（RC3·A5）：busy 期入队一条「系统提示：…」→ flush 后不得出现用户气泡（silent 由 isSystemNudgeText 重判）
  await sendChat(page, '系统提示：verification 证据只能是只读 shell 命令（如 ls、curl）。')
  // 断言：回合收口后 .nf-msg--user 计数不因这条增长；timeline 层由 Mac 轮覆盖 system_nudge
  ```
- [ ] **Step 3（H3b 分支才做）** 独立授权续聊链收口的 flush 覆盖：L3 需 mock 授权卡时序才能确定复现 → 若构造不出，本用例标 `test.fixme('H3b 由边缘触发覆盖，L3 复现待 mock 授权链时序——Mac 回归轮以 timeline assistant_start 取证')`，**不许写假断言**。
- [ ] **Step 4** 数组化 + 单触发点：
  ```ts
  const pendingSendRef = useRef<string[]>([]) // RC3：多槽队列（原单槽赋值＝静默覆盖；领域 §4.12 用词本就是「队列」）

  const flushPendingSend = () => {
    // 一次一条：本条把 working 拉回 true，其余等下一次 idle 边缘（重复触发也不丢——§5.1 自愈）
    const [next, ...rest] = pendingSendRef.current
    if (!next) return
    pendingSendRef.current = rest
    // 入队者已保证非空（send L2415-2416 trim 后 return）；silent 由 send 内 isSystemNudgeText 重判（systemNudge.ts:2 三前缀）
    setTimeout(() => void sendRef.current({ text: next }), 50)
  }
  ```
  ```ts
  const workingRef = useRef(false)
  useEffect(() => {
    workingRef.current = working
    if (!working) flushPendingSend() // RC3：idle 边缘 flush（旧唯一读点在 send finally，跑在 commit 前 → 晚入槽死信）
  }, [working])
  ```
  · L2435 → `pendingSendRef.current.push(text)`。
  · **删** L2596-2601 finally 里的 `flushPendingSend()`（留一行注释指向边缘触发，防「为什么不在这里 flush」再被问一遍）。
  · **删** L806-807 特例，改为单行 `void sendRef.current({ silent: true, text: nudge })`（D6）。
- [ ] **Step 5** 时序依赖排查（改 flush 点后必跑）：`stopGeneration` L2371-2393、`finishError` L2699-2702、`retryFailedTurn` L2734 门、`useToolApproval` L168-175 独立续聊链；重点看 `core.interaction.ts` L811-836（坑 63 时序）与 `retry.interaction.ts`。
- [ ] **Step 6** 验证：`npx vitest run`（703 + `busyGate.test.ts` 不动）→ 全量 interaction → 双 tsc → `npx eslint .`（顺带删 v2 样例里未使用的 `compose/goalConfirm` import，审计 C6）。
- [ ] **Step 7 Commit**：`fix(renderer): queue pending sends in an array and flush on idle edge (RC3)`

**队列上限**：`ponytail:` 注明——无界数组，实际上界由两个写入者各自的计数门约束（`evidenceGuideCountRef` / harness `sentTexts`）；堆积成患再 cap，本批不预置。
**Done when**：T-QUEUE-1 改前红、改后绿；T-QUEUE-2 证明系统文案不入用户气泡；无排队消息丢失。

---

## 6. Task 4 · 本地验证链（**串行**——坑 p000114 并发致 L3 假失败）

**闸门口径（订正——审计 F5/F6/基线实测）**：改前 L3 即 **70 passed / 3 failed**（`cards-from-decision-content:440`、`core.interaction:685`、`core.interaction:1859`；CI 36782657278 同三项，非 WSL 特有，已登记 `t000069`＝预存在红，不属本批）。故 gate ＝ **不新增失败 + 新增用例绿**，不是「全量全绿」。

- [ ] **Step 0** `env -u NODE_ENV npx tsc -p tsconfig.main.json --noEmit`（补基线；tsconfig 已核 0 错）
- [ ] **Step 1** `env -u NODE_ENV npx vitest run` → **≥703 passed，0 failed**
- [ ] **Step 2** 双 `tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` → **0 错**
- [ ] **Step 3** `npx playwright test --project=interaction` → **passed ≥70 且 failed 集合 ⊆ {上述 3 项}**；新增 T-FORCE-4 / T-QUEUE-1 / T-QUEUE-2 全绿
- [ ] **Step 4** `npx eslint .` → 0 error、warning 数不增；`npx prettier --check`
- [ ] **Step 5** `python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py" check` → OK
- [ ] **Step 6** 记录：若那 3 项预存在红因本批**转绿**（同处 busy/排队语义）→ 写进 §14 并在汇报里说明，**不得顺手 close**（裁决权在用户）
- **L5 视觉**：本批**不跑 `--update-snapshots`**（坑 p000136/K8——基线宿主只允许 macOS）。若占位移除触到 visual 断言 → 记 §14 留 Mac 处理。

## 7. Task 5 · Mac 回归轮（另开，**只记不改**——ADR-012）

- [ ] 传输：`git diff` + scp 补丁直传（坑 p000119/p000126/p000131）
- [ ] 构建：Mac `npm run dist`（坑 p000116）；**asar grep**：`finalizeOrphanStream` / `roundStreamRef` / `pendingSendRef.current.push` / `statusText`
- [ ] 前置体检：`/tmp/nf-uat-main3r/node_modules/.bin` 在否（坑 p000137）；DDG/Keenable 出口（坑 p000132/p000133）
- [ ] 跑：`NF_UAT_SEED=12 bash scripts-cdp/run-uat-persona-pool.sh`（**同 seed 便于逐条对照**）+ `bash scripts-cdp/run-uat-tiers.sh`
- [ ] 对照表写进 `docs/audits/uat-ghost-busy-remeasure-2026-10-<dd>.md`：

  | 上批失败 | 簇 | 本批期望 | 仍失败时要回答的问题 |
  |----------|----|----------|----------------------|
  | p063 p065 p066 p060 | 1 | resolved 或新形态 | 幽灵是否真被收尾（DOM 探针 `--thinking` 计数）？另有裸退路径？ |
  | p110 | 1（收口卡形态） | resolved | 若非 B 路径产生的幽灵 → 记新叶因，不临修 |
  | p035 p098 T4 | 2 | **仍可能失败（口径未改＝预期内）** | 采集 busy 真/假比例 → 簇 2 裁决证据 |
  | p119 | 3 | resolved | 指明命中 H3a/H3b/H3c |
  | 审批卡期 flush | 3 | 观测 | 是否出现「直送作废旧授权链」的用户可感异常（§5.1 F4） |
- [ ] 红线 violations 仍须 =0（整批 16 条含 T1-T4）
- [ ] 汇总 → 汇报 → **等裁决**（含簇 2 口径）。硬闸未达标时本批完成态＝「汇总 + 等待裁决」，**不是**「修到绿」。

## 8. Task 6 · 文档与记忆回写（**全部经单一写入口**——AGENTS 规则 4）

- [ ] `docs/tests/coverage-matrix.md`：加 `RC1a→T-FORCE-4`、`RC3→T-QUEUE-1/2`、`RC1b→Mac 池（无 L1/L3 层）`三行
- [ ] 坑 p000125 改写：**必须** `handoff edit p000125 --detail/--summary`（CLI 写，勿手改 jsonl）——机制收敛为「一律走 `send` 排队 + idle 边缘 flush」，删「写入 pendingSendRef 等 finally flush」的实现细节
- [ ] 决策指针：`handoff` 里 d000006 正文指向 **v1** 路径 → 用 CLI 更新为 v2.1 路径（防后人按旧链接执行）；审计 `uat-domain-drift-remeasure-2026-10-01.md` 末尾加指针行（不回改 RCA 正文）
- [ ] `t000065/066/067` 走 **close 流程**（须带 outcome + 回归轮证据）；`t000069`（预存在红）与状态栏文案耦合（`data-nf-status` 锚定）作为**待裁决**保留
- [ ] 每次改动后跑 `handoff check`

---

## 9. 影响面清单（谁依赖被我动的行为）

| 依赖方 | 依赖点 | 本批影响 | 处置 |
|--------|--------|----------|------|
| `core.interaction.ts` L811-812（坑 63 注释） | 「点卡 send 会被排队延迟，每步等 flush 完成」 | flush 由「finally 同 tick」→「commit 后边缘」，延后一个渲染 tick | 全量跑；超时则调该步等待，不改机制 |
| `factory.self.interaction.ts` L24-27 / `core.interaction.ts` L329-331 | **以占位存在为同步信号**（`waitStreaming`） | 占位在「在飞期」仍存在（RC1a 只清裸退孤儿）→ 不破 | Task 4 Step 3 覆盖 |
| `retry.interaction.ts` / `retryFailedTurn` L2734 | `workingRef` 同步清 + `setTimeout(0)` 重试 | 与边缘 flush 不冲突（§5.1）；新增 anchor 记录 | 全量跑 |
| `tests/visual/*.visual.ts` | `.nf-statusbar` 文本断言（就绪/待你批准） | 状态栏未改；消息流少一条永久占位 | L5 留 Mac；WSL 禁 update（K8） |
| L4 e2e（`npm run e2e`，依赖 `/tmp/nf-e2e-test`） | 真实模型全链 | 占位收尾 + 队列语义改动 | 本批不强制（Mac UAT 覆盖更全），异常再补 |
| `useToolApproval` L168-175 独立续聊链 | 收口时 `setWorking(false)` | **新增 flush 覆盖**（旧代码此链无 flush 点＝H3b） | T-QUEUE-3 fixme / Mac 取证 |
| `busyGate.ts` + `busyGate.test.ts` | ADR-013 排队判据 | **不动**（本批只改「入队后怎么存 / 何时 flush」） | 单测须仍绿 |
| `domain/agentLoop.ts` `decideProgressGuarantee`/`shouldStopContinuation` | — | 不触碰 | — |

## 10. 风险登记

| # | 风险 | 触发条件 | 缓解 / 回滚 |
|---|------|----------|-------------|
| R1 | helper 误删并发链活占位 | 另一链在 anchor 之后 push（`send` 在 `acquireChain` **之前** push，L2494 vs L2588） | D3 `(sid,id)` 配对 + `anchor<0/非 streaming` 早退 + 只扫 `i<=anchor`（I1/I3）；T-FORCE 全量 + Mac 真实点击 |
| R2 | B 裸退新增 `setWorking(false)` 与 `send` finally 双释放 | 走 send 的 forced-clarify | 幂等（同值 setState + 同 stage），且语义＝decision-pending 非 busy（ADR-013.1） |
| R3 | 边缘 flush 在审批卡挂着时直送 → 旧授权链作废 | §5.1 F4 | 与用户此刻手打同路径同语义；Task 5 观测列盯 |
| R4 | 队列一次一条 → 多条排队跨多回合 | 用户连发 ≥2 | 设计即如此（每条各得一个回合）；DoD 不要求同回合并发 |
| R5 | p119 归因猜错 / 证据不可得 | Mac `/tmp` 清理且复现不出 | Task 0 Step 2；仍不可得 → Task 3 只做结构性改造并在审计注明「未证实但机制更稳」，**不声称修好 p119** |
| R6 | 簇 2 未修 → 回归仍 FAIL 被误读为「RC1b 无效」 | p035/p098/T4 | §7 对照表预写「本批期望」，逐条区分；A8 已注记 |
| R7 | 状态栏文案变动静默致盲 | harness 依赖子串「搭档处理中」 | D4 fail-closed + Step 4 同源哨兵 WARN；长期锚定 `data-nf-status`（转裁决） |

## 11. 明确不做（防顺手扩）

| 项 | 为什么不在这 |
|----|--------------|
| 簇 2 busy 门闩放行决策卡点选/插话/探针 | 用户裁决「先只做 RC1a 再定」 |
| 排队即显气泡 /「排队中」指示（`send` 非 silent 分支 L2483 才 push 用户气泡） | `t000068` P2 未获裁决 |
| `ask_user` 卡已选高亮 | 同上 |
| 产品暴露 busy test hook / `data-nf-status` 锚点 | 状态栏已 `role=status`；锚定属跨层契约变更，转裁决 |
| `uat-force1.mjs:41` 的 `.nf-working`/`text=思考中` | legacy 单点探针，池路径不经过 |
| `dialogue.needs_human` 死注册（有事件名无发射点） | ADR-010 误标所指的三级兜底实现缺口，独立议题 |
| `ConversationPanel.tsx:2141`「ADR-010」误标订正 | 纯注释改动也要占一个 commit，且涉及多份历史审计口径 → 与 d000002「设计动刀门槛」一并下轮处理 |
| `pendingSendRef` 有界化 / silent 与用户分队优先级 | R4 已论证；预置抽象属 YAGNI |

## 12. DoD / 验收矩阵（一条断言一个可跑证据）

| 断言 | 层 | 命令 / 选择器 | 现状 |
|------|----|-------------|------|
| A1 强制卡出现时消息流无流式占位 | L3 | `.nf-msg--assistant .nf-msg__body--thinking` count 0 + `.nf-breath` count 0 | 待新增 **T-FORCE-4** |
| A2 有内容/有工具卡的占位不被删除 | L3 | `.nf-toolcall--done` 计数（Task 4 Step 0 先记基线数）| 既有 `core.interaction` 断言，须仍绿 |
| A3 harness 无整页 busy 正则 | 静态 | `grep -rnE '思考中\|生成中\|正在回复\|Streaming' scripts-cdp/*.mjs` → **除豁免项 `uat-force1.mjs:41` 外 0 命中** | 待 Task 2 |
| A4 排队多条不丢、顺序保持 | L3 | T-QUEUE-1（`expectUserMsg(甲)` + `expectLastUserMsg(乙)` + 用户气泡 3）| 待新增 |
| A5 系统文案排队后不进用户气泡 | L3 | T-QUEUE-2 | 待新增（v2 原样例无效，已订正） |
| A6 非 `send` 链收口也 flush | L3 fixme / Mac | T-QUEUE-3 或 p119 timeline `assistant_start` | 依 Task 0 结论 |
| A7 红线 violations = 0 | Mac | `runRedLines(ev)` | 上批已 0，须保持 |
| A8 硬闸 `pass≥10/12` + 收口失败=0 + 环境失败≤2 + T1–T4 全绿 | Mac | 池 + tiers | 上批 4/12 · T4 挂；**注**：簇 2 三条（p035/p098/T4）口径未改 → 若仍失败按 ADR-012 **停等裁决**，不判 RC1b 无效（F5） |
| A9 L1 703/47 绿、双 tsc 0 错、eslint 0 err | L1/L2 | Task 4 | 基线已核 |
| A10 L3 无**新增**失败（预存在 3 红除外） | L3 | Task 4 Step 3 集合比对 | 基线 70/3（`t000069`） |

## 13. 提交与批次切分

单 commit 可独立 revert（Conventional Commits，走 lefthook→lint-staged，**不 `--no-verify`**）：
1. `fix(renderer): release working and finalize round placeholder on forced-clarify/depth bail (RC1a)`
2. `test(uat): read busy from statusbar single source, drop whole-page regex (RC1b)`
3. `fix(renderer): queue pending sends in an array and flush on idle edge (RC3)`
4. `docs: coverage matrix + pitfall p000125 sync for RC1a/RC1b/RC3`
5. 回归轮：`docs: ghost-busy-remeasure (record only, ADR-012)`

## 14. 待办转裁决 / 取证结论表（执行时填，勿预填）

**转裁决（2026-10-01 用户裁定，见 handoff `d000008`）**
1. ~~D6 删 L806 特例~~ → **已裁：接受**。统一走 `send` 的 busy 排队门，本批执行。
2. 状态栏**文案子串**成为 harness 契约 → 是否后续以 `data-nf-status` 锚定（R7/F11）。**仍待裁**。
3. ~~`t000069` 预存在 3 红 L3~~ → **已裁：本批后紧接另开修批**。本批回归轮先采集这 3 例是否意外转绿以据以拆单；**本批不得顺手改/关这 3 例**。
4. 簇 2 门闩放行口径（依回归轮 busy 真/假比例）。**仍待裁**。
5. **【实施新增·阻塞 Task 3】RC3 死信修法**：边缘 flush 破 `retry:187`（实测多派发一回合），数组化触 `t000068`（未批）。三选一：
   (a) **换更外科的死信修法**——保留 send-finally flush，仅补「最终 idle 且未在途」的去重边缘 flush（仍需回归验证不破 retry）；
   (b) **并入 t000068**——批准数组化（顺带修绿 core:685），接受 retry:187 断言需随新 flush 语义调整（**改测试须你点头**）；
   (c) **本批不做 RC3**——死信留 p119 单独取证后再定（RC1a 修好簇1后，p119 形态可能已变，先复测再判）。
   **建议 (c)**：簇1 已修，p119 是否仍复现未证实（Task 0 取证被 Mac `/tmp` 清理风险挡住）；先跑回归轮看 p119 现状再决定不为一条未证实死信引入 flush 回归。

**取证结论**

| 项 | 结论 | 证据 |
|----|------|------|
| p119 命中假设（H3a/H3b/H3c） | **未取证**（Mac `/tmp` 已清，key-keep/worktree/日志全没；重建需 bundle 传输 + `npm run dist` + 真实模型花费 → 待授权）。仅代码侧排除 **H3c**：`assistant_start`(L2132) 先于 `forced-clarify` 判据(L2142)，p119 记录为「无 assistant_start」⇒ 非 H3c | `ssh mac ls /tmp/nf-*` → no matches |
| 裸退 I2 自检逐条归属（Task 1 Step 5） | `runChat` 内 5 处 return：depth>40 ✅自收尾；forced-clarify ✅自收尾+释放 busy；`!key` / `!res.ok` / catch → 均走 `finishError`（末条转 error，非空占位，不产幽灵） | 本机 awk 逐行核 + 上述 diff |
| T-QUEUE-1/2 先红性 | **测不到本批修复点**：死信（H3a/H3b）无法在 L3 mock 下确定性复现（trigger 在飞期入队旧 send-finally 同样能 flush），审计 C4 的「busy 窗撑开」构造对**单槽旧代码**不成立 | 实验：仅 stash 产品改动跑 → 2 passed |
| interaction 基线（最终提交态） | **71 passed / 3 failed**；失败集合 **恰等于**预存在 3 红 ⇒ A10 达成（无新增失败，新增 T-FORCE-4 绿）。L1 703/47、双 tsc 0 错、eslint 0 error（6 既有 warning） | 本机串行跑（坑 p000114） |
| visual 是否受占位移除影响 | **未测**（L5 基线宿主＝macOS，坑 p000136/K8，WSL 禁 update） | — |
| 簇 2 busy 真/假比例 | **未采集**（依 Mac 回归轮） | — |
| 预存在 3 红是否因本批转绿 | **否**（RC1a/RC1b 下仍 3 红）；曾观测到「数组化修绿 core:685」，但数组化属 t000068 未批 | 对比：单槽 3 红 vs 数组 2 红+retry 新红 |

## 15. 审计修订记录（v2 → v2.1，出处见 §16）

| Finding | 严重度 | v2 的问题 | v2.1 处置 |
|---------|--------|-----------|-----------|
| **F1** | **P1** | RC1a 漏第三 push 点 `retryFailedTurn`（L2744-2761，无 finally）→ 重试链撞裸退时 busy 真悬挂，违背自设 I2 | D1 改为「裸退 B 自己收尾 + 释放 busy」；anchor 记到三处 push 点（Task 1 Step 2/4） |
| **B2** | **P1** | 单存 `roundStreamIdRef` + `anchor<0 → 扫全表`：approval 期并发 send 覆盖 anchor → **误删他链活占位**（其 chunk 被静默丢弃） | D3 `roundStreamRef {sid,id}` 配对 + `anchor<0`/非 streaming 直接 return（D2）；R1 重写 |
| **C4** | **P1** | 「`streamDelay:2200` 撑开 busy 窗」为假（窗口≈1.3s 封顶）；`manualEmit` 兜底同样撑不过 800ms；`approval:'all'` 破坏排队前提 | Step 1 改确定性构造：`approval:'none'` + 8 轮自动 read；删错误的 manualEmit 兜底叙述 |
| **C1/C2/C3** | P1→P2 | T-QUEUE-1 缺 `capture:{chatCount:true}`（`chatCount()` 返回 undefined 必败）；用户气泡计数写 2（实为 3）；`expectLastUserMsg(甲)` 语义错；A5 用非 nudge 文本测「系统文案不进气泡」无效 | Step 1/2 全部重写并订正数字与断言语义；A4/A5 矩阵同步 |
| **E / D4③** | P2 | 「两个 flush 点会 sessionRef++ 互杀」论证不成立（两调用相隔 >16ms，且 `send` 自带排队判定 → 自愈）；「workingRef 只在 effect 写」前提为假（L2389/L2699 同步写） | §5.1 重写：列全部读写点 + 订正结论仍成立的理由 + 自愈论证 |
| **F3** | P2 | `statusText` 读不到 → `''` → 判 idle，真 busy 期被放行动作、污染取证 | D4/Step 1 改 fail-closed（抛错→`isModelBusy` 保守判 busy + WARN）+ `[role=status]` 回退 |
| **F4** | P2 | 未论证「审批卡挂着时边缘 flush 直送会作废旧授权链」 | §5.1 补论证（同 ADR-013.2 既有例外路径）+ Task 5 观测行 + R3 |
| **D1(grep)** | P2 | 自检命令 `grep "处理中\|思考中\|生成中"` 在 BRE 下语义错（当前命中纯属巧合） | Task 2 Step 5 改 `grep -rnE '思考中|生成中|正在回复|Streaming'`，期望仅剩 `uat-force1.mjs:41` |
| **F5/F6/A10** | P2 | Task 4「全量 interaction 全绿」不可达成（改前即 3 红，CI 同）；DoD 漏「收口=0/环境≤2」 | §6 闸门口径改「不新增失败」；A8 注记 + 新增 A10；登记 `t000069` |
| **F9/A** | P2 | 两处写「T-FORCE-1..4」——该文件实测仅 1..3 | 新用例编号改 **T-FORCE-4**，回归表述改 1..3 |
| **F7** | P2 | Task 6 未注明 p000125 与决策指针**必须经 handoff CLI**；d000006 仍指 v1 | §8 全部标注单一写口 + 指针更新项 |
| **F10** | P2 | 头部引「ADR-010（四级梯度）」错误（010＝多源 Provider 目录） | 头部改引 `conversationState.ts:244-259` + 单测；误标订正列入 §11 不做 |
| **F11/R7** | P2 | 状态栏文案成为 harness 新契约，风险只写未闭环 | 新增同源哨兵（Task 2 Step 4）+ 转裁决第 2 项 |
| **F2** | P2 | D6 删 L806 严格字面略超授权 | 保留（属统一写入口的合理推论）+ 转裁决第 1 项明示可否决 |
| **B1/C7** | P3 | 未点破 `messagesRef` 由 commit 后 effect 同步（push②→B 靠 L1975 50ms 兜住）；未说明状态栏 innerText 含「 │ 项目名」后缀 | helper 注释 + Task 2 Step 1 注释补 |
| （自审）A8/A9 数字 | P3 | DoD 无基线数值 | 头部与 §6 落基线：L1 703/47、双 tsc 0 错、L3 70/3 |

## 16. 审计方法（可复核）

- **技术事实面**：逐条实读源码核 A/E 类断言 + 实跑 `vitest`（703）/`node --check`/grep；手推 3 个消息数组实例验证 helper（含 anchor 缺失、anchor 最前、双孤儿）。
- **规范面**：对照 ADR-012 / ADR-013 / 领域 §4.12 / `AGENTS.md`（内容落位、单一写口、工具私货指针）/ 上批方案格式 / `d000006` 授权字面。
- **交叉验证与分歧**：一份审计称 T-FORCE-5 可能「改前不红」（断言第三次回复只进 loop-guard）——**不采纳**：T-FORCE-1 用同一 `loopScript()` 断言 `.nf-forcedcard` 出现且在当前 70 passed 中通过 ⇒ mock 下确进裸退 B ⇒ 幽灵可形成（另一份审计 C5 独立复核同结论）。红/绿判定仍以 Step 1 实跑为准，并保留「改前不绿即记覆盖缺口、不得弱化断言」的硬规。
