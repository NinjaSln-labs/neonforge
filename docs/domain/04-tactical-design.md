# 04 — 战术设计（无阶段·目标驱动版）

> 2026-08-07 重新生成——聚合、值对象、领域服务，基于无阶段目标驱动领域模型（02 领域模型 / 03 战略设计）。
> 替代旧六阶段版（ContextEngine/Compaction/PrefixCache 等围绕产品流水线的战术设计）。

---

## 1. 聚合（Aggregates）

### 1.1 Task 聚合（Conversation BC——会话内子状态机）

**目标驱动的执行单元**（会话内——只管三个**任务级**确认点）。**注意：单一 PENDING 状态机归属会话级（Conversation 聚合——§1.2）——Task 不承载 pending**（工具级授权等待是会话级 pending 的一部分，不在 Task 状态机内）。

> **实现形态（2026-08-15 定论——M4 文档承认）**：Task 状态与会话级 PENDING 承载于**同一状态结构**（`conversationState.ts` 的 `ConversationState`——goal/execution/achievement 三确认布尔 + 会话 pending + plannedFiles/producedFiles 一体）——语义等价（pending 仍是会话级语义：确认卡/授权卡统一冻结、用户决策是下一状态唯一输入；三布尔 = 5 态语义映射：clarifying=三 false、goal-confirmed=goal true、executing=goal+plan true、resolved-pending=goal+plan true+完成声明（证据对账中）、resolved=resolution true——2026-08-16 更名：execution→plan、achieved-reported→resolved-pending、achievement→resolution，第 13 轮审计 #14 同步），**结构合并**（避免双聚合同步开销与跨层一致性问题——2026-08-14 状态机落地选型）；A0 §3.2 单一 PENDING 语义不变。

```
┌─────────────────────────────────────────────────────────────┐
│ Task (聚合根——会话内子状态机)                                   │
│                                                             │
│ id / goalText / status: clarifying|goal-confirmed|executing  │
│      |achieved-reported|resolved                             │
│                                                             │
│ ◆ goal: Goal              // 目标（值对象——目标确认后锁定）     │
│ ◆ planProposal: PlanProposal | null  // 方案提议（值对象——2026-08-16 更名，原 executionPlan/ExecutionPlan）│
│ ◆ confirmations: Confirmation[]        // 确认记录（时间线）   │
│ ◆ plannedFiles: PlannedFiles           // 计划清单（宿主边界） │
│ ◆ producedFiles: Set<FilePath>         // 已产出文件          │
└─────────────────────────────────────────────────────────────┘
```

**状态机（任务级确认点驱动——pending 在会话级）**：

```
clarifying ─[用户确认目标]→ goal-confirmed ─[用户批准方案]→ executing
    ↑                           ↑                               │
    │ [重新描述+原因]            │ [修改方案+原因——重提议]        │ [完成声明+证据]
    └───────────────────────────┴───────────────────────────────↓
                                                       resolved-pending ─[证据对账通过→确认解决]→ resolved
                                                         ↑
                                                         └ [还要改+原因]——回 executing 继续执行
                                                           （推进保障保持不收敛）
```

> 2026-08-16 第 13 轮审计 #2 修正：删除杂散态 `unresolved`（未在任何类型/设计中定义）——5 态与 §6 类型汇总一致；「还要改」= 解决被拒 → 回 executing 继续执行（无证据不对账：证据不完备的完成声明不进入 resolved-pending）。

每个确认点转换都经过**会话级 PENDING**（§1.2——决策点弹出 → 会话 pending → 用户是/否 → 状态推进/回退）。

> 2026-08-16 同步（意图确认领域模型重设计——`intent-confirmation-domain-design.md`）：确认点语义更新——「确认执行」→「批准方案」（PlanProposal：文件+假设+验证计划）；「确认达成」→「确认解决」（CompletionClaim+证据对账——无证据不对账，证据不足不进入 resolved-pending）；决策点触发权在系统（确定性派生——模型只能提议，§A0 3.6）；拒绝带原因（RejectReason 回填）。executing 态内模型受**推进保障**约束（强制对象=推进≠调工具——模型可输出提议/证据/提问）。

**不变式**：
- 未确认目标 → 不进入 executing（模型只澄清）
- 未批准方案 → 不产生执行动作（write/edit/**有副作用 bash**——探索性只读命令如 ls/cat 放行：与 §3.6 actionGate 只读自动同源——A0 §3.1 澄清，2026-08-16 第 14 轮审计 #1 对齐）
- 未确认解决 → 不收敛（推进保障保持——模型必须继续推进：产出/提议/证据）
- 无证据不对账 → 证据不完备的完成声明不进入 resolved-pending（「已解决」卡不弹）
- **pending（会话级）→ 模型动作全部无效**（做了白做——用户决策是下一个状态的唯一输入）

### 1.2 Conversation 聚合（Conversation BC——单一 PENDING 状态机宿主）

```
┌─────────────────────────────────────────────────────────────┐
│ Conversation (聚合根——会话级单一 PENDING 状态机)                 │
│ id / messages: Message[]                                    │
│ ◆ pending: PendingDecision | null   // 会话级等待状态（核心！）  │
│     └─ 来源：目标确认卡 / 方案确认卡 / 解决确认卡 / 授权卡     │
│     └─ pending 下模型动作全部无效（做了白做——不执行不生效）      │
│ ◆ activeTask: Task | null        // 会话内当前任务（目标驱动）   │
│ ◆ environmentSnapshot: EnvSnapshot // 注入模型的环境事实        │
│ ◆ timelineRef: TimelineRef       // 会话时间线引用             │
└─────────────────────────────────────────────────────────────┘
```

**单一 PENDING（会话级——2026-08-07 领域定论）**：

```
任何需要用户决策的点（卡弹出）──→ 会话进入【PENDING：等用户决策】
    ├─ 目标确认卡 / 方案确认卡 / 解决确认卡（任务级）
    └─ 授权卡（工具级——小阶段——但不批准则后续无法继续，影响任务推进）
                                        │
          pending 下模型动作全部无效（做了等于白做——所有工具都不放行）
                                        │
                            ┌───────────┴───────────┐
                         用户「是」              用户「否」
                            │                       │
                    状态推进 + 模型继续       状态回退 + 模型调整
```

**要点**：
1. **pending 是会话级——只有一个**——任何卡弹出（确认卡/授权卡）→ 会话进入 pending（等用户决策）
2. **pending 下模型动作全部无效**（做了白做）——用户决策是下一个状态的唯一输入
3. **Task 只管任务级确认点**——工具级授权等待由会话级 pending 承载（Task 执行内部触发的会话等待）

### 1.3 PlannedFiles 聚合（Workspace BC）

```
┌─────────────────────────────────────────────────────────────┐
│ PlannedFiles (聚合根——宿主强制边界的数据源)                     │
│ id / taskId                                                   │
│ ◆ files: Set<FilePath>             // 批准可写文件（追加语义）   │
│ ◆ approvalRecords: ApprovalRecord[] // 批准记录（谁批了什么）   │
│ ◆ boundaryVisible: boolean          // 清单对模型显式可见        │
└─────────────────────────────────────────────────────────────┘
```

不变式：追加不覆盖（分批 approve-files 合并）；写清单外文件被拒 + 拒绝带边界内容。

### 1.4 CapabilityRegistry 聚合（Capability BC）

```
┌─────────────────────────────────────────────────────────────┐
│ CapabilityRegistry (聚合根——环境单源)                          │
│ id / projectRoot                                               │
│ ◆ environment: Environment        // 事实来源（一次检测）       │
│ ◆ capabilities: Capability[]      // 语义视图（从环境推导）     │
│ ◆ ledger: Ledger                 // 执行结果回填（自学习）      │
└─────────────────────────────────────────────────────────────┘
```

不变式：环境是事实来源（能力不独立二次检测）；Ledger 失败降级/成功恢复。

### 1.5 Problem 聚合（Conversation BC——问题生命周期，会话外持久化）

**问题 = 一等公民**（2026-08-15 补建模 M3——实现 problemStore 早已落地，模型此前遗漏——见 02 §4.13）：

```
┌─────────────────────────────────────────────────────────────┐
│ Problem (聚合根——跨会话问题记录——断点续做/复跑)                 │
│ id / title / status / updatedAt                               │
│ ◆ snapshot: ProblemSnapshot     // 断点续做上下文（值对象）    │
│   （goal / decisions / authorized / pending）                 │
│ ◆ status: understanding | awaiting-plan | executing |         │
│   awaiting-input | delivered | closed | failed-recoverable    │
└─────────────────────────────────────────────────────────────┘
```

**关系**：Problem 1—N Task（复跑 = 同一 Problem 新 Task）；TaskResolved → Problem closed（handleConfirmClosed 联动——终态）。

**不变式**：快照合并更新（不覆盖已有字段——updateProblemSnapshot）；closed 复开 → 复跑（新 Task 关联）；台账上限 20（防膨胀）。

## 2. 值对象（Value Objects）

### 2.1 Goal

```typescript
interface Goal {
  text: string          // 目标描述（用户确认后锁定）
  status: 'proposed' | 'confirmed' | 'rejected'
}
```

### 2.2 Confirmation（确认记录）

```typescript
interface Confirmation {
  point: 'goal' | 'plan' | 'resolution'（2026-08-16 更名，原 'execution' | 'achievement'）
  action: 'confirm' | 'reject'
  source: 'confirm-card' | 'approval-card' | 'user-word'
  timestamp: number
}
```

### 2.3 PlanProposal（方案提议——2026-08-16 重写，原 ExecutionPlan（summary/files/status——历史——缺假设与验证计划））

```typescript
interface PlanProposal {
  summary: string                 // 一句话方案
  files: Array<{ path: string; reason: string }>  // 文件清单（含理由——plannedFiles 单一来源，A0 §5）
  assumptions: string[]           // 方案假设（技术选型/行为细节——用户审阅点——A0 §3.6）
  verificationPlan: string[]      // 验证计划（怎么证明做成了——「解决确认」的证据承诺，A0 §4.2）
  status: 'proposed' | 'confirmed' | 'rejected'
}
```

> 2026-08-16 审计 #1 重写：原 ExecutionPlan（summary/files/status）缺 assumptions/verificationPlan——S1 实现以本定义为准（对齐设计文档 §3.2/A0 §5）。

### 2.3b 意图确认值对象（2026-08-16 第 12 轮审计 #1 补——签名权威：设计文档 §3.2；§3.6 引用落地）

```typescript
interface GoalProposal {          // 目标提议（模型产出——A0 §3.6）
  statement: string               // 一句话目标（原【目标确认】文本）
  assumptions: string[]           // 模型的关键假设（用户从未确认过的细节——必须显式呈现）
}

interface CompletionClaim {       // 完成声明（模型产出——A0 §4.2）
  summary: string                 // 做了什么
  evidence: CompletionEvidence    // 证据（不足 = 声明不完整——无证据不对账）
}

interface CompletionEvidence {    // 完成证据（对账对象——verifyCompletion）
  verification: Array<{ command: string; output?: string; passed?: boolean }>  // 可核验证据（lint 循环/验证命令方向）
  diffs: Array<{ path: string }>  // diff 对账（用户原始目标 vs 声称完成）
  pendingQuestions: string[]      // 模型自己不确定/需要用户判断的事项
}

interface ApprovalRequest {       // 授权请求（ActionGate 产出——DSH ApprovalRequest 同构）
  toolName: string
  subject: string                 // 要执行什么（命令/写哪个文件）
  reason: string                  // 为什么需要授权（verbatim）
  risk: 'low' | 'medium' | 'high' // 动作属性分级（ActionGate 判定）
}

interface RejectReason {          // 拒绝原因（用户决策的一部分——Cline denial reason / Deep Code 回灌方向）
  kind: 'direction' | 'scope' | 'complexity' | 'missing-info' | 'modify' | 'other'
  // modify = 「修改」决策（§2 Decision 三型之一）：携带修正内容，模型按修正内容重提议——
  //   V1 表达：修改 = 拒绝（kind='modify'）+ 修正内容（text/target）→ 模型重提议；
  //   不单列状态转换分支（状态机保持 confirm/reject 二元——不变量 1/8）
  text?: string                   // 自由文本 / 修正内容
  target?: string                 // 针对的具体内容（方案第几条/哪个文件/哪个假设）
}

interface ActionAttribute {       // 动作属性（门控判定结果——与模型自评无关）
  kind: 'readonly' | 'in-plan' | 'out-of-plan' | 'network-read' | 'hazardous'
  basis: 'tool-type' | 'command-head' | 'command-chain' | 'git-subcommand' | 'plan-list'  // 判定依据（审计追溯）
}
```

> 2026-08-16 第 12 轮审计 #1：§3.6 服务签名引用的 ActionAttribute/CompletionClaim/RejectReason 在此落地（原引用悬空）；PlanProposal 见 §2.3（同源——不重复定义）。

### 2.4 Capability（能力视图）

```typescript
interface Capability {
  id: string
  category: 'system' | 'external'
  status: 'ready' | 'missing' | 'failed'   // missing=未装 / failed=装了但不可用
  implementations: string[]
  requires?: string[]
  detail?: string
}
```

### 2.5 Environment（环境快照——事实来源）

```typescript
interface Environment {
  rootPath: string
  runtime: 'node' | 'python' | 'none'
  runtimeVersion: string
  hasPackageJson: boolean
  hasNodeModules: boolean
  packageManager: string
  toolchain: string[]            // node_modules/.bin 工具
  systemRuntime: {               // 宿主 runtime（能力推导依据）
    node: { version: string; status: 'ready' | 'missing' | 'failed' }
    python: { version: string; status: 'ready' | 'missing' | 'failed' }
  }
}
```

### 2.8 DeliveryPackage（交付包——值对象）

```typescript
interface DeliveryPackage {
  id: string
  files: { path: FilePath; diff: string }[]   // 产物清单 + 变更预览
  acceptance: { item: string; passed: boolean }[] // 验收对照（DoD/AC）
  status: 'delivered' | 'closed' | 'adjusting'   // 交付 ≠ 解决——closed=用户确认终态
  snapshot?: string[]                            // 写前快照（.nf-bak——回滚）
}
```

> **实现形态（2026-08-15 定论——M7 文档承认）**：状态集为 `'draft' | 'delivered' | 'closed'`（`types.d.ts`）——`draft`=交付包构建中（真实变更联动生成前）；`adjusting` 不设独立态（用户「还要改」→ 交付包保持 delivered、对话继续调整，再次交付更新包）；`snapshot` 字段不在交付包内——回滚由工具卡层承担（`revertToolFile`——write/edit 写前 `.nf-bak` 快照、按文件回滚），交付包聚焦产物/验收呈现。

### 2.9 DeliveryService（数字交付——领域服务）

```typescript
interface DeliveryService {
  alignDoD(goal: string): Acceptance[]           // 动手前复述问题 + 验收标准（用户认可才动手）
  buildPackage(files: { path: FilePath; diff: string }[]): DeliveryPackage  // 交付包组装
  confirmClose(pkg: DeliveryPackage): void       // 用户确认关闭（终态——验收打勾）
  revert(pkg: DeliveryPackage, file: FilePath): void  // 快照回滚（交付不满意恢复原样）
}
```

不变式：交付 ≠ 解决（closed 需用户确认关闭）；写前快照（可回滚）。
### 2.6 TaskTrust（任务级信任——值对象/集合）

```typescript
interface TaskTrust {
  paths: FilePath[]          // 任务内信任的文件路径（允许并记住）
  scope: 'sandbox-only'      // 只信任沙箱内（项目根内）——沙箱外永不进入
  clearedBy: TaskBoundary    // 任务边界（goalSeq 递增——新目标确认）→ 清空
}
```

### 2.7 AuthorizationService（授权裁决——领域服务）

```typescript
interface AuthorizationService {
  preApprove(tool: string, args: Record<string, unknown>, ctx: { rootPath?: string }):
    { auto: boolean; reason?: string }    // 规则引擎 deny>allow>ask——fail-closed——main 进程裁决
  addTrust(args: Record<string, unknown>): void   // 允许并记住（仅文件路径类 + 沙箱内）
  isTrusted(args: Record<string, unknown>): boolean // 任务信任集合命中 → write/edit 自动
  clearTrust(): void                        // 任务边界（新目标确认）→ 清空信任 + 计划批准重置
}
```

不变式：bash 无 path 永不进入信任（高危永远单独确认）；沙箱外永不进入信任（安全底线）；信任不跨任务（clearTrust）。

> **实现形态（2026-08-15 定论——M5 文档承认）**：Electron 架构必然的**双进程拆分**——规则引擎（`preApprove` deny>allow>ask fail-closed）部署于 **main 进程**（`tools.ts`——renderer 不判断，防绕过）；任务级信任集合（`addTrust`/`isTrusted`/`clearTrust`——renderer taskTrustRef）部署于 **renderer**（渲染需即时感知——信任条/授权卡）；`filesApproved` 幂等标记双进程对称（main `filesApprovedRef` ↔ renderer `filesApproved`——任务边界 `clearTrust` 经 IPC 同步重置，D2 2026-08-15 修复）。语义等价——信任裁决唯一权威在 main（execute 门控），renderer 侧为展示/交互镜像。
### 2.6b TimelineEvent（时间线事件——2026-08-16 审计 #5 编号修正，原 2.6 与 TaskTrust 重复）

```typescript
interface TimelineEvent {
  ts: string          // ISO 时间戳
  seq: number         // 会话内序号
  session: string     // 会话标识
  type: TimelineEventType  // user-message / assistant-start+done / tool-call / tool-exec /
                           // tool-result / tool-approval / goal-confirmed / plan-confirmed /
                           // resolution-confirmed（2026-08-16 更名，原 exec-confirmed/achievement-confirmed）
                           // status-change / stuck-escalate / error
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail: Record<string, unknown>
}
```

### 2.10 ProblemSnapshot（问题快照——值对象）

```typescript
interface ProblemSnapshot {
  goal: string          // 目标（用户问题第一句——GoalConfirmed 回写）
  decisions: string[]   // 已确认决策
  authorized: string[]  // 已授权操作（按文件去重——TrustLadder 展示）
  pending: string[]     // 待办/待确认
}
```

> 实现：`problemStore.ts`（createProblem/updateProblemSnapshot——快照合并不覆盖）；2026-08-15 补建模 M3。

## 3. 领域服务（Domain Services）

### 3.1 ProgressGuarantee（推进保障——2026-08-16 重设计，原 TurnExecutionPolicy/forceTool）

输入（确认状态/推进/失败/完成度）→ tool_choice 决策。**核心语义变化：强制对象是「推进」不是「工具调用」**——推进 = 产出 / 结构化提议（GoalProposal/PlanProposal/CompletionClaim）/ 证据 / 提问；pending 时恒不强制（模型停住等用户）。

```typescript
interface ProgressGuarantee {
  decide(input: {
    goalConfirmed: boolean      // 目标确认（用户）
    planConfirmed: boolean      // 方案确认（用户——批准 PlanProposal）
    resolutionConfirmed: boolean // 解决确认（用户——证据对账）
    pending: boolean            // 会话级 PENDING（等用户决策）→ 恒不强制
    produced: boolean           // 已有产出（write/edit）
    proposed?: boolean          // 本轮输出结构化提议（算推进）
    providedEvidence?: boolean  // 完成声明带证据（算推进）
    lastToolFailed?: boolean    // 上一轮工具失败 → 释放强制（诊断修正）
    plannedComplete?: boolean   // 计划文件写完 → 释放
  }): { mode: 'require-advance' | 'require-action' | 'auto'; reason: string }
}
```

不变式：
- pending（会话级）→ 恒 auto（模型停住等用户——三判定器同源：canExecute/maybeContinue/ProgressGuarantee）
- 目标未确认 → auto（澄清）
- 方案未确认 → auto（等方案批准）
- 目标+方案确认、无任何推进 → require-advance（防只说不做——允许模型输出提议/证据/提问，不逼调工具）
- **目标+方案确认、无产出且工具可用 → require-action**（2026-08-16 第 14 轮审计 #6 补——设计 §3.3 档位：原 required 语义保留但 pending 时自动降级——工具可用时直接要求行动；require-advance 与 require-action 均映射 tool_choice='required'——区别在系统提示措辞：行动 vs 推进）
- 工具失败 → 释放（模型诊断修正——required 压制诊断是反模式）
- 计划写完 或 解决确认 → 释放（模型可收敛）
- **无计划文件**（未走 approve-files）→ produced 后 auto（A0 §4 补行——2026-08-16 审计补）

### 3.2 ProgressionGate（推进门控——2026-08-16 第 14 轮审计 #2 角色裁决：并入 §3.6 sessionGate）

确认点状态机——当前确认点 → 模型活动边界。

> **角色裁决（2026-08-16 第 14 轮审计 #2——权威：设计文档 §3.3）**：确认点活动边界**并入 sessionGate**（§3.6 意图确认服务组）承载——sessionGate 判定 = 会话冻结（pending）+ 确认点活动边界（goal-confirmed 只澄清+只读探索 / executing 执行 / resolution-pending 证据对账）；**本接口保留为活动边界策略层描述**（allowedActions 语义不变），S1 实现以 §3.6 服务组为准——不单列 ProgressionGate 服务。

```typescript
interface ProgressionGate {
  currentPoint(task: Task): 'goal' | 'plan' | 'resolution' | 'done'（2026-08-16 更名）
  allowedActions(point: string): Action[]  // 该确认点允许的模型动作（策略层描述——判定由 sessionGate 承载）
  // 未确认目标 → 只澄清（无 write/edit/bash）
  // 未批准方案 → 只给方案（无执行动作——探索性只读命令放行，A0 §3.1）
  // 未确认解决 → 持续执行（不收敛）
}
```

不变式：确认点未确认 → 模型活动边界被限制（状态机未到下一态——结构性，非拦截）。

### 3.3 CapabilityChecker（能力检查）

```typescript
interface CapabilityChecker {
  check(projectRoot: string): Capability[]
  getMissing(caps: Capability[]): Capability[]   // 缺失清单（征求用户——装依赖/换方案）
  recordResult(rootPath: string, capabilityId: string, ok: boolean): void  // Ledger 回填
}
```

不变式：能力从环境推导（消除双源）；Ledger 失败降级/成功恢复。

### 3.4 PlannedFilesService（计划清单）

```typescript
interface PlannedFilesService {
  approve(files: FilePath[]): void         // 追加（不覆盖）
  contains(file: FilePath): boolean
  visibleList(): string[]                  // 注入模型的可见清单
  rejectMessage(file: FilePath): string    // 拒绝带边界（「X 不在批准清单（批准的是：A/B/C）」）
}
```

不变式：追加语义；清单显式可见；拒绝回填边界（模型回到边界内）。

### 3.5 TimelineLogger（会话时间线）

```typescript
interface TimelineLogger {
  append(event: Omit<TimelineEvent, 'ts' | 'seq'>): void
  // 便捷方法：logUserMessage / logAssistantStart / logAssistantDone /
  // logToolCall / logToolResult / logApproval / logConfirmation / logStatus
}
```

不变式：时间顺序完整（ts+seq 升序）；单文件 JSONL（崩溃保留已写行）。

### 3.6 意图确认服务（2026-08-16 新增——第 11 轮审计 #1；签名权威：设计文档 §3.3/A0 §3.5b/§3.6/§4.2——S1 实现依据）

> **参数形状（2026-08-16 第 14 轮审计 #7 补——S1 类型定义依据）**：
> `proposals: { goal?: GoalProposal; plan?: PlanProposal; completion?: CompletionClaim }`（待求值的提议快照）
> `pendingActions: ActionAttribute[]`（本轮待执行动作的属性列表）
> `systemState: { plannedFiles: Set<string>; producedFiles: Set<string> }`（证据对账的宿主事实）
> `policy: { outOfPlan: 'ask' | 'deny'; hazardous: 'ask' | 'deny' }`（ActionGate 策略配置——默认 ask）

```typescript
interface IntentConfirmationServices {
  // 决策点触发权（A0 §3.6——确定性纯函数：状态×提议×动作属性；userRequested 含用户主动通道）
  deriveDecisionPoint(state, proposals, pendingActions, userRequested): PendingKind | 'none'
  // 双维门控（A0 §3.5/§3.5b——SessionGate 优先）
  sessionGate(state, action): { ok, reason }
  actionGate(action, policy): { verdict: 'allow'|'ask'|'deny', attribute: ActionAttribute, risk }
  canExecute(state, action, policy) = sessionGate 优先 → actionGate
  // 只读判定升级（Codex is_safe_command 方向）
  classifyReadonly(name, command?): ActionAttribute['kind']
  // 完成证据对账（A0 §4.2——系统代跑只读验证/diff 派生；无证据不对账）
  verifyCompletion(claim, systemState): { ok, missing, unverifiable }
  // 提议解析（含坑 102 过滤/解析失败降级）
  parsePlanProposal(text): { ok: true; proposal: PlanProposal } | { ok: false; reason }
  parseCompletionClaim(text): CompletionClaim | null
  // 方案清单派生（不变量 6——追加语义 A0 §5）
  derivePlannedFiles(state, proposal): Set<string>
  // 推进保障（§3.1 已有——此处引用）
  // 续聊停止（坑 103——已有实现 conversationState.ts）
  shouldStopContinuation(state, lastMsgSignals): boolean
}
```

> 2026-08-16 第 11 轮审计 #1：04 §3 补意图确认服务组（原 5 服务未覆盖——S1 按本组+设计文档 §3.3 实现；ActionAttribute/PlanProposal/CompletionClaim/RejectReason 值对象见 §2 与新设计 §3.2）。

## 4. 领域事件（Domain Events）

| 事件 | 触发 | 发布者 |
|------|------|--------|
| GoalProposed / GoalConfirmed / GoalRejected | 目标提议 / 用户确认 / 重新描述 | Task |
| ExecutionPlanProposed（历史——2026-08-16 起由 proposal.plan 替代）/ PlanConfirmed / PlanRejected | 方案提议（PlanProposal）/ 用户批准 / 修改+原因 | Task |
| PlanApproved | 用户批准文件清单（追加）| PlannedFiles |
| ToolApproved / ToolRejected / ToolExecuted / ToolFailed | 工具授权/执行结果 | ToolRegistry / Task |
| AchievementProposed（历史——2026-08-16 起由 proposal.completion 替代）/ ResolutionConfirmed / ResolutionRejected | 完成声明（CompletionClaim+证据）/ 证据对账确认 / 还要改+原因 | Task |
| CapabilityChecked / CapabilityLedgerUpdated | 能力检查 / Ledger 回填 | CapabilityRegistry |
| EnvironmentInjected | 环境快照注入模型 | Conversation |
| TaskResolved | 用户确认解决——任务收敛 | Task |
| proposal.goal / proposal.plan / proposal.completion（2026-08-16 新增）| 模型输出结构化提议（完整内容快照）| Task（解析层）|
| decision.requested / decision.resolved（2026-08-16 新增）| 决策点出现（内容快照）/ 用户决策（confirm/reject+RejectReason）| Conversation |
| completion.evidence_missing（2026-08-16 新增）| 完成声明证据不足（回填引导）| Conversation（verifyCompletion）|
| gate.denied（2026-08-16 新增）| ActionGate deny（机制拦截）| ActionGate |

## 5. 仓库接口（Repository Ports）

| 端口 | 语义 |
|------|------|
| ITaskRepository | 任务加载/保存（断点续做）——**V1 未落地（2026-08-15 裁决降级）**：断点续做 = 消息 + 问题台账恢复，状态机（确认/计划清单/产出集）不跨重启（复开从澄清重新走——安全但体验回退）；**V2 必做**：会话快照（含状态机序列化）持久化——与 compaction 摘要上下文的基准一致性为 V2 实现前置约束 |
| IConversationRepository | 会话持久化 |
| IPlannedFilesRepository | 计划清单持久化 |
| ITimelineRepository | 时间线追加/查询 |
| **IProblemRepository** | **问题台账加载/保存（V1 已落地——problemStore localStorage、上限 20）** |

## 6. 类型汇总

```typescript
// ===== 标识符 =====
type TaskId = string & { readonly __brand: 'TaskId' }
type FilePath = string & { readonly __brand: 'FilePath' }

// ===== 确认点 =====
type ConfirmationPoint = 'goal' | 'plan' | 'resolution'（2026-08-16 更名）
type ConfirmationAction = 'confirm' | 'reject'

// ===== 决策点（2026-08-16 第 13 轮审计 #7 补——§3.6 签名用而未定义）=====
type PendingKind = 'none' | 'goal' | 'plan' | 'approval' | 'resolution'   // 会话级等待（设计 §3.1）
type DecisionKind = 'goal' | 'plan' | 'approval' | 'resolution'           // decisionContent.kind

// ===== 任务状态 =====
type TaskStatus = 'clarifying' | 'goal-confirmed' | 'executing'
  | 'resolved-pending' | 'resolved'（2026-08-16 更名，原 'achieved-reported'——对齐 §1.1 状态机）

// ===== 能力 =====
type CapabilityStatus = 'ready' | 'missing' | 'failed'

// ===== 时间线 =====
type TimelineEventType = 'user-message' | 'assistant-start' | 'assistant-done'
  | 'tool-call' | 'tool-exec' | 'tool-result' | 'tool-approval'
  | 'goal-confirmed' | 'plan-confirmed' | 'resolution-confirmed'（2026-08-16 更名）
  | 'status-change' | 'stuck-escalate' | 'error'
```

---

**下一步**: [05-架构设计](./05-architecture.md)
