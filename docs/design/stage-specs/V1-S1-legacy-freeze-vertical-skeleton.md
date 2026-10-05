# Stage V1-S1 Spec（冻结归档＋垂直骨架）

> 来源：`docs/design/v1.0.0-stage-plan.md` §3 S1 行（阶段计划）＋`docs/neonforgeV1.0.0/03-domain-tactics.md`（段3 frozen v1.1）＋ADR-027／ADR-028；开工日期：**未开工**（spec 先行，段4 定稿 2026-10-05；S1 实际开工日于段6 启动时回填本行）
>
> 尺寸核：TDD 网格 **20 行**＝计划 §3 拆分警语阈值（>20 行才拆 S1a/S1b）的下限，未触发拆分。若段5 详设后网格需增行，按警语拆 S1a（领域内核＋归档）／S1b（真网关＋最简呈现），拆分登记于本头部并记 handoff（属计划细化，非设计变更）。
>
> 术语纪律：本件名词以段2 §4 语言表为谓词源；判据形态引段3 §4「违反时行为」列不复制条文；实现文件**签名**归段5，本件只给落点目录与测试文件名。

## DoD（机器可验证断言——stage-gate 逐条执行）

### A 归档批（ADR-028）

- [ ] A1 基线 tag 存在且可调阅旧实现：`git rev-parse legacy-freeze-v0.1.0` 返回 sha，且 `git show legacy-freeze-v0.1.0:apps/desktop/src/domain/conversationState.ts | wc -l` > 0（轻量 tag，无署名面）
- [ ] A2 归档清单已移出工作树（cwd `apps/desktop`，全部 `test ! -e` 通过；清单＝ADR-028 Decision 3）：
  - [ ] A2.1 旧领域：`src/domain/conversationState.ts`、`src/domain/agentLoop.ts`、`src/domain/protocolTools.ts`、`src/domain/planProposalParser.ts`、`src/domain/completionClaimParser.ts`
  - [ ] A2.2 旧呈现（对话中心面，**24 文件逐个 `test ! -e`**；renderer 为扁平结构无 `components/` 层；清单经现场 `ls`＋import 图核实固化于本件，归档批 commit message 只作**增量补记**不再定义外延）：`src/renderer/` 下 `ConversationPanel.tsx`、`CandidateButtons.tsx`、`DeliveryPanel.tsx`、`DigitalDeliveryPanel.tsx`、`DoDAlignPanel.tsx`、`OutputPanel.tsx`、`SessionPanel.tsx`、`StartPage.tsx`、`TrustLadderPanel.tsx`、`SettingsPanel.tsx`、`MainWorkspace.tsx`、`FileTree.tsx`、`scenes.tsx`、`authModel.ts`、`candidates.ts`、`demoBridge.ts`、`errorClassify.ts`、`problemStore.ts`、`sessionStore.ts`、`sysPrompt.ts`、`systemNudge.ts`、`textClean.ts`、`useConversationState.ts`、`useToolApproval.ts`
    - **不删（保留面，`test -e` 反向断言）**：复用原语 `icons.tsx`／`styles.css`／`diffRender.ts`（ADR-028 Decision 4）；凭据配置 UI `ConfigPage.tsx`（非对话中心，S1 真网关移植需要它，ADR-028 Decision 4 同批登记）；壳与入口 `main.tsx`／`index.html`／`App.tsx`／`types.d.ts`／`assets/`（S1 ⑥ **就地重写**为委托单中心，不属归档面）
  - [ ] A2.3 旧测试：`tests/unit/**`（旧 45 文件全数）、`tests/interaction/**`、`tests/visual/**`、视觉基线目录 `snapshots/**`（`playwright.config.ts` 的 `snapshotDir: './snapshots'`，即 `apps/desktop/snapshots/`，**不在 tests/ 下**）
  - [ ] A2.4 旧 UAT/e2e 面：`scripts-cdp/`、`e2e-*.mjs`（6 个，均在 `apps/desktop/` 下，非仓库根）、`e2e-sim/`
- [ ] A3 复用面已移植且**未反向依赖归档文件**：G-1 静态闸对当前树判绿（见 A5），复用清单＝ADR-028 Decision 4（`main.ts`／`preload.ts`／`gateway.ts`＋`providers/**`／`configStore.ts`＋`envManager.ts`／`applyDiff.ts`＋`workspace.ts`＋`sandboxPath.ts`＋`diffRender.ts`／`styles.css`＋`icons.tsx`＋`ConfigPage.tsx`（凭据配置 UI））
- [ ] A4 **L1 基线诚实重建**：`npx vitest run`（cwd `apps/desktop`）全绿，用例总数 **≥ 60 条**且**全部来自本 spec TDD 网格登记的新树测试文件**（旧基线 769 条随归档清零，不以旧数充新数——ADR-028 Decision 8）
- [ ] A5 G-1 归档防回流依赖闸**已建立且自证可红可绿**：
  - [ ] A5.1 `npx vitest run tests/static/noLegacyImport.test.ts` 绿（当前树命中数＝0）
  - [ ] A5.2 同测试对 fixture（临时文件 import `src/domain/conversationState.ts`）判红——闸的可红性由该 fixture 用例自证，不留"永远绿"的空闸
- [ ] A6 段6 闸全绿（新鲜命令证据，不复制历史输出）：
  - [ ] A6.1 `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` → 0 error
  - [ ] A6.2 `npx eslint .` → 0 error
  - [ ] A6.3 `python3 tools/desens-scan.py`（仓库根）→ rc=0

### B 事件注册表与时间线单一写者（段3 §5／§6，I-2）

- [ ] B1 `apps/desktop/src/domain/timeline.ts` **就地重写**为 22 事件闭集：`npx vitest run tests/unit/timeline.eventCatalog.test.ts` 绿——断言①导出事件名集合与段3 §5 表逐名相等（**22 名，不多不少**；测试内名单＝段3 §5 的快照，改动须回段3 而非改测试）；②旧树事件类型（~56 名）残留命中数＝0（无兼容映射面）
- [ ] B2 每事件载荷键与段3 §5「载荷键」列逐条相等（**禁增禁减**）：`npx vitest run tests/unit/timeline.payloadKeys.test.ts` 绿，S1 发射的 **17 事件**（计划 §5 S1 行）逐个断言键名集合
- [ ] B3 I-2 单一写者＋seq 单调：`npx vitest run tests/unit/timeline.append.test.ts` 绿——①并发追加下 seq 无重号无跳号；②追加失败⇒整事务回滚（聚合状态写入一并不生效，段3 §6 例外条款）；③非机制口调用 append 的路径命中数＝0（与 G-1 同族的静态断言，落 `tests/static/appendSingleWriter.test.ts`）
- [ ] B4 发布纪律：全部事件先入 TimelineLog 再进程内分发；对外发布通道命中数＝0（L0 原则6）——`npx vitest run tests/unit/timeline.publishDiscipline.test.ts` 绿

### C S1 首立不变量判据（C1–C14＝14 条不变量；C15＝领域服务契约）＋渐进登记纪律（本阶段负 DoD 主责，后续阶段只写回归＋扩面）

- [ ] C1 I-1 在飞 ≤1：并发两次 StartTurn → 至多一次成功；失败方的用户输入**转入队列**（InputAcknowledged 归宿＝入队，非丢弃）——`tests/unit/turn.admission.test.ts`（≥4 条用例）
- [ ] C2 I-3 决策点归属唯一：RaiseDecision 缺 (delegationId, turnId) 归属→命令拒绝；同 decisionPointId 重复决议＝首次生效——`tests/unit/decisionPoint.test.ts`（≥3 条）
- [ ] C3 I-4 队列至多准入一次：同 itemId 二次准入＝no-op；已撤回项再准入＝拒绝；FIFO 保序——`tests/unit/instructionQueue.test.ts`（≥4 条）
- [ ] C4 I-5 非自述＋声称有效性：Provenance 在类型上不可表达"AI 自述"（双 tsc 承载：构造非法值编译失败，断言落 `tests/unit/evidence.provenance.test.ts` 的恒等值检查）；evidenceRefs 空／悬空／跨委托→声称拒绝＋回执携理由，且**委托不转待核验态**——`tests/unit/evidence.claim.test.ts`（≥5 条）
- [ ] C5 I-6 无据不核：无有效声称时转待核验态→状态转移拒绝——`tests/unit/delegation.stateMachine.test.ts`（≥1 条）
- [ ] C6 I-7 无拍板不执行：RequiresApprovalSpec 命中的操作在 Resolution＝批准前**副作用计数＝0**（校验先于产出）；未过闸→转 RaiseDecision——`tests/unit/requiresApproval.test.ts`（L1，≥4 条）＋`tests/interaction/decisionCard.spec.ts`（L3，拍板卡不可绕过，≥1 条）
- [ ] C7 I-9 无归宿等待＝0：deriveWaitingItems 输出中每实例**属且仅属一类**且有可见位置；计数判据＝无归宿等待数 **0**（检测式，不阻断）——`tests/unit/waitingItems.test.ts`（≥6 条，覆盖四类各一＋双归属反例＋空集）
- [ ] C8 I-10 每轮恰一终态／每委托恰一当前终态：重复终态＝幂等拒绝；已收尾→已归档＝终态更新仍恰一个；重开清空重计——`tests/unit/turn.terminal.test.ts`（≥4 条）
- [ ] C9 I-11 否定事实必有痕（S1 面＝两事件）：DecisionDenied／DelegationRejected 发生时 timeline 条目计数 ≥1，缺即判红——`tests/unit/timeline.negativeFacts.test.ts`（≥2 条；SessionInterrupted 属 S3、StallDetected 属 S5，四事件闭集收口在 S5，本阶段**不预绿**）
- [ ] C10 I-13 过期令牌写入计数＝0（S1 面＝令牌建立＋写前复核）：TurnToken 复合值 (delegationId, turnId) ≠ 当前在飞轮⇒过期；过期写入被丢弃且**过期令牌写入计数器 +1**；正常路径计数器读数＝**0**——`tests/unit/turnToken.test.ts`（≥4 条；全恢复点横切覆盖属 S5 扩面）
- [ ] C11 I-14 重开挂原单：RejectAcceptance 后 delegationId 不变、reopenCount 单调 +1；新建委托＝拒绝——`tests/unit/delegation.reopen.test.ts`（≥3 条）
- [ ] C12 I-15 拒绝待决期守卫：自 DecisionDenied 起至下一次 TriggerSource＝用户输入的 StartTurn 成功止，该委托以"系统恢复"／"队列准入"开轮的**计数＝0**；解除后队列按序恢复消费——`tests/unit/turn.deniedGuard.test.ts`（≥4 条）
- [ ] C13 I-16 验收前置（**基线判据**）：待核验态∧AcceptanceSpec 过（存在可打开核验且 Provenance＝系统采集的证据引用）才可验收，否则拒绝且 DelegationRejected 路径可用——`tests/unit/acceptance.test.ts`（≥3 条）。**显式缺口登记（不预绿）**：段3 v1.1 的产物谓词条款（≥1 条 EvidenceType＝变更集）在 S1 **不实现**，其 DoD 主责＝S4（ADR-027 Decision 5）；本阶段该文件须含一条 `it.todo`/跳过标记用例指名 S4，使缺口在测试面可见而非沉默
- [ ] C14 I-2 见 B3（同一判据的静态与运行时两面，不重复计数）
- [ ] C15 **ApplyChange 领域服务契约**（段3 §6「变更→证据」行／§8 领域服务）：经 AdmissionCheck 通过后的变更操作 ⇒ ①发 `ChangeProduced`（载荷键含变更集ref＝PayloadRef＋作用域校验结果）；②证据域订阅采集 ⇒ `EvidenceRecorded` 且 Provenance＝系统采集、EvidenceType＝变更集；③未过 AdmissionCheck 的调用副作用计数＝0（与 C6 同源的写侧确认）；④evidenceId 去重（同变更重复投递＝幂等）——`tests/unit/applyChange.test.ts`（≥4 条）

### D 结构检查项（段3 S-1／S-2／S-4）与段4 新建闸

- [ ] D1 S-1：呈现／度量模块 import 面不含四核心聚合写命令；timeline 追加仅 `TimelineRepo.append`；EvidenceInspected 为唯一登记例外——`tests/static/s1WritePath.test.ts` 绿（含 fixture 自证可红，同 A5.2 纪律）
- [ ] D2 S-2：核心域目录内 provider 专名命中数＝**0**（R3 落点）——`tests/static/s2ProviderName.test.ts` 绿（grep 断言，专名清单在测试内枚举）
- [ ] D3 S-4：payload 含凭据形态串→**落账拒绝**（落账前判据，与段6 闸 `tools/desens-scan.py` 同族）——`tests/unit/payloadRef.desens.test.ts`（≥3 条）
- [ ] D4 S-3 属 S2（高影响清单 CI diff），本阶段**不立**、不预绿
- [ ] D5 G-1 见 A5（段4 新建闸，**不计入**段3 S-1–S-4 计数）

### E 网关移植与流级取消令牌（计划 §8 第 5 项）

- [ ] E1 流级取消令牌管道新建（现仓库勘查实测：`gateway.ts` 仅 `AbortSignal.timeout`，无用户面 AbortController）：用户 Stop ⇒ 在飞流 abort ⇒ 该轮令牌复合值过期 ⇒ 后续写入被 C10 判据丢弃——`tests/unit/gateway.cancelToken.test.ts`（≥3 条）＋`tests/interaction/stopInflight.spec.ts`（L3，≥1 条）
- [ ] E2 真网关移植后可跑最小闭环：`npm run e2e`（依赖 `/tmp/nf-e2e-test`，入口自建）对"发起→推进→拍板→核验→收尾"路径绿；需真 Key 的场景沿既有 `NF_*` 环境约定，**Key 不入库**（C3）；无 Key 环境走假网关双轨（同一 L3 用例两 provider 面）
- [ ] E3 核心域不出现 provider 专名（＝D2 判据，移植不得把专名带进领域层）

### F 最简呈现（委托单中心，L3）

- [ ] F1 `npx playwright test --project=interaction` 全绿，新增用例 **≥ 8 条**，覆盖：委托单列表／时间线视图／拍板卡（含拒绝理由输入）／证据打开（EvidenceInspected 经机制口落账，S-1 唯一例外）／验收与拒绝按钮（拒绝→原单重开可见）／排队可见（InstructionQueued 项有可见位置）——`tests/interaction/delegationLifecycle.spec.ts`
- [ ] F2 **未持久化态显式呈现**：S1 为内存态、重启即失，UI 须显式呈现该事实（不得静默装作已保存；原则1 的诚实面）——`tests/interaction/unpersistedState.spec.ts`（≥1 条）
- [ ] F3 焦点呈现走 deriveFocus 唯一入口、不落存储；排队中不占焦点；三类皆空则焦点为空——`tests/unit/focus.test.ts`（≥4 条；完整呈现义务属 S6 扩面）

### G 状态类断言（逐条列，不合并）

- [ ] G1 `docs/tests/coverage-matrix.md` 表 N：13 轴的「测试（段7）」列中**由 S1 承担的行**已回填（阶段号 V1-S1＋本 spec 路径＋对应用例文件）；S2–S7 承担的行保持 ⏳（**不得预绿**）
- [ ] G2 本 spec 的 `- [ ]` 全数勾绿或显式标 blocked＋理由（无沉默未跑项）；`stage-gate` 逐条执行记录留新鲜命令输出
- [ ] G3 handoff CLI 落账：S1 闸结果、新增 pitfall、`next` 指向 S2；`exit`／`summary` 先 `--dry-run` 再整槽覆写
- [ ] G4 决策日志同步：S1 内若发生语义裁定→当阶段出 ADR 并加索引行（无裁定则本项记「无」，不留空）
- [ ] G5 代码与工件已 commit 到工作分支（Conventional Commits，经 lefthook→lint-staged）；**push 与 CI 绿以用户显式授权为前提**——未授权时本项登记 blocked（不判红、不预绿）

## TDD 网格（本阶段新增功能——spec-first + test-first；每行在 DoD 有对应断言）

| # | 功能 | 规范断言（来源） | 失败测试（红） | 实现（绿） | 重构 |
|---|---|---|---|---|---|
| 1 | 归档批执行＋G-1 防回流闸 | ADR-028 Decision 3/4；计划 §4 G-1 行 | `tests/static/noLegacyImport.test.ts`（含 fixture 自证可红） | git 删除归档清单＋移植复用面＋依赖检查承载体（形态段5 定） | 旧呈现组件树整体移除，不留死目录 |
| 2 | 22 事件注册表闭集 | 段3 §5（22 名＋载荷键） | `tests/unit/timeline.eventCatalog.test.ts` | `src/domain/timeline.ts` 就地重写 | 旧 ~56 事件类型清零，无兼容映射 |
| 3 | 事件载荷键契约 | 段3 §5「载荷键」列 | `tests/unit/timeline.payloadKeys.test.ts` | 各事件 payload 类型（TS 类型面＝契约面） | 与段3 §5 键名逐字对齐，禁增禁减 |
| 4 | TimelineRepo.append 单一写者＋同事务 | 段3 I-2／§6 例外条款 | `tests/unit/timeline.append.test.ts`＋`tests/static/appendSingleWriter.test.ts` | 内存 TimelineRepo＋事务边界（聚合写入＋append 同事务） | 追加失败回滚路径与正常路径共用同一事务包装 |
| 5 | 发布纪律（先落账后分发、对外零发布） | 段3 §5 发布纪律；L0 原则6 | `tests/unit/timeline.publishDiscipline.test.ts` | 进程内只读订阅分发 | — |
| 6 | Delegation 聚合状态机 | 段3 I-6／I-10（当前终态恰一） | `tests/unit/delegation.stateMachine.test.ts` | Delegation 聚合＋内存 DelegationRepo | 终态更新（收尾→归档）与重开清空走同一状态机入口 |
| 7 | 重开挂原单 | 段3 I-14；段2 U4 裁定 | `tests/unit/delegation.reopen.test.ts` | RejectAcceptance→DelegationReopened | reopenCount 单调逻辑收进聚合，不外泄到呈现 |
| 8 | 轮次准入与在飞唯一 | 段3 I-1；L0 §6 6a 单件推进 | `tests/unit/turn.admission.test.ts` | Turn 聚合＋StartTurn 守卫＋入队分支 | 拒绝方输入转入队列与 X4 排队共用同一队列入口 |
| 9 | 轮次终态 | 段3 I-10（每轮恰一终态） | `tests/unit/turn.terminal.test.ts` | EndTurn／中止／中断三终态 | 三终态归一枚举，重复终态幂等拒绝 |
| 10 | TurnToken 写前复核＋过期计数器 | 段3 I-13；经验层 ADR-019（`@be6e299`，只作经验） | `tests/unit/turnToken.test.ts` | 令牌复合值＋写前复核＋聚合计数器 | 复核点收敛为单一写前钩子（S5 再横切扩面） |
| 11 | 拒绝待决期守卫 | 段3 I-15；段2 U2 裁定 | `tests/unit/turn.deniedGuard.test.ts` | TriggerSource 准入判定（只读查询委托被拒标记） | 与轮次准入守卫合并为同一准入闸，避免两处判定 |
| 12 | 决策点归属与幂等决议 | 段3 I-3 | `tests/unit/decisionPoint.test.ts` | DecisionPoint 聚合＋内存 Repo | — |
| 13 | RequiresApprovalSpec＋AdmissionCheck | 段3 I-7／§8；段2 §4「须拍板操作」谓词 | `tests/unit/requiresApproval.test.ts` | Spec 纯谓词＋授权域前置闸 | 校验先于产出：闸在 ApplyChange 之前，不在之后补救 |
| 14 | 证据 Provenance 恒系统采集＋ValidClaimSpec | 段3 I-5／§8；段2 §4「证据」「声称」 | `tests/unit/evidence.provenance.test.ts`＋`tests/unit/evidence.claim.test.ts` | EvidenceItem＋Claim 有效性判定 | 非法 Provenance 由类型面不可表达（双 tsc 承载） |
| 15 | AcceptanceSpec 基线（产物谓词条款留 S4） | 段3 v1.1 I-16／§8；ADR-027 Decision 5 | `tests/unit/acceptance.test.ts`（含指名 S4 的跳过用例） | AcceptanceSpec 只读查询（环收敛点） | S4 加严时只扩 Spec，不改 Delegation 状态机 |
| 16 | ApplyChange→ChangeProduced→证据订阅采集 | 段3 §6「变更→证据」行 | `tests/unit/applyChange.test.ts` | 领域服务 ApplyChange＋证据域订阅采集 | 变更集不建聚合（段3 §2 取舍），只以 PayloadRef 入证据 |
| 17 | deriveWaitingItems 四类闭集 | 段3 I-9／§8 共用纯函数模块 | `tests/unit/waitingItems.test.ts` | 共用纯函数模块（不属任一子域） | 呈现与度量各自调用同一模块，杜绝两套投影 |
| 18 | deriveFocus 唯一投影入口 | 段3 §8 deriveFocus 口径边界 | `tests/unit/focus.test.ts` | 纯函数（候选三类×创建序→唯一焦点或空） | 焦点不携带动作类型、不落存储 |
| 19 | 流级取消令牌管道 | 计划 §8 第 5 项；段3 I-13 | `tests/unit/gateway.cancelToken.test.ts` | 真网关移植＋用户面 AbortController＋令牌过期联动 | 复用 `gateway.ts` 重试/分类面，只新增取消管道 |
| 20 | 最简委托单中心呈现（含未持久化态显式呈现） | L0 §8 生命周期五段；原则1／原则4；计划 §3 S1 行⑥ | `tests/interaction/delegationLifecycle.spec.ts`＋`tests/interaction/unpersistedState.spec.ts`＋`tests/interaction/stopInflight.spec.ts`＋`tests/interaction/decisionCard.spec.ts` | 委托单列表／时间线视图／拍板卡／证据打开／验收与拒绝／排队可见 | 复用 `styles.css`＋`icons.tsx` 原语；旧对话中心组件不复用 |

## 产出物

- [ ] 归档批 commit（删除清单逐条列于 commit message）＋轻量 tag `legacy-freeze-v0.1.0`
- [ ] `apps/desktop/src/domain/**`：新树领域层（**6 业务聚合＋TimelineLog 机制聚合＝段3 7 聚合**／5 Spec 中 S1 承担 **3 个**：RequiresApproval／ValidClaim／Acceptance，StallSpec 归 S5、RecoverableSpec 归 S3／共用纯函数模块／内存仓储 7 面）——**模块签名与文件切分归段5**，本件只锁落点目录
- [ ] `apps/desktop/src/domain/timeline.ts`：22 事件闭集注册表（就地重写）
- [ ] `apps/desktop/src/main/**`：接线位（真网关移植＋取消令牌＋IPC 通道集，通道命名归段5）
- [ ] `apps/desktop/src/renderer/**`：委托单中心最简呈现
- [ ] `apps/desktop/tests/unit/**`、`tests/static/**`、`tests/interaction/**`：本 spec 网格登记的新树测试文件
- [ ] 静态闸承载体（S-1／S-2／G-1 的 lint 规则或检查脚本，形态归段5）
- [ ] `docs/tests/coverage-matrix.md` 表 N 的 S1 行回填
- [ ] handoff 落账（闸结果／pitfall／next→S2）

## 边界（不做——防蔓延）

- 作用域**修正**与版本链（AmendScope／I-8／I-17／S-3）属 **S2**；S1 的 Scope 只有 v1 声明、无修正路径。
- 持久化与崩溃恢复属 **S3**：S1 为**内存态**，重启即失；RecoverableSpec／SessionInterrupted／DelegationRestored／I-12 一律不做（但"未持久化"须在 UI 显式呈现，见 F2）。
- 证据三类型中**命令输出／测试结果**载荷与 S-4 全覆盖回归属 **S4**；S1 只做变更集类与落账前脱敏判据。
- **产物谓词条款**（段3 v1.1／ADR-027：收尾必有 EvidenceType＝变更集 的证据）属 **S4**——S1 的 AcceptanceSpec 只实现基线判据，缺口以跳过用例显式登记（C13），**不得预绿**。
- StallDetector／StallSpec／卡滞与催弃路径／DelegationAbandoned 三处事件驱动消费／deriveWaitingItems 收束态过滤属 **S5**；S1 的队列只做**可见**（排队项有可见位置），不做撤回与卡滞期准入窗。
- 等待项与焦点的**完整呈现义务**、S-1 全量呈现面覆盖属 **S6**；S1 只覆盖最小闭环所需呈现。
- 指标计算与三层比率口径属 **S7**；S1 只保证事件按段3 §5 载荷键正确发射（采点面已就绪，计算不做）。
- 多委托并行（L0 §6 6a OUT）、跨委托自动记忆（6b OUT）、i18n／无障碍（L0 §3 明确不进 V1）、自托管遥测（L0 §4）——**射程外**，任何阶段都不得就地引入。
- promptfoo **不引入**（计划 §8 第 8 项评估结论）；模型行为面用真网关＋假网关双轨。
- 任务级拆解（bite-size 步骤＋代码）不在本 spec：于 S1 开工前按 writing-plans 出，落 `docs/superpowers/plans/`，且**任务不得超出本 DoD 边界**（stage-spec 技能边界条款）。
