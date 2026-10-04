# 段3 · 领域战术设计（草案 v0.1）

- 状态：**draft v0.1 — AI 过闸档（段3 出口＝AI 自查＋独立审计，审计结论回用户）**
- 上游工件：`02-domain-strategy.md`（段2 frozen v1.0：7 上下文、21 事件、17 词语言表、移交清单八项）、`01-l0-product-master.md`（段1 frozen）、`00-problem-and-scope.md`（段0 frozen）
- 经验层（只作经验不作依据，引用带 `@be6e299`）：旧树 ADR-021 Turn/DriverLease 概念集、ADR-019 同步取消令牌与"已作废链写入计数为 0"判据、`00-domain-authority.md` §3.7/§3.8
- 纪律：退役词（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）不进任何条文；本稿全部名词以段2 §4 语言表为谓词源；实现命名与代码归段6，本稿只定领域形状。

---

## 1. 段2 移交清单八项的战术裁定

| # | 移交项 | 裁定 | 落点 |
|---|---|---|---|
| 1 | 证据形状（U6） | **一种证据、三种载荷**：EvidenceItem 单谓词（系统采集/挂委托单/可打开核验），EvidenceType 枚举＝变更集｜命令输出｜测试结果。理由：三类共享同一信任语义（生产者＝系统），差异仅在载荷编解码；三种证据会把同一谓词写三遍 | §3 EvidenceItem |
| 2 | 驱动权机制 | **TurnToken（轮令牌）**：generation＝轮 id；StartTurn 签发；每个 await 恢复点写状态前复核令牌；**过期令牌写入计数＝0**（经验参照 `@be6e299`：同步取消令牌＋已作废链写入计数判据）。V1 单件推进下不建租约续期/抢占——令牌只作废不转移 | §3 Turn、§4 I-1/I-13 |
| 3 | 焦点派生规则 | **deriveFocus 纯函数**：焦点＝优先级序（待拍板＞待核验＞待用户指令＞排队中）取最高类中创建序最早者；派生呈现不落存储（语言表既有裁定）；优先级理由＝阻塞推进的等待优先于不阻塞的 | §8 领域服务 |
| 4 | 等待项四类聚合归属 | **无独立聚合**：等待项＝四聚合事实的派生读模型（待拍板←DecisionPoint 未决、待核验←Delegation 有效声称、待用户指令←Turn 拒绝/中断态、排队中←InstructionQueue 未准入）；I-9 在投影上校验 | §8 deriveWaitingItems |
| 5 | 卡滞窗实现位 | **推进驱动域 StallDetector**（主进程定时器）：StallSpec＝在飞轮存在且窗内零新 timeline 事件；阈值常量由段4 stage-spec 校准（L0 §4 既定） | §8、§9 |
| 6 | 事件载荷字段与不变量条文 | §5 事件目录（21 事件逐条载荷键）＋§4 不变量表（I-1–I-14）成文 | §4/§5 |
| 7 | 环上事务边界锚定 | **以委托单为锚**：delegationId＝环上全部事件的关联键；环内（生命周期⇄推进→证据→生命周期）事件驱动最终一致；验收读证据＝生命周期对 EvidenceRepo 的**只读查询**（AcceptanceCheck，无反向写路径——段2 收敛约定的具体化） | §6 |
| 8 | 对话通道聚合归属 | **无聚合**：承载面＝呈现投影域对 timeline＋等待项的只读投影；输入语义＝SubmitInput→进轮/入队（推进驱动域）。对话不持有状态（零写路径），"委托单持有对话"落地为：对话视图按 delegationId 过滤 timeline | §8、§6 |

## 2. 聚合目录（7 聚合，聚合＝事务边界，外部只持根引用、跨聚合引用用 id）

| 聚合 | 上下文 | 聚合根 | 包含实体 | 包含值对象 | 关键不变量 | 关键命令 |
|---|---|---|---|---|---|---|
| **Delegation（委托单）** | 委托生命周期 | Delegation | —（状态机单实体） | Intent、Claim、TerminalState、ReopenCount | I-6 无据不核、I-10 终态唯一、I-15 重开挂原单 | CreateDelegation、AcceptDelegation、RejectAcceptance、CloseDelegation、ClaimCompletion |
| **Scope（作用域）** | 授权拍板 | Scope | —（版本链单实体） | ScopeEntry、ScopeVersion、AmendmentRef | I-8 版本单调＋决议绑定 | AmendScope（经决策点） |
| **DecisionPoint（决策点）** | 授权拍板 | DecisionPoint | — | RequestReason、Resolution | I-3 归属唯一、I-7 无拍板不执行、决议幂等 | RaiseDecision、ResolveDecision |
| **Turn（轮次）** | 推进驱动 | Turn | — | TurnToken、TriggerSource、TurnTerminal | I-1 单飞、I-10 每轮恰一终态、I-14 账本≠字节流 | StartTurn、（机制侧 EndTurn/MarkInterrupted） |
| **InstructionQueue（指令队列）** | 推进驱动 | InstructionQueue | QueueItem | ItemOrigin（进轮被拒转排队/推进中新指令） | I-4 单一消费、I-9 排队有归宿、FIFO 保序 | SubmitInput（入队分支）、AdmitInstruction |
| **EvidenceItem（证据）** | 证据核验 | EvidenceItem | — | EvidenceType、PayloadRef、Provenance（恒＝系统采集） | I-5 非自述、幂等落账 | RecordEvidence |
| **TimelineLog（时间线）** | 推进驱动（机制聚合） | TimelineLog | — | EventEntry（seq＋事件） | I-2 单一写者＋seq 单调、I-12 否定事实必留痕 | RecordTimelineEvent（机制） |

聚合大小核查：全部聚合实体数 ≤1（QueueItem 为 InstructionQueue 内实体），无 >5 实体巨型聚合。
外部引用再审视：高影响操作清单（语言表附录 A）生命周期由我方维护，但它是**只读参考数据**（扩展必经用户裁定，非运行时命令面）——登记为 Specification 的输入单源，不建聚合（无独立事务面）。

## 3. 实体与值对象清单

| 名称 | 类型 | 所属聚合 | 标识策略/相等性 | 理由 |
|---|---|---|---|---|
| Delegation | Entity（根） | Delegation | delegationId（全局唯一，跨重启稳定） | 有生命周期（状态机） |
| Intent | VO | Delegation | 按值（意图文本＋发起时间） | 不可变事实 |
| Claim | VO | Delegation | 按值（声称文本＋evidenceRefs 列表） | 声称不可变；有效性由 ValidClaimSpec 判 |
| TerminalState / ReopenCount | VO | Delegation | 按值 | 终态与重开计数是状态机读数 |
| Scope | Entity（根） | Scope | scopeId（＝所属 delegationId 派生，一委托一作用域链） | 版本链有生命周期 |
| ScopeVersion | VO | Scope | 按值（seq＋entries＋amendmentRef） | 版本不可变，只追加 |
| ScopeEntry | VO | Scope | 按值（资源类型∈{仓库,目录,命令,网络}＋路径/模式） | 白名单条目 |
| DecisionPoint | Entity（根） | DecisionPoint | decisionPointId | 有生命周期（未决→已决） |
| RequestReason | VO | DecisionPoint | 按值（缘由∈{作用域外, 高影响清单命中项}＋操作描述） | 不可变事实 |
| Resolution | VO | DecisionPoint | 按值（批准/拒绝/选项＋时刻） | 决议不可变，首次生效 |
| Turn | Entity（根） | Turn | turnId（委托内单调） | 有生命周期（在飞→终态） |
| TurnToken | VO | Turn | 按值（generation＝turnId） | 令牌不可变；复核即比对 |
| TriggerSource | VO | Turn | 按值（用户输入/系统恢复/队列准入） | 不可变事实 |
| TurnTerminal | VO | Turn | 按值（收口/中止/中断） | 终态不可变 |
| InstructionQueue | Entity（根） | InstructionQueue | queueId（V1 单队列＝全局一个） | 队列有生命周期 |
| QueueItem | Entity | InstructionQueue | itemId | 项有生命周期（排队→准入/撤回） |
| ItemOrigin | VO | QueueItem | 按值 | 不可变事实 |
| EvidenceItem | Entity（根） | EvidenceItem | evidenceId | 有生命周期（落账→被引用） |
| EvidenceType | VO | EvidenceItem | 枚举（变更集/命令输出/测试结果） | 载荷多态标记 |
| PayloadRef | VO | EvidenceItem | 按值（本地存储指针＋内容摘要） | 证据体大，聚合持引用不持内容 |
| Provenance | VO | EvidenceItem | 恒等值"系统采集" | 信任锚：类型上不可表达"AI 自述" |
| EventEntry | VO | TimelineLog | seq（全局单调）＋事件载荷 | 追加不可变 |

VO 无 id 核查：上表 VO 均按值比较、无独立生命周期（PayloadRef 内指针是内容定位非标识）。

## 4. 不变量表（I-1–I-14 运行时＋S-1–S-3 结构检查项）

| # | 不变量 | 触发命令/时机 | 校验位置 | 违反时行为 |
|---|---|---|---|---|
| I-1 | 任一时刻在飞 Turn ≤1（单飞） | StartTurn | Turn 聚合（findInFlight 前置） | 命令拒绝；新输入转入 InstructionQueue（I-9 保归宿） |
| I-2 | timeline 仅由单一写者追加，seq 全局单调 | RecordTimelineEvent（机制） | TimelineLog 聚合 | 写拒绝＝违反原则1 事故（崩溃级上报） |
| I-3 | 每个 DecisionPoint 恰属于一个 (delegationId, turnId) | RaiseDecision | DecisionPoint 聚合 | 命令拒绝（无归属决策点不生成） |
| I-4 | 每个 QueueItem 至多准入一次 | AdmitInstruction | InstructionQueue 聚合 | 重复准入拒绝（幂等：同 itemId 二次准入＝no-op） |
| I-5 | EvidenceItem 的 Provenance 恒＝系统采集；Claim 有效性＝evidenceRefs 非空∧全部指向系统采集证据∧同委托 | ClaimCompletion | ValidClaimSpec（跨聚合只读查询） | 声称拒绝，委托不转待核验（M7 拒悬空） |
| I-6 | Delegation 进入待核验态仅当存在有效声称 | ClaimCompletion→状态转移 | Delegation 聚合 | 状态转移拒绝 |
| I-7 | 须拍板操作（RequiresApprovalSpec 命中）在 Resolution(批准) 前零副作用 | ApplyChange/一切操作入口 | AdmissionCheck 前置闸（校验先于产出） | 操作不执行，转 RaiseDecision |
| I-8 | Scope 版本 seq 单调；每新版本绑定恰一个 DecisionPoint 决议；旧版本只读可溯 | AmendScope | Scope 聚合 | 修正拒绝（无决议不产版本） |
| I-9 | 等待项闭集四类，每实例属且仅属一类且有可见位置（无归宿等待＝0） | 一切产生等待的状态转移 | deriveWaitingItems 投影（读模型校验） | 投影缺陷事故（呈现层不得吞项） |
| I-10 | 每 Turn 恰一个终态事件；每 Delegation 恰一个当前终态（重开回推进中，终态清空重计） | EndTurn/Accept/Reject/Close | Turn/Delegation 聚合 | 重复终态拒绝（幂等） |
| I-11 | 每个否定性事实（DecisionDenied/DelegationRejected/SessionInterrupted/StallDetected）必有 timeline 条目 | 各否定事件发生时 | TimelineLog（同事务追加） | 违反原则1 事故 |
| I-12 | 恢复只还原账本（持久化态）；在飞字节流不重放；中断必留丢失范围痕 | RestoreDelegation | RecoverableSpec＋Turn（标中断态） | 恢复拒绝并留痕（不假装修复） |
| I-13 | 过期 TurnToken 的状态写入计数＝0 | 每个 await 恢复点写前 | 令牌复核（推进驱动全域横切） | 写丢弃＋留痕（作废链事实入 timeline） |
| I-14 | DelegationReopened 挂原 delegationId（重开不新建委托） | RejectAcceptance | Delegation 聚合 | 新建拒绝（北极星口径守卫，U4） |
| S-1 | 呈现投影/度量采点对四核心零写路径 | 静态（段6 lint/依赖检查） | 结构检查项 | CI 红 |
| S-2 | 核心域代码零 provider 专名 | 静态（grep 断言） | 结构检查项 | CI 红 |
| S-3 | 高影响操作清单唯一源＝段2 语言表附录 A | 静态（实现清单引用不复制） | 结构检查项 | CI 红 |

不变量↔聚合覆盖核查：7 聚合每个至少 1 条显式不变量（Delegation→I-6/10/14、Scope→I-8、DecisionPoint→I-3/7、Turn→I-1/10/13、InstructionQueue→I-4/9、EvidenceItem→I-5、TimelineLog→I-2/11）。

## 5. 事件目录（21 事件，与段2 §1.3 逐名一致；载荷键为登记义务，实现位 `apps/desktop/src/domain/timeline.ts` 段6 接线）

| 事件 | 载荷键 | 发布聚合 | 主要消费者 |
|---|---|---|---|
| DelegationCreated | delegationId, intent, scopeVersion(=1) | Delegation | 呈现/度量 |
| InputAcknowledged | inputId, delegationId, 归宿(进轮 turnId/入队 itemId), 静默丢弃标志(恒否) | Turn/InstructionQueue | 呈现/度量（原则1 采点） |
| TurnStarted | turnId, delegationId, triggerSource | Turn | 呈现 |
| TurnEnded | turnId, terminal(收口/中止/中断) | Turn | 呈现/度量 |
| DecisionRaised | decisionPointId, delegationId, turnId, requestReason | DecisionPoint | 呈现/度量（护栏①采点） |
| DecisionResolved | decisionPointId, resolution | DecisionPoint | 推进/呈现 |
| DecisionDenied | decisionPointId, 理由(可选) | DecisionPoint | 推进（停下等用户）/呈现 |
| ScopeAmended | delegationId, 版本对(旧→新), decisionPointId | Scope | 呈现 |
| ChangeProduced | delegationId, turnId, 变更集ref, 作用域校验结果 | Turn（机制采集） | 证据核验 |
| EvidenceRecorded | evidenceId, type, delegationId, payloadRef | EvidenceItem | 呈现/生命周期（验收读） |
| EvidenceInspected | evidenceId, delegationId | 呈现（用户动作回流） | 度量（过程指标②采点） |
| CompletionClaimed | delegationId, claim, evidenceRefs | Delegation | 呈现 |
| DelegationAccepted | delegationId | Delegation | 度量（北极星采点） |
| DelegationRejected | delegationId, 去向 | Delegation | 呈现/度量 |
| DelegationReopened | delegationId, reopenCount | Delegation | 度量（问题关闭率口径） |
| DelegationClosed | delegationId | Delegation | 呈现 |
| InstructionQueued | itemId, delegationId, origin | InstructionQueue | 呈现（排队可见） |
| InstructionAdmitted | itemId, 准入 turnId | InstructionQueue | 呈现 |
| StallDetected | delegationId, turnId, 窗阈值, lastEventSeq | StallDetector（领域服务） | 呈现/度量（护栏②采点） |
| SessionInterrupted | delegationId, turnId, 中断点, 丢失范围 | TimelineLog（恢复机制） | 呈现/度量（护栏③采点） |
| DelegationRestored | delegationId, 恢复结果 | Delegation（恢复机制） | 呈现/度量（护栏③采点） |

发布纪律：全部事件先入 TimelineLog（I-2 单一写者）再进程内分发（呈现/度量为只读订阅者）；对外发布＝无（L0 原则6）。EvidenceInspected 是唯一由呈现侧用户动作回流的事件——回流仅追加 timeline 条目，呈现对核心域仍零写路径（S-1 不破：写的是 TimelineLog 机制口，非四核心聚合）。

## 6. 事务边界与跨聚合一致性

默认规则：**一个事务修改一个聚合**；V1 桌面单机本地持久化——聚合状态与 TimelineLog 同库，**同事务追加事件**（单机简化：无分布式 outbox；此为有意取舍，登记为 ponytail 级简化，升级路径＝引入 outbox 当且仅当出现跨进程写者）。

| 场景 | 触发事件 | 一致性策略 | 幂等保障 | 补偿 |
|---|---|---|---|---|
| 拍板→续推进 | DecisionResolved | 事件驱动（推进订阅） | 同 decisionPointId 重复决议＝首次生效 | 决议丢失＝I-3 事故呈现（决策点仍未决，可见） |
| 声称→待核验 | CompletionClaimed（ValidClaimSpec 过） | Delegation 聚合内转移（同事务） | 同 claim 重复声称幂等 | Spec 不过→声称拒绝留痕，委托不转态 |
| 变更→证据 | ChangeProduced | 事件驱动（证据域订阅采集） | evidenceId 去重 | 证据缺失→ValidClaimSpec 拦声称（闭环兜底） |
| 验收读证据 | AcceptDelegation 前置 | **只读查询**（生命周期→EvidenceRepo，环收敛约定） | 查询无副作用 | 证据不可核→验收拒绝可用（X3 路径） |
| 崩溃恢复 | SessionInterrupted→DelegationRestored | 账本重放（RecoverableSpec） | 重复恢复＝no-op | 恢复失败留痕＝违反原则3 事故（护栏③） |
| 重开 | DelegationRejected→DelegationReopened | Delegation 聚合内（同事务） | reopenCount 单调 | — |

并发/锁策略：V1 单件推进（L0 6a）＋timeline 单一写者 ⇒ 运行时天然串行化点＝写者队列；无多写者锁需求（S-1/S-2 静态保证不被绕过）。

## 7. 仓储接口草案（语义定义，无实现）

| 聚合 | 方法 | 语义 | 查询边界 |
|---|---|---|---|
| DelegationRepo | save / findById / findActive / listArchived | 活跃＝非归档非放弃 | 按 delegationId；列表仅呈现读模型用 |
| ScopeRepo | findByDelegation / appendVersion | 版本只追加 | 按 delegationId |
| DecisionPointRepo | save / findById / findOpenBy(delegationId, turnId) | 未决集供 deriveWaitingItems | 按归属对 |
| TurnRepo | findInFlight / save / findByDelegation | findInFlight 全局至多一（I-1 读侧） | 单飞查询无参数（V1 全局单件） |
| InstructionQueueRepo | enqueue / pending / markAdmitted | FIFO 保序（I-4 读侧） | 单队列（V1 全局一个） |
| EvidenceRepo | save / findByIds / findByDelegation | findByIds 供 ValidClaimSpec | 按委托/按 id 集 |
| TimelineRepo | append（单一写者口）/ since(seq) / findByDelegation | append 仅机制层可调（S-1 依赖检查） | since 供呈现增量/恢复重放 |

## 8. Specification 与领域服务（谓词型规则一等公民）

**Specifications**（纯谓词，可独立测试）：
- `RequiresApprovalSpec(operation, scopeVersion, 高影响清单)`：作用域外 ∪ 清单命中 → true（I-7 执行点；清单唯一源＝段2 语言表附录 A，S-3）
- `ValidClaimSpec(claim, evidenceRepo)`：evidenceRefs 非空 ∧ 全部 Provenance＝系统采集 ∧ 同 delegationId（I-5）
- `StallSpec(inFlightTurn, timeline, window)`：窗内零新事件（窗阈值＝段4 校准常量）
- `RecoverableSpec(persistedState)`：账本完整可重放（I-12）

**领域服务**：
- `AdmissionCheck`（授权拍板域）：操作入口前置闸＝RequiresApprovalSpec 判定，校验先于产出（I-7/M5）
- `StallDetector`(推进驱动域)：定时器＋StallSpec→发布 StallDetected（实现位主进程）
- `deriveWaitingItems`（呈现投影域读模型，纯函数）：四聚合事实→闭集四类投影（I-9 校验位；输入＝DecisionPoint 未决集/Delegation 待核验态/Turn 拒绝中断态/Queue pending）
- `deriveFocus`（呈现投影域读模型，纯函数）：优先级序（待拍板＞待核验＞待用户指令＞排队中）×同类创建序→唯一焦点；不落存储

## 9. 对段4 的移交

- stage-spec DoD 断言候选：I-1–I-14 逐条可测判据（I-13"过期令牌写入计数＝0"、I-9"无归宿等待＝0"、I-11 否定事实四事件必有痕为最硬三条）＋S-1–S-3 静态检查（CI 红判据）。
- 采点映射表：§5 事件目录×L0 §4 三层指标（北极星←DelegationAccepted；过程①←Accepted/Rejected/Reopened；过程②←EvidenceInspected；过程③←deriveWaitingItems 投影；护栏①←DecisionRaised；护栏②←StallDetected；护栏③←SessionInterrupted/Restored）。
- 卡滞窗阈值、二次委托率 7 天窗校准：段4 定常量（L0 唯一源条款不变）。
- 风险账：R3→S-2 静态断言；R4→S-1 静态断言＋I-2 单一写者（已结构化）。
- 段6 接线位：事件注册表 `apps/desktop/src/domain/timeline.ts`（现实现仅参考，按 §5 目录重写）。
