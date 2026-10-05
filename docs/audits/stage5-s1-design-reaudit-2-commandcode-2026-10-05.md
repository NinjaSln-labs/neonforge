
> **主会话署名采纳（qodercn／Qwen3.8-Flash，2026-10-05）**：command-code 复审判 `PASS with findings — 可放行段6`（无 H／无铁律违反／无空闸，21 条全落对）。7 条新增（CC-01 中危＋CC-02~07 低危）全为 §10 映射表/措辞登记级、1 行以内：CC-01 系 v0.2 拆 C 桶（L-02）时漏 C11 行（修入引入的回归，第三次于本流水线应验）。采纳随放行同批修入 v0.3＋AI 自查（CC 全登记级、强执行者池已尽不再外派）。以下为 command-code 原始报告全文。

# V1-S1 详细设计 v0.2 独立复审报告（第二轮）

- **审计对象**：`docs/design/v1.0.0-s1-detailed-design.md`（段5 详设 v0.2@a52c106，205 行）
- **执行者**：command-code / DeepSeek v4.1 Flash（异构独立复审，轮替 mcode；非自审）
- **依据（只读）**：段3 `03-domain-tactics.md` frozen v1.2 ／ stage-spec `V1-S1-legacy-freeze-vertical-skeleton.md` ／ 段4 `v1.0.0-stage-plan.md` ／ ADR-027 ／ ADR-028 ／ 上一轮 `stage5-s1-detailed-design-audit-2026-10-05.md`（mcode，21 条）／ `apps/desktop/src/` 现状勘查（只读）
- **工作树**：`docs/neonforge-v1.0.0` @ 48ed066（审计对象 a52c106）。**未修改任何输入工件，无 commit/push。**
- **勘查实测（支撑承载体核对）**：包内唯一 eslint 配置＝`apps/desktop/eslint.config.js`（flat，`tseslint.config`，无 eslintrc）；`eslint ^10.8.1`／`vitest ^4.1.10`；`ipc.ts:300/302` 确有 `timeline:log`/`timeline:query`（后者落 `timelineLogger.query`，JSONL）；`gateway.ts` 仅 `AbortSignal.timeout`、无用户面 `AbortController`；renderer 扁平 32 文件（A2.2 的 24 名逐名在位，保留面 icons/styles/diffRender/ConfigPage 在位）；`domain/` 5 旧文件＋`timeline.ts`＋`sandboxPath.ts`；`providers/**` 非空（catalog/registry/descriptors/profiles/transport）；双 tsconfig 在位。

## 一、21 条修入核验（逐条：修没修／对不对／有无因修引入新矛盾）

| # | 修没修 | 修得对不对 | 有无新矛盾 |
|---|---|---|---|
| **H-01** | 修了 | 对。`timeline.ts` 回 `domain/` 顶层（§1 line 14-15），撤 `mechanism/`（全文 grep 零命中） | 无 |
| **M-01** | 修了 | 对。`Scope.initial(): Scope` 不发事件（§2 line 56）；§6 S1 表恰 17（line 112-128）；ScopeAmended 入非发射列 `[S2]`（line 108/130）；§11 记 S2 首射（line 205） | 无 |
| **M-02** | 修了 | 对。§1 line 15＋§3 line 69＋§6 line 104 均写 TimelineLog 第 7 聚合承载 seq/单写者，仓储仅存取 | 无 |
| **M-03** | 修了 | 对。`reopen`/`deny`/`withdraw` 三独立命令均撤（§2 line 51/56）；§9 步5 line 173 改「内部转移…（M-03 与 §2 一致）」，原 Step5/§2 矛盾消除 | 无 |
| **M-04** | 修了 | 对。落点改 `eslint.config.js`（flat）＋`files:['src/renderer/**']`＋真实 glob `src/domain/{delegation,turn,queue,evidence,authorization}/*`（§8 line 154），5 目录在 v0.2 树内均真实存在＝非空 glob | 见 CC-07（口径"四聚合"vs 6 聚合/glob 未含 service 写面，低危） |
| **M-05** | 修了 | 对。G-1 旧呈现半边改引「stage-spec A2.2 所列 24 个 `src/renderer/*`」（§8 line 157），唯一源正确、不再需在详设复制 24 名 | 无 |
| **M-06** | 修了 | 对。S-1 可红自证列补「fixture 自证：呈现模块 import 写命令⇒命中>0，同 A5.2」（§8 line 154） | 无 |
| **M-07** | 修了 | **基本对**。§10 已补 A1–A6 行＋G1–G5 行，`sandboxPath.ts` 进 §1 复用面与 §10 A3 行（line 34/182） | **有**：§10 补行时**漏 C11**（见 CC-01 中危）、且 A 行未列新加的 A2.5（见 CC-03） |
| **M-08** | 修了 | 对。§8 增「机制落点」小节：StallDetector 落 `main` 单 `setInterval`、S5 接线；取消令牌管道 renderer `AbortController`→preload→`gateway.ts abort(handle)`＋令牌过期判据＋重叠窗＝流剩余时长＋写前复核延迟（line 162-164）；§9 步6 补 Stop 路径（line 174） | 无 |
| **M-09** | 修了 | **基本对**。17 事件逐行给 payload 键、逐字对齐段3 §5（line 112-128），删去「指针代替签名」 | 见 CC-04（EventType 22 联合 vs payload 仅补 17 的 `PayloadOf` 全映射张力，低危）；未逐字给 TS `interface` 声明（键即契约，可接受） |
| **M-10** | 修了 | 对。§5 line 97 删「收束态过滤」实现、明标「→ S5（本阶段不实现）」；§11 S5 钩子复登 | 无 |
| **M-11** | 修了 | 对。§7 line 139 `abandon → S5，S1 不建`；§2 line 53 注释归 S5；§11 复登 | 无 |
| **M-12** | 修了 | 对。§6 表逐行列发布者，17 行与段3 §5 同名列**逐条一致**（含 EvidenceInspected＝用户动作经机制口、ChangeProduced＝ApplyChange 领域服务） | 无 |
| **M-13** | 修了 | 对。§7 复用表删 `timeline:query`、只留新建 `timeline:query-by-delegation`（line 136/144）；§11 登记 `timelineLogger.ts`＋旧两通道归档 | 见 CC-06（§11 与 stage-spec A2.5/ADR-028 D3 关系措辞略松，低危） |
| **L-01** | 修了 | 对。§10 line 187 改 `§3＋§6→B3/B4` | 无 |
| **L-02** | 修了 | **部分**。§10 已把 C 桶拆成逐行（C7→§5、C10→§1＋§2、C13→§4、C15→§5 均落位） | **有**：拆桶时**漏 C11**（CC-01）、C9 落点错（CC-02） |
| **L-03** | 修了 | 对。§7 增 renderer 六件命名，贴扁平结构、与 `ConfigPage.tsx` 同级（line 148） | 无 |
| **L-04** | 修了 | 对。§8 line 160 明写「不引 dependency-cruiser / promptfoo…（计划 §8.8 promptfoo 不引入）」 | 无 |
| **L-05** | 修了 | 对。头部 line 6 改「StallSpec＋StallDetector→S5、RecoverableSpec→S3」 | 无 |
| **L-06** | 修了 | 对。§1 line 20 统一为段3 口径「段2 §4『高影响操作清单』行」 | 无 |
| **L-07** | 修了 | 对。§2 line 45 加注枚举源＋「与段3 冲突回段3 校核」 | 无 |
| **L-08** | 修了 | 对。§8 S-2 补专名源＝`src/main/providers/**` 全量枚举；I-2 行补 fixture 自证可红（line 155/158） | 无 |
| **L-09** | 修了 | 对。§4 line 75 加注「谓词名段3＝`*Spec`，实现名去后缀＝段5 命名权」 | 无 |

**小计：21 条全部修入；19 条干净正确，M-07/L-02 两条的最小改法在落地时引入了一处回归（§10 漏 C11）＋一处落点错（C9）。无 H 级、无铁律违反、无空闸。**

## 二、忠实度核对（对段3 v1.2 逐条）

- **7 聚合**：Delegation／Scope／DecisionPoint／Turn／InstructionQueue／EvidenceItem／TimelineLog——§1 树＋§2/§3 全部就位，TimelineLog 归 `domain/timeline.ts` 顶层。✓
- **7 仓储 23 方法**：§3 line 63-69 逐方法名与段3 §7 **逐条相等、零改名零增删**（DelegationRepo 4／ScopeRepo 2／DecisionPointRepo 3／TurnRepo 3／InstructionQueueRepo 4／EvidenceRepo 4／TimelineRepo 3＝23）。✓
- **3 Spec**：requiresApproval／validClaim／acceptance，签名与段3 §8 相等；StallSpec→S5、RecoverableSpec→S3 正确不立（line 87）。✓
- **22 事件名**：17（表中）＋5（ScopeAmended/StallDetected/SessionInterrupted/DelegationRestored/DelegationAbandoned）＝22，逐字＝段3 §5，无增删。✓
- **载荷键**：17 行逐字对齐段3 §5「载荷键」列（含 `归宿(进轮turnId/入队itemId)`、`静默丢弃标志(恒否)`、`变更集ref(=PayloadRef)`、`作用域校验结果` 等），禁增禁减口径正确。✓
- **EvidenceType 四值**：变更集／命令输出／测试结果／验收判据运行结果，＋互斥标记规则（第 4 值不记测试结果）——＝段3 v1.2。✓
- **§6 同事务例外**：聚合写入＋append 同事务、失败整事务回滚（line 71/104/132）。✓
- **I-16 基线**：S1 只落基线半边、产物两条款→S4 跳过用例（line 84-85）。✓
- **结论：无改名/增删/语义漂移。**

## 三、边界核对（S2–S7 未渗入）

- 收束态过滤（M-10）→ S5 不实现（§5 line 97）；abandon/DelegationAbandoned（M-11）→ S5（§7 line 139）；StallDetector 只留注册位（§8 line 163）；持久化/RecoverableSpec→S3；AmendScope/作用域修正→S2；指标→S7（§11）——**均仅登记接口位**。
- 产物谓词两条款以「指名 S4 的跳过用例」显式登记、不预绿（C13 合规，line 85）。
- 无 S2–S7 实现内容落入 S1 §1–§9 实现面。✓

## 四、承载体可红可绿／零新依赖／promptfoo

- 五闸（S-1／S-2／S-4／G-1／I-2）落点均为真实文件＋**逐条登记可红自证**（fixture 注入或构造非法输入），无永远绿空闸（§8 line 154-158）。✓
- eslint 承载体落点形态**贴现状**（flat `eslint.config.js`、v10、无 eslintrc）实勘一致。✓
- 选型声明「复用已装 vitest 跑 import 图、零新依赖、不引 dependency-cruiser」（§8 line 160）✓；**promptfoo 不引入显式声明**（line 160）✓。

## 五、新发现（v0.2 自身新缺陷）

**CC-01｜中｜§10 出口闸映射漏 C11（I-14 重开挂原单）**
位置：`v1.0.0-s1-detailed-design.md` §10 line 188-195。证据：§10 C 行序列为 C1／C2-C6／C7／C8-C10／**C12**／C13／C14／C15，全文 grep `C11` 零命中（`I-14` 仅见于 §2 line 51）。stage-spec C11＝`tests/unit/delegation.reopen.test.ts`（I-14：delegationId 不变＋reopenCount 单调）是 15 条 S1 不变量之一。影响：v0.1 的旧桶「→C1–C15」名义上覆盖 C11，v0.2 的 L-02 拆桶把 C11 拆丢了——段7 逐条对表时 C11 无落点，属修入自身引入的回归。建议（最小改法）：§10 增一行「`C11 I-14` ｜ §2 Delegation.reject（内部转移 DelegationReopened）＋§9 步5」。

**CC-02｜低｜§10 C9 落点错**
位置：§10 line 191。证据：`C9 I-11 两事件` 与 C8/C10 并桶，落点写「§1 TurnToken＋§2」。I-11（否定事实必有痕）的实现位是 §6（timeline 同事务追加，`timeline.negativeFacts.test.ts`），非 §1 TurnToken。影响：C9 指向错误落点，段7 按此核对会落空。建议：C9 单列，落点改「§6 同事务 append」。

**CC-03｜低｜§10 A 行未列新加 A2.5**
位置：§10 line 181。证据：A 行枚举 A1／A2.1–A2.4，未含 stage-spec 本批新补的 A2.5（`timelineLogger.ts` 归档）。§7/§11 已登记其内容，但出口闸映射表未落 A2.5 行。影响：映射表对 A2.5 无指针（内容不丢，仅登记缺）。建议：A 行补「／A2.5 timelineLogger 归档」。

**CC-04｜低｜EventType 22 联合 vs payload 仅补 17 的 `PayloadOf` 全映射张力**
位置：§6 line 104/130。证据：`TimelineEvent.detail: PayloadOf<type>`，EventType 声明 22 名（line 106），但 payload 类型「S1 未发射 5 事件…随接线阶段补」（line 130）。若 `PayloadOf` 是对全 22 成员的查表类型，5 事件缺 payload 映射将不可编译；需实现为部分映射（未映射→`never`）方能自洽。影响：段6 实现时若按字面全映射会编译失败，或被迫为 5 事件写占位 payload 类型（与「随接线阶段补」张力）。建议：line 130 补一句「`PayloadOf` 为部分映射，5 未发射事件先收口为 `never`/占位，接线阶段替换」。

**CC-05｜低｜§2「仅段3 关键命令为公开命令」与 `Scope.initial()` 例外未标**
位置：§2 line 38 vs line 56。证据：line 38 立规「仅段3 §2『关键命令』列为公开命令」；而 Scope 段3 关键命令仅 `AmendScope`，v0.2 新立 `initial()`（M-01 修入，必要的 S1 v1 声明口）未标为该规的例外。影响：内部小自相矛盾，读者可能误判 `initial()` 越权。建议：line 38 或 line 56 加半句「S1 另设 `Scope.initial()`（v1 声明口，替代 S2 的 AmendScope 出生）」。

**CC-06｜低｜§11 对 A2.5/ADR-028 D3 的措辞与 stage-spec 不完全对齐**
位置：§11 line 205。证据：详设写「stage-spec A2 归档清单需同步补此项，属**段4 小同步**」；而 stage-spec A2.5 明确「**ADR-028 Decision 3 归档清单漏项**…**待用户定**：回 ADR-028 补 Decision 3」。即清单唯一源是 ADR-028 D3、且属待用户裁定项，非「段4 小同步」。影响：把用户裁定项降格为段4 同步，易被误当可自行补。建议：改「…属 **ADR-028 Decision 3 补记**（stage-spec A2.5 已登记，待用户定）」。

**CC-07｜低｜S-1「四聚合」口径 vs eslint glob 覆盖面**
位置：§8 line 154、§7 line 147。证据：判据文字称「禁 import **四**聚合写命令」，而同格 eslint glob 覆盖 `{delegation,turn,queue,evidence,authorization}`＝**5 目录/6 聚合**；且未含 `src/domain/service/*`（`applyChange` 写服务）与 `repos/memory/*` 写面。影响：文字与承载体口径不一致；glob 对 service 写面欠覆盖（主承载体为 vitest 静态测，实际红能力不弱）。建议：判据文字与 glob 对齐为「六聚合写命令＋写服务面」，或注明 glob 为示意、真判据以 `s1WritePath.test.ts` 为准。

## 六、核对通过项（无发现面）

退役词（假推进/沙箱/高危/越界/同签名/仓内/破坏性操作/Round）零命中；无 `mechanism/` 残留；无段3 v1.1 活引用（全文唯 v1.2）；通道命名无与现状 `ipc.ts`/`preload.ts` 冲突（新增均落 `delegation:`/`turn:`/`decision:`/`queue:`/`evidence:`/`timeline:` 新命名）；A2.2 24 名与现状 renderer 逐名吻合；eslint v10／双 tsc 现状陈述与实勘一致。

---

**结论：PASS with findings — 可放行段6。**

理由：21 条修入全部落地且方向正确，段3 v1.2 忠实度（7 聚合／23 仓储方法／3 Spec／22 事件名与载荷键／EvidenceType 四值／§6 同事务例外／I-16 基线）逐条对齐、零改名增删漂移；S2–S7 边界未渗入、产物谓词两条款延 S4 不预绿；五闸可红可绿、零新依赖、promptfoo 不引入声明齐备；无 H 级、无铁律违反、无空闸。唯一中危 **CC-01（§10 漏 C11）** 是 L-02 拆桶时引入的映射表遗漏，不改段3 语义、不影响 stage-spec DoD 实体（C11 仍独立在 stage-spec），故**不阻塞放行**；**建议随放行同批补上 §10 C11 一行**，否则段7 逐条对表会出现「C11 无落点」。CC-02~07 为低危登记项，可同批顺手修（均为 1 行以内）。

（报告结束；未修改任何输入工件，无 commit/push。）
