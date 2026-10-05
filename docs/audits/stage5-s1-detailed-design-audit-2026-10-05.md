> **主会话署名采纳（qodercn／Qwen3.8-Flash，2026-10-05）**：本 mcode 独立复审判 `FAIL`（H-01＋M-01~13＋L-01~09），全 21 条采纳修入 S1 详设 v0.2@a52c106；M-13 暴露 stage-spec A2/ADR-028 D3 漏 `timelineLogger.ts` 已登记 A2.5（ADR-028 补记待用户定）。v0.2 后按段5 出口闸再派 **command-code** 复审（轮替 mcode）。以下为 mcode 原始报告全文。

## V1-S1 详细设计 独立复审报告

- **审计对象**：`docs/design/v1.0.0-s1-detailed-design.md`（V1-S1 段5 第一稿，162 行）
- **执行者**：mcode / M3.1-Flash-Preview（异构独立审计，非自审）
- **依据**：段3 `03-domain-tactics.md` frozen v1.2 ／ stage-spec `V1-S1-legacy-freeze-vertical-skeleton.md` ／ 段4 `v1.0.0-stage-plan.md` ／ ADR-027 ／ ADR-028 ／ `apps/desktop/src/` 现状勘查（只读）
- **工作树**：`docs/neonforge-v1.0.0` @ 911f4b3；**未修改任何输入工件**，无 commit/push

### 逐节核对小结

**§1 领域层文件切分** — 核对通过项：按段3 七上下文分目录、纯函数模块与机制层立位、归档批 5 个旧领域文件与 stage-spec A2.1 逐名一致、域层零 React/ESM `.js` import/双 tsc 三项现状约定与勘查一致。发现：H-01、M-02、L-03。

**§2 聚合根与命令签名** — 核对通过项：Delegation 给出完整 class 签名、I-5/I-15 命令回执留痕口径与段3 §4「违反时行为」逐字一致、VO 不可变、EvidenceType 四值与互斥标记规则与段3 v1.2 一致。发现：M-03、M-12、L-07、L-09。

**§3 仓储面** — 核对通过项：7 仓储 23 个方法名与段3 §7 **逐条相等、零改名零增删**，`findByIds→ValidClaimSpec`／`findByDelegation→AcceptanceSpec` 限界、pending 排除语义、findInFlight 全局≤1 均对齐。发现：M-02。

**§4 Specifications** — 核对通过项：S1 恰 3 个 Spec、签名与段3 §8 逐条相等、requiresApproval 的 S1 两类射程（作用域修正→S2）正确、I-16 基线半边与段3 v1.2 一致、产物谓词两条款明确延 S4 且留指名 S4 的跳过用例不预绿（C13）、StallSpec/RecoverableSpec 正确归 S5/S3。发现：M-09。

**§5 领域服务** — 核对通过项：AdmissionCheck/ApplyChange 面与段3 §8 一致、ApplyChange 四步（前置闸→发事件→证据订阅采集→evidenceId 幂等）完整覆盖 C15、deriveFocus 口径（优先级×创建序、排队不占焦、空则 null、不带动作类型）与段3 §8 逐字一致。发现：M-10。

**§6 timeline.ts 22 事件注册表** — 核对通过项：22 事件名与段3 §5 **逐字相等、计数 17＋1＋4＝22 无增删**、S1 发射 17 事件与计划 §5 S1 行逐名一致、发布纪律（先 append 后进程内分发／对外零发布）与留痕不入闭集四条口径与段3 §5 尾注完全对齐。发现：M-01、M-02、M-12。

**§7 IPC 通道命名表** — 核对通过项：`域:动作` 命名式与现状 30 条通道全一致、`contextBridge.exposeInMainWorld('neonforge', …)` 与 `preload.ts:10` 一致、`preload.ts` 类型化桥模式与 `types.d.ts` 扩 `NeonforgeBridge` 贴现状、新通道均带语义注释。发现：M-08、M-11、M-13。

**§8 静态闸与依赖检查承载体** — 核对通过项：五闸落点文件名与 stage-spec D1/D2/D3/B3③/A5.1 逐条一致、依赖闸复用已装 vitest 跑 import 图且明写不引 dependency-cruiser 等新依赖（符合计划 §6「零新增工具」）、G-1 明确含 fixture 自证可红。发现：M-04、M-05、M-06、M-08、L-04、L-08。

**§9 时序** — 核对通过项：happy path 五段与 L0 §8 生命周期五段一致、I-1 拒方入队非丢弃、ValidClaimSpec/AcceptanceSpec 前置位置、拒→重开路径、timeline append 唯一口＋seq 单调、F2 未持久化显式呈现。发现：M-03（Step 5 与 §2 矛盾）、M-11（缺 Stop/取消路径）。

**§10 出口闸映射** — 核对通过项：声明"详设不新增 DoD、只把落点目录填成签名/通道/承载体"与 stage-spec 术语纪律一致。发现：M-07、L-01、L-02。

**§11 未决钩子** — 核对通过项：S2/S3/S4/S5/S6/S7 六项后续钩子逐条与 stage-spec 边界节及计划 §3 对齐、无 S2–S7 内容渗入 S1 实现面。发现：M-13（timelineLogger 旧面缺归属）、L-05。

### 发现列表

**H-01｜§1 line 30｜`mechanism/timeline.ts  # 22 事件闭集注册表（就地重写）`** — 段4 §1 移交第 5 项明写"timeline.ts 就地重写…**工程实体与注册表路径不变**（ADR-028 B 路线，段0 C1／段1 §9 零改动）"；段3 §5 头与 §9 末条均写"实现位 `apps/desktop/src/domain/timeline.ts` 段6 接线"；stage-spec B1 断言"`apps/desktop/src/domain/timeline.ts` **就地重写**"＋产出物同路径。详设把注册表迁入 `domain/mechanism/` 子目录。影响：段6 会写到与段3 唯一接口源、段4 迁移移交项、stage-spec B1 命令与产出物四处相反的路径；A2.1 归档在同目录、A5.2 fixture 路径亦以此为锚，属铁律① 违反＋闸命令失配。**建议（最小改法）**：§1 树中把该行移回 `domain/` 顶层 `timeline.ts  # 就地重写为 22 事件闭集注册表`；删 `mechanism/` 行（若保留目录，仅注释"非落点"）。

**M-01｜§6 line 114＋§2 line 62｜ScopeAmended 标 `△`"（仅 v1 声明，S1 只发初版）"＋`Scope.initial(): ScopeAmended`** — 计划 §5 事件首次发射分配：S1＝17 事件（不含 ScopeAmended）、S2＝ScopeAmended；stage-spec B2 断言"S1 发射的 **17 事件**（计划 §5 S1 行）逐个断言键名集合"。详设 `initial()` 返回 `ScopeAmended` 即 S1 会发第 18 个事件。影响：B2 判据与详设冲突，段6 将在"17/18"之间二选一；亦使 S2 首立事件被 S1 提前声称。**建议**：`initial(): Scope`（S1 不发事件、仅内存构 v1 版本），§6 表 ScopeAmended 由 `△` 改 `❌`（与计划 §5 一致），并在 §11 记"S2 接 ScopeAmended 首射"。

**M-02｜§1 line 30＋§3 line 77｜注册表写成"注册表＋TimelineEvent/TimelineSeq VO"、`seq` 由 `TimelineRepo` 维护** — 段3 §2 将 **TimelineLog 列为第 7 聚合**（含 EventEntry VO、关键命令 RecordTimelineEvent、关键不变量 I-2/I-11，校验位置＝TimelineLog 聚合）；stage-spec 产出物明写"6 业务聚合＋**TimelineLog 机制聚合**＝段3 7 聚合"；计划 §4 覆盖核查含"TimelineLog→I-2/11"。详设实给 6 聚合＋一个注册表模块、把 seq 单调性下沉到仓储。影响：I-2/I-11 的校验位置（聚合）与单一写者事务边界（§6 同事务例外）失去承载实体；段4 §4"7 聚合每个至少 1 条显式不变量"覆盖核查在 S1 落空。**建议**：§1 注明"`timeline.ts`＝TimelineLog 机制聚合根（`record` 唯一写者口，seq 由聚合维护，仓库仅存取）"；§3 line 77 改"`seq` 单调由 TimelineLog 聚合维护，TimelineRepo.append 为其唯一机制口"。

**M-03｜§2 line 56/62＋§9 Step 5｜新增 `reopen()`／`deny()`／`withdraw()` 三个公开命令** — 段3 §2 关键命令列：重开由 `RejectAcceptance` 触发（§6 重开行"DelegationRejected→DelegationReopened｜Delegation 聚合内"）、DecisionPoint 仅 `RaiseDecision`/`ResolveDecision`（拒绝为 Resolution VO 的取值，作废非独立命令）、InstructionQueue 仅 `SubmitInput`/`AdmitInstruction`（撤回经 `markWithdrawn` 机制口、**无独立用户命令**）。详设三处均立了独立公开方法，且 §2 `reopen()` 与 §9 Step 5"DelegationRejected→Reopened"自相矛盾。影响：多出段3 未授权的命令面；`reopen()` 若可被直接调用则可绕过 I-14 触发路径（无拒绝即重开）；`deny(reason?)` 与 Resolution 三值 VO 冲突。**建议**：三处降为内部路径——`reopen()` 标"reject() 内部转移，非独立命令"；`deny(reason?)` 标"`resolve(Resolution{值=拒绝, 理由})` 的语法糖，非独立命令"；`withdraw()` 标"markWithdrawn 机制口的领域侧别名，无用户命令"。

**M-04｜§8 line 138｜S-1 承载体落点 `＋`.eslintrc` overrides`＋禁 `domain/*/command`** — 现状勘查：包内唯一 eslint 配置为 `eslint.config.js`（ESLint **flat config**），`eslint ^10.8.1`（v10 已不支持 eslintrc）；且详设 §1 树内**不存在 `command` 文件**（写命令在 `Delegation.ts` 等聚合文件内），故 `domain/*/command` glob 命中恒 0。影响：S-1 两条承载体中 eslint 半边既落点形态错、路径 pattern 又空 ⇒ 永远绿空闸（item 5 明确关切）。**建议**：落点改 `eslint.config.js` 的 `files: ['src/renderer/**']` 分块；pattern 改指向真实写命令面（如禁 `src/renderer/**` import `src/domain/{delegation,turn,queue,evidence,authorization}/*` 聚合根，或直接依赖 `tests/static/s1WritePath.test.ts` 单条承载体并注 eslint 仅作即时红）。

**M-05｜§8 line 141｜G-1 判据"任何文件 import `domain/{…5 项}` **或旧呈现**=红"** — "旧呈现"未枚举任何路径；stage-spec A2.2 明确 24 文件清单"经现场 `ls`＋import 图核实固化于本件"，且 A5.2 的 fixture 只覆盖领域文件面。影响：G-1 的旧呈现半边黑名单不可机械构造 ⇒ 该半边永不红、不可自证（与 A5.2「不留永远绿空闸」纪律冲突）。**建议**：改为"或 stage-spec A2.2 所列 24 个 `src/renderer/*` 旧呈现路径"并注明清单唯一源＝stage-spec A2.2（不在详设复制 24 名）。

**M-06｜§8 line 138｜S-1 承载体未登记 fixture 自证** — stage-spec D1 明文："`tests/static/s1WritePath.test.ts` 绿（**含 fixture 自证可红，同 A5.2 纪律**）"；详设 S-1 行无 fixture 登记（G-1 行有）。影响：D1 的可红性纪律在 S-1 漏承接，段6 可能交付空闸。**建议**：S-1 行判据栏补"含 fixture 自证可红（呈现模块 import 写命令 ⇒ 命中>0），同 A5.2 纪律"。

**M-07｜§10 line 158｜出口闸映射只覆盖 B/C/D/E/F，A 行与 G1–G5 零映射** — stage-spec DoD A1（tag 可调阅）／A2.1–A2.4（归档清单逐条 `test ! -e`）／A3（**复用面已移植且未反向依赖**，清单＝ADR-028 D4，含 `sandboxPath.ts`）／A4（L1 基线诚实重建 ≥60 条且全部来自新树）／A6（段6 闸双 tsc＋eslint＋desens-scan）与 G1（表 N 13 轴 S1 行回填）／G2（DoD 逐条勾绿或标 blocked）／G3（handoff 落账）／G4（ADR 同步）／G5（commit）均无详设落点；且 `sandboxPath.ts` 在详设全文零出现（grep 确认）。影响：归档批与覆盖矩阵/交接类 DoD 无承载体登记，A3 复用面有漏移植风险（阶段计划 §8 第 1 项"依赖检查承载体"与审计必答五面之"文件切分"两面在此缺口最大）。**建议**：§10 增两行——"§1＋§7＋§8→A1–A4（§1 归档批／A3 复用面按 ADR-028 D4 全表移植，含 sandboxPath.ts／A4 落 tests/unit+static+interaction 网格计数）／§10 本表＋段6 闸→A6＋G1–G5"。

**M-08｜段4 §8 必答项 ④⑤ 漏签** — ④ StallDetector 实现位（定时器形态／进程落点 `main` vs 独立）：详设 §5 line 105 写"（S5，定时器形态/进程落点**见 §8**）"，而 §8 是静态闸表、**无此内容**（悬空交叉引用），§11 又整体推 S5；段3 §1 裁定 5 明写"实现位归段5/6 详设"，计划 §8 第 4 列为段5 必答。⑤ 流级取消令牌管道形状：段4 §8 第 5 项要求"其形状（同步可读性、跨进程边界）为段5 必答；重叠窗定义＝流剩余＋复核延迟"，详设仅 §7 一行 `gateway:cancel-stream  # 流级取消令牌（E1，AbortController 联动令牌过期）`，管道形状与重叠窗定义均未答，§9 时序亦无 Stop 路径。影响：段4 出口审计将判"必答项漏签"；段6 在 E1（gateway.cancelToken.test.ts ≥3 条＋stopInflight.spec.ts）上无契约依据。**建议**：§8 增设"机制落点"小节两行——StallDetector 落点定 `main` 进程内单定时器（实现位 S5 接线，本阶段只留注册位）；取消令牌管道定 renderer `AbortController`→preload 透传→main 侧 `gateway.ts` 新增 `abort(handle)` 面，令牌过期判据＝在飞轮复合值变更，重叠窗＝流剩余＋复核延迟。

**M-09｜段4 §8 必答项 ② 数据契约漏签（载荷 TS 类型）** — 段4 §8 第 2 项明列"22 事件的**载荷 TS 类型**（键名逐条对齐段3 §5，禁增禁减）"；stage-spec 网格第 3 行更注明"各事件 payload 类型（TS 类型面＝契约面）"。详设 §6 只给 `TimelineEvent = { ts; seq; delegationId; type: EventType; detail: Payload }`＋"载荷键＝段3 §5「载荷键」列逐条"，以指针代替签名。影响：段6 面对 17 个 S1 事件无逐事件类型可签，`Payload` 泛型不构成契约面；B2 的 `timeline.payloadKeys.test.ts` 缺可断言的类型源。**建议**：§6 增一张"EventType 22 名联合＋S1 17 事件的 payload 类型"表（键名直接引段3 §5 键名列，禁增禁减，测试快照＝本表）。

**M-10｜§5 line 102｜`deriveWaitingItems` 注释含"收束态过滤（I-9，检测式计数）"** — stage-spec 边界行 126 明写"`deriveWaitingItems` **收束态过滤属 S5**；S1 的队列只做可见"；计划 §4 I-9 行"后续扩面＝**S5（收束态过滤后计数仍＝0）**"；段3 §8 收束态过滤谓词（已收尾/已归档/已放弃）是 S5 面。影响：S1 越界实现 S5 面；更实质的风险是 S1 若已实现收束态过滤，会使 I-9 的 S5 扩面"预绿"，违反计划 §4 渐进登记纪律与风险账「新增·薄实现被当真」。**建议**：§5 注释删"收束态过滤"四字，改为"**收束态过滤→S5**（本阶段不实现；S1 判据＝四类闭集＋无归宿计数 0，见 C7）"。

**M-11｜§7 line 124＋§2 line 58｜新建 `delegation:abandon` 通道与 `abandon(): DelegationAbandoned` 命令** — stage-spec 边界行 126"**卡滞与催弃路径**／DelegationAbandoned 三处事件驱动消费…属 **S5**"；详设 §6 表已把 DelegationAbandoned 标 `❌`（计划 §5：首次发射＝S5）。影响：S1 出现无发射路径的死通道＋死命令，段6 可能顺势把弃路径拉进 S1（撞边界），且 S2/S5 边界被稀释。**建议**：§7 通道表该行加阶段标注"`delegation:abandon`（**S5 接线；S1 不建该通道**）"，§2 `abandon()` 同样标注 S5，与 §11 合并登记。

**M-12｜§6 line 113｜17 事件发布者泛化为"各聚合"** — 段3 §5 前言明写"发布者列语义＝聚合／机制口／领域服务三种…保证'**每事件发布者已登记**'可机械核对"，并逐行给出（`InputAcknowledged`＝Turn/InstructionQueue 按归宿分支、`TurnEnded`＝Turn、`ChangeProduced`＝ApplyChange 领域服务、`EvidenceInspected`＝用户动作经机制口…）。详设以"各聚合"＋3 条括注覆盖 17 事件。影响：段3 §5 的逐行登记纪律在 S1 失效，`timeline.eventCatalog.test.ts` 无法对发布者做机械断言，跨聚合写面归属不清。**建议**：§6 表 17 行逐个填发布者（直接引段3 §5 同名列，零新增语义），仅对 S1 未发射的 4 事件保留阶段标注。

**M-13｜§7 line 121｜"复用既有：…`timeline:query`"** — 现状勘查 `src/main/ipc.ts:303`：`timeline:query` filter 为 `{session, type, from, to, limit}`，实现落 `src/main/timelineLogger.ts`（旧树 JSONL 诊断日志）；该文件既不在 ADR-028 Decision 3 归档清单，也不在 Decision 4 复用清单。计划 §8 第 6 项明写"旧通道集为**旧域形状，不复用命名**"；stage-spec 边界行 123"S1 为内存态，重启即失"。影响：沿用 `timeline:query` 会在 S1 内存态 22 事件闭集之外并存一条旧 session 形状＋JSONL 落盘的时间线读面（双源时间线），且与 F2"UI 须显式呈现未持久化"相悖（实际已写盘）。**建议**：§7 复用表删 `timeline:query`、只留新建 `timeline:query-by-delegation`；§11 增一行"`src/main/timelineLogger.ts`＋`timeline:log`/`timeline:query` 旧读面→归档（或随 S3 持久化重写）"。

**L-01｜§10 line 158｜"§3＋§5→B3/B4"** — B4（发布纪律：先落账后分发、对外零发布、`timeline.publishDiscipline.test.ts`）实际条文在 §6 line 117，不在 §3/§5。**建议**：改为"§3＋§6→B3/B4"。

**L-02｜§10 line 158｜"§2 不变量注→C1–C15"** — 桶归过粗且与自身其他归桶重叠：C7 落 §5（deriveWaitingItems）、C10 落 §1 line 21（TurnToken 计数器）、C13 落 §4（acceptance.test.ts 跳过用例）、C15 落 §5（ApplyChange）。**建议**：改为逐行落点（至少列出 C7→§5、C10→§1＋§2、C13→§4、C15→§5，其余沿 §2）。

**L-03｜缺 `src/renderer/**` 文件切分** — stage-spec 产出物含"`src/renderer/**`：委托单中心最简呈现"，F1 列六块（委托单列表／时间线视图／拍板卡／证据打开／验收与拒绝／排队可见）；术语纪律规定"实现文件**签名**归段5，本件只给落点目录"，故组件切分属段5 必答（审计五面之"文件切分"），详设 §7 只给 IPC 与桥面。另：现状 renderer 为**扁平结构无 `components/` 层**（stage-spec A2.2 明载），段6 若自行建子目录会违实况。**建议**：§7 增设一行 renderer 切分，贴扁平结构给出六件命名（如 `DelegationList.tsx`／`TimelineView.tsx`／`DecisionCard.tsx`／`EvidenceList.tsx`／`AcceptRejectBar.tsx`／`QueueList.tsx`，与 `ConfigPage.tsx` 同级）。

**L-04｜全文无 `promptfoo` 字样（grep 确认）** — 计划 §8 第 8 项结论"S1 不引入"、stage-spec 边界行 130"promptfoo **不引入**…模型行为面用真网关＋假网关双轨"。详设未越界（§9 已写双轨），但缺显式继承声明，段6 可能自行评估引入。**建议**：§8 选型理由末句补"promptfoo 不引入（计划 §8 第 8 项）；模型行为面用真网关＋假网关双轨"。

**L-05｜头部 line 5｜"StallSpec/RecoverableSpec/StallDetector→S3/S5"** — 三名词对两阶段，错位（正确归属＝StallSpec→S5、RecoverableSpec→S3、StallDetector→S5）；§4 line 93、§5 line 105、§11 三处均已正确，仅头部行错位。**建议**：改为"RecoverableSpec→S3／StallSpec＋StallDetector→S5"。

**L-06｜§1 line 18｜"唯一源＝段2 §4 附录A"** — 段3 §2 表述为"唯一源锚点＝段2 §4 语言表'高影响操作清单'行（含枚举）"，段4 §3 S2 行用"段2 §4 附录 A"；措辞不统一易在 S2 评审引发争议。**建议**：统一为段3 口径"段2 §4『高影响操作清单』行"。

**L-07｜§2 line 47｜`DelegationState` 11 值枚举为详设自造** — 段3 无该枚举（仅有 §8 收束态三值"已收尾/已归档/已放弃"＋`pendingVerify` 提及＋§2 终态唯一不变量）。语义与段3 相容，但属无源枚举。**建议**：加注"枚举源＝段2 §4 委托状态机＋段3 §8 收束态三值；如与段3 冲突回段3 校核"。

**L-08｜§8 line 139/142｜S-2 专名清单与 I-2 闸的可红性** — S-2 行"专名清单测试内枚举"未给来源，防漏项；I-2 行"grep 断言测（与 S-1 同族）"未登记 fixture 自证，存在空闸风险。**建议**：S-2 行补"专名清单源＝现 `src/main/providers/**` 现存 provider 标识全量枚举"；I-2 行补"含 fixture 自证可红"。

**L-09｜§4｜Spec 谓词名去 `Spec` 后缀（`requiresApproval`／`validClaim`／`acceptance`）** — 段3 §8 为 `RequiresApprovalSpec`／`ValidClaimSpec`／`AcceptanceSpec`；段4 术语纪律"实现命名归段5/6"故段5 有命名权，且 stage-spec C6/C13 测试文件名同形、§10 映射亦用 AcceptanceSpec，内部自洽。仅记为口径登记项。**建议**：§4 各 spec 文件注释加一行"谓词名段3＝`*Spec`，实现名去后缀（段5 命名权）"。

---

**结论：FAIL — 须先修 H-01 及 M-01/M-02/M-03/M-04/M-05/M-12 后放行段6（实现）。**

理由：H-01 违反铁律①（段3 §5 与 §9、计划 §5、stage-spec B1/产出物四处一致钉定注册表路径为 `apps/desktop/src/domain/timeline.ts`，详设迁入 `domain/mechanism/`）；M-01 使 S1 事件首发数 17/18 与 B2 判据二义；M-02 使段3 第 7 聚合（TimelineLog）无承载实体、I-2/I-11 校验位落空；M-04/M-05 使 S-1 与 G-1 的静态闸出现永远绿空闸（违反 stage-spec A5.2/D1 纪律）；M-03/M-12 增出段3 未授权命令面并注销其逐行发布者登记；M-05/M-08/M-09 另含段4 §8 三项必答项（④⑤ 与必答面②）漏签。

其余 9 条 M 与 9 条 L 均为 1–3 行最小改法，可在同批修入；全部修毕并复审通过后可放行段6。退役词检查（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）零命中，无段3 v1.1 活引用，越界面（AmendScope／持久化与 RecoverableSpec／三类证据载荷／StallSpec＋StallDetector／呈现完整化／指标计算）除 M-10、M-11 两条外均已正确排除，产物谓词两条款延 S4 且以指名 S4 的跳过用例显式登记不预绿（C13 合规）。