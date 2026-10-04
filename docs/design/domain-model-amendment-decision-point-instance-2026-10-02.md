# 领域模型修订定稿（干净版）：决策点一等身份与两轴分离

状态: **landed（2026-10-02 已按本表整段替换落三份原稿＋D 行单源化；原稿 git diff 即落位证据）｜后继勘误（2026-10-03）：本文 approval 面条款（恒铺骨架含 approval/`dc.approval` 恢复）由 ADR-017 取代（授权窗口一等化），确认卡族条款全部有效**｜ 依据: 提案 accepted `docs/design/decision-point-identity-model-proposal-2026-10-02.md` ＋ ADR-015（定稿）｜ 审计: `docs/audits/independent-audit-v8-twelfth-axis-2026-10-02.md`
用法: 本文为**独立完整的规范文本**——按下表落位**整段替换**原稿对应节；原稿（`intent-confirmation-domain-design.md` 等）仅作对照，不在本文做逐行 diff。

| 落位 | 动作 |
|---|---|
| `intent-design` §2（:41-42 两词条） | 替换为 A1（两行改＋插入 Descriptor 行） |
| `intent-design` §3.1 | **仅替换代码块 :54-75**；:77-81 推翻/继承清单**保留**，其后追加一行：➕ 新增 `decisionInstanceSeq`/`activeDescriptor`/`instanceId`（决策点实例身份——答复归属寻址，β 根因的领域解，ADR-015） |
| `intent-design` §3.4（:211-225 代码块） | 替换为 A3；块后追加 A3 末"渲染合同"段 |
| `intent-design` §3.5 事件表（decision.requested / decision.resolved 两行） | 替换为 A4；表后追加 stale 事件注段 |
| `intent-design` §4（不变量 1 :252、不变量 7 :258） | 替换为 A5；同节 :250 承载映射行同步：`Inv 1/8 → §3.4（userDecided/approvalDecided 身份门 + setPending 推进——签名携 answers）` |
| `intent-design` §4.1（:303 之后） | 追加 A6 一条 |
| `intent-design` §8.2E（:355-357） | 替换为 A7 |
| `00-domain-authority` §3.2 规则 2（:102） | 替换为 B1；§3.4 同句式**一处**（:114）改引 §3.2 |
| `04-tactical-design` §1.2（:64 行注） | 替换为 C1 |
| **D｜散落旧措辞单源化** | `02-domain-model.md`、`04:14/:56/:91`、`coverage-matrix:11` 的"用户决策是唯一输入"旧句 → 一律改引 ADR-015 编号＋`00 §3.2`，不各写一份（随落位批顺改，二轮复核） |

---

## A1｜§2 通用语言（词条定稿文本）

> | **决策点 DecisionPoint** | 「需要用户输入才能继续」的确定性状态：`待决策的目标 / 待决策的方案 / 待决策的授权 / 待对账的完成`。由系统对（状态 × 提议 × 动作）求值产生，**模型不能制造**。**具一等身份的实例**——身份＝其决策描述符（下行）；kind 为决策点**槽**（类别：goal/plan/approval/resolution；`system_clarify`＝委派槽——ADR-010 强制卡经 underlying 落四类，非原生 kind），承载协商连续性 `rejectStreak`（§4.1/ADR-001） |
> | **决策描述符 DecisionDescriptor** | 用户被要求**就其拍板的结构化内容**（deriveDecisionPoint 输出的值对象部分）——纯值、可等值比较。descriptor 实质变（或换 kind）＝**新决策点实例**（`instanceId`+1）；逐字/等值重提议＝**同实例**（延续）。字段白名单见 §3.4 `descriptorOf`，**排除模型措辞** |
> | **决策 Decision** | 用户对决策点**实例**的响应（携 `answers{kind, instanceId}`）：确认 / 拒绝（带原因）/ 修改（带修正内容）。**针对当前实例**的决策是状态推进的唯一输入（不变量 1，唯一措辞源 A0 §3.2） |

## A2｜§3.1 聚合 ConversationState（定稿文本——替换 :54-75 代码块）

```
ConversationState {
  // —— 确认状态（用户决策的累积结果）——
  goalConfirmed: boolean
  planConfirmed: boolean
  resolutionConfirmed: boolean
  // —— 会话级等待（单一 PENDING）——
  pending: PendingKind   // 槽：none | goal | plan | approval | resolution（system_clarify＝委派槽，A1 注）
  // —— 决策点身份（归属轴——ADR-015）——
  decisionInstanceSeq: number     // 当前呈现实例号：单调；setPending 按 descriptor 推进；初值 0；
                                  // 随会话序列化、恢复续号（不回 0、不与落盘 decision.requested.instanceId 撞号）
  activeDescriptor?: string       // 当前实例的决策描述符规范化键（descriptorOf 产物——"是否新实例"之基准）
  // —— 宿主边界（保留 A0 §5）——
  plannedFiles: Set<string>
  producedFiles: Set<string>
  // —— 推进数据（保留）——
  lastToolFailed: boolean
  // —— 当前待决策内容（决策点的「内容快照」——卡呈现与审计唯一来源）——
  decisionContent?: {
    kind: 'goal' | 'plan' | 'approval' | 'resolution'
    proposal?: GoalProposal | PlanProposal | CompletionClaim
    approval?: ApprovalRequest
    since: string
    instanceId: number            // ＝置位时 decisionInstanceSeq（镜像——卡/按钮 render 冻结与恢复重建的载体）
  }
  rejectStreak: number            // 协商轴：挂 kind/槽，与归属轴正交（§4.1/ADR-001 语义不变）
}
```

要点：`decisionContent` 恒有 `instanceId`（setPending 恒铺骨架，approval 置位须携 `ApprovalRequest`）；`rejectStreak`/`pendingRepeatCount` 等**不动**——协商轴与归属轴各管各的。（rejectStreak/pendingRepeatCount 系补记代码事实 conversationState.ts:122/:124，原稿 §3.1 素来未列，本次一并落准。）

## A3｜§3.4 状态转换（定稿文本——替换 :211-225 代码块）

```
// —— 决策描述符（纯函数，无 crypto；集合字段排序+去重 join）——
descriptorOf(kind, content): string
//   goal            ＝ statement
//   plan            ＝ files[].path 集 + verificationPlan 集
//   resolution      ＝ (command+passed) 对集 + diffs[].path 集   // 含 passed（§7-1 裁定：verdict 属被裁决对象）
//   approval        ＝ toolName + subject
//   system_clarify  ＝ underlying + statement（委派槽——门/递归见下）
//   排除：summary / assumptions / reason / risk / output / since 及一切模型措辞
//   注：插入序的 derivePlannedFiles 不可直接复用为描述符

// —— 归属轴唯一推进点 ——
setPending(state, kind, content?): ConversationState
//   descriptor = descriptorOf(kind, content)
//   kind ≠ state.pending ∨ descriptor ≠ state.activeDescriptor → decisionInstanceSeq + 1（新决策点实例）
//   描述符等值重提议 → 同实例（seq 不变——"重提议＝同一决策点延续"，队列确认语照落地）
//   decisionContent ＝ { kind, ...content, since, instanceId: seq }（恒铺骨架）；activeDescriptor ＝ descriptor；pending ＝ kind

userDecided(state, point, decision: { confirm: true } | { confirm: false, reason: RejectReason },
            answers: { kind: PendingKind; instanceId: number }): ConversationState   // 不变量 8：拒绝必带 reason
//   【身份门——不变量 1 唯一承载】state.pending !== 'none' ∧
//     ¬(answers.kind === state.pending ∧ answers.instanceId === state.decisionInstanceSeq)
//     ⇒ 整转换 no-op（连 rejectStreak 亦不动）——挡住全部 stale 形态：在途文本迟到、点旧卡、换 kind、
//     跨任务、同 kind 续提议后的旧答复。域门＝静默兜底；**事件与可见重提示是应用层义务**：调用前
//     前置探测，不符 ⇒ 不进本转换＋发 conversation.stale_input_discarded＋重确认提示（不吞文本、不回喂模型）
//   门比 state.pending（不比 point）——system_clarify 委派递归透传原 answers 自洽，无例外分支
//   pending==='none' 时门有意跳过——放行清理与任务边界 goal-confirm
//   门过后逻辑逐行不变：confirm 推进（goal/plan+plannedFiles/resolution 三态）；reject 回退+reason 回填；
//     rejectStreak 协商轴（§4.1/ADR-001）不因 descriptor 变而重置
//   （实现注：调用点迁移完成前 answers 暂可缺省＝跳门的**实现豁免**——过渡安排非领域语义；
//     凡"用户对卡作答"站点必携 answers，零缺省审计后收紧为必填——见实现计划 T4）

approvalDecided(state, request, decision: { confirm: true } | { confirm: false, reason: RejectReason },
                answers?: { kind; instanceId }): ConversationState
//   身份门同上（授权卡按 instanceId 寻址）。**本批 approval 面选边（依提案 §3＋t000073）**：
//     拒绝按钮携 answers（进门）；allow/文本批准天然无 answers＝旁路（另批接线），不进门不违规——
//     门随 answers 在场才生效，两权威在此兼容
//   允许：pending 清除（执行继续）；拒绝＋reason：pending 清除 + reason 回填模型 +
//     拒绝记忆登记（actionGate 同轮同类 deny——两层防绕过，C6 不变）

restorePending(state, decisionContent): ConversationState   // 恢复旁路（§8.2E）
//   直置 pending＝dc.kind、decisionContent＝dc、decisionInstanceSeq＝dc.instanceId、
//     activeDescriptor＝descriptorOf(dc.kind, dc)
//   不走 transition、不 emit、不推号（续号不回 0）——仿 restorePlanned 先例

applyToolResult(...)   // 继承（producedFiles/lastToolFailed）——不涉归属轴
```

渲染合同（应用层义务——ADR-015 #4）：按钮 onClick 携**渲染帧**的 `decisionContent.instanceId`；文本答复在**入队时刻**冻结 answers、flush 原样回传——绝不在 flush 按当时 pending 重冻。**main 镜像联动（第十二轴 P2）**：`setPlanConfirmed` 等 main 侧镜像仅在转换**真生效**（门通过）后执行——门 no-op 时镜像不得翻真（否则 approve-files 硬序门从门旁漏开）。

C2（:215 语义不变——ADR-014 #1）：pending 期间用户发新自由文本（改变意图）＝等价 reject 当前决策点实例（reason.kind='direction' + text=新意图）→ 新意图作为新 GoalProposal 输入 deriveDecisionPoint → setPending 新 descriptor ⇒ 新实例——"改意图⇒新决策点"判据由描述符精确化。

## A4｜§3.5 领域事件（两行定稿文本 + 表后注段）

> | `decision.requested` | 决策点出现（kind + **instanceId** + decisionContent 快照——新实例呈现的唯一记录） |
> | `decision.resolved` | 确认/拒绝（confirm/reject + RejectReason + **answeredInstanceId**——被应答实例，审计回放键） |

表后注：stale 答复走既有 domain=`conversation`：`conversation.stale_input_discarded`（detail＝被拒 answers{kind,instanceId} × 当前{pending, decisionInstanceSeq}；ADR-014 #6 旧载荷词 wantEpoch/curEpoch 作废，以本文为准）。实现注：TimelineEventType 联合与 TIMELINE_EVENT_SPECS **双写**（timeline.ts:116 Record 强制）；decision.* 已注册，零新增 domain。

## A5｜§4 不变量（两条定稿文本）

> 1. **决策唯一输入**：状态推进只能由**针对当前决策点实例**的用户决策发生（answers.instanceId+kind 匹配当前呈现；实例不符＝no-op——唯一措辞源 A0 §3.2，ADR-015——承载：§3.4 身份门 + setPending 推进）
> 7. **PENDING 单一**：任一时刻只有一个决策点（继承）。同 kind 可跨**实例**延续呈现；答复必须绑被应答的实例（见不变量 1）

## A6｜§4.1 协商保护（追加条定稿文本）

> - **两轴分离（2026-10-02 ADR-015）**：本节 `rejectStreak` 属**协商轴**（挂 kind/槽）；答复归属另由**归属轴** `instanceId` 承载（§3.4）。descriptor 变（新实例）**不**重置计数——"重提议＝同一决策点延续不重置"获得正交显式载体；"新意图＝新决策点、由 goal 边界/新任务重置"不变。ADR-001 语义不改。

## A7｜§8.2E 会话持久化（定稿文本——替换 :355-357）

> - 耦合点：decisionContent（决策点内容快照，**含 instanceId**）与 `decisionInstanceSeq`/`activeDescriptor` 必须随会话序列化——断点续做恢复后决策点内容与实例身份不丢。
> - 同步内容：serializeMessages/loadSession 支持上述字段（含 PlanProposal/CompletionClaim 结构与 `dc.approval`）。
> - 恢复时序规则（C5 修正保留）：恢复后 pending 冻结立即生效；goal/plan 决策点默认重显旧内容——重显＝重显**同实例**（恢复走 `restorePending` 旁路：直置、不 emit、续号不回 0，恢复后新 setPending 从持久 seq 续增，不与落盘 `decision.requested.instanceId` 撞号）。

---

## B1｜00-domain-authority §3.2 规则 2（唯一措辞源，定稿文本）

> 2. **pending 下模型动作无效**——模型后续工具调用不执行（做了白做）——状态保持 pending——**存在活 pending 时，用户决策（针对当前决策点实例——instanceId+kind 匹配）是下一个状态的唯一输入**；实例不符＝不作数（no-op，ADR-015）。无活决策点（pending＝none）＝无可推进实例（清理/任务边界路径，ADR-015 #3 门前置）

§3.4 同句式**一处**（:114）改引：`（唯一措辞源见 §3.2 规则 2）`；其余散落处见落位表 D 行——措辞不散落双源。

## C1｜04-tactical-design §1.2（定稿行）

> │ ◆ pending: PendingDecision | null   // 会话级等待（核心！）槽⊥实例ID（ADR-015）
