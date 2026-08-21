# e2e 真实用户模拟器域设计（Simulated User BC）

> 2026-08-16（用户指示：e2e 真实用户模拟最早没有好好 DDD 设计——按当前项目设计推翻重构）
> 权威对齐：docs/design/intent-confirmation-domain-design.md §9（测试域 DDD——测试=领域不变量与场景的可执行规范）；docs/domain/00-domain-authority.md（决策点/确认卡语义——无阶段目标驱动）；A0 §3.4/§3.6（决策点触发权——系统确定性派生）
> 现状问题清单（重构动机）：见 §6。目标：模拟器域按产品语义重构——**确定性派生为主、LLM 语义增强**（同产品 deriveDecisionPoint 模式），领域层纯函数 L1 可测。

## 1. 域定位

**真实用户模拟域（Simulated User BC）**——测试域（§9）的子域：模拟真实用户与 NeonForge 交互（读 → 理解 → 思考 → 决策 → 操作 → 验证），驱动 0-1 完整流程，产出**决策轨迹（可复现）**与**防假阳性验证判定**。

**域不变式**：
1. **决策点驱动**——旅程按产品决策点推进（goal → plan → approval → resolution → deliver），无阶段概念（产品 S4 已移除阶段——无阶段目标驱动）
2. **确定性优先**——模型信号从消息/工具卡/状态栏**确定性派生**（纯函数——L1 可测）；LLM 只做自由文本意图增强，失败静默降级确定性
3. **单一理解源**——「模型在说什么」只有一套信号派生（消除 UserAgent/UserSimulator/fallback 三实现——缝隙 4）
4. **收敛有界**——探索轮不消耗轮次上限；连续停滞轮判死（#9 提升为域对象）
5. **验证防假阳性**——目标回显/方案要素/文件产物/试玩可访问——每决策点有确定性验证

## 2. 值对象与信号（Signals）

**ModelSignal**（模型信号——从 transcript 最后一条消息 + 工具卡 + 状态栏确定性派生）：

| 信号 | 派生来源（确定性） | 产品对应 |
|------|-------------------|----------|
| `goal-proposed` | 消息含【目标确认：】标记（parseGoalProposal 同源） | goal 决策点提议 |
| `plan-proposed` | 消息含【执行方案】标记（parsePlanProposal 同源——ok 才计） | plan 决策点提议 |
| `completion-claimed` | 消息含【已达成】标记 + 证据（parseCompletionClaim） | resolution 决策点提议 |
| `approval-requested` | 工具卡 approve-files 待批 / 授权卡待批 | approval 决策点 |
| `clarifying` | 消息以问句收尾 / 含候选块（candidates>0）/ 标准 4 问关键词 | 澄清阶段 |
| `promising` | 状态栏「说要做但还没动手」/ 消息含承诺词（SEM_PROMISE 演进） | isActionPromise 同源 |
| `exploring` | 最近工具卡为 read/search/check-capability（无副作用） | 探索轮（收敛判定用） |
| `producing` | 最近工具卡为 write/edit/bash（副作用推进） | 执行推进 |
| `inviting-test` | 消息含 http://localhost:\d+ + 试玩词 | play-test |
| `asking-decision` | 消息含征询词（SEM_ASK 演进）且无确认标记 | 征求决策 |
| `stuck` | 连续停滞轮达阈值（ConvergenceGuard） | 收敛判定 |

**UserDecision**（用户决策——对应产品确认卡动作 + 真实用户动作）：

| 决策 | 语义 | 产品对应 |
|------|------|----------|
| `answer` | 提供信息（澄清问答——自由文本） | 用户输入 |
| `choose` | 候选块点选 | 候选按钮 |
| `confirm-goal` | 确认目标卡 | 目标确认卡 |
| `confirm-plan` | 确认方案卡 | 方案确认卡 |
| `confirm-resolution` | 确认解决卡 | 解决确认卡 |
| `approve` | 批准授权卡/approve-files | 授权批准 |
| `nudge` | 推进（「继续」） | isActionPromise 处理 |
| `playtest-feedback` | 试玩反馈（真实 HTTP 验证） | 用户实测 |
| `wait` | 等模型（陈述/推进中） | — |

## 3. 领域服务

**deriveModelSignal(msg, toolCards, statusBar): ModelSignal**——确定性派生（单一来源——§2 表）；LLM 增强输入点：`enrichUnderstanding(msg, signal)` 返回自由文本理解（UserSimulator 改造——失败降级 signal 默认文案）。

**decide(signal, journey, profile): UserDecision**——决策策略（确定性——信号 × 旅程上下文 × 画像 → 决策 + 理由）；LLM 增强注入点（自由文本生成——text 内容）。

**Journey**（旅程状态机——决策点驱动）：

```
澄清（answer/choose 循环）→ [goal-proposed] → 目标决策点（confirm-goal → 推进）
  → [plan-proposed] → 方案决策点（confirm-plan / 设计问答）
  → [approval-requested] → 授权决策点（approve——approve-files 清单）
  → 执行（producing/exploring——wait + nudge）
  → [completion-claimed] → 解决决策点（confirm-resolution——证据对账）
  → [inviting-test] → 试玩（playtest-feedback——真实 HTTP）
  → 交付（产物验证——文件齐全）
```

**ConvergenceGuard**（收敛守卫——#9 域对象化）：`observe(msgFingerprint): 'exploring'|'progressing'|'stale'`——进展轮重置计数；连续 N 轮 stale → stuck 信号（需求 20/设计开发测试 15——配置化）；总轮硬上限（60）。

**Verifier**（防假阳性验证——纯函数）：
- `verifyGoalEcho(decision, reply)`——模型是否正确复述用户选择（echoed）
- `verifyPlanComplete(content)`——方案完整性（长度 + 要素——okLen/okKw 演进）
- `verifyArtifacts(files, planned)`——产物齐全（planned ⊆ files）
- `verifyPlayable(url)`——试玩可访问（真实 HTTP——驱动层执行，判定归领域）

## 4. 分层

```
e2e-sim/                     # 领域层（纯函数 .mjs——无 Playwright/无网络——L1 可测）
├── signals.mjs              # deriveModelSignal（确定性信号派生——单一来源）
├── decide.mjs               # decide（决策策略——确定性优先）
├── journey.mjs              # Journey 状态机（决策点推进 + 已确认集合 + UNTIL 终止点映射）
├── convergence.mjs          # ConvergenceGuard（探索容忍/停滞判死——#9 域对象化）
└── verify.mjs               # Verifier（目标回显/方案要素/产物/试玩判定）
e2e-0to1.mjs                 # 应用层：launch + SessionDriver（IO）+ LLM 增强注入 + JourneyRunner 编排
```

- 领域层不 import electron/playwright/node:fs——纯输入输出
- 驱动层（SessionDriver）：Playwright IO 保留——waitSettled 收敛语义改引用 convergence（领域层）
- 应用层：UserAgent 画像/决策轨迹保留（steps——可复现）；StageMachine 删除 → JourneyRunner（按 Journey 决策点循环）

## 5. UNTIL 映射（无阶段——终止点）

> 命名：UNTIL（非 PHASE）——控制「跑到哪个旅程终止点为止」，**不是产品阶段**（产品无阶段，决策点驱动）。

| UNTIL | 终止点（旅程决策点） |
|-------|---------------------|
| req | confirm-goal 完成（目标确认后停） |
| design | confirm-plan 完成（方案确认后停） |
| dev | 首个产物确认（write 后停） |
| all | 交付（产物验证 + 解决确认 + 试玩） |

## 6. 现状问题 → 重构映射

| 现状问题 | 重构 |
|----------|------|
| StageMachine 阶段残留（requirement/design/…+ currentStage 跟随）——产品已无阶段 | Journey 决策点驱动（§3）——UNTIL 映射终止点（§5） |
| 理解三实现（UserAgent.understand 正则 / UserSimulator LLM / fallback 正则）——缝隙 4 违反 | deriveModelSignal 单一信号源（§2）——LLM 只做自由文本增强 |
| 决策逻辑内联各阶段循环（4 问/越界/okLen/okKw/清单/试玩） | decide 决策策略 + Verifier 验证域（§3） |
| staleRounds 四阶段 4 份拷贝（#9） | ConvergenceGuard 域对象（单一实现） |
| SEM_* 散落正则 | ModelSignal 表（§2——演进收编） |
| waitSettled 收敛语义与 Playwright IO 混合 | 驱动层引用 convergence（领域） |
| 验证逻辑散落（verdicts 内联） | Verifier 纯函数 + verdicts 汇总 |

## 7. 测试与验证

- **L1（新增——无 NF_TEST_KEY 可跑）**：signals.test.ts（信号派生表驱动——每信号正反例）/ decide.test.ts（信号×旅程×画像 → 决策）/ journey.test.ts（决策点推进 + UNTIL 终止）/ convergence.test.ts（探索容忍/停滞判死——#9 语义锁定）/ verify.test.ts（回显/方案/产物判定）
- **L2**：.mjs 无类型——node --check + vitest 转译 import
- **真机复验（NF_TEST_KEY）**：UNTIL=req/all 跑通——记录于 issue（L4 依赖）
- **e2e-suite.mjs 不回归**（独立脚本——不受影响）

## 8. 边界（不做）

- SessionDriver 不做大改（IO 壳保留——只接 convergence 引用）
- launch/case_ 保留（应用层壳——UNTIL/MODE 语义保留）
- LLM 增强（UserSimulator→enrich）保持现有 API 调用（不重构网关）
- e2e-suite.mjs（另一套真实 API 场景）不在本次范围