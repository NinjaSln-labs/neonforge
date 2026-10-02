# 领域模型修订提案：DecisionPoint 一等身份与两轴分离

状态: **accepted（§7 三问已裁，据领域模型定）** ｜ 日期: 2026-10-02
取代: `ADR-015 v3` / `domain-model-amendment v3` / 方案 v1–v7 的"decisionInstanceSeq 焊在 kind 地基上"累积形态（保留其结论为事实，概念重铸）。
不改写 `intent-confirmation-domain-design.md` / `00-domain-authority.md` 正文——那是本提案**接受后**的修批 Task。
关联: `ADR-014`（保留 C2 / 回声退通道，本提案沿用其 #1/#2）、`ADR-001`（rejectStreak，本提案给其正交载体）、`ADR-006`（不改）；取证 `docs/audits/as-is-decision-presentation-binding-2026-10-02.md`。

---

## 0. 病灶（一句话）

现领域模型把 DecisionPoint 建成**只有 kind、没有身份**的对象（`conversationState.ts:149 userDecided(s, point: DecisionKind, …)`），于是**两件事被迫挤进同一个 kind**：①"这是第几版待决内容"（答复归属），②"这一协商进行到第几轮"（rejectStreak）。β 的一切（同 kind 续提议迟到确认、点旧卡、approval 异步窗）都是这个"类别寻址冒充实例寻址"的后果。此前 v1–v7 在 kind 地基上焊 `decisionEpoch`，每焊一处崩一处（X1–X6/N1–N5），根因是**没先在领域里把身份立起来**。

## 1. 核心概念：DecisionPoint 具一等身份，且与协商连续性正交

**Ubiquitous language（将落 §2）**
- **决策点 DecisionPoint**：一次"需要用户决策才能继续"的**具名实例**。身份 ＝ 其**决策描述符 DecisionDescriptor**。
- **决策描述符 DecisionDescriptor**：`deriveDecisionPoint` 的**输出**——(kind + 用户实际被要求就其拍板的结构化内容)。它是纯值（由状态×提议×动作派生），**可等值比较**。
- **决策点实例号 `instanceId`**：单调、`number`。呈现新决策点时：`descriptor 变 → instanceId+1（新实例）；descriptor 未变（逐字/等值重提议）→ 同 instanceId（同实例）`。
- **决策 Decision**：用户对**某一 instanceId** 的响应（携 `answers: instanceId`）。
- **决策点槽 slot（=kind）**：决策的**类别**（goal/plan/approval/resolution）。承载**协商连续性 `rejectStreak`**。

**两轴（关键，正交）**

| 轴 | 载体 | 何时推进/重置 | 谁消费 |
|---|---|---|---|
| **归属轴**（哪一版待决内容） | `instanceId`（decisionInstanceSeq） | descriptor 实质变 → +1（`setPending` 处派生，纯判等值） | 答复校验（`isAnswerToCurrent`） |
| **协商轴**（第几轮拉锯） | `rejectStreak`（**不变**，挂 kind/slot） | 每次 reject +1；confirm / goal 任务边界重置；**descriptor 变≠重置**（同槽重提议仍延续，承 `ADR-001`/§4.1） | 无进展梯度 `detectUnproductiveDialogue` |

⇒ 用户拒 plan-v1 → 模型出 plan-v2（**新 instanceId，rejectStreak 不清**）→ 用户拒 v2（rejectStreak=2，同槽协商延续）→ 但任何"针对 v1 的在途答复"因 instanceId 失配作废。**归属与协商各管各的，不再互相打架**——这正是 ADR-001 与"队列确认语落地"两难能同时满足的原因。

## 2. 不变量修订

- **不变量 1（精确化，落 `00 §3.2` 唯一措辞源）**：状态推进只能由**针对当前决策点实例**（`decision.answers === 当前 instanceId`）的用户决策发生；实例不符＝不作数（no-op）。→ β 的原始根因"send 按【当前】pending 解释任何到达文本"从此有判据可拒。
- 不变量 2（决策点确定性）、7（PENDING 单一）不改，只是 7 补注：同 kind 可跨实例延续，答复须绑被写就的实例。
- C2（`intent-design:215`，改意图新文本→direction reject）**保留**：真·改变意图的文本仍是有效决策（它对当前实例作答、descriptor 变→新实例），不改语义（`ADR-014 #1`）。

## 3. 领域状态与转换（将落 §3.1/§3.4）

**ConversationState 新增**
```
decisionInstanceSeq: number                 // 当前呈现实例号（归属轴），初值 0
activeDescriptor?: string                    // 当前呈现实例的决策描述符规范化键（判"是否新实例"）
// decisionContent.instanceId 镜像 seq，供卡/按钮 render 冻结与恢复重建
```

**deriveDecisionPoint 的产物补 descriptor**：`descriptorOf(kind, proposal|claim|approval)` ＝ 结构化字段规范化键：
- goal ＝ `statement`；plan ＝ `files[].path` 集 + `verificationPlan` 集；resolution ＝ `evidence.verification[].command` 集 + `diffs[].path` 集；approval ＝ `toolName + subject`；system_clarify ＝ `underlying + statement`。
- **明确排除**：模型措辞/`summary`/`assumptions`/`reason`/`risk`/`output`/`since`。→ 破"LLM summary 必变→频繁误作废"两难（归属看**决策描述符**、非全文）。纯函数、可 L1 测、无 crypto（非哈希）。

**setPending（归属轴唯一推进点）**
```
newDesc = descriptorOf(kind, content)
seq = (kind!==pending || newDesc!==activeDescriptor) ? decisionInstanceSeq+1 : decisionInstanceSeq   // 等值重提议=同实例
铺骨架 decisionContent={kind, since, instanceId:seq}（approval 必带 ApprovalRequest 以算 desc）
```
**userDecided / approvalDecided（消费校验）**
```
if (pending!=='none' && !(answers.kind===pending && answers.instanceId===decisionInstanceSeq))
    return s                       // stale/点旧卡/换实例/跨任务 → no-op（护 :748：pending==='none' 跳过）
// 其余 confirm/reject + rejectStreak 逻辑完全不变
```
- 门比 `pending`（不比 `point`）→ system_clarify 递归透传 answers 自洽。
- 拒时 → `conversation.stale_input_discarded` + **可见重提示**（§6-D2）。
- **本批 approvalDecided 不强求 answers 通道**（allow/文本批准绕过本门，留 `ADR-015 #5`/t000073）；β 真身 goal/plan/resolution 面已闭合。

## 4. 事件与持久化（将落 §3.5 + sessionStore）

- `decision.requested` 带 `instanceId`；`decision.resolved` 带 `answeredInstanceId`（不新增事件类型，扩载荷）。stale 走 `conversation.stale_input_discarded`（既有 domain=`conversation`）。
- `sessionStore` 序列化 `decisionInstanceSeq`/`activeDescriptor`/`decisionContent.instanceId`；**恢复走专用 `restorePending(dc)`**（直置、不走 transition/不 emit/不推号——仿 `useConversationState.ts:97-104 restorePlanned`），补现漏的 `dc.approval`。

## 5. 分层（为何是领域、不是应用 hook）

身份＝`deriveDecisionPoint` 输出的**决策描述符**、`instanceId`＝其单调序号——纯函数派生、可等值、进 `ConversationState`、随会话序列化。**这是领域状态**。应用层 `transition` 只做**机械搬运**（把渲染帧的 `instanceId` 带给按钮、把入队时刻的 `instanceId` 冻进 answer）——视图不拥有身份，只回传它收到的 id。此前 C1（放 hook）是把领域欠的身份推给视图，恢复/审计/多源都要视图重算——正是"躲改领域"的代价，本提案不躲。

## 6. 与既有裁定对账

| 既有 | 关系 |
|---|---|
| `ADR-014 #1` 保留 C2 | 沿用，descriptor 使 C2 判据可精确 |
| `ADR-014 #2` 回声退通道 | 沿用（opts.echo，正交于归属） |
| `ADR-014 #3` decisionEpoch 递增判据 | **本提案取代**（归属轴 descriptor 推进，取代"绑行为/绑内容"两难） |
| `ADR-014 #5` kind 守卫 | **本提案并入单门**（归属门 ⊇ kind 守卫） |
| `ADR-001` rejectStreak 延续 | **语义不变**，仅获得正交归属轴（不再被迫兼职身份） |
| `ADR-006` 换目标 | 不改（新 descriptor→新实例→新任务边界） |
| `§6-D1`/`§6-D2` | 已锁：descriptor 排除 assumptions；stale→作废+可见重确认 |
| 十一轴 N1（approval 半接） | 本批 approval 对称不接门，回避 |

## 7. 裁定（2026-10-02，用户授权按领域模型自裁）
1. **resolution descriptor 含 `passed`——含**。据领域：resolution 决策点让用户拍板的**对象就是证据本身**（"对账这些证据，是否已解决"），证据条＝(command, verdict)——verdict 变（unverifiable→核验通过、红→绿）＝被要求裁决的内容实质变＝新实例；不含则"针对弱证据的在途确认"可命中"强证据重呈现"（不变量 1 违背面）。等值重提议 verdict 同⇒同实例，队列确认语照样落地（§6-D1 无矛盾）。⇒ resolution descriptor＝`command+passed` 对集 + `diffs[].path` 集。
2. **`instanceId`＝会话内单调 `number`，恢复续号，不设溢出防护**。依据：①答复只在活会话内到达，跨进程唯一风险是恢复重号——`loadSession` 从持久化 seq 续（不回 0，不与落盘 `decision.requested.instanceId` 撞号）；②任务边界/换目标**不重置 seq**（descriptor 变自然新实例，旧答复因失配作废——重置反而制造撞号面）；③JS 安全整数 2^53，会话内不可达——防护代码＝过度设计，不写。
3. **落地顺序确认**：①干净版定稿整段替换落三份原稿对应节（一次 docs 落地——原稿仅作对照，不做逐行 diff）→ ②新起实现计划（**不叠 v 号**）→ ③实现前重取 L3 基线（N≥3，裁 `core:161` 与 t000069"4 稳定红"冲突；ADR-012：基线汇报获裁后才进修批）→ ④实现。approval allow 接线留 t000073 另批。
