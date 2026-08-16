# ADR-005：PlannedFiles 权威下沉 main + 批准事实跨重启（D3）

- 状态: accepted
- 日期: 2026-08-16
- 相关: HANDOFF §3 D3（PlannedFiles 下沉 main——V2 规模）；docs/domain/04-tactical-design.md §1.3（PlannedFiles 聚合——Workspace BC 宿主强制边界数据源）/ §5（IPlannedFilesRepository 计划清单持久化）；docs/domain/00-domain-authority.md §5（计划清单由已确认 PlanProposal.files 派生——不变量 6）；未修 1（三基准分裂——S7 裁决并入 V2 规模）；stage-specs/D3.md

## Context

意图确认重构 S0-S7 完成后，PlannedFiles（计划清单）实现仍滞留 renderer 内存态：`ConversationState.plannedFiles` 只存在于渲染进程（useConversationState stateRef），main 进程仅有布尔 `filesApprovedRef`（tools.ts——write 门控）。遗留三个问题：

1. **宿主强制边界数据源错位**：A0 §5 / 04 §1.3 定义 PlannedFiles 为 Workspace BC 聚合根（宿主强制边界的数据源——模型只能写清单内文件），但权威数据在 renderer 内存态——渲染进程崩溃/刷新即丢，宿主边界实际依赖渲染进程存活
2. **批准事实不跨重启**：V1 裁决「状态机不跨重启」，但 plannedFiles 是**用户批准事实**（与问题台账 ProblemSnapshot.authorized 同构——problemStore 早已跨重启恢复 authorized）——批准事实丢失迫使重启后重新批量授权（体验回退）
3. **三基准分裂（未修 1）**：planned（renderer）/ produced（renderer）/ projectFiles（renderer 文件树快照）三集合基准曾分裂（坑 102 已修绝对化），判定单源已归领域层（plannedComplete）——D3 统一验证

## Decision

**PlannedFiles 权威迁移到 main 进程并持久化（IPlannedFilesRepository 实现）；renderer 保留本地镜像；批准事实跨重启恢复**：

1. **权威位置 = main `PlannedFilesStore`**（新文件 src/main/plannedFilesStore.ts）：
   - 状态 `{ files: string[], approved: boolean }`；API `load()/add(files)/reset()`
   - 落盘 userData/workspace/planned-files.json（configStore 模式：同步写/损坏容错/0600）
   - 构造注入存储路径（可测——不依赖 electron app.getPath 硬编码）
   - renderer 保留 ConversationState.plannedFiles 本地镜像（inPlannedFiles/plannedComplete 同步判定需要）——**批准写操作经 IPC 同步 main，失败忽略（镜像优先）**，与 localStorage 断点续做同策略
   - **同步边界**：main store 只承载**批准事实**（approve-files 批准的文件 + approved 标志）；renderer 镜像承载全量（方案块解析并入 ∪ 批准——`addPlannedFiles` 非批准路径**不同步** main——仅任务完成度判定，随任务状态机 V1 不跨重启；恢复后非批准部分按新任务流程重新产生——一致）
2. **跨重启恢复（断点续做迁移）**：plannedFiles + approved 跨重启恢复——批准事实持久化（与 ProblemSnapshot.authorized 恢复同构）；**任务状态机（goal/plan/resolution 确认态）保持 V1 不跨重启**（复开从澄清重新走）；新任务（目标确认 = 任务边界）→ reset（与 clearTrust → filesApprovedReset 既有语义一致）
   - **恢复窗口语义（2026-08-16 实现澄清）**：`userConfirmed('goal')` 清空 plannedFiles 是任务边界铁律（领域层——A0 §9 目标驱动原点）——**重启后新任务的目标确认必然清空恢复清单（正确语义：新任务不继承旧批准）**。恢复的实际价值窗口 = **未确认新目标前**（刷新/重开同一会话——pending 冻结下用户对恢复决策点决策；方案确认 derivePlannedFiles 追加合并恢复清单——不变量 6）+ **main 门控跨重启一致**（write 不被规划引导拦——syncPlanApprovedFromStore）。L1 store 持久化测试承载跨重启；L3 验证接线（load/add/reset 调用链）。
3. **IPC 契约**：`planned-files:load`（→ { files, approved }）/ `planned-files:add`（files → 追加 + approved=true）/ `planned-files:reset`（→ 清空 + approved=false）；preload types.d.ts 类型化；tools:files-approved/-reset 演进为 store 驱动（无第二权威）
4. **filesApprovedRef 演进**：main tools.ts 布尔镜像由 store 驱动（add → true；reset → false）——write 门控逻辑不变（`!filesApprovedRef && !opts.approved`）
5. **三基准统一（未修 1 落地）**：planned（main 权威——绝对路径）/ produced（领域层——绝对路径）/ projectFiles（文件树快照——绝对路径，坑 102 已修）——L1 断言锁定三集合绝对基准一致；判定单源 plannedComplete（领域层，既有）；execution.force_input 打点保留

## Consequences

- 积极：宿主强制边界数据源归位（renderer 崩溃不丢批准事实）；批准事实跨重启保留（断点续做体验升级——重启后模型继续写清单内文件不需重新批量授权）；三基准统一验证（未修 1 关闭）；仓库可测（路径注入）
- 代价：renderer 写操作异步化（fire-and-forget——失败忽略，极端场景 main 侧缺失需重试 add）；启动恢复时序（load 在挂载路径——快速 IPC，镜像更新后判定实时生效）；tools:files-approved IPC 名演进（renderer/测试 mock 同步适配）
- 边界：producedFiles 不下沉（执行进度数据——Conversation 状态机，V1 不跨重启保持）；ITaskRepository 全量会话快照（goal/plan/resolution 序列化）为 V2 更大范围（compaction 基准一致性前置约束未决——不在本 ADR）
