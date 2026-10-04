# 幽灵占位 / busy 同源 / 排队死信 修批方案（Task7 裁决落地）

> **Status: superseded**（2026-10-01）——本版为骨架草稿：占位 id 追踪、busy 同族调用点清点、簇 3 取证判别均缺失。
> **实施以 [`2026-10-01-ghost-busy-deadletter-fix-v2.md`](./2026-10-01-ghost-busy-deadletter-fix-v2.md) 为准**；本文件保留作对照，勿据以开码。

> **For agentic workers:** REQUIRED WORKFLOW: implement **one task at a time** with review gates. Steps use checkbox (`- [ ]`).
> **来源裁决（2026-10-01，用户）**：批准 **RC1a（产品 P0）+ RC1b（harness P1，仅同源）+ RC3（产品 P1）** 同批开修；
> **簇 2 busy 门闩放行口径**（决策卡点选 / 预排插话 / 探针）**本轮不动**，待 RC1a 落地复测后再裁；
> **P2 观察项 t000068**（排队即显气泡、ask_user 已选高亮）**不修**。
> **根因权威：** [`审计 RCA 翻案`](../../audits/uat-domain-drift-remeasure-2026-10-01.md)（簇1=RC1a×RC1b · 簇3=RC3 · 簇2=方案口径）
> **上一批：** [`2026-10-01-domain-drift-fix.md`](./2026-10-01-domain-drift-fix.md)（Task 7 复测 FAIL 停等 → 本文承接）
> **硬闸：** ADR-012（测批只记；本批=处置轮；复测另开回归轮）· ADR-013（busy/静默通道正文不改）· ADR-010（四级梯度语义不改）

**Goal:** 消除簇 1（5/8 失败）与簇 3（1/8）的产品+harness 双根因；把 busy 判定从「整页文本正则」改为「状态栏同源」，
使关单复测的 timeout/收口 FAIL 不再由假 busy 造成。**不改门闩放行策略**（留待下轮裁决）。

**Architecture（任务独立性硬规则，沿用上一批）：**

1. 每个 Task 自包含：只改本 Task「独占区」列出的文件/行块。
2. 禁止「依赖 Task N」——语义必须同批就合并进同一 Task。
3. `ConversationPanel.tsx` 按独占区划分（Task 1 / Task 3 不触碰同一函数）。
4. 执行顺序仅排期提示，不是依赖边。

| Task | 独占区（互不交叉） | 根因 |
|------|-------------------|------|
| 1 幽灵占位清理 | Panel **`runChat` 两处裸 return**（`depth>40` L1997-2003 / `forced-clarify` L2164-2179）+ 新私有 helper `finalizeOrphanStream`（定义紧邻 `finishError` L2686） | **RC1a** |
| 2 busy 同源 | **仅** `scripts-cdp/uat-lib.mjs`（L619-626 / L1041-1049 / L891-892）+ `cdp-lib.mjs` 新 helper `statusText` | **RC1b** |
| 3 排队多槽 + idle 触发 | Panel **`pendingSendRef` L755 / 写入点 L806·L2435 / `flushPendingSend` L2403-2409 / working effect L2289-2292 / `send` finally L2596-2601** | **RC3** |
| 4 本地验证链 | 只跑不改（vitest / 双 tsc / interaction / eslint） | — |
| 5 Mac 回归轮 | **只记**（`docs/audits/uat-ghost-busy-remeasure-2026-10-*.md`）+ dist/跑测，不改产品与 harness | ADR-012 |

**Tech Stack:** Electron/React · Vitest · Playwright interaction（`--project=interaction`）· CDP UAT harness（Mac）· ADR-012/013

## Global Constraints

- ADR-012：Tasks 1–3 改码；Task 5 **只记复测**，未达标停等裁决（簇 2 口径即下一刀裁决项）。
- **不改**门闩策略：`busy → skip-act + continue`（uat-lib L686-691）与「半门闩禁止」原样保留；本轮只换 busy 的**读取源**。
- **不改** `shouldQueueWhileBusy`（`busyGate.ts` 语义 = ADR-013，单测已覆盖）；**不改** `detectUnproductiveDialogue` 判据。
- 不新增 test hook 到产品（RC1b 走状态栏同源，零产品改动；`data-*` hook 方案已否——为测试改产品面不在本轮授权范围）。
- 不恢复 silent-interrupt、不扩工具白名单、不缩人格池。
- 关单硬闸不变：`pass≥10/12` ∧ `收口失败=0` ∧ `环境失败≤2` ∧ T1–T4 全绿。
- 实施勿改本 plan（审计回写除外）。

---

## Task 1 · RC1a：forced-clarify / 轮次兜底 裸 return 前清理流式占位

**症状 → 根因**：`send()` L2494-2497 push 空内容 `status:'streaming'` 占位（渲染「搭档处理中…」L2847）。
`runChat` 的 `forced-clarify` 分支 L2179 **裸 return**（不进模型、不经 done/maybeContinue）→ 占位无人收尾 →
**幽灵气泡永久残留**；此时状态栏已「就绪」、卡已 done（p063/p065/p066/p060 坐实，p110 同形态）。
同族裸退还有 `depth > 40` L1997-2003（只释放 working，不清占位）——**同一 helper 一并覆盖，别只修工单点名的分支**。
对照：`loop-guard` 不 return（继续进模型）、`finishError` 有收尾（L2711-2718）——唯裸 return 路径漏。

- [ ] **Step 1 — 写失败断言（L3 interaction，先红）**
  `tests/interaction/forcedClarify.interaction.ts` 追加 `T-FORCE-5`：复用 `loopScript()`，
  第三次文本回复后等 `.nf-forcedcard` 可见，断言
  ① `page.locator('.nf-statusbar__left')`（`getByRole('status')`）含「就绪」**且**
  ② 消息流内无幽灵：`await expect(page.locator('.nf-msg .nf-msg__body--thinking')).toHaveCount(0)`，
  并 `await expect(page.locator('.nf-msg', { hasText: '搭档处理中…' })).toHaveCount(0)`
  （状态栏那份「搭档处理中…」不在 `.nf-msg` 内，选择器天然区分）。
  另在 `depth>40` 兜底不可在 interaction 内廉价触达 → 该路径仅由 helper 覆盖，不为其新造用例（YAGNI，注释指向本 Task）。

- [ ] **Step 2 — 实现 helper（紧邻 `finishError`，沿用其 `messagesRef` 同步写法）**

```ts
// RC1a（2026-10-01 复测簇1）：runChat 裸 return 前收尾本轮占位——否则空流式气泡永久渲染「搭档处理中…」
// 只处理「本轮遗留」：空内容且无 toolCalls → 移除（幽灵无信息量，卡已给出引导）；有内容/有工具卡 → 转 done
const finalizeOrphanStream = (sid: number): void => {
  if (streamingSidRef.current !== sid) return // 并发新会话（stop/新 send）已接管——勿动他人占位
  const prev = messagesRef.current
  const last = prev[prev.length - 1]
  if (!last || last.role !== 'assistant' || last.status !== 'streaming') return
  const hasPayload = Boolean(last.content?.trim()) || (last.toolCalls?.length ?? 0) > 0
  const nextMsgs = hasPayload
    ? [...prev.slice(0, -1), { ...last, status: 'done' as const }]
    : prev.slice(0, -1)
  messagesRef.current = nextMsgs
  setMessages(nextMsgs)
}
```

- [ ] **Step 3 — 两处裸 return 前调用**
  ① `forced-clarify`：L2179 `return` 前 `finalizeOrphanStream(sid)`（卡已 `setPendingState('system_clarify')`，UI 只剩卡=干净等待态）。
  ② `depth > 40`：L1999 `setWorking(false)` 之前同样调用（该函数签名已有 `sid`）。

- [ ] **Step 4 — 本地验证**：`npx vitest run`（不新增单测——纯 UI 收尾）+ `npx playwright test --project=interaction tests/interaction/forcedClarify.interaction.ts`（T-FORCE-5 由红转绿，T-FORCE-1..4 不回归）+ 双 `tsc --noEmit`。
- [ ] **Step 5 — Commit**：`fix(renderer): finalize streaming placeholder before forced-clarify/depth bail (RC1a)`

**Done when**：T-FORCE-5 绿；强制卡出现后消息流无「搭档处理中…」幽灵且状态栏=就绪；既有 4 例 T-FORCE 不回归。

---

## Task 2 · RC1b：harness busy 判定改状态栏同源（**只换源，不改门闩策略**）

**根因**：`isModelBusy` = `dump(page)`（`document.body.innerText`，cdp-lib L19-21）+ 全文正则
`/搭档处理中|处理中|思考中|生成中|正在回复|Streaming/i`（uat-lib L622）。幽灵/历史气泡/模型正文（「正在生成中…」）
都能命中 → **永久假 busy** → `skip-act + continue`（L686-691）死锁 → 4×timeout + p110 收口 FAIL。
权威 busy 单源 = 状态栏（`MainWorkspace.tsx` L427-452：`role="status"`，working→「搭档处理中…」/ 否则「就绪」/审批/提示）。
plan-audit 原话「modelBusy 与产品 busy 同源仍差一步（UI 正则）」在本 Task 补齐这一步。

- [ ] **Step 1 — `cdp-lib.mjs` 加同源读取**

```js
// busy 同源：只读状态栏（.nf-statusbar__left / role=status），勿用整页 innerText——幽灵与模型正文会伪装 busy
export async function statusText(page) {
  try {
    return await page.locator('.nf-statusbar__left').first().innerText({ timeout: 2000 })
  } catch {
    return ''
  }
}
```

- [ ] **Step 2 — 三处调用点换源（同文件同语义，逐条替换）**
  ① L619-626 `isModelBusy` → `return /搭档处理中/.test(await statusText(page))`（丢 `dump` + 宽 token；`catch` 保持 false）。
  ② L1041-1047 `stuckIdle` 早停内联正则 → 复用 `isModelBusy(page)`（**去重复**：两处正则本是同一判据）。
  ③ L891-892 急躁插话门 `ui.includes('搭档处理中')` → `await statusText(page)`。
  **不动**：L686-691 门闩（busy→skip-act+nudge+continue）、半门闩禁令、决策卡/插话/探针的放行策略（簇 2 = 下轮裁决）。

- [ ] **Step 3 — 静态自检**：`node --check scripts-cdp/cdp-lib.mjs && node --check scripts-cdp/uat-lib.mjs`；
  `grep -n "处理中|思考中|生成中" scripts-cdp/*.mjs` 应为 0 命中（全文正则已根除）。
- [ ] **Step 4 — Commit**：`test(uat): busy detection reads statusbar single source, drop whole-page regex (RC1b)`

**Done when**：harness 内无任何整页 busy 正则；行为断言（门闩/早停/插话）语义只依赖状态栏；
即使产品侧仍有幽灵（Task 1 未合入时）也不误判 busy。

---

## Task 3 · RC3：排队槽改数组 + idle 边缘触发 flush（消死信、消静默覆盖）

**根因（p119 坐实）**：nudge 走 `void sendRef({silent:true,text})`；`workingRef.current` 为真时写**单槽**
`pendingSendRef`（L806 对账引导 / L2435 send 排队）。**唯一 flush** 在 `send` finally（L2600 → L2403-2409，**同步读槽**）。
链 unwind 与流式 done 回调并发：nudge 晚入槽一瞬间 → 无链在跑、无 watcher、无重试 → **死信**（nudge 后零事件）。
同族第二缺陷：`pendingSendRef.current = text` **覆盖**上一条（观察 1-③）。

- [ ] **Step 1 — 写失败断言（L3 interaction，先红）**
  `tests/interaction/retry.interaction.ts` 或新 `queue.interaction.ts` 二选一（就近优先）：
  · `T-QUEUE-1`（覆盖丢失）：busy 中排队两条文本 → 断言两条**都**作为用户气泡出现且顺序保持（现只到第二条）。
  · `T-QUEUE-2`（死信）：回合结束边缘写入排队（用 silent 系统提示文本触发 `isSystemNudgeText` 通道）→
    断言其后仍出现 `conversation.assistant_start` 事件 / 第二条模型回合（现零事件）。
  mock 桥能力不足时（`installMockBridge` 脚本化回合）用**已 done 的长回合**制造 working 窗口；
  若 `T-QUEUE-2` 在 mock 下不可达，降级为 `T-QUEUE-1` + Mac 复测覆盖 p119 形态，并在审计里注明（勿造脆断言）。

- [ ] **Step 2 — 队列化 + 单触发点**

```ts
// RC3：多槽排队（原单槽静默覆盖）+ idle 边缘触发 flush（原唯一 flush 在 send finally，晚入槽即死信）
const pendingSendRef = useRef<string[]>([])

const flushPendingSend = () => {
  const [next, ...rest] = pendingSendRef.current
  if (!next) return
  pendingSendRef.current = rest // 一次一条：本条把 working 置真，其余等下一次 idle 边缘
  // 直送——不经输入框（避免 pending 文案闪进 textarea）；silent 由 send 内 isSystemNudgeText 重新判定
  setTimeout(() => void sendRef.current({ text: next }), 50)
}
```

写入点两处改 `push`：L806 `pendingSendRef.current.push(nudge)`、L2435 `pendingSendRef.current.push(text)`。

- [ ] **Step 3 — 触发点从 send finally 移到 working 边缘（单源，删重复触发）**

```ts
const workingRef = useRef(false)
useEffect(() => {
  workingRef.current = working
  // RC3：idle 边缘 flush——晚于旧 flush 同步读点的入槽不再死信
  if (!working) flushPendingSend()
}, [working])
```

并删除 `send` finally（L2600）里的 `flushPendingSend()` 调用——**保留一个触发点**，避免同一边缘双发（两条被同时排入 → 并发占位）。
`stopGeneration`（L2389-2391）`setWorking(false)` 会走同一边缘 → 停止后排队照旧衔接（与既有行为一致，非新语义）。

- [ ] **Step 4 — 本地验证**：`npx vitest run`（busyGate 单测不变须绿）+ `npx playwright test --project=interaction`（全量不回归 + T-QUEUE 绿）+ 双 `tsc --noEmit` + `npx eslint .`。
- [ ] **Step 5 — Commit**：`fix(renderer): queue pending sends in an array and flush on idle edge (RC3)`

**Done when**：busy 中多条消息不丢失、不死信；回合结束自动衔接下一条；L3 全量绿。

---

## Task 4 · 本地验证链（串行，勿并行——坑 p000114）

- [ ] `cd apps/desktop && env -u NODE_ENV npx vitest run`
- [ ] `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- [ ] `npx playwright test --project=interaction`
- [ ] `npx eslint .`
- [ ] `python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py" check`（改 handoff 后必查）

## Task 5 · Mac 回归轮（**另开，只记不改**——ADR-012）

- [ ] 部署：`git diff` + scp 补丁直传（坑 p000119/p000126/p000131：`Host mac` = `sin@192.168.31.229`）→ Mac 侧 `npm run dist`（坑 p000116）→ **asar grep 关键符号**：`finalizeOrphanStream` / `pendingSendRef.current.push` / `statusText`。
- [ ] 前置体检：`/tmp/nf-uat-main3r/node_modules/.bin` 是否在（坑 p000137，缺则 `npm install`）。
- [ ] 跑：`NF_UAT_SEED=12 bash scripts-cdp/run-uat-persona-pool.sh`（同 seed 便于与 Task7 逐条对照）+ `run-uat-tiers.sh`（T1–T4）。
- [ ] 取证：CDP DOM 探针（坑 p000139——渲染层日志不进 stdout；探针脚本放项目目录内跑，坑 p000138）。
- [ ] 记录到 `docs/audits/uat-ghost-busy-remeasure-2026-10-<dd>.md`：簇 1 是否清零、簇 3 是否清零、
  **簇 2 在 busy 同源后命中率如何**（这是下轮口径裁决的证据）、新簇只记不修。
- [ ] 汇总 → 汇报 → **等裁决**。硬闸未达标不以「修到绿」为完成态。

---

## Deferred（本轮明确不做，勿顺手扩）

| 项 | 状态 | 依据 |
|----|------|------|
| 簇 2 busy 门闩放行「决策卡点选 / 预排插话 / 探针」 | **待 RC1a+RC1b 复测后再裁** | 用户裁决（本轮只做同源，不改策略） |
| 排队即显气泡 / 「排队中」指示（`ConversationPanel` L2483 之后才 push 用户气泡） | 不修 | t000068 P2，未获裁决 |
| `ask_user` 卡已选高亮（chosen 仅 `<candidates>` 有） | 不修 | t000068 P2 |
| 产品侧 test hook（`window.__nfBusy` 之类） | 否决 | 零产品改动即可同源（Task 2） |

## 风险与兜底

- Task 1 helper 若命中「有 toolCalls 的流式消息」→ 走 `done` 分支不删除（工具卡不丢）。
- Task 3 单触发点若与 `acquireChain` 互斥叠加导致某条排队在下次边缘未清 → 队列语义保证不丢（只延一回合），不死锁：边缘由 `working` 状态驱动，任何回合结束都会再触发。
- 簇 1 若 p110（收口卡形态）在 RC1a 后仍复现 → 说明另有裸退路径，回归轮记新叶因，不在本批临修（ADR-012）。
