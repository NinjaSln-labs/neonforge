# ADR-017：授权窗口一等化与执行日志权威（ApprovalWindow）

- 状态: **accepted·landed（2026-10-03 定稿 v3.3，同日按 A1–A17 清单落原稿完毕：00/02/04/06/intent-design/coverage-matrix/product-01；落稿自检 grep 通过）**——权威文本＝提案 `docs/design/approval-ledger-model-proposal-2026-10-03.md`（final-v3.3·landed，含终审三轴修补与根治裁定）。本文件为落位声明与取代关系登记。
- 日期: 2026-10-03
- 取代: ① ADR-015 中 approval 面条款——#2 铺骨架含 approval、#5 approvalGranted 不叠代次、#6 `decisionContent.approval` 恢复重显条款（approval 族退出 descriptor/instanceId 机制，改 requestId 寻址；恢复重显改 journal 对账）；② 提案自身 v3.2 的"恢复即 expired/failed"缓解条款（v3.3 根治为 journal 三判，缓解仅存于无 journal 可判的退化场景）；③ ADR-014/015 语境下"pending='approval' 为置位来源"表述（降为窗的单向派生呈现）。其余保留。
- 相关: 病灶 `t000073`（allow 不进门/镜像权威/批量不可表达）；审计链 `independent-audit-v10/v11`、终审三轴 `final-review-v3.1-{penetration,construction,landing}-axis`、前提清查 `adr016-premise-sweep`；流程闸 `ADR-016`（域归属卡/前提复核/裁定来源不豁免）；竞品基线 `approval-model-competitor-source-survey`（22 家）；handoff `d000011`、`d000038`、`d000043`–`d000045`。

## Context

需批准的执行请求事实住在 UI 卡列表（toolCalls[].status 为权威），approval 槽是单向镜像、allow 决定不写任何领域集合——故 allow 无法进门、pending 靠 D5 effect 代理、批量部分批准不可表达（t000073）。十五轴攻防后用户裁定"序号属时间线日志域"（v3 撤钟）；对"requestId 身份"裁定的独立复核（ADR-016 规则 4 首例）补签发唯一性条款（v3.1）；终审三轴判"修后可"后，用户裁定待裁项全部**按设计根治、不求最小修改**（v3.3 定稿）。

## Decision（要点，全文以提案为准）

1. **ApprovalWindow 一等化**：`ConversationState.approvalWindow = { requests: ApprovalRecord[] }` 为需批准事实的领域真相源；记录身份＝requestId（main 于 needApproval 咽喉签发，跨进程跨重启唯一，**不透明字符串**——禁解析内部结构；领域内无序号无代次，排序归 TimelineEvent.seq）。
2. **槽降派生**：`pending='approval'` ⇔ 窗含 pending 呈现记录 ∧ 无确认卡占槽（单向）；确认卡族（goal/plan/resolution/system_clarify）独用 decisionInstanceSeq；D5 hasApproval effect 退役（消费方四处同步迁接，含 shouldStopContinuation 供料）。
3. **四入口收敛**：单卡/记住/批量/文本恰一＋规则命中全经 `approvalDecided`——allow 与 deny 同权入态；闸＝id∈窗 ∧ state∈{queued,pending}（可决记录），miss→no-op＋stale 事件；batch 逐 id 记账。
4. **执行日志权威（根治 M-03）**：main 持久 journal（issued/approved/started/done）；二次 execute 校验＝id∈journal ∧ phase 允许 ∧ argsFingerprint 等值；恢复三判——≤approved 存续可决／done 对账收敛／started∧¬done→**uncertain**（用户裁决唯一出口 `resolveUncertain`，禁自动重放——不可证事实升格为决策点，产品主张 ADR-011 同脉）。
5. **规则三档权威归 main（根治 G1）**：once＝事件/窗记录；session grant＝main 会话规则表，任务边界经 clearSessionGrants 清除；persistent＝Workspace 持久库（setRules 接线，跨任务不变、bash/高危永不进——02:191）；renderer taskTrust 降呈现投影（判定权回收 main，防绕过同源 02:188）。
6. **plan-batch**：approve-files 合并卡入窗统一存续与闸（main 对虚拟工具签发），决定内容/执行链仍走 approvalGranted＋planConfirmed 硬序门——approvalDecided 写窗、approvalGranted 开清单门（G2）。
7. **不变量改述**：Inv 1 扩写"含预先规则裁决（decidedBy:'rule'＝先前用户决策的延迟执行）"；Inv 7 改述"槽单值不变＋授权面单窗 N 可寻址"——三项扩充**内嵌 00 §3.2 要点 2 同一句**（唯一措辞源纪律，ADR-015 #8 同源）。

## Consequences

- 正面：allow/deny 对称入态根治 t000073；批量部分批准/恢复语义/规则三档各有权威落位；approval 面与 ADR-015 耦合降为"槽的呈现互斥"；恢复不再丢用户已做的决定（判 A）。
- 代价：施工规模 135–205 触点；阶段 B 原子对中途不可发；sessionStore 信封形状迁移；main 新增 journal 持久层。
- 边界：领域仍零序号零代次（journal/bootNonce 均在执行域/id 内部）；本 ADR 不回改历史提案/审计（ADR-016 代价条款）；落稿清单 A1–A17 见落稿轴报告 §9.1，落稿自检 grep 断言见其 §10。

---

## 附·ADR-022 精化登记（2026-10-04，不改变本 ADR 任何裁定）

`state: queued | pending` 的**焦点含义**（"现在轮到问谁"）已被 **ADR-022／`00 §3.8` 去物化**为投影：

- 决定面（未决／已决／已结算／失效／不可证）仍权威存储；`queued↔pending` 字段仍存以兼容旧档，但判据以 `deriveFocus` 为准，读旧档**以重算为准不信存值**。
- `DecidableApprovalState` 语义改述为**"未决即可决"**（基数判定与焦点无关）。
- **不变**：四入口收敛（裁定 3）、`requestId` 不透明寻址、main journal 与恢复三判（裁定 4）、`uncertain` 禁自动重放、规则三档归 main——恢复与重连行为不受损。
- **反模式警示（务必同处阅读）**：裁定 3 的"文本恰一才认"指**可决集基数为 1**，**不是**"恰一个 front"；混为一谈会让窗内多条未决时文本批准误生效＝行为改变。
