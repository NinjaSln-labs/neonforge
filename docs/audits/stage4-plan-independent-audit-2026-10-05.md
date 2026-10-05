# 段4 独立审计报告（横切A·command-code）

- 审计员：command-code（异构执行者，非段4 作者）
- 被审面：commit 3c54edd（分支 docs/neonforge-v1.0.0）
- 被审工件：docs/design/v1.0.0-stage-plan.md、docs/design/v1.0.0-metric-event-mapping.md、docs/design/stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md、docs/tests/coverage-matrix.md（仅「## 表 N」小节）
- 判据来源：段0/1/2/3 frozen 工件、ADR-026／027／028、stage-specs/README、AGENTS.md
- 日期：2026-10-05

## 结论：PASS with findings

三份工件整体忠实于上游冻结件，无把新语义就地塞进段4 的越权（铁律②执行正确：产物谓词走了回退段3 v1.1 而非在计划/spec 打补丁）；事件分配、不变量归属、常量唯一源三处机械复算均自洽。但 S1 spec 存在两处实体性缺陷——StallSpec 归属自相矛盾（Spec 计数 4≠实做 3）与 TDD 网格第 16 行在 DoD 无对应断言——会影响 stage-gate 可执行面，需在段4 出口前修掉；其余为状态/体例类低 severity 项。故不判 PASS，也不至 FAIL（可在段4 内闭合，无需回退上游）。

## 发现列表

| 编号 | 严重度 | 位置 | 证据（逐字引文） | 影响 | 建议修法 |
|---|---|---|---|---|---|
| CC-01 | 中 | v1.0.0-stage-plan.md:48／V1-S1-…skeleton.md:109 vs :124／v1.0.0-stage-plan.md:52 | plan S1④「**5 Spec 中 4 个**（RequiresApproval／ValidClaim／Acceptance／**Stall** 之外的 Recoverable 留 S3）」；spec 产出物「5 Spec 中 S1 承担 **4 个**」；spec 边界「**StallSpec**…属 **S5**」；plan S5「StallDetector（**StallSpec**＋周期检视）」 | S1 实际只在 TDD 网格承担 3 个 Spec（行13 RequiresApproval／行14 ValidClaim／行15 Acceptance），文本却称 4 个；StallSpec 被 S1 与 S5 同时声称→归属不唯一，Spec 计数错 1 | 二选一：①把 S1 表述改为「5 Spec 中 3 个（StallSpec 归 S5、Recoverable 归 S3）」；②若确要 S1 立 StallSpec 纯谓词，则在 S1 网格补一行＋DoD 一条，并从 S5 表述中区分「谓词在 S1／检测器在 S5」 |
| CC-02 | 中 | V1-S1-…skeleton.md:100（网格行16）＋全 DoD 段 A–G | 网格行16「ApplyChange→ChangeProduced→证据订阅采集 …tests/unit/applyChange.test.ts」；网格表头自定「**每行在 DoD 有对应断言**」（:81）；全 spec 无任一 DoD 条目点名 applyChange.test.ts 或 ApplyChange 服务 | 行16 测试文件不被任何 DoD 条目引用→stage-gate 逐条执行 DoD 时不会跑它；违 spec 自定规则，属可追溯性断链（事件载荷仍有 B2 兜底，服务行为无 DoD 承载） | 在 C 段补一条 DoD：「ApplyChange 经 AdmissionCheck 通过后产 ChangeProduced 且变更集以 PayloadRef 入证据——tests/unit/applyChange.test.ts（≥N 条）」 |
| CC-03 | 低 | v1.0.0-stage-plan.md:152-153 | `- [ ] S1 stage-spec 详写（stage-specs/V1-S1-…md）`／`- [ ] 表 N 段4 列回填` | 两工件在 3c54edd 均已存在且完整，出口清单却标未勾——状态与实况不符 | 改为 `- [x]`（或注明「已产出、待审计确认」） |
| CC-04 | 低 | V1-S1-…skeleton.md:16（DoD A2.2） | 「具体删除清单以**归档批 commit message 逐条列出为准**」 | A2.2 判定对象由未来工件（commit message）定义，当前不闭合；ADR-028 Decision 3 清单带「等」字→A2 可执行性弱化 | 在本 spec 内固化一份可 `test ! -e` 的路径清单，commit message 只作增量补记 |
| CC-05 | 低 | v1.0.0-metric-event-mapping.md:30 | 「当前态处理｜已收尾后又重开的件：重开期从分母暂时移出，窗满未再重开则回到分母」 | L0 §4 未表述重开件的分母归属，此为段4 新立规则；同件 §2.2② 同类细化都写了「细化声明＋回退路径」，本行只写「唯一源声明…不改口径」，体例不一致且未声明回退/裁定路径 | 补一行与 §2.2② 一致的声明：本规则为可执行化细化，无上游口径则以 L0 §4 为准并回段4 改本行 |
| CC-06 | 低 | v1.0.0-metric-event-mapping.md:37,41,103 vs :53；v1.0.0-stage-plan.md:56（S7 行） | 过程①「分母＝见下方待裁点／**待用户裁定**」；过程②「**段4 细化声明**…本行为可执行化细化」 | 同一类上游缺口（L0 未写分母）处置不对称：①升级用户裁定、②段4 自裁；且 plan S7 行列「过程①问题关闭率」时未标注「未裁前不得开工」（mapping §5 已登记） | 在 plan S7 行补前置裁点提示；或报告层说明②的自裁已声明可回退、不构成双源 |
| CC-07 | 低 | v1.0.0-stage-plan.md:48（S1③）vs V1-S1-…skeleton.md:109 | plan「③**六聚合**薄实现（Delegation／Turn＋TurnToken／InstructionQueue／DecisionPoint／EvidenceItem／Scope…）」；spec 产出物「7 聚合」 | 聚合计数表述不一（TimelineLog 机制聚合是否计入含糊），易被下段误读 | 统一为「6 业务聚合＋TimelineLog 机制聚合（B 节）＝7」的显式写法 |

> 无「高」severity 项。CC-01／CC-02 均属段4 工件内部可修，无需回退段0–3，不触发铁律②。

## 机械复算结果

**1. 22 事件首次发射分配（plan §5）**
- S1＝17、S2＝1（ScopeAmended）、S3＝2（SessionInterrupted、DelegationRestored）、S5＝2（StallDetected、DelegationAbandoned）；S4/S6/S7＝0。
- 合计 17＋1＋2＋2＝**22** ✓，与段3 §5 目录 22 名逐一比对：无重复、无遗漏（S1 恰排除 S2/S3/S5 的 5 个事件）。
- 映射表 §4 度量面 22 行：有用途 15＋无用途 7（InputAcknowledged、TurnStarted、TurnEnded、DecisionResolved、ChangeProduced、DelegationClosed、InstructionAdmitted）＝22 ✓，与自述一致。

**2. 不变量／结构检查项归属计数（plan §4）**
- I-1–I-17 首立：S1 十四条（I-1,2,3,4,5,6,7,9,10,11,13,14,15,16）＋S2 两条（I-8,17）＋S3 一条（I-12）＝**17** ✓；每条恰一个首立阶段，无两阶段同时声称 ✓；S4/S5 无首立（仅扩面）✓。
- S-1–S-4：S1 三条（S-1,S-2,S-4）＋S2 一条（S-3）＝**4** ✓；G-1 单列不计入 ✓。

**3. S1 spec TDD 网格行数与拆分阈值**
- 网格行数＝**20**（编号 1–20）；plan §3 警语阈值＝「>20 行才拆」⇒ 20 不触发拆分 ✓。

**4. 网格行 ↔ DoD 断言对应率**
- 20 行中 **19/20** 行的测试文件在 DoD 段有对应断言；行16（tests/unit/applyChange.test.ts）例外（CC-02）→ 对应率 **95%**。

**5. 表 N 引用 S1 spec 的 DoD 条目号命中率**
- 被引条目：A5、A6.3、B1–B3、C1–C13、C2、C3、C4、C6、C7、C9、C13、D1–D3、E1–E3、F1、F2。
- 全部存在 → **命中率 100%**（无悬空引用）。表 N「测试（段7）」列 13 轴全部 ⏳ ✓（未预绿）。

**6. 预绿／桩红抽检**
- S1 spec DoD 全 `- [ ]`，头部「开工日期：未开工」✓。
- I-16 产物谓词条款 plan/spec 均标 S4、spec C13 用 it.todo 登记缺口、ADR-027 Decision 5 要求 S1 边界登记——三处一致，未预绿 ✓。
- I-11 四事件闭集收口 S5、I-13 全恢复点 S5 扩面、S-3 属 S2、表 N 段7 列——四处与实况相符 ✓。
- 发现：plan §10 勾选态与两款已存在工件不符（CC-03）。

**7. 常量唯一源抽检**
- 卡滞窗阈值：唯一源＝映射表 §3（120s）；段2 §4/段3 §8 声明"段4 校准"，plan §8/§3 均引用本表——无第二处定义 ✓。
- 二次委托率 7 天窗：唯一源＝L0 §4；改值回退路径「回段1 重裁」已声明 ✓。
- 过程①分母：标注「待用户裁定」，未被任何其他工件当已裁使用 ✓。
- 过程②分母：段4 自裁但声明回退（CC-05/06，体例不一致，非双源）。

## 六面逐面小结

- **①忠实性**：未发现"上游没有的谓词/事件/指标口径"被当作已定事实引入。G-1（ADR-028 授权）、卡滞窗 120s（上游显式委托段4 校准）均属合法落点；产物谓词正确走铁律②回退段3 v1.1。存疑细化仅 CC-05。
- **②可执行性**：DoD 绝大多数为「完整命令」或「行为断言＋测试文件路径＋用例下限」，无散文式"完成 XX"，无复制门禁输出（A6 反明写"新鲜命令证据，不复制历史输出"）；例外＝A2.2 判定对象外延（CC-04）、行16 缺 DoD（CC-02）。
- **③计数自洽**：事件 22／不变量 17＋4／网格行 20 均自洽；两处失配＝Spec 计数 4 vs 实做 3（CC-01）、网格行↔DoD 19/20（CC-02）。
- **④预绿/桩红**：核心 S1 面未见预绿；I-16/I-11/I-13/S-3/表N 段7 列均正确；仅 plan §10 勾选态失真（CC-03）。
- **⑤常量唯一源**：卡滞窗、7 天窗、②分母唯一源互斥且无第二处定义；①分母待裁项未被当已裁；改值回退路径已声明。体例不一致＝CC-05/06。
- **⑥射程与边界**：S1–S7 边界列完整覆盖 N1–N5、L0 §6 6a/6b、§3 不进 V1 项与射程外清单；ADR-028 归档面/复用面/G-1 与段0 C1、段1 §9「工程实体不变＋版本唯一源」相容；G-1 在 ADR-028/plan/spec 三处均显式写为"段4 新建、非段3 S-1 修订"，未被误写 ✓。

## 未覆盖面声明

1. **仓库实况未核**：legacy-freeze-v0.1.0 tag 是否已建、apps/desktop 归档路径与 45 文件/769 用例/59 事件等勘查数字是否与现场一致——本次仅作文本层审计，未执行 git/ls 核验（输入限定只读工件）。
2. **ADR 索引未读**：ADR-027/028「索引两行」是否落地（plan §10:150 标 [x]）无法核实。
3. **段3 回补增量复审报告未读**：ADR-027 Decision 3 要求的报告是否存在于 docs/audits/ 无法核实。
4. **技能与经验层未读**：pipeline-0to1／stage-gate／agent-dispatch、ARCHIVE-INDEX 不在输入，未作依据。
5. **业务合理性不可判**：120s 卡滞窗、7 天窗维持、过程①②分母的"业务/统计合理性"无数据可判，仅审其"唯一源声明与回退路径"的形式合规。
6. **表 0.7–表 10（旧树面）未审**：按任务限定只审「## 表 N」小节。

## 越界引用声明

本报告未引用输入清单外文件作为依据。检索中工具的全局命中（如旧树 S2.md–S6.md）未被采信为判据，仅据以确认"旧树 spec 与新树命名不冲突"这一非决定性观察。

---

## 主会话采纳意见（署名，横切A 出口）

采纳人：主会话（段4 作者本人；本件作者＝异构执行者 command-code，符合 ADR-026 铁律③「不自审」）。采纳日期：2026-10-05。
说明：审计员会话无文件写权限，其报告全文由 stdout 逐字转入本件（含其自身的「无法落盘」声明），来源可溯；结论与发现列表未经改写。

**七条全采纳（CC-01／CC-02 中危在段4 出口前修掉，无需回退上游，不触发铁律②）：**

| 编号 | 采纳 | 处置（落点） |
|---|---|---|
| CC-01（中） | **采纳·选项①** | S1 表述由「5 Spec 中 4 个」改为「**3 个**（RequiresApproval／ValidClaim／Acceptance）」，StallSpec 归属唯一＝**S5**、RecoverableSpec＝S3。落点：计划 §3 S1 行④＋S1 spec 产出物节。不采纳选项②（S1 立 StallSpec 纯谓词）——理由：StallSpec 的判据对象是「窗内零新事件＋在飞轮存在」，S1 既无 StallDetector 也无卡滞态轮次（属 S5），立了也无可执行断言，违反「登记不桩红」 |
| CC-02（中） | **采纳** | 新增 DoD **C15**（ApplyChange 领域服务契约：ChangeProduced 载荷／证据域订阅采集⇒Provenance＝系统采集∧EvidenceType＝变更集／未过 AdmissionCheck 副作用计数＝0／evidenceId 去重，`tests/unit/applyChange.test.ts` ≥4 条）；C 节标题改为「C1–C14＝14 条不变量；C15＝领域服务契约」，网格行↔DoD 对应率回到 20/20 |
| CC-03（低） | **采纳** | §10 出口清单勾选态对齐实况：S1 spec 与表 N 回填改 `[x]`（两工件在 `3c54edd` 已存在且经本审计核过），并补「审计发现修入」一行逐条列 CC/M 处置 |
| CC-04（低） | **采纳** | A2.2 由「以归档批 commit message 为准」改为**本件内固化 24 文件清单**（逐个 `test ! -e`），commit message 降为增量补记；同格补**保留面反向断言**（`icons.tsx`／`styles.css`／`diffRender.ts`／`ConfigPage.tsx` 复用＋壳入口 `main.tsx`／`index.html`／`App.tsx`／`types.d.ts`／`assets/` 就地重写）。清单经现场 `ls`＋renderer import 图核实；连带 ADR-028 D3（清单唯一源指向本 spec）与 D4（`ConfigPage.tsx` 为凭据配置 UI、非对话中心，补入复用面；壳入口既非归档也非原样复用）与计划 §2 第 4 项同步 |
| CC-05（低） | **采纳** | 映射表 §2.1「当前态处理」行补与 §2.2② 同体例的**段4 细化声明＋回退路径**（L0 §4 未表述重开件分母归属；若用户另有口径以 L0 §4 为准并回段4 改本行） |
| CC-06（低） | **采纳（两项都做）** | ①映射表 §2.2 待裁点后新增「**①／② 处置不对称的理由**」段：差别在是否触碰 L0 明文意图——②纯细化无相邻表述，①的案 B 与 L0 §4「避免退化为'1−放弃率'」正面相左⇒只能由 L0 裁定方决；②的自裁带可回退声明，不构成第二口径源。②计划 §3 S7 行依赖列补「**过程①分母裁定已下**（未裁前本阶段不得开工）」 |
| CC-07（低） | **采纳** | 统一为「**6 业务聚合＋TimelineLog 机制聚合＝段3 7 聚合**」的显式写法（计划 §3 S1 行③＋S1 spec 产出物节），消除 TimelineLog 是否计入的含糊 |

**未覆盖面的主会话现场补核（审计员声明未核者）：**

1. **仓库实况**：`git tag -l` 现只有 `v0.1.0`——`legacy-freeze-v0.1.0` **尚未建**，符合预期（建 tag 是 S1 归档批动作＝DoD A1，段4 不预先执行）。旧注册表事件数经现场复算＝`TIMELINE_EVENT_SPECS` 键 **56** 个、`TimelineEventType` 联合成员 **56** 个（ADR-028/spec 写的「~56」为精确值）；`tests/unit` 文件数＝**45**（与 A2.3 一致）；`apps/desktop/e2e-*.mjs`＝**6**（与 A2.4 一致）。L1 基线 **769 用例**沿用段4 开工勘查记录、未在本批重跑——该数非判据承重项（A4 的判据是「新树用例 ≥60 且全部来自网格登记文件」，旧基线只作归零对照），S1 归档批现场重测。
2. **ADR 索引两行**：`docs/decisions/000-decision-log.md` 已含 027／028，状态均 `accepted｜2026-10-05`——§10 该项 `[x]` 成立。
3. **段3 回补增量复审报告**：已入库＝`docs/audits/stage3-domain-tactics-v1.1-increment-reaudit-2026-10-05.md`（异构执行者 mcode，PASS with findings，M-01–M-03 全采纳），ADR-027 Decision 3 的报告路径已指向该文件。
4. 技能面／经验层／旧树表 0.7–表 10 未审：属审计任务书限定范围，其结论不依赖这些面；旧树 spec 命名冲突已在计划 §7 以 `V1-` 前缀规避。
5. 业务合理性（120s 卡滞窗、7 天窗维持、①②分母）不可判：与主会话立场一致——本批只主张「唯一源＋回退路径」的形式合规，统计合理性由 dogfooding 期数据触发重估（映射表 §3 重估触发器），①分母已升级为用户待裁点。

结论：**段4 工件面过闸**（PASS with findings，七条全采纳并已修入）。无高危项、无铁律②违规、无需回退段0–3。段4 就此出口，待用户裁定**四项**（t000088：①过程①分母 案A/案B；②产物合取谓词「其验证结果」半边是否补全＝mcode M-02 升级项；③ADR-028 D7 旧树票作废提案；④本地领先远端 10 commit 是否推送）与本审计结论亲裁后进入段5／S1。
