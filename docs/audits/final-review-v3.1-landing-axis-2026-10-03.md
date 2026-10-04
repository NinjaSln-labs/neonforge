# 终审第三轴：v3.1 落稿接缝审计（落原稿预演报告）

> 日期: 2026-10-03 ｜ 性质: **预演报告——本文件不修改任何被演文稿**（00/02/intent-design/coverage-matrix 原文未动）
> 被审提案: `docs/design/approval-ledger-model-proposal-2026-10-03.md`（accepted-v3.1）
> 方法: T1 四组替换文本草案 → T2 全 docs/ 矛盾扫描（`pending='approval'`/`授权卡`/`hasApproval`/`approvalDecided` 及派生词族）→ T3 术语统一 → T4 落稿清单扩容与风险排序
> 与 ADR-012 关系: 非测批（无产品/harness/断言改动），纯文档落稿预演，不触发测批硬闸

---

## 0. 总判（先说结论）

**放行落稿**：四组替换文本草案全部可相容落稿，未发现不可调和矛盾。但——

1. **提案 §8 落稿清单不足**：指针有 2 处错位（见 §1 勘误），且按现状 grep 需**扩容 17 处**（§6 追加清单），其中 4 处属"不落则同文档自相矛盾"级（intent-design §4/§5/§8.2E/§8.4 与 §3.2/§3.3）。
2. **最高风险接缝两条**：① `00 §3.2 要点 2`（唯一措辞源句，全仓 ≥7 处引用）——"决策唯一输入"与"pending 派生/规则裁决/requestId 寻址"三项扩充**必须内嵌进该一句**，另立新句即破单源；② **恢复语义对立**——提案"恢复即 expired/failed"直接推翻 intent-design `:263-265` restorePending 与 `:405`（§8.2E 重显同实例含 dc.approval）两条已落稿文本，此两处漏改＝一份文档两套恢复规则。
3. **落稿预演暴露 3 个需提案侧先补裁的缺口**（§7），落稿草案一律按"引用裁定不发明裁定"处理。

---

## 1. 指针勘误（提案 §8 落稿清单 vs 原稿实际位置）

| 提案 §8 指针 | 原稿实况 | 判定 |
|---|---|---|
| "02 §2 三方分工段"（提案 :15/:35"02 §2 三方分工"） | `docs/domain/02-domain-model.md` §2＝"我们是什么，不是什么"（:10-20），**无授权三方分工句**。三方分工句实际在两处：**00:58**（BC 职责边界判定表·授权行"授权卡触发会话 pending"）与 **02 §4.8:184-194**（授权与信任，含 deny>allow>ask :188、TaskTrust :189、02:191 bash 高危单独确认——提案 :36 引"02:191"与此行吻合，佐证 §4.8 才是本意） | 勘误：指针应为 `00 §2 判定表行 + 02 §4.8` |
| "02 …§4.6"（提案 :80 落原稿清单） | 02 §4.6＝结构化确认（:127-134），无授权内容；pending/决策卡相关段实为 **02 §4.2（:62-100）** | 勘误：应为 `02 §4.2 + §4.8` |
| "00 §3.4（approvalDecided 现状定义段）"（任务书转述；提案 :80 只写"00 §3.2/§3.4"） | 00 §3.4＝"PENDING 下模型动作无效"（:112-119），无 approvalDecided 定义；**approvalDecided 现状定义段在 intent-design §3.4 :255-261** | 00 §3.4 仍需扩写（决策后放行面），但"approvalDecided 现状"落位＝intent-design §3.4 |

落稿计划文档建议按本表改写指针，避免施工批按错指针空改。

---

## 2. T1-A 组：`docs/domain/00-domain-authority.md` §3.2 / §3.4

### A1. §3.2 引言行

- **原句出处**: `00-domain-authority.md:82`（"**任何需要用户决策的点（卡弹出）→ 会话进入【PENDING——等用户决策】——pending 是会话级……工具级授权等待是会话级 pending 的一部分**："）
- **替换文本**:

> **任何需要用户决策的点（卡弹出）→ 会话进入【PENDING——等用户决策】——pending 是会话级（Conversation 聚合承载——2026-08-07 领域定论），Task（会话内执行单元）不承载 pending。授权面事实不直接住槽：需批准的执行请求以**授权窗口（ApprovalWindow——`ConversationState.approvalWindow`，请求记录集合）**为真相源，`pending='approval'` 是窗的单向派生呈现（ADR-017，原"工具级授权等待是会话级 pending 的一部分"据此精化）**：

### A2. §3.2 状态机图·授权卡分支行

- **原句出处**: `00-domain-authority.md:89`（"└─ 授权卡（小阶段——工具级——但不批准则后续无法继续，影响大阶段）"）
- **替换文本**:

> └─ 授权卡（小阶段——工具级**与 plan-batch 合并授权卡**——窗内 pending 请求的呈现；不批准则后续无法继续，影响大阶段）

### A3. §3.2 要点 1-3（要点 4 见 A4）

- **原句出处**: `00-domain-authority.md:101-103`（要点 1"pending 只有一个"、要点 2"pending 下模型动作无效——存在活 pending 时，用户决策（针对当前决策点实例——instanceId+kind 匹配）是下一个状态的唯一输入……"、要点 3"授权卡同属 pending"）
- **替换文本**（**要点 2 为唯一措辞源句，三项骑注全部内嵌，不得另立第二句**）:

> 1. **槽只有一个**——所有决策通道统一「等用户决策」状态（来源只是卡类型与授权窗口，不各自建 pending）。授权面为**单窗、N 可寻址目标**（不变量 7 改述——ADR-017）：窗是 `requests: ApprovalRecord[]` 集合，每请求一条可寻址记录；窗存续不增槽。
> 2. **pending 下模型动作无效**——模型后续工具调用不执行（做了白做）——状态保持 pending——**存在活 pending 时，用户决策是下一个状态的唯一输入**：确认卡族（goal/plan/resolution）针对当前决策点实例（instanceId+kind 匹配）寻址；授权面针对窗内记录以 **requestId** 寻址（main 签发、跨进程跨重启唯一；`approvalDecided` 为四入口＋规则命中的单一收敛函数，allow 与 deny 同权入态），**且此唯一性含其预先规则裁决**——session/persistent 规则命中＝`decidedBy:'rule'` 的同门登记，是先前用户决策的延迟执行、非新增输入源。实例/请求不符＝不作数（no-op＋stale 事件，ADR-015·ADR-017）。无活决策点（pending＝none 且窗无可决记录）＝无可推进实例（清理/任务边界路径，ADR-015 #3 门前置）。
> 3. **授权卡同属 pending**——授权面是小阶段（工具级），但不批准则后续无法继续——影响大阶段——与确认卡同一状态机；授权决策一律**写窗内记录**（不只是清槽），窗内 pending 可决记录的呈现即授权卡。
> **（新增要点 5·槽呈现互斥）**：**窗含 pending 请求 且 无确认卡占槽 ⇒ `pending='approval'`（单向派生）**；确认卡接管期间窗存续——不置槽、不推号（`decisionInstanceSeq` 为 goal/plan/resolution 族专用，approval 面无实例号）；槽释放 ⇒ `drainQueued`（queued→pending、置槽）；窗 pending+queued 归零 ⇒ `windowResolved`（槽释放）。D5 hasApproval effect 退役（UI 现象不再代理 pending）。

### A4. §3.2 要点 4（决策点触发权）

- **原句出处**: `00-domain-authority.md:104`（"……**卡（决策点）出现 = 状态 × 提议 × 动作属性的确定性派生**（§3.6）——模型措辞不直接弹卡"）
- **替换文本**（仅追加授权面派生链，其余原句保持）:

> ……卡（决策点）出现 = 状态 × 提议 × 动作属性的确定性派生（§3.6）——模型措辞不直接弹卡；**授权面派生链细化**：动作属性 ask → main 于 needApproval 裁决分支签发记录入窗（queued/pending）→ 槽位置再经窗态 × 槽空闲派生（§3.2 要点 5）——"是否需批"的裁决权始终在 main 规则引擎（§2 判定表、02 §4.8）。

### A5. §3.4 首段括注

- **原句出处**: `00-domain-authority.md:114`（"**pending 状态（等用户决策）下——所有工具都不放行**：……唯一措辞源见 §3.2 规则 2"）
- **替换文本**（追加半句骑注，主体不变）:

> **pending 状态（等用户决策——此处 pending 指槽被置位，含窗派生的 `'approval'`）下——所有工具都不放行**：……（做了白做——状态保持 pending——唯一措辞源见 §3.2 规则 2）。**确认卡占槽、窗内含未决记录（queued）时窗不释放槽、不改变本段效力——冻结判据恒为槽，不为窗**（窗是待决内容的真相源，冻结仍由 §3.2 单一 PENDING 承载）。

### A6. §3.4 "用户决策后放行"两分支

- **原句出处**: `00-domain-authority.md:117-119`（"- 用户「是」→ 状态推进 → 模型**根据决策重新做**…… / - 用户「否」→ 状态回退 → 模型调整后再来"）
- **替换文本**:

> - 用户「是」→ **确认卡族**：状态推进 → 模型**根据决策重新做**（不是恢复 pending 前的动作——决策改变状态，动作跟随状态重新生成）。**授权面**：决策写入窗内记录（approved＋decidedBy/decidedAt）；执行由调用层凭窗内记录**二次 execute 携 requestId** 续行（main 校验 id 属本进程台账 ∧ 可决 ∧ argsFingerprint 等值——批 A 行 B 拒），执行结果经 `approvalExecutionSettled` 收敛回写（批了但失败＝failed，防双真相）；槽由窗派生释放。
> - 用户「否」→ **确认卡族**：状态回退 → 模型调整后再来。**授权面**：决策写入窗内记录（denied，原因必填——§3.6 RejectReason）+ reason 回填模型 + 拒绝记忆进 actionGate 同轮同类短封（机制防绕过，语义不变）。
> - **恢复即 expired（ADR-017）**：重启/断连后窗内未决记录一律置 expired、approved∧未 settled 一律回写 settled('failed')——幽灵 pending 判据化终结；可重批是唯一安全解，新请求由新会话窗承载。

---

## 3. T1-B 组：`docs/domain/02-domain-model.md` §4.2 指针行 / §4.8 信任机制段 / §8 术语行

### B1. §4.2 要点两行（指针同步，防与 00 措辞漂移）

- **原句出处**: `02-domain-model.md:83-84`（"- **pending 只有一个**——不区分来源各自建 pending（来源只是卡类型）" / "- **pending 下模型所有动作无效**……**用户决策（针对当前决策点实例——instanceId+kind 匹配，唯一措辞源 00 §3.2 规则 2·ADR-015）是下一个状态的唯一输入**"）
- **替换文本**:

> - **pending 只有一个**——不区分来源各自建 pending（来源只是卡类型与授权窗口——授权面单窗 N 可寻址、槽为窗的派生呈现，00 §3.2 要点 1/5）
> - **pending 下模型所有动作无效**——任何工具（read/search/write/edit/bash/check-capability…）都不执行（做了白做——**无害 ≠ 有用**：只读动作虽无副作用但用户决策未到——结果无意义——同样白做）——**用户决策是下一个状态的唯一输入**（确认卡族 instanceId+kind、授权面 requestId 寻址，含预先规则裁决骑注——**唯一措辞源 00 §3.2 规则 2·ADR-015/ADR-017，本处只引不重述**）

（另 `02:73` 图行同 A2 处理："└─ 授权卡（窗内 pending 请求的呈现——小阶段——但不批准则后续无法继续，影响大阶段）"。）

### B2. §4.8 首句（三方分工落点）

- **原句出处**: `02-domain-model.md:186`（"**工具授权卡 = 会话级 PENDING 的来源之一**（§4.2——小阶段——不批准则后续无法继续）。授权后的信任机制："）
- **替换文本**:

> **授权请求住在会话级授权窗口**（ApprovalWindow——需批准的事实由 `ConversationState.approvalWindow.requests` 承载，记录含 requestId/kind(tool|plan-batch)/toolName/subject/argsFingerprint/state(queued|pending|approved|denied|failed|expired)/decidedBy/decidedAt；requestId 由 main 签发、跨进程跨重启唯一——身份即 id，领域内无序号无代次，排序归时间线日志域）。授权卡＝窗内 pending 请求的呈现（§4.2——小阶段——不批准则后续无法继续）；`pending='approval'` 为窗的单向派生。**三方分工（ADR-017 域归属卡，与 00 §2 判定表行同源）**：是否需批＝main 规则引擎裁决（执行域，边界 fail-closed）；决定记录＝Conversation 窗（推进域）；会话/持久规则＝Workspace 存储（规则域）。授权后的信任机制：

### B3. §4.8 裁决行与 TaskTrust 行（规则三档）

- **原句出处**: `02-domain-model.md:188`（"规则引擎 `deny > allow > ask`——未匹配默认 `ask`（fail-closed）……"）与 `:189`（"**任务级信任（TaskTrust）**：用户「允许并记住」→ ……"）
- **替换文本**（:188）:

> - **授权裁决（AuthorizationService）**：规则引擎显式序 **`deny > always-allow > ask`**（取代现 first-match 隐序）——未匹配默认 `ask`（fail-closed）——bash 只读命令自动放行（main 进程裁决——renderer 不判断——防绕过）；规则命中＝drain 时判定，以 `decidedBy:'rule'` 同门写入窗内记录（00 §3.2 规则 2 预先裁决骑注）；rule-decided/TTL 到期经上行对账通道（ToolResult 标记＋低频对账 IPC）回写集合，保证"恰一 pending"计数与呈现权威单一；规则落库经串行队列防交错。

- **替换文本**（:189，TaskTrust 降为三档之一）:

> - **规则三档（取代单一「允许并记住→任务信任集合」）**：**once**＝本次决定（仅事件流/窗记录，不留规则）；**session grant**＝main 内存规则表（重启弃）；**persistent**＝Workspace 持久规则库（setRules 接线激活，仅文件/网络类 pattern）。「允许并记住」UI 对应 session/persistent 档选择；后续 write/edit 命中即自动放行并写窗记录（decidedBy:'rule'）——授权疲劳解法不变（一次批准本任务内不再问）。

### B4. §4.8 信任边界行（升格条款）

- **原句出处**: `02-domain-model.md:191`（"- 只信任**文件路径类**工具（write/edit 的 path）——bash 无 path 一律不进入信任（bash 高危永远单独确认）"）
- **替换文本**:

> - 只信任**文件路径类**工具（write/edit 的 path）——bash 无 path 一律不进入信任；**bash/高危永不进入 persistent 持久规则**（本行产品裁定压过竞品 goose 形——ADR-017 §2）

### B5. §4.8 回溯行

- **原句出处**: `02-domain-model.md:194`（"**授权记录可回溯**：授权历史（允许/拒绝/允许并记住）进会话时间线 + TrustLadder 展示……"）
- **替换文本**:

> - **授权记录可回溯**：授权历史（允许/拒绝/记住/rule 放行/到期 expired/执行 failed）＝窗记录终态 + 时间线（`decision.requested` 随开窗、`decision.resolved` 带 requestId+outcome+decidedBy）+ TrustLadder 展示（用户可查「谁批准了什么」——记录级可回溯）

### B6. §8 术语行

- **原句出处**: `02-domain-model.md:303`（"| 授权（Approval） | 对「动作属性判定为需询问」的调用，向用户呈现请求（ApprovalRequest）——用户允许或拒绝（带原因）……"）
- **替换文本**:

> | 授权（Approval） | 对「动作属性判定为需询问」的调用，main 签发**授权请求记录**入会话级**授权窗口**（ApprovalWindow；记录携 requestId+state）并向用户呈现（tool 卡/plan-batch 合并卡）——用户允许（一次/会话/永久三档）或拒绝（带原因），四入口与规则命中经 `approvalDecided` 收敛（00 §9/§3.2 同源——ADR-017） |

---

## 4. T1-C 组：`docs/design/intent-confirmation-domain-design.md` §2 / §3.1 / §3.4 / §3.5（+ §3.2/§3.3 必须随行，见 §6 追加清单）

### C1. §2 通用语言三行

- **原句出处**: `intent-confirmation-domain-design.md:41`（DecisionPoint 行"kind 为决策点**槽**（goal/plan/resolution/approval/resolution；…）"及"具一等身份的实例——身份＝其决策描述符"）、`:43`（Decision 行"携 `answers{kind, instanceId}`"）、`:46`（Approval 行）
- **替换文本**（:41，行内两处改）:

> …kind 为决策点**槽**（goal/plan/approval/resolution；**approval＝授权窗口的派生呈现槽——其决策不具 decisionInstanceSeq 实例身份，以 requestId 寻址（ADR-017；instanceId 身份为 goal/plan/resolution 族专用，ADR-015）**；`system_clarify`＝委派槽——ADR-010 强制卡经 underlying 落四类），承载协商连续性 `rejectStreak`（§4.1/ADR-001）

**具一等身份的实例**改为：**确认卡族实例＝决策描述符身份（descriptor→instanceId，ADR-015）；授权族记录＝requestId 身份（main 签发、跨重启唯一，ADR-017）——两族互斥，approval 不入描述符/推号机制**。

- **替换文本**（:43）:

> | **决策 Decision** | 用户对决策点**实例/记录**的响应（确认卡族携 `answers{kind, instanceId}`；授权面携 `requestId`）：确认 / 拒绝（带原因）/ 修改（带修正内容）。**针对当前实例（或窗内可决记录）**的决策是状态推进的唯一输入（不变量 1——含预先规则裁决骑注，唯一措辞源 A0 §3.2） |

- **替换文本**（:46）:

> | **授权 Approval** | 对「动作属性判定为需询问」的调用，main 签发**授权请求记录**入会话级**授权窗口**（ApprovalWindow，见 §3.1/§3.2）并向用户呈现（tool 卡或 plan-batch 合并卡）；用户允许（一次/会话/永久）或拒绝（带原因）；四入口（单卡/记住/批量/文本恰一）＋规则命中全收敛于 `approvalDecided`（§3.4）；allow 与 deny 同权入态 |

- **（新增两术语行）**:

> | **授权窗口 ApprovalWindow** | `ConversationState.approvalWindow = { requests: ApprovalRecord[] }`——需批准事实的领域真相源；领域内无序号无代次（排序归时间线日志域 TimelineEvent.seq）；槽呈现互斥与派生规则见 §3.1/A0 §3.2 要点 5 |
> | **可决记录** | 窗内 `state ∈ {queued, pending}` 的记录——`windowResolved` 归零判据、`approvalDecided` 闸目标、文本批准"窗内恰一"判据的统称（一处定义，全稿复用） |

### C2. §3.1 ConversationState（四处行内改 + 一处新字段）

- **原句出处**: `intent-confirmation-domain-design.md:62`（pending 注释）、`:64-65`（decisionInstanceSeq 注释）、`:73-79`（decisionContent，:74 kind 联合、:76 `approval?: ApprovalRequest`）、`:89`（➕新增清单行）
- **替换文本**:

> （:62）`pending: PendingKind   // 槽：none | goal | plan | approval | resolution（approval＝授权窗单向派生的呈现值——置/清经窗推导与 drainQueued，不经 setPending；system_clarify＝委派槽，§2 注）`
>
> （:64-65）`decisionInstanceSeq: number // 当前呈现实例号：单调；setPending 按 descriptor 推进；初值 0；随会话序列化、恢复续号（不回 0、不与落盘 decision.requested.instanceId 撞号）。**专用族＝goal/plan/resolution/system_clarify；approval 面不推号、不算 descriptor（ADR-017——approval 与 ADR-015 的耦合降为"槽的呈现互斥"）**`
>
> （:62 后新增字段）`approvalWindow: { requests: ApprovalRecord[] }  // 授权窗口（ADR-017）——可决记录唯一性由签发 requestId 跨重启唯一封堵；恢复即 expired/failed（§3.4 expireWindow）；排序需求归时间线日志域`
>
> （:73-79 decisionContent）`kind: 'goal' | 'plan' | 'resolution'`；删除 `approval?: ApprovalRequest` 行——**decisionContent.approval 单卡型面退役（双存储不留——ADR-017 §6-1）；授权面呈现与审计内容＝approvalWindow 窗记录（开窗时快照进 decision.requested detail）**。`instanceId: number // ＝置位时 decisionInstanceSeq（镜像——确认卡族 render 冻结与恢复重建的载体）`
>
> （:89 ➕新增行尾追加）`；➕ approvalWindow/ApprovalRecord（授权窗口——决定面一等化，D5 hasApproval effect 退役；ADR-017）`

### C3. §3.2 值对象（追加 ApprovalRecord；ApprovalRequest 降为呈现内容）

- **原句出处**: `intent-confirmation-domain-design.md:123-128`（ApprovalRequest 块）——保留其四字段但改头注；**新增**：

> ```
> ApprovalRecord {                 // 授权请求记录（ApprovalWindow.requests 成员——身份＝requestId）
>   requestId: string              // main 于 needApproval 裁决分支（tools.ts execute 咽喉）签发；
>                                  //   跨进程、跨重启唯一（apr_<bootNonce>_<counter> 或 uuid——签发唯一性条款，
>                                  //   ADR-017 v3.1；bootNonce 只活在 id 内——不进领域状态、不进台账结构）
>   kind: 'tool' | 'plan-batch'    // plan-batch＝approve-files 合并授权卡（main 对虚拟工具同样签发；
>                                  //   决定内容/执行链仍走 approvalGranted＋planConfirmed 硬序门——闸不豁免）
>   toolName: string
>   subject: string
>   argsFingerprint: string        // main 核验：args 摘要 ≠ fingerprint ⇒ fail-closed 拒（TOCTOU 封死）
>   request: ApprovalRequest       // 呈现内容（reason/risk——§3.2 上块，展示视图不变）
>   state: 'queued' | 'pending' | 'approved' | 'denied' | 'failed' | 'expired'
>   decidedBy?: 'user' | 'rule'    // rule＝预先裁决（A0 §3.2 规则 2 骑注）
>   decidedAt?: string             // 审计时间戳，非身份
> }
> ```
> ApprovalRequest 头注改："授权请求的**呈现内容**（ActionGate ask 产出——窗记录 request 字段；DSH ApprovalRequest 同构）"

### C4. §3.3 deriveDecisionPoint（approval 分支行）

- **原句出处**: `intent-confirmation-domain-design.md:157`（"目标+方案已确认 && 动作属性需授权 → approval"）
- **替换文本**:

> `- 目标+方案已确认 && 动作属性需授权 → main 签发记录入窗（approvalRequested：槽空闲→pending 置槽；确认卡占槽→queued 入窗不置槽）；approval 槽位由窗派生（A0 §3.2 要点 5），deriveDecisionPoint 对该族只判"是否存在可决记录需呈现"（窗非空且无确认卡占槽 ⇒ approval）`

（`00:176` §3.6 同句镜像同改——见 §6 追加 A3。）

### C5. §3.4 转换（本组核心）

**C5a. setPending 骨架行**

- **原句出处**: `intent-confirmation-domain-design.md:235`（"decisionContent ＝ { kind, ...content, since, instanceId: seq }（恒铺骨架，approval 置位须携 ApprovalRequest）"）
- **替换文本**:

> `decisionContent ＝ { kind, ...content, since, instanceId: seq }（恒铺骨架——限确认卡族 goal/plan/resolution/system_clarify；**approval 槽不经常规 setPending——置/清由 approvalRequested/drainQueued/windowResolved 窗派生，不铺 decisionContent、不推号**，ADR-017）`

（`descriptorOf :225` "approval ＝ toolName + subject" 行删除，改注：`// approval 面 descriptor 退役——内容比对由 requestId 寻址 + argsFingerprint 执行核验取代`。）

**C5b. approvalDecided 全块（approvalDecided 现状定义段 = 此处，非 00 §3.4）**

- **原句出处**: `intent-confirmation-domain-design.md:255-261`（approvalDecided(state, request, decision, answers?: {kind;instanceId}) 块，含"本批 approval 面选边……allow/文本批准天然无 answers＝旁路"与"允许：pending 清除（执行继续）……"）
- **替换文本**:

> ```
> approvalDecided(state, target: { requestId } | { batch: 'window' | 'reject-rest' },
>                 decision: { confirm: true } | { confirm: false, reason: RejectReason },
>                 answers: { requestId: string }): ConversationState        // ADR-017
> //   四入口（单卡允许/拒绝、记住、批量、文本恰一）＋规则命中全收敛于此函数——allow 与 deny 同权入态，
> //     取代旧"reject 进门、allow 旁路"半接态（t000073 病灶的领域根治；D5 hasApproval effect 退役）
> //   身份闸＝requestId∈窗 ∧ 目标记录 state∈{queued,pending}（可决记录，§2 术语）：
> //     miss/已决 → no-op ＋ conversation.stale_input_discarded（detail 携 requestId×窗态）——无钟可撞（撤钟裁定）
> //   approved → 记录 state=approved + decidedBy('user'|'rule')/decidedAt；执行由调用层凭窗内记录
> //     二次 execute 携 requestId（main 校验 id 属本进程世代台账 ∧ 可决 ∧ argsFingerprint 等值——renderer
> //     盲信面 approved:true 关闭）；A 阶段"只记不判"为过渡豁免（实现期条款，非领域语义）
> //   batch:window / reject-rest → 对目标集每 id 各记一条（一决定 N 记录；整批拒为常规档治僵窗）
> //   denied → state=denied + reason 必填（不变量 8）+ 回填模型；拒绝记录进 actionGate 同轮同类短封（C6 机制不变）
> //   规则命中（drain 时判定）：decidedBy='rule' 同闸同记——预先裁决＝先前用户决策的延迟执行（A0 §3.2 规则 2）
> //   槽效果：本决定后窗内无可决 pending 且无 queued 可 drain ⇒ pending='approval' 随窗派生清除
> ```

**C5c. 新转换族登记块（§3.4 末尾追加）**

> ```
> approvalRequested(s, record{requestId,kind,tool,subject,argsFingerprint}, slotBusy)
> //   同 id→no-op（幂等；成立前提＝签发唯一性条款跨重启唯一，否则撞号旧 expired 记录吞新请求）；
> //   slotBusy（确认卡占槽）→ state=queued 入窗不置槽；否则 pending 入窗＋置槽呈现
> approvalExecutionSettled(s, requestId, 'done'|'failed')   // 执行回写收敛（批了但失败→failed，防双真相）
> windowResolved(s)                                          // pending+queued 归零 → 槽释放（若 goal/plan/resolution 无卡）
> drainQueued(s)                                             // 槽释放后 queued→pending、置槽（单向派生链的推进步）
> expireWindow(s, reason:'restore'|'disconnect'|'ttl'|'turn-end')
> //   恢复即全部未决→expired；approved∧未 settled→settled('failed')（可重批＝唯一安全解）
> ```

**C5d. restorePending（恢复旁路——最高危行）**

- **原句出处**: `intent-confirmation-domain-design.md:263-265`（"restorePending(state, decisionContent)……直置 pending＝dc.kind……不走 transition、不 emit、不推号……"）
- **替换文本**:

> ```
> restorePending(state, decisionContent)   // 恢复旁路（§8.2E）——限确认卡族（goal/plan/resolution/system_clarify）
> //   直置 pending＝dc.kind、decisionContent＝dc、decisionInstanceSeq＝dc.instanceId、
> //   activeDescriptor＝descriptorOf(dc.kind, dc)；不走 transition、不 emit、不推号（续号不回 0）——仿 restorePlanned 先例
> //   授权面不经本旁路恢复旧卡：窗快照（独立会话级字段）恢复即执行 expireWindow('restore')——
> //   未决一律 expired、approved∧未 settled 一律 settled('failed')（ADR-017 §6-3；"重显 approval 卡"语义废止）
> ```

（同文档 `:405` §8.2E "重显＝重显同实例……补 dc.approval 恢复"行必须随行改述——见 §6 追加 A11、矛盾 M2。）

### C6. §3.5 事件表两行

- **原句出处**: `intent-confirmation-domain-design.md:279-280`（decision.requested / decision.resolved 行）
- **替换文本**:

> | `decision.requested` | 决策点出现：确认卡族＝kind+instanceId+decisionContent 快照；**授权族＝随 approvalRequested 开窗发（detail＝窗快照+requestId；一开窗一发不推号）**——呈现内容唯一记录 |
> | `decision.resolved` | 确认/拒绝：确认卡族携 answeredInstanceId；**授权族携 requestId+outcome+decidedBy('user'|'rule')**——审计回放键按族二选一（ADR-017 §6-1，decisionContent.approval 面退役、不留双存储） |

（§3.5 注末追加：`deriveStateEvents 对 approvalWindow 增派生规则；过滤器翻转使 plan-batch/未决卡可投影恢复——旧档 hydration＝空窗＋旧世代全 expired（hydrate 补水式）。`）

---

## 5. T1-D 组：`docs/tests/coverage-matrix.md` Inv1/Inv7 行

- **原句出处**: `coverage-matrix.md:11`（Inv 1 行——语义列"决策唯一输入——无决策无推进（实例寻址后措辞源 00 §3.2·ADR-015）"）
- **替换文本**:

> | Inv 1 | 决策唯一输入——无决策无推进（**含预先规则裁决**：命中＝decidedBy:'rule' 同门登记；确认卡 instanceId+kind、授权面 requestId 寻址——措辞源 00 §3.2 规则 2·ADR-015/ADR-017） | conversationState.test.ts::Inv 1 决策唯一输入 ＋ ::ADR-015 决策点实例身份与身份门（**授权面用例随 B7 改按窗转换族六函数重写＋§7 五防线：接管不推号/id∉窗 no-op+stale/expired 后 settled→failed/归零释放槽/batch 逐 id 记账——措辞列先行，用例指向 B7 批次同步**） | ✅（现存用例锁定旧态至 B7） |

- **原句出处**: `coverage-matrix.md:17`（Inv 7 行——"PENDING 单一——单值 + 状态空间（同 kind 可跨实例延续，答复绑被应答实例——ADR-015）"）
- **替换文本**:

> | Inv 7 | PENDING 单一——**改述：槽单值不变 + 授权面单窗 N 可寻址**（窗 requests 集合、requestId 签发跨重启唯一→同 id 幂等；同 kind 跨实例延续仅限确认卡族；答复绑被应答对象＝instanceId 或 requestId） | conversationState.test.ts::Inv 7（+B7 新增：签发唯一性/撞号吞请求封堵、槽呈现互斥（确认卡占槽→窗 queued 不置槽）、drainQueued） | ✅（同上行注） |

（表 2 `:37` session.pending_set、`:42` tool.approved/rejected/remembered、`:51` decision.* 行为**下游随行**——B3/B8 批次同步，落稿时语义列加"B7/B8 改接"注即可，见 §6 追加 A15。）

### intent-design §4 不变量清单（与 coverage-matrix 同源的文档侧行——必改，见追加 A9）

- **原句出处**: `intent-confirmation-domain-design.md:297`（承载映射行）、`:299`（Inv 1）、`:305`（Inv 7）
- **替换文本**（:299/:305 与 :297）:

> 1. **决策唯一输入**：状态推进只能由针对当前决策点实例（确认卡族 answers.instanceId+kind）或窗内可决记录（授权面 requestId 经 approvalDecided）的用户决策发生——**含其预先规则裁决**（规则命中＝先前用户决策的延迟执行）；不符＝no-op（唯一措辞源 A0 §3.2，ADR-015/ADR-017——承载：§3.4 身份门 + setPending 推进 + 窗闸）。
> 7. **PENDING 单一**：任一时刻只有一个决策通道占槽（继承）——授权面为**单窗、N 可寻址目标**（ADR-017 改述；d000011 边界两轴确认：判据在解冻语义 windowResolved 归零才释放槽/解冻，无多槽、无部分批准解冻并发）。同 kind 跨实例延续仅限确认卡族。
> :297 承载映射行 → "…**Inv 1/8 → §3.4 状态转换函数（userDecided 身份门 + approvalDecided 窗闸 + setPending 推进）**；Inv 6 → derivePlannedFiles；Inv 7 → 槽单值（deriveDecisionPoint 单值返回 + pending: PendingKind 类型）× 窗 requests 可寻址（状态空间测试——B7 扩容）"

---

## 6. T2 矛盾扫描 + 落稿清单扩容判定

### 6.1 引用点清单与判定（grep 全 docs/，概念族：pending='approval' / 授权卡 / hasApproval / approvalDecided / taskTrust / decisionInstanceSeq / ApprovalRequest）

| 引用点（file:line） | 内容 | 判定 | 理由 |
|---|---|---|---|
| 00:58 BC 职责边界判定表·授权行 | "确认点状态机（授权卡=会话级 pending）→ Conversation……授权卡触发会话 pending，批准结果进信任集合" | **追加 A1** | "触发 pending"被"窗派生呈现"取代；"批准结果进信任集合"被三档拆分——该行是提案域归属卡（§1 表）在 00 的现文本锚点，不落则与 A 组草案直接打架 |
| 00:157 §3.5b "ask 才产生授权请求（ApprovalRequest…）" | ask 产出物 | **追加 A2**（半句） | 补"入窗（approvalRequested）"落点；其余保留 |
| 00:176 §3.6 "→ 决策点：approval（授权卡）" | 派生行 | **追加 A3** | 同 C4 镜像 |
| 00:191/195 §4 推进保障"授权卡悬挂时""恒不强制" | 现象描述 | 豁免 | 槽语义未变（派生值名保留），悬挂描述仍真 |
| 00:264/266 §8 矩阵、00:294 §9 授权术语行 | 产品形态/术语 | 264/266 豁免；**294 追加 A4** | 294 需补 requestId/窗（§9 是设计 §2 通用语言同源行） |
| 02:68/73/83/84 §4.2 | PENDING 图与要点 | **追加 A5**（B1 覆盖） | 唯一措辞源指针行 |
| 02:92/94 调研对照表 | 历史调研结论 | 豁免 | 记录的是当时对照，非现行规范句 |
| 02:152/158 §4.12 busy 表"授权卡已呈现＝非 busy""待授权例外" | busy 判定 | 豁免 | 呈现态判据不变（卡＝窗 pending 记录呈现，仍是 decision-pending）；ADR-013:21/27 同判（其"待授权"例外读槽值 `pending==='approval'`，派生后该值仍成立） |
| 02:186-194 §4.8 | 信任机制段 | **B 组主靶** | — |
| 02:303 §8 术语 | 授权行 | **追加 A6**（B6 覆盖） | — |
| 03:50/70 战略设计 | 指标+能力清单 | 豁免 | deny>allow>ask 表述在"显式序"下仍真；滞留率指标仍可测 |
| 04:14（M4 实现形态注）/56/64-65/77-78/90-92 | Task 聚合注 + Conversation 聚合图（"来源：…授权卡"） | **追加 A13** | :14 注内"用户决策是下一状态唯一输入（唯一措辞源 A0 §3.2·ADR-015）"须按 ADR-015 #8 单源纪律改引新 ADR 编号；:64-92 图与要点同步 B1/A2 口径 |
| 04:199-205 ApprovalRequest 值对象 | 与 intent-design §3.2 同源 | **追加 A13** | 补 ApprovalRecord（C3 镜像） |
| 04:285-293 TaskTrust + :298-307 AuthorizationService + :312 实现形态注 | 信任/裁决 | **追加 A13** | :312"任务级信任集合部署于 renderer（taskTrustRef）"＝提案 §5"taskTrust 现 renderer-only 随 §5 修"直接靶点；addTrust 签名随三档 |
| 05:14/89/114/128 架构图"授权卡"组件行 | 呈现视图 | 豁免 | 组件形态未变（窗之上的呈现） |
| 06:37/41 tool.approved/rejected/remembered、:49 session.pending_set kind 枚举、:185-186 decision.*、:190 注 | 事件清单 | **追加 A14** | 载荷+requestId/decidedBy；remembered 语义改"规则档位登记"；pending_set(approval) 触发者改为窗派生；事件权威=timeline.ts 注册表（B3 施工时文档随行） |
| 08-domain-design-audit:20/28/47/49/96/98 | 历史审计 | 豁免 | 00 §10 处置：08＝历史审计不回改 |
| 09-traceability:21 | 信任阶梯需求映射行 | 豁免 | 行内引"§4.8"指针——B 组改 §4.8 后该行经指针自动跟进；产品措辞"允许并记住"仍有效（三档的 UI 呈现名） |
| 07-api-gateway:49 | pending 悬挂→auto | 豁免 | 槽值保留 |
| intent-design 自身 :157（§3.3）/:225（descriptorOf approval 行）/:297/:299/:305（§4）/:324（§5 taskTrust 继承 V2）/:405（§8.2E）/:427（§8.4 授权疲劳/信任领域 V2 不动） | 同文档未列段落 | **追加 A7-A12（必改）** | §8.4:427 与 §5:324 说"信任领域 V2、taskTrust 继承现状"——提案 §5 已把三档/persistent 拉入本次修订（setRules 接线激活），不落即自斥；§8.2E:405 与 C5d 直接对立（矛盾 M2）；§4 Inv 行是 coverage-matrix 的语义源（矛盾 M5） |
| decisions/013:21/27、014 全篇 | 历史 ADR | 豁免（013 例外条款仍真；014 已被 015 部分取代在先） | ADR 历史不回改（ADR-016 代价条款） |
| decisions/015:18/30（approval 铺骨架/携 answers/approvalGranted 不叠 epoch 条款） | ADR-015 的 approval 半壁被 v3.1 取代 | **追加 A16** | 不回改 015 正文；**新增 ADR-017**（本提案落稿 ADR）声明"取代 015 #2/#5 中 approval 面条款 + #6 中 dc.approval 恢复条款"，000 索引:26 后加行——否则 intent-design §3.4 草案与 §2 行出现"两套 approval 寻址"（矛盾 M3） |
| product/01-user-flows:282 | "允许（一次/记住）" | **追加 A17**（低优先） | 三档措辞对齐 |
| product/02:245/805、product/07:33/37/72 | 组件视图/指标（授权卡滞留率以 decision.requested(kind=approval)→resolved 时长埋点） | 豁免 | 指标源在载荷变更后仍可测（时长锚点不变）；组件行描述呈现 |
| stage-specs/S6/D3、design/stage-specs 各文件、structured-protocol-full-research:56、decision-point-identity-model-proposal、domain-model-amendment-2026-10-02、superpowers/plans/\*、audits/\*（含 t000073:12、v11:14） | 阶段工件/历史提案/计划/审计 | 豁免 | 历史过程文物不回改（ADR-016）；t000073/v11 恰为本案证据链；竞品调研报 :31 双键建议**已由提案 §8③ 勘误**，无需追加动作 |

### 6.2 草案间矛盾登记（落稿时必须整体自洽的检查点）

| # | 矛盾 | 化解（草案已内置处） |
|---|---|---|
| M1 | "决策唯一输入"句 vs "规则命中也写状态" | A 组 A3：规则裁决以**骑注内嵌**进 00 §3.2 要点 2 同一句——禁止另立第二句（防双源，ADR-015 #8 纪律） |
| M2 | "恢复即 expired"（C5c/C5d）vs §8.2E:405 "重显同实例、补 dc.approval 恢复" | A11 必改：§8.2E 限定确认卡族 + 授权族改引 expireWindow |
| M3 | decisionInstanceSeq 适用范围（C2 注）vs ADR-015 #2/#5 approval 条款 | A16 新 ADR 声明取代关系；00:102/02:84/intent:41 三处指针行同步改引 ADR-017 |
| M4 | instanceId+kind 匹配（00:102 现句）vs approval 面 requestId 寻址 | A3 已把两族寻址并入同一句、各族限定——落稿后 grep "instanceId+kind" 不得再出现在未加"确认卡族"限定的位置 |
| M5 | coverage-matrix Inv1/Inv7 语义列 vs intent-design §4 不变量原文 | D 组与 A9 必须**同批**落（矩阵语义列的出处就是 §4）——只落一侧即断追溯链 |
| M6 | 提案 :24 "全局唯一**单调** id" vs v3 "领域内无序号" | 落稿文本一律用"**唯一**（跨进程跨重启）"，不用"单调"（单调性属签发实现细节；00/02/intent 三稿已按此措辞——防被读成领域排序字段回归） |
| M7 | 三档 vs clearTrust（02:193）/taskTrust 语义 | 见 §7 缺口 G1——提案未裁，落稿**保留 :193 原文**并加"三档×任务边界待裁"引注，不发明裁定 |
| M8 | "可决记录"双定义风险（§4 文本批准"恰一"计 queued 与否） | C1 术语行定义 state∈{queued,pending} 为可决；文本批准闸判"恰一可决记录"沿用同一定义（提案原文即如此，不再分化） |

---

## 7. 落稿预演暴露的待裁缺口（提案侧补裁，落稿不代裁）

- **G1 clearTrust × 三档映射未定义**：任务边界（新目标确认）清空任务信任集合是现文（02:193/04:310），但 session grant / persistent 规则在任务边界是否清除、once 之外的持久规则是否跨任务，提案 §5 未裁。02:193/04 相关行落稿只能原样保留。
- **G2 plan-batch 双记录链**：plan-batch 决定"入窗统一存续"但决定内容仍走 approvalGranted＋planConfirmed 硬序门（提案 :27）——approvalDecided 与 approvalGranted 两函数对同一 approve-files 卡的职责切分句（谁写窗、谁开清单门）在 intent-design §3.4 现文无落点，B2 施工前需一句裁定。
- **G3 `restorePending 签名扩容归阶段 C`（提案 :64）**：落稿文本把恢复语义写全（C5d），但签名细节留 C——文档与实现存在一个批次窗，§7 已注明"实现期条款"，无碍。

---

## 8. T3 术语统一表（草案命名字典）

| 定名 | 弃用/混用形态 | 规则 |
|---|---|---|
| **授权窗口**（ApprovalWindow，字段 `approvalWindow`） | 授权请求集合 / window / 窗（正文首次出现用全称，同段后续可用"窗"） | 概念中文定名"授权窗口"；提案 §1 标题句"授权请求集合 ApprovalWindow"不再复用 |
| **授权请求记录**（ApprovalRecord，窗 requests 成员） | 记录 / 可决记录（作状态限时） | 结构名＝记录；"可决记录"仅为 `state∈{queued,pending}` 筛选限词，首次定义后复用（C1） |
| **槽**（pending）／**占槽 / 置槽 / 释放槽** | 窗口呈现 / 互斥 | pending 单值呈现槽沿用 00"单一 PENDING"既有术语不改名；`pending='approval'` **槽值保留**（全仓 11 处引用零改——派生只换来源，不换值名，这是豁免表成立的前提） |
| **单窗 N 可寻址**（不变量 7 改述语） | 单窗、N 可寻址目标 / 多卡一窗 | 00 无编号不变量——不变量 7 落位＝intent-design §4 + coverage-matrix；00 侧对应句＝§3.2 要点 1（A3 已并入"单窗、N 可寻址"语） |
| **requestId**（审批寻址键） | 审批 id / tc.id | 双 id 并存文档化：**tc.id＝卡定位、requestId＝审批寻址**（提案 B6）——落稿文本只在 approvalDecided/闸语境用 requestId |
| **推号 / 不推号**（decisionInstanceSeq） | 递增 / 叠 epoch | 统一"推号"；approval 面固定句式"不置槽不推号" |
| 转换族名 | — | `approvalRequested / approvalDecided / approvalExecutionSettled / windowResolved / drainQueued / expireWindow` 全稿一律用函数名，不自造中文译名（"清窗""排水"等禁用） |
| **规则三档**：once / session grant / persistent | 记住 / 允许并记住（UI 呈现名保留） | 领域文本用三档名；"允许并记住"仅在产品/UI 语境（09/02 §8 信任阶梯行保留该词） |
| **恢复即 expired/failed**（expireWindow 效果句） | 判据化终结 | 规范句固定为"恢复即全部未决→expired；approved∧未 settled→settled('failed')" |

---

## 9. T4 落稿清单扩容与风险排序

### 9.1 扩容后完整落稿清单（原 4 组 → 4 组 + 17 追加）

**原清单（修正指针后）**：00 §3.2/§3.4 ｜ 02 §4.8（原误标"§2/§4.6"）＋§4.2 ｜ intent-design §2/§3.1/§3.4/§3.5 ｜ coverage-matrix Inv1/Inv7

**追加（A 组）**：
- A1 00:58 BC 判定表授权行 ｜ A2 00:157 §3.5b ｜ A3 00:176 §3.6 ｜ A4 00:294 §9 术语行
- A5 02:73/83/84 §4.2 指针行 ｜ A6 02:303 §8 术语行
- A7 intent-design §3.2 值对象（:123-128 + :225）【必改】 ｜ A8 intent-design §3.3 deriveDecisionPoint（:157）【必改】 ｜ A9 intent-design §4 Inv1/Inv7/承载映射（:297/:299/:305）【必改——M5】 ｜ A10 intent-design §5 :324 ｜ A11 intent-design §8.2E :405【必改——M2】 ｜ A12 intent-design §8.4 :427【必改——§8.4 与 §5 两处"信任领域 V2 不动"若不落，直接压住提案 §5 三档激活】
- A13 04 §1.1/:14/§1.2:56-92/§2.3:199-205/§2.6-2.7:285-312 ｜ A14 06 :37/:41/:49/:185-186/:190
- A15 coverage-matrix 表 2/表 4 随行注（:37/:42/:51/:84） ｜ A16 **新增 ADR-017 + 000 索引行**（声明取代 015 的 approval 面条款——M3） ｜ A17 product/01-user-flows:282（低优先）

**豁免（B 组，登记不落）**：00:191/195/264/266 ｜ 02:92/94/152/158 ｜ 03 ｜ 05 ｜ 07-api-gateway:49 ｜ 08（历史审计） ｜ 09:21（指针自动跟进） ｜ product/02、product/07（指标可测性验证后豁免） ｜ decisions/001-014（历史）+ 013 例外条款（语义仍真） ｜ stage-specs ｜ superpowers/plans ｜ audits/\* ｜ 竞品调研报（提案 :80③ 已勘误） ｜ 两份历史提案（identity/amendment 10-02）。

### 9.2 "改一处牵动 N 处"风险排序

1. **R1——00 §3.2 要点 2（唯一措辞源句）**：被 02:84、04:14/56/91、intent-design:43/299、coverage-matrix:11、ADR-015 #8 共 **≥8 处**以"唯一措辞源"引用。扩充必须**一句内嵌**（确认卡族寻址＋requestId 寻址＋规则裁决骑注三件），任何一件外挂成句即毁单源、下游引用全数漂移。
2. **R2——恢复语义（expireWindow vs restorePending/§8.2E/ADR-015 #6/coverage-matrix 表 4 :84）**：一条裁定横跨 4 个文档族（intent-design 两处、06、矩阵），且是**行为反转**（重显→判死）——漏改任一处即两套恢复规则并存。
3. **R3——decisionInstanceSeq 适用面收缩**（00:102、intent-design:41/64/89/235、ADR-015 approval 条款、矩阵 Inv7）：两轴边界句，改坏＝同一文档内 approval 既有"铺骨架算签名"又有"不推号"双态。
4. **R4——approvalDecided 签名/闸改型**（intent-design:255、:297、矩阵 Inv1、02 §4.8、ADR-015 #3 历史记录）：下游还有 B4 四入口改线与 B7 L1 重写承接。
5. **R5——规则三档**（02:189/191、04:285-307/312、intent-design:46/324/427、00:294、product/01:282）：面宽但每处浅；风险点在 04:312 实现形态注与 G1 未裁项纠缠。
6. **R6——事件载荷扩展**（intent-design §3.5、06、矩阵表 2、product/07 指标锚点）：文档面半句级，真正牵动在 timeline.ts 注册表（B3），文档落稿不阻塞。

---

## 10. 审计声明

- 本预演对 00/02/03/04/05/06/08/09/07-api-gateway、intent-design、coverage-matrix、decisions/000-016、product/\*、stage-specs、superpowers/plans、audits/\* 共 40+ 文件做只读取证，**未修改任何被演文稿**；唯一写入＝本报告。
- 落稿批次建议按 §9.1 清单整批替换（A1-A17 与四组合并一次落），落稿后以 `grep -n "instanceId+kind\|授权卡触发\|恒铺骨架，approval\|dc.approval\|V2（信任分级" docs/ -r` 作落稿自检断言（命中数应为 0/仅历史工件）。
