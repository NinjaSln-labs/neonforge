# 04 — 战术设计（无阶段·目标驱动版）

> 2026-08-07 重新生成——聚合、值对象、领域服务，基于无阶段目标驱动领域模型（02 领域模型 / 03 战略设计）。
> 替代旧六阶段版（ContextEngine/Compaction/PrefixCache 等围绕产品流水线的战术设计）。

---

## 1. 聚合（Aggregates）

### 1.1 Task 聚合（Conversation BC——会话内子状态机）

**目标驱动的执行单元**（会话内——只管三个**任务级**确认点）。**注意：单一 PENDING 状态机归属会话级（Conversation 聚合——§1.2）——Task 不承载 pending**（工具级授权等待是会话级 pending 的一部分，不在 Task 状态机内）。

```
┌─────────────────────────────────────────────────────────────┐
│ Task (聚合根——会话内子状态机)                                   │
│                                                             │
│ id / goalText / status: clarifying|goal-confirmed|executing  │
│      |achieved-reported|resolved                             │
│                                                             │
│ ◆ goal: Goal              // 目标（值对象——目标确认后锁定）     │
│ ◆ executionPlan: ExecutionPlan | null  // 执行方案（值对象）   │
│ ◆ confirmations: Confirmation[]        // 确认记录（时间线）   │
│ ◆ plannedFiles: PlannedFiles           // 计划清单（宿主边界） │
│ ◆ producedFiles: Set<FilePath>         // 已产出文件          │
└─────────────────────────────────────────────────────────────┘
```

**状态机（任务级确认点驱动——pending 在会话级）**：

```
clarifying ─[用户确认目标]→ goal-confirmed ─[用户确认执行]→ executing
    ↑ [重新描述]              ↑ [修改方案]                      │
    │                                                         ↓
    └──── 持续澄清 ←──────── achievement-rejected ←── achieved-reported
                                                ↑ [还要改]        │
                                                └───[用户确认解决]→ resolved
```

每个确认点转换都经过**会话级 PENDING**（§1.2——卡弹出 → 会话 pending → 用户是/否 → 状态推进/回退）。

**不变式**：
- 未确认目标 → 不进入 executing（模型只澄清）
- 未确认执行 → 不产生执行动作（write/edit/bash）
- 未确认解决 → 不收敛（forceTool 保持）
- **pending（会话级）→ 模型动作全部无效**（做了白做——用户决策是下一个状态的唯一输入）

### 1.2 Conversation 聚合（Conversation BC——单一 PENDING 状态机宿主）

```
┌─────────────────────────────────────────────────────────────┐
│ Conversation (聚合根——会话级单一 PENDING 状态机)                 │
│ id / messages: Message[]                                    │
│ ◆ pending: PendingDecision | null   // 会话级等待状态（核心！）  │
│     └─ 来源：目标确认卡 / 执行确认卡 / 达成确认卡 / 授权卡       │
│     └─ pending 下模型动作全部无效（做了白做——不执行不生效）      │
│ ◆ activeTask: Task | null        // 会话内当前任务（目标驱动）   │
│ ◆ environmentSnapshot: EnvSnapshot // 注入模型的环境事实        │
│ ◆ timelineRef: TimelineRef       // 会话时间线引用             │
└─────────────────────────────────────────────────────────────┘
```

**单一 PENDING（会话级——2026-08-07 领域定论）**：

```
任何需要用户决策的点（卡弹出）──→ 会话进入【PENDING：等用户决策】
    ├─ 目标确认卡 / 执行确认卡 / 达成确认卡（任务级）
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
  point: 'goal' | 'execution' | 'achievement'
  action: 'confirm' | 'reject'
  source: 'confirm-card' | 'approval-card' | 'user-word'
  timestamp: number
}
```

### 2.3 ExecutionPlan

```typescript
interface ExecutionPlan {
  summary: string          // 一句话方案
  files: FilePath[]        // 文件清单（可并入计划清单）
  status: 'proposed' | 'confirmed' | 'rejected'
}
```

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
### 2.6 TimelineEvent（时间线事件）

```typescript
interface TimelineEvent {
  ts: string          // ISO 时间戳
  seq: number         // 会话内序号
  session: string     // 会话标识
  type: TimelineEventType  // user-message / assistant-start+done / tool-call / tool-exec /
                           // tool-result / tool-approval / goal-confirmed / exec-confirmed /
                           // achievement-confirmed / status-change / stuck-escalate / error
  role?: 'user' | 'assistant' | 'system' | 'tool'
  detail: Record<string, unknown>
}
```

## 3. 领域服务（Domain Services）

### 3.1 TurnExecutionPolicy（执行保障策略）

输入（确认状态/产出/失败/完成度）→ forceTool 决策。

```typescript
interface TurnExecutionPolicy {
  decide(input: {
    goalConfirmed: boolean      // 目标确认（用户）
    executionConfirmed: boolean // 执行确认（用户）
    produced: boolean           // 已有产出（write/edit）
    lastToolFailed?: boolean    // 上一轮工具失败 → 释放强制（诊断修正）
    goalAchieved?: boolean      // 达成确认（用户）→ 释放
    plannedComplete?: boolean   // 计划文件写完 → 释放
  }): { forceTool: boolean; reason: string }
}
```

不变式：
- 目标未确认 → 不强制（澄清）
- 执行未确认 → 不强制（等确认）
- 目标+执行确认、无产出 → 强制（防只说不做）
- 工具失败 → 释放（模型诊断修正——required 压制诊断是反模式）
- 计划写完 或 达成确认 → 释放（模型可收敛）

### 3.2 ProgressionGate（推进门控）

确认点状态机——当前确认点 → 模型活动边界。

```typescript
interface ProgressionGate {
  currentPoint(task: Task): 'goal' | 'execution' | 'achievement' | 'done'
  allowedActions(point: string): Action[]  // 该确认点允许的模型动作
  // 未确认目标 → 只澄清（无 write/edit/bash）
  // 未确认执行 → 只给方案（无执行动作）
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

## 4. 领域事件（Domain Events）

| 事件 | 触发 | 发布者 |
|------|------|--------|
| GoalProposed / GoalConfirmed / GoalRejected | 目标提议 / 用户确认 / 重新描述 | Task |
| ExecutionPlanProposed / ExecutionConfirmed / ExecutionRejected | 方案提议 / 用户确认 / 修改 | Task |
| PlanApproved | 用户批准文件清单（追加）| PlannedFiles |
| ToolApproved / ToolRejected / ToolExecuted / ToolFailed | 工具授权/执行结果 | ToolRegistry / Task |
| AchievementProposed / AchievementConfirmed / AchievementRejected | 达成提议 / 用户确认解决 / 还要改 | Task |
| CapabilityChecked / CapabilityLedgerUpdated | 能力检查 / Ledger 回填 | CapabilityRegistry |
| EnvironmentInjected | 环境快照注入模型 | Conversation |
| TaskResolved | 用户确认解决——任务收敛 | Task |

## 5. 仓库接口（Repository Ports）

| 端口 | 语义 |
|------|------|
| ITaskRepository | 任务加载/保存（断点续做）|
| IConversationRepository | 会话持久化 |
| IPlannedFilesRepository | 计划清单持久化 |
| ITimelineRepository | 时间线追加/查询 |

## 6. 类型汇总

```typescript
// ===== 标识符 =====
type TaskId = string & { readonly __brand: 'TaskId' }
type FilePath = string & { readonly __brand: 'FilePath' }

// ===== 确认点 =====
type ConfirmationPoint = 'goal' | 'execution' | 'achievement'
type ConfirmationAction = 'confirm' | 'reject'

// ===== 任务状态 =====
type TaskStatus = 'clarifying' | 'goal-confirmed' | 'executing'
  | 'achieved-reported' | 'resolved'

// ===== 能力 =====
type CapabilityStatus = 'ready' | 'missing' | 'failed'

// ===== 时间线 =====
type TimelineEventType = 'user-message' | 'assistant-start' | 'assistant-done'
  | 'tool-call' | 'tool-exec' | 'tool-result' | 'tool-approval'
  | 'goal-confirmed' | 'exec-confirmed' | 'achievement-confirmed'
  | 'status-change' | 'stuck-escalate' | 'error'
```

---

**下一步**: [05-架构设计](./05-architecture.md)
