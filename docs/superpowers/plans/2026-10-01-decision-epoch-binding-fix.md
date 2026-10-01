# β（stale 输入冲卡）修法实现计划

> **For agentic workers:** REQUIRED WORKFLOW: implement this plan task-by-task — either dispatch a fresh subagent per task with a review gate between tasks (recommended), or execute inline with checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「用户对某个决策点做出的答复」只能作用于它被写就的那个决策点——代次不符即失效，且未命中确认/拒绝词表的自由文本不再改动卡片。

**Architecture:** 三刀同一因：① 领域层给决策点一个单调递增代次（`decisionEpoch`，fencing token 的最小落地）并在**应用点**（`send` 的 pending 路由）校验；⓪ 把 C2「任意非确认文本＝隐式方向性拒绝」换成**三态答复通道**（确认词表 / 拒绝词表 / 其余一律作普通消息、卡保持挂起）；③ 迟到的证据对账引导在决策点挂起时作废（同一守卫口径）。排队槽只换载荷形状（携带绑定），**不动 flush 触发点**。

**Tech Stack:** TypeScript（双 tsconfig：renderer + main）、React 18（renderer 状态机 ref 单源）、Vitest（L1 单测）、Playwright `--project=interaction`（L3：vite dev :5175 + MockBridge）、lefthook → lint-staged。

## Global Constraints

以下逐条来自 `AGENTS.md` / ADR / 上批实证，**每个 Task 的要求都隐含包含本节**：

- **ADR-012（最高优先级硬闸）**：本计划属「另开修批」。修批内**不得**同时做整轮 UAT 取证；测批与修批分离，回归另开一批。
- **凭据**：只引用环境变量或本机凭据文件路径，不写值。
- **提交**：Conventional Commits（`fix` / `test` / `docs` / `refactor`）；走 lefthook → lint-staged；**禁止 `--no-verify`**。
- **未决/坑/交接状态只经 `handoff` CLI 写入 `.handoff/`**（单一写入口）：`python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py"`。
- **语义裁定正文进 `docs/decisions/`**（Nygard 模板 + 索引表），其它文档只引用编号。
- **覆盖矩阵**更新到 `docs/tests/coverage-matrix.md`。
- **Mac 是 QA 权威**；**L5 snapshot 基线只允许在 macOS 更新**（坑 p000136/K8）。本批不碰 L5。
- **命令 cwd = `apps/desktop`**（根 `node_modules` 不是依赖根）；单步预计 >60s 时中途报告进度。
- **预存在红不在本批范围**：`t000069`（改前 L3 即红的 3 例）本批**不得顺手改/关**；本批口径＝**不新增失败**。
- **实证硬约束（上批 `retry.interaction.ts:187` 回归教训）**：**不改 flush 触发点**——保持 `ConversationPanel.tsx:2614`（`send` finally 内）。上批「边缘 flush」改造实测多派发一回合，破一条预存在绿；本批不重复该实验。
- **实证硬约束（本批 RCA）**：**不做多槽队列**（`t000068`/RC3）。单槽静默覆盖偶然掩盖 β；加宽＝让更多 stale 文本活到 flush＝方向反转。
- **词表教训（#6 真机 2026-08-22/30，坑记录在 `agentLoop.ts:68-89` 注释）**：裸子串匹配会误伤（「先给我文件清单，我看了再确认执行」含「确认执行」子串）。新词表**必须**整句锚定（`^...$`）并带条件/否定/问句排除。

---

## 0. 输入与依据（不动手前先读）

| 项 | 位置 |
|---|---|
| 原始根因（最终层·探针坐实） | `docs/audits/uat-ghost-busy-remeasure-2026-10-01.md`「★ 原始根因（最终层）」+「⚠ 对 RC3/t000068 的方向性反转」 |
| 外部实践校验（学术/协议/竞品源码） | `docs/audits/design-research-stale-input-binding-2026-10-01.md`（§1–§7） |
| 待裁条目 | handoff `t000071`（本计划即其修法展开）；`t000069`（预存在红，另批）；`t000066`（簇2 门闩，另批） |
| 上批已裁可复用 | `d000008`＝D6「删第二写入口，统一走 `send` 排队门」（上批接受但未落地，本批 Task 4 落地） |
| C2 规范出处 | `docs/design/intent-confirmation-domain-design.md:215`；S3/S4/S5/S6 stage-gate 曾标「保持观察、不扩张」（`docs/audits/stage-gate-S3-2026-08-16.md:30`），S7 才落地（`docs/audits/stage-review-S7-2026-08-16.md:16` P1-5） |

**β 因果链（一句话）**：busy 期用户文本入单槽 → 迟到的、为**旧决策点**写就的文本 flush 到达 → `send` 按**当前** `pending` 解释它（`ConversationPanel.tsx:2459`）→ `isConfirmIntent('确认，按方案执行')===false` → 落入 C2 `reject(..., {kind:'direction'})`（L2464）→ **刚弹出的 resolution 卡被当"改方向"拒掉** → 守卫见真 `none` 合法放行 → 额外回合毁收口 → harness 撞 busy 点不到卡 → timeout。

**外部一致性**（决定本计划形状）：`reasonix/prompt_identity.go` `ResolvePromptExact` + `RuntimeEpoch`、`codex` approval 挂 `call_id+approval_id` 查不到即丢弃、`gemini-cli` `correlationId`、`goose` "unknown or **stale** tool confirmation request"、`kilocode` `myGeneration !== generation → return`；MCP elicitation 只有 Accept/Decline/**Cancel**（Cancel≠Decline）、MCP cancellation "SHOULD ignore any response that arrives afterward"；**~20 harness 中「任意非确认文本＝隐式拒绝」零命中**。

---

## 1. 决策（含否决项）

| # | 决策 | 否决的替代与理由 |
|---|---|---|
| **D1 三态答复通道** | 待决策点时，自由文本分三态：**确认词表命中 → confirm**；**拒绝词表命中 → reject**；**其余 → 不碰卡，作普通用户消息进下一轮** | ① 「彻底废掉文本答复、只留按钮」：丢功能——S7-2/S7-3 与 `sysPromptConfirmWords.test.ts` 证明产品有意承诺「打字可确认」（提示词引导用户回「已解决」），废掉即违约；② 保留现 C2：外部零先例，且它是 β 的第二级放大器（`docs/audits/design-research-...:§7.3`）。三态是 aider/deepcode/MCP 的共同形状（封闭词表 + "没答"第三态） |
| **D2 代次载体** | 领域状态新增 **`decisionEpoch: number`**，由 `setPending` 单调 +1（同 kind 重提议也 +1）；不复用 `sessionRef`（sid） | sid 标识「一次 send 的会话」，不是决策点实例：同轮内可多次 setPending（协议工具 mid-round），且卡跨轮存活。用 sid 会漏掉「同轮重提议」这一最硬用例（β 的 plan→plan）。单调不回卷＝fencing token 性质（A1/A3） |
| **D3 校验点** | 校验在**应用点**（`send` 的 pending 路由），入队只**冻结携带** | 只在入队时判一次＝错（A2「enforced by the resource server」；且入队后 pending 仍会变） |
| **D4 迟到文本处置** | **降级为普通消息**（可见、进模型），**不丢弃、不静默吞** | 丢弃＝C1/C2 外部实践的背离（Claude Code 排队消息必达模型；agentpatterns "queue until the next turn boundary"）；且 C2 现路径还吞文本不进模型——外部在拒绝路径上把文本回喂（opencode/cline correction） |
| **D5 flush 触发点** | **不动**（保持 `send` finally L2614） | 上批 D5「边缘 flush」实测破 `retry:187`（多派发一回合）→ 已回退。死信（H3a）另案留 `p119` 取证，不混入本批 |
| **D6 队列宽度** | **单槽保持**，载荷由 `string` 换成 `{ text, answer }` | 数组化＝`t000068`（未批）+ RCA 判方向反转 |
| **D7 写入口统一** | 落地**上批已裁** `d000008`：删 `ConversationPanel.tsx:809` 直写槽特例，一律 `void sendRef.current({ silent: true, text: nudge })` | 保留特例＝第二写入口（绕过 `send` 的排队门与 Task 4 的迟到守卫，③ 就管不到它） |
| **D8 ③ 作用域** | 迟到作废**只**针对 `systemNudgeKind(text)==='evidence'` 家族 | 泛化到全部 silent 引导是口径扩张；`shouldNudgeReportAfterEvidenceMissing`（`agentLoop.ts:358-396`）已把「pending 非 none ⇒ 不引导」写成该家族既有政策，③＝把同一政策用到发送点，非新语义 |
| **D9 可见性打点** | 新 timeline 事件 `conversation.stale_input_discarded`（载荷 `kind`/`pending`/`wantEpoch`/`curEpoch`） | 静默丢弃＝不可取证（RC1b fail-closed 同谱教训）；Kafka `ProducerFencedException` 先例：拒绝是**可见事件** |
| **D10 治理** | 新 ADR **014**：`docs/decisions/014-decision-point-generation-binding.md`，**取代** `intent-confirmation-domain-design.md:215` 的「C2 归义（任意自由文本＝隐式 reject）」，并记录 `docs/decisions/001-rejectstreak-semantics.md:17` 需随之下调的口径 | 只改代码不改规范＝规范与实现矛盾（该文档是 §3.4 C2 的规范源） |
| **D11 阈值** | **不改** `detectUnproductiveDialogue` 阈值（`conversationState.ts:252-257`：rejectStreak 1/2、T1/T2 2/3、T4 40） | C2 废止后 `rejectStreak` 不再由文本累积，梯度改由 **T2 `unresolvedTextReplies`**（>=2 loop-guard / >=3 forced-clarify）承载——这是既有的、更强的路径（现网 C2 每次 reject 走 `userDecided` 会**清零** T1/T2，反而削弱梯度；⓪ 后 T2 才真正累积得起来）。阈值调整须依回归数据另裁 |

---

## 2. 文件结构（改动落位）

| 文件 | 本批职责 | Task |
|---|---|---|
| `src/domain/conversationState.ts` | 决策点代次唯一载体：`decisionEpoch` 字段 + `setPending` 递增 + `isAnswerToCurrent` 纯校验 + `DecisionAnswer` 类型 | 1 |
| `src/domain/agentLoop.ts` | 拒绝词表 `isDeclineIntent`（与 `isConfirmIntent` 对偶，整句锚定） | 1 |
| `tests/unit/conversationState.test.ts` / `tests/unit/agentLoop.test.ts` | L1 断言（代次语义 / 三态路由的领域判据） | 1 |
| `src/renderer/ConversationPanel.tsx` | 队列载荷（`:758` `:809` `:2415-2421` `:2447`）+ 路由三态化（`:2459-2482`）+ `send` opts 扩 `answer` 与迟到守卫（`:2425` 顶部） | 2,3,4 |
| `src/domain/timeline.ts` | 新事件类型注册（union + `TIMELINE_EVENT_SPECS`——Record 强制两处同改，双 tsc 兜底） | 4 |
| `tests/interaction/cards-from-decision-content.interaction.ts` | S7-1 断言改写（卡不再被文本拒掉）；新增 T-TRI-1/T-BOUND-1/T-STALE-1 | 2,3,4 |
| `docs/design/intent-confirmation-domain-design.md` `docs/decisions/014-*.md` `docs/decisions/000-decision-log.md` `docs/tests/coverage-matrix.md` | 规范/ADR/矩阵 | 6 |
| `.handoff/`（经 CLI） | `t000071` 收口、新批状态 | 6 |

**独占区提醒**（并发防冲突，沿用 S4 卡渲染修复批的分区写法）：Task 2/3/4 都改 `ConversationPanel.tsx` 但**不同区**——Task 2 只碰 `:2454-2482` 路由块；Task 3 只碰 `:758/:2415-2421/:2438-2450` + `send` 签名；Task 4 只碰 `:804-810` 与 `send` 顶部守卫。**串行执行，勿并行。**

---

## Task 0 · 取改前基线（**不改码**）

**Files:** 无（产出数字填进本文件 §14 证据表）

> 计划期已实测一次（2026-10-01 00:41，工作树 `548a505` 起 4 个 docs commit 后）：L1 **703 passed / 47 files**、双 tsc **0 错**。L3 数以 §14 表内记录为准。执行修批时**必须重跑**确认未漂移——基线过期即作废。
>
> **★ 基线漂移已实测（2026-10-01，src 自 `d402e4f`（RC1a）起零改动）**：上批出口记的是 **L3 71 passed / 3 failed**（commit `8940107`），本轮实测 **67 passed / 7 failed**。`playwright.config.ts:14` 本就是 `workers: 1`——**两次都是串行**，故多出 4 红**不是并发假失败**（坑 p000114 不适用）。4 例中定向复跑：`#7-2`（`cards-from-decision-content:738`）**两次皆红**（`:748` 等「确认执行」超时＝点确认目标后方案卡未出），其余 3 例复跑转绿＝时序/负载敏感。
> ⇒ **闸门口径随之收紧**：不得拿历史数字对照，必须**同一次运行内自对照**（改前清单 ⊇ 改后清单），且 `#7-2` 作为第 4 红**如实登记、本批不修**（并入 `t000069` 另批范围）。

- [ ] **Step 1** cwd `apps/desktop`，串行跑（坑 p000114：并发致 L3 假失败）：

```bash
npx vitest run 2>&1 | tail -5
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit && echo TSC-OK
npx playwright test --project=interaction 2>&1 | tail -12
npx eslint . 2>&1 | tail -3
```

- [ ] **Step 2** 逐字记录：L1 passed/failed/files、双 tsc 错误数、L3 `N passed / M failed` 与**失败例文件名:行号清单**（预期含 `t000069` 三例：`cards-from-decision-content:440`、`core.interaction:685`、`core.interaction:1859`；若清单变化，如实记）。
- [ ] **Step 3** 跑一次 β 现形确认（改前必红，证伪保护）：`npx playwright test --project=interaction -g "S7-1"` → 记录当前断言（卡消失）**通过**这一事实——它将在 Task 2 被改写为相反断言，属**行为契约翻转**而非回归，须在 §14 明示。
- [ ] **Step 4 Gate**：无新红、工作树干净（`git status --short` 空）才进 Task 1。**基线取不到 → 停并汇报**。

---

## Task 1 · 领域层：决策点代次 + 三态判据

**Files:**
- Modify: `src/domain/conversationState.ts`（interface `:111-126`、`initialState :128-141`、`setPending :303-316`，新增导出）
- Modify: `src/domain/agentLoop.ts`（`isConfirmIntent` 之后，约 `:90`）
- Test: `tests/unit/conversationState.test.ts`、`tests/unit/agentLoop.test.ts`

**Interfaces:**
- Consumes：无（纯新增）
- Produces：
  - `ConversationState.decisionEpoch: number`
  - `export interface DecisionAnswer { epoch: number; kind: PendingKind }`
  - `export function isAnswerToCurrent(answer: DecisionAnswer | undefined, s: ConversationState): boolean`
  - `export function isDeclineIntent(t: string): boolean`

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/conversationState.test.ts` 末尾）

```ts
describe('决策点代次绑定（β——docs/decisions/014）', () => {
  it('setPending 递增 decisionEpoch——同 kind 重提议也递增（fencing token 单调）', () => {
    let s = initialState()
    expect(s.decisionEpoch).toBe(0)
    s = setPending(s, 'plan', { since: 't1' })
    const e1 = s.decisionEpoch
    expect(e1).toBe(1)
    s = setPending(s, 'plan', { since: 't2' }) // 同 kind 重提议＝新决策点实例
    expect(s.decisionEpoch).toBe(e1 + 1)
  })

  it('isAnswerToCurrent：answer 缺省＝现场打字，恒真', () => {
    const s = setPending(initialState(), 'plan', { since: 't1' })
    expect(isAnswerToCurrent(undefined, s)).toBe(true)
  })

  it('isAnswerToCurrent：kind 或 epoch 任一不符即假；pending 归 none 亦假（无可答决策点）', () => {
    let s = setPending(initialState(), 'plan', { since: 't1' })
    const a = { epoch: s.decisionEpoch, kind: s.pending }
    expect(isAnswerToCurrent(a, s)).toBe(true)
    s = setPending(s, 'plan', { since: 't2' }) // 重提议 → 旧答复过期
    expect(isAnswerToCurrent(a, s)).toBe(false)
    s = setPending(s, 'goal', { since: 't3' }) // 换 kind → 旧答复过期
    expect(isAnswerToCurrent(a, s)).toBe(false)
    const none = userConfirmed(s, 'goal')
    expect(isAnswerToCurrent({ epoch: none.decisionEpoch, kind: 'goal' }, none)).toBe(false)
  })

  it('β 回归锁定：为 plan 卡写的确认文本，不得作用于后出现的 resolution 卡', () => {
    let s = setPending(initialState(), 'plan', { since: 't1' })
    const a = { epoch: s.decisionEpoch, kind: s.pending } // 入队冻结
    s = userConfirmed(s, 'plan')
    s = setPending(s, 'resolution', { proposal: { summary: '做成', evidence: { verification: [], diffs: [], pendingQuestions: [] } }, since: 't2' })
    expect(isAnswerToCurrent(a, s)).toBe(false)
  })

  it('单调性：epoch 不因确认/拒绝回卷（防 ABA 复用）', () => {
    let s = setPending(initialState(), 'plan', { since: 't1' })
    const e = s.decisionEpoch
    s = userRejected(s, 'plan', { kind: 'direction' })
    s = setPending(s, 'plan', { since: 't2' })
    expect(s.decisionEpoch).toBeGreaterThan(e)
  })
})
```

（`describe` 内新符号需在文件头 import 列表补 `isAnswerToCurrent`。）

追加到 `tests/unit/agentLoop.test.ts`：

```ts
describe('isDeclineIntent（D1 拒绝词表——整句锚定，防 #6 真机裸子串误伤）', () => {
  it('明确拒绝词命中', () => {
    for (const t of ['不要了', '算了', '取消', '不做了', '不同意', '拒绝', '不要这个方案']) {
      expect(isDeclineIntent(t), t).toBe(true)
    }
  })
  it('条件/否定/问句/长句不误伤——一律不命中（不碰卡）', () => {
    for (const t of [
      '先别急着做，我看看', // 含「不要/别」语义但非拒绝决策点——保守不判
      '这个方案不要改文件路径吗', // 问句
      '方案里的不要了按钮是指什么', // 提及非表态
      '确认，按方案执行', // 该走确认侧或普通文本，绝不算拒绝
      '好的，继续',
    ]) {
      expect(isDeclineIntent(t), t).toBe(false)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/conversationState.test.ts tests/unit/agentLoop.test.ts 2>&1 | tail -20`
Expected: FAIL——`decisionEpoch` 不存在 / `isAnswerToCurrent is not a function` / `isDeclineIntent is not a function`（或 TS 编译错）。**必须先看到红**，否则测试无效。

- [ ] **Step 3: 最小实现**

`conversationState.ts` — interface 加字段（`:115` `pending: PendingKind` 之后）：

```ts
  pending: PendingKind
  // D2（ADR-014/β）：决策点代次——setPending 单调 +1，答复必须携带其写就时的代次
  //（fencing token 最小落地：外部对照 reasonix RuntimeEpoch / kilocode myGeneration）
  decisionEpoch: number
```

`initialState()` 加 `decisionEpoch: 0,`（紧随 `pending: 'none',`）。

`setPending`（`:315`）返回体加递增：

```ts
  const noted = notePendingSet(s, kind)
  return {
    ...noted,
    pending: kind,
    decisionEpoch: s.decisionEpoch + 1, // 决策点实例换代（同 kind 重提议＝新实例）
    decisionContent: content ? { kind, ...content } : undefined,
  }
```

同文件末尾新增：

```ts
/** 答复绑定（D2/D3）：文本被写就时所针对的决策点实例——入队时冻结，应用点校验 */
export interface DecisionAnswer {
  epoch: number
  kind: PendingKind
}

/**
 * 这条文本是否是对「当前挂着的那个决策点」的答复？
 * - `answer` 缺省＝现场打字（无异步间隙），恒真
 * - 携带绑定：kind 与 epoch 都须与当前一致，且当前确有决策点挂起
 *（外部对照：MCP elicitation 按 JSON-RPC id 配对；codex call_id+approval_id 查不到即丢弃；
 * reasonix ResolvePromptExact → ErrPromptStaleTurn）
 */
export function isAnswerToCurrent(
  answer: DecisionAnswer | undefined,
  s: ConversationState,
): boolean {
  if (!answer) return true
  return s.pending !== 'none' && answer.kind === s.pending && answer.epoch === s.decisionEpoch
}
```

`agentLoop.ts` — `isConfirmIntent` 之后（复用其排除条件写法）：

```ts
/**
 * D1（ADR-014）：拒绝词表——与 isConfirmIntent 对偶的**封闭词表**。
 * 命中才 reject；未命中的一律不作答复（卡保持挂起，文本作普通消息进下一轮）。
 * 教训沿用 isConfirmIntent 注释（#6 真机 2026-08-22）：整句锚定，禁裸子串匹配。
 */
export function isDeclineIntent(t: string): boolean {
  const s = t.trim()
  if (/[?？]$/.test(s) || /吗[。！!~～]?$|行不行|可以吗/.test(s)) return false
  return /^(不要了|算了|取消|不做了|不同意|拒绝|撤回|作废)[。！!~～]?$|^不要这个方案$|^不同意这个方案$/.test(
    s,
  )
}
```

- [ ] **Step 4: 跑测试确认通过 + 全量 L1 + 双 tsc**

Run: `npx vitest run 2>&1 | tail -5 && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit && echo OK`
Expected：新增全绿；**且 `conversationState.test.ts` 既有断言无一转红**（若 `initialState()` 的形状断言失败，说明有测试硬编码字段清单——如实记录并按 ADR-014 口径同步该断言，**不得删断言**）。

- [ ] **Step 5: Commit**

```bash
git add src/domain/conversationState.ts src/domain/agentLoop.ts tests/unit/conversationState.test.ts tests/unit/agentLoop.test.ts
git commit -m "feat(domain): add decision epoch binding and closed decline vocabulary (ADR-014 prep)"
```

**Done when**：A1/A2（见 §12）绿；`isAnswerToCurrent` 三态语义（缺省真 / 匹配真 / 不符假）各有断言。

---

## Task 2 · ⓪ 三态路由：文本不再隐式拒卡（含 S7-1 契约翻转）

**Files:**
- Modify: `src/renderer/ConversationPanel.tsx:2454-2482`（路由块）
- Modify: `tests/interaction/cards-from-decision-content.interaction.ts:541-569`（S7-1 改写）
- Test: 同文件新增 `T-TRI-1`

**Interfaces:**
- Consumes：`isAnswerToCurrent(answer, s)`、`isDeclineIntent(t)`（Task 1）
- Produces：`send(opts?: { silent?: boolean; text?: string; answer?: DecisionAnswer })` 签名定型（Task 3/4 依赖）

- [ ] **Step 1: 改写 S7-1（契约翻转——卡不消失）** 整段替换 `:541-569`：

```ts
// ADR-014 D1（β 修法）：pending 期自由文本**不再**隐式拒当前决策点——
// 未命中确认/拒绝词表的文本作普通消息进下一轮，卡保持挂起（外部对照：cline「Leaving pending
// tool approval open and routing user message as queued follow-up」、aider/deepcode 封闭词表、
// MCP Accept/Decline/Cancel 三态）。本例原断言「卡消失」＝C2 契约，2026-10-01 撤销。
test('S7-1：方案卡待确认时用户打字（非词表）→ 卡保持 + 模型收到新意图', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    streamDelay: 300,
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      // 该轮不重提议——纯文本回应。若产品仍「拒卡」，此处即暴露（改前此断言必红）
      [[chunk.content('好的，我按你的新思路调整。'), chunk.done()]],
      planPropose(['/test/store.ts（状态）']),
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await sendChat(page, '换个思路，做桌面版')
  // ★ 卡**仍在**（未被文本拒掉）——pending 保持 'plan'
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(1, { timeout: 10000 })
  await expectText(page.locator('.nf-chat__list'), '/test/app.ts（核心）', 5000)
  // 模型确实收到新意图（下一轮 chat3 消费）→ 重提议自然替换旧卡内容
  await sendChat(page, '不要了')
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 15000)
  await expectText(page.locator('.nf-chat__list'), '/test/store.ts（状态）', 5000)
})
```

（`chunk` 需在该文件 import 列表内——`mockBridge` 已导出；缺则补 `chunk`。）

- [ ] **Step 2: 跑改前红**

Run: `npx playwright test --project=interaction -g "S7-1" 2>&1 | tail -15`
Expected: FAIL 在 `toHaveCount(1)`（现状 C2 把卡拒成 0）。**红才算断言有效。**

- [ ] **Step 3: 实现三态路由** 替换 `ConversationPanel.tsx:2454-2482` 的 `if (!silent) { ... }` 内路由块（保留其后 `onUserMessage` / `message_sent` / `noteUserTextReply` / 气泡 push 各行原样）：

```ts
    if (!silent) {
      // ADR-014 D1（β 修法·⓪）：pending 期自由文本＝**三态答复通道**（原 C2「非确认即隐式拒」撤销——
      // ~20 个竞品 harness 与 MCP/学术侧均无此形态；且 C2 是 p063 里把新弹 resolution 卡拒掉的直接杀手）
      // 确认词表命中 → confirm 当前决策点；拒绝词表命中 → reject(direction)；
      // 其余 → **不碰卡**（保持挂起），文本照常作为用户消息进下一轮（D4：降级不丢弃）
      // ①：答复只对它被写就时的那个决策点生效——入队文本携带 DecisionAnswer，代次不符即不作答复
      const pendingKind = stateRef.current.pending
      const answersCurrent = isAnswerToCurrent(opts?.answer, stateRef.current)
      if (pendingKind !== 'none' && pendingKind !== 'approval') {
        if (answersCurrent && isConfirmIntent(text)) confirm(pendingKind)
        else if (answersCurrent && isDeclineIntent(text)) {
          reject(pendingKind, { kind: 'direction', text })
          if (pendingKind === 'plan') {
            planWasRejectedRef.current = true
            planRejectCountRef.current += 1
          }
        }
      } else if (
        pendingKind === 'approval' &&
        // 收紧（T0-3/P2 回归修正）：approval 期只认**明确批准词**（「批准/可以/行/同意」——
        // 「继续」等非批准语义不自动批——手动按卡测试与真实「让模型继续」路径保持手动）
        answersCurrent &&
        /^(行|好|可以|批准|同意|没问题|确认|就这么办)[。！!~～]?$|批准|同意/.test(text)
      ) {
        // S7（C2 完善——e2e-0to1 场景 B）：approval 期确认文本 → 自动批准当前待批授权卡
        // （真实用户打字「行/批准」——确认卡时代只处理按钮批准遗漏文本批准）
        const lastMsg = messagesRef.current[messagesRef.current.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.toolCalls?.length) {
          approveAllToolCalls(lastMsg.toolCalls)
        }
      }
```

（import 处补：`isDeclineIntent` 自 `../domain/agentLoop`；`isAnswerToCurrent`、`DecisionAnswer` 自 `../domain/conversationState`——沿用文件既有 import 分组写法。）

- [ ] **Step 4: 新增 T-TRI-1（词表三态的端到端断言）** 追加到同文件：

```ts
// ADR-014 D1：三态——确认词命中即确认；拒绝词命中即拒；近似词不改卡
test('T-TRI-1：确认词/拒绝词/近似词三态——近似词不拒卡（β 的 C2 误杀面）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    streamDelay: 300,
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[chunk.content('收到，我看看怎么调整。'), chunk.done()]],
      [[chunk.content('明白，先不动手。'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // β 真机原语（p063）：这句 isConfirmIntent 判 false（需连续子串「确认执行」）——改前＝拒卡，改后＝不动卡
  await sendChat(page, '确认，按方案执行')
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(1, { timeout: 10000 })
  // 明确拒绝词 → 拒卡（词表命中才拒）
  await sendChat(page, '不要了')
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0, { timeout: 10000 })
})
```

- [ ] **Step 5: 验证（关键：梯度与既有绿例不许意外转红）**

Run: `npx playwright test --project=interaction 2>&1 | tail -20`
Expected：`S7-1`/`T-TRI-1` 绿；`S7-2`（打字确认）、`S7-3`（approval 打字批准）**保持绿**——它们现场打字，`answer` 缺省恒真；`forcedClarify` **T-FORCE-1..4** 保持绿（C2 废止后梯度由 T2 `unresolvedTextReplies` 承载，见 D11）；`#7-1`（:712-735）保持绿（旧方案卡由**新 goal 提议自然取代**，非文本拒）。
**任一绿例转红 → 停、取证、汇报**（上批 `retry:187` 教训：不得自证"自愈"）。允许维持的红＝**Task 0 同次运行的基线清单**（实测 7 例，含未登记的 `#7-2`——见 Task 0 漂移说明），不得更多。

- [ ] **Step 6:** `npx vitest run 2>&1 | tail -5` + 双 `tsc --noEmit` + `npx eslint . 2>&1 | tail -3`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ConversationPanel.tsx tests/interaction/cards-from-decision-content.interaction.ts
git commit -m "fix(renderer): typed text during pending no longer implicitly rejects the decision card (ADR-014)"
```

**Done when**：A3/A4/A6 绿；`grep -n "隐式拒绝\|kind: 'direction', text" src/renderer/ConversationPanel.tsx` 只剩**词表命中**一条 reject 路径。

---

## Task 3 · ① 绑定贯通：入队冻结 → flush 携带 → 应用点校验

**Files:**
- Modify: `src/renderer/ConversationPanel.tsx:758`（槽形状）、`:2415-2421`（flush）、`:2425`（`send` 签名）、`:2438-2449`（入队冻结）
- Test: `tests/interaction/cards-from-decision-content.interaction.ts`（新增 `T-BOUND-1`）

**Interfaces:**
- Consumes：`DecisionAnswer`、`isAnswerToCurrent`（Task 1）、`opts.answer` 路由消费（Task 2）
- Produces：`pendingSendRef: React.RefObject<{ text: string; answer?: DecisionAnswer } | null>`；`send(opts?: { silent?: boolean; text?: string; answer?: DecisionAnswer })`

- [ ] **Step 1: 写失败测试 T-BOUND-1**（同轮内重提议 → 旧答复必须过期；这是 β 最硬的同-kind 形态，Task 2 的词表改动挡不住它）

```ts
// ADR-014 D2/D3（①）：入队文本冻结答复绑定——flush 时决策点已换代（同 kind 重提议）则不作答复。
// 构造（确定性，勿靠真模型撞运气）：一轮内 propose_plan(A) → 若干自动执行的只读工具撑住 busy
// → propose_plan(B)（换代）。busy 期打字「行，按这个方案来」入槽（绑 A 的代次）。
// 本轮收口 flush → 当前卡是 B → 旧答复**不能**确认 B（卡保持）。
test('T-BOUND-1：为方案卡 A 写的确认语，不得确认 flush 时的方案卡 B', async ({ page }) => {
  const busyPlanRound = (files: Array<{ path: string; reason: string }>) => [
    [
      toolCall.proposePlan('执行方案', files),
      toolCall.read('/test/a.ts'),
      toolCall.read('/test/b.ts'),
      toolCall.read('/test/c.ts'),
      chunk.content('继续看几个文件。'),
      chunk.done(),
    ],
  ]
  await installMockBridge(page, {
    project: 'none',
    approval: 'none', // 只读工具自动执行撑 busy 窗口（streamDelay 撑不开——上批审计 C4）
    script: compose(
      goalConfirm('做一个待办应用'),
      busyPlanRound([{ path: '/test/app.ts', reason: '核心' }]),
      busyPlanRound([{ path: '/test/store.ts', reason: '状态' }]),
      [[chunk.content('好的，等你确认。'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await expectText(page.locator('.nf-chat__list'), '/test/app.ts', 5000) // 卡 A
  // busy 期打字（working=true + pending='plan' → 入槽并**冻结绑定**）
  await sendChat(page, '行，按这个方案来')
  // flush 迟到：当前已是卡 B（换代）→ 不得被 A 的答复确认；卡保持挂起
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 15000)
  await expectText(page.locator('.nf-chat__list'), '/test/store.ts', 5000) // 显示 B
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(1, { timeout: 3000 })
  // 且未被放行执行（B 未确认 → 清单外写需授权，不出现 store.ts 的写入 done 卡）
  await expect(page.locator('.nf-toolcall--done').filter({ hasText: '写入 /test/store.ts' })).toHaveCount(0)
})
```

- [ ] **Step 2: 跑改前红**

Run: `npx playwright test --project=interaction -g "T-BOUND-1" 2>&1 | tail -15`
Expected: FAIL——A 的确认语 flush 后把 B 确认掉（卡消失或写入发生）。若改前**不红**，说明构造没形成换代：**改测试构造直到红**，不得弱化断言（上批 §16 硬规）。

- [ ] **Step 3: 实现**

`ConversationPanel.tsx:758`：

```ts
  // 排队衔接（输入≠打断）——提前声明：verifyThenResolve 对账引导在 working 时经 send 入此槽（D7）
  // ADR-014 D2/D6：载荷携带答复绑定（入队时冻结的决策点代次）；宽度**保持单槽**（多槽＝方向反转，见 RCA）
  const pendingSendRef = useRef<{ text: string; answer?: DecisionAnswer } | null>(null)
```

`flushPendingSend`（`:2415-2421`）：

```ts
  const flushPendingSend = () => {
    const item = pendingSendRef.current
    if (!item) return
    pendingSendRef.current = null
    // 直送——不经输入框（避免 pending 文案闪进 textarea）
    // ADR-014：携带 answer 绑定 → send 的应用点校验决定它能否作为答复（不符即降级为普通消息，D4）
    setTimeout(() => void sendRef.current({ text: item.text, answer: item.answer }), 50)
  }
```

`send` 签名（`:2425`）：

```ts
  const send = async (opts?: { silent?: boolean; text?: string; answer?: DecisionAnswer }) => {
```

入队（`:2446-2449`）：

```ts
        console.log('[conversation] busy——排队衔接（ADR-013；要停请点停止）')
        // ADR-014：冻结「此刻的决策点」为答复绑定——silent（系统引导）不答决策点，不绑
        pendingSendRef.current = silent
          ? { text }
          : { text, answer: { epoch: stateRef.current.decisionEpoch, kind: stateRef.current.pending } }
        // silent：不在此处 push 用户气泡；flush 后 send 再走 silent 系统通道
        return
```

- [ ] **Step 4:** `npx tsc -p tsconfig.json --noEmit` —— 若 `pendingSendRef` 其它用法形状不符，编译器会点名全部 6 处（`:758 :809 :2416 :2418 :2447` + `:2614` 调用点）；逐一按上面口径改，**不得**加 `as any`。

- [ ] **Step 5: 验证**

Run: `npx playwright test --project=interaction 2>&1 | tail -20 && npx vitest run 2>&1 | tail -5`
Expected：`T-BOUND-1` 绿；`S7-1/S7-2/S7-3/T-TRI-1` 绿；`forcedClarify` 全绿；失败集不超基线（`t000069` 三例）。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ConversationPanel.tsx tests/interaction/cards-from-decision-content.interaction.ts
git commit -m "fix(renderer): bind queued input to its decision-point epoch and enforce at apply site (ADR-014)"
```

**Done when**：A5 绿；`pendingSendRef` 全仓仅一处赋值处携带绑定（grep 复核 6 点）。

---

## Task 4 · ③ 证据对账引导迟到作废（含 D7 统一写入口 + D9 打点）

**Files:**
- Modify: `src/renderer/ConversationPanel.tsx:804-810`（删第二写入口）、`:2425-2430` 之后（`send` 顶部守卫）
- Modify: `src/domain/timeline.ts`（union `:22-26` 区 + `TIMELINE_EVENT_SPECS :117-138` 区）
- Test: `tests/interaction/cards-from-decision-content.interaction.ts`（新增 `T-STALE-1`）、`tests/unit/timelineEvents.test.ts`（事件注册断言）

**Interfaces:**
- Consumes：`systemNudgeKind(text)`（`src/renderer/systemNudge.ts:9`）、`tlog(type, detail, role)`
- Produces：timeline 事件 `conversation.stale_input_discarded`，detail `{ kind, pending, epoch }`

- [ ] **Step 1: 写失败测试（领域注册表 + 端到端各一）**

`tests/unit/timelineEvents.test.ts` 追加：

```ts
describe('conversation.stale_input_discarded（ADR-014 D9——拒绝必须可见）', () => {
  it('事件已注册：domain=conversation，role=system，载荷含 kind/pending/epoch', () => {
    const spec = TIMELINE_EVENT_SPECS['conversation.stale_input_discarded']
    expect(spec.domain).toBe('conversation')
    expect(spec.role).toBe('system')
    expect(spec.detailKeys).toEqual(['kind', 'pending', 'epoch'])
  })
})
```

`cards-from-decision-content.interaction.ts` 追加（p063 形状的确定性构造：慢失败引导 vs 快成功弹卡）：

```ts
// ADR-014 D8/D9（③）：第一次核验「慢失败」产生的对账引导迟到时，若 resolution 卡已弹（第二次核验快成功）
// → 引导作废（不起新回合 → 不 busy 锁卡）。真机 p063 的杀手 nudge prevStatus=ready＝直发（坑 p000142），
// 故守卫必须落在 send 入口，覆盖直发与入槽两条路。
test('T-STALE-1：慢失败的证据引导迟到到达时卡已弹 → 作废且不重新起回合', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    extraInit: `
      const tlogs3 = []
      window.__tlogs3 = tlogs3
      bridge.timeline = { log: async (evt) => { tlogs3.push(evt) } }
      bridge.completion = {
        verify: async (commands) => {
          const slow = commands.some((c) => c.includes('ls dist'))
          // 慢失败（核验 1）与快成功（核验 2）——交错由延迟构造，不靠真模型撞运气
          if (slow) await new Promise((r) => setTimeout(r, 1500))
          const ok = !slow
          return Object.fromEntries(commands.map((c) => [c, { ok, output: ok ? 'ok' : '失败' }]))
        },
      }
    `,
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [
        [
          toolCall.reportCompletion('完成', [{ command: 'ls dist', passed: true }], []),
          chunk.done(),
        ],
      ],
      [
        [
          toolCall.reportCompletion('再报一次', [{ command: 'echo ok', passed: true }], []),
          chunk.done(),
        ],
      ],
      [[chunk.content('好的。'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // 卡出现且**不被迟到引导打断**（改前：引导起新回合 → working=true → 卡被 busy 锁住/点不到）
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
  await expect(page.getByRole('button', { name: '已解决' })).toHaveCount(1, { timeout: 4000 })
  // 作废打点存在（可见拒绝——D9）
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          ((window as unknown as { __tlogs3: { type: string }[] }).__tlogs3 ?? []).some(
            (l) => l.type === 'conversation.stale_input_discarded',
          ),
        ),
      { timeout: 5000 },
    )
    .toBe(true)
})
```

- [ ] **Step 2: 跑改前红**

Run: `npx vitest run tests/unit/timelineEvents.test.ts 2>&1 | tail -10 && npx playwright test --project=interaction -g "T-STALE-1" 2>&1 | tail -15`
Expected：两者皆红（事件未注册 → `spec` undefined；引导未作废 → 卡被打断/无打点）。
若 `T-STALE-1` 改前不红：先确认延迟确实造成交错（`__tlogs3` 里 `conversation.system_nudge` 时刻 vs `session.pending_set{resolution}` 时刻，须 system_nudge 在后），调整 `extraInit` 延迟数值——**不得弱化断言**。

- [ ] **Step 3: 注册事件** `src/domain/timeline.ts`——union 内 `'conversation.interrupted'` 之后：

```ts
  | 'conversation.stale_input_discarded' // ADR-014 D9：代次不符/迟到的输入被作废（拒绝必须可见）
```

`TIMELINE_EVENT_SPECS` 内 `'conversation.interrupted'` 条目之后：

```ts
  'conversation.stale_input_discarded': {
    domain: 'conversation',
    role: 'system',
    // kind: 'system_nudge' | 'user_answer'；pending: 当前挂起决策点；epoch: 被作废答复的绑定代次
    detailKeys: ['kind', 'pending', 'epoch'],
  },
```

- [ ] **Step 4: `send` 顶部守卫（一处覆盖直发与入槽两条路）** 在 `:2429` `const silent = ...` 之后插入：

```ts
    const silent = Boolean(opts?.silent) || isSystemNudgeText(text)
    // ADR-014 D8（③）：迟到的证据对账引导——现有决策点挂起时作废（决策点是用户要处理的，引导不得起新回合抢 busy）
    // 口径沿用领域既有政策 shouldNudgeReportAfterEvidenceMissing（agentLoop.ts:358：pending 非 none ⇒ 不引导）；
    // 外部对照：MCP cancellation「SHOULD ignore any response to the request that arrives afterward」、
    // kilocode attached-state.ts「myGeneration !== generation → return」
    if (silent && systemNudgeKind(text) === 'evidence' && stateRef.current.pending !== 'none') {
      tlog(
        'conversation.stale_input_discarded',
        {
          kind: 'system_nudge',
          pending: stateRef.current.pending,
          epoch: stateRef.current.decisionEpoch,
        },
        'system',
      )
      console.log('[adr014] evidence guide discarded——pending=' + stateRef.current.pending)
      return
    }
```

- [ ] **Step 5: 落地已裁 D6/`d000008`——删第二写入口** 把 `:808-810`（`const nudge` 之后那两行分派）换成（**保留 `const nudge` 声明行**）：

```ts
        const nudge = `【系统对账·非用户发言】${guide}`
        // 一律经 send：ADR-013.3 让 busy 时 silent 自动入槽（不再需要「working 时特写槽」的第二入口，
        // d000008/D7），而 Step 4 的守卫覆盖直发与入槽两条路的迟到作废。
        // 原此处直写 pendingSendRef 会绕过守卫（p000142：真机致命 nudge prevStatus=ready＝直发）。
        void sendRef.current({ silent: true, text: nudge })
```

（原 `if (workingRef.current) pendingSendRef.current = nudge else void sendRef.current(...)` 两行删除。）

- [ ] **Step 6: 验证**

Run: `npx vitest run 2>&1 | tail -5 && npx playwright test --project=interaction 2>&1 | tail -20 && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit && npx eslint . 2>&1 | tail -3`
Expected：`T-STALE-1` 绿且 **`S4-3`（同文件 `:~490`——两次核验后卡出现）保持绿**：S4-3 里第一次失败引导发出时 `pending==='none'`（未弹卡），守卫不应误伤。若 S4-3 转红＝守卫过宽 → 停并汇报（不放宽断言）。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ConversationPanel.tsx src/domain/timeline.ts tests/interaction/cards-from-decision-content.interaction.ts tests/unit/timelineEvents.test.ts
git commit -m "fix(renderer): discard late evidence guides while a decision point is pending (ADR-014)"
```

**Done when**：A7/A8 绿；`grep -n "pendingSendRef" src/renderer/ConversationPanel.tsx` 恰 4 处（decl / flush 读 / flush 置 null / 入队写），**无第五处**（第二入口已删）。

---

## Task 5 · 全链验证与矩阵（不改产品码）

- [ ] **Step 1** 串行全链（坑 p000114）：`npx vitest run` → 双 `tsc --noEmit` → `npx playwright test --project=interaction` → `npx eslint .`。逐条贴**新鲜输出**进 §14。
- [ ] **Step 2** 契约层：`npx vitest run tests/unit/sysPromptConfirmWords.test.ts`（提示词承诺的确认词 ⊆ 词表）——**必须绿**（本批未动词表，只增拒绝词表）。
- [ ] **Step 3** β 反向确认（证伪保护）：`git stash` **禁用**（共享工作树），改用一次性 worktree 复算：`git worktree add /tmp/nf-beta-revert HEAD~4`（或改前基线 commit）在其中跑 `T-BOUND-1 T-STALE-1 T-TRI-1 -g` 取红，跑完 `git worktree remove`。**红→绿对照表**进 §14。
- [ ] **Step 4** 更新 `docs/tests/coverage-matrix.md`：新增 `S7-1' / T-TRI-1 / T-BOUND-1 / T-STALE-1` → 映射「决策点代次绑定」「三态答复」「引导迟到作废」三条规则行。
- [ ] **Step 5** 冒烟（产品行为面）：`npm run e2e` 或至少手动起一次 `bash scripts-cdp/uat-G-persona.mjs`（`NF_UAT_LOCAL=1`）单轮，确认「卡弹出 → 点卡 → 收口」路径无回归。**测完即止，不改码**（ADR-012：冒烟发现的新一律只记录）。
- [ ] **Step 6 Commit**：`git add docs/tests/coverage-matrix.md && git commit -m "test: cover decision-epoch binding and late-guide discard in coverage matrix"`

---

## Task 6 · 规范、ADR、交接（单一写入口）

- [ ] **Step 1** 新 ADR `docs/decisions/014-decision-point-generation-binding.md`（Nygard 模板）：
  - **Status**: `proposed` → 回归轮绿且用户确认后改 `accepted`
  - **背景**：β/p063 + `docs/audits/design-research-stale-input-binding-2026-10-01.md` §1–§7
  - **决策**：D1 三态答复通道（确认词表 / 拒绝词表 / 其余不碰卡）、D2 `decisionEpoch` 单调代次、D3 应用点校验、D4 降级不丢弃、D8 evidence 引导迟到作废、D9 拒绝可见打点
  - **取代**：`intent-confirmation-domain-design.md:215` 的「pending 期任意自由文本＝隐式 reject（C2 归义）」；并声明 `docs/decisions/001-rejectstreak-semantics.md:17` 的「随新提议重置」口径需按 T2 计数重述（001 不删，标注被 014 部分取代）
  - **后果**：`rejectStreak` 不再由文本累积 → 无进展梯度主路径改由 T2 `unresolvedTextReplies`（阈值未动，D11——回归轮取数据后再裁）；S7-1 断言契约翻转
- [ ] **Step 2** 更新 `docs/decisions/000-decision-log.md` 索引表（追加 014 行）。
- [ ] **Step 3** 在 `docs/design/intent-confirmation-domain-design.md:215` 就地加一行指针：`> 2026-10-01 撤销：见 docs/decisions/014（C2 归义废止，改三态答复通道）`——**不删原文**（历史可追溯）。
- [ ] **Step 4** 代码注释订正（避免注释与实现矛盾）：`conversationState.ts:168`「pending 期间的打字拒绝仍走 C2 累积」与 `:248-253` 的 C2 描述，改为「三态答复（014）——拒绝仅词表/按钮命中；rejectStreak 由显式拒绝累积」。**只改注释，不改判定式**。
- [ ] **Step 5** handoff：`python3 …/handoff.py edit t000071 --status <按实际>` + 若引入新坑则 `add pitfall --summary …`；最后 `handoff.py check` 必须 OK。
- [ ] **Step 6 Commit**：`git add docs/decisions docs/design src/domain/conversationState.ts && git commit -m "docs: ADR-014 decision-point generation binding; retire C2 implicit rejection"`

---

## 12. DoD 断言矩阵（闸门口径＝**不新增失败**，非全量全绿）

| # | 断言 | 执行方式（新鲜输出为准） |
|---|---|---|
| A1 | `decisionEpoch` 由 `setPending` 单调递增，同 kind 重提议也递增 | `npx vitest run tests/unit/conversationState.test.ts -t "决策点代次"` 绿 |
| A2 | `isAnswerToCurrent`：缺省真 / kind 不符假 / epoch 不符假 / `pending==='none'` 假 | 同上 |
| A3 | 未命中两词表的文本**不改动卡**（卡保持），文本进模型 | `T-TRI-1`、`S7-1` 绿 |
| A4 | 命中拒绝词表才 `reject(direction)`；命中确认词表才 `confirm` | `T-TRI-1` 两段 + `S7-2` 绿 |
| A5 | 入队文本携带绑定，flush 时换代（同 kind 重提议）不作答复、降级为普通消息 | `T-BOUND-1` 绿且**改前红** |
| A6 | `isConfirmIntent` 判 false 的 β 真语料（「确认，按方案执行」）不再误杀 resolution/plan 卡 | `T-TRI-1` 第一段 |
| A7 | evidence 对账引导在 `pending!=='none'` 时作废，且卡不被打断 | `T-STALE-1` 绿且**改前红** |
| A8 | 作废是**可见事件** `conversation.stale_input_discarded` | `tests/unit/timelineEvents.test.ts` + `T-STALE-1` 打点断言 |
| A9 | 第二写入口已消失（D7/`d000008`） | `grep -c pendingSendRef`＝4；`grep -n "pendingSendRef.current = nudge"` 空 |
| A10 | 提示词承诺确认词仍全 ⊆ 词表 | `sysPromptConfirmWords.test.ts` 绿 |
| A11 | ADR-010 梯度仍可达 forced-clarify（T2 承载） | `forcedClarify` T-FORCE-1..4 全绿 |
| A12 | 全链不新增失败：L1 / 双 tsc / `eslint` 干净；**L3 改后失败清单 ⊆ 改前同次运行清单**（对照用清单，不用历史数字——见 Task 0 漂移说明） | Task 0 与 Task 5 输出逐字对照表（§14） |

---

## 13. 影响矩阵 / 风险

| 面 | 影响 | 风险与对策 |
|---|---|---|
| 产品行为 | pending 期打字「新意图」不再让卡消失——用户须点「修改方案」/词表拒绝或**新提议自然取代** | **R1（中）**：用户以为打了字就改了方案。缓解：卡仍在且内容会被新提议覆盖（`#7-1` 路径）；loop-guard 文案已明说「用户文本回复不能替代结构化确认」（`ConversationPanel.tsx:2168`）。→ 回归轮盯 `.nf-*card` 常驻率 |
| 梯度计数 | `rejectStreak` 不再被文本累积；`unresolvedTextReplies` 才开始真正累积（现网被 `userDecided` 清零） | **R2（中）**：forced-clarify 触发时点变化（1/2 → 2/3 级）。D11 明确**本批不改阈值**，用 T-FORCE 全绿 + 回归轮数据再裁 |
| 引导吞吐 | ③ 守卫落在 `send`，覆盖所有 `evidence` 家族引导 | **R3（低）**：`S4-3` 类「先失败后成功」若被判过宽即停（Task 4 Step 6 显式设卡） |
| 队列 | 单槽载荷换形状；flush 触发点未动 | **R4（低）**：不重复上批 `retry:187` 教训——见 Global Constraints 硬约束 |
| 规范 | C2 撤销触碰 ADR-001/S7 阶段审计口径 | **R5（低）**：历史审计不改写；014 声明「部分取代 001」并在 215 行加指针 |
| 测试 | S7-1 是**契约翻转**（断言取反），非新增覆盖 | **R6**：必须在 §14 明示翻转理由与 ADR 编号，否则后来者读作「测试被弱化」 |
| Mac/UAT | 本批不跑整轮（ADR-012）；回归另开一批 | **R7**：Task 5 Step 5 只允许单轮冒烟且**只记录** |
| L3 基线稳定性 | **src 未变而失败集从 3 → 7**（实测，串行同配置）——该套 L3 对机器负载/时序敏感 | **R8（高·影响闸门）**：① 闸门一律用**同次运行清单对照**，禁引历史数字；② 改前/改后各跑**两次**取交集判"稳定红"，两次结果不一致的例标 `flake?` 并如实记录，不得据单次结果判回归；③ `#7-2` 这类稳定红须登记进 `t000069` 范围（另批修），本批不顺手改 |

---

## 14. 待裁 / 证据表（执行时填写）

**需用户点头才可执行**
1. **S7-1 断言契约翻转**（`:541-569` 整段改写为相反断言）——改测试需明示授权（上批 §14 第 5 项口径）。
2. **D1 拒绝词表内容**：`不要了/算了/取消/不做了/不同意/拒绝/撤回/作废` + 三个整句式（`不要这个方案`/`不同意这个方案`）。要不要再收/再放？
3. **`t000069` 三例预存在红**：本批只登记「维持原红」，不顺手修（依已裁「本批后紧接另开修批」）。确认顺序：先 014 回归，再 `t000069`，再 `t000066`（簇2 门闩）？
4. 14+ commit 未推 origin —— 本批完成后是否 push？（不批则不推）

**证据表（改前/改后）**

| 项 | 改前（Task 0 实测） | 改后（Task 5 实测） |
|---|---|---|
| L1 | **703 passed / 47 files / 0 failed**（2026-10-01 00:41 实测） | _填_ |
| 双 tsc | **0 错**（`TSC-OK`） | _填_ |
| L3 passed/failed | _填（Task 0 Step 1 后台跑批中，出数即录）_ | _填_ |
| L3 失败清单 | _填（须含 t000069 三例，否则如实记录差异）_ | _填（须 ⊆ 改前）_ |
| T-BOUND-1 / T-STALE-1 / T-TRI-1 | 红（Step 2 记录） | 绿 |
| β 真语料「确认，按方案执行」对卡的作用 | 拒卡 | 不碰卡 |

---

## 15. 明确不做（本批范围外）

- 多槽/数组队列（`t000068`/RC3——RCA 判方向反转）。
- flush 触发点改造（边缘 flush——上批实测破 `retry:187`）。
- `isConfirmIntent` 词表加宽（`sysPromptConfirmWords.test.ts` 是提示词契约的机器锁；本批只**加**拒绝词表）。
- **one-shot 消费**（外部 arXiv 2609.21081 + crush「already been resolved or is unknown」/opencode TTL+id 去重）：**不新增令牌**——本设计已由 `userDecided`/`approvalDecided` 的 `pending → 'none'` 单向转换结构性满足：决策点一经消费，`isAnswerToCurrent` 恒假（`s.pending==='none'`）且路由块整体跳过，第二条答复无处落地。`T-BOUND-1` 的「卡未被双确认」隐含覆盖此不变量。若日后 approval 升级为 `toolCallId` 级配对（上条），one-shot 需按 id 显式化。
- 授权（approval）答复改由 `toolCallId` 精确配对（外部主流形态，codex/reasonix/crush）——本批先用 `decisionEpoch` 覆盖同族风险；**id 级配对列为后续独立叶**（若回归轮出现 approval 错挂，升 P1 立即另批做）。
- 簇2 门闩放行口径（`t000066` 后半）、`t000069` 三红、L5 视觉基线、整轮 UAT（ADR-012）。
- 状态栏文案锚定 `data-nf-status`（上批转裁决第 2 项，仍待裁）。
