# 02 — 领域模型（无阶段·目标驱动版）

> 2026-08-07 重新生成——基于无阶段重构（**目标驱动**为核心：目标确认 → 能力检查 → 方案提议 → 方案批准 → 完成声明与证据对账；确认与能力检查是实现机制；2026-08-16 意图确认领域模型重设计同步——决策点触发权在系统，模型只能提议）的领域讨论，领域模型驱动设计，不反推现有实现。
> 替代旧六阶段版（需求→设计→开发→测试→部署→交付——产品流水线范式）。

## 1. 一句话

搭档是一个**目标驱动的执行代理**：澄清用户目标 → 用户确认目标 → 检查能力 → 给出方案提议（PlanProposal——文件+假设+验证计划）→ 用户批准方案 → 动手产出 → 完成声明（CompletionClaim+证据）→ 用户证据对账确认解决——**目标确认是推进的原点，每个确认点都是推进的门槛，确认点内部模型自主推进**。

## 2. 我们是什么，不是什么

| 我们是                                         | 我们不是                       |
| ---------------------------------------------- | ------------------------------ |
| 目标驱动的任务执行代理（目标→方案→解决）       | 阶段流水线（固定顺序推进）     |
| 用户在每个确认点显式决定推进                   | 模型自报即确认（自说自话推进） |
| 决策点触发权在系统（确定性派生——模型只能提议） | 模型文本标记直接弹卡（反模式） |
| 宿主强制执行边界（不依赖模型自律）             | 靠提示词让模型自觉             |
| 结构化确认动作（按钮）                         | 自由文本确认词匹配             |
| 能力=环境视图（单源推导）                      | 能力独立重复检测               |
| 全步骤可观测（时间线）                         | 事后拼凑日志                   |

### 2.1 遗留技术模块（六阶段时代实现保留——技术基础设施——非领域核心）

无阶段重构聚焦目标驱动核心（Conversation/Capability/Workspace/Delivery/Timeline）——以下六阶段时代技术模块**实现仍活跃**（经 ipc 注册）——归属**通用技术基础设施**（非领域核心 BC——技术事实不构成目标驱动决策）：

| 模块         | 功能                       | 现状                                             |
| ------------ | -------------------------- | ------------------------------------------------ |
| compact      | 对话压缩（上下文管理）     | 保留（通用技术——上下文预算）                     |
| context      | 上下文引擎                 | 保留（通用技术）                                 |
| codeRag      | 语义搜索                   | 保留（通用技术——工具查询）                       |
| preheat      | 缓存预热（PrefixCache）    | 保留（网关技术——DeepSeek 缓存）                  |
| pluginSystem | 插件注册/生命周期          | 保留（通用——插件体系）                           |
| lsp          | LSP 工具（定义/引用/诊断） | 保留（通用——信息类工具——方案确认放行——只读自动） |

**标注**：这些模块不进入无阶段 BC 清单（00 §2）——它们是技术载体（非领域核心）；实现对齐时若与无阶段领域冲突（如 compact 的触发语义与确认点无关——纯上下文管理），以无阶段领域为准。

## 3. 限界上下文（BC）

| BC                                    | 职责                                                               | 类型       |
| ------------------------------------- | ------------------------------------------------------------------ | ---------- |
| **Conversation BC**（对话）           | 多轮对话、目标状态机、确认点、推进保障策略、模型活动边界、推进门控 | **核心域** |
| **Capability BC**（能力/环境）        | 环境检测（事实来源）、能力视图（从环境推导）、能力检查             | 支撑域     |
| **Workspace BC**（工作区）            | 项目文件、写入快照/回滚、计划清单（批准边界）                      | 支撑域     |
| **Session Timeline BC**（会话时间线） | 单会话所有步骤统一记录（用户/搭档/工具/授权/确认/状态）——可观测性  | 支撑域     |

## 4. 核心概念模型

### 4.1 任务（Task）——目标到解决的执行单元

```
Task = Goal → Plan → Resolution（2026-08-16 更名——原 Goal → Execution → Achievement）
```

三个**确认点**（目标驱动的实现机制——用户确认 = 状态转换的唯一通道）：

| 确认点                                                              | 含义                                                      | 确认动作（结构化）               | 未确认时模型活动边界                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GoalConfirmed**                                                   | 用户确认「做什么」（目标）——**目标驱动的原点**            | 确认目标 / 重新描述              | 只澄清目标（不产生执行动作）                                                                                                                               |
| **PlanConfirmed**（2026-08-16 更名，原 ExecutionConfirmed）         | 用户批准「怎么做」（PlanProposal——文件+假设+验证计划）    | 批准方案 / 修改 / 重出（带原因） | 只给方案（不 write/edit/bash——**探索性只读命令如 ls/cat 放行**——2026-08-16 第 14 轮审计 #1 补 A0 §3.1 澄清：判定与授权 preApproval 同源 classifyReadonly） |
| **ResolutionConfirmed**（2026-08-16 更名，原 AchievementConfirmed） | 用户确认「问题解决了」（完成声明+证据对账——无证据不对账） | 已解决 / 还要改（带原因）        | 持续执行（不收敛——不能自宣布完成停手）                                                                                                                     |

### 4.2 确认点 = 推进门槛 + 单一 PENDING 状态机（核心不变式）

**推进（Progression）**：跨确认点的状态转换（Goal → Plan → Resolution——2026-08-16 更名）——**唯一通道是用户确认**（结构化确认动作：确认卡按钮）。

**自推进（Self-progression）**：确认点**内部**的自主工作——用户批准方案后，模型自动执行工具链（读→写→验证→汇报）——模型自主，直到下一个确认点。**（2026-10-04 §3.7 落位补注：自推进是同一模型轮 Turn 内的 Round 序列——工具链多步、续聊、强制推进皆不新开轮；轮次的生命周期/驱动资格/不变量见 `00 §3.7`，本文不重述。）**

**单一 PENDING 状态机**（2026-08-07 领域定论——**会话级（Conversation 聚合承载）**——所有确认点/授权卡统一——Task 只管任务级确认点，不承载 pending）：

```
用户发起目标 ─→ 搭档确认目标(提议) ─→ 卡弹出【PENDING——等用户决策】
    ├─ 目标确认卡 / 方案确认卡 / 解决确认卡（大阶段）
    └─ 授权卡（窗内 pending 请求的呈现——小阶段——但不批准则后续无法继续，影响大阶段）
                                        │
          pending 下模型动作全部无效（做了等于白做——不执行不生效——所有工具都不放行）
                                        │
                            ┌───────────┴───────────┐
                         用户「是」              用户「否」
                            │                       │
                    状态推进 + 模型继续       状态回退 + 模型调整
```

- **pending 只有一个**——不区分来源各自建 pending（来源只是卡类型与授权窗口——授权面单窗 N 可寻址、槽为窗的派生呈现，00 §3.2 要点 1/5·ADR-017）
- **pending 下模型所有动作无效 ＋ 用户决策是下一个状态的唯一输入**——规则全文只有一处措辞：**`00 §3.2 要点 2`**（ADR-015 #8 定为不变量 1 唯一措辞源），本处不重述。**互审批勘误**：旧稿末尾写着「只引不重述」，前半句却是规则全文（还另抄了「无害≠有用」的推导）——带指针的重述仍是双源
- **用户「是」→ 模型根据决策重新做**（不是恢复 pending 前的动作——决策改变状态，动作跟随状态重新生成）

**设计对齐与差异说明（2026-08-07 调研交叉验证）**：

| 对照                         | 结论                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **决策状态机 vs 活动状态机** | 行业 FSM 主流（Reddit/工程实践——"Waiting for User Input"/"Calling an API"）是**活动状态机**（agent 在做什么——操作/UI 层）——**不是本领域 PENDING 的对照**；我们的 UI 层已有活动状态（呼吸光条 working/waiting——product/00 §3.3）——领域层 PENDING 是**决策状态机**（自主性边界——何时停/何时继续）——不同层互补                    |
| **OpenHands 多等待态先例**   | OpenHands `AgentState` 区分 `AWAITING_USER_INPUT` / `AWAITING_USER_CONFIRMATION`（输入 vs 确认——粒度区分）——**我们统一单一 PENDING**（来源=卡类型——子信息——非独立状态）——**场景适配**：我们的等待都是「等用户是/否」（确认卡/授权卡——行为一致——冻结+决策驱动）——统一更简（OpenHands 区分是不同响应语义的先例——我们场景不需要） |
| **对齐锚点（决策状态机类）** | OpenHands AWAITING_*（等待用户=状态机一等公民）+ brightlume「不能从 awaiting 跳到 confirming——必须经过中间状态」（等待态约束跳转）+ LinkedIn「knowing when autonomy should stop」（等待=自主性停止）+ Medium「executes exactly once」（决策后精确执行一次）——**全部对齐**                                                      |
| **授权卡也 pending**         | Codex `ExecApprovalRequirement`（工具批准阻塞）+ OpenHands confirmation——对齐（工具批准=等待——影响后续推进）                                                                                                                                                                                                                   |

```
目标澄清 ─[用户确认目标]→ 能力检查/方案提议（PlanProposal）─[用户批准方案]→ 动手产出(自推进工具链) → 完成声明（+证据）─[用户证据对账确认解决]→ 收敛（2026-08-16 语义）
```

**结构性保证**：确认点未确认 → 领域状态不转换 → 模型活动边界被限制在该确认点——不是事后拦截，是状态机未到下一态。

### 4.3 推进保障（ProgressGuarantee——2026-08-16 重设计，原执行保障/TurnExecutionPolicy）

确认后的推进保障——防止「只说不做」（坑 80 原意延续）：

- **推进保障（ProgressGuarantee——2026-08-16 重设计，原 forceTool）**：目标+方案已确认、无任何推进 → 强制模型推进（产出/提议/证据/提问——不逼调工具）——模型不能只输出承诺文本。（2026-08-21：API 表达层从 tool_choice='required' 改恒 auto——V4 拒 required；强制由循环层 StuckDetector/escalate + sysPrompt ⑨ 兜底——`provider-toolchoice-compat-research.md` §7）
- **失败感知**：上一往返工具执行失败（"轮"此处＝Round）（bash exit≠0 / write 失败）→ 释放强制——模型可停下诊断修正（错误回填模型是修正的前提；required 压制诊断 → 重试失败命令死循环——已知反模式）
- **任务完成度**：计划文件全部写完 或 用户确认解决 → 释放强制——模型可收敛（写 1 个文件 ≠ 任务达成；required 模式模型被逼工具无法输出完成声明——计划写完即释放）

### 4.4 宿主强制边界（模型漂移防护）

模型可能偏离批准范围（写计划外文件）——**约束由宿主强制执行，不依赖模型自律**（行业共识：Claude Code「enforced by the host, not the model」/ Codex rules / Aider fnames）：

- **计划清单（PlannedFiles）**：approve-files 批准的文件集合——模型只能写清单内文件——**清单对模型显式可见**（系统提示注入——模型知道边界）
- **补充语义**：清单是**追加**的（分批 approve-files 不覆盖前批——Codex rules AppendRule 同理）
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

> 语义补全：**ADR-013**（2026-10-01——Busy 边界 + silent 通道；调研见 `docs/audits/research-busy-scope-interrupt-vs-queue-2026-10-01.md`）。

**Partner busy（搭档忙碌）**——判据以 `00 §3.7` I-T5 的定义式为准：**`busy ≡ ∃ Turn ∈ {Running}`**（Suspended/idle 不计）。下表**降为写作时例解**，不再与定义式并列作源（**2026-10-04 落位批 P1 修正**：旧版此表与 I-T5 构成第三源，且"工具 pending·执行中计入 busy"一句在授权等待场景与"Suspended 不计 busy"有口径歧义——以定义式裁定：因授权而挂起＝Suspended＝**不计 busy**）：

| 计入 busy                                                        | 不计 busy                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 思考 / 流式输出 / 工具 pending·执行中 / `maybeContinue` 续链未停 | 授权卡·确认卡·强制澄清已呈现且续聊已停（decision-pending——等人）；idle / ready |

UI `working` 与 UAT `modelBusy` **与上表同源**——禁止为「快速确认推进」在工具链未收口时提前释放 busy。**（2026-10-04：该同源义务已收敛为定义式 `busy ≡ ∃ Turn ∈ {Running}`＝`00 §3.7` I-T5——上表降为 I-T5 的展开，不再是并行措辞源。）**

- **排队衔接**：busy 时用户普通发送 → 存入队列——在下一个**「回合边界」**自动发送（不打断当前流/工具链）。**（2026-10-04 勘误·互审批：投递时机的唯一定义词＝**产品** `00-product-design §4.5 C13` 的「回合边界」（旧稿误写 `00 §4.5`——领域 00 无 §4.5，且违产品 §4.5 派生待办⑥ 的自家引用卫生）；队列内容是领域概念 QueuedInput（归 Conversation BC，渲染层数组降为投影副本），准入串行与次序见 I-T13/I-T14，"不得静默丢弃"见 I-T6/C3。）**
- **打断 = 显式动作**：停止按钮（真名 `.nf-chat__send--stop`——**2026-10-04 勘误**：旧稿引用的 `.nf-chat__stop` 只存在于注释，见 p000157）——用户显式打断（对齐竞品：Claude Code Esc / Cursor 停止 / Goose 点 Send-as-interrupt）。**领域语义＝作废 Void：`generation++` 同步生效，被作废轮不得再写会话状态（I-T2），残值保留（产品 C9）**——**卡悬挂期点停止同走本语义**（`Suspended → Voided`＝`00 §3.7.2` 出口④）：卡不随之消失（决定点属会话槽），此后打字按 C2b 排队、不产新轮（I-T9）——a10 场景此前在生命周期里没有出口
- **待授权例外**（保留）：模型停住等批准时用户发送可直接处理（排队会卡在授权等待——非 busy 的 decision-pending）。**（2026-10-04 F7 裁定 D：这里的"直接处理"＝**焦点换人而非决定代答**——未决授权记录 `pending→queued`（决定轴不写值）、槽释放、原轮 `Settled{Superseded}`、新轮准入；**卡何时重弹不在此措辞**——触发条件唯一措辞处＝`00 §3.8.6`（互审批收口：旧稿在此写「槽再空时」，与 `00 §3.7.2` 出口③、§3.2 要点 5 三处各带一份谓词）。见 `00 §3.7.2` 出口表③与 I-T17/I-T18。）**
- **silent＝非用户通道，≠默认打断**（ADR-013）：不进气泡/`message_sent`；busy 时 **与用户相同——排队**；废除「silent 默认可 `stopGeneration`」。确需硬恢复（如 escalate）→ **显式恢复打断**（复用停止语义 + 时间线 `conversation.interrupted`），不得冒充普通 silent send

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

**DoD 对齐（2026-08-15 裁决——V2）**：动手前「用用户的话复述问题 + 验收标准」为 **V2 首项**（模型【验收标准】结构化解析 → 交付包 acceptance 生产写入）；V1 以**解决确认卡（证据对账）+ 交付包**（产物清单/验收对照保留位）为可验证闭环。

**与确认点的关系**：解决确认卡（用户确认解决——完成声明+证据对账）是交付确认的入口——模型完成声明（带证据）→ 交付包呈现（产物/验收对照）→ 用户「已解决」= 确认关闭（终态）/「还要改」= 继续调整。

### 4.8 授权与信任（授权架构 v4——工具批准机制）

**授权请求住在会话级授权窗口**（ApprovalWindow——需批准的事实由 `ConversationState.approvalWindow.requests` 承载；记录含 requestId/kind(tool|plan-batch)/toolName/subject/argsFingerprint/state(queued|pending|approved|denied|failed|expired|uncertain)/decidedBy/decidedAt；requestId 由 main 签发、跨进程跨重启唯一且不透明——身份即 id，领域内无序号无代次，排序归时间线日志域 TimelineEvent.seq——ADR-017）。授权卡＝窗内 pending 请求的呈现（§4.2——小阶段——不批准则后续无法继续）；`pending='approval'` 为窗的单向派生。**三方分工（ADR-017 域归属卡，与 00 §2 判定表行同源）**：是否需批＋可执行性判定＝main（执行域——规则引擎＋持久执行日志 journal，边界 fail-closed）；决定记录＝Conversation 窗（推进域）；会话/持久规则存储＝Workspace/main 规则表（规则域）。授权后的信任机制：

- **授权裁决（AuthorizationService）**：规则引擎显式序 **`deny > always-allow > ask`**（取代现 first-match 隐序）——未匹配默认 `ask`（fail-closed）——bash 只读命令自动放行（main 进程裁决——renderer 不判断——防绕过）；规则命中＝drain 时判定，以 `decidedBy:'rule'` 同门写入窗内记录（00 §3.2 规则 2 预先裁决骑注）；rule-decided/TTL 到期经上行对账通道（ToolResult 标记＋低频对账 IPC）回写集合；规则落库经串行队列防交错
- **规则三档（取代单一「允许并记住→任务信任集合」——权威统一归 main，ADR-017）**：**once**＝本次决定（仅事件流/窗记录，不留规则）；**session grant**＝main 会话规则表（重启弃；**任务边界清除见下条 clearSessionGrants**）；**persistent**＝Workspace 持久规则库（setRules 接线激活，仅文件/网络类 pattern，跨任务语义不变）。「允许并记住」UI 对应 session/persistent 档选择；后续 write/edit 命中即自动放行并写窗记录（decidedBy:'rule'）——授权疲劳解法不变（一次批准本任务内不再问）
- **信任边界**：
  - 只信任**文件路径类**工具（write/edit 的 path）——bash 无 path 一律不进入信任；**bash/高危永不进入 persistent 持久规则**（本行产品裁定压过竞品 goose 形——ADR-017 §2）
  - 只信任**沙箱内**（项目根内）——沙箱外 write/edit 永不进入信任集合（每次弹卡——安全底线）
- **任务边界清除（clearSessionGrants——原 clearTrust 升格为 main 权威写操作，ADR-017 v3.3）**：新目标确认（goalSeq 递增）= 任务边界 → renderer 经 IPC 令 main 清除 **session 档规则表** + 计划批准标记重置（信任不跨任务——防误信任漂移；**persistent 档不参与边界清除**；renderer taskTrust 集合降为呈现投影，判定权回收 main——:2376 绕过事故同源治理）
- **执行可执行性与恢复对账（ADR-017 v3.3）**：main 持久执行日志（journal：issued/approved/started/done）是"这条请求能不能跑、跑没跑过"的权威——二次 execute 校验 id∈journal ∧ phase 允许 ∧ argsFingerprint 等值；重启/重连按 requestId 对账三判（未决≤approved 存续可决／done 收敛／started∧¬done→uncertain 升格用户裁决、禁自动重放）
- **授权记录可回溯**：授权历史（允许/拒绝/记住/rule 放行/到期 expired/执行 failed/uncertain 用户裁决）＝窗记录终态 + 会话时间线（`decision.requested` 随开窗、`decision.resolved` 带 requestId+outcome+decidedBy）+ TrustLadder 展示（用户可查「谁批准了什么」——记录级可回溯）

### 4.7 环境注入（模型开箱即知）

环境/能力快照**主动注入**系统提示（项目根/runtime/依赖/能力状态）——模型不需要探索确认环境（竞品：Aider 文件边界显式可见）。环境注入是事实来源的前置呈现。

### 4.13 问题生命周期（Problem——会话外问题记录）

**问题 = 一等公民**（产品承诺——断点续做/复跑）：Problem 是**跨会话**的问题记录（Conversation BC 子域实体——2026-08-15 补建模 M3——实现 problemStore 早已落地，模型此前遗漏）：

```
Problem (聚合根——问题生命周期——跨会话持久化)
id / title / status / updatedAt
◆ snapshot: ProblemSnapshot（goal / decisions / authorized / pending——断点续做上下文）
```

- **与 Task 的关系**：Problem = 会话外问题记录（跨会话/复跑）；Task = 会话内执行单元（目标驱动状态机）——**Problem 1—N Task**（复跑 = 同一 Problem 新 Task）；TaskResolved（解决确认——证据对账通过）→ Problem closed（终态——handleConfirmClosed 联动；2026-08-16：对账通过才允许关闭）
- **状态机（7 态——与实现 ProblemStatus 一致）**：understanding → awaiting-plan → executing → awaiting-input → delivered → closed（终态）；failed-recoverable（异常可恢复）——状态推进与确认点联动（目标确认 → goal 回写；授权 → authorized 追加；交付关闭 → closed）
- **触发**：SendInstruction（用户消息 → 创建/复跑同标题）；GoalConfirmed / ToolApproved / DeliveryClosed 回写快照
- **仓库**：IProblemRepository（localStorage——上限 20，V1 已落地）

**断点续做语义（2026-08-15 裁决）**：V1 = 消息 + 问题台账（快照 goal/authorized）恢复；**Task 状态机不跨重启**（复开从澄清重新走——安全回退）——**V2 必做**：会话快照（含状态机）持久化（见 04 §5 ITaskRepository 标注）。

## 5. 领域服务（Domain Services）

| 服务                                                                                                                                                 | 职责                                                                                                                                                            | 不变式                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **ProgressGuarantee**（2026-08-16 重设计，原 TurnExecutionPolicy）                                                                                   | 输入（确认状态/推进/失败/完成度/pending）→ 推进决策（require-advance/require-action/auto——2026-08-21：API 层恒 auto，V4 拒 required，强制由循环层+prompt 兜底） | 确认后无推进强制（产出/提议/证据）；失败释放；pending 恒不强制；计划写完/解决确认释放 |
| **ProgressionGate**（推进门控——2026-08-16 第 14 轮审计 #2：角色并入 sessionGate——活动边界策略层描述保留，判定由意图确认服务组承载，见 04 §3.2/§3.6） | 确认点状态机——当前确认点 → 模型活动边界                                                                                                                         | 未确认目标不执行；未批准方案不动手（只读探索放行——A0 §3.1）；未确认解决不收敛         |
| **CapabilityChecker**                                                                                                                                | 能力视图（从环境推导）+ 缺失清单 + Ledger 回填                                                                                                                  | 环境单源；能力是视图；执行结果回填                                                    |
| **PlannedFiles**（计划清单）                                                                                                                         | 批准文件集合——写文件边界                                                                                                                                        | 追加不覆盖；清单显式可见；拒绝带边界                                                  |
| **TimelineLogger**                                                                                                                                   | 会话所有步骤统一记录                                                                                                                                            | 时间顺序完整（用户/搭档/工具/授权/确认/状态）                                         |
| **deriveDecisionPoint**（2026-08-16 新增——决策点触发权在系统）                                                                                       | 状态×提议×动作属性 → 决策点（goal/plan/approval/resolution/none）                                                                                               | 决策点=确定性纯函数（同一输入同一决策点——模型措辞不参与）                             |
| **sessionGate**（2026-08-16 新增）                                                                                                                   | 会话状态冻结判定（pending/确认点——单一 PENDING）                                                                                                                | pending 时任何动作无效（A0 §3.2/§3.4）                                                |
| **actionGate**（2026-08-16 新增——动作属性门控）                                                                                                      | 动作属性分级（readonly/network-read/in-plan/out-of-plan/hazardous）→ allow/ask/deny + risk                                                                      | SessionGate 优先于 ActionGate（A0 §3.5b）                                             |
| **classifyReadonly**（2026-08-16 新增，原 classifyAction 升级）                                                                                      | 只读判定（命令头白名单/链递归/git 子命令/网络只读）                                                                                                             | 判定依据可审计（basis 字段）；main/renderer 同源                                      |
| **verifyCompletion**（2026-08-16 新增——无证据不对账；ADR-011）                                                                                       | 完成声明证据校验（系统代跑只读命令核验/diff 系统派生）                                                                                                          | 证据不足/无系统对账证据 → 不进入解决决策点；unverifiable 仅标注（A0 §4.2）            |
| **parsePlanProposal**（2026-08-16 新增，原 parseExecutionPlan）                                                                                      | 【执行方案】块结构化解析（文件+假设+验证计划）                                                                                                                  | 路径合法性过滤（坑 102）；解析失败降级（不弹卡+回填引导）                             |
| **parseCompletionClaim**（2026-08-16 新增）                                                                                                          | 【已达成】块结构化解析（声明+证据）                                                                                                                             | 解析失败降级（回填补证据引导）                                                        |
| **derivePlannedFiles**（2026-08-16 新增——不变量 6）                                                                                                  | plannedFiles = state.plannedFiles ∪ PlanProposal.files（trustPath 规范化）                                                                                      | 单一来源（只由已确认 PlanProposal 派生；追加语义 A0 §5）                              |
| **canExecute**（2026-08-16 明确列示——组合门控）                                                                                                      | sessionGate × actionGate 组合判定                                                                                                                               | 会话冻结优先（A0 §3.5/§3.5b）                                                         |
| **shouldStopContinuation**（2026-08-16 明确列示——续聊停止）                                                                                          | pending 非 none 即停（与 canExecute 同源）                                                                                                                      | 卡在任意消息都停续聊（坑 103）                                                        |

> 2026-08-16 第 11 轮审计 #1：服务表补齐新设计 §3.3 全部服务（原 5 服务未覆盖 deriveDecisionPoint 等 10 个——S1 实现按本表+设计文档 §3.3）

## 6. 领域事件（Domain Events）

> 事件名实现权威 = `timeline.ts` 注册表（TIMELINE_EVENT_SPECS——44 事件）；本表为语义清单（2026-08-16 第 16 轮审计 #1——事件名以注册表为准）。

| 事件                                                                                              | 触发                                                                          | 载荷                       |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| GoalProposed（目标提议）                                                                          | 模型澄清后给出目标                                                            | 目标文本                   |
| **GoalConfirmed / GoalRejected**                                                                  | 用户确认目标 / 重新描述                                                       | 目标文本                   |
| ExecutionPlanProposed（历史——2026-08-16 起由 proposal.plan 替代）                                 | 模型给出执行方案                                                              | 方案/文件清单              |
| **PlanConfirmed / PlanRejected**（2026-08-16 更名，原 ExecutionConfirmed/Rejected）               | 用户批准方案 / 修改+原因                                                      | —                          |
| PlanApproved（计划批准）                                                                          | 用户批准文件清单                                                              | 文件清单（追加）           |
| ToolApproved / ToolRejected                                                                       | 用户批准/拒绝工具                                                             | 工具名+参数                |
| ToolExecuted / ToolFailed                                                                         | 工具执行结果                                                                  | 名称/成功/错误             |
| AchievementProposed（历史——2026-08-16 起由 proposal.completion 替代）                             | 模型汇报达成                                                                  | 产物说明                   |
| **ResolutionConfirmed / ResolutionRejected**（2026-08-16 更名，原 AchievementConfirmed/Rejected） | 用户证据对账确认解决 / 还要改+原因                                            | —                          |
| TaskResolved（2026-08-16 第 16 轮审计 #4 补——04 §4/06 §1.1 同源）                                 | 用户确认解决——任务收敛（→ Problem closed 联动——§4.13）                        | taskId                     |
| CapabilityChecked                                                                                 | 能力检查                                                                      | 能力视图                   |
| CapabilityLedgerUpdated（#4 补——04 §4/06 §1.4 同源）                                              | Ledger 回填                                                                   | rootPath, capabilityId, ok |
| EnvironmentInjected                                                                               | 环境快照注入                                                                  | 环境状态                   |
| **proposal.goal / proposal.plan / proposal.completion**（2026-08-16 新增）                        | 模型输出结构化提议（GoalProposal/PlanProposal/CompletionClaim——完整内容快照） | 提议值对象全量             |
| **decision.requested**（2026-08-16 新增）                                                         | 决策点出现（kind + decisionContent 快照——呈现内容完整审计）                   | 决策点内容                 |
| **decision.resolved**（2026-08-16 新增）                                                          | 用户决策（confirm / reject + RejectReason）                                   | 决策 + 原因                |
| **completion.evidence_missing**（2026-08-16 新增）                                                | 完成声明证据不足（回填引导补证据）                                            | missing 清单               |
| **tool.blocked**（ActionGate deny 路径；历史文稿曾写 gate.denied）                                | ActionGate deny（高风险动作被机制拦——非 ask）                                 | 动作属性                   |

## 7. 命令清单（Commands——用户/搭档/系统动作）

| 命令                                                          | 触发者 | 效果                                   |
| ------------------------------------------------------------- | ------ | -------------------------------------- |
| `SendInstruction`                                             | 用户   | 发出指令，触发目标澄清                 |
| `ConfirmGoal`                                                 | 用户   | 确认目标（推进到执行）                 |
| `RejectGoal`                                                  | 用户   | 重新描述目标                           |
| `ConfirmPlan`（2026-08-16 更名，原 ConfirmExecution）         | 用户   | 确认方案（推进到动手）                 |
| `RejectPlan`（2026-08-16 更名，原 RejectExecution）           | 用户   | 修改方案（带原因——RejectReason）       |
| `ApprovePlan`                                                 | 用户   | 批准文件清单（追加）                   |
| `ApproveTool` / `RejectTool`                                  | 用户   | 批准/拒绝工具执行                      |
| `ConfirmResolution`（2026-08-16 更名，原 ConfirmAchievement） | 用户   | 确认解决（证据对账通过——收敛）         |
| `RejectResolution`（2026-08-16 更名，原 RejectAchievement）   | 用户   | 还要改（带原因——继续执行）             |
| `InvokeTool`                                                  | 搭档   | 调用工具（确认点内自推进）             |
| `AskForConfirmation`                                          | 搭档   | 到达确认点——请求用户确认（渲染确认卡） |

## 8. Ubiquitous Language

| 术语                             | 定义                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 目标驱动（Goal-driven）          | 任务围绕「达成什么」组织——目标确认是推进的原点                                                                                                                                                                                                                                                                                    |
| 确认点（Confirmation Point）     | 推进的门槛——目标/方案/解决三处用户确认（2026-08-16 更名：执行→方案、达成→解决）                                                                                                                                                                                                                                                   |
| 推进（Progression）              | 跨确认点的状态转换——唯一通道是用户确认                                                                                                                                                                                                                                                                                            |
| 自推进（Self-progression）       | 确认点内部的模型自主工作（工具链）                                                                                                                                                                                                                                                                                                |
| 推进保障（Progress Guarantee）   | 确认后防只说不做的推进决策（强制对象=推进≠调工具——2026-08-16）                                                                                                                                                                                                                                                                    |
| 计划清单（Planned Files）        | approve-files 批准的可写文件集合                                                                                                                                                                                                                                                                                                  |
| 能力视图（Capability View）      | 从环境推导的能力状态（ready/missing/failed）                                                                                                                                                                                                                                                                                      |
| 环境快照（Environment Snapshot） | 一次检测的事实（runtime/依赖/工具链）——注入模型                                                                                                                                                                                                                                                                                   |
| 会话时间线（Session Timeline）   | 单会话所有步骤统一日志                                                                                                                                                                                                                                                                                                            |
| 问题台账（Problem Ledger）       | 跨会话问题记录（goal/decisions/authorized/pending 快照）——断点续做/复跑（§4.13）                                                                                                                                                                                                                                                  |
| 确认卡（Confirm Card）           | 确认点的结构化 UI（确认/拒绝按钮）                                                                                                                                                                                                                                                                                                |
| 提议（Proposal）                 | 模型产出的结构化主张（GoalProposal/PlanProposal/CompletionClaim）——不产生状态变化，只进入待求值（§5 服务表 deriveDecisionPoint）                                                                                                                                                                                                  |
| 决策点（Decision Point）         | 需要用户输入才能继续的确定性状态——状态×提议×动作属性的纯函数派生（§5 deriveDecisionPoint）                                                                                                                                                                                                                                        |
| 决策（Decision）                 | 用户对决策点的响应：确认 / 拒绝（带原因）/ 修改（拒绝+修正内容）                                                                                                                                                                                                                                                                  |
| 证据（Evidence）                 | 完成声明的可核验支撑（verification 命令输出/diff 对账/遗留问题）——无证据不对账（§5 verifyCompletion）                                                                                                                                                                                                                             |
| 方案提议（PlanProposal）         | 文件清单+假设+验证计划——plannedFiles 单一来源（§4.4）                                                                                                                                                                                                                                                                             |
| 完成声明（Completion Claim）     | 模型「做完了」的主张——必须附证据（§4.1 ResolutionConfirmed）                                                                                                                                                                                                                                                                      |
| 拒绝原因（RejectReason）         | 拒绝决策的结构化原因（kind/text/target——含 modify）——回填模型调整                                                                                                                                                                                                                                                                 |
| 动作属性（Action Attribute）     | 工具调用的客观性质（只读/网络只读/清单内/越界/高危）——actionGate 判定（§5）                                                                                                                                                                                                                                                       |
| 授权（Approval）                 | 对「动作属性判定为需询问」的调用，main 签发**授权请求记录**入会话级**授权窗口**（ApprovalWindow；记录携 requestId+state）并向用户呈现（tool 卡/plan-batch 合并卡）——用户允许（一次/会话/永久三档）或拒绝（带原因），四入口与规则命中经 `approvalDecided` 收敛（00 §9/§3.2 同源——ADR-017；2026-08-16 第 15 轮审计 #2——A0 §9 同源） |

> 2026-08-16 第 13 轮审计 #9：术语表补齐意图确认重设计新增术语（对齐 A0 §9——原表缺 10 项）。

## 9. 与旧六阶段的关系

无阶段不是六阶段的简化——是**范式替换**：

- 六阶段 = **产品流水线**（需求→设计→开发→测试→部署→交付——固定顺序推进——推进动力 = 阶段完成）
- 无阶段 = **目标驱动**（目标→方案→解决——按确认点推进——推进动力 = **用户确认目标/方案/解决**——2026-08-16 第 20 轮审计 #3 更名对齐 §4.1）

核心差异：推进动力从「阶段完成」变为「目标确认」——用户在每个确认点显式决定推进与否（对齐 Plan-Then-Execute 的 user agency + StackAI「request and receive a human decision before executing」）。
