# 强制澄清机制（ADR-010）+ A-025/A-024 放大器修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「无进展对话的强制结构化澄清」四级梯度（T1/T2 触发 → loop guard → 强制 ask_user 卡 → needs-human），并修复 UAT-Sim 发现的 A-025（resolution 边界 plan 卡不渲染）与 A-024 放大器（gateway 400 确认路径无重试）——使小白/矛盾/沉默等真实用户人格不再陷入确认循环。

**Architecture:** 纯扩展不重构——system_clarify 作为新 DecisionKind 进入既有单一 PENDING 状态机（setPendingState 唯一入口不变）；触发器为 conversationState 两个纯计数器 + agentLoop 旁的纯函数判定器；loop guard 复用回填引导注入通道；强制卡在 renderer 悬浮于输入框上方但不锁输入。依赖关系：Task 1（gateway）独立 → Task 2（计数器+判定器）→ Task 3（state kind）→ Task 4（渲染+接线）→ Task 5（sysPrompt）→ Task 6（回归+矩阵）。

**Tech Stack:** TypeScript（domain 纯函数 + React renderer）、vitest（L1）、playwright interaction（L3）、 timeline 事件注册表。

## Global Constraints

- 不变量 1-8 不动：状态推进唯一入口 userDecided；单一 PENDING；卡渲染唯一依据 = pending + decisionContent
- 拒绝必须带 RejectReason（不变量 8——「重新描述」按钮走 reject({kind:'direction'})）
- timeline 新事件必须进 `src/domain/timeline.ts` 注册表（type union + detailKeys 两处）+ schema 断言测试
- 每个 Task 收尾跑 `cd apps/desktop && npx vitest run && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`（L2 双跑）
- Conventional Commits；UAT 红线 R4 豁免规则随 Task 6 更新进 `.scratch/neonforge-v1/uat-sim-20260907.md`
- 参考依据：`research/uat-forced-clarify-research-20260907.md`（设计+影响范围）

---

### Task 1: gateway http-400 单次重试（A-024 放大器）

**Files:**
- Modify: `apps/desktop/src/main/gateway.ts`（chat 流式请求函数，`throw new GatewayHttpError(res.status)` 处，约 :476）
- Test: `apps/desktop/tests/unit/gatewayRetry.test.ts`（新建，mock fetch）

**Interfaces:**
- Produces: `streamChat()`（现有导出名以代码为准）内部对 `GatewayHttpError(status===400)` 恰好重试一次；两次 400 仍抛出（防确定性 payload bug 被掩盖）。不改变 401/5xx 现有语义。

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/gatewayRetry.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('gateway chat http-400 单次重试（A-024 放大器）', () => {
  it('400 后重试一次成功 → 正常返回', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))
      .mockResolvedValueOnce(new Response(sseStreamBody(), { status: 200 })) // 合法 SSE 体
    // 以依赖注入或 vi.stubGlobal('fetch', fetchMock) 替换——按 gateway.ts 现有可测缝接入
    // 断言：fetch 被调 2 次；流式回调收到 done
  })
  it('连续两次 400 → 抛 GatewayHttpError(400)', async () => {
    // fetch 两次都 400 → await expect(...).rejects.toThrow(/400/)
  })
  it('401 不重试（key-invalid 语义保持）', async () => {
    // fetch 一次 401 → 抛 401；fetch 仅调 1 次
  })
})
```

（`sseStreamBody()` = gateway.ts 现有测试或实现中 SSE data 行样例；无样例则用最小 `data: {"delta":{"content":"x"}}\n\ndata: [DONE]\n\n` 对齐实现解析格式。）

- [ ] **Step 2: 跑测试确认失败**（`npx vitest run tests/unit/gatewayRetry.test.ts` → FAIL：无重试行为）
- [ ] **Step 3: 最小实现**——在 streamChat 外层包重试（示例）：

```ts
// gateway.ts streamChat 入口处
let attempt = 0
while (true) {
  attempt++
  try {
    return await this.streamChatOnce(payload, opts)   // 原函数体改名 Once
  } catch (e) {
    // A-024 放大器：上游瞬态 400 杀死确认回合 → 重提议循环。恰重试一次；连续 400 仍抛（不掩盖确定性 bug）
    if (e instanceof GatewayHttpError && e.status === 400 && attempt === 1) {
      console.log('[gateway] http-400 transient — retrying once')
      continue
    }
    throw e
  }
}
```

- [ ] **Step 4: 测试通过** + L2 双 tsc
- [ ] **Step 5: Commit** `fix: gateway chat http-400 单次重试——确认回合不被瞬态上游错误杀死（A-024 放大器）`

---

### Task 2: T1/T2 计数器 + detectUnproductiveDialogue 纯函数

**Files:**
- Modify: `apps/desktop/src/domain/conversationState.ts`（state 字段 + 两个计数纯函数 + 判定器）
- Test: `apps/desktop/tests/unit/conversationState.test.ts`（追加 describe）

**Interfaces:**
- Produces:
  - state 新字段：`pendingRepeatCount: number`（T1——同 kind 连续 pending_set 次数）、`unresolvedTextReplies: number`（T2——pending 存在期间用户连续文本回复数）
  - `notePendingSet(s, kind): ConversationState`（kind 同上轮 → 计数+1；换 kind 或 none → 清零）
  - `noteUserTextReply(s): ConversationState`（pending!=='none' 时 +1；否则清零）
  - `detectUnproductiveDialogue(s): 'loop-guard' | 'forced-clarify' | null`（T1≥2 或 T2≥2 → 'loop-guard'；≥3 → 'forced-clarify'；否则 null）
  - T4 总回合软上限（40 轮）由 `detectUnproductiveDialogue` 第 4 参 `turnCount` 接入：≥40 → 直接 'forced-clarify'（goose 1000 过宽、swe-agent 熔断过窄的折中——UAT 实测单任务 10-20 回合饱和）

- [ ] **Step 1: 写失败测试**

```ts
describe('无进展对话检测（ADR-010 T1/T2）', () => {
  it('T1：同 kind 连续 pending_set 2 次 → loop-guard，3 次 → forced-clarify', () => {
    let s = initialState()
    s = notePendingSet(s, 'goal'); s = notePendingSet(s, 'goal')
    expect(detectUnproductiveDialogue(s)).toBe('loop-guard')
    s = notePendingSet(s, 'goal')
    expect(detectUnproductiveDialogue(s)).toBe('forced-clarify')
  })
  it('T1：换 kind 清零', () => {
    let s = initialState()
    s = notePendingSet(s, 'goal'); s = notePendingSet(s, 'plan')
    expect(detectUnproductiveDialogue(s)).toBeNull()
  })
  it('T2：pending 期间用户文本回复 2 条 → loop-guard', () => {
    let s = initialState()
    s = notePendingSet(s, 'goal')
    s = noteUserTextReply(s); s = noteUserTextReply(s)
    expect(detectUnproductiveDialogue(s)).toBe('loop-guard')
  })
  it('用户决策（userDecided）后两类计数清零', () => {
    // pending goal → noteUserTextReply ×2 → userDecided('goal', confirm) → 计数全 0
  })
})
```

- [ ] **Step 2: 失败确认** → **Step 3: 实现**（`pendingRepeatCount/unresolvedTextReplies` 加入 state 接口与 `initialState`；计数清零点：`userDecided` 成功分支内两计数=0）→ **Step 4: 通过** → **Step 5: Commit** `feat: 无进展对话计数器与判定器（ADR-010 T1/T2）`

---

### Task 3: system_clarify 决策点（状态机 + timeline 事件）

**Files:**
- Modify: `src/domain/conversationState.ts`（DecisionKind union + userDecided 分支）
- Modify: `src/domain/timeline.ts`（3 新事件）
- Test: `tests/unit/conversationState.test.ts`、`tests/unit/timelineEvents.test.ts`

**Interfaces:**
- Produces:
  - `DecisionKind += 'system_clarify'`；decisionContent 形如 `{ kind: 'system_clarify', proposal: { underlying: 'goal'|'plan'|'resolution', statement: string } }`
  - `userDecided('system_clarify', {confirm:true})` → 清 pending + 按 `underlying` 委派确认（underlying='goal' → 等价 confirm('goal')；'plan' → confirm('plan')）；reject → 等价 reject(underlying, {kind:'direction'})；两计数清零
  - timeline：`dialogue.loop_guard`（detailKeys: ['rounds']）、`dialogue.forced_clarify`（['underlying']）、`dialogue.needs_human`（['reason']）

- [ ] **Step 1: 失败测试**

```ts
it('system_clarify 确认 → 委派 underlying=goal 确认且计数清零', () => {
  let s = initialState()
  s = notePendingSet(s, 'goal')   // proposal.goal 已在
  s = setPendingSystemClarify(s, 'goal', '做一个番茄钟')
  s = userDecided(s, 'system_clarify', { confirm: true })
  expect(s.goalConfirmed).toBe(true)
  expect(s.pending).toBe('none')
  expect(s.pendingRepeatCount).toBe(0)
})
it('system_clarify 拒绝 → 委派 underlying 拒绝（不变量 8：必须带 reason）', () => {
  // reject 分支 expect(() => userDecided(s,'system_clarify',{confirm:false})).toThrow()（无 reason）
  // 带 reason → goalRejected 语义 + s.pending 'none'
})
```

（`setPendingSystemClarify` = renderer setPendingState('system_clarify', …) 的领域侧等价——实现时若 renderer setPendingState 已是通用入口，则本函数仅为测试便利包装。）

- [ ] **Step 2: 失败** → **Step 3: 实现**（union/分支/3 事件注册）→ **Step 4: 通过 + timeline schema 断言**（detailKeys 匹配——对齐 timelineEvents.test 既有模式）→ **Step 5: Commit** `feat: system_clarify 决策点与 dialogue 事件（ADR-010）`

---

### Task 4: renderer 接线——loop guard 注入 + 强制卡渲染

**Files:**
- Modify: `src/renderer/ConversationPanel.tsx`（触发接线 + 强制卡 JSX）
- Modify: `src/renderer/MainWorkspace.tsx`（悬浮样式挂载点）
- Modify: `apps/desktop/src/renderer/styles.css`（`.nf-forcedcard` 悬浮样式）
- Test: `tests/interaction/forcedClarify.interaction.ts`（新建 L3）

**Interfaces:**
- Consumes: Task 2 `detectUnproductiveDialogue`、Task 3 setPendingState('system_clarify')
- Produces:
  - 触发点 1（loop guard）：`execution.forced` 处理路径（ConversationPanel :1825 附近 forceInput 组装处）——`detectUnproductiveDialogue(stateRef.current)==='loop-guard'` 时注入一条 system 文本（`【系统对账·非用户发言】对话出现循环：用户文本不能替代结构化确认。请停止重提议，引导用户点击界面上的确认卡。`）+ `tlog('dialogue.loop_guard', { rounds }, 'system')`
  - 触发点 2（强制卡）：`'forced-clarify'` 时 `setPendingState('system_clarify', { proposal: { underlying: <当前 pending kind>, statement: <decisionContent 快照或 lastAssistant 摘要> } })` + `tlog('dialogue.forced_clarify', { underlying })`；`needs-human` → 既有 escalate 路径
  - 强制卡渲染（2350 行区卡渲染 IIFE 内新分支，条件 `dcKind === 'system_clarify'`）：三按钮映射

```tsx
{dcKind === 'system_clarify' && (
  <div className="nf-forcedcard" role="alertdialog" aria-label="需要你做出选择">
    <div className="nf-forcedcard__head">对话出现循环——请直接选择（输入框暂不可用替代确认）</div>
    <div>{(stateRef.current.decisionContent.proposal as { statement: string }).statement}</div>
    <div className="nf-forcedcard__actions">
      <button onClick={() => { confirm('system_clarify'); /* 委派 underlying 确认 */ }}>确认执行</button>
      <button onClick={() => { reject('system_clarify', { kind: 'direction' }); inputRef.current = ''; focusInput() }}>我要重新描述</button>
      <button onClick={() => { confirm('system_clarify'); onFullAuthority?.() }}>由搭档全权决定</button>
    </div>
  </div>
)}
```

  - 输入框**不锁定**（openhands 教训）：仅 pending==='system_clarify' 时 placeholder 替换为「请先在上方卡片做出选择（文字回复不能替代确认）」
  - 恢复快照：decisionContent 快照机制自动覆盖新 kind（useConversationState 恢复路径无需改逻辑，补断言即可）

- [ ] **Step 1: 写失败 L3**

```ts
// tests/interaction/forcedClarify.interaction.ts
// T-FORCE-1：mockBridge 驱动——同 kind pending_set ×2 + 用户文本回复 ×2 → 出现 .nf-forcedcard（T2 路径）
// T-FORCE-2：点「确认执行」→ pending 清空 + goalConfirmed true（underlying=goal 委派）
// T-FORCE-3：点「我要重新描述」→ 卡消失 + 输入框聚焦（focus 断言）
// T-FORCE-4：重启恢复——sessionStore 带 system_clarify 快照 → 重载后卡重显
```

（复用 `tests/interaction/` 既有 mockBridge 模式——参照硬序门时序测试的桥接写法。）

- [ ] **Step 2: 失败** → **Step 3: 实现接线与渲染** → **Step 4: L3 通过 + L1 回归** → **Step 5: Commit** `feat: 强制澄清卡渲染与 loop guard 注入（ADR-010 T2 二级介入）`

---

### Task 5: sysPrompt 约束（暗号禁令 + 证据格式收口）

**Files:**
- Modify: `src/renderer/sysPrompt.ts`
- Test: `tests/unit/sysPrompt.test.ts`（追加断言）

**Interfaces:**
- Produces: 系统提示词新增两条硬约束（编号顺延现有 ⑮ 式清单）：
  - ⑯ 用户文本回复**永远不构成**结构化确认——不得要求用户「输入特定文字/暗号」来确认，必须引导用户点击界面确认卡；检测到用户疑似确认意图时，提示其点击卡上的按钮
  - ⑰ `verification` 证据**只能是实际执行过的只读 shell 命令**（ls/cat/curl/grep 等），禁止填入 read/write/open/edit 等工具调用名

- [ ] **Step 1: 失败测试**（断言 sysPrompt 输出含「暗号」禁令句与「只读 shell 命令」句）
- [ ] **Step 2: 失败** → **Step 3: 实现**（两句话术入常量清单）→ **Step 4: 通过** → **Step 5: Commit** `feat: sysPrompt 禁止确认暗号话术 + verification 只收只读命令（A-024/recorded #4）`

---

### Task 6: 回归 + 覆盖矩阵 + UAT 红线豁免更新

**Files:**
- Modify: `docs/tests/coverage-matrix.md`（表 6 扩 2 行：对话健康度 ↔ forcedClarify 测试）
- Modify: `.scratch/neonforge-v1/uat-sim-20260907.md`（R4 豁免：decision.requested 后 100 事件内出现 dialogue.forced_clarify = 已介入）
- Modify: `.scratch/neonforge-v1/audit-items/A-024*.md`、`A-025*.md`（关闭证据回填）

- [ ] **Step 1: 全量回归**（串行）：`npx vitest run`（基线 565 + 本轮新增 ≥8）→ `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` → `npx playwright test --project=interaction`（基线 66 + 新 ≥2）→ `npx eslint .`（0 errors）
- [ ] **Step 2: 覆盖矩阵 + 红线豁免 + 审计关闭证据回填**
- [ ] **Step 3: Commit** `test: ADR-010 覆盖矩阵与 UAT 红线豁免更新` + `git push origin main`
- [ ] **Step 4: Mac 真机部署**（runbook：stash→pull→pop → `npm run dist` 或 asar 重打包路径（坑 123）→ asar grep 关键符号 → CDP 重启）——验证 UAT 场景 A 复现路径（小白打字确认 → loop guard → 强制卡）真机可走通
- [ ] **Step 5: UAT-Sim 二轮补测**（G-picky / G-boundary / G-impatient 插话探针——按 uat-sim 文档场景矩阵）
