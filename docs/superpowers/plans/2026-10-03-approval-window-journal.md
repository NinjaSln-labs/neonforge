# 实现计划：授权窗口一等化与执行日志权威（ADR-017 · ApprovalWindow v3.3）

**Goal:** 把需批准的执行请求从 UI 卡列表镜像升格为领域集合（`ConversationState.approvalWindow.requests`），`pending='approval'` 降为窗的单向派生；四批准入口＋规则命中全收敛 `approvalDecided`（allow/deny 同权入态）；main 新增**持久执行日志（journal）**做跨进程可执行性与恢复三判的权威；规则三档权威归 main。根治 t000073（allow 不进门/镜像权威/批量不可表达）。

**权威文本:** `docs/design/approval-ledger-model-proposal-2026-10-03.md`（final-v3.3·landed）＋ `docs/decisions/017-approval-window-first-class.md`；落稿接缝见 `docs/audits/final-review-v3.1-landing-axis-2026-10-03.md`。

**Architecture:** 三层——① `src/domain/conversationState.ts` 纯函数窗口转换族（八函数，**领域内无序号无代次**，排序归 `timeline.ts` seq）；② `src/main`：`approvalJournal.ts`（append-only JSONL，phases issued/approved/started/done）＋ `tools.ts` execute 咽喉签发/校验（fail-closed）＋ IPC `approval:reconcile`；③ renderer：`useConversationState` 窗口方法 + `ConversationPanel`/`useToolApproval` 四入口改线 + D5 effect 退役。

**Tech Stack:** TypeScript（双 tsconfig）、vitest（L1）、Playwright interaction（L3）、Electron IPC（contextBridge）。

## Global Constraints（全程有效，逐任务隐含）

- **ADR-012 测完再修**：本计划是**修批**文档；执行期任何 L3 测批进行中不得改产品/harness/断言——测批只记→汇报→等裁决→另开修批。
- 工程命令 cwd 均为 `apps/desktop`；每任务收口跑 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`（双 tsc）+ 相关 L1；提交用 Conventional Commits（lefthook→lint-staged）；**不 push**（需用户另行授权）。
- 阶段 A **可独立绿、中途可发**；阶段 B 为**原子对（B1–B8 中途不可发）**；阶段 C 独立批。批次即任务组，**不再叠 v 号**。
- requestId 对一切消费方是**不透明字符串**（禁解析内部结构）；领域零序号零代次；`ToolResult` 新字段一律**可选**（向后兼容）。
- bash/高危永不进任何持久规则（02:191）；"恢复即 expired/failed"仅存于**无 journal 行可判的退化场景**。
- 插桩即删：调试探针不留仓。

## File Structure（创建/修改全景）

| 动作 | 文件 | 职责 |
|---|---|---|
| Create | `src/main/approvalJournal.ts` | journal 类（plannedFilesStore 同族：构造注入路径、可测）＋`fingerprintArgs` |
| Create | `src/main/approvalJournal.instance.ts` | 单例（`app.getPath('userData')`，惰性——仿 plannedFilesStore.instance.ts） |
| Create | `tests/unit/approvalJournal.test.ts` | A1/A3 L1 |
| Modify | `src/main/tools.ts` | needApproval 分支签发＋journal 写；executeGated 校验（B 期启用拦截）；规则显式序 rescanning |
| Modify | `src/main/ipc.ts` | `tools:execute` opts+requestId；`approval:reconcile`、`approval:issue`（plan-batch）、`approval:clear-grants`（C3） |
| Modify | `src/preload/preload.ts` + `src/renderer/types.d.ts` | 通道面（requestId/approvalRequestId/reconcile/issue） |
| Modify | `src/domain/conversationState.ts` | ApprovalRecord/ApprovalWindow/ApprovalAnswers＋转换族八函数＋initialState＋descriptorOf approval 退役 |
| Modify | `src/domain/timeline.ts` | 注册表新类型＋deriveStateEvents 窗派生规则 |
| Modify | `src/renderer/useConversationState.ts` | 窗口方法封装（transition＋stale/duplicate 打点＋drain 链） |
| Modify | `src/renderer/ConversationPanel.tsx` | D5 effect 退役＋首执行入窗＋文本恰一改线＋status/busyGate/shouldStopContinuation 迁接＋hint UI |
| Modify | `src/renderer/useToolApproval.ts` | 四入口改 requestId 寻址＋二次 execute 携 id＋reject idx→id 定位 |
| Modify | `src/renderer/sessionStore.ts` | 信封形状 `{messages, approvalWindow}`（C1） |
| Modify | `src/renderer/busyGate.ts` | 无改（槽值保留——消费方喂数改源自窗，B5） |
| Tests | `tests/unit/{conversationState,timelineEvents,tools,permissionRules,sessionStore,useConversationState,busyGate,hardOrderGate,agentLoop}.test.ts`、`tests/interaction/*` | B7/B8/C 各任务内列明 |

---

# 阶段 A（main-only：签发＋journal 只记不判；可独立绿、中途可发）

### Task A1：approvalJournal 模块（纯 main，无 IPC 面）

**Files:**
- Create: `src/main/approvalJournal.ts`
- Create: `src/main/approvalJournal.instance.ts`
- Test: `tests/unit/approvalJournal.test.ts`

**Interfaces:**
- Produces: `fingerprintArgs(name: string, args: Record<string, unknown>): string`；`class ApprovalJournal { issueId(): string; append(entry: Omit<JournalRow,'ts'>): void; phaseOf(requestId: string): JournalPhase | null; latestRows(): JournalRow[] }`；`type JournalPhase = 'issued'|'approved'|'started'|'done'`；`interface JournalRow { requestId: string; toolName: string; argsFingerprint: string; phase: JournalPhase; ts: string }`；`getApprovalJournal(): ApprovalJournal`。

- [ ] **Step 1：写失败测试** `tests/unit/approvalJournal.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ApprovalJournal, fingerprintArgs } from '../../src/main/approvalJournal'

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'nf-journal-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('ADR-017 approvalJournal', () => {
  it('issueId 跨实例唯一（bootNonce 在 id 内——重启撞号封堵）', () => {
    const a = new ApprovalJournal(path.join(dir, 'j.jsonl'))
    const b = new ApprovalJournal(path.join(dir, 'j2.jsonl'))
    const idsA = new Set(Array.from({ length: 50 }, () => a.issueId()))
    const idsB = Array.from({ length: 50 }, () => b.issueId())
    expect(idsA.size).toBe(50)
    expect(idsB.every((x) => !idsA.has(x))).toBe(true) // 两"进程世代"不撞号
    expect(idsA.values().next().value).toMatch(/^apr_[a-z0-9]+_\d+$/)
  })
  it('append 后 phaseOf 取最新阶段；latestRows 每 id 一行', () => {
    const j = new ApprovalJournal(path.join(dir, 'j.jsonl'))
    const id = j.issueId()
    j.append({ requestId: id, toolName: 'bash', argsFingerprint: 'fp1', phase: 'issued' })
    j.append({ requestId: id, toolName: 'bash', argsFingerprint: 'fp1', phase: 'started' })
    expect(j.phaseOf(id)).toBe('started')
    const rows = j.latestRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ requestId: id, phase: 'started' })
  })
  it('损坏行忽略（append-only 容错——configStore 模式）；未知 id → null', () => {
    const fp = path.join(dir, 'j.jsonl')
    const j = new ApprovalJournal(fp)
    require('node:fs').appendFileSync(fp, 'NOT-JSON\n')
    expect(() => j.latestRows()).not.toThrow()
    expect(j.phaseOf('apr_none_1')).toBeNull()
  })
  it('fingerprintArgs：键序无关、异 args 必不同', () => {
    expect(fingerprintArgs('write', { path: '/a', content: 'x' })).toBe(
      fingerprintArgs('write', { content: 'x', path: '/a' }),
    )
    expect(fingerprintArgs('write', { path: '/a' })).not.toBe(fingerprintArgs('write', { path: '/b' }))
  })
})
```

- [ ] **Step 2：跑失败** `npx vitest run tests/unit/approvalJournal.test.ts` → FAIL（模块不存在）
- [ ] **Step 3：实现** `src/main/approvalJournal.ts`：

```typescript
// ADR-017：授权执行日志（main 持久权威——"这条请求能不能跑、跑没跑过"）
// 身份即 id：issueId＝apr_<bootNonce>_<counter>——bootNonce 只活在 id 内（不进领域状态/台账结构，撤钟裁定）；
// 对一切消费方不透明（禁解析内部结构——M-01）。append-only JSONL（plannedFilesStore 容错模式：损坏行忽略、落盘失败忽略）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type JournalPhase = 'issued' | 'approved' | 'started' | 'done'
export interface JournalRow {
  requestId: string
  toolName: string
  argsFingerprint: string
  phase: JournalPhase
  ts: string
}

/** args 摘要指纹（键序无关——canonical JSON＋djb2；防"批 A 行 B"TOCTOU 核验） */
export function fingerprintArgs(name: string, args: Record<string, unknown>): string {
  const canon = JSON.stringify(Object.keys(args).sort().map((k) => [k, args[k]]))
  let h = 5381
  const s = name + canon
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16) + '_' + s.length.toString(16)
}

const PHASES: JournalPhase[] = ['issued', 'approved', 'started', 'done']

export class ApprovalJournal {
  private readonly bootNonce = Math.random().toString(36).slice(2, 8)
  private counter = 0

  constructor(private readonly filePath: string) {}

  issueId(): string {
    return `apr_${this.bootNonce}_${++this.counter}`
  }

  append(entry: Omit<JournalRow, 'ts'>): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      appendFileSync(this.filePath, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n', { mode: 0o600 })
    } catch {
      /* 落盘失败忽略——签发仍可执行（A 期只记不判） */
    }
  }

  private allRows(): JournalRow[] {
    try {
      if (!existsSync(this.filePath)) return []
      return readFileSync(this.filePath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const r = JSON.parse(line) as JournalRow
            return typeof r.requestId === 'string' && PHASES.includes(r.phase) ? [r] : []
          } catch {
            return []
          }
        })
    } catch {
      return []
    }
  }

  /** 每 id 最新阶段（文件序＝写入序） */
  latestRows(): JournalRow[] {
    const byId = new Map<string, JournalRow>()
    for (const r of this.allRows()) byId.set(r.requestId, r)
    return [...byId.values()]
  }

  phaseOf(requestId: string): JournalPhase | null {
    let phase: JournalPhase | null = null
    for (const r of this.allRows()) if (r.requestId === requestId) phase = r.phase
    return phase
  }
}
```

  `src/main/approvalJournal.instance.ts`（仿 plannedFilesStore.instance.ts）：

```typescript
// ApprovalJournal 单例（main——userData 落盘；惰性：vitest 不触碰 app.getPath）
import { app } from 'electron'
import path from 'node:path'
import { ApprovalJournal } from './approvalJournal.js'

let journal: ApprovalJournal | null = null

export function getApprovalJournal(): ApprovalJournal {
  if (!journal) {
    journal = new ApprovalJournal(path.join(app.getPath('userData'), 'workspace', 'approval-journal.jsonl'))
  }
  return journal
}
```

- [ ] **Step 4：跑绿** `npx vitest run tests/unit/approvalJournal.test.ts`；双 tsc；**Commit** `feat(main): ADR-017 A1 approvalJournal 持久执行日志（签发唯一性条款落点）`

### Task A2：needApproval 分支签发 requestId（ToolResult 上行）

**Files:**
- Modify: `src/main/tools.ts:88-98`（ToolResult）、`:127-176`（execute）
- Modify: `src/main/ipc.ts:343-369`（tools:execute opts 透传）
- Modify: `src/preload/preload.ts:170-200`、`src/renderer/types.d.ts:260-280`（通道类型面）
- Test: `tests/unit/tools.test.ts`（追加）

**Interfaces:**
- Consumes: `getApprovalJournal().issueId()/append()`、`fingerprintArgs`（A1）
- Produces: `ToolResult.approvalRequestId?: string`、`ToolResult.approvalFingerprint?: string`；`execute` opts `{ approved?, requestId?, rootPath?, sessionId? }`（requestId 此处仅透传记录，判定 B 期启用）

- [ ] **Step 1：写失败测试**（`tests/unit/tools.test.ts` 追加——该文件真实 harness：单例 `toolRegistry`＋`initTools()`＋electron mock `app.getPath→/tmp/nf-unit-tools`（journal 惰性单例在 vitest 下即用该路径，A1 的 afterEach rmSync 已覆盖清理），**无需新注入门**）：

```typescript
describe('ADR-017 A2 requestId 签发', () => {
  it('needApproval 返回携 approvalRequestId＋approvalFingerprint，journal 已落 issued', async () => {
    const file = path.join(TMP, 'game.js')
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, { rootPath: TMP })
    expect(r.needApproval).toBe(true)
    expect(r.approvalRequestId).toMatch(/^apr_/)
    expect(typeof r.approvalFingerprint).toBe('string')
    expect(getApprovalJournal().phaseOf(r.approvalRequestId!)).toBe('issued')
  })
  it('rule allow 通道不签发（未走 needApproval 分支即无 id）', async () => {
    toolRegistry.setRules([{ action: 'allow', tool: 'write', specifier: path.join(TMP, 'ok.js') }])
    const r = await toolRegistry.execute('write', { path: path.join(TMP, 'ok.js'), content: 'y' }, { rootPath: TMP })
    expect(r.ok).toBe(true)
    expect(r.approvalRequestId).toBeUndefined()
    toolRegistry.setRules([])
  })
})
```

（`getApprovalJournal` import 自 `../../src/main/approvalJournal.instance`；`beforeEach` 的 `markPlanApproved()` 使 write 过规划门、仍走 requiresApproval——正是被测通道。）

- [ ] **Step 2：跑失败**（approvalRequestId undefined）
- [ ] **Step 3：实现**——`tools.ts` ToolResult 加两可选字段：

```typescript
  // ADR-017 A2：授权请求身份（main 签发——renderer 建窗记录凭此寻址；仅 needApproval 返回时出现）
  approvalRequestId?: string
  approvalFingerprint?: string
```

needApproval 分支（`:168-175`）改为：

```typescript
      if (!pre?.auto) {
        // ADR-017 A2：签发即记 issued（journal 只记不判——A 期不改执行判定）
        const j = getApprovalJournal()
        const requestId = j.issueId()
        const fp = fingerprintArgs(name, args)
        j.append({ requestId, toolName: name, argsFingerprint: fp, phase: 'issued' })
        return {
          ok: false,
          needApproval: true,
          approvalRequestId: requestId,
          approvalFingerprint: fp,
          error: `「${name}」需要授权（L3）——approved=true 后执行`,
        }
      }
```

`tools.ts` 头部 `import { getApprovalJournal } from './approvalJournal.instance.js'`（与 plannedFilesStore.instance 同惰性纪律——registerIpc 前不触碰 app.getPath；vitest 走既有 electron mock）。ipc.ts handler opts 面加 `requestId?: string` 并透传（A 期 execute 内不消费）。preload/types.d.ts 同步两返回字段＋opts.requestId（`Promise<{ ok: boolean; data?: unknown; error?: string; needApproval?: boolean; policy?: boolean; approvalRequestId?: string; approvalFingerprint?: string }>`）。

- [ ] **Step 4：跑绿** `npx vitest run tests/unit/tools.test.ts`；双 tsc；`npm run e2e` 不适用（mock 返回多字段向后兼容——mockBridge execute 源字符串不过 tsc，施工轴 S4 已证）。**Commit** `feat(main): ADR-017 A2 needApproval 咽喉签发 requestId（ToolResult 上行）`

### Task A3：二次 execute journal 阶段写（approved/started/done——只记不判）

**Files:**
- Modify: `src/main/tools.ts`（execute 头部与成功/失败返回点）
- Test: `tests/unit/approvalJournal.test.ts` 或 `tools.test.ts`（追加）

**Interfaces:**
- Consumes: A2 的 opts.requestId
- Produces: `opts.requestId` 在场时 journal 阶段链 `issued→approved→started→done`（fail 时止于 started——恢复判 C 的数据源）；判定**不启用**（approved:true 无 id 仍执行——B4 起收口）

- [ ] **Step 1：写失败测试**（tools.test.ts 追加——A2 同款真实 harness）：

```typescript
it('ADR-017 A3：携 requestId 的批复执行走 journal approved→started→done', async () => {
  const file = path.join(TMP, 'b.txt')
  const j = getApprovalJournal()
  const id = j.issueId()
  const fp = fingerprintArgs('write', { path: file, content: 'z' })
  j.append({ requestId: id, toolName: 'write', argsFingerprint: fp, phase: 'issued' })
  const r = await toolRegistry.execute('write', { path: file, content: 'z' }, { approved: true, requestId: id, rootPath: TMP })
  expect(r.ok).toBe(true)
  expect(j.phaseOf(id)).toBe('done')
})
```

- [ ] **Step 2：跑失败**（phase 停 issued）
- [ ] **Step 3：实现**——`tools.ts` execute：规则/preApproval 判定通过后、`try` 之前：

```typescript
    // ADR-017 A3：批复执行走 journal 阶段链（只记不判——started 无 done＝恢复判 C 唯一数据源）
    const journalId = opts.requestId
    const jfp = fingerprintArgs(name, args)
    if (journalId) {
      const j = getApprovalJournal()
      if (j.phaseOf(journalId) === 'issued') j.append({ requestId: journalId, toolName: name, argsFingerprint: jfp, phase: 'approved' })
      j.append({ requestId: journalId, toolName: name, argsFingerprint: jfp, phase: 'started' })
    }
```

成功返回 `{ ok: true, data }` 前（含 ADR-011 内层失败透传之外的纯 ok 分支）与 `catch` 分支分别：ok→`j.append(... phase:'done')`；抛错/内层 `{ok:false}`＝执行已发生但命题失败——**同样记 done**（工具跑了，副作用存在；failed 属领域语义非 journal）。

- [ ] **Step 4：跑绿＋双 tsc。**Commit** `feat(main): ADR-017 A3 执行阶段 journal 落账（恢复三判数据源，A 期只记不判）`

**阶段 A 出口门禁：** `npx vitest run` 全绿；双 tsc；`npx playwright test --project=interaction` 无**新增**稳定红（对照 ADR-015 轮 T0 基线；测中只记不改——ADR-012）。

---

# 阶段 B（原子对 B1–B8——中途不可发；每任务仍单独过 L1＋双 tsc，出口一起过 L3）

### Task B1：领域类型面（ApprovalRecord/Window/Answers——零行为）

**Files:**
- Modify: `src/domain/conversationState.ts`（值对象区 `:56-63` 后、ConversationState `:118-152`）
- Test: `tests/unit/conversationState.test.ts`（类型面冒烟一条）

**Interfaces:**
- Produces（后续所有 B/C 任务的消费面——签名以此为准，不得漂移）:

```typescript
/** 授权请求记录（ADR-017——ApprovalWindow.requests 成员；身份＝requestId，不透明） */
export interface ApprovalRecord {
  requestId: string
  kind: 'tool' | 'plan-batch' // plan-batch＝approve-files 合并卡（执行链仍走 approvalGranted＋planConfirmed——G2）
  toolName: string
  subject: string
  argsFingerprint: string
  request: ApprovalRequest // 呈现内容（reason/risk——卡展示视图）
  state: 'queued' | 'pending' | 'approved' | 'denied' | 'failed' | 'expired' | 'uncertain'
  decidedBy?: 'user' | 'rule' // rule＝预先裁决（00 §3.2 规则 2 骑注）
  decidedAt?: string // 审计时间戳，非身份
}

/** 授权窗口（领域真相源——无序号无代次；排序归时间线日志域） */
export interface ApprovalWindow {
  requests: ApprovalRecord[]
}

/** 授权答复凭据（对应确认卡族 DecisionAnswers 的窗口版） */
export interface ApprovalAnswers {
  requestId: string
}

export type DecidableApprovalState = 'queued' | 'pending'
/** 可决记录（§2 术语一处定义） */
export function decidableRequests(w: ApprovalWindow): ApprovalRecord[] {
  return w.requests.filter((r) => r.state === 'queued' || r.state === 'pending')
}
```

  `ConversationState` 加字段（`approvalWindow: ApprovalWindow`，注释 `// ADR-017——需批准事实的领域真相源；pending='approval' 为其单向派生呈现`）；`initialState()` 加 `approvalWindow: { requests: [] }`。

- [ ] **Step 1：写失败冒烟测试**：`expect(initialState().approvalWindow).toEqual({ requests: [] })` ＋ `decidableRequests` 过滤断言。**Step 2** 失败（字段不存在）。**Step 3** 实现。**Step 4** 绿＋双 tsc。**Commit** `feat(domain): ADR-017 B1 授权窗口值对象与状态字段（零行为）`

### Task B2：窗口转换族（八函数——领域核心，全 L1）

**Files:**
- Modify: `src/domain/conversationState.ts`
- Test: `tests/unit/conversationState.test.ts`（describe `ADR-017 授权窗口转换族`）

**Interfaces:**
- Consumes: B1 类型
- Produces（签名冻结）:

```typescript
export function approvalRequested(s: ConversationState, rec: Omit<ApprovalRecord, 'state'>, slotBusy: boolean): ConversationState
export function approvalDecided(
  s: ConversationState,
  target: { requestId: string } | { batch: 'window' } | { batch: 'reject-rest'; keep: string[] },
  decision: { confirm: true } | { confirm: false; reason: RejectReason },
): ConversationState
export function approvalExecutionSettled(s: ConversationState, requestId: string, outcome: 'done' | 'failed'): ConversationState
export function windowResolved(s: ConversationState): ConversationState
export function drainQueued(s: ConversationState): ConversationState
export function resolveUncertain(s: ConversationState, requestId: string, choice: 'settled-done' | 'authorize-rerun'): ConversationState
export function reconcileJournal(s: ConversationState, rows: Array<{ requestId: string; phase: 'issued' | 'approved' | 'started' | 'done' }>): ConversationState
export function expireWindow(s: ConversationState, reason: 'ttl' | 'legacy'): ConversationState
```

**参考实现（逐函数——执行者照抄后补风格）：**

```typescript
// ============================================================================
// ADR-017：授权窗口转换族（§3.4 落地——allow/deny 同权入态；无钟可撞）
// 槽派生不变式（00 §3.2 要点 5）：pending='approval' ⇔ 窗含 pending 呈现记录 ∧ 无确认卡占槽。
// 幂等/闸的 stale 打点由调用层（useConversationState）凭"引用级 no-op"检测发事件——领域保持纯。
// ============================================================================

/** 同 id 已在窗→no-op（签发唯一性条款保证跨重启不撞号——A2）；slotBusy＝确认卡占槽 ∨ 窗已有 pending 呈现（P-03 基数） */
export function approvalRequested(
  s: ConversationState,
  rec: Omit<ApprovalRecord, 'state'>,
  slotBusy: boolean,
): ConversationState {
  if (s.approvalWindow.requests.some((r) => r.requestId === rec.requestId)) return s
  const hasVisible = s.approvalWindow.requests.some((r) => r.state === 'pending')
  const state: ApprovalRecord['state'] = slotBusy || hasVisible ? 'queued' : 'pending'
  const requests = [...s.approvalWindow.requests, { ...rec, state }]
  const pending: PendingKind = s.pending === 'none' && state === 'pending' ? 'approval' : s.pending
  return { ...s, approvalWindow: { requests }, pending }
}

/** 槽↔窗双向同步（00 §3.2 要点 5）：有可见 pending 记录且槽空闲 → 槽回 'approval'（确认卡让位后恢复呈现）；
 *  槽为 approval 但窗无可见记录 → 释放（dc 残值一并清——dc.approval 面退役） */
export function windowResolved(s: ConversationState): ConversationState {
  const visible = s.approvalWindow.requests.some((r) => r.state === 'pending')
  if (s.pending === 'approval' && !visible) return { ...s, pending: 'none', decisionContent: undefined }
  if (s.pending === 'none' && visible) return { ...s, pending: 'approval' }
  return s
}

/** 决定：闸＝id∈窗 ∧ 可决；miss/已决→引用级 no-op（调用层 stale 打点）；batch 逐 id 记账（一决定 N 记录） */
export function approvalDecided(
  s: ConversationState,
  target: { requestId: string } | { batch: 'window' } | { batch: 'reject-rest'; keep: string[] },
  decision: { confirm: true } | { confirm: false, reason: RejectReason },
  by?: 'user' | 'rule', // 缺省 user；rule＝预先裁决命中（C3 drain 回写——同闸同记，decidedBy 入档）
): ConversationState {
  if (!decision.confirm && !decision.reason) {
    throw new TypeError('拒绝决策必须携带 RejectReason（不变量 8）')
  }
  const decidable = decidableRequests(s.approvalWindow)
  const hit = (r: ApprovalRecord): boolean =>
    'requestId' in target
      ? r.requestId === target.requestId
      : target.batch === 'window'
        ? true
        : !target.keep.includes(r.requestId)
  const affected = decidable.filter(hit)
  if (affected.length === 0) return s
  const now = new Date().toISOString()
  const ids = new Set(affected.map((r) => r.requestId))
  const requests = s.approvalWindow.requests.map((r) =>
    ids.has(r.requestId)
      ? {
          ...r,
          state: (decision.confirm ? 'approved' : 'denied') as ApprovalRecord['state'],
          decidedBy: by,
          decidedAt: now,
        }
      : r,
  )
  let next: ConversationState = { ...s, approvalWindow: { requests } }
  if (!decision.confirm) {
    // C6 拒绝记忆（机制不变）：每条被拒记录入 deniedApprovals（actionGate 同轮同类短封——canExecute 消费）
    next.deniedApprovals = [
      ...s.deniedApprovals,
      ...affected.map((r) => ({ toolName: r.toolName, subject: r.subject })),
    ]
    next.lastRejectReason = decision.reason
  } else {
    next.lastRejectReason = undefined
  }
  return drainQueued(windowResolved(next))
}

/** 执行回写收敛：done→幂等 no-op（进度真相在 journal——领域不重复记账）；failed→记录置 failed（防双真相） */
export function approvalExecutionSettled(
  s: ConversationState,
  requestId: string,
  outcome: 'done' | 'failed',
): ConversationState {
  if (outcome === 'done') return s
  const r = s.approvalWindow.requests.find((x) => x.requestId === requestId && x.state === 'approved')
  if (!r) return s
  const requests = s.approvalWindow.requests.map((x) => (x === r ? { ...x, state: 'failed' as const } : x))
  return windowResolved({ ...s, approvalWindow: { requests } })
}

/** 槽释放后 queued→pending（呈现队列推进步——仅 approval 槽空且无呈现时） */
export function drainQueued(s: ConversationState): ConversationState {
  if (s.pending !== 'none') return s
  if (s.approvalWindow.requests.some((r) => r.state === 'pending')) return s
  const idx = s.approvalWindow.requests.findIndex((r) => r.state === 'queued')
  if (idx < 0) return s
  const requests = s.approvalWindow.requests.map((r, i) => (i === idx ? { ...r, state: 'pending' as const } : r))
  return { ...s, approvalWindow: { requests }, pending: 'approval' }
}

/** uncertain（journal 判 C）唯一用户出口——禁自动重放；rerun＝回 approved 待调用层再 execute（journal 侧 rerun 授权由 main 判） */
export function resolveUncertain(
  s: ConversationState,
  requestId: string,
  choice: 'settled-done' | 'authorize-rerun',
): ConversationState {
  const r = s.approvalWindow.requests.find((x) => x.requestId === requestId && x.state === 'uncertain')
  if (!r) return s
  const requests = s.approvalWindow.requests.map((x) =>
    x === r ? { ...x, state: 'approved' as const, decidedBy: 'user' as const, decidedAt: new Date().toISOString() } : x,
  )
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}

/** 恢复/重连三判（§5）：done→收敛（approved 幂等）；started∧¬done→uncertain；issued/approved→存续（判 A）；
 *  窗内有、rows 无（异机/旧档退化）→未决 expired、approved failed——仅退化分支 */
export function reconcileJournal(
  s: ConversationState,
  rows: Array<{ requestId: string; phase: 'issued' | 'approved' | 'started' | 'done' }>,
): ConversationState {
  const phase = new Map(rows.map((r) => [r.requestId, r.phase]))
  const requests = s.approvalWindow.requests.map((r) => {
    const p = phase.get(r.requestId)
    if (p === undefined) {
      if (r.state === 'queued' || r.state === 'pending') return { ...r, state: 'expired' as const }
      if (r.state === 'approved') return { ...r, state: 'failed' as const }
      return r
    }
    if (p === 'started') return { ...r, state: 'uncertain' as const }
    return r // done/issued/approved：呈现态存续（执行进度真相在 journal）
  })
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}

/** ttl/legacy 过期（§5 判 C 之外的独立到期）：未决→expired；approved∧未 settled→failed（"批了没跑"＝失败可重批） */
export function expireWindow(s: ConversationState, reason: 'ttl' | 'legacy'): ConversationState {
  const requests = s.approvalWindow.requests.map((r) =>
    r.state === 'queued' || r.state === 'pending'
      ? { ...r, state: 'expired' as const, decidedBy: undefined, decidedAt: undefined }
      : r.state === 'approved' && reason === 'legacy'
        ? { ...r, state: 'failed' as const }
        : r,
  )
  return drainQueued(windowResolved({ ...s, approvalWindow: { requests } }))
}
```

**兼容改型（同任务）：** 旧 `approvalDecided(s, request, decision, answers?: DecisionAnswers)` 与新签名冲突——**直接替换旧函数**（旧调用点仅 `useConversationState.rejectApproval`）。B2 内同步做最小改线（B4 会换成真 id 寻址，此处取窗内最近一条可决记录）：

```typescript
    rejectApproval: (request, reason) =>
      transition((s) => {
        const last = [...s.approvalWindow.requests].reverse().find((r) => r.state === 'pending' || r.state === 'queued')
        return approvalDecided(s, last ? { requestId: last.requestId } : { requestId: '' }, { confirm: false, reason })
      }),
```

（`{requestId:''}`＝窗空——闸 miss 引用级 no-op，行为等同旧"无卡可拒"。）conversationState.test.ts 现存 S7 旧签名用例（先 `approvalRequested` 建窗记录再 decided）在本任务内同步改型，不留红过夜。
**descriptorOf 退役：** `:approval:` 分支删除（`descriptorOf` 对 `kind==='approval'` 返回 `''`，注释 `// approval descriptor 退役（ADR-017）——不入推号机制`）；`setPending` 对 approval 的调用在 B5 消亡前保留（不推号靠 B5 删除调用点，非本任务）。

- [ ] **Step 1：写失败测试**——七防线 L1（全量断言代码）:

```typescript
describe('ADR-017 授权窗口转换族', () => {
  const rec = (id: string, over: Partial<ApprovalRecord> = {}): Omit<ApprovalRecord, 'state'> => ({
    requestId: id, kind: 'tool', toolName: 'bash', subject: 'npm install',
    argsFingerprint: 'fp', request: { toolName: 'bash', subject: 'npm install', reason: '', risk: 'high' }, ...over,
  })
  const base = () => approvalRequested({ ...initialState(), pending: 'none' }, rec('a1'), false)

  it('防线①确认卡接管：窗存续不置槽不推号（dc/seq 不动）', () => {
    const withGoal = { ...initialState(), pending: 'goal' as const, decisionInstanceSeq: 3, decisionContent: { kind: 'goal' as const, since: '', instanceId: 3 } }
    const s = approvalRequested(withGoal, rec('a2'), true)
    expect(s.pending).toBe('goal')
    expect(s.approvalWindow.requests[0].state).toBe('queued')
    expect(s.decisionInstanceSeq).toBe(3)
  })
  it('P-03 基数：两请求相继到达——第二者 queued（恰一呈现）', () => {
    const s = approvalRequested(approvalRequested(initialState(), rec('b1'), false), rec('b2'), false)
    expect(s.approvalWindow.requests.map((r) => r.state)).toEqual(['pending', 'queued'])
  })
  it('同 id 幂等 no-op（引用相等——调用层据此打 duplicate 点）', () => {
    const s1 = base()
    expect(approvalRequested(s1, rec('a1'), false)).toBe(s1)
  })
  it('id∉窗/已决→no-op（引用相等，防线②）＋miss 不触 rejectStreak/槽', () => {
    const s1 = base()
    const after = approvalDecided(s1, { requestId: 'zz' }, { confirm: true })
    expect(after).toBe(s1)
  })
  it('allow/deny 同权入态；deny 带拒绝记忆＋原因（不变量 8）', () => {
    const s1 = base()
    const ok = approvalDecided(s1, { requestId: 'a1' }, { confirm: true })
    expect(ok.approvalWindow.requests[0]).toMatchObject({ state: 'approved', decidedBy: 'user' })
    expect(ok.pending).toBe('none')
    const no = approvalDecided(s1, { requestId: 'a1' }, { confirm: false, reason: { kind: 'other' } })
    expect(no.approvalWindow.requests[0].state).toBe('denied')
    expect(no.deniedApprovals).toEqual([{ toolName: 'bash', subject: 'npm install' }])
    expect(() => approvalDecided(s1, { requestId: 'a1' }, { confirm: false, reason: undefined as never })).toThrow(TypeError)
  })
  it('batch:window 逐 id 记账；reject-rest 减集；已过成员独立闸跳过（M-04）', () => {
    let s = approvalRequested(approvalRequested(approvalRequested(initialState(), rec('c1'), false), rec('c2'), false), rec('c3'), false)
    s = approvalDecided(s, { requestId: 'c2' }, { confirm: true })
    const batched = approvalDecided(s, { batch: 'window' }, { confirm: false, reason: { kind: 'scope' } })
    expect(batched.approvalWindow.requests.map((r) => r.state)).toEqual(['denied', 'approved', 'denied'])
    const rest = approvalDecided(s, { batch: 'reject-rest', keep: ['c3'] }, { confirm: false, reason: { kind: 'scope' } })
    expect(rest.approvalWindow.requests.map((r) => r.state)).toEqual(['denied', 'approved', 'pending'])
  })
  it('归零释放槽＋drainQueued 推进呈现＋确认卡让位回槽（防线④双向同步）', () => {
    let s = approvalRequested(approvalRequested(initialState(), rec('d1'), false), rec('d2'), false)
    s = approvalDecided(s, { requestId: 'd1' }, { confirm: true })
    expect(s.pending).toBe('approval') // d2 顶上
    expect(s.approvalWindow.requests.map((r) => r.state)).toEqual(['approved', 'pending'])
    s = approvalDecided(s, { requestId: 'd2' }, { confirm: true })
    expect(s.pending).toBe('none')
    // 确认卡接管：槽被 goal 占用→决策后释放——窗内仍有可见记录时槽须回 'approval'
    const taken = { ...base(), pending: 'goal' as const }
    expect(windowResolved({ ...taken, pending: 'none' }).pending).toBe('approval')
  })
  it('settled：批了失败→failed；done 幂等 no-op（journal 为进度权威）', () => {
    let s = approvalDecided(base(), { requestId: 'a1' }, { confirm: true })
    expect(approvalExecutionSettled(s, 'a1', 'done')).toBe(s)
    s = approvalExecutionSettled(s, 'a1', 'failed')
    expect(s.approvalWindow.requests[0].state).toBe('failed')
    expect(approvalExecutionSettled(s, 'ghost', 'failed')).toBe(s)
  })
  it('防线⑤ journal 三判：done 收敛/started→uncertain/≤approved 存续/无行退化 expired+failed', () => {
    let s = approvalRequested(approvalRequested(approvalRequested(approvalRequested(initialState(), rec('e1'), false), rec('e2'), false), rec('e3'), false), rec('e4'), false)
    s = approvalDecided(s, { batch: 'window' }, { confirm: true }) // 四条全转 approved（queued/pending 均为可决集）
    const s2 = reconcileJournal(s, [
      { requestId: 'e1', phase: 'done' }, { requestId: 'e2', phase: 'started' }, { requestId: 'e3', phase: 'approved' },
    ]) // e4 无行→退化
    expect(s2.approvalWindow.requests.map((r) => r.state)).toEqual(['approved', 'uncertain', 'approved', 'failed'])
    const done = approvalRequested(initialState(), rec('e9'), false)
    expect(reconcileJournal(done, [{ requestId: 'e9', phase: 'issued' }]).approvalWindow.requests[0].state).toBe('pending') // 判 A 存续
    expect(reconcileJournal(done, []).approvalWindow.requests[0].state).toBe('expired')
  })
  it('uncertain 唯一用户出口（防线⑥——无自动重放路径存在）', () => {
    const s = { ...initialState(), approvalWindow: { requests: [{ ...rec('f1'), state: 'uncertain' as const }] }, pending: 'approval' as const }
    expect(approvalDecided(s, { requestId: 'f1' }, { confirm: true })).toBe(s) // uncertain 不可决（闸只认 queued/pending）
    const ok = resolveUncertain(s, 'f1', 'settled-done')
    expect(ok.approvalWindow.requests[0].state).toBe('approved')
    expect(ok.pending).toBe('none')
  })
  it('expireWindow：未决→expired、approved→failed（legacy）；ttl 不动 approved', () => {
    const mixed = { ...initialState(), approvalWindow: { requests: [{ ...rec('g1'), state: 'pending' as const }, { ...rec('g2'), state: 'approved' as const }] } }
    expect(expireWindow(mixed, 'legacy').approvalWindow.requests.map((r) => r.state)).toEqual(['expired', 'failed'])
    expect(expireWindow(mixed, 'ttl').approvalWindow.requests[1].state).toBe('approved')
  })
  it('approval 入 descriptorOf 退役（返回空串——不推号）', () => {
    expect(descriptorOf('approval' as PendingKind, undefined)).toBe('')
  })
})
```

- [ ] **Step 2：FAIL** → **Step 3：实现（上文全量）**＋ `rejectApproval` 最小改线 → **Step 4：`npx vitest run tests/unit/conversationState.test.ts` 绿＋双 tsc＋全量 L1 无新红**。**Commit** `feat(domain): ADR-017 B2 窗口转换族八函数（allow/deny 同权入态，t000073 领域根治）`

### Task B3：事件注册表与派生（timeline.ts）

**Files:**
- Modify: `src/domain/timeline.ts`（union `:54-79` 区、SPECS `:167-194` 区、`deriveStateEvents` `:272+`）
- Test: `tests/unit/timelineEvents.test.ts`（追加）

**Interfaces:**
- Produces: 新事件类型 `'approval.duplicate_ingress'`（domain tool；detail requestId/fingerprintMatch）与 `'approval.uncertain_raised'`（domain tool；detail requestId）；`decision.requested/resolved` 授权族载荷（窗 diff 派生，detail：`kind:'approval', requestId, window` 快照 / `point:'approval', action, requestId, decidedBy`）；`session.pending_set/cleared` 现有行**不动**（approval 槽变化仍经 pending diff 发——置/清者变了，事件语义不变）。

**deriveStateEvents 新增（函数体内，decision.requested 现有规则之后）：**

```typescript
  // ADR-017 窗派生：新增 pending 呈现记录（开窗）——decision.requested 授权族（不推号，与确认卡族规则并存）
  const prevVisible = prev.approvalWindow.requests.filter((r) => r.state === 'pending').map((r) => r.requestId)
  for (const r of next.approvalWindow.requests) {
    if (r.state === 'pending' && !prevVisible.includes(r.requestId)) {
      events.push({ type: 'decision.requested', detail: { kind: 'approval', requestId: r.requestId, toolName: r.toolName, subject: r.subject, window: next.approvalWindow.requests.map((x) => ({ requestId: x.requestId, state: x.state })) } })
    }
    if (r.state === 'uncertain' && prev.approvalWindow.requests.find((x) => x.requestId === r.requestId)?.state !== 'uncertain') {
      events.push({ type: 'approval.uncertain_raised', detail: { requestId: r.requestId, toolName: r.toolName } })
    }
    const was = prev.approvalWindow.requests.find((x) => x.requestId === r.requestId)
    if (was && (was.state === 'queued' || was.state === 'pending') && (r.state === 'approved' || r.state === 'denied')) {
      events.push({ type: 'decision.resolved', detail: { point: 'approval', action: r.state === 'approved' ? 'confirm' : 'reject', requestId: r.requestId, decidedBy: r.decidedBy } })
    }
  }
```

  并删除 `:320` 的 `else if (prev.pending === 'approval')` **confirm 推断分支**（approved 决策不再经 pending 清位推断——窗 diff 成为唯一源；reject 分支 `deniedApprovals` diff 保留至 B4 收口后评估——本期保留，双发风险由 requestId 载荷区分并在 timelineEvents 测试锁定）。

- [ ] **Step 1：写失败测试**（timelineEvents.test.ts）：`approvalRequested(initialState(), rec, false)` 一步 → deriveStateEvents 含 `decision.requested(kind approval, requestId)`；decided → `decision.resolved(requestId, decidedBy:'user')`；uncertain 置位 → `approval.uncertain_raised`；SPECS 注册断言（`TIMELINE_EVENT_SPECS['approval.duplicate_ingress'].domain==='tool'`）。
- [ ] **Step 2 FAIL → Step 3 实现 → Step 4 绿。**Commit** `feat(domain): ADR-017 B3 事件注册表与窗派生（decision.* 按族二选一载荷）`

### Task B4：四入口改线（useConversationState / useToolApproval / 首执行路径 / 文本恰一 / plan-batch）

**Files:**
- Modify: `src/renderer/useConversationState.ts`（hook 封装）
- Modify: `src/renderer/useToolApproval.ts`（approve/reject/remember/batch/plan 五函数）
- Modify: `src/renderer/ConversationPanel.tsx`（`:1765-1875` 首执行；`:2565-2599` 文本路由；`:3450/:3497/:3508/:3351` 卡按钮闭包携 requestId；`useToolApproval` deps 装配区 `:2745+`）
- Modify: `src/main/ipc.ts`＋`src/preload/preload.ts`＋`src/renderer/types.d.ts`（`approval:reconcile`/`approval:issue` IPC）

**Interfaces:**
- Consumes: B2 转换族、B3 事件、A2/A3 main 面
- Produces: hook `requestApproval(rec, slotBusy): boolean`（false＝同 id 重复→duplicate 打点）；`decideApproval(target, decision): boolean`（false＝闸 miss→stale 打点 `conversation.stale_input_discarded` detail 携 requestId×窗态）；`settleApproval(id, outcome)`；`drainWindow()`；`expireWindowTtl()`

**关键改线（精确锚点＋替换）：**

1. **首执行入窗**（ConversationPanel exec .then 内 `setMessages` 的 needApproval 分支 `:1864-1868`）：patch 卡的同时取 `r.approvalRequestId`，在 `.then` 尾部（setMessages 之后）追加：

```typescript
        if (r.needApproval && r.approvalRequestId) {
          const subject = String(tc.args?.command ?? tc.args?.path ?? tc.args?.url ?? tc.name)
          requestApproval(
            {
              requestId: r.approvalRequestId, kind: 'tool', toolName: tc.name, subject,
              argsFingerprint: r.approvalFingerprint ?? '',
              request: { toolName: tc.name, subject, reason: r.error ?? '', risk: toolRisk(tc.name) === 'high' ? 'high' : 'low' },
            },
            ['goal', 'plan', 'resolution', 'system_clarify'].includes(stateRef.current.pending),
          )
        }
```

2. **approveToolCall**（useToolApproval `:121-177`）：`tc` 类型 `ToolCallMsg` 加 `approvalRequestId?: string`（ConversationPanel 导出类型处）；函数体在 `onApprovalAllow?.()` 后插入进门（false→直接 return，不 patch 不复执行）：

```typescript
    const id = tc.approvalRequestId
    if (id && !decideApproval({ requestId: id }, { confirm: true })) return
```

二次 execute 改 `{ approved: true, requestId: id, rootPath…, sessionId }`；`.then` 首行 `if (id) settleApproval(id, r.ok ? 'done' : 'failed')`。`id` 缺失＝旧档恢复卡（C1 前过渡）→ 走旧路径并 tlog `conversation.error { kind:'approval-id-missing' }`（观察，不静默）。
3. **rejectToolCall**（`:179-206`）：`decideApproval({ requestId: tc.approvalRequestId }, { confirm:false, reason:{ kind:'direction' } })` 取代 `rejectApproval(...)` 调用（hook 内不再经旧兼容线）；patch 用 `patchToolCall(idx, …, tc)`（id 定位——B6 提前并入本任务，reject 路径现成 `msg.id` 分支可用）。
4. **rememberAndApprove/approveAllRemember/approveAllToolCalls**（`:209-227/:306-310`）：逐卡调 `approveToolCall`（其内已进门）；`addTrust` 保留（C3 迁 main）。文本恰一（ConversationPanel `:2588-2599`）替换为：

```typescript
        } else if (pendingKind === 'approval' && /^(行|好|可以|批准|同意|没问题|确认|就这么办)[。！!~～]?$|批准|同意/.test(text)) {
          // ADR-017 §4：窗内恰一可决才认文本批准；多记录→不生效＋可见提示（不静默、不落入 C2 误判）
          const dec = decidableRequests(stateRef.current.approvalWindow)
          if (dec.length === 1) {
            const lastMsg = messagesRef.current[messagesRef.current.length - 1]
            const tc = lastMsg?.toolCalls?.find((c) => c.approvalRequestId === dec[0].requestId)
            if (tc) approveToolCall(lastMsg!.toolCalls ?? [], lastMsg!.toolCalls!.indexOf(tc), tc)
          } else if (dec.length > 1) {
            setApprovalHint('有多张待批授权卡——请在卡片上逐张指明批准')
            setTimeout(() => setApprovalHint(''), 6000)
          }
        }
```

   `approvalHint` state＋amber div（`role="status"`）复用 T4 期 staleNotice 的渲染形态（信任条上方同列表——照 `.nf-stale-notice` 现有 JSX 复制改名，样式类共用）。
5. **plan-batch**：approve-files 卡（模型工具调用被渲染为 `file-approval` 状态的分支——ConversationPanel 首执行同族路径）——`approvePlan`（useToolApproval `:230-256`）开头：`const id = tc.approvalRequestId ?? (await issuePlanBatchApproval(tc))` 经 IPC `approval:issue`（main：`{ toolName:'approve-files', subject: summary, argsFingerprint }` → journal issued＋返回 requestId/fingerprint）；`decideApproval({requestId:id},{confirm:true})` 进门后才执行**原样**的 `grantPlan + plannedFiles.add` 链（G2：写窗记决定、approvalGranted 开清单门）。
6. **hook 装配**（useConversationState）：

```typescript
    requestApproval: (rec, slotBusy) => {
      const before = stateRef.current
      const r = transition((s) => approvalRequested(s, rec, slotBusy))
      if (r === before) { emit('approval.duplicate_ingress', { requestId: rec.requestId, fingerprintMatch: before.approvalWindow.requests.find(x=>x.requestId===rec.requestId)?.argsFingerprint === rec.argsFingerprint }) ; return false }
      return true
    },
    decideApproval: (target, decision, by?: 'user' | 'rule') => {
      const before = stateRef.current
      const r = transition((s) => approvalDecided(s, target, decision, by))
      if (r === before) { emit('conversation.stale_input_discarded', { answers: typeof target==='object'&&'requestId' in target?target.requestId:null, window: before.approvalWindow.requests.map(x=>({requestId:x.requestId,state:x.state})) }); return false }
      return true
    },
    settleApproval: (id, outcome) => transition((s) => approvalExecutionSettled(s, id, outcome)),
    drainWindow: () => transition(drainQueued),
```

（`conversation.stale_input_discarded` 已注册（ADR-015）——detail 新键不改 spec 的 detailKeys 约定（宽松）。）

- [ ] **Step 1：写 L1**：`tests/unit/useConversationState.test.ts` 追加 `requestApproval` 首次 true/重复 false＋duplicate emit；`decideApproval` miss→false＋stale emit（mock transition 语境按该文件现有模式）。L3 断言留 B8。
- [ ] **Step 2 FAIL → Step 3 实现 → Step 4：**`npx vitest run` 全量（旧 approval 用例允许在此任务内同步改——见 B7 清单前移项）＋双 tsc。**Commit** `feat(renderer): ADR-017 B4 四入口＋plan-batch 改线窗寻址（allow/deny 全进门）`

### Task B5：D5 effect 退役与消费方迁接

**Files:**
- Modify: `src/renderer/ConversationPanel.tsx`：删 `:320-350` hasApproval effect 整块；`:1932-1936`（`shouldStopContinuation` 供料）、`:703`（status 打点）、`:2766`（deps 装配处 pending 喂数）读窗
- Modify: `src/renderer/busyGate.ts` 消费方（`:2766` 同语境）——**函数本身不改**（槽值保留）

**关键替换：**
1. 删除 D5 effect（其置槽职责＝B4 `requestApproval`；其清槽职责＝`windowResolved/drainQueued`）。
2. `:1932-1936` 现值（问题 A 十四轮回归防线）：凡读 `pending==='approval'` 的续转停止判定，改为 `pending === 'approval' || decidableRequests(stateRef.current.approvalWindow).length > 0`（确认卡占槽＋窗有货＝同样停）；行内保留注释 `// ADR-017 B5：D5 退役后窗事实直读（原经 pending 代理——纯镜像断言失效）`。
3. `:703` status：`stateRef.current.pending === 'approval' || (decidable… && pending==='none'===false 场景不扩)`——**保持读槽原样**（approval 值仍由窗正确置位——B2 转换族是置槽唯一者；不扩条件，防 status 语义漂移）。
4. 删除 hook 中 `setPendingState('approval', …)` 的一切调用路径；`clearPending` 不再清 `decisionContent.approval`（dc 已限确认卡族——类型面 B1 后 `DecisionContent.approval?:` 字段删除：`conversationState.ts` DecisionContent 去 `approval` 成员、protocolTools 的 `Omit<DecisionContent,'kind'|'instanceId'>` 不变）。
5. **确认卡让位回槽（双向同步收口）**：hook 的 `confirm/reject/clearPending` 三处 transition 外层包一步 `windowResolved`（确认卡释放 pending='none' 后，窗内若仍有可见 pending 记录，槽须回 `'approval'`——B2 双向版；测试入 useConversationState.test.ts：goal 卡接管→确认→断言 pending 回 approval 且卡呈现记录不变）。

- [ ] **Step 1：L1**：conversationState.test.ts 中"approval 置位携 ApprovalRequest 铺骨架"旧用例（ADR-015 X2 案）改判——**approval 不铺 dc**：`setPending` 已无 approval 调用者，把该用例改为窗断言（`requestApproval` 后 `decisionContent` 保持 undefined）。useConversationState.test.ts：模拟 needApproval 记录入窗→`pending==='approval'`；批准→归零→`none`；确认卡占槽→queued 不置槽。
- [ ] **Step 2 FAIL → Step 3 实现 → Step 4 全量 L1＋双 tsc。**Commit** `refactor(renderer): ADR-017 B5 D5 effect 退役——pending=approval 降为窗派生（消费方四处迁接）`

### Task B6：定位统一与双 id 文档化

**Files:**
- Modify: `src/renderer/useToolApproval.ts`（rejectToolCall 已 B4 走 patchToolCall id 分支——本任务收口 `approveAllRemember` 的 `calls.indexOf(c)` 反查与 `stopToolCall`）
- Modify: 注释面（`ConversationPanel` ToolCallMsg 类型定义处）

**内容：** `ToolCallMsg` 注释定双 id 语义：`id＝卡定位（流事件层生成——patch 寻址）；approvalRequestId＝审批寻址（main 签发——窗/闸/journal）`；`approveAllRemember` 循环改 `calls.map` 保 index（消除 indexOf O(n²) 与引用比较脆性）；`stopToolCall`（`:282-303`）在标记卡 error 的同时对窗内受影响记录 `expireWindow('legacy')` 前调逐条 `decideApproval({requestId},'拒绝原因=用户停止')`——**裁定：停止＝denied（decidedBy user）**，避免悬挂 queued。
- [ ] **Step 1：L1（stopToolCall 单测在 useConversationState/hook 语境——按该文件现有 mock 模式）→ Step 2 FAIL → Step 3 → Step 4 绿。**Commit** `refactor(renderer): ADR-017 B6 双 id 定位统一（tc.id=卡、requestId=审批）`

### Task B7：L1 七件断言重写（收口批）

**Files:** Modify `tests/unit/{conversationState,timelineEvents,tools,permissionRules,hardOrderGate,agentLoop,busyGate}.test.ts`

逐项（每文件列**具体断言**，非泛写）：
- **conversationState.test.ts**：B2 describe 已入库；清残留——所有构造 `approvalDecided(s, {toolName,subject,…})` 旧形调用改新签名；ADR-015 describe 中 approval 铺骨架案改窗断言（B5 前移项核对）；`userDecided` approval 防御行（`:268`）保留并补注 `// 确认点不处理 approval（窗口族自管——ADR-017）`。
- **timelineEvents.test.ts**：B3 新案；`decision.resolved` 双源去重断言：approval confirm 经 pending 清位推断的旧案删除（B3 已删分支）。
- **tools.test.ts**：A2/A3 已入；新增 **executeGated 判定启用**（B 期）：`approved:true` **无 requestId 且非 rule/preApproval 通道** → 拒：`{ ok:false, policy:true, error }`；requestId 属 journal ∧phase=issued→放行；args 换内容（fingerprint≠）→拒。实现（tools.ts `:165` 分支后）：

```typescript
    if (!ruleAllows && tool.requiresApproval && opts.approved && !opts.requestId) {
      // ADR-017 B：renderer 盲信面关闭——无审批身份的可信布尔拒（旧 approved:true 旁路终结）
      return { ok: false, policy: true, error: `「${name}」缺授权标识——请经授权卡重新批准` }
    }
```

- **permissionRules.test.ts**：显式序 rescanning 案——同 tool 同 specifier 同时存在 deny+allow 时 deny 胜（现 first-match 依赖序）；实现：`tools.ts:156` `this.rules.find(…)` 改两趟扫描（先 deny 命中即拒，再 allow）：

```typescript
    const denyRule = this.rules.find((r) => r.action === 'deny' && matchesRule(name, args, r))
    if (denyRule) return { ok: false, policy: true, error: `已阻止：${name}（deny 规则 ${denyRule.specifier || '全部'}）——如需执行请先调整授权规则` }
    const ruleAllows = this.rules.some((r) => r.action === 'allow' && matchesRule(name, args, r))
```

- **hardOrderGate/agentLoop/busyGate.test.ts**：全绿适配——断言面改窗（hardOrderGate：write 被 pending 拦的案不变（槽值同源）；agentLoop：need-approval 停轮案改经 requestApproval 建窗后驱动）。
- [ ] **执行序**：每文件改→跑→绿，一次 commit：`test: ADR-017 B7 L1 断言按窗语义重写（七件收口）`

### Task B8：L3 interaction 收口（mock 面＋分组套件）

**Files:** Modify `tests/interaction/core.interaction.ts`（问题 A 案 mock：`tools.execute` 返回体加 `approvalRequestId:'apr_t_1'`/`approvalFingerprint`）；`tests/interaction/*` 其余授权案（v4 双卡/合并/S7-3/A-016 组）按 mockBridge 现有 `tools.execute` 桩形同步；`tests/interaction/helpers/mockBridge`（若 execute 桩有集中工厂）。

**要点（具体改动，非泛写）：**
1. addInitScript mock 的 `window.neonforge.tools.execute` 返回 `{ ok:false, needApproval:true, approvalRequestId:'apr_'+(++__id), approvalFingerprint:'fp' }`；`approval:reconcile` 桩 `async () => ({ rows: [] })`；`approval:issue` 桩回 `{ requestId:'apr_pb_'+(++__id), argsFingerprint:'fp' }`（preload 新通道在 mock 缺省即 undefined→requestApproval 走 `id 缺失` 过渡路径并打 `approval-id-missing`——**必须补桩**防噪声）。
2. 问题 A 案断言不变式复核：悬挂不批→chatCount 定格逻辑依赖 `pending==='approval'` 拦截（槽值派生自窗——mock 供 needApproval 即建窗，行为等价）；批准后恢复案追加断言 `已批准` 卡态不变＋**新断言**：批准后 execute 调用参数含 `requestId`（mock 记录 opts 断言一次）。
3. S6 组（curl localhost 自动放行）不变——rule/preApproval 通道无 id（B7 的无 id 拒**仅限 requiresApproval && approved:true 布尔在场**；auto 通道 opts.approved 为 false/undefined 不受影响——用例锁定）。
- [ ] **Step 1：** 改 mock → 跑 `npx playwright test --project=interaction` 取**新基线**（测中只记——ADR-012；批完→汇报→再裁修）→ **Step 2：** 汇报后按裁决修产品/断言（独立修批）→ **Step 3：** 复跑绿。**Commit** `test: ADR-017 B8 L3 mock 与套件按窗语义改桩`

**阶段 B 出口门禁（原子对完成）：** 全量 L1＋双 tsc＋eslint＋L3 无新增稳定红（对照阶段 A 出口基线，N≥3 取交集法同 T0 规程）→ **阶段 B 整体视为一次可发布**。

---

# 阶段 C（持久化＋恢复对账＋规则权威回收）

### Task C1：sessionStore 信封形状迁移

**Files:** Modify `src/renderer/sessionStore.ts`；Test `tests/unit/sessionStore.test.ts`

**Produces:** `export interface SessionEnvelope { messages: StoredMsg[]; approvalWindow?: ApprovalWindow; decisionInstanceSeq?: number }`；`saveSession(env)` / `loadSession(): SessionEnvelope | null`（**裸数组旧档 → `{messages: parsed, approvalWindow: undefined}`** 兼容分支——`Array.isArray(parsed)` 判定保留）；`clearSession` 不变。StoredMsg 不再挂窗（独立字段，提案 §6-2）。
- [ ] **Step 1 失败测试**：旧裸数组 JSON → 读出信封且 messages 原样；新形状 round-trip；`dc.approval` 序列化面删除（DecisionContent 类型 B5 后无 approval——用例同步）。**Step 2 FAIL → Step 3 实现 → Step 4 绿。**Commit** `feat(renderer): ADR-017 C1 会话信封（messages+窗快照）`

### Task C2：恢复对账（reconcile IPC 消费＋restorePending 收窄＋uncertain UI）

**Files:** Modify `src/main/ipc.ts`（`approval:reconcile` 真实现＝`getApprovalJournal().latestRows()`）；`src/renderer/ConversationPanel.tsx`（加载路径：loadSession → 窗快照注入 `restoreWindow(env.approvalWindow)` → `void window.neonforge.approval.reconcile().then(({rows}) => transition(s=>reconcileJournal(s, rows)))`）；uncertain 卡组件（授权卡位 state==='uncertain' → 双按钮"标记已完成"/"确认未发生并重执行"→ `resolveUncertain`）；`restorePending` 调用面收窄确认卡族（approval dc 残值忽略）。
**L3：** 新案 `tests/interaction/restart-reconcile.interaction.ts`：mock `approval:reconcile` 回 `[{requestId:'apr_x_1',phase:'started'}]` → 恢复会话呈现 uncertain 卡 → 点"标记已完成"→ 窗记录 approved（断言卡文消失＋decision.resolved 不重发）。
- [ ] **Step 1 测试（上案 L3＋L1：restoreWindow/reconcile hook 行为）→ Step 2 FAIL → Step 3 实现 → Step 4 绿。**Commit** `feat: ADR-017 C2 恢复 journal 三判对账与 uncertain 用户裁决卡`

### Task C3：规则三档权威归 main

**Files:** Create `src/main/sessionGrants.ts`（main 会话规则表：`add/lookup/clear`，含 specifier 前缀语义＝现 ruleArg 提取式）；Modify `src/main/tools.ts`（write/edit 执行前查 sessionGrants——`auto` 通道；`preApproval` 合成点）、`src/main/ipc.ts`（`approval:add-grant / approval:clear-grants`）、`src/renderer/ConversationPanel.tsx`（`taskTrust/taskTrustRef/addTrust/isTrusted` 改呈现投影：goal 确认处 `void approval.clearGrants()`；记住按钮 IPC 下发 tier；status_bar 信任条数据源＝main 回读（低频——复用 reconcile 通道 rows/规则快照皆可））。
**行为不变式 L1**（`tests/unit/tools.test.ts` 扩展＋新 `sessionGrants.test.ts`）：session 档命中→write 免卡自动执行；`clear-grants` 后同路径再弹卡；**persistent/bash 双保险**：`addGrant({tier:'persistent', tool:'bash'})` 返回拒绝（main 权威，压过 renderer 任何 UI）。
**rule-decided 回写（§2 不变量 1 预先裁决骑注的执行面）**：main execute 在 ruleAllows/preApproval-auto 命中且工具本需批准时，ToolResult 附 `ruleDecided?: { toolName; argsFingerprint }`（新可选字段）；renderer 首执行 `.then`：`if (r.ruleDecided) { const m = stateRef.current.approvalWindow.requests.find(x => x.toolName===r.ruleDecided!.toolName && x.argsFingerprint===r.ruleDecided!.argsFingerprint && (x.state==='queued'||x.state==='pending')); if (m) decideApproval({ requestId: m.requestId }, { confirm: true }, 'rule') }`——**同轮稍晚被 grant 命中的存量窗记录不再僵死**（queued 等待者由规则放行时自动收敛，decidedBy:'rule' 入档→decision.resolved 事件带 rule）。L1：tools.test（ruleDecided 字段出现/不出现两案）＋useConversationState.test（'rule' 路径 decidedBy 断言）。
- [ ] **Step 1 测试 → Step 2 FAIL → Step 3 实现 → Step 4 全量绿＋双 tsc。**Commit** `feat(main): ADR-017 C3 规则三档权威归 main（renderer taskTrust 降投影）`

**阶段 C 出口：** 全量四闸（L1/双 tsc/L3/eslint）＋handoff 记录施工收口。

---

## 总验收（对提案 §7 五→七防线与 §8 落稿项的覆盖自证）

| 提案条款 | 任务 |
|---|---|
| 签发唯一性（v3.1 条款） | A1（bootNonce-in-id 测试）＋B7 tools（无 id 布尔拒） |
| 四入口收敛＋同权入态 | B2（decided 单函数）＋B4（五调用点全进门） |
| 恰一呈现基数（P-03）/接管不推号 | B2 防线①②用例 |
| journal 三判＋uncertain 禁自动重放 | A3/C2＋B2 判 C 案 |
| 规则三档归 main＋bash 永不进 | C3 双保险案 |
| plan-batch 入窗、执行链正交（G2/M-05） | B4.5＋B7 hardOrderGate 适配 |
| D5 退役四消费方（含 shouldStopContinuation） | B5.2 |
| 恢复语义同批（防双规则并存） | C1+C2 同阶段（文档侧 intent-design §8.2E 已落） |

**风险提示（施工期）：** B4/B5 触碰 ConversationPanel 高耦合区（`:320/:703/:1932/:2588/:2766`）——每处改完即跑问题 A/S5-2/S6 案；阶段 B 任何单任务不可独立发布，中断须回到原子对起点或整对完成。
