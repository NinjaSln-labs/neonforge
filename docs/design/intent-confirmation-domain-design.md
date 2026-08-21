# 意图确认机制——领域模型重设计（v1）

> 2026-08-16 · 依据：三视角调研（9 竞品文档 + 14 仓库源码 + 20+ 学术/工业）→ `analysis/competitor-crawler/reports/neonforge-intent-confirmation-research.md`（物理位置 `~/Documents/myself/analysis/competitor-crawler/`——仓库外，2026-08-16 第 14 轮审计 #5 标注）；领域对照分析 → `.scratch/neonforge-v1/intent-confirmation-domain-analysis.md`（本机私有——预设计对照）
> 原则：**从领域出发，不受现有实现束缚**（推翻没关系，向正确的道路前行）。沿用项目 DDD 重建先例（2026-08-14 会话状态机 S1-S6、2026-08-15 Timeline BC）——文档先行，分阶段落地，每步门禁。
> 本设计只覆盖「意图确认」有界上下文（Conversation BC 内）——工具执行/沙箱/授权执行层不在此设计范围（V2 另行）。

---

## 1. 领域故事（事件风暴）

**核心流程**：用户的意图 → 模型的理解与提议 → 决策点 → 用户决策 → 状态推进 → 执行 → 完成声明与证据 → 用户对账确认解决。

```
用户表达意图（一句话/纠错/追加需求）
  → 模型澄清（提问/候选——澄清是意图保真第一手段，AskToAct 学术共识）
  → 模型提议目标（GoalProposal：目标陈述 + 关键假设）
  → 【决策点：目标】用户确认/拒绝（拒绝带原因 → 模型调整）
  → 模型提议方案（PlanProposal：文件清单 + 假设 + 验证计划）
  → 【决策点：方案】用户确认/修改（拒绝带 modify 原因）/重出
  → 执行循环（ReAct：工具调用推进；动作经门控判定：只读自动/清单内自动/越界 ask）
  → 授权请求（ApprovalRequest：subject + reason + risk）→ 用户允许/拒绝（拒绝带原因）
  → 模型声明完成（CompletionClaim：声明 + 证据）
  → 【决策点：解决】证据对账 → 用户确认解决 / 指出未解决（带原因 → 模型继续）
```

**关键洞察（三视角）**：

1. **决策点 = 确定性派生的产物，不是模型文本的产物**——卡何时出现、呈现什么，必须是状态×提议×动作的纯函数（竞品：机制触发；学术：介入点按动作属性；我们现状：模型标记触发——反模式）。
2. **模型只能「提议」，不能「制造决策点」**——提议是值对象（携带结构化内容：假设/证据），决策点由系统对提议+状态求值产生。
3. **完成 = 声明 + 证据 + 用户对账**——模型自评不可靠（学术共识），完成确认必须对账到可核验证据。
4. **会话级单一 PENDING 冻结是正确的**（用户决策是下一状态的唯一输入——竞品逐动作确认导致卡悬挂时模型乱动的死锁，我们的冻结语义是解法）——保留，但**触发源重构**。
5. **推进保障 ≠ 逼调工具**——forceTool=required 与「模型需要停下来问用户」冲突；推进保障应逼「推进」（产出/提议/证据），不是逼「调工具」。

---

## 2. 通用语言（Ubiquitous Language）

| 术语                           | 定义                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **提议 Proposal**              | 模型产出的结构化主张：目标提议 / 方案提议 / 完成声明。模型可随时产出，**不产生任何状态变化**，只进入「待决策」或「待对账」                                                       |
| **决策点 DecisionPoint**       | 「需要用户输入才能继续」的确定性状态：`待决策的目标 / 待决策的方案 / 待决策的授权 / 待对账的完成`。由系统对（状态 × 提议 × 动作）求值产生，**模型不能制造**                      |
| **决策 Decision**              | 用户对决策点的响应：确认 / 拒绝（带原因）/ 修改（带修正内容）。决策是状态推进的唯一输入（不变量 1）                                                                              |
| **证据 Evidence**              | 完成声明的可核验支撑：验证命令+输出、测试结果、diff 对账、遗留问题清单。证据不足 = 声明不完整 = 不进入对账                                                                       |
| **动作属性 ActionAttribute**   | 工具调用的客观性质：只读 / 网络只读 / 清单内写 / 越界写 / 高危命令（kind：readonly / network-read / in-plan / out-of-plan / hazardous——§3.2 同源）。由门控判定（与模型自评无关） |
| **授权 Approval**              | 对「动作属性判定为需询问」的调用，向用户呈现请求（subject+reason+risk），用户允许（一次/会话/永久）或拒绝（带原因）                                                              |
| **推进保障 ProgressGuarantee** | 会话级不变量：确认后的会话必须持续推进（产出/提议/证据），防止「只说不做」；推进 ≠ 必须调工具                                                                                    |

---

## 3. 领域模型

### 3.1 聚合：Task（会话状态机——单一聚合，保持）

```
ConversationState {
  // —— 确认状态（用户决策的累积结果）——
  goalConfirmed: boolean
  planConfirmed: boolean          // 原 executionConfirmed——语义更准确：确认的是「方案」不是「执行」
  resolutionConfirmed: boolean    // 原 achievementConfirmed——确认的是「解决」不是「达成」（达成是模型声明）
  // —— 会话级等待（单一 PENDING——保留，触发源重构）——
  pending: PendingKind            // none | goal | plan | approval | resolution
  // —— 宿主边界（保留 A0 §5）——
  plannedFiles: Set<string>       // 由 PlanProposal.files 派生（追加语义）
  producedFiles: Set<string>
  // —— 推进数据（保留）——
  lastToolFailed: boolean
  // —— 新增：当前待决策内容（决策点的「内容快照」——卡呈现与审计）——
  decisionContent?: {
    kind: 'goal' | 'plan' | 'approval' | 'resolution'
    proposal?: GoalProposal | PlanProposal | CompletionClaim   // 结构化内容
    approval?: ApprovalRequest                                  // 授权请求内容
    since: string                                               // 决策点出现时间（诊断）
  }
}
```

**推翻/继承清单**：

- ✅ 继承：单一 PENDING、确认点三态、plannedFiles 追加语义、producedFiles、lastToolFailed
- 🔄 重构：`executionConfirmed` → `planConfirmed`（用户确认的是方案——与 PlanProposal 对应；「执行」是确认后的自动结果）；`achievementConfirmed` → `resolutionConfirmed`（「达成」是模型声明，用户确认的是「问题解决」）
- ➕ 新增：`decisionContent`（决策点内容快照——决策点呈现与审计的唯一来源；run4「用户确认了含未确认假设的方案」无法追溯的问题由此解决）

### 3.2 值对象

```
GoalProposal {                  // 目标提议（模型产出）
  statement: string             // 一句话目标（原【目标确认】文本）
  assumptions: string[]         // 模型的关键假设（用户从未确认过的细节——必须显式呈现）
}
```

```
PlanProposal {                  // 方案提议（模型产出——替代 parseExecutionPlan 的裸文件集合）
  summary: string               // 一句话方案
  files: Array<{ path: string; reason: string }>   // 文件清单（含理由——A0 §5 派生源）
  assumptions: string[]         // 方案假设（技术选型/行为细节——用户审阅点）
  verificationPlan: string[]    // 验证计划（怎么证明做成了——「已解决」的证据承诺）
}
```

```
CompletionClaim {               // 完成声明（模型产出）
  summary: string               // 做了什么
  evidence: CompletionEvidence  // 证据（不足 = 声明不完整）
}

CompletionEvidence {
  verification: Array<{ command: string; output?: string; passed?: boolean }>  // 可核验证据（Aider lint 循环/Cline verified 方向）
  diffs: Array<{ path: string }>                                              // diff 对账（用户原始目标 vs 声称完成）
  pendingQuestions: string[]    // 模型自己不确定/需要用户判断的事项
}
```

```
ApprovalRequest {               // 授权请求（动作门控产出——DSH ApprovalRequest 同构）
  toolName: string
  subject: string               // 要执行什么（命令/写哪个文件）
  reason: string                // 为什么需要授权（verbatim）
  risk: 'low' | 'medium' | 'high'   // 动作属性分级（ActionGate 判定）
}
```

```
RejectReason {                  // 拒绝原因（用户决策的一部分——Cline denial reason / Deep Code 回灌方向）
  kind: 'direction' | 'scope' | 'complexity' | 'missing-info' | 'modify' | 'other'
  // modify = 「修改」决策（§2 Decision 三型之一）：携带修正内容，模型按修正内容重提议——V1 表达方式：
  //   修改 = 拒绝（kind='modify'）+ 修正内容（text/target）→ 模型重提议；不单列状态转换分支（状态机保持 confirm/reject 二元——不变量 1/8）
  text?: string                 // 自由文本 / 修正内容
  target?: string               // 针对的具体内容（方案第几条/哪个文件/哪个假设）
}
```

```
ActionAttribute {               // 动作属性（门控判定结果——与模型自评无关）
  kind: 'readonly' | 'in-plan' | 'out-of-plan' | 'network-read' | 'hazardous'
  basis: 'tool-type' | 'command-head' | 'command-chain' | 'git-subcommand' | 'plan-list'  // 判定依据（审计）
}
```

### 3.3 领域服务（纯函数——L1 可测）

```
// —— 决策点派生（触发权重构——不变量 2：决策点 = 确定性纯函数）——
deriveDecisionPoint(state, proposals, pendingActions, userRequested?): PendingKind | 'none'
//   输入：状态 × 模型提议（结构化值对象）× 待执行动作（ActionAttribute 列表）× 用户主动请求（§3.6 性质 4——goalFallback 语义：用户可在无提议时主动发起确认）
//   输出：需要哪个决策（goal/plan/approval/resolution）或 none
//   - 目标提议存在 && !goalConfirmed → goal
//   - 目标已确认 && PlanProposal 存在 && !planConfirmed → plan
//   - 目标+方案已确认 && 动作属性需授权 → approval
//   - 完成声明存在（含证据）&& !resolutionConfirmed → resolution
//   注意：模型文本不再直接参与判定（提议已结构化为值对象——解析层负责，判定层只看状态）

// —— 门控（双维正交——不变量 3：SessionGate 优先于 ActionGate）——
sessionGate(state, action): { ok, reason }          // 会话状态冻结（单一 PENDING——继承现有 canExecute 的前半）
actionGate(action, policy): { verdict: 'allow' | 'ask' | 'deny', attribute: ActionAttribute, risk }
//   - readonly / network-read → allow（只读自动——DSH reads pass-through/Codex is_safe_command 方向）
//   - in-plan（write/edit 且文件在 plannedFiles）→ allow（清单内自动——A0 §5 保持）
//   - out-of-plan / hazardous → ask 或 deny（策略配置）
canExecute(state, action, policy) = sessionGate(state, action) 优先，通过后 actionGate(...)

// —— 只读判定（粒度升级——Codex is_safe_command 方向）——
classifyReadonly(name, command?): ActionAttribute['kind']
//   - 工具类型（read/search/LSP/check-capability → readonly）
//   - bash 命令头白名单（现有 BASH_READONLY_HEADS 保持）
//   - bash 链递归解析（&&/;/| 任一危险 → hazardous——现有只查链头后命令，不递归）
//   - git 子命令级（status/log/diff/show/branch 只读；push/commit/reset 写——Codex is_safe_git_command）
//   - 网络只读（curl GET/HEAD 无写副作用 → network-read 自动放行——run4 curl 弹卡问题）

// —— 完成对账（不变量 4：无证据不进入对账）——
// 2026-08-16 第三轮审计（C4）：仅「校验非空」会把对账退化回模型自评背书（run4 被推翻的状态）——
// 系统侧独立核验（两档）：
//   V1a 系统代跑核验：对 claim.evidence.verification[].command 中声明 passed 的命令，系统重新执行一次只读验证
//       命令核对输出（模型可发起命令，系统核验结果——「自报」降级为「系统复核」）
//   V1b diff 对账系统派生：claim.evidence.diffs 由系统从 plannedFiles/producedFiles 派生比对（非模型自述）
//   verification 命令非只读（系统不可代跑）→ 该条证据标记 'unverifiable'，计入 pendingQuestions 等价
verifyCompletion(claim: CompletionClaim, systemState): { ok: boolean; missing: string[]; unverifiable: string[] }
//   证据不足（verification 空 / pendingQuestions 非空 / 存在 unverifiable）→ ok=false + missing/unverifiable 清单
//   已知限制（§7 已知限制登记）：V1 系统核验覆盖只读命令；非只读验证命令的最终可信度依赖用户对账——残余风险显式声明

// —— 方案解析（替代 parseExecutionPlan——含假设与验证计划提取）——
parsePlanProposal(text): { ok: true; proposal: PlanProposal } | { ok: false; reason: 'no-block' | 'malformed' }
//   结构化解析【执行方案】块：文件清单（含原因）+ 假设行 + 验证计划行
//   路径合法性过滤保留（坑 102：垃圾条目不进清单）
//   解析失败降级（2026-08-16 第三轮审计 C3 修正——模型格式漂移是四轮 e2e 实证的常态）：
//     ok=false → 不产生决策点（卡不弹）+ 回填「无法解析方案——请按格式重新输出（文件清单/假设/验证计划）」
//     + 打诊断事件（proposal.plan detail 带 parse-error: reason）——原始文本保留在对话审计

// —— 完成声明解析 ——
parseCompletionClaim(text): CompletionClaim | null
//   结构化解析【已达成】块：声明 + 验证证据（模型自报）+ diff 对账点 + 遗留问题

// —— 推进保障（turnPolicy 重设计——不变量 5：推进 ≠ 逼调工具）——
decideProgressGuarantee(state, turn): { mode: 'require-action' | 'require-advance' | 'auto'; reason }
//   替代 forceTool=required 语义：
//   - 确认后无任何推进（无产出/无提议/无证据）→ require-advance（逼「推进」——允许模型输出提议/证据/提问，不逼调工具）
//   - 确认后无产出且工具可用 → require-action（原 required——但有 pending 时自动降级）
//   - 已有推进 → auto
//   pending 非 none → 恒 auto（继承 P1 修复——模型停住等用户）

// —— 方案清单派生（不变量 6 承载：plannedFiles 只由已确认的 PlanProposal.files 派生——追加语义 A0 §5）——
derivePlannedFiles(state, proposal: PlanProposal): Set<string>
//   返回 state.plannedFiles ∪ proposal.files（trustPath 规范化）——确认方案时由 userDecided 调用；
//   纯函数可测（L1：追加/去重/规范化）

// —— 续聊停止（继承已修复的 shouldStopContinuation——语义保持；无对应不变量——启发式服务，测试覆盖见 §9.2）——
shouldStopContinuation(state, lastMsgSignals): boolean
```

### 3.4 状态转换（唯一入口——继承）

```
userDecided(state, point, decision: { confirm: true } | { confirm: false, reason: RejectReason }): ConversationState   // 不变量 8：拒绝必须带原因（reason 必填）
//   - confirm=true：推进（goal → goalConfirmed；plan → planConfirmed + plannedFiles ∪= derivePlannedFiles(proposal)；resolution → resolutionConfirmed）
//   - confirm=false + reason：回退 + 回填 reason（模型调整方向——Cline/Deep Code 方向）
//   - pending 期间用户发新自由文本（改变意图——2026-08-16 第三轮审计 C2 归义）：等价 reject 当前决策点
//     （reason.kind='direction' + text=新意图）→ 新意图作为新 GoalProposal 输入 deriveDecisionPoint——
//     全部走 userDecided 入口（不变量 1 保持：状态推进唯一输入=用户决策）
approvalDecided(state, request, decision: { confirm: true } | { confirm: false, reason: RejectReason }): ConversationState
//   - 允许：pending 清除（执行继续）
//   - 拒绝 + reason（必填——不变量 8）：pending 清除 + reason 回填模型（防重试——「不要绕过」）
//   - 机制层防绕过（2026-08-16 第三轮审计 C6 修正——prompt 纪律不够）：拒绝的 ApprovalRequest（toolName+命令类）
//     登记拒绝记忆——actionGate 对**同轮内同类动作**直接 deny（gate.denied 事件）——「不要绕过」落到
//     reason 回填 + actionGate 短封两层
applyToolResult(...)  // 继承（producedFiles/lastToolFailed）
```

### 3.5 领域事件（timeline 注册表扩展）

| 事件                          | 内容                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `proposal.goal`               | GoalProposal 完整内容（statement+assumptions）——替代现 task.goal_proposed 文本摘要 |
| `proposal.plan`               | PlanProposal 完整内容（files+assumptions+verificationPlan）                        |
| `proposal.completion`         | CompletionClaim 完整内容（summary+evidence）                                       |
| `decision.requested`          | 决策点出现（kind + decisionContent 快照——含呈现内容的完整审计）                    |
| `decision.resolved`           | 确认/拒绝（confirm/reject + RejectReason）——现有 card.resolved 增强                |
| `completion.evidence_missing` | 完成声明被拒原因（missing 清单——新诊断事件）                                       |
| `gate.denied`                 | ActionGate deny（高风险动作被机制拦——非 ask）                                      |

现有事件保持（session.pending_set/cleared、tool.blocked、execution.forced/released 等）。

**事件注册表实现注记**（2026-08-16 第三轮审计 C 修正）：timeline.ts 的 TIMELINE_EVENT_SPECS 的 domain 为受限联合（'conversation'|'task'|'session'|'plan'|'tool'|'capability'|'execution'|'stuck'|'problem'|'card'）——新事件登记时：

- proposal._/decision._/completion._/gate._ 需**扩展 domain 联合**（新增 'proposal'|'decision'|'completion'|'gate' 四成员——S1 随注册表扩展）
- _*card.* 与 decision._ 两层并存**（不合并）：card.* = UI 卡生命周期视图事件（保留——消费方/dedupe 依赖），decision.* = 领域决策点事件（新）——语义对齐（decision.resolved 与 card.resolved 同时触发，detail 互补）——「并入」措辞澄清为「语义对齐」非事件合并

---

## 4. 不变量清单（L1 穷举测试规格）

> 承载映射（§9.2 覆盖矩阵依据）：Inv 2/3/4/5 → §3.3 领域服务（deriveDecisionPoint/sessionGate×actionGate/verifyCompletion/decideProgressGuarantee）；**Inv 1/8 → §3.4 状态转换函数（userDecided/approvalDecided——签名强制）**；Inv 6 → derivePlannedFiles；Inv 7 → deriveDecisionPoint 单值返回 + pending: PendingKind 类型（状态空间测试）。

1. **决策唯一输入**：状态推进只能由用户决策发生（无决策无推进——A0 §3.2 继承——承载：§3.4 转换函数）
2. **决策点确定性**：同一（状态×提议×动作）输入 → 同一决策点（纯函数；模型文本不参与）
3. **门控顺序**：SessionGate（冻结）优先于 ActionGate（属性）——pending 时任何动作无效（A0 §3.5 + §3.5b——2026-08-16 审计修正引用）
4. **无证据不对账**：CompletionEvidence.verification 空或 pendingQuestions 非空 → 不进入 resolution 决策点
5. **推进 ≠ 调工具**：推进保障的强制对象是「推进」不是「工具调用」；pending 时恒 auto
6. **方案单一来源**：plannedFiles 只由已确认的 PlanProposal.files 派生（追加语义 A0 §5 继承）
7. **PENDING 单一**：任一时刻只有一个决策点（继承）
8. **拒绝带原因**：拒绝决策必须携带 RejectReason（结构化）——回填模型

---

## 5. 与现状的差距（推翻/继承/新增总表）

| 现状                                                   | 处置                                                      | 原因（三视角证据）                                                            |
| ------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| pendingCardToShow（模型文本触发卡）                    | **推翻**——deriveDecisionPoint（状态×提议×动作）           | 学术：介入点按动作属性；竞品：机制触发；四轮 e2e：模型标记不可靠              |
| executionConfirmed                                     | **重构** → planConfirmed                                  | 用户确认的是方案（PlanProposal），「执行」是结果                              |
| achievementConfirmed + 已解决卡                        | **重构** → resolutionConfirmed + 证据对账门               | 学术：self-verification 不可靠；Cline verified/SWE reviewer/Devin 断言        |
| parseExecutionPlan（裸文件集合）                       | **推翻** → parsePlanProposal（含假设+验证计划）           | 竞品计划工件（Gemini .md 可编辑/DSH plan-review）；学术：确认内容含未验证假设 |
| forceTool=required（逼调工具）                         | **重设计** → decideProgressGuarantee（逼推进）            | 无竞品对应「逼调工具」；「逼验证」（Aider/Cline）是正确方向                   |
| canExecute（单维）                                     | **重构** → sessionGate × actionGate                       | DSH sandbox×approval 正交；Deep Code 10 类 scope                              |
| classifyAction（命令头二元）                           | **升级** → classifyReadonly（链递归/git 子命令/网络只读） | Codex is_safe_command；run4 curl 弹卡                                         |
| userRejected（无原因）                                 | **增强** → RejectReason 回填                              | Cline denial reason；Deep Code「不要绕过」                                    |
| 单一 PENDING / 任务边界信任 / plannedFiles 追加        | **继承**                                                  | 三视角确认的独有价值                                                          |
| shouldStopContinuation / StuckDetector / timeline 事件 | **继承**                                                  | 已修复/已重建                                                                 |
| taskTrust / delegateLowRisk                            | 继承（V2 扩展持久化+档位）                                | 竞品疲劳对策                                                                  |

---

## 6. 分阶段实施计划（S0/T0/S1-S7，每步全绿再进）

| 阶段                       | 内容                                                                                                                                 | 门禁                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| **S0 文档**                | 本设计定稿 + A0 §3.6/§3.5b/§4/§4.2/§5 同步 + 02/04/09/D0/01 文档同步（已完成——2026-08-16）                                           | 用户拍板 ✅                  |
| **T0 测试基建**（S1 前置） | MockBridge 工厂 + 场景装配器 + 断言 helper（§9.3——旧测试暂用，S3 迁移）                                                              | 基建自测（工厂可装配旧场景） |
| **S1 领域层重写**          | conversationState.ts 按新模型重写（值对象+deriveDecisionPoint+转换+不变量 1-8 全部 L1 测试——红→绿）；L1 按「不变量矩阵」组织（§9.5） | L1 全量 + 双 tsc             |
| **S2 提议解析**            | parsePlanProposal / parseCompletionClaim / verifyCompletion（含坑 102 过滤继承）+ L1                                                 | L1 + L2                      |
| **S3 renderer 接线**       | 卡渲染从 decisionContent 派生（触发权切换）、确认/拒绝带原因 UI、方案卡渲染（文件+假设+验证计划）                                    | L1 + L2 + L3 相关场景        |
| **S4 完成证据对账**        | 已解决卡条件 = verifyCompletion 通过；证据不足回填引导；completion.evidence_missing 打点                                             | L1 + L2 + L3                 |
| **S5 推进保障**            | decideProgressGuarantee 替换 forceTool（pending 恒 auto 继承）+ execution.forced 事件语义更新                                        | L1 + L2 + L3                 |
| **S6 门控双维**            | actionGate 接入（只读/网络只读自动、清单判定、风险分级）                                                                             | L1 + L2 + L3 + 冒烟          |
| **S7 回归与文档**          | L1-L5 全链 + e2e-0to1 PHASE=all + A0 全文审校 + HANDOFF 回填                                                                         | 全链绿                       |

**每阶段 commit**：`refactor(意图确认): S<N> —— <一句话>`；坑号续编（S1 起步 104）。

---

### 4.1 决策点协商保护（2026-08-16 第三轮审计 C8 修正——Inv 状态空间测试项）

- 同一决策点连续拒绝（含 kind='modify'）计数上限（建议 3 次）——超限：**回退 AskToAct 澄清**（模型必须输出结构化澄清问题收敛意图，不再直接重提议）或**人工接管提示**（状态栏提示用户手动输入明确指令）
- 计数随决策点确认/新提议重置；纳入 L1 状态空间测试（不变量矩阵扩展）
- **S1.1 实现裁定（2026-08-16 审计——`rejectStreak` 语义）**：模型重提议（setPending 带新 content）属**同一决策点延续——不重置计数**（否则「连续拒绝 3 次上限」因每次重提议清零而永远不触发——协商保护失效）；「随新提议重置」按 §3.4 C2 语义 = 用户新意图（pending 期间新自由文本 → reject(direction) + 新 GoalProposal）是**新决策点**——由应用层经 goal 确认边界/新任务重置（S3 接线）；领域层只承载计数（`rejectStreak`）。超限回退消费方 = S3

## 7. 待拍板问题（不阻塞 S1，但影响范围）

1. **PlanProposal 的可编辑性**：V1 先只读呈现（确认/修改/重出——修改=拒绝(kind='modify')+修正内容→模型重提议），还是直接做可编辑（Gemini 计划文件式——改文件后模型读回）？——建议 V1 只读呈现+「修改/重出」按钮，可编辑 V2。
2. **RejectReason 的 UI 形态**：拒绝按钮附结构化原因（kind：direction/scope/complexity/missing-info——modify 由「修改方案」按钮触发、other 走自由文本）+ 可选自由文本——建议结构化选项+可选文本（低认知负担；kind 全集见 §3.2）。
3. **网络只读放行范围**：curl GET 全放行，还是仅 localhost？（安全考虑）——建议 curl 对 localhost 自动放行，外网 GET ask。
4. **完成证据的验证执行**：~~V1 模型自执行+系统校验非空~~——**2026-08-16 第三轮审计 C4 已升级处置**：V1a 系统代跑只读验证命令核验 + V1b diff 系统派生 + unverifiable 标记（§3.3 verifyCompletion 签名已含 systemState）——**本拍板问题已关闭**；剩余拍板点：非只读验证命令（系统不可代跑）的残余可信度策略（建议：标记 unverifiable + 用户对账时显式提示「该证据未经系统核验」）。

### 7.1 拍板结果（2026-08-16 接收会话——4 项全按建议值定稿，S1 实施依据）

| #   | 决策                  | 结果                                                                                                                      |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | PlanProposal 可编辑性 | **V1 只读呈现**：确认 / 修改（拒绝 kind='modify' + 用户修正内容 → 模型重提议）/ 重出；可编辑（Gemini 计划文件式）V2       |
| 2   | RejectReason UI 形态  | **结构化选项 + 可选自由文本**：kind 全集 direction/scope/complexity/missing-info/other；modify 由「修改方案」按钮单独触发 |
| 3   | 网络只读放行范围      | **curl 对 localhost 自动放行，外网 GET ask**（安全默认；main preApproval 同步放行——S6）                                   |
| 4   | 非只读验证命令可信度  | **标记 unverifiable + 用户对账时显式提示「该证据未经系统核验」**（不禁止，仅标注）                                        |

---

## 8. 相关领域同步范围（与本次重设计耦合的领域——用户指示「需要就同步做」）

### 8.1 同步重构（本次一并做）

**A. 授权执行层（main 进程 `tools.ts` preApproval / filesApprovedRef / ipc）**

- 耦合点：`classifyAction` 是 renderer 与 main **跨进程同源共享**（坑 97 缝隙 4 设计——main preApproval 引用领域层判定）。`classifyReadonly` 粒度升级（git 子命令/bash 链/网络只读）后，**main 必须同步引用新判定**，否则 renderer 与 main 判定分裂重现。
- 同步内容：① classifyReadonly 上移领域层、main preApproval 改引用（继承现有同源机制）② 方案单一来源不变量（plannedFiles 由 PlanProposal 派生）与 main 的规划门控（filesApprovedRef「先 approve-files 再写」）对齐——main 门控语义不变，判定基准随领域层 ③ 网络只读（curl localhost）在 main preApproval 的放行。
- 阶段：S6（门控双维）一并落地。

**B. 推进检测（`agentLoop.ts` evaluateTurnProgress / detectStuck / StuckDetector）**

- 耦合点：forceTool 重设计为「推进保障」后，「什么算推进」的判定必须统一——现有 `evaluateTurnProgress` 只认「副作用工具成功 / 新 read」为进展，**无工具调用但有提议/证据输出不算推进** → 与「推进≠调工具」新语义冲突（模型输出结构化提议会被 StuckDetector 判停滞 → escalate 打断合法链——坑 99 教训重现）。
- 同步内容：TurnProgress 扩展维度——`proposed`（输出结构化提议）、`providedEvidence`（完成声明带证据）视为推进；StuckDetector 的「无进展」判定与新推进语义对齐；「只说不做」判定从「无工具调用」改为「无推进」。
- 阶段：S5（推进保障）一并落地。

**C. 提示词体系（`sysPrompt.ts`）**

- 耦合点：提议解析（parsePlanProposal/parseCompletionClaim）依赖模型的**格式输出**——现有 sysHint ⑬⑭⑮ 只教模型输出【目标确认】【执行方案】【已达成】标记；新模型要求模型输出**结构化内容**（假设清单/验证计划/证据格式）。提示词不改 → 解析层拿不到结构化输入。
- 同步内容：⑬ 目标提议格式（含「关键假设」行）；⑭ 方案提议格式（文件清单含理由 + 假设 + 验证计划）；⑮ 完成声明格式（声明 + 验证证据 + 遗留问题）；**拒绝原因应对（模型收到 RejectReason 后的调整规则——2026-08-16 第 15 轮审计 #1：编号不锁定——sysPrompt.ts 现状 ⑱⑲ 已占用（工具失败/重试纪律），新内容以「新增条目」落地，编号以 sysPrompt.ts 现状为准）**。
- 阶段：S2（提议解析）同步改（解析器与提示词必须同版本——格式契约）。

### 8.2 同步扩展（新增/登记，不重构）

**D. 事件体系（`timeline.ts` 注册表 + `docs/domain/06-domain-events.md`）**

- 新增事件登记：proposal.goal / proposal.plan / proposal.completion / decision.requested / decision.resolved（增强）/ completion.evidence_missing / gate.denied（§3.5）。
- 现有事件语义更新：task.goal_proposed 等保留（兼容审计），新事件带完整结构化 detail（决策内容快照——run4「确认了什么无法追溯」问题的解法）。
- 阶段：S1-S4 随各阶段登记（事件与状态转换同 commit）。

**E. 会话持久化（`sessionStore.ts` 断点续做）**

- 耦合点：decisionContent（决策点内容快照）必须随会话序列化——断点续做恢复后决策点内容不丢（否则恢复的会话卡内容空白、确认语义丢失）。
- 同步内容：serializeMessages/loadSession 支持 decisionContent 字段（含 PlanProposal/CompletionClaim 结构）。
- 恢复时序规则（2026-08-16 第三轮审计 C5 修正）：恢复后 **pending 冻结立即生效**（模型首轮只能响应用户对已有决策点的决策，不得新产出提议覆盖序列化的 decisionContent——与多提议归约规则 §3.6 性质 5 一致）；goal/plan 决策点恢复后**默认重显旧内容**，用户确认/修改后才更新。
- 阶段：S3（renderer 接线）一并落地。

### 8.3 测试与文档同步（每阶段门禁内）

**F. 测试体系**：整体推翻重设计（§9 测试域 DDD——独立重构域）：T0 测试基建 → L1 不变量矩阵（S1）→ L3 旅程场景重写（S3）→ L4 用户模拟对齐（S7）→ L5 基线更新（S3/S4）

- 坑 101（rejectedCardIdx 拒绝时序）**被新设计根治**（拒绝带原因后卡隐藏逻辑重设计——S3 内明确，不再单修）

**G. 文档**（全盘梳理后完整清单——含之前遗漏的 02/04/09/D0/user-flows）：

- `docs/domain/00-domain-authority.md`：§3.6（触发权）/§3.5b（动作属性门控）/§4+§4.2（推进保障+完成证据）/§5（PlanProposal+RejectReason）——已落地（原「新增 §7」计划因 A0 §7 已占用而改为内嵌相关章节，2026-08-16 审计修正）
- `docs/domain/02-domain-model.md`：**确认点流程描述（目标→能力→方案→执行→达成）随语义变化同步**——之前遗漏
- `docs/domain/04-tactical-design.md`：**Task 聚合五态状态机（clarifying→goal-confirmed→executing→achieved-reported→resolved）随状态机重设计同步**（该文档已写明「同一状态结构」——结构变则文档变）——之前遗漏
- `docs/domain/09-traceability.md`：**产品需求↔确认点映射表（GoalConfirmed/ExecutionConfirmed/AchievementConfirmed 行）随确认点更名/语义变化同步**——之前遗漏
- `docs/domain/06-domain-events.md`：新事件登记
- `docs/product/00-product-design.md`（D0）+ `docs/product/01-user-flows.md`：**用户旅程中的确认交互（方案卡/证据对账/拒绝原因）同步**——之前遗漏
- `.scratch/neonforge-v1/session-state-machine.md`：标注被本设计取代（引用指向）；`no-stage-refactor.md`：确认语义不变、卡出现时机变化（小幅）；**`intent-confirmation-domain-analysis.md`：预设计对照分析——值对象/事件命名以本设计终版为准**（审计 m3/m7 修正——analysis 的 achievementEvidence/plan.proposed 等为演进前形态）
- README 已知限制（如适用）：确认交互变化说明

### 8.4 明确不动（V1 范围外）

- **授权疲劳/信任领域**（authModel/taskTrust/delegateLowRisk）：V2（信任分级/模式档位）——V1 继承现状；actionGate 的 risk 分级**复用**现有 toolRisk/canMergeApprove 判定（不重构）
- **交付/产物领域**（DigitalDeliveryPanel/realChanges）：弱耦合（产物是执行结果），不动
- **网关/模型路由**（gateway）：不动（推进保障只改 tool_choice 判定逻辑，不改造网关）——**2026-08-21 更新**：`tool_choice: 'required'` 因 DeepSeek V4 全系拒绝（400——官方 issue #1376 + 实测）改为**恒 `auto`**，gateway 的 tool_choice 表达需同步（`provider-toolchoice-compat-research.md` §7；领域文档 A0 §1/§4、07 §1.1 已同步）——模型路由（ModelRouter）仍不动
- **工作区/能力领域**（check-capability）：不动
- **Compaction/候选块机制**（candidates.ts）：保留为**澄清输入通道**（模型澄清时仍可用候选块）——但「澄清优先」不依赖它（2026-08-16 第三轮审计 B 修正：调研结论「候选块可靠性差」——澄清的结构化落点是 **GoalProposal.assumptions**（假设清单显式呈现+可追溯：每条 assumption 标注来源「候选选择/澄清回答/模型推断」）；结构化澄清工具（AskToAct 式）为 V2）；sysHint ⑬ 格式契约微调衔接

### 8.5 设计文档内需明确的两个联动点（全盘梳理发现）

1. **问题台账关闭联动**（MainWorkspace `handleConfirmClosed` → problem.closed）：「已解决」确认语义升级为「证据对账」后，**问题关闭条件是否同步要求对账通过**（建议：是——resolution 确认即对账通过后才允许关闭；避免「用户点了已解决但问题没解决」的台账假关闭）
2. **goalFallback 语义**（agentLoop.goalFallbackTrigger——模型无标记时的兜底目标卡）：重设计后「决策点=状态×提议」——**兜底卡转为「用户主动确认通道」**（竞品 Plan 门同构：用户可主动发起确认，不依赖模型提议）——保留机制、明确语义，不随模型文本触发

### 8.6 已验证的有利事实（全盘梳理确认）

- main 进程只读判定**无残留双源**：`isReadOnlyBash` 已是 `classifyAction` 薄包装（tools.ts:332-333）——S6 classifyReadonly 升级只需改这一个包装
- 04-tactical-design.md 已确认「Task 状态与会话级 PENDING 承载于同一状态结构」——状态机重设计后该文档同步即可，无跨文档矛盾
- timeline 事件注册表（TIMELINE_EVENT_SPECS + A6 dedupe）已有登记机制——新事件按既有三步（登记→tlog→测试）

---

## 9. 测试体系重设计（测试域 DDD——用户指示：测试整体推翻重来，之前无系统性设计）

### 9.1 现状问题（四轮实测暴露）

| 问题                                                                                          | 实证                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| L3 每个测试重复写完整 mock bridge（27 个测试 27 份 mock 基建，仅小幅差异）                    | core.interaction.ts 各测试各自 addInitScript 完整 bridge                  |
| L3 场景是「剧本堆叠」不是「领域场景」——场景命名/组织与领域术语脱节                            | 测试按缺陷/修复命名（「问题 A」「P2」「执行确认卡不漂移」）而非按领域旅程 |
| L4 e2e 使用无阶段化前的阶段语义（requirement/design/development 方法名+「需求确认完成」文本） | e2e-0to1.mjs 的 StageMachine/requirement() 四轮一直在适配                 |
| 断言词汇不统一（同一语义多种断言写法）                                                        | toHaveCount/toContainText/toBeVisible 混用无约定                          |
| 测试与领域不变量/事件**无追溯关系**——无法回答「不变量 2 被哪个测试锁定」                      | 无覆盖矩阵                                                                |
| L1 测试按「函数」组织（conversationState.test.ts 按导出函数堆），未按不变量/状态空间系统组织  | 状态空间穷举有雏形（2026-08-14）但未成体系                                |

### 9.2 测试域模型（测试 = 领域不变量与场景的可执行规范）

```
测试域分层（保留 L1-L5 骨架——分层正确，组织原则重设计）：
├─ L1 领域逻辑：锁定「不变量」（§4 不变量 1-8 的穷举矩阵）+ 值对象解析/校验
├─ L2 契约：锁定「类型契约」（tsc 双配置——保留）
├─ L3 组件交互：锁定「用户旅程」（领域故事派生的场景——不是剧本堆叠）
├─ L4 体验 E2E：锁定「真实旅程」（真实 API 用户模拟——与领域术语对齐，无阶段语义）
└─ L5 视觉：锁定「渲染基线」（截图——保留机制，基线随 UI 更新）

测试对象（与领域模型一一对应）：
- 聚合（ConversationState）：状态空间穷举矩阵（3 确认 × 5 pending × 计划 × 产出 × 决策类型）
- 值对象（GoalProposal/PlanProposal/CompletionClaim/CompletionEvidence/ApprovalRequest/RejectReason/ActionAttribute）：解析、校验、序列化
- 领域服务（deriveDecisionPoint/sessionGate/actionGate/verifyCompletion/decideProgressGuarantee/derivePlannedFiles/shouldStopContinuation/parsePlanProposal/parseCompletionClaim）：输入空间边界（derivePlannedFiles——不变量 6；2026-08-16 第四轮审计补）
- 事件（proposal.*/decision.*/completion.*/gate.*）：转换派生断言（状态转换 → 断言事件序列）

**覆盖依据说明**：parsePlanProposal/parseCompletionClaim（值对象解析）与 shouldStopContinuation（启发式）无对应不变量——其 L1 覆盖依据是「值对象解析/校验契约」与「既有行为锁定」（继承自坑 103 测试）——非不变量矩阵成员，在覆盖矩阵中标注为「契约测试」类。

追溯关系（每个测试声明）：
- L1/L3 测试标注「锁定不变量 #N」或「领域故事步骤」——产出覆盖矩阵（测试 ↔ 不变量 ↔ 事件），CI 报告缺失
- 命名规范：describe = 领域对象/不变量；it = 场景/状态组合（不按缺陷号命名——缺陷修复测试并入对应不变量场景，注释保留坑号）
```

### 9.3 测试基建重构（先行——S1 前置）

1. **MockBridge 工厂**（`tests/interaction/mockBridge.ts`）：参数化构造（状态预设 + 模型行为脚本：按 chat 轮次发 chunk）——消除 27 份重复 mock
2. **场景装配器**（`tests/interaction/scenarios.ts`）：领域故事派生的标准场景（goal-clarify→confirm→plan→approve→execute→complete→reconcile 各步可组合）——测试 = 装配场景 + 断言
3. **断言词汇统一**：测试约定（可见性/计数/文本断言各自用统一 helper）——`tests/helpers/assertions.ts`
4. **L4 用户模拟对齐**：e2e-0to1 的 StageMachine 语义改为领域对齐（目标确认→方案确认→执行→完成对账——移除 requirement/design/development 阶段残留命名）

### 9.4 门禁体系（保留 CI 分层，明确触发）

- L1：每阶段必跑（领域层改动）；L2：每阶段（tsc 双配置）；L3：S3 起相关场景+全量回归；L4：S7 + 版本发布（真实 API）；L5：S3/S4 UI 变化后基线更新+回归
- CI：L1/L2/L3 自动；L4 需 secret（现状保持）

### 9.5 测试重构阶段（并入 S 计划）

| 阶段          | 测试工作                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| T0（S1 前置） | MockBridge 工厂 + 场景装配器 + 断言 helper（基建——旧测试暂用，S3 迁移）   |
| S1            | L1 按「不变量矩阵」重写（领域层新模型测试即按新组织编写）                 |
| S2            | 值对象解析测试（parsePlanProposal/parseCompletionClaim/verifyCompletion） |
| S3            | L3 场景重写（旅程组织 + MockBridge 工厂迁移 + 方案卡/拒绝原因场景）       |
| S4            | 证据对账场景（证据不足→不弹卡→回填引导）                                  |
| S5            | 推进保障场景（提议/证据算推进——StuckDetector 不打断）                     |
| S6            | 门控双维场景（只读/网络只读自动、越界 ask、高危 deny）                    |
| S7            | L4 用户模拟对齐重写 + L5 基线更新 + 全链回归                              |
