# 02 — 领域模型（无阶段·目标驱动版）

> 2026-08-07 重新生成——基于无阶段重构（**目标驱动**为核心：目标确认 → 能力检查 → 执行方案 → 执行确认 → 达成确认；确认与能力检查是实现机制）的领域讨论，领域模型驱动设计，不反推现有实现。
> 替代旧六阶段版（需求→设计→开发→测试→部署→交付——产品流水线范式）。

## 1. 一句话

搭档是一个**目标驱动的执行代理**：澄清用户目标 → 用户确认目标 → 检查能力 → 给出执行方案 → 用户确认执行 → 动手产出 → 汇报达成 → 用户确认解决——**目标确认是推进的原点，每个确认点都是推进的门槛，确认点内部模型自主推进**。

## 2. 我们是什么，不是什么

| 我们是 | 我们不是 |
|--------|---------|
| 目标驱动的任务执行代理（目标→执行→达成）| 阶段流水线（固定顺序推进）|
| 用户在每个确认点显式决定推进 | 模型自报即确认（自说自话推进）|
| 宿主强制执行边界（不依赖模型自律）| 靠提示词让模型自觉 |
| 结构化确认动作（按钮）| 自由文本确认词匹配 |
| 能力=环境视图（单源推导）| 能力独立重复检测 |
| 全步骤可观测（时间线）| 事后拼凑日志 |

### 2.1 遗留技术模块（六阶段时代实现保留——技术基础设施——非领域核心）

无阶段重构聚焦目标驱动核心（Conversation/Capability/Workspace/Delivery/Timeline）——以下六阶段时代技术模块**实现仍活跃**（经 ipc 注册）——归属**通用技术基础设施**（非领域核心 BC——技术事实不构成目标驱动决策）：

| 模块 | 功能 | 现状 |
|------|------|------|
| compact | 对话压缩（上下文管理）| 保留（通用技术——上下文预算）|
| context | 上下文引擎 | 保留（通用技术）|
| codeRag | 语义搜索 | 保留（通用技术——工具查询）|
| preheat | 缓存预热（PrefixCache）| 保留（网关技术——DeepSeek 缓存）|
| pluginSystem | 插件注册/生命周期 | 保留（通用——插件体系）|
| lsp | LSP 工具（定义/引用/诊断）| 保留（通用——信息类工具——执行确认放行）|

**标注**：这些模块不进入无阶段 BC 清单（00 §2）——它们是技术载体（非领域核心）；实现对齐时若与无阶段领域冲突（如 compact 的触发语义与确认点无关——纯上下文管理），以无阶段领域为准。

## 3. 限界上下文（BC）

| BC | 职责 | 类型 |
|---|---|---|
| **Conversation BC**（对话）| 多轮对话、目标状态机、确认点、执行保障策略、模型活动边界、推进门控 | **核心域** |
| **Capability BC**（能力/环境）| 环境检测（事实来源）、能力视图（从环境推导）、能力检查 | 支撑域 |
| **Workspace BC**（工作区）| 项目文件、写入快照/回滚、计划清单（批准边界）| 支撑域 |
| **Session Timeline BC**（会话时间线）| 单会话所有步骤统一记录（用户/搭档/工具/授权/确认/状态）——可观测性 | 支撑域 |

## 4. 核心概念模型

### 4.1 任务（Task）——目标到达成的执行单元

```
Task = Goal → Execution → Achievement
```

三个**确认点**（目标驱动的实现机制——用户确认 = 状态转换的唯一通道）：

| 确认点 | 含义 | 确认动作（结构化）| 未确认时模型活动边界 |
|---|---|---|---|
| **GoalConfirmed** | 用户确认「做什么」（目标）——**目标驱动的原点** | 确认目标 / 重新描述 | 只澄清目标（不产生执行动作）|
| **ExecutionConfirmed** | 用户确认「怎么做」（执行方案）| 确认执行 / 修改方案 | 只给方案（不 write/edit/bash）|
| **AchievementConfirmed** | 用户确认「做完了」（达成汇报）| 已解决 / 还要改 | 持续执行（不收敛——不能自宣布完成停手）|

### 4.2 确认点 = 推进门槛 + 单一 PENDING 状态机（核心不变式）

**推进（Progression）**：跨确认点的状态转换（Goal → Execution → Achievement）——**唯一通道是用户确认**（结构化确认动作：确认卡按钮）。

**自推进（Self-progression）**：确认点**内部**的自主工作——用户确认执行后，模型自动执行工具链（读→写→验证→汇报）——模型自主，直到下一个确认点。

**单一 PENDING 状态机**（2026-08-07 领域定论——**会话级（Conversation 聚合承载）**——所有确认点/授权卡统一——Task 只管任务级确认点，不承载 pending）：

```
用户发起目标 ─→ 搭档确认目标(提议) ─→ 卡弹出【PENDING——等用户决策】
    ├─ 目标确认卡 / 执行确认卡 / 达成确认卡（大阶段）
    └─ 授权卡（小阶段——但不批准则后续无法继续，影响大阶段）
                                        │
          pending 下模型动作全部无效（做了等于白做——不执行不生效——所有工具都不放行）
                                        │
                            ┌───────────┴───────────┐
                         用户「是」              用户「否」
                            │                       │
                    状态推进 + 模型继续       状态回退 + 模型调整
```

- **pending 只有一个**——不区分来源各自建 pending（来源只是卡类型）
- **pending 下模型执行类动作无效**——有副作用工具（write/edit/bash）不执行（做了白做）——信息类（read/search/check-capability——只读无副作用）放行（模型可准备方案/查证）——**用户决策是下一个状态的唯一输入**
- **用户「是」→ 模型根据决策重新做**（不是恢复 pending 前的动作——决策改变状态，动作跟随状态重新生成）

**设计对齐与差异说明（2026-08-07 调研交叉验证）**：

| 对照 | 结论 |
|------|------|
| **决策状态机 vs 活动状态机** | 行业 FSM 主流（Reddit/工程实践——"Waiting for User Input"/"Calling an API"）是**活动状态机**（agent 在做什么——操作/UI 层）——**不是本领域 PENDING 的对照**；我们的 UI 层已有活动状态（呼吸光条 working/waiting——product/00 §3.3）——领域层 PENDING 是**决策状态机**（自主性边界——何时停/何时继续）——不同层互补 |
| **OpenHands 多等待态先例** | OpenHands `AgentState` 区分 `AWAITING_USER_INPUT` / `AWAITING_USER_CONFIRMATION`（输入 vs 确认——粒度区分）——**我们统一单一 PENDING**（来源=卡类型——子信息——非独立状态）——**场景适配**：我们的等待都是「等用户是/否」（确认卡/授权卡——行为一致——冻结+决策驱动）——统一更简（OpenHands 区分是不同响应语义的先例——我们场景不需要）|
| **对齐锚点（决策状态机类）** | OpenHands AWAITING_*（等待用户=状态机一等公民）+ brightlume「不能从 awaiting 跳到 confirming——必须经过中间状态」（等待态约束跳转）+ LinkedIn「knowing when autonomy should stop」（等待=自主性停止）+ Medium「executes exactly once」（决策后精确执行一次）——**全部对齐** |
| **授权卡也 pending** | Codex `ExecApprovalRequirement`（工具批准阻塞）+ OpenHands confirmation——对齐（工具批准=等待——影响后续推进）|

```
目标澄清 ─[用户确认目标]→ 能力检查/执行方案 ─[用户确认执行]→ 动手产出(自推进工具链) → 达成汇报 ─[用户确认解决]→ 收敛
```

**结构性保证**：确认点未确认 → 领域状态不转换 → 模型活动边界被限制在该确认点——不是事后拦截，是状态机未到下一态。

### 4.3 执行保障（TurnExecutionPolicy）

确认后的执行保障——防止「只说不做」（坑 80 原意延续）：

- **强制产出（forceTool）**：目标+执行已确认、尚无产出 → 强制模型必须调用工具产出——模型不能只输出承诺文本
- **失败感知**：上一轮工具执行失败（bash exit≠0 / write 失败）→ 释放强制——模型可停下诊断修正（错误回填模型是修正的前提；required 压制诊断 → 重试失败命令死循环——已知反模式）
- **任务完成度**：计划文件全部写完 或 用户确认达成 → 释放强制——模型可收敛（写 1 个文件 ≠ 任务达成；required 模式模型被逼工具无法输出达成文本——计划写完即释放）

### 4.4 宿主强制边界（模型漂移防护）

模型可能偏离批准范围（写计划外文件）——**约束由宿主强制执行，不依赖模型自律**（行业共识：Claude Code「enforced by the host, not the model」/ Codex rules / Aider fnames）：

- **计划清单（PlannedFiles）**：plan_approval 批准的文件集合——模型只能写清单内文件——**清单对模型显式可见**（系统提示注入——模型知道边界）
- **补充语义**：清单是**追加**的（分批 plan_approval 不覆盖前批——Codex rules AppendRule 同理）
- **拒绝回填边界**：写清单外文件被拒 → 拒绝信息带清单内容（「X 不在批准清单（批准的是：A/B/C）」）——模型能回到边界内，不重复尝试

### 4.5 能力与环境（Capability / Environment）

**环境是事实来源，能力是语义视图**（调研定论——OASF/DeepCode/Augment 三源交叉）：

- **环境（Environment）**：检测的事实（runtime/依赖/工具链/宿主 runtime 可用性）——事实来源——一次检测
- **能力（Capability）**：从环境推导的语义视图（node-runtime/python-runtime/dev-tools 的 ready/missing/failed）——**不独立二次检测**（消除双源）
- **Ledger 回填**：执行结果回填能力状态（bash 失败归因 → 能力降级 failed；成功恢复）——自学习闭环
- **能力缺失 → 征求用户**（装依赖/换方案）——决策类确认点（对话式）

### 4.6 结构化确认（行业共识）

用户确认 = **结构化显式动作**（确认卡按钮：确认/拒绝）——非确认词匹配（「可以撤销吗」误触发——不可靠）。对齐：OpenHands USER_CONFIRMED/USER_REJECTED、Cline allow_once/allow_always/reject、Codex user_confirmed、Claude Code 权限提示。

**确认语义**：
- 确认点未处理（未确认未拒绝）= **等待**（blocking——模型停在该确认点——不推进、不默认放行）
- 确认/拒绝是显式三态（等待/确认/拒绝）

### 4.11 错误契约（Error Contract——错误分类协议）

**错误必须抛出来，模型自己修正**（用户核心诉求）：

- **结构化分类（errorType）**：gateway 源头分类（ipc 返回结构化 errorType——key-invalid/service/token-limit…）——renderer `classifyChatError` 仅兜底（字面量/未知格式——状态码边界匹配——T1 修复 includes('5') 过宽）
- **bash 错误回填**：`exit-N: stderr`——错误信息回填模型（模型看到真实错误 → 诊断修正——不重试同一失败命令）
- **失败感知**：工具失败 → turnPolicy 释放强制（模型可停下诊断——required 压制诊断是反模式——冒烟实测 37 轮死循环教训）

### 4.12 用户输入衔接（Input Queue——输入 ≠ 打断）

- **排队衔接**：模型产出中（流式+工具链）用户发送 → 存入 pending 队列——**当前轮完成后自动发送**（不打断当前流/工具链）
- **打断 = 显式动作**：停止按钮（.nf-chat__stop）——用户显式打断（对齐竞品：Claude Code Esc / Cursor 停止按钮）
- **silent 例外**：系统自动消息（StuckDetector escalate 等）直接打断（内部机制干预——非用户输入）

### 4.10 服务管理（Service Management）

**开发服务器管理**（start-server/check-server/stop-server——非 bash 起服务）：

- **服务注册表（ServiceRegistry）**：按 rootPath 记忆服务（端口/PID/URL/启动时间）——**模型不用猜端口**（服务地址以返回为准——坑 67「帮我打开猜端口」终结）
- **端口分配**：动态端口（envManager allocatePort）——显式端口替换 `--port 0`（坑 77 vite 忽略 0）；**宿主保留端口保护**（5173/5175 是 NeonForge 自身——不可 kill/占用/冒充）
- **失败检测**：waitForUrl（最长 15s）——close 无任何输出 = 命令失败（返回 stderr 错误——命令 not found 等）；有输出未解析到地址 = 服务启动中；超时无输出 = 失败
- **命令识别单源**：isServerCommand（严格白名单——start-server 工具命令选择）/ isServerLikeCommand（宽松——bash 超时/端口保护）/ isInstallCommand（安装识别）——一处判定（T3 regex-todo 单源化）
- **spawn 环境**：node_modules/.bin 入 PATH（任何 npm 工具可跑——环境单源）

### 4.9 数字交付（Delivery——交付包/验收/确认关闭）

**数字产物交付**（非技术主路径——文件整理/数据加工 → 变更预览 → 授权 → 交付）：

- **交付包（DeliveryPackage）**：产物清单 + 变更预览 + 验收对照 + 状态——「问题已解决」的可验证呈现
- **DoD 对齐（DoDAlign）**：动手前用用户的话复述问题 + 验收标准——「什么叫解决」前置（用户认可验收标准才动手）
- **交付 ≠ 解决**：产物交付 ≠ 用户确认解决——验收对照逐项打勾 → 用户「确认关闭」= 问题终态（交付后可继续调整）
- **快照回滚**：写前快照（`.nf-bak`）——交付不满意可回滚恢复原样

**与确认点的关系**：达成确认卡（用户确认解决）是交付确认的入口——模型汇报达成 → 交付包呈现（产物/验收对照）→ 用户「已解决」= 确认关闭（终态）/「还要改」= 继续调整。

### 4.8 授权与信任（授权架构 v4——工具批准机制）

**工具授权卡 = 会话级 PENDING 的来源之一**（§4.2——小阶段——不批准则后续无法继续）。授权后的信任机制：

- **授权裁决（AuthorizationService）**：规则引擎 `deny > allow > ask`——未匹配默认 `ask`（fail-closed）——bash 只读命令自动放行（main 进程裁决——renderer 不判断——防绕过）
- **任务级信任（TaskTrust）**：用户「允许并记住」→ 该文件路径进入任务信任集合 → 后续 write/edit 自动执行（授权疲劳解法——一次批准本任务内不再问）
- **信任边界**：
  - 只信任**文件路径类**工具（write/edit 的 path）——bash 无 path 一律不进入信任（bash 高危永远单独确认）
  - 只信任**沙箱内**（项目根内）——沙箱外 write/edit 永不进入信任集合（每次弹卡——安全底线）
- **任务边界清除（clearTrust）**：新目标确认（goalSeq 递增）= 任务边界 → 信任集合清空 + 计划批准标记重置（信任不跨任务——防误信任漂移）
- **授权记录可回溯**：授权历史（允许/拒绝/允许并记住）进会话时间线 + TrustLadder 展示（用户可查「谁批准了什么」）

### 4.7 环境注入（模型开箱即知）

环境/能力快照**主动注入**系统提示（项目根/runtime/依赖/能力状态）——模型不需要探索确认环境（竞品：Aider 文件边界显式可见）。环境注入是事实来源的前置呈现。

## 5. 领域服务（Domain Services）

| 服务 | 职责 | 不变式 |
|---|---|---|
| **TurnExecutionPolicy** | 输入（确认状态/产出/失败/完成度）→ forceTool 决策 | 确认后无产出强制；失败释放；计划写完/达成确认释放 |
| **ProgressionGate**（推进门控）| 确认点状态机——当前确认点 → 模型活动边界 | 未确认目标不执行；未确认执行不动手；未确认解决不收敛 |
| **CapabilityChecker** | 能力视图（从环境推导）+ 缺失清单 + Ledger 回填 | 环境单源；能力是视图；执行结果回填 |
| **PlannedFiles**（计划清单）| 批准文件集合——写文件边界 | 追加不覆盖；清单显式可见；拒绝带边界 |
| **TimelineLogger** | 会话所有步骤统一记录 | 时间顺序完整（用户/搭档/工具/授权/确认/状态）|

## 6. 领域事件（Domain Events）

| 事件 | 触发 | 载荷 |
|---|---|---|
| GoalProposed（目标提议）| 模型澄清后给出目标 | 目标文本 |
| **GoalConfirmed / GoalRejected** | 用户确认目标 / 重新描述 | 目标文本 |
| ExecutionPlanProposed | 模型给出执行方案 | 方案/文件清单 |
| **ExecutionConfirmed / ExecutionRejected** | 用户确认执行 / 修改方案 | — |
| PlanApproved（计划批准）| 用户批准文件清单 | 文件清单（追加）|
| ToolApproved / ToolRejected | 用户批准/拒绝工具 | 工具名+参数 |
| ToolExecuted / ToolFailed | 工具执行结果 | 名称/成功/错误 |
| AchievementProposed（达成提议）| 模型汇报达成 | 产物说明 |
| **AchievementConfirmed / AchievementRejected** | 用户确认解决 / 还要改 | — |
| CapabilityChecked | 能力检查 | 能力视图 |
| EnvironmentInjected | 环境快照注入 | 环境状态 |

## 7. 命令清单（Commands——用户/搭档/系统动作）

| 命令 | 触发者 | 效果 |
|------|--------|------|
| `SendInstruction` | 用户 | 发出指令，触发目标澄清 |
| `ConfirmGoal` | 用户 | 确认目标（推进到执行）|
| `RejectGoal` | 用户 | 重新描述目标 |
| `ConfirmExecution` | 用户 | 确认执行方案（推进到动手）|
| `RejectExecution` | 用户 | 修改方案 |
| `ApprovePlan` | 用户 | 批准文件清单（追加）|
| `ApproveTool` / `RejectTool` | 用户 | 批准/拒绝工具执行 |
| `ConfirmAchievement` | 用户 | 确认解决（收敛）|
| `RejectAchievement` | 用户 | 还要改（继续执行）|
| `InvokeTool` | 搭档 | 调用工具（确认点内自推进）|
| `AskForConfirmation` | 搭档 | 到达确认点——请求用户确认（渲染确认卡）|

## 8. Ubiquitous Language

| 术语 | 定义 |
|------|------|
| 目标驱动（Goal-driven）| 任务围绕「达成什么」组织——目标确认是推进的原点 |
| 确认点（Confirmation Point）| 推进的门槛——目标/执行/达成三处用户确认 |
| 推进（Progression）| 跨确认点的状态转换——唯一通道是用户确认 |
| 自推进（Self-progression）| 确认点内部的模型自主工作（工具链）|
| 执行保障（Execution Policy）| 确认后防只说不做的 forceTool 决策 |
| 计划清单（Planned Files）| plan_approval 批准的可写文件集合 |
| 能力视图（Capability View）| 从环境推导的能力状态（ready/missing/failed）|
| 环境快照（Environment Snapshot）| 一次检测的事实（runtime/依赖/工具链）——注入模型 |
| 会话时间线（Session Timeline）| 单会话所有步骤统一日志 |

## 9. 与旧六阶段的关系

无阶段不是六阶段的简化——是**范式替换**：

- 六阶段 = **产品流水线**（需求→设计→开发→测试→部署→交付——固定顺序推进——推进动力 = 阶段完成）
- 无阶段 = **目标驱动**（目标→执行→达成——按确认点推进——推进动力 = **用户确认目标/执行/达成**）

核心差异：推进动力从「阶段完成」变为「目标确认」——用户在每个确认点显式决定推进与否（对齐 Plan-Then-Execute 的 user agency + StackAI「request and receive a human decision before executing」）。
