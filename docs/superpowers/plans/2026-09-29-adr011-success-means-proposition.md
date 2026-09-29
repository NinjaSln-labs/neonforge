# ADR-011 成功＝领域命题成立 Implementation Plan

> **For agentic workers:** REQUIRED WORKFLOW: implement this plan task-by-task — either dispatch a fresh subagent per task with a review gate between tasks (recommended), or execute inline with checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 ADR-011 把「成功」从外壳返回/退出码改回领域命题成立：V1a stdout 对账、unverifiable 仅标注、工具内层失败透明、探活=真实搜索路径、goal 后可续 service 一次；设计文档与谓词单源对齐后 Mac 复跑 t000057。

**Architecture:** 谓词只改 `evidenceVerifiable` / `verifyCompletion.ok` 一处（仍单源）；代跑仍在 `verification.ts` 出 `{ok,output}`，claim 对齐在领域层；Registry / 探活 / finishError / harness 各一处最小补丁。不放宽空 verification，不删证据门。

**Tech Stack:** Electron desktop (`apps/desktop`)；Vitest L1；Playwright interaction（仅若已有 service 续跑用例）；CDP UAT harness (`scripts-cdp/uat-lib.mjs`)。

## Global Constraints

- Spec = `docs/decisions/011-success-means-proposition.md`（accepted）；门口槛 p000128 / d000002：本轮是设计正文自相矛盾收口，不是为绿改门。
- 不放宽 `verifyCompletion` 空 verification；不改 StuckDetector；不 force `propose_goal`；不删证据门（ADR-011 §7）。
- `evidenceVerifiable` / `completionEvidenceComplete` / `verifyCompletion.ok` 禁止再分叉（ADR-011 §3）。
- 凭据只引用环境变量或本机路径，不写值。
- 提交用 Conventional Commits；未明确要求不 commit 则跳过 commit 步、把 diff 留给用户。
- cwd 验证：`apps/desktop`（`npx vitest run …`）。

## File map

| File | Responsibility |
|------|----------------|
| `docs/design/intent-confirmation-domain-design.md` | Inv4 / §2 Evidence / §3.3 ok 条件 → ADR-011 谓词 |
| `docs/decisions/003-invariant4-single-source.md` | Decision 正文改「≥1 条可代跑」 |
| `docs/decisions/008-pending-questions-non-blocking.md` | blockers 修订注 → ADR-011 |
| `docs/domain/00-domain-authority.md` §4.2 | 清掉 pendingQuestions 阻塞 + 对齐谓词 |
| `docs/domain/02-domain-model.md` | verifyCompletion 行「未核验」措辞 |
| `docs/product/02-components.md` | 已解决卡「未核验项」≠卡不弹 |
| `docs/product/07-success-metrics.md` | 通过率口径 |
| `docs/domain/04-tactical-design.md` / `docs/tests/coverage-matrix.md` | 一句指针 |
| `apps/desktop/src/domain/conversationState.ts` | `evidenceVerifiable` + `verifyCompletion.ok` + stdout 对齐 + 回填文案 |
| `apps/desktop/src/main/verification.ts` | `runOne`：失败时仍优先带 stdout（grep -c） |
| `apps/desktop/src/main/tools.ts` | Registry 内层 `{ok:false}` → 外层 false |
| `apps/desktop/src/main/webTools.ts` | probe = DDG 搜索路径 |
| `apps/desktop/src/renderer/ConversationPanel.tsx` | service 续跑：`goalConfirmed \|\| planConfirmed` |
| `apps/desktop/scripts-cdp/uat-lib.mjs` | `rejectPlan>0` 禁止确认执行捷径 |
| L1 tests | Inv4 / V1a / Registry / probe |

---

### Task 1: 设计/权威文档谓词对齐（无代码）

**Files:**
- Modify: `docs/design/intent-confirmation-domain-design.md`（§2 Evidence 行、§3.3 verifyCompletion 注释、§4 Inv4）
- Modify: `docs/decisions/003-invariant4-single-source.md`（Decision 条）
- Modify: `docs/decisions/008-pending-questions-non-blocking.md`（Decision §1 blockers + 注）
- Modify: `docs/domain/00-domain-authority.md` §4.2
- Modify: `docs/domain/02-domain-model.md`（verifyCompletion 服务表行）
- Modify: `docs/product/02-components.md`（已解决卡「无证据不对账」子弹）
- Modify: `docs/product/07-success-metrics.md`（证据核验通过率一行）
- Modify: `docs/domain/04-tactical-design.md`（可选一句 ADR-011 引用）
- Modify: `docs/tests/coverage-matrix.md`（Inv 4 一行）
- 不改：S2/S4 stage-spec 历史正文、旧 audit 报告

**Interfaces:**
- Consumes: ADR-011 Decision §2–3 谓词原文
- Produces: 文档真源与实现任务共用的 Inv4 句子：「verification 非空 ∧ ≥1 条 `isSystemVerifiable` 且 V1a/纯逻辑通过对账 ∧ missing 空；unverifiable 仅清单+提示，不单独否决 ok」

- [ ] **Step 1: 改设计正文三处**

`intent-confirmation-domain-design.md`：

1. §2 Evidence：把「存在 unverifiable = 不进入对账」改为「零条可代跑 / verification 空 / passed=false / V1a 对账失败 = 不进入对账；unverifiable 仅标注（ADR-011，恢复拍板 4）」
2. §3.3 `ok=false` 注释：删「存在 unverifiable → ok=false」；写「ok = missing 空且至少一条可代跑通过对账；unverifiable 不计入 ok」
3. Inv4：同句；保留「pendingQuestions 不阻塞（ADR-008）」；§7.1 #4 **一字不改**

- [ ] **Step 2: 改 ADR-003 Decision（正文，不只脚注）**

```markdown
- `evidenceVerifiable(evidence)`：verification 非空 + **至少一条**可代跑（`isSystemVerifiable`）+ 无 pendingQuestions 阻塞（ADR-008 已去掉 pending 阻塞）——单源
- `completionEvidenceComplete` 委托 `evidenceVerifiable`；`verifyCompletion` 复用 `isSystemVerifiable`
- unverifiable **仅标注**；`ok` 不因存在 unverifiable 而为 false；若全部不可代跑 → `ok=false`（ADR-011）
```

- [ ] **Step 3: ADR-008 + 权威/产品/矩阵**

- ADR-008 Decision §1：blockers 改为「verification 空 / passed=false / **零条可代跑或可代跑条 V1a 失败**」；注「原『存在 unverifiable』由 ADR-011 修订」
- `00-domain-authority.md` §4.2：删「pendingQuestions 非空 → 不进对账」；对齐 ADR-011
- `02-domain-model.md`：服务表「证据不足/无系统对账证据 → 不进入」
- `02-components.md`：卡不弹条件跟 Inv4；⚠️ 未核验只呈现
- `07-success-metrics.md`：未通过 = `ok=false` / `evidence_missing`；混有 unverifiable 但已有一条 V1a 过 **算通过**
- coverage-matrix Inv4 一行补「≥1 条可代跑通过对账（ADR-011）」

- [ ] **Step 4: 机械自检**

Run（仓库根）:

```bash
rg -n '存在 unverifiable|全部可代跑|pendingQuestions 非空 →' \
  docs/design/intent-confirmation-domain-design.md \
  docs/decisions/003-invariant4-single-source.md \
  docs/decisions/008-pending-questions-non-blocking.md \
  docs/domain/00-domain-authority.md \
  docs/product/02-components.md
```

Expected: 无「仍把 unverifiable/pendingQuestions 当作 ok 阻塞」的现行措辞（历史审计文件不在列表内）。

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git add docs/design/intent-confirmation-domain-design.md \
  docs/decisions/003-invariant4-single-source.md \
  docs/decisions/008-pending-questions-non-blocking.md \
  docs/domain/00-domain-authority.md docs/domain/02-domain-model.md \
  docs/domain/04-tactical-design.md docs/product/02-components.md \
  docs/product/07-success-metrics.md docs/tests/coverage-matrix.md
git commit -m "$(cat <<'EOF'
docs: align Inv4 unverifiable with ADR-011 (mark only)

EOF
)"
```

---

### Task 2: Inv4 谓词——`evidenceVerifiable` + `verifyCompletion.ok`

**Files:**
- Modify: `apps/desktop/src/domain/conversationState.ts`（`evidenceVerifiable` ~691–694；`verifyCompletion` return ~760；注释 687–720）
- Modify: `apps/desktop/tests/unit/conversationState.test.ts`（Inv 4 describe ~381+）
- Modify: `apps/desktop/tests/unit/verifyCompletionSystem.test.ts`（非只读用例 ~58–68）
- Modify: `apps/desktop/src/domain/conversationState.ts` `buildEvidenceBackfill`（去掉 `node -e` 示例）

**Interfaces:**
- Consumes: `isSystemVerifiable(command: string): boolean`（文件内现有）
- Produces:
  - `evidenceVerifiable(evidence): boolean` — `verification.length > 0 && some(isSystemVerifiable)`
  - `verifyCompletion(...).ok` — `missing.length === 0 && verification.some(isSystemVerifiable)`（unverifiable 可非空）
  - 纯 unverifiable 清单仍返回在 `unverifiable[]`

- [ ] **Step 1: Write the failing tests**

在 `conversationState.test.ts` Inv 4：

```ts
it('混合：≥1 条可代跑 + unverifiable → ok=true 且进 resolution（ADR-011）', () => {
  const c = claim({
    evidence: evidence({
      verification: [
        { command: 'ls /test', passed: true },
        { command: 'npm install', passed: true },
      ],
    }),
  })
  const r = verifyCompletion(c)
  expect(r.ok).toBe(true)
  expect(r.unverifiable).toContain('npm install')
  expect(completionEvidenceComplete(c.evidence)).toBe(true)
  expect(deriveDecisionPoint(confirmed(), { completion: c })).toBe('resolution')
})

it('全部不可代跑 → ok=false 不进对账（无系统证据）', () => {
  const c = claim({
    evidence: evidence({ verification: [{ command: 'npm install', passed: true }] }),
  })
  expect(verifyCompletion(c).ok).toBe(false)
  expect(completionEvidenceComplete(c.evidence)).toBe(false)
  expect(deriveDecisionPoint(confirmed(), { completion: c })).toBe('none')
})
```

改旧用例标题/断言：原「非只读 → ok=false」保留为「仅非只读」语义（与上条合并可读）；`buildEvidenceBackfill` 断言文案不再含 `node -e`。

在 `verifyCompletionSystem.test.ts`：仅非只读 → `ok=false` 仍成立；新增混合 mock：

```ts
it('混合可代跑+不可代跑：V1a 可代跑过 → ok=true，unverifiable 仍列出', () => {
  const c = claim({
    evidence: {
      verification: [
        { command: 'ls src', passed: true },
        { command: 'npm run deploy', passed: true },
      ],
      diffs: [],
      pendingQuestions: [],
    },
  })
  const r = verifyCompletion(c, mockSystemState({ 'ls src': { ok: true } }))
  expect(r.ok).toBe(true)
  expect(r.unverifiable).toContain('npm run deploy')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop && npx vitest run tests/unit/conversationState.test.ts tests/unit/verifyCompletionSystem.test.ts
```

Expected: 新混合用例 FAIL（现实现 `ok = missing.length === 0 && unverifiable.length === 0`）。

- [ ] **Step 3: Minimal implementation**

```ts
export function evidenceVerifiable(evidence: CompletionEvidence): boolean {
  if (evidence.verification.length === 0) return false
  return evidence.verification.some((item) => isSystemVerifiable(item.command))
}

// verifyCompletion 末尾：
const hasSystemEvidence = claim.evidence.verification.some((item) =>
  isSystemVerifiable(item.command),
)
return {
  ok: missing.length === 0 && hasSystemEvidence,
  missing,
  unverifiable,
}
```

`buildEvidenceBackfill`：把「如 ls、grep、node -e 无写盘」改为「如 ls、grep、cat、curl -I localhost」（禁止示范 `node -e`）。

更新函数头注释对齐 ADR-011。

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run tests/unit/conversationState.test.ts tests/unit/verifyCompletionSystem.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "$(cat <<'EOF'
fix(domain): Inv4 ok needs ≥1 verifiable cmd (ADR-011)

EOF
)"
```

---

### Task 3: V1a「核对输出」——stdout 与 claim 对齐

**Files:**
- Modify: `apps/desktop/src/main/verification.ts`（`runOne` close 分支：非 0 时优先 `stdout`）
- Modify: `apps/desktop/src/domain/conversationState.ts`（V1a 循环：非 ok 时用 output 包含关系对齐 claim）
- Modify: `apps/desktop/tests/unit/verificationRunner.integration.test.ts`
- Modify: `apps/desktop/tests/unit/verifyCompletionSystem.test.ts`（mock 非 ok + output 对齐）

**Interfaces:**
- Consumes: `SystemVerifier.verificationResults[cmd]: { ok: boolean; output?: string }`；claim item 可选 `output?: string`
- Produces: `verificationResults[].ok === true` 当 `exit===0`；领域层：若 `!result.ok` 但 `align(claim.output, result.output)` 则**不**推入 missing

对齐启发式（ADR-011）：去空白后，声明包含 stdout，或 stdout 包含声明。

```ts
function outputAligns(claimed: string | undefined, actual: string | undefined): boolean {
  if (claimed == null || actual == null) return false
  const a = claimed.replace(/\s+/g, '').trim()
  const b = actual.replace(/\s+/g, '').trim()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}
```

- [ ] **Step 1: Write the failing tests**

`verifyCompletionSystem.test.ts`:

```ts
it('V1a：代跑 exit 非0 但 stdout 与 claim.output 对齐 → 不 missing（grep -c 零命中）', () => {
  const c = claim({
    evidence: {
      verification: [{ command: "grep -cE 'https?://' a.txt", output: '0', passed: true }],
      diffs: [],
      pendingQuestions: [],
    },
  })
  const r = verifyCompletion(
    c,
    mockSystemState({ "grep -cE 'https?://' a.txt": { ok: false, output: '0\n' } }),
  )
  expect(r.ok).toBe(true)
  expect(r.missing).not.toContain("verification:grep -cE 'https?://' a.txt")
})
```

`verificationRunner.integration.test.ts`（真实 shell）:

```ts
it('grep -c 零命中：exit 非0 仍带回 stdout「0」；领域对齐 claim 后 ok', async () => {
  writeFileSync(join(cwd, 'nolink.txt'), 'no urls here\n')
  const cmd = "grep -cE 'https?://' nolink.txt"
  const results = await runVerificationCommands([cmd], { cwd })
  expect(results[cmd].ok).toBe(false)
  expect(String(results[cmd].output ?? '').trim()).toBe('0')
  const claim: CompletionClaim = {
    summary: '完成',
    evidence: {
      verification: [{ command: cmd, output: '0', passed: true }],
      diffs: [],
      pendingQuestions: [],
    },
  }
  const r = verifyCompletion(claim, {
    verificationResults: results,
    deriveDiffs,
    plannedFiles: new Set(),
    producedFiles: new Set(),
  })
  expect(r.ok).toBe(true)
})
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd apps/desktop && npx vitest run tests/unit/verifyCompletionSystem.test.ts tests/unit/verificationRunner.integration.test.ts
```

Expected: 对齐用例 FAIL。

- [ ] **Step 3: Minimal implementation**

`verification.ts` `child.on('close')`:

```ts
child.on('close', (code) => {
  const out = (stdout || stderr).slice(0, MAX_OUTPUT)
  if (code === 0) finish(true, stdout.slice(0, MAX_OUTPUT))
  else finish(false, out) // 优先保留 stdout（grep -c → "0"）
})
```

`verifyCompletion` V1a 循环：

```ts
const result = systemState.verificationResults[item.command]
if (!result) continue
const aligned =
  !result.ok && outputAligns(item.output, result.output)
if (result.ok || aligned) continue
if (!missing.includes(`verification:${item.command}`)) {
  missing.push(`verification:${item.command}`)
}
```

（替换原 `if (result && !result.ok && …)`。）

- [ ] **Step 4: Run to verify PASS**

同 Step 2；Expected: PASS。

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "$(cat <<'EOF'
fix(verification): V1a align stdout with claim (ADR-011)

EOF
)"
```

---

### Task 4: ToolRegistry 内层 `{ok:false}` → 外层失败

**Files:**
- Modify: `apps/desktop/src/main/tools.ts`（`ToolRegistry.execute` try 块 ~177–179）
- Modify: `apps/desktop/tests/unit/tools.test.ts`（新增用例；若无 Registry 单测入口则在现有 execute 测试旁加）

**Interfaces:**
- Consumes: `tool.execute(...): Promise<unknown>`
- Produces: 若 `data` 为对象且 `data.ok === false` → `{ ok: false, error: string, data }`；否则 `{ ok: true, data }`

- [ ] **Step 1: Write the failing test**

```ts
it('execute：内层 data.ok===false → 外层 ok=false（ADR-011）', async () => {
  const reg = new ToolRegistry()
  reg.register({
    name: 'web_search_probe',
    description: 't',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ ok: false, error: 'fetch failed' }),
  })
  const r = await reg.execute('web_search_probe', {}, {})
  expect(r.ok).toBe(false)
  expect(String(r.error)).toMatch(/fetch failed/)
})
```

（按仓库实际 `ToolRegistry` / `register` API 微调；若 web 工具已注册，可直接 `execute('web_search', …)` mock。）

- [ ] **Step 2: Run FAIL**

```bash
cd apps/desktop && npx vitest run tests/unit/tools.test.ts
```

- [ ] **Step 3: Minimal implementation**

```ts
const data = await tool.execute(args, { rootPath: opts.rootPath, sessionId: opts.sessionId })
if (
  data !== null &&
  typeof data === 'object' &&
  'ok' in data &&
  (data as { ok: unknown }).ok === false
) {
  const err = (data as { error?: unknown }).error
  return { ok: false, error: err != null ? String(err) : 'tool failed', data }
}
return { ok: true, data }
```

- [ ] **Step 4: PASS** — 同上 vitest。

- [ ] **Step 5: Commit（仅用户要求时）** — `fix(tools): surface inner ok:false from registry`

---

### Task 5: 外网探活 = 实际搜索路径

**Files:**
- Modify: `apps/desktop/src/main/webTools.ts`（`probeWebAccess`：探 `DDG_API` 而非 `example.com`；有 `searchUrl` 覆盖时探覆盖端点由 ipc 已跳过）
- Modify: `apps/desktop/tests/unit/webTools.test.ts`

**Interfaces:**
- Consumes: 无覆盖端点时内置搜索用 `DDG_API`
- Produces: `probeWebAccess()` 对 DDG Instant Answer URL 发 GET（或与 `searchBuiltin` 同 host）；失败 → `ok:false`，设置页不可显示「已开启」

- [ ] **Step 1: Failing test**

```ts
it('probeWebAccess 命中 DuckDuckGo API 路径（非 example.com）', async () => {
  const urls: string[] = []
  const orig = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response('{}', { status: 200 })
  }
  try {
    const r = await probeWebAccess(2000)
    expect(r.ok).toBe(true)
    expect(urls.some((u) => u.includes('api.duckduckgo.com'))).toBe(true)
    expect(urls.every((u) => !u.includes('example.com'))).toBe(true)
  } finally {
    globalThis.fetch = orig
  }
})
```

- [ ] **Step 2: FAIL** — `npx vitest run tests/unit/webTools.test.ts`

- [ ] **Step 3: Implement**

```ts
export async function probeWebAccess(timeoutMs = 8000): Promise<{ ok: boolean; error?: string }> {
  try {
    const u = new URL(DDG_API)
    u.searchParams.set('q', 'neonforge-probe')
    u.searchParams.set('format', 'json')
    u.searchParams.set('no_redirect', '1')
    u.searchParams.set('no_html', '1')
    const res = await fetch(u.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok || (res.status >= 200 && res.status < 500)) return { ok: true }
    return { ok: false, error: `probe http-${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}
```

删除未用的 `PROBE_URL`。

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit（仅用户要求时）** — `fix(web): probe DuckDuckGo path for web access`

---

### Task 6: service 自动续跑——goal 或 plan 已确认

**Files:**
- Modify: `apps/desktop/src/renderer/ConversationPanel.tsx`（`finishError` ~2459–2468）
- Test: 若已有 interaction「plan 后 service 续跑」——扩一条 goal 后；否则 L1 不可测 UI，用注释 + 手工/UAT；**不要**新造框架

**Interfaces:**
- Consumes: `stateRef.current.goalConfirmed | planConfirmed`；`pending === 'none'`（若易取则加；现码未查 pending——最小改：`(goalConfirmed || planConfirmed)`）
- Produces: `errorType==='service'` 且未续过 → 自动 `retryFailedTurn` 一次

- [ ] **Step 1: 改条件**

```ts
if (
  errorType === 'service' &&
  (stateRef.current.goalConfirmed || stateRef.current.planConfirmed) &&
  !autoRetriedServiceRef.current
) {
```

注释改为「目标或方案已确认后的瞬态失败：一次自动续跑」。

- [ ] **Step 2: 若存在 interaction 测 service 续跑则扩 goal 路径；否则跳过**

```bash
cd apps/desktop && rg -n 'autoRetried|重试|service' tests/interaction/*.ts | head
```

有则补断言；无则依赖 Task 8 Mac G-boundary。

- [ ] **Step 3: Commit（仅用户要求时）** — `fix(chat): retry service after goal or plan confirm`

---

### Task 7: UAT harness——`rejectPlan>0` 禁止确认执行捷径

**Files:**
- Modify: `apps/desktop/scripts-cdp/uat-lib.mjs`（`autopilot` `__goal_done__` 分支 ~437–455）

**Interfaces:**
- Consumes: `persona.rejectPlan`、`persona.__planRejects`
- Produces: 当 `(persona.rejectPlan || 0) > 0` 且仍有剩余拒绝次数 → **不**直接点「确认执行」；走 `personaAct(page, persona, 'plan')`（含「修改方案」）

- [ ] **Step 1: 改捷径**

```js
if (
  sentTexts.has('__goal_done__') &&
  !planConfirmed &&
  !has('已解决') &&
  !has('允许执行') &&
  !has('允许并记住') &&
  !has('批准这批文件')
) {
  const stillRejecting =
    (persona.rejectPlan || 0) > 0 &&
    (persona.__planRejects || 0) < (persona.rejectPlan || 0)
  if (stillRejecting) {
    acted = await personaAct(page, persona, 'plan')
    if (acted && acted.includes('确认执行')) planConfirmed = true
  } else {
    const execBtn = page.getByRole('button', { name: '确认执行' })
    const modBtn = page.getByRole('button', { name: '修改方案' })
    if (await execBtn.count()) {
      await execBtn.click()
      acted = 'button:确认执行'
      planConfirmed = true
    } else if (await modBtn.count()) {
      await modBtn.click()
      acted = 'button:修改方案'
    }
  }
}
```

- [ ] **Step 2: 本地无 Mac 时用静态读确认**

```bash
rg -n 'stillRejecting|rejectPlan' apps/desktop/scripts-cdp/uat-lib.mjs
```

Expected: 捷径分支含 `rejectPlan` 守卫。

- [ ] **Step 3: Commit（仅用户要求时）** — `fix(uat): honor rejectPlan before confirm-exec shortcut`

---

### Task 8: 本地 L1 全量 + Mac 复跑 t000057

**Files:** 无新文件；部署变更集到 Mac（scp/apply），`npm run build` + 打包，`run-uat-tiers.sh` / `run-uat-personas.sh`

- [ ] **Step 1: 本地验证**

```bash
cd apps/desktop
npx vitest run
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit
```

Expected: vitest 全绿；tsc 0 错。

- [ ] **Step 2: 同步 Mac 并构建**（沿用 p000119/p000126/p000131：Host `mac` = LAN IP；构建后 asar grep 关键符号）

关键符号抽查：`outputAligns` 或「至少一条可代跑」注释字符串、`api.duckduckgo.com` probe、`goalConfirmed ||` 续跑。

- [ ] **Step 3: 跑四档 + 人格**

```bash
# Mac，cwd apps/desktop；密钥 /tmp/nf-uat-key-keep 已备
NF_UAT_LOCAL=1 bash scripts-cdp/run-uat-tiers.sh
NF_UAT_LOCAL=1 bash scripts-cdp/run-uat-personas.sh
```

关注：T1/T4 证据环、T3 检索失败诚实、G-picky `planRejects>0`、G-boundary goal 后 service 续跑。

- [ ] **Step 4: 汇结果**

经 handoff CLI 更新/关闭 `t000057`（或记 outcome）；audit-items A-033/A-034 按需勾证据。不 push 除非用户要求。

---

## Self-review

1. **Spec coverage:** ADR-011 §1→Task3；§2–3→Task1+2；§4→Task4；§5→Task5；§6→Task6；harness+回填→Task2/7；§7 不在范围；Mac→Task8。
2. **Placeholder scan:** 无 TBD；Registry 测试若 API 名不符以仓库为准微调，逻辑固定。
3. **Type consistency:** `verificationResults` 仍 `{ok,output?}`；对齐在领域层；`evidenceVerifiable` 与 `verifyCompletion.ok` 共用「≥1 可代跑」。

---

Plan complete and saved to `docs/superpowers/plans/2026-09-29-adr011-success-means-proposition.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每任务新开子代理，任务间审查  
**2. Inline Execution** — 本会话按任务推进，检查点停顿  

Which approach?
