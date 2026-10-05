# 段6 · S1 plan 边界重划＋治理对齐 独立审计（两遍链）

**审计对象**：主会话亲笔的两个提交面——
- B 批 plan 边界重划（`0b70122`：S1a 只增不删／归档批＋rewire＋去旧域依赖后移 S1b／S1 全出口闸落 S1b 单次过，涉 S1a plan＋S1b plan＋stage-spec V1-S1 三件）；
- A 批治理对齐（`b4594f8`：AGENTS 规则 6/7/15＋ADR-026 D3/D4＋decision-log，与升级后的中央 agent-dispatch 技能结合）。

**审计者**：command-code@deepseek-v4.1-flash（主审计）→ 主会话采纳修入（`998b527`）→ mcode@MiniMax-M3.1-Flash-Preview（增量复审 fix diff）。
**独立性**：currentTool＝qodercn（当前主）；currentModel 未现场复核，不作依据（依 agent-dispatch「模型只认现场打印／用户口述、不抄上一轮或仓内记录」）。**独立性系于渠道而非具体模型**＝command-code、mcode 均系与 qodercn 不同的 CLI／渠道，无论当前主跑哪个模型都恒不同源，符合硬约束①不自审＋④同源不审亲笔。两审计者所用模型（command-code＝deepseek-v4.1-flash、mcode＝MiniMax-M3.1-Flash-Preview）为用户当场认的强模型，符合硬约束③。
**任务书边界**：只读已入库工件（plan×2＋stage-spec＋ADR-026＋AGENTS＋书写规范＋agent-dispatch 技能），不引用未列出文件作依据；不改码、不 commit。command-code 本轮 shell 受限，改用 reflog＋源码 import 图重建改动面；其关键发现由主会话真 grep 复核后再采纳。

---

## 第一遍 · command-code 主审计

**结论**：PASS with findings。边界重划主体（归档/rewire/去依赖后移 S1b、S1a 只增不删、S1 全出口闸落 S1b 单次过）与 ADR-028 负面①自洽；三件工件 DoD 口径无重编号漂移；AGENTS 瘦身无悬空指针、无必要约束丢失。残留一处实质缺口（F-01）＋若干归属/清单同步瑕疵。

| 编号 | 度 | 位置 | 摘要 |
|---|---|---|---|
| F-01 | H | S1b plan Task 0/3/9 ＋ stage-spec line7 | kept 文件 `main.ts:11` import 归档面 `timelineLogger`（`setTimelineUserData`），全部 S1b 任务无人认领；Task 9 Step1 grep 会命中 main.ts，补救指针却写死「回 Task 0/3/6」（三者不含 main.ts）。`git rm timelineLogger.ts` 后必断 A6.1 双 tsc。 |
| F-02 | M | S1a plan Task2 line54 vs S1b 全任务 | 「全树 G-1 覆盖」无任务承载：`noLegacyImport.test.ts` 扫描集止于新树，A5.1 可在从未扫 kept 文件时平凡通过。 |
| F-03 | L | S1b 出口闸 line155 | 把 G-1 防回流误挂到 `eslint`；G-1 承载体应是 vitest 静态测 `noLegacyImport.test.ts`。 |
| F-04 | L | stage-spec line5 vs line7 | line5 示例映射仍写「S1a（领域内核＋归档）」，与 line7「S1a 只增不删、归档归 S1b」相反映射。 |
| F-05 | L | S1b Task 9 line138/142 | 保留面写 `diffRender.tsx`，实际文件为 `diffRender.ts`。 |
| F-06 | L | S1b Task 9 Step4 line143 | rm glob 用冻结 tag 列整棵 `tests/`，超出 A2.3/ADR-028 D3 声明清单（漏列 `tests/helpers/**`）。 |
| F-07 | L | S1b Task 9 Step4 line143 | `'apps/desktop/e2-*.mjs'` 少一 e（同命令另列 `e2e-*.mjs` 故无害，属笔误）。 |
| F-08 | L | ADR-026 line43/65 | 工具池 4 名当己方池快照；与中央技能「现场探测、不抄仓内记录」精神不完全对齐。 |
| F-09 | L | ADR-026 line46 | 开口「两条硬约束」计数与技能正文「四条」不同步。 |
| F-10 | L | AGENTS rule7 line23 | 瘦身后仍复制技能三条内部规则，与书写规范 §5/§7 有残余重复。 |
| F-11 | L | stage-spec line7 vs S1a plan | F 的 S1a/S1b 子切分（F3 域面归 S1a、F1/F2 呈现归 S1b）只在 plan，stage-spec 拆分登记未记。 |
| 越界 | L | decision-log 索引行 026 | 改了 ADR-026 正文 D4 未同步索引行「两技能只建本仓（裁决④）」→ 索引与正文漂移。 |

**正面确认**：Q1 边界与 ADR-028 负面①自洽（唯一缺口＝F-01）；Q2 三份工件对「S1 全出口闸落 S1b 单次过／DoD A1–A6 实体不变、仅子批搬迁」口径一致、无重编号；Q3 规则 6/7 正向映射、指针化、无悬空指针、无必要约束丢失；Q4 ADR-026 D3 已标「当前主可轮换、非固定 qodercn」，D4 与实测软链一致。

**采纳判定（主会话署名）**：F-01~F-07、F-09、F-11 ＋ 越界项＝**全采纳修入**（9 项，`998b527`）；F-08/F-10＝**搁置**——F-08：line43 已自带「本行不作依据、以现场探测为准」免责，写的是可用 CLI 名的**形状**而非模型事实，删枚举反而丢掉唯一可追溯的形状证据；F-10：AGENTS 属本仓受管文件，`.handoff/`/`.scratch/`/凭据黑名单**必须留仓侧**才有效（移进软链外挂技能＝无人读的黑名单），同源句上浮技能后仓侧保留硬约束①落点是正确分工。

---

## 修复提交 `998b527`

五文件 18+/18−：F-01 补 `main.ts` 进 S1b Task 0 Files＋Step1 grep＋Step4＋补救指针含 main＋stage-spec/S1a 去旧域依赖面补 main；F-02 Task9 Step5 补 G-1 扫描扩 `src/**` 全树；F-03 出口闸 eslint 去 G-1 归 vitest；F-04 stage-spec line5 对齐 line7；F-05 `diffRender.tsx`→`.ts`；F-06 Step4 收窄 rm 到 unit/interaction/visual＋保 `tests/helpers`＋并 `e2-*.mjs` 笔误；F-09 line46 去「两条」计数指技能四条为准；F-11 stage-spec 补 F3→S1a/F1F2→S1b；越界 decision-log 索引行 026 同步。desens rc=0。

---

## 第二遍 · mcode 增量复审 fix diff

**结论**：PASS with findings。`998b527` 五文件 18 行改动本身未引入新矛盾或断链；F-01~F-07、F-09、F-11 与越界项经**独立核验**（不采信 command-code 清单，直接跑实际 import 图）均真闭合；三处口径（stage-spec line5↔line7↔两份 plan）与 F-03 承载体归属现已一致；F-08/F-10 搁置判定复核为**可辩护**。

| 编号 | 度 | 结论 |
|---|---|---|
| RF-01 | L | F-01 主体（main.ts）已闭合，但 `tools.ts:22` 的 `logTimeline`→`timelineLogger` import（3 处调用 `:135/:390/:399`）**同属归档面耦合却无任务认领**，且不在 Task 0 自验 grep 内。不破坏 S1 出口闸（Task 9 Step1 全树 grep 仍会拦住 `git rm`），但会制造一次返工 commit。→ 修入（`94bb0a5`）。 |
| RF-02 | L | ADR line46 改写自指一致（仓侧基线 2 条 vs 技能 4 条、明写以技能为准），③保留①同源句属有意溯源注释非新矛盾。**判可辩护，不再改**。 |

**mcode 逐问核验**：① F-01 真闭合度＝kept 侧对归档面真实耦合共 6 处逐名认领，除 RF-01 外全部有落点（gateway/verification/tools-conversationState→Task0；main→Task0；ipc timelineLogger→Task3/A2.5；App StartPage/MainWorkspace→Task6；其余 renderer 命中全落 A2.2 24 名删除面）；② 回归排查＝stage-spec line5↔line7↔两份 plan 四处同口径、Task9 Step4 收窄后恰留 `tests/helpers/assertions.ts`（零归档依赖）、Step5 G-1 扩全树与 S1a 域内 scoped 互为前后件不冲突；③ F-08/F-10 搁置复核判可辩护、建议另开小 commit 走 ADR 不搭 S1 批；④ DoD A–G 逐条有落点、无遗漏无实质重叠。未改任何仓内文件、未 commit/push。

---

## RF-01 修复提交 `94bb0a5`

三文件 10+/10−：S1b Task 0 Files 补 `tools.ts` 去 `logTimeline` import＋3 处调用（删不迁移，与 main.ts 同口径）；Step1 grep 模式扩含 `logTimeline` 并对 `src/main` 全目录（本任务认领 main/tools、注 ipc 归 Task3）；Step3 明确 tools 删调用；Step4 验收 grep 加 `timelineLogger|setTimelineUserData|logTimeline` 于 `{main,tools}.ts`＝0；Step5 commit 面「main」→「main/tools」；line3 前言补 tools 现 import timelineLogger。三件工件（S1b/S1a plan＋stage-spec line7）去旧域依赖面统一改「main/tools 现 import `timelineLogger`」堵口径漂移。desens rc=0。

---

## 总结论与采纳（主会话署名）

两遍审计链闭合：主审计 12 项（11 发现＋1 越界）中 9 项采纳修入（`998b527`）、2 项搁置附理由（F-08/F-10，mcode 复核确认）；增量复审 1 项 L（RF-01）采纳修入（`94bb0a5`）、1 项判可辩护（RF-02）。S1 plan 边界重划主体与 ADR-028 负面①自洽、三处口径一致、DoD A–G 逐条有落点、AGENTS 瘦身无悬空指针——**S1a/S1b 两份 plan ＋ stage-spec 已达可执行态**。S1 出口闸的实际编译断链面（kept→归档面 6 处耦合）经独立核验已无未认领项。
