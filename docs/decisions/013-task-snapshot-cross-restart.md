# ADR-013：任务状态机跨重启（Task 快照完整化）

- 状态: accepted
- 日期: 2026-11-15
- 相关: GitHub #11（会话快照完整化——ITaskRepository）；docs/design/stage-specs/D3.md §边界（producedFiles 不下沉——V1 不跨重启）；docs/domain/00-domain-authority.md §5；stage-specs/V2-task-snapshot.md

## Context

D3（ADR-005）已把**批准事实**（plannedFiles + approved）下沉 main 并跨重启恢复，但 A1 Task 聚合（`ConversationState`）的其余状态仍是 renderer 内存态：

1. `goalConfirmed` / `planConfirmed` / `resolutionConfirmed` 在重启后回落到初始值，用户已确认的目标/方案无法证明——恢复后可能重复要求确认或错误放行；
2. `producedFiles`（执行进度）、`deniedApprovals`（拒绝记忆）、`rejectStreak` / `pendingRepeatCount` / `unresolvedTextReplies`（ADR-010 循环计数）与 `lastToolFailed` 丢失——进度判定的三基准之一断裂，重启后模型可能重复写已产出文件，拒绝记忆也失效；
3. 现有断点续做只持久化消息序列 + `decisionContent` 快照，**没有持久化 pending 状态与确认位**；恢复靠消息快照重新置 pending，确认位仍为 false；
4. compaction 只改变发送给模型的请求历史，不改变消息存档；快照必须与消息存档使用同一份持久化记录，避免“消息已压缩/截断而任务状态仍是旧基准”。

## Decision

**Task 状态机快照随会话消息一起跨重启持久化（renderer 侧 ITaskRepository 语义），不引入 main 侧第二权威：**

1. **领域层单源序列化**（`src/domain/taskSnapshot.ts`）：
   - `TaskSnapshot` 为纯 JSON 值（Set → 字符串数组），初始版本 `version: 1`；ADR-014 起假设改为对象数组，版本升级为 `version: 2`（v1 仍接受并归一化）；
   - `toTaskSnapshot(state)` 覆盖全部 A1 字段：三个确认位、`pending`、`plannedFiles`、`producedFiles`、`filesApproved`、`lastToolFailed`、`decisionContent`、`deniedApprovals`、`rejectStreak`、`lastRejectReason`、`pendingRepeatCount`、`unresolvedTextReplies`；
   - `fromTaskSnapshot(raw)` 做运行时校验：版本/字段类型/枚举/数组元素非法 → 返回 `null`（损坏快照不阻断启动）；合法时重建 `Set` 与完整对象。
   - 决策点内容做嵌套校验：`proposal` 的 files（path/reason）/assumptions/verificationPlan、goal/plan/completion/clarify 各分支逐字段验证；非 `approval` 决策点缺少可渲染内容时整快照拒绝（`approval` 允许无内容——工具卡自身携带请求）；不强制确认位层级（领域允许 resolution 确认后 `planConfirmed=false`、目标拒绝后 `planConfirmed=true`）。
2. **会话快照原子写入**（`src/renderer/sessionStore.ts`）：
   - `nf-session` 升级为 V2 记录 `{ version: 2, messages: StoredMsg[], task?: TaskSnapshot }`；消息与任务状态**一次 `setItem` 写入**（compaction 基准与任务状态一致）；
   - 兼容旧 V1 数组存档：`loadSession()` 继续返回消息数组，`loadTaskSnapshot()` 对旧格式返回 `null`；
   - 序列化保留 `need-approval`/`file-approval` 工具卡（丢弃执行中的 `pending`），恢复后授权卡可直接续做；
   - `clearSession()` 同时清空消息与任务快照（新任务边界）。
3. **恢复接线**：
   - `useConversationState` 新增 `restoreTaskState(snapshot)`：直接替换 `stateRef` 并触发重渲染，**不经过 transition、不派生领域事件**（系统初始化不是用户转换，避免时间线污染）；
   - `useMessageStore` 挂载时先恢复任务快照，再恢复消息；任务快照存在时不再用消息里的旧 `decisionContent` 覆盖 pending；持久化时同时写消息与当前任务快照（仅当有完整消息可存，避免半截 streaming 覆盖存档）；
   - main 侧 `plannedFiles` 仍是批准事实权威（D3/ADR-005）；恢复的 `plannedFiles/filesApproved` 是本地镜像，且与 main `load()` 结果取**并集**（`filesApproved` 取或）——main 只承载批准事实，快照中已确认方案派生的清单不能被空 main 覆盖；任务边界与新批准仍经 IPC 与 main 同步。
   - 恢复期一致性：`useMessageStore` 暴露 `sessionReady`，依赖消息的授权 pending 对账 effect 等恢复完成后再执行——否则首渲染的空消息快照会先把快照中的 `pending='approval'` 静默清掉，再在消息渲染后经 `transition` 重建，向时间线伪造 `session.pending_set`/`decision.requested`；无对应工具卡的陈旧 approval pending 用 `clearPendingSilently` 清理（不派生 `decision.resolved`）。
4. **边界**：
   - 不实现云端/多设备同步（#15 非目标）；
   - 不引入 main 侧 TaskRepository/新 IPC（renderer 持有会话状态；本地 localStorage 与现有断点续做同源，避免双权威与异步竞态）；
   - 消息流式半截、工具执行中的瞬时状态不保证跨重启（与既有断点续做边界一致）；
   - compaction 摘要仍只用于请求上下文，不改写存档；快照与存档同记录保存。

## Consequences

- 积极：重启后目标/方案/解决确认态、执行进度、拒绝记忆与 ADR-010 计数全部保留；恢复不再依赖“从消息重建设置 pending”的隐式路径；快照损坏可安全回退；消息与任务快照原子一致。
- 代价：`nf-session` 格式升级（需兼容旧数组）；每次消息/状态变化多一次 JSON 序列化（localStorage 量级，可忽略）；恢复逻辑增加快照优先于消息快照的分支。
- 边界：若用户在新任务边界清空会话，旧任务快照明确丢弃；跨设备迁移不在本 ADR 范围。
- 审查加固（2026-11-16）：任务快照深校验防止损坏的 `decisionContent` 进入卡渲染；恢复就绪门控消除启动期伪造决策事件；待授权工具卡持久化避免“有 pending 无卡”死锁。
