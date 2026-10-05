# 段3 · 领域战术设计（frozen v1.2 — v1.1 补全）

- 状态：**frozen v1.2 — v1.1 于 2026-10-05 用户终裁通过＋AI 过闸备案（v1.1 增量复审 M-01/M-02/M-03 全采纳）；v1.2＝用户裁定触发的铁律②回退增量补全（2026-10-05，ADR-027 Decision 6，t000088②）**——段4 出口用户裁定四项第②项「补全」触发：v1.1 只落段2「产物」合取谓词的变更集半边（M-02 采选项②），补全＝收尾还须有验证结果类证据（射程语义，属再次加严验收）⇒ 回退本段出 v1.2。改动面＝§1 U6 证据形状裁定行（四值＋互斥标记规则）、§3 EvidenceType 枚举扩增「验收判据运行结果」类（4 值）、§4 I-16 加合取条款（谓词本体不变，编号与位置不变）、§8 AcceptanceSpec「合取半边登记」→「全边落」＋射程后果升级、§9 遗留账「部分关闭」→「全部关闭」、ADR-027 增 Decision 6 + Consequences v1.2 补全段、表 N 段4 列引用更新（轴 1 行 201 改「ADR-027 D1＋D6／段3 v1.2 I-16」）；不改段0/段2/段4、不扩事件闭集（22 不变）、不新立不变量编号、不延外 ADR。其余条文与 v1.1 逐字相同。按段2 v1.1 + 段3 v1.1 两先例派回补增量复审（异构执行者、只审增量面；执行者署名见各报告本身，状态头不钉死）。**两轮已落地**：第一轮报告 `docs/audits/stage3-domain-tactics-v1.2-increment-reaudit-2026-10-05.md`（PASS with findings，3 中危＋4 低危 M-01~M-07，主会话全采纳并已修入 v0.2@618edfa）；第二轮报告 `docs/audits/stage3-domain-tactics-v1.2-reaudit-2-2026-10-05.md`（PASS with findings，1 中危 M-08 系第一轮 M-05 修入引入＋6 低危＋M-09，主会话全采纳修入本稿 v0.3）。**第三轮异构复审待派**（v0.3 出口闸，通过后回用户亲裁冻结 v1.2）。**M-08 修正记**：§8 射程后果前置由「无变更集 ∧ 验收判据运行结果证据」改「缺『变更集 ∧ 验收判据运行结果』合取谓词任一半边」，消除与 M-05 第四例的内部矛盾。**v1.1 M-03 括注随 §8 重写撤除**（有意简化，N3 已不出现）。用户亲裁过闸后生效。
- 修订对照：`docs/audits/` 下段3 系列五份（前五轮＋v1.1 回补增量）＋`stage3-domain-tactics-v1.2-increment-reaudit-2026-10-05.md`（v1.2 回补增量复审，PASS with findings，全采纳已修入）；正文不复述审计编号
- 上游工件：`02-domain-strategy.md`（段2 frozen v1.1）、`01-l0-product-master.md`（段1 frozen v1.0）、`00-problem-and-scope.md`（段0 frozen v1.0）；ADR-027 Decision 6（v1.2 补全决策）
- 经验层（只作经验不作依据，引用带 `@be6e299`）：旧树 ADR-021 Turn/DriverLease 概念集、ADR-019 同步取消令牌与"已作废链写入计数为 0"判据、`00-domain-authority.md` §3.7/§3.8
- 纪律：退役词（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）不进任何条文；本稿全部名词以段2 §4 语言表为谓词源；实现命名与代码归段6，本稿只定领域形状。

---

## 1. 段2 移交清单的战术裁定（八项＋新增第九项）

| # | 移交项 | 裁定 | 落点 |
|---|---|---|---|
| 1 | 证据形状（U6） | **一种证据、四种载荷**【v1.2】：EvidenceItem 单谓词（系统采集/挂委托单/可打开核验），EvidenceType 枚举＝变更集｜命令输出｜测试结果｜**验收判据运行结果**【v1.2，ADR-027 D6】。理由：四类共享同一信任语义（生产者＝系统），差异仅在载荷编解码与产品用途；前三种为通用产物（变更集＝代码变更、命令输出＝执行产出、测试结果＝任意测试输出），第四种为**针对本委托产物的 DoD 验收判据运行产出**（L1 vitest/L3 playwright 报告承载）——前三种把同一谓词写三遍仍覆盖不了「针对本委托的 DoD 验收」这一专属场景，故 v1.2 扩第四类【v1.2】；**互斥标记规则**【v1.2，M-03】＝针对本委托 DoD 验收判据运行产出的报告一律记为该类型、不再记入 `测试结果`；`type` 为单值标记、不可同归两类 | §3 EvidenceItem／EvidenceType |
| 2 | 驱动权机制 | **TurnToken（轮令牌）＝复合值 (delegationId, turnId)**：StartTurn 签发；每个**推进恢复点**（一次挂起后恢复写状态的时刻）写前复核令牌；复核基准＝与当前在飞轮的复合值比对，不等即过期；**过期令牌写入计数＝0**（经验参照 `@be6e299`：同步取消令牌＋已作废链写入计数判据）。turnId 保留委托内单调仅作业务引用，令牌可判定性由复合值保证。V1 单件推进下不建租约续期/抢占——令牌只能过期、不转移（"过期"为唯一失效词，见 I-13） | §3 Turn、§4 I-1/I-13 |
| 3 | 焦点派生规则 | **deriveFocus 纯函数**：焦点候选＝前三类等待项（待拍板＞待核验＞待用户指令），同类取创建序最早者；**排队中不占焦点**（等的是系统空槽非用户动作，只保可见位置）；三类皆空时**焦点为空**（不退化指排队中）。焦点＝"下一步用户动作"的呈现指向（段2 谓词），派生不落存储 | §8 领域服务 |
| 4 | 等待项四类聚合归属 | **无独立聚合**：等待项＝派生读模型（待拍板←DecisionPoint 未决、待核验←Delegation 有效声称、待用户指令←Turn 拒绝态/中断态/**卡滞待指令态**、排队中←InstructionQueue 未准入）。**等待闭集计算上提为共用纯函数模块**（无状态、不属任一子域；呈现投影与度量采点各自调用，两域互不依赖——段2"互不依赖"约定的落实）；I-9 在该投影上校验 | §8 deriveWaitingItems |
| 5 | 卡滞窗实现位 | **推进驱动域 StallDetector**（领域服务）：周期性检视，StallSpec＝在飞轮存在且窗内零新 timeline 事件⇒发布卡滞；实现位（定时器形态/进程落点）归段5/6 详设；阈值常量由段4 stage-spec 校准（L0 §4 既定） | §8、§9 |
| 6 | 事件载荷字段与不变量条文 | §5 事件目录（22 事件逐条载荷键）＋§4 不变量表（I-1–I-17）成文 | §4/§5 |
| 7 | 环上事务边界锚定 | **以委托单为锚**：delegationId＝环上全部事件的关联键；环内事件驱动最终一致；验收读证据＝生命周期对 EvidenceRepo 的**只读查询**，谓词化＝`AcceptanceSpec`（§8），无反向写路径 | §6/§8 |
| 8 | 对话通道聚合归属 | **无聚合**：承载面＝呈现投影域对 timeline＋等待项的只读投影；输入语义＝SubmitInput→进轮/入队（推进驱动域）。对话不持有状态（零写路径），"委托单持有对话"落地为：对话视图按 delegationId 过滤 timeline | §8、§6 |
| 9 | **卡滞干预方式（段2 X5 移交"催/停/弃"）** | **V1 检出不自动催**：StallDetected 后该轮转"卡滞待指令"（非终态），等待项归第三类（待用户指令）；用户**催**＝下一条用户指令开新轮（**TriggerSource＝用户输入**；先收口在飞轮——原轮终态＝中止，I-10 守恒——再准入）；**卡滞待指令期 TriggerSource 准入＝{用户输入, 队列准入}**（排队项是用户在先意志，非自动催；自动催所禁的是系统自发重试）；用户**弃**＝放弃委托（AbandonDelegation→DelegationAbandoned，段2 v1.1 已回补；Delegation 终态"已放弃"；**弃委托时该委托的在飞轮终态＝中止，I-10 守恒**——V1 全局单飞下弃非在飞委托时无轮可中止，该分支显式为空；事件驱动消费，与催路径对称）；自动催（系统自发重试推进）**登记射程外**——自动干预与"假象自主"反指标同向，异常时推进权交还用户（与 U2 哲学同构） | §4 I-9/I-15、§8 |

## 2. 聚合目录（7 聚合，聚合＝事务边界，外部只持根引用、跨聚合引用用 id）

| 聚合 | 上下文 | 聚合根 | 包含实体 | 包含值对象 | 关键不变量 | 关键命令 |
|---|---|---|---|---|---|---|
| **Delegation（委托单）** | 委托生命周期 | Delegation | —（状态机单实体） | Intent、Claim、TerminalState、ReopenCount | I-6 无据不核、I-10 终态唯一、I-14 重开挂原单、I-16 验收前置 | CreateDelegation、AcceptDelegation、RejectAcceptance、AbandonDelegation、CloseDelegation、ClaimCompletion |
| **Scope（作用域）** | 授权拍板 | Scope | —（版本链单实体） | ScopeEntry、ScopeVersion（含 amendmentRef 字段） | I-8 版本单调＋决议绑定、I-17 无决议不产版本 | AmendScope（经决策点） |
| **DecisionPoint（决策点）** | 授权拍板 | DecisionPoint | — | RequestReason、Resolution | I-3 归属唯一、I-7 无拍板不执行、决议幂等（机制侧约束，非 I 表条目：聚合命令前置承载） | RaiseDecision、ResolveDecision（作废＝事件驱动状态迁移至终态"已作废"，非决议值、无独立命令） |
| **Turn（轮次）** | 推进驱动 | Turn | — | TurnToken、TriggerSource、TurnTerminal | I-1 单飞、I-10 每轮恰一终态、I-12 中断态标记、I-13 过期令牌写入＝0、I-15 拒绝守卫 | StartTurn、（机制侧 EndTurn/MarkInterrupted/MarkStalled） |
| **InstructionQueue（指令队列）** | 推进驱动 | InstructionQueue | QueueItem | ItemOrigin | I-4 单一消费、I-9 排队有归宿、FIFO 保序（机制侧约束，非 I 表条目：I-4 读侧/仓储承载） | SubmitInput（入队分支）、AdmitInstruction（撤回＝事件驱动状态迁移，经 markWithdrawn 机制口、无独立用户命令） |
| **EvidenceItem（证据）** | 证据核验 | EvidenceItem | — | EvidenceType、PayloadRef、Provenance（恒＝系统采集）、FirstInspectionMark | I-5 非自述、幂等落账（机制侧约束，非 I 表条目：evidenceId 去重承载） | RecordEvidence、InspectEvidence（记首次打开标志） |
| **TimelineLog（时间线）** | 推进驱动（机制聚合） | TimelineLog | — | EventEntry（seq＋事件） | I-2 单一写者＋seq 单调、I-11 否定事实必留痕 | RecordTimelineEvent（机制） |

- 聚合大小核查：全部聚合实体数 ≤1（QueueItem 为 InstructionQueue 内实体），无 >5 实体巨型聚合。
- **Scope 独立聚合的拆分理由**（1:1 却不并入 Delegation）：上下文边界对齐——作用域是**授权拍板域**的根概念（授权事实的生产者），Delegation 是**委托生命周期域**的根；并格将令一个聚合横跨两个上下文（违反段2 边界），且授权域须独立持有"修正必经拍板"的命令前置（I-8/I-17）。跨聚合一致性策略见 §6 AmendScope 行。
- 外部引用再审视：高影响操作清单生命周期由我方维护，但它是**只读参考数据**（扩展必经用户裁定，非运行时命令面）——登记为 Specification 的输入单源，不建聚合（无独立事务面）。**运行期形状**：域内只读配置源（常量表），唯一源锚点＝段2 §4 语言表"高影响操作清单"行（含枚举，可 diff 可被 CI 比对）；扩展经用户裁定后随版本落地。
- ApplyChange 归属声明：变更操作＝推进驱动域的**服务面入口**（经 AdmissionCheck 后执行），变更集以 PayloadRef 形态记录于 EvidenceItem；变更集本身**不建聚合**（有意取舍登记：变更集是瞬时事实，其可信形态＝证据落账，独立聚合只增双写面）。

## 3. 实体与值对象清单

| 名称 | 类型 | 所属聚合 | 标识策略/相等性 | 理由 |
|---|---|---|---|---|
| Delegation | Entity（根） | Delegation | delegationId（全局唯一，跨重启稳定） | 有生命周期（状态机） |
| Intent | VO | Delegation | 按值（意图文本＋发起时间） | 不可变事实 |
| Claim | VO | Delegation | 按值（声称文本＋evidenceRefs 列表＋所属 turnId） | 声称不可变；有效性由 ValidClaimSpec 判 |
| TerminalState / ReopenCount | VO | Delegation | 按值 | 终态与重开计数是状态机读数 |
| Scope | Entity（根） | Scope | scopeId（＝所属 delegationId 派生，一委托一作用域链——1:1 对应为有意设计，拆分理由见 §2） | 版本链有生命周期 |
| ScopeVersion | VO | Scope | 按值（seq＋entries＋amendmentRef） | 版本不可变，只追加 |
| ScopeEntry | VO | Scope | 按值（资源类型∈{仓库,目录,命令,网络}＋路径/模式） | 白名单条目 |
| DecisionPoint | Entity（根） | DecisionPoint | decisionPointId | 有生命周期（未决→已决｜已作废；**作废＝终态字段非决议值**，触发＝DelegationAbandoned 事件驱动消费） |
| RequestReason | VO | DecisionPoint | 按值（缘由∈{作用域外, 高影响清单命中项, **作用域修正**}＋操作描述＋requestedBy∈{AI 提请, 用户提请}） | 不可变事实；作用域修正缘由承载 U3 路径 |
| Resolution | VO | DecisionPoint | 按值（批准/拒绝/选项＋时刻） | 决议不可变，首次生效；**决议值闭集承段2 X1a（用户三值），作废不占决议值**（由 DecisionPoint 终态字段承载） |
| Turn | Entity（根） | Turn | turnId（**委托内单调**，仅作业务引用；全局可判定性由 TurnToken 复合值承担） | 有生命周期（在飞→卡滞待指令?→终态） |
| TurnToken | VO（**标识型，例外见尾注**） | Turn | 按值＝复合 (delegationId, turnId) | 令牌不可变；复核＝与当前在飞轮复合值比对 |
| TriggerSource | VO | Turn | 按值（**闭集三种**：用户输入/系统恢复/队列准入） | 不可变事实；I-15 守卫的判定输入（拒绝待决期/卡滞待指令期的准入窗口见 I-15 与 §1 裁定9；本词与段2 语言表"驱动＝机制归属"为相邻概念非同义） |
| TurnTerminal | VO | Turn | 按值（收口/中止/中断） | 终态不可变 |
| InstructionQueue | Entity（根） | InstructionQueue | queueId（V1 单队列＝全局一个） | 队列有生命周期 |
| QueueItem | Entity | InstructionQueue | itemId | 项有生命周期（排队→准入/撤回；**撤回的唯一触发＝所属委托 DelegationAbandoned 的事件驱动消费**，见 §6；撤回＝终态字段，留痕第四类见 §5 口径；撤回后再准入＝拒绝） |
| ItemOrigin | VO | QueueItem | 按值 | 不可变事实 |
| EvidenceItem | Entity（根） | EvidenceItem | evidenceId | 有生命周期（落账→被引用→被核验） |
| EvidenceType | VO | EvidenceItem | 枚举（变更集/命令输出/测试结果/**验收判据运行结果**【v1.2，ADR-027 D6】） | 载荷多态标记；四类载荷语义有别（前三种为通用产物，第四种为针对本委托的 DoD 验收判据运行产物——payloadRef 指向 L1 vitest / L3 playwright 报告）；**互斥标记规则**【v1.2，M-03】＝单值标记、不可同归两类，针对本委托 DoD 验收判据运行产出的报告一律记为「验收判据运行结果」而非「测试结果」（I-16 第二条款的前置；下游接线提示＝段0 [裁定 B] 叙述中的「测试结果」指广义测试产出，不作 type 取值依据） |
| PayloadRef | VO | EvidenceItem | 按值（本地存储指针＋内容摘要）。**构成约束：payload 不得含凭据形态串，落账前过脱敏判据（C3 领域侧防线，检查项 S-4）** | 证据体大，聚合持引用不持内容 |
| Provenance | VO | EvidenceItem | 恒等值"系统采集" | 信任锚：类型上不可表达"AI 自述" |
| FirstInspectionMark | VO | EvidenceItem | 按值（首次打开时刻，缺省＝未打开） | 过程指标②"计入"口径的领域侧依据（首次打开计入，重复打开不计） |
| EventEntry | VO | TimelineLog | seq（全局单调）＋事件载荷 | 追加不可变 |

VO 无 id 核查：上表 VO 均按值比较、无独立生命周期（PayloadRef 内指针是内容定位非标识）。**例外声明**：TurnToken 为标识型 VO——值域取自 (delegationId, turnId) 复合标识，承担 I-13 的比较职责；其比较基准在 §4 I-13 显式写出，无独立生命周期故仍为 VO。

## 4. 不变量表（I-1–I-17 运行时＋S-1–S-4 结构检查项）

| # | 不变量 | 触发命令/时机 | 校验位置 | 违反时行为 |
|---|---|---|---|---|
| I-1 | 任一时刻在飞 Turn ≤1（单飞） | StartTurn | Turn 聚合（findInFlight 前置） | 命令拒绝；新输入转入 InstructionQueue（I-9 保归宿） |
| I-2 | timeline 仅由单一写者追加，seq 全局单调 | RecordTimelineEvent（机制） | TimelineLog 聚合 | 写拒绝＝违反原则1 事故（崩溃级上报） |
| I-3 | 每个 DecisionPoint 恰属于一个 (delegationId, turnId) | RaiseDecision | DecisionPoint 聚合 | 命令拒绝（无归属决策点不生成） |
| I-4 | 每个 QueueItem 至多准入一次 | AdmitInstruction | InstructionQueue 聚合 | 重复准入拒绝（幂等：同 itemId 二次准入＝no-op）；**撤回项再准入＝拒绝**（撤回为终态） |
| I-5 | EvidenceItem 的 Provenance 恒＝系统采集；Claim 有效性＝evidenceRefs 非空∧全部指向系统采集证据∧同委托 | ClaimCompletion | ValidClaimSpec（跨聚合只读查询） | 声称拒绝（命令回执携拒绝理由回推进侧呈现，委托不转待核验；拒绝事实以回执留证，不入 timeline 闭集——见 §5 留痕口径） |
| I-6 | Delegation 进入待核验态仅当存在有效声称 | ClaimCompletion→状态转移 | Delegation 聚合 | 状态转移拒绝 |
| I-7 | 须拍板操作（RequiresApprovalSpec 命中）在 Resolution(批准) 前零副作用 | ApplyChange/一切操作入口 | AdmissionCheck 前置闸（校验先于产出） | 操作不执行，转 RaiseDecision |
| I-8 | Scope 版本 seq 单调；每新版本绑定恰一个 DecisionPoint 决议；旧版本只读可溯 | AmendScope | Scope 聚合 | 修正拒绝（无决议不产版本） |
| I-9 | 等待项闭集四类，每实例属且仅属一类且有可见位置（无归宿等待＝0）。**检测式（非阻断式）断言**：违反不可阻断、只能被发现，DoD 以计数为 0 为判据 | 一切产生等待的状态转移（含卡滞待指令态） | deriveWaitingItems 共用投影 | 投影缺陷事故（呈现层不得吞项） |
| I-10 | 每 Turn 恰一个终态事件；每 Delegation 恰一个当前终态（重开回推进中，终态清空重计；**已收尾→已归档＝终态更新，仍恰一个当前终态**） | EndTurn/Accept/Reject/Close | Turn/Delegation 聚合 | 重复终态拒绝（幂等） |
| I-11 | 每个否定性事实（DecisionDenied/DelegationRejected/SessionInterrupted/StallDetected）必有 timeline 条目（四事件闭集；DelegationAbandoned 属用户侧否定性收束，由 22 事件闭集覆盖必落 timeline，不重复枚举；其余否定情形留痕口径见 §5 尾注） | 各否定事件发生时 | TimelineLog（同事务追加） | 违反原则1 事故 |
| I-12 | 恢复只还原账本（持久化态）；在飞字节流不重放；中断必留丢失范围痕。**丢失范围派生定义**：下界＝持久化 timeline 最后落账 seq，上界＝恢复重做起点；不可计算时值＝"不可判定"（枚举值之一，不得留空）。**写时点声明**：SessionInterrupted 由恢复机制在**发现未收口在飞轮之时**追加（崩溃瞬间物理不可写）——该时点下界与上界均可算，定义与载体时点一致 | RestoreDelegation | RecoverableSpec＋Turn（标中断态） | 恢复拒绝并留痕（不假装修复；恢复失败由 DelegationRestored 恢复结果键承载，见 §5） |
| I-13 | 过期 TurnToken 的状态写入计数＝0。**比较基准**：令牌复合值 (delegationId, turnId) ≠ 当前在飞轮复合值 ⇒ 过期 | 每个推进恢复点写前 | 令牌复核（推进驱动全域横切） | 写丢弃＋**过期令牌写入计数器**留证（聚合状态字段，DoD 判据＝计数 0；不入 timeline 闭集） |
| I-14 | DelegationReopened 挂原 delegationId（重开不新建委托） | RejectAcceptance | Delegation 聚合 | 新建拒绝（北极星口径守卫，U4） |
| I-15 | **U2 守卫**：**拒绝待决期**（可判定边界＝该委托 DecisionDenied 发生起，至下一次 TriggerSource＝用户输入的 StartTurn 成功止）内，StartTurn 仅"用户输入"可触发——"系统恢复""队列准入"两源对该委托不可用（刻意收敛：拒绝＝用户收回推进权，用户在先意志的队列项亦不得替用户消化拒绝；解除后队列按序恢复消费）；卡滞待指令期准入＝{用户输入, 队列准入}（裁定9，与拒绝待决期口径不同源为有意设计） | StartTurn | Turn 聚合（以 Delegation 只读查询取被拒标记） | 命令拒绝＋留痕（命令回执，与 I-5 同口径，不入 timeline 闭集——§5 留痕口径） |
| I-16 | 验收前置：Delegation 处于待核验态∧AcceptanceSpec 过（**该证据集＝本委托 delegationId 下的证据引用集**【v1.2，M-06，对称读法】；存在可打开核验且 Provenance＝系统采集的证据引用，**且其中至少一条 EvidenceType＝变更集**【v1.1，ADR-027 D1】**且其中至少一条 EvidenceType＝验收判据运行结果**【v1.2，ADR-027 D6 补全；限界由本条前置「证据集＝本委托 delegationId 下」承担，与 §8 同形，不重复】——两条独立合取条款，均为必要条件，共享同条 I-16 不新立编号） | AcceptDelegation | Delegation 聚合（AcceptanceSpec 只读查询） | 验收拒绝（DelegationRejected 路径可用：拒绝→原单重开） |
| I-17 | AmendScope 产生新版本前必存在绑定该修正的已决 DecisionPoint（缘由＝作用域修正，批准权仅用户） | AmendScope | Scope 聚合命令前置 | 修正拒绝 |
| S-1 | 呈现投影/度量采点**不得直接引用四核心聚合的写命令**；timeline 追加仅经 `TimelineRepo.append` 唯一机制口（呈现侧用户动作回流仅限 EvidenceInspected 经机制口落账） | 静态（段6 lint/依赖检查） | 结构检查项 | CI 红 |
| S-2 | 核心域代码零 provider 专名 | 静态（grep 断言） | 结构检查项 | CI 红 |
| S-3 | 高影响操作清单唯一源＝段2 §4 语言表"高影响操作清单"行（含枚举）；实现侧只读配置源引用不复制 | 静态（CI diff 比对） | 结构检查项 | CI 红 |
| S-4 | PayloadRef 内容与 timeline 条目过脱敏扫描（C3 领域侧防线；扫描工具＝段6 闸既有 `tools/desens-scan.py` 同族判据） | 落账前＋段6 闸 | 结构检查项 | 落账拒绝／CI 红 |

不变量↔聚合覆盖核查：7 聚合每个至少 1 条显式不变量（Delegation→I-6/10/14/16、Scope→I-8/17、DecisionPoint→I-3/7、Turn→I-1/10/12/13/15、InstructionQueue→I-4/9、EvidenceItem→I-5、TimelineLog→I-2/11）。

## 5. 事件目录（22 事件，与段2 v1.1 §1.3 逐名一致；载荷键为登记义务，实现位 `apps/desktop/src/domain/timeline.ts` 段6 接线）

发布者列语义＝**聚合／机制口／领域服务**三种；归属注逐行登记（聚合发布者可带归属说明括注，非聚合发布者必注形态），保证"每事件发布者已登记"可机械核对。

| 事件 | 载荷键 | 发布者 | 主要消费者 |
|---|---|---|---|
| DelegationCreated | delegationId, intent, scopeVersion(=1) | Delegation | 呈现/度量 |
| InputAcknowledged | inputId, delegationId, 归宿(进轮 turnId/入队 itemId), 静默丢弃标志(恒否) | Turn/InstructionQueue（按归宿分支） | 呈现/度量（原则1 采点） |
| TurnStarted | turnId, delegationId, triggerSource | Turn | 呈现 |
| TurnEnded | turnId, terminal(收口/中止/中断) | Turn | 呈现/度量 |
| DecisionRaised | decisionPointId, delegationId, turnId, requestReason(缘由+requestedBy) | DecisionPoint | 呈现/度量（护栏①采点） |
| DecisionResolved | decisionPointId, resolution | DecisionPoint | 推进/呈现 |
| DecisionDenied | decisionPointId, delegationId, turnId, 理由(可选) | DecisionPoint | 推进（停下等用户，I-15 上守卫）/呈现 |
| ScopeAmended | delegationId, 版本对(旧→新), decisionPointId | Scope | 呈现 |
| ChangeProduced | delegationId, turnId, 变更集ref(=PayloadRef), 作用域校验结果 | ApplyChange（领域服务，经机制口；采集归证据域订阅） | 证据核验 |
| EvidenceRecorded | evidenceId, type, delegationId, payloadRef | EvidenceItem | 呈现/生命周期（验收读） |
| EvidenceInspected | evidenceId, delegationId, 核验动作(打开), 首次打开标志 | 用户动作经 TimelineRepo.append 机制口（呈现侧发起，证据域同步 FirstInspectionMark；S-1 唯一例外） | 度量（过程指标②采点：首次打开计入，重复打开不计） |
| CompletionClaimed | delegationId, turnId, claim, evidenceRefs | Delegation | 呈现 |
| DelegationAccepted | delegationId, 收尾态 | Delegation | 度量（北极星采点） |
| DelegationRejected | delegationId, 去向 | Delegation | 呈现/度量 |
| DelegationReopened | delegationId, reopenCount | Delegation | 度量（问题关闭率口径） |
| DelegationClosed | delegationId, 归档态 | Delegation | 呈现 |
| InstructionQueued | itemId, delegationId, origin | InstructionQueue | 呈现（排队可见） |
| InstructionAdmitted | itemId, 准入 turnId | InstructionQueue | 呈现 |
| StallDetected | stallWindowId(幂等键), delegationId, turnId, 窗阈值, lastEventSeq | StallDetector（领域服务，经机制口） | 呈现/度量（护栏②采点） |
| SessionInterrupted | delegationId, turnId, 中断点, 丢失范围(派生定义见 I-12) | TimelineLog（恢复机制） | 呈现/度量（护栏③采点） |
| DelegationRestored | delegationId, 恢复结果(成功/失败+原因) | Delegation（恢复机制） | 呈现/度量（护栏③采点；恢复失败由本事件承载，不另立事件） |
| DelegationAbandoned | delegationId, 放弃时点, **该委托的**在飞轮处置(指令＝中止，待轮侧消费——发布时点该事实尚未物质化，第二事务产生 TurnEnded；**弃非在飞委托时无轮可中止，本键为空**，该分支可达已登记 §6) | Delegation | 呈现/度量；事件驱动消费面见 §6 |

发布纪律：全部事件先入 TimelineLog（I-2 单一写者）再进程内分发（呈现/度量为只读订阅者）；对外发布＝无（L0 原则6）。
**留痕口径（V1）**：timeline 事实＝22 事件闭集；不在闭集内的否定情形留痕位——过期令牌写入＝聚合计数器（I-13）、声称被拒/触发源违规＝命令回执（I-5/I-15）、恢复失败＝DelegationRestored 恢复结果键、**决策点作废/队列项撤回＝聚合终态字段**（弃路径消费面；事实由项状态＋DelegationAbandoned 事件联合承载，呈现侧可见位置＝作废/撤回终态标记——原则1"输入不静默消失"由撤回项持续可见兑现）。均不进 timeline 闭集（保 22 计数与段2 v1.1 对齐）；若段4 DoD 需要独立事件承载，须回段2 改事件全集（铁律②），不在本段就地扩。

## 6. 事务边界与跨聚合一致性

默认规则：**一个事务修改一个聚合**。**登记在案的例外**：聚合状态写入与 timeline 追加（`TimelineRepo.append` 唯一机制口）**同事务**——追加失败⇒整事务回滚＋违反原则1 事故上报（I-2/I-11 的事务基础；下表"同事务范围"列逐场景标注）。V1 桌面单机本地持久化，聚合与 TimelineLog 同库（有意简化：无分布式 outbox；升级路径＝出现跨进程写者时引入）。

| 场景 | 触发事件 | 一致性策略 | 同事务范围 | 幂等保障 | 补偿 |
|---|---|---|---|---|---|
| 拍板→续推进 | DecisionResolved | 事件驱动（推进订阅） | 决策点聚合＋timeline | 同 decisionPointId 重复决议＝首次生效 | 决议丢失＝I-3 事故呈现（决策点仍未决，可见） |
| 作用域修正 | DecisionResolved(缘由=作用域修正)→ScopeAmended | 事件驱动（授权域内 Scope 消费决议） | Scope 聚合＋timeline | 同 decisionPointId 只产一个版本 | 决议丢失→无新版本（I-8/I-17 拦截，修正请求可见——未决或已作废；作废后不再产生版本，与 I-8/I-17 相容） |
| 声称→待核验 | CompletionClaimed（ValidClaimSpec 过） | Delegation 聚合内转移 | 委托聚合＋timeline | 同 claim 重复声称幂等 | Spec 不过→声称拒绝回执留痕（§5 口径），委托不转态 |
| 变更→证据 | ChangeProduced | 事件驱动（证据域订阅采集） | 证据聚合＋timeline | evidenceId 去重 | 证据缺失→ValidClaimSpec 拦声称（闭环兜底） |
| 验收读证据 | AcceptDelegation 前置 | **只读查询**（AcceptanceSpec，环收敛点） | 委托聚合＋timeline（验收事件） | 查询无副作用 | 证据不可核→验收拒绝（DelegationRejected 路径） |
| 崩溃恢复 | SessionInterrupted→DelegationRestored | 账本重放（RecoverableSpec） | 委托/轮聚合＋timeline | 重复恢复＝no-op | 恢复失败＝DelegationRestored(失败) 留痕（护栏③） |
| 卡滞→干预 | StallDetected→（用户输入催｜队列准入）InstructionAdmitted/新 TurnStarted；（用户弃）AbandonDelegation→DelegationAbandoned | 检出即转待用户指令（裁定 9）；不自动催；**催＝两事务串行**（先收口在飞轮：轮聚合＋timeline；再准入起新轮：队列聚合 markAdmitted＋timeline→轮聚合 StartTurn＋timeline，与裁定9"先收口再准入"一致）；弃＝委托终态"已放弃"，**DelegationAbandoned 的事件驱动消费面＝三处：该委托的在飞轮中止（TurnEnded；弃非在飞委托时无此消费）＋未决 DecisionPoint 迁移终态"已作废"（非决议值）＋该委托排队 QueueItem 迁移终态"已撤回"（markWithdrawn）**（各消费＝其所属聚合的独立事务；I-9 守恒：收束态委托不再产生等待项，见 §8 收束态过滤） | 催：两事务串行（轮＋timeline；队列＋轮＋timeline）；弃：委托聚合＋timeline（三处消费为事件驱动后续事务） | stallWindowId 幂等；AbandonDelegation 终态守卫幂等；撤回项再准入＝拒绝（I-4） | 补偿＝三条读侧计数判据分别判、分别呈现：轮侧 I-10 终态计数；决策点侧"收束态委托的未决决策点数＝0"；队列侧"收束态委托的 pending 项数＝0"（I-9 只保留投影检测，不兼作补偿信号） |
| 重开 | DelegationRejected→DelegationReopened | Delegation 聚合内 | 委托聚合＋timeline | reopenCount 单调 | — |

并发口径（领域谓词）：V1 单件推进（L0 6a）＋timeline 单一写者 ⇒ 状态写入天然串行，无需并发控制裁决；运行时串行由 I-1/I-13 的计数判据在段4 落 DoD（不依赖静态检查）。

## 7. 仓储接口草案（语义定义，无实现）

| 聚合 | 方法 | 语义 | 查询边界 |
|---|---|---|---|
| DelegationRepo | save / findById / findActive / listArchived | 活跃＝非归档非放弃（**含已收尾未归档**，列表为呈现用；多活跃委托合法：在飞至多一个由 I-1 管，活跃数不限。**等待项投影的收束态过滤不用本方法**——经 findById 读状态判定，口径见 §8） | 按 delegationId；列表仅呈现读模型用 |
| ScopeRepo | findByDelegation / appendVersion | 版本只追加 | 按 delegationId |
| DecisionPointRepo | save / findById / findOpenBy(delegationId, turnId) | 未决集供等待闭集模块；findById 可区分已决（批准/拒绝）/已作废（呈现侧两态不同形） | 按归属对 |
| TurnRepo | findInFlight / save / findByDelegation | findInFlight 全局至多一（I-1 读侧） | 单飞查询无参数（V1 全局单件） |
| InstructionQueueRepo | enqueue / pending / markAdmitted / markWithdrawn | pending **排除已准入与已撤回项**；markWithdrawn＝事件驱动机制口（撤回唯一触发见 §3 QueueItem）；FIFO 保序（I-4 读侧） | 单队列（V1 全局一个） |
| EvidenceRepo | save / findByIds / findByDelegation / markFirstInspection | findByIds 供 ValidClaimSpec/AcceptanceSpec | 按委托/按 id 集 |
| TimelineRepo | append（单一写者口）/ since(seq) / findByDelegation | append 仅机制层可调（S-1 依赖检查） | since 供呈现增量/恢复重放 |

## 8. Specification 与领域服务（谓词型规则一等公民）

**Specifications**（纯谓词，可独立测试）：
- `RequiresApprovalSpec(operation, scopeVersion, 高影响清单)`：操作类别∈{资源访问, 命令执行, **作用域修正**}；作用域外 ∪ 清单命中 ∪ 作用域修正 → true（I-7/I-17 执行点；清单唯一源见 §2 外部引用再审视，S-3）
- `ValidClaimSpec(claim, evidenceRepo)`：evidenceRefs 非空 ∧ 全部 Provenance＝系统采集 ∧ 同 delegationId（I-5）
- `AcceptanceSpec(evidenceRepo, delegationId)`：**该证据集＝本委托 delegationId 下的证据引用集**【v1.2，M-06，对称读法，两条款范围一致】；委托待核验态下存在可打开核验且 Provenance＝系统采集的证据引用，**且该证据集中至少一条 EvidenceType＝变更集 ∧ 且该证据集中至少一条 EvidenceType＝验收判据运行结果** ⇒ 可验收（I-16；环收敛点的谓词形状，§6 验收行消费）。**v1.1+v1.2 全边（ADR-027 D1 + D6 补全）**：谓词本体＝段2 §4「产物（Artifact）」合取谓词（V1＝软件工程变更集＋其验证结果）的可执行化全边落点；条款＝**两条独立合取条款**（变更集 ∧ 验收判据运行结果），均为必要条件。变更集条款承载产物谓词变更集半边（D1，v1.1）；**验收判据运行结果条款承载产物谓词「其验证结果」半边（D6，v1.2）**——同条 Spec 共享 I-16，不新立编号、不扩事件闭集。**v1.2 验收判据运行结果条款语义**：EvidenceType=验收判据运行结果的 evidenceItem.payloadRef 指向本委托的 L1（vitest）或 L3（playwright）测试报告产物（针对本 delegationId 的产物运行 DoD 验收判据后写入）；与通用 EvidenceType=测试结果的区别——测试结果＝任意测试输出（参考用），验收判据运行结果＝**本委托 DoD 验收判据的运行产物**（验收用，载荷类型在 S4 spec 接线时定；互斥标记规则见 §3 EvidenceType VO 行＋§1 U6 互斥条款）。**射程后果（v1.2 升级，有意，非缺口）**：缺「变更集 ∧ 验收判据运行结果」合取谓词任一半边的委托（纯调研／纯解释／无验收产物／**有变更集但缺本委托 DoD 验收判据运行结果证据的软件工程委托**【v1.2，M-05 例示补】）在 V1 不可验收收尾，与段0 G1 裁定 B「V1 锚软件工程委托」同向；此类需求属射程外，不得在下游（计划/实现）就地放宽本谓词（铁律②）。
- `StallSpec(inFlightTurn, timeline, window)`：窗内零新事件（窗阈值＝段4 校准常量）
- `RecoverableSpec(persistedState)`：账本完整可重放（I-12）

**领域服务**：
- `AdmissionCheck`（授权拍板域）：操作入口前置闸＝RequiresApprovalSpec 判定，校验先于产出（I-7）
- `ApplyChange`（推进驱动域服务面）：经 AdmissionCheck 通过后的变更操作入口；产物以 PayloadRef 入证据（§2 归属声明）
- `StallDetector`（推进驱动域）：周期性检视＋StallSpec→发布 StallDetected；检出后轮次转卡滞待指令（裁定 9，无自动干预）
- `deriveWaitingItems`（**共用纯函数模块**，不属任一子域）：四聚合事实（DecisionPoint 未决集/Delegation 待核验态/Turn 拒绝·中断·**卡滞待指令**态/Queue pending）→闭集四类投影；**收束态过滤谓词：仅统计所属委托处于非收束态的实例**（收束态＝已收尾/已归档/已放弃，用词与段2 §4 委托状态机对齐；收束态委托的实例随收束消解——决策点已作废、队列项已撤回、轮已终态——"随收束消解"即 I-9 的可判定归宿位，弃路径不产生无归宿等待）；呈现投影域与度量采点域各自调用（I-9 校验位）
- `deriveFocus`（呈现投影域读模型，纯函数）：候选＝前三类（待拍板＞待核验＞待用户指令）×同类创建序→唯一焦点或空；排队中不占焦点；不落存储。**口径边界**：焦点只指向等待项，不携带动作类型（"下一步动作是什么"由等待项类别自明，段4/段6 不得要求焦点输出动作指令）

## 9. 对段4 的移交

- stage-spec DoD 断言候选：I-1–I-17 逐条可测判据（最硬四条：I-13 过期令牌写入计数＝0、I-9 无归宿等待＝0【检测式，计数判据】、I-11 否定事实四事件必有痕、I-15 拒绝待决期 TriggerSource≠用户输入的自发开轮计数＝0）＋S-1–S-4 静态检查（CI 红判据）。
- 遗留账（显式登记移交）：**全部关闭（v1.2 补全后，2026-10-05 t000088②）**。（原登记项①**产物谓词与 N3 OUT 判定**：用户 2026-10-05 裁定"立 DoD：收尾必有变更集类证据"⇒ 铁律②回退本段 v1.1，判据落 §4 I-16＋§8 AcceptanceSpec，裁定全文＝ADR-027 D1，DoD 断言归属段4 计划的实现阶段 S4；v1.2 用户 t000088② 裁定「补全」⇒ 铁律②第三次回退本段 v1.2，验收判据运行结果条款落 §4 I-16＋§3 EvidenceType 枚举扩四值＋§8 AcceptanceSpec 全边落，裁定全文＝ADR-027 D6。**关闭范围＝段2「产物」合取谓词的全边（变更集＋验收判据运行结果，两条款均必要）**。原登记项②弃委托路径事件化已经用户授权回补段2 v1.1 并同步本稿 §1/§2/§5/§6，账目关闭。）
- 采点映射表：§5 事件目录×L0 §4 三层指标（北极星←DelegationAccepted 收尾态【**分母＝已收尾件；已放弃件不进分母**】；过程①←Accepted/Rejected/Reopened/**Abandoned（未关闭侧）**【7 天窗与北极星同源，窗内 Reopened 件不计成功——窗常量段4 校准，唯一源＝L0 §4】；过程②←EvidenceInspected 首次打开标志；过程③←等待闭集共用模块【度量域自行调用，不经呈现；终态过滤后计数】；护栏①←DecisionRaised；护栏②←StallDetected；护栏③←SessionInterrupted/DelegationRestored 恢复结果）。
- 卡滞窗阈值、二次委托率 7 天窗校准：段4 定常量（L0 唯一源条款不变）。
- 风险账：R3→S-2；R4→S-1＋I-2 单一写者；**C3→S-4＋PayloadRef 构成约束**（全域纪律的领域侧防线）。
- 段6 接线位：事件注册表 `apps/desktop/src/domain/timeline.ts`（现实现仅参考，按 §5 目录重写）；StallDetector 实现位（定时器形态/进程落点）段5/6 定。
