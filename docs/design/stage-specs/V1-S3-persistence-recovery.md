# Stage V1-S3 Spec（持久化与崩溃恢复）

> 来源：`docs/design/v1.0.0-stage-plan.md` §3 S3 行（阶段计划）＋§4 不变量映射（**I-12 首立＝S3**；I-11 首立 S1、**S3 补 SessionInterrupted 边**）＋§5 事件映射（SessionInterrupted／DelegationRestored 首射＝S3，两事件）＋`docs/neonforgeV1.0.0/03-domain-tactics.md`（段3 frozen v1.3）§6（事务边界）／§7（仓储面）／§8（RecoverableSpec）＋`docs/design/v1.0.0-s1-detailed-design.md` §11（S3 钩子：RecoverableSpec／持久化，Repo 内存→持久适配、接口不变）＋`docs/design/v1.0.0-s2-detailed-design.md` §11（S3 钩子：修正提案的持久与重放——内存态下 `chain` 重启即失）；开工日期：**2026-10-07**（用户放行 S3，段5 spec 先行）
>
> 尺寸核：TDD 网格 **11 行** < 计划 §3 拆分警语阈值（>20 行才拆），未触发拆分。若段5 详设后网格需增行，按警语拆 S3a／S3b 并在本头部登记＋记 handoff（属计划细化，非设计变更，不触发铁律②回退）。
>
> 上游登记针（本 spec 必须消化，不得再延后）：①S1 详设 §11「S3 RecoverableSpec／持久化（Repo 内存→持久适配，**接口不变**）」⇒ 落本件 **A 组**；②S2 详设 §11「修正提案的持久与重放→S3：内存态下 `chain` 重启即失，`ScopePanel` 的未持久化提示沿用 F2 面」⇒ 落本件 **C 组**；③S1 F2 未持久化横幅（`t000100`）在 S3 落地后语义转变（从「内存态＝重启即失」到「已持久化，横幅撤除或改义」）⇒ 落本件 **E3**；④计划 §4 I-11 行「四事件闭集全判据在 S5 收口，S3 补 SessionInterrupted」⇒ 落本件 **B 组**。
>
> 术语纪律：本件名词以段2 §4 语言表为谓词源；判据形态引段3 §4「违反时行为」列不复制条文；实现文件**签名／通道命名／存储格式／闸承载体形态**归段5 详设，本件只给落点目录与测试文件名。

## DoD（机器可验证断言——stage-gate 逐条执行）

### A 7 仓储面持久化适配（段3 §7；详设 §3；S1 内存态换持久、**接口不变**）

- [ ] A1 **接口冻结回归**：7 仓储面（DelegationRepo／ScopeRepo／DecisionPointRepo／TurnRepo／InstructionQueueRepo／EvidenceRepo／TimelineRepo）的**方法名集合逐名不变**（与段3 §7 及 S3 开工前 HEAD 的 `src/domain/repos/**` 导出面**逐名比对**，多一个／少一个／改名即红）——`tests/unit/repos.surface.test.ts`（≥1 条，静态面：解析导出名集合与契约常量比对，防实现期就地扩接口）
- [ ] A2 **持久化落盘往返**：7 聚合各自 save→（进程外重建实例）→find，读回值与写前**逐字段相等**（含 Scope 的版本链、Delegation 的状态机字段、QueueItem 的 FIFO 序、TimelineLog 的 seq 序）——`tests/unit/repos.persistence.test.ts`（≥7 条，每聚合一条往返）
- [ ] A3 **同库同事务**（段3 §6：聚合与 TimelineLog 同库）：聚合状态写入与 `TimelineRepo.append` 落在**同一持久化事务**——append 抛错 ⇒ 聚合写入**整事务回滚**（重开实例后聚合与 timeline 均无该次写入痕）；`TimelineRepo.append` 仍是**单一写者口**（写事件只经它，S-1 依赖检查回归绿）——`tests/unit/repos.transaction.test.ts`（≥2 条：提交路径／回滚路径）
- [ ] A4 **损坏容错**：持久化文件缺失／截断／非法 JSON ⇒ 读侧**不崩溃**，按「空态重建」或「拒绝加载并报错」二择一（形态归段5 详设），且**不得静默吞掉已有数据**（有数据却读成空＝红）——`tests/unit/repos.corruption.test.ts`（≥2 条：缺文件／截断）
- [ ] A5 **原子写**：持久化写入为原子替换（写临时文件→rename，或等价机制），半写文件不可被读侧观察到——`tests/unit/repos.atomicWrite.test.ts`（≥1 条：模拟写中断后旧值仍在）
- [ ] A6 **路径注入可测**（沿 S1 `configStore`／`plannedFilesStore` 模式）：存储根目录可注入（不硬编码 userData），测试内以临时目录替换——`tests/unit/repos.persistence.test.ts` 复用（测试全部用注入路径，无一条依赖真实 userData）

### B 崩溃恢复：SessionInterrupted／DelegationRestored 首射（段3 §5 两事件；计划 §5 S3 行＝2 事件）

- [ ] B1 **载荷键与段3 §5 逐字相等**（**禁增禁减**）：`SessionInterrupted` 键集＝`delegationId`、`turnId`、中断点、丢失范围；`DelegationRestored` 键集＝`delegationId`、恢复结果（成功／失败＋原因）；两 `*Payload` 由 `never` 换为具名类型——`tests/unit/timeline.payloadKeys.test.ts` 扩至 **20 事件**（S2 的 18＋本阶段 2）
- [ ] B2 **写时点＝发现未收口在飞轮之时**（I-12 写时点声明）：恢复机制启动时若存在未收口在飞轮 ⇒ 追加 `SessionInterrupted`（含该轮 delegationId／turnId）；无未收口在飞轮 ⇒ **不追加**（不得无条件发射）——`tests/unit/recovery.interrupt.test.ts`（≥2 条：有在飞轮／无在飞轮）
- [ ] B3 **恢复＝账本重放**（段3 §6 崩溃恢复行）：恢复后**聚合状态与 timeline** 均由持久化账本重放得出；重复恢复＝**no-op**（第二次恢复不产生新事件、状态不变）——`tests/unit/recovery.replay.test.ts`（≥2 条：首次重放／重复 no-op）
- [ ] B4 **恢复失败留痕不假装修复**（I-12 违反时行为＝恢复拒绝并留痕）：账本不完整／不可重放（RecoverableSpec 不过）⇒ `DelegationRestored` 携**恢复结果＝失败＋原因**，且**拒绝恢复**（不进入已恢复态）——`tests/unit/recovery.failure.test.ts`（≥2 条：成功键／失败键含原因）
- [ ] B5 **I-11 补 SessionInterrupted 边**：`SessionInterrupted` 发生时 timeline 条目计数 ≥1（否定事实必有痕，与 S1 的 DecisionDenied／DelegationRejected 同族承载体）——`tests/unit/recovery.interrupt.test.ts`（≥1 条，断言事件落 timeline）
- [ ] B6 **事件闭集仍 22、余 2 事件不预绿**：`DelegationAbandoned`（S5）载荷保持 `never`；事件名集合仍与段3 §5 逐名相等——`tests/unit/timeline.eventCatalog.test.ts` 回归绿

### C I-12 丢失范围派生与在飞流不重放（计划 §4 I-12 行；段3 §4 I-12）

- [ ] C1 **丢失范围三值非空**：`SessionInterrupted` 的丢失范围＝{下界＝持久化 timeline 最后落账 seq，上界＝恢复重做起点}；不可计算时值＝字面 **"不可判定"**（枚举值之一，**不得留空、不得 undefined**）——`tests/unit/recovery.lostRange.test.ts`（≥3 条：可算下界／可算上界／不可判定）
- [ ] C2 **在飞字节流不重放**：恢复后**无 chunk 续流**（恢复只还原账本＝持久化态；崩溃前的在飞流式输出不重放）——`tests/unit/recovery.noStreamReplay.test.ts`（≥1 条：恢复后不产生续流的 chunk 事件／无 stream 续接）
- [ ] C3 **中断态标记**：被中断的在飞轮在恢复后标**中断态**（Terminal 态之一，段3 §2 Turn 的 MarkInterrupted）——`tests/unit/recovery.replay.test.ts`（≥1 条：中断轮终态＝中断态，非成轮非撤回）
- [ ] C4 **修正提案持久与重放**（S2 §11 钩子）：Scope 版本链持久化后，重启/重放读回**完整版本链**（当前版本＋历史版本只读可溯，I-8 只读可溯的持久面）——`tests/unit/recovery.scopeReplay.test.ts`（≥1 条：写两版→重放→两版均在）

### D 重启后可见性回归（计划 §3 S3 行产出物）

- [ ] D1 **委托单可见性**：重启后委托单列表（`DelegationRepo.findActive`／`listArchived`）与重启前**逐条相等**——`tests/unit/restart.visibility.test.ts`（≥1 条）
- [ ] D2 **队列可见性 + FIFO 保序**：重启后待处理队列（`InstructionQueueRepo.find` 的 pending，排除已准入与已撤回）逐条相等且**序不变**——同文件（≥1 条）
- [ ] D3 **证据可见性**：重启后证据集（`EvidenceRepo.findByDelegation`）逐条相等——同文件（≥1 条）
- [ ] D4 **未持久化横幅语义转变**（S1 F2 回归面）：S3 落地后「内存态＝重启即失」不再成立 ⇒ S1 F2 横幅**撤除或改义**（形态归段5 详设）；L3 断言随之更新——`tests/interaction/delegationLifecycle.interaction.ts`（F2 相关针更新，≥1 条）

### E 呈现侧恢复可见性（L3；计划 §4 I-12 行「L1＋L3」）

- [ ] E1 **恢复后状态可见**：重启后委托单／时间线／证据在 UI 可见（I-12 呈现侧最小面）——`tests/interaction/restartVisibility.interaction.ts`（≥2 条）
- [ ] E2 **中断留痕可见**：`SessionInterrupted` 的丢失范围（或"不可判定"）在时间线视图可见（原则1「输入不静默消失」的恢复侧兑现）——同文件（≥1 条）
- [ ] E3 `npx playwright test --project=interaction` **全绿**，本阶段新增用例 **≥3 条**（实落数由 stage-gate 现场数）

### F 段6 闸与状态类断言（逐条列，不合并）

- [ ] F1 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`（cwd `apps/desktop`）→ **0 error**
- [ ] F2 `npx vitest run`（cwd `apps/desktop`）全绿，本阶段新增用例 **≥ 35 条**（下限＝A 组 15＋B 组 9＋C 组 6＋D 组 4；E 组 3 条走 playwright 不重复计数；逐行映射见 TDD 网格），且全部来自本 spec 网格登记的新树测试文件
- [ ] F3 `npx eslint .` → 0 error
- [ ] F4 `python3 tools/desens-scan.py`（仓库根）→ rc=0
- [ ] F5 **G-1 归档防回流回归**：`tests/static/noLegacyImport.test.ts` 绿；S-1 呈现/度量零写命令回归绿（`tests/static/s1WritePath.test.ts`）
- [ ] F6 `docs/tests/coverage-matrix.md` 表 N：S3 承担行回填（轴 7 的 S3 列＝I-12、I-11 的 SessionInterrupted 边）；**S4–S7 承担的行保持 ⏳，不得预绿**
- [ ] F7 本 spec 的 `- [ ]` 全数勾绿或显式标 blocked＋理由（无沉默未跑项）；`stage-gate` 逐条留**本会话新鲜命令输出**
- [ ] F8 决策日志同步：S3 内语义裁定（如存储格式／同库事务实现形态若需裁）→`docs/decisions/` 出 ADR＋索引行；无裁定则本项记「无」，不留空
- [ ] F9 handoff CLI 落账：S3 闸结果、新增 pitfall、`next` 指向下一活；`exit`／`summary` 先 `--dry-run` 再整槽覆写
- [ ] F10 代码与工件已 commit 到工作分支（Conventional Commits，经 lefthook→lint-staged）；**push 与 CI 绿以用户显式授权为前提**
- [ ] F11 出口异构审计：按 agent-dispatch 派**非当前主同源**的强模型执行者出报告 → `docs/audits/`，主会话署名采纳逐条复核，**结论由用户亲裁**（AGENTS.md 流程3）

## TDD 网格（本阶段新增功能——spec-first + test-first；每行在 DoD 有对应断言）

| # | 功能 | 规范断言（来源） | 失败测试（红） | 实现（绿） | 重构 |
|---|---|---|---|---|---|
| 1 | 仓储面接口冻结 | 段3 §7（接口不变，S1 §11 钩子） | `tests/unit/repos.surface.test.ts` | 无（回归面；持久实现须实现同一接口） | 持久实现放 `src/domain/repos/persistent/**`，内存实现保留供测试 |
| 2 | 7 聚合持久化往返 | 段3 §7／§6（同库） | `tests/unit/repos.persistence.test.ts` | 各 Repo 的持久实现（形态归段5） | 与 S1 `configStore`／`plannedFilesStore` 落盘模式共用，不新建存储层 |
| 3 | 同事务提交/回滚 | 段3 §6（聚合＋timeline 同事务） | `tests/unit/repos.transaction.test.ts` | 事务包装（TimelineRepo.append 唯一机制口不变） | — |
| 4 | 损坏容错＋原子写 | 段3 §6（本地单机持久） | `tests/unit/repos.corruption.test.ts`／`repos.atomicWrite.test.ts` | 读侧容错＋写侧原子替换 | — |
| 5 | SessionInterrupted 载荷接线 | 段3 §5 键集；I-11 | `tests/unit/timeline.payloadKeys.test.ts`（20 事件） | `SessionInterruptedPayload` 具名类型替换 `never` | 余 2 事件保持 `never` |
| 6 | 写时点判定 | 段3 §4 I-12 写时点声明 | `tests/unit/recovery.interrupt.test.ts` | 恢复机制启动时判「有无未收口在飞轮」 | — |
| 7 | 账本重放＋重复 no-op | 段3 §6 崩溃恢复行；RecoverableSpec | `tests/unit/recovery.replay.test.ts` | RestoreDelegation 服务面（形态归段5） | 与 TimelineRepo.since 重放口共用 |
| 8 | 恢复失败留痕 | 段3 §5（恢复结果键）；I-12 违反时行为 | `tests/unit/recovery.failure.test.ts` | `DelegationRestoredPayload` 恢复结果键 | 失败不另立事件（段3 §5 尾注） |
| 9 | 丢失范围三值派生 | 段3 §4 I-12（下界/上界/不可判定） | `tests/unit/recovery.lostRange.test.ts` | 派生纯函数（签名归段5） | 不可判定＝枚举值，不留空 |
| 10 | 在飞流不重放＋中断态 | 段3 §4 I-12；§2 Turn MarkInterrupted | `tests/unit/recovery.noStreamReplay.test.ts` | 恢复不回放流；在飞轮标中断态 | 中断态＝Terminal 态之一 |
| 11 | 重启可见性＋呈现 | 计划 §3 S3 行产出物；I-12 呈现侧 | `tests/unit/restart.visibility.test.ts`＋`tests/interaction/restartVisibility.interaction.ts` | 读侧重建＋UI 可见 | F2 横幅撤除/改义 |

## 产出物

- `apps/desktop/src/domain/repos/persistent/**`：7 仓储面持久实现（**接口不变**，落点目录归段5 锁签名）
- `apps/desktop/src/domain/spec/recoverable.ts`：RecoverableSpec 落地（段3 §8）
- `apps/desktop/src/main/**`：持久化适配＋恢复机制接线（RestoreDelegation 触发面；通道命名归段5）
- `apps/desktop/src/domain/timeline.ts`：`SessionInterruptedPayload`／`DelegationRestoredPayload` 接线（`never`→具名类型），事件闭集仍 22
- `apps/desktop/tests/unit/**`：`repos.{surface,persistence,transaction,corruption,atomicWrite}`／`recovery.{interrupt,replay,failure,lostRange,noStreamReplay,scopeReplay}`／`restart.visibility`／`timeline.payloadKeys`（扩至 20）＋回归面
- `apps/desktop/tests/interaction/restartVisibility.interaction.ts`（新）＋`delegationLifecycle.interaction.ts`（F2 针更新）
- `docs/design/v1.0.0-s3-detailed-design.md`：段5 详设（本 spec 的下游，签名／通道／存储格式／闸形态在此定）
- `docs/superpowers/plans/`：S3 任务级拆解（writing-plans，开工前出，任务不得超出本 DoD 边界）
- `docs/tests/coverage-matrix.md` 表 N 的 S3 行回填
- `docs/audits/`：S3 出口异构审计报告一件
- handoff 落账：闸结果／pitfall／`next`（写入口＝project-handoff CLI）

## 边界（不做——防蔓延）

- **跨进程写者与 outbox**＝段3 §6 登记的升级路径、**V1 射程外**（V1 桌面单机、聚合与 TimelineLog 同库有意简化）。
- **多委托并行**＝L0 §6 6a OUT；S3 不引入多活跃并发持久化。
- 决策点**作废**路径／卡滞期准入窗＝**S5**；S3 只做恢复，不碰推进驱动深化。
- 证据**四类型载荷**（命令输出／测试结果／验收判据运行结果）与脱敏全覆盖、产物谓词两合取条款、FirstInspectionMark＝**S4**；S3 只保证证据**体**持久化，不扩载荷类型。
- 等待项四类完整呈现、焦点呈现、对话通道按 delegationId 过滤、S-1 全量＝**S6**；S3 只补恢复侧最小可溯呈现（E1–E2）。
- 指标计算与比率口径＝**S7**；S3 只保证 SessionInterrupted／DelegationRestored 按段3 §5 键集正确发射（护栏③采点源）。
- **存储格式选型**（单文件 JSON／SQLite／逐聚合文件）＝段5 详设定，本件不预设；**若选型需语义裁定则出 S3 ADR**（F8），不在段6 就地改契约。
- 恢复的**重放时序**（I-12 上下界计算点）＝段5 详设定（计划 §4 遗留①）。
