# Stage V1-S2 Spec（授权拍板域深化）

> 来源：`docs/design/v1.0.0-stage-plan.md` §3 S2 行（阶段计划）＋§4 不变量映射（I-8／I-17／S-3 首立＝S2，I-3／I-7 扩面＝S2）＋§5 事件映射（ScopeAmended 首射＝S2）＋`docs/neonforgeV1.0.0/03-domain-tactics.md`（段3 frozen v1.3）＋`docs/design/v1.0.0-s1-detailed-design.md` §11（S2 钩子：ScopeAmended 首射＋作用域修正）＋ADR-029；开工日期：**2026-10-06**（用户放行 S2，段5 spec 先行）
>
> 尺寸核：TDD 网格 **13 行** < 计划 §3 拆分警语阈值（>20 行才拆），未触发拆分。若段5 详设后网格需增行，按警语拆 S2a／S2b 并在本头部登记＋记 handoff（属计划细化，非设计变更，不触发铁律②回退）。
>
> 上游登记针（本 spec 必须消化，不得再延后）：S1 出口异构审计 **F-2** 的处置＝「登记 coverage-matrix 表 N 轴 1/6 注记『C1 E2E 跨层延后 S2』」（`docs/audits/s1-exit-heterogeneous-audit-2026-10-05.md`）⇒ 落本件 **E5**；S1 期 `Scope.ts` 的 `ponytail:` 天花板「正式 glob 语义随 S2 作用域修正批落地」⇒ 落本件 **A7**。
>
> **【段6 拆分登记 2026-10-06】**：段6 writing-plans 任务级拆解 **17 个任务 > 15**（S2a 九项＝版本链／amend 前置／正式 glob／③类翻转／ScopeAmended 接线／仓储面断言／词表断言／S-3 闸／applyChange 删占位；S2b 八项＋出口闸＝`rt.amendScope` 同事务／两通道＋raise 的 main 侧 id 归位／桥／派生／`ScopePanel`／`DecisionCard` 留痕／L3 八针＋夹具／F1–F11）→ 按上条警语拆 **S2a／S2b**，两份 plan 落 `docs/superpowers/plans/2026-10-06-s2a-authorization-kernel.md`／`2026-10-06-s2b-wiring-presentation-gate.md`。边界＝**S2a**：`src/domain/**`＋`tests/static/**`＋域内 L1（新增 32 条，出口自证跑相关文件与双 tsc）；**S2b**：`src/main/**`＋`preload`/`types.d.ts`＋`src/renderer/**`＋L3（新增 9 条，含 B2 同事务两条）＋**S2 全出口闸在此单次过**（F1–F11）。DoD 条目 A–F 实体不变、不重分配，仅执行子批划分（属计划细化，非设计变更，不触发铁律②回退）。
>
> 术语纪律：本件名词以段2 §4 语言表为谓词源；判据形态引段3 §4「违反时行为」列不复制条文；实现文件**签名／通道命名／闸承载体形态**归段5 详设，本件只给落点目录与测试文件名。

## DoD（机器可验证断言——stage-gate 逐条执行）

### A Scope 版本链与 AmendScope（段3 §2／§4 I-8／I-17；详设 §2「Scope S1 仅 initial()」的 S2 面）

- [ ] A1 **I-8 版本单调**：AmendScope 产生的新版本 `seq` 严格递增；乱序或重复 `seq` 的追加被拒（违反时行为＝修正拒绝）——`tests/unit/scope.versionChain.test.ts`（≥4 条）
- [ ] A2 **I-8 决议绑定**：每个新版本**恰绑**一个已决 DecisionPoint（`ScopeVersion.amendmentRef` 非空，且指向缘由＝作用域修正的已批准决议）；同 `decisionPointId` 二次修正＝拒绝或幂等，**不产第二个版本**——同文件（≥3 条）
- [ ] A3 **I-8 旧版本只读可溯**：修正后整条版本链可读，旧版本 `entries` 内容逐字不变（VO 不可变）；就地改写旧版本的代码路径命中数＝0（静态断言，与 S-1 同族承载体）——同文件（≥2 条）
- [ ] A4 **I-17 无决议不产版本**：AmendScope 前不存在「缘由＝作用域修正 ∧ 已批准」的 DecisionPoint ⇒ 命令拒绝（类型化 DomainError，理由进命令回执、**不进 timeline**，段3 §5 留痕口径），且**不发射 ScopeAmended、仓储 save 不发生**——`tests/unit/scope.amend.test.ts`（≥4 条：无决议／决议未决／决议为拒绝／批准后放行）
- [ ] A5 **批准权仅用户**（段2 X8：AI 可提请，批准权仅用户）：`requestedBy＝AI 提请` 只产生 DecisionRaised，版本链长度不变；版本推进的唯一触发面是**用户侧动作**＝批准该决议 ∧ 其后提交 `scope:amend`（案 A 两步流，ADR-030；批准本身不自额推进版本）——`tests/unit/scope.amend.test.ts`（≥2 条）＋ E2 呈现侧一针
- [ ] A6 **仓储面不变**（段3 §7 ScopeRepo 行 v1.3／详设 §3：版本只追加＝聚合内部不变量，追加面随 S2 仍由聚合承载、仓储面不变）：ScopeRepo 方法名集合仍＝`save`／`findByDelegation`，未被就地扩——`tests/unit/scope.repoSurface.test.ts`（≥1 条，防就地扩上游冻结件）
- [ ] A7 **正式 glob 语义落地**（`src/domain/authorization/Scope.ts` 的 `ponytail:` 天花板在本阶段偿清）：`covers()` 除 `**`／尾随 `/**`／字面相等外的正式 glob 命中判据成立（正反例各覆盖，形态归段5）——`tests/unit/scope.covers.test.ts`（≥6 条）＋ S1 现有 `tests/unit/requiresApproval.test.ts` 全数回归不红

### B ScopeAmended 首射（计划 §5 S2 行＝1 事件；详设 §6 CC-04 接线位）

- [ ] B1 载荷键与段3 §5 逐字相等（**禁增禁减**）：`ScopeAmended` 键集＝`delegationId`、版本对（旧→新）、`decisionPointId`；`ScopeAmendedPayload` 由 `never` 换为具名类型——`tests/unit/timeline.payloadKeys.test.ts` 扩至 **18 事件**（S1 的 17＋本阶段 1）
- [ ] B2 **同事务**：决议批准 ⇒ `Scope` 版本写入与 `ScopeAmended` append 同事务；append 失败⇒整事务回滚（版本链长度不变，段3 §6 例外条款，与 S1 B3 同族）——`tests/unit/scope.amend.test.ts`（≥2 条）
- [ ] B3 **闭集仍 22、余 4 事件不预绿**：`StallDetected`／`SessionInterrupted`／`DelegationRestored`／`DelegationAbandoned` 载荷类型保持 `never`（接线阶段＝S5／S3），事件名集合仍与段3 §5 逐名相等——`tests/unit/timeline.eventCatalog.test.ts` 回归绿
- [ ] B4 发布纪律回归：ScopeAmended 同样先 `TimelineRepo.append` 再进程内只读分发；对外发布通道命中数＝0（L0 原则6）——`tests/unit/timeline.publishDiscipline.test.ts` 回归绿

### C RequiresApprovalSpec 全外延（段3 §8 三类外延；I-7 扩面＋I-3 扩面）

- [ ] C1 **③类翻转**：操作类别＝作用域修正 ⇒ 谓词 `true`（S1 面 `return false` 的分支在本阶段判真）；类别闭集仍三类不多不少——`tests/unit/requiresApproval.test.ts`（≥3 条新增）
- [ ] C2 **全外延并集**：作用域外 ∪ 高影响清单命中 ∪ 作用域修正 任一为真 ⇒ `true`；三者皆否（作用域内∧未命中清单∧非修正）⇒ `false`——同文件真值表用例（≥6 条）
- [ ] C3 **I-7 扩面回归**：三类命中的操作在决议＝批准前**副作用计数＝0**（校验先于产出）；未过闸转 RaiseDecision，且缘由＝作用域修正的决策点仍守 I-3 归属唯一——`tests/unit/requiresApproval.test.ts` ＋ `tests/unit/decisionPoint.test.ts`（缘由三值各一条归属用例，≥3 条新增）
- [ ] C4 谓词扩面**不动写路径**：S-1／S-2 静态闸回归绿——`tests/static/s1WritePath.test.ts`、`tests/static/s2ProviderName.test.ts`

### D S-3 高影响操作清单唯一源闸（段3 §4 S-3 行；计划 §4「首次立判据＝S2」）

- [ ] D1 **CI diff 逐字比对**：实现侧只读配置源（`src/domain/authorization/highImpactList.ts` 的枚举面）与段2 §4 语言表「高影响操作清单」行＋附录 A 枚举**逐字相等**——多一条／少一条／改一字即红；比对目标从 `docs/neonforgeV1.0.0/02-domain-strategy.md` 现文解析（**测试内不得复制清单当第二源**）——`tests/static/s3HighImpactList.test.ts`（≥1 条，形态归段5）
- [ ] D2 **可红自证**：fixture 注入一条不在附录 A 的条目 ⇒ 判红（沿 S1 A5.2 纪律，不留永远绿的空闸）
- [ ] D3 清单**扩展必经用户裁定**（段2 §4 该行）：本阶段实现内条目数不因实现需要而变；任何增删条目须回段2 改语言表（铁律②），本件不预开扩展口

### E 决策点族呈现完整化（L3；计划 §3 S2 行产出物「授权域模块＋呈现」）

- [ ] E1 **缘由三值可见**：作用域外／高影响清单命中／作用域修正 三类拍板卡在 UI 各有可见位置，呈现层不得吞项——`tests/interaction/decisionCard.interaction.ts`（≥3 条）
- [ ] E2 **决议留痕可见**：批准／拒绝／选项 三值决议后卡片呈决议态；拒绝携理由时理由可见（理由可选，无值不得渲染空占位）；A5 的用户批准路径在本针可见（版本随「批准 ∧ 用户提交修正」推进＝案 A 两步流，ADR-030）——同文件（≥2 条）
- [ ] E3 **作用域版本可溯呈现**：修正后当前版本可读、旧版本只读可查（I-8 只读可溯的呈现侧最小面）；未持久化态显式呈现不红（S1 F2 回归）——`tests/interaction/delegationLifecycle.interaction.ts`（≥1 条）
- [ ] E4 `npx playwright test --project=interaction` **全绿**，本阶段新增用例 **≥8 条**
- [ ] E5 **F-2 登记针偿清**（S1 出口审计→表 N 轴 6「C1 E2E 跨层延后 S2」）：忙时发起（在飞位占用）⇒ 拒方输入 ⇒ QueueList 出现可见位置的**端到端**断言入 `tests/interaction/delegationLifecycle.interaction.ts`（≥1 条）；补上后本阶段真轨 E2 仍按 blocked 处理（三缺口未认领，见边界）

### F 段6 闸与状态类断言（逐条列，不合并）

- [ ] F1 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`（cwd `apps/desktop`）→ **0 error**
- [ ] F2 `npx vitest run`（cwd `apps/desktop`）全绿，本阶段新增用例 **≥ 40 条**（下限＝A 组 22＋B 组 4＋C 组 12＋D 组 2；E 组 8 条走 playwright 不重复计数；逐行映射见 TDD 网格），且全部来自本 spec 网格登记的新树测试文件
- [ ] F3 `npx eslint .` → 0 error
- [ ] F4 `python3 tools/desens-scan.py`（仓库根）→ rc=0
- [ ] F5 **G-1 归档防回流**：`tests/static/noLegacyImport.test.ts` 回归绿；自 S1 出口起该闸转「归档路径不得重现」的同源断言（计划 §4 G-1 扩面列），**本阶段不另立新闸**
- [ ] F6 `docs/tests/coverage-matrix.md` 表 N：S2 承担行回填（轴 4 贯通面、轴 7 的 S2 列＝I-8／I-17／S-3、轴 6 的「C1 E2E 跨层延后 S2」注记转 ✅）；**S3–S7 承担的行保持 ⏳，不得预绿**
- [ ] F7 本 spec 的 `- [ ]` 全数勾绿或显式标 blocked＋理由（无沉默未跑项）；`stage-gate` 逐条留**本会话新鲜命令输出**
- [ ] F8 决策日志同步：S2 内语义裁定→`docs/decisions/` 出 ADR＋索引行；无裁定则本项记「无」，不留空
- [ ] F9 handoff CLI 落账：S2 闸结果、新增 pitfall、`next` 指向下一活；`exit`／`summary` 先 `--dry-run` 再整槽覆写
- [ ] F10 代码与工件已 commit 到工作分支（Conventional Commits，经 lefthook→lint-staged）；**push 与 CI 绿以用户显式授权为前提**——未授权时本项登记 blocked（不判红、不预绿）
- [ ] F11 出口异构审计：按 agent-dispatch 派**非当前主同源**的强模型执行者出报告 → `docs/audits/`，主会话署名采纳逐条复核，**结论由用户亲裁**（AGENTS.md 流程3）；审计者不复现得出的项由主会话补实测（沿 S1 F-6 纪律）

## TDD 网格（本阶段新增功能——spec-first + test-first；每行在 DoD 有对应断言）

| # | 功能 | 规范断言（来源） | 失败测试（红） | 实现（绿） | 重构 |
|---|---|---|---|---|---|
| 1 | Scope 版本链单调与绑定 | 段3 I-8；§2 Scope 聚合 | `tests/unit/scope.versionChain.test.ts` | `src/domain/authorization/Scope.ts` 追加命令面（签名归段5） | 追加只走聚合，Repo 不理解版本链（段3 §7） |
| 2 | AmendScope 命令前置 | 段3 I-17；段2 X8（U3 裁定） | `tests/unit/scope.amend.test.ts` | AmendScope 必经已批准决策点；拒绝理由走命令回执 | 与 S1 `Scope.initial()` 出生口统一为同一版本链构造路径（CC-05 正解） |
| 3 | 批准权仅用户 | 段2 §1.1 X8 发起者列 | `tests/unit/scope.amend.test.ts`（AI 提请不推进） | requestedBy 分支只提请不修正 | 提请／批准两点合一处判定，避免两处授权口径 |
| 4 | 同事务追加与回滚 | 段3 §6 例外条款；I-2 | `tests/unit/scope.amend.test.ts`（append 失败面） | Scope 写入＋ScopeAmended append 同事务 | 与 S1 TimelineRepo 事务包装共用，不新建事务层 |
| 5 | ScopeAmended 载荷类型接线 | 段3 §5 键集；详设 §6 CC-04 | `tests/unit/timeline.payloadKeys.test.ts`（18 事件） | `ScopeAmendedPayload` 具名类型替换 `never` | 余 4 事件保持 `never`，接线阶段不提前 |
| 6 | `covers()` 正式 glob 语义 | Scope.ts `ponytail:` 天花板；段2「作用域」行 | `tests/unit/scope.covers.test.ts` | 正式匹配语义（形态归段5） | 删天花板注释，保留可读的反例用例 |
| 7 | RequiresApprovalSpec 全外延 | 段3 §8／I-7；段2 §4「须拍板操作」谓词 | `tests/unit/requiresApproval.test.ts`（真值表） | ③类翻转＋三类并集 | 谓词单一执行点，AmendScope 前置不另写一套判定（防双源） |
| 8 | 决策点缘由三值归属 | 段3 I-3；RequestReason VO 三值 | `tests/unit/decisionPoint.test.ts` 扩 | 缘由＝作用域修正走同一 I-3 守卫 | 三值枚举单源＝`RequestCause`，呈现侧不另列文案表 |
| 9 | S-3 高影响清单唯一源闸 | 段3 §4 S-3；段2 §4 附录 A | `tests/static/s3HighImpactList.test.ts`（＋fixture 自证可红） | CI diff 比对承载体（形态归段5） | 配置源不复制清单文本，只引唯一源路径 |
| 10 | 决策点族呈现完整化 | 计划 §3 S2 行；段2 X1a/X2 | `tests/interaction/decisionCard.interaction.ts` | 缘由三值可见＋决议留痕＋拒绝理由 | 复用 S1 `DecisionCard.tsx`，不新开卡片组件族 |
| 11 | 作用域版本可溯呈现 | 段3 I-8（旧版本只读可溯） | `tests/interaction/delegationLifecycle.interaction.ts` | 当前版本＋旧版本只读可查 | 走既有只读投影通道，不新增写通道（S-1） |
| 12 | C1 E2E 跨层一针（F-2 登记） | 表 N 轴 6 注记；段3 I-1 | `tests/interaction/delegationLifecycle.interaction.ts`（忙时发起→QueueList 可见） | 端到端串接断言 | 与 S1 L1／IPC 双断言同源，不重复编码语义 |
| 13 | 静态闸与闭集回归 | 段3 S-1／S-2；G-1；I-2 | `tests/static/{s1WritePath,s2ProviderName,noLegacyImport}.test.ts`＋`tests/unit/timeline.eventCatalog.test.ts` | 回归（无新增实现） | 不新增闸、不改 glob 承载体（计划 §4 扩面纪律） |

## 产出物

- [ ] `apps/desktop/src/domain/authorization/**`：Scope 版本链追加面＋AmendScope 命令面＋RequiresApprovalSpec 全外延（**模块签名归段5 详设**，本件只锁落点目录）
- [ ] `apps/desktop/src/domain/timeline.ts`：`ScopeAmendedPayload` 接线（`never` → 具名类型），事件闭集仍 22
- [ ] `apps/desktop/src/domain/spec/requiresApproval.ts`：③类作用域修正分支落地
- [ ] `apps/desktop/src/main/**`、`src/renderer/**`：授权域接线与决策点族呈现完整化（通道命名归段5）
- [ ] `apps/desktop/tests/unit/**`：`scope.versionChain`／`scope.amend`／`scope.repoSurface`／`scope.covers`／`requiresApproval`（扩）／`decisionPoint`（扩）／`timeline.payloadKeys`（扩至 18）＋回归面
- [ ] `apps/desktop/tests/static/s3HighImpactList.test.ts`：S-3 承载体（含可红 fixture）
- [ ] `apps/desktop/tests/interaction/**`：`decisionCard.interaction.ts`（扩）＋`delegationLifecycle.interaction.ts`（E3／E5 两针）
- [ ] `docs/design/v1.0.0-s2-detailed-design.md`：段5 详设（本 spec 的下游，签名／通道／闸形态在此定）
- [ ] `docs/superpowers/plans/`：S2 任务级拆解（writing-plans，开工前出，任务不得超出本 DoD 边界）
- [ ] `docs/tests/coverage-matrix.md` 表 N 的 S2 行回填
- [ ] `docs/audits/`：S2 出口异构审计报告一件
- [ ] handoff 落账：闸结果／pitfall／`next`（写入口＝project-handoff CLI）

## 边界（不做——防蔓延）

- 决策点**作废**路径（DelegationAbandoned 的事件驱动消费）属 **S5**（计划 §3 S2 行边界列）。
- I-15 卡滞期待指令期准入窗属 **S5**；S2 只保留 S1 的拒绝待决期守卫不红。
- 持久化与崩溃恢复属 **S3**：S2 仍为**内存态**；RecoverableSpec／SessionInterrupted／DelegationRestored／I-12 一律不做，ScopeAmended 的重放面随 S3 落。
- 证据三类型载荷（命令输出／测试结果／验收判据运行结果）、**产物谓词两条合取条款**（ADR-027 D1＋D6）、S-4 全覆盖回归属 **S4**。
- StallDetector／StallSpec／卡滞与催弃路径／deriveWaitingItems 收束态过滤属 **S5**。
- 等待项四类与焦点的**完整呈现义务**、对话通道按 delegationId 过滤、S-1 全量呈现面覆盖属 **S6**；S2 只补决策点族与作用域版本的最小可溯呈现（E1–E3）。
- 三层指标计算与比率口径属 **S7**；S2 只保证 ScopeAmended 按段3 §5 键集正确发射。
- **E2 真轨三缺口不认领**（详设 §11／t000104 用户批准回退登记）：①工具执行链接入委托单中心、②对话/输入入口、③`nextChangeSet` 真适配器——建议 ①③→S4、②→S6；改判须回段5 改详设 §11 并同步本件，不在段6 就地打补丁（铁律②／禁跨段）。真轨 `describe.skip` 保持 blocked 注记，**不判红不预绿**。
- 高影响操作清单**不得就地扩展**（段2 §4：扩展必经用户裁定）；S-3 闸只判「与唯一源相等」，不判「够不够全」。
- 正式 glob 语义**只偿清 Scope.ts 已登记的天花板**，不扩为通用路径匹配库（不引新依赖）。
- 任务级拆解（bite-size 步骤＋代码）不在本 spec：开工前按 writing-plans 出，落 `docs/superpowers/plans/`。
