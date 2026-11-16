# 01 · 范围收敛（DDD Scope）

> 阶段：发现 / Scope
> 输入：现有 NeonForge 桌面应用代码（基线 `5c54924`），不读取历史产品文档
> 输出：问题陈述、价值陈述、目标/非目标、约束与假设、术语种子、风险清单、下一步准备
> 行号说明：本文 `文件:行` 为初始分析时点引用；当前权威行号索引见 `10-code-evidence.md`。

---

## 1. 问题陈述与价值陈述

**问题陈述（一句话）**

> 非技术用户有大量可以由电脑完成的任务（整理文件、做小工具、做网页/游戏、排查系统异常），但现有 AI 编程工具要求用户理解代码、环境与权限；模型还经常“只说不做”、在未真实验证时声称完成，甚至在没有边界的情况下执行高风险操作，用户无法判断结果是否真的交付。

**价值陈述（一句话）**

> NeonForge 让用户用自然语言描述问题，通过“目标 → 方案 → 授权 → 完成”四类明确决策点控制搭档，并用系统可复核的证据与真实产物对账，获得可检查、可回滚、可续做的交付结果。

对应代码证据：

- 用户入口与场景：`apps/desktop/src/renderer/StartPage.tsx:7-13`、`scenes.tsx:11-17`
- “搭档”定位：`apps/desktop/src/renderer/sysPrompt.ts:8-9`
- 决策点与证据门：`apps/desktop/src/domain/conversationState.ts:649-677`、`729-775`
- 授权与信任：`apps/desktop/src/main/tools.ts:32-98`、`renderer/authModel.ts:5-49`
- 交付与问题台账：`apps/desktop/src/renderer/types.d.ts:202-240`、`MainWorkspace.tsx:282-293`

---

## 2. 目标 / 非目标

### 2.1 目标

| 编号 | 目标 | 边界解释 | 可验证方式 |
| :--- | :--- | :--- | :--- |
| G1 | 非技术用户不写代码也能完成数字任务 | 用户通过对话与确认卡控制，不要求理解 TypeScript/HTML/命令行 | 启动页场景卡 + 交互测试（`tests/interaction/core.interaction.ts`） |
| G2 | 状态推进只由用户决策触发 | 目标、方案、解决、授权四类决策都必须由用户确认；模型只能“提议” | `conversationState.ts` 不变量 1；`conversationState.test.ts` “Inv 1” |
| G3 | 完成声明必须可核验 | 没有可代跑证据或计划清单未产出，不进入“已解决”决策点 | `verifyCompletion` + `verifyCompletionSystem.test.ts` |
| G4 | 副作用操作可授权、可回滚、有边界 | write/edit/bash 需授权；写前快照；计划清单内才自动放行 | `tools.ts`、`useToolApproval.ts`、`tools.test.ts` |
| G5 | 会话可中断、可恢复、可审计 | 支持停止、重试、断点续做、问题台账、时间线 | `sessionStore.ts`、`problemStore.ts`、`timelineLogger.ts` |
| G6 | 接入方可替换 | DeepSeek / Command Code / OpenCode Zen/Go 通过统一描述符接入 | `providers/descriptors/*`、`providers/transport/openaiCompat.ts` |
| G7 | 交付可验收 | 验收标准有来源（方案验证计划/用户 DoD），证据可绑定，门禁通过才允许关闭 | 已落地（BC-14，2026-11-14）：`domain/acceptance.ts`、`main/acceptanceStore.ts`、`ipc.ts` `acceptance:*` |
| G8 | 任务可编排、成本可见 | 多任务可排队/暂停/恢复；token/成本有台账与预算提醒 | 已落地（BC-11/BC-12，2026-11-14）：`taskQueue.ts`/`taskQueueStore.ts`、`usageLedger.ts`/`usageStore.ts` |

> G7/G8 在初始分析时只有字段/占位/演示证据，已作为目标态目标记录；2026-11-14 已全部落地，现状以 `00-domain-blueprint.md §2` 与 `10-code-evidence.md` 为准。

### 2.2 非目标

| 编号 | 非目标 | 边界解释 |
| :--- | :--- | :--- |
| NG1 | 不做通用 IDE / 大型代码编辑器 | 产物区只有只读 Monaco 查看器（`OutputPanel.tsx:81-92`），编辑由搭档通过 write/edit 完成 |
| NG2 | 不做多人协作、云端多租户、SaaS | 单机单用户；无后端、无账号体系 |
| NG3 | 不做无人值守的全自动执行 | 目标/方案/授权/完成四类决策点必须有人确认；`pending` 时冻结工具（`sessionGate`） |
| NG4 | 不做插件市场 / 公开分发 | 不做插件商店、计费与公开生态；但保留**受控**的内置扩展与 MCP/Git 集成（目标态 BC-13），第三方能力必须经 BC-02 授权/沙箱 |
| NG5 | 不做移动端 / Web 端 | Electron 桌面应用，单窗口（`main.ts:50-97`） |
| NG6 | 不做业务建模工具 | 本产品是“任务执行工作台”，不是给业务团队做领域建模的平台 |
| NG7 | 不做云端账户/支付/订阅计费 | 用量与成本只做本机台账（BC-12），不做交易与云端配额 |

---

## 3. 约束与假设

### 3.1 约束

| 编号 | 约束 | 可验证性 | 验证方式 |
| :--- | :--- | :--- | :--- |
| C1 | Electron 43 + React 19 + TypeScript 5.7 桌面应用 | 可验证 | `apps/desktop/package.json` 依赖版本 |
| C2 | renderer 与 main 进程隔离：`contextIsolation: true`、`nodeIntegration: false` | 可验证 | `main.ts:65-70` |
| C3 | 模型侧只走 OpenAI Chat Completions 兼容接口，支持 SSE 流式与 tool calls | 可验证 | `providers/transport/openaiCompat.ts:6-21`、`gateway.ts:637-650` |
| C4 | 凭据只存本机；API Key 优先 safeStorage 加密，失败时明文 fallback（0600） | 可验证 | `configStore.ts:1-3`、`91-106` |
| C5 | 文件系统是本地真实文件；项目根是“软沙箱”，不是操作系统级沙箱 | 可验证 | `tools.ts:57-69`、`resolvePath` 199-210 |
| C6 | 状态持久化分层：计划清单 main userData；会话/问题 localStorage；时间线 JSONL | 可验证 | `plannedFilesStore.ts`、`sessionStore.ts`、`problemStore.ts`、`timelineLogger.ts` |
| C7 | 单用户、单活动会话；问题台账最多 20 条、会话消息最多 50 条 | 可验证 | `sessionStore.ts:8`、`problemStore.ts:5` |
| C8 | 网络可选；`web_search` / `web_fetch` 必须由用户在设置中显式开启 | 可验证 | `webTools.ts:90-98`、`SettingsPanel.tsx:63-82` |
| C9 | 无后端服务、无数据库；所有能力在 Electron main + renderer 内完成 | 可验证 | 仓库根无服务端 package；`ipc.ts` 全部为本地 handler |
| C10 | 引用模型必须支持 streaming + function/tool calling；否则核心决策协议不可用 | 可验证 | `gateway.ts:642-646`、`protocolTools.ts:68-186` |

### 3.2 假设

| 编号 | 假设 | 可验证性 | 验证方式 |
| :--- | :--- | :--- | :--- |
| A1 | 用户拥有至少一个接入方的可用 API Key | 不可验证（外部） | 首次配置页验证；`gateway.validateKey` |
| A2 | 目标机器有项目所需运行时（node/python）与工具链 | 可验证 | `check-capability` / `detectEnvironment`（`envManager.ts:58-119`） |
| A3 | 用户会选择一个项目根目录，或从零开始创建项目 | 可验证 | `workspace.openFolder` / `initProject` |
| A4 | 用户能点击确认/授权卡，或用明确的确认词回复 | 可验证 | 交互测试；`isConfirmIntent`（`agentLoop.ts:54-78`） |
| A5 | 上游模型能按协议工具 schema 生成 tool_calls | 可验证（采样） | `protocolTools.test.ts` + 真机/e2e |
| A6 | 用户机器能访问所选接入方 API | 可验证（运行时） | `validateKey` / `streamChat` 错误分类 |
| A7 | 服务类命令在白名单内（vite / npm run dev 等） | 可验证 | `serviceManager.ts:92-102` |
| A8 | 完成证据至少有一条“系统可代跑”的只读命令 | 可验证 | `evidenceVerifiable` / `verifyCompletion` |
| A9 | 用户愿意把项目文件内容发送给所选模型供应商 | 不可验证（外部） | 隐私说明/用户设置；当前无显式同意流程（风险 R12） |

---

## 4. 术语种子清单

| 术语 | 定义候选 | 歧义点 | 所属场景 |
| :--- | :--- | :--- | :--- |
| 问题（Problem） | 用户第一句话描述的要解决的事情，台账中的一等公民 | 与“任务”混淆：问题可复跑、可关闭；任务是问题的一次执行单元 | 启动页、问题台账 |
| 任务（Task） | 会话内一次目标驱动的交付；聚合根 `ConversationState` | 旧代码用“阶段/流程”表达任务推进，现已移除阶段 | 对话、决策点 |
| 目标（Goal） | 用户确认的一句话结果承诺 | 与“问题标题”混淆：问题标题可截断，目标是完整 statement | 目标确认卡 |
| 方案（Plan） | 文件清单 + 摘要 + 假设 + 验证计划的提议 | UI 按钮仍叫“确认执行”，领域状态是 `planConfirmed` | 方案确认卡 |
| 完成声明（Completion Claim） | 模型声称“已达成”的结构化声明 + 证据 | “达成”是模型声明，“解决”是用户确认 | 完成对账 |
| 证据（Evidence） | 真实验证命令、输出、是否通过；以及系统派生的 diff 对账 | 非只读命令只能标 unverifiable，不能作为系统证据 | 完成对账 |
| 决策点（Decision Point） | 等待用户决策的五类点：goal/plan/approval/resolution/system_clarify | 与“确认卡”混淆：卡是 UI，决策点是领域状态 | 整个任务生命周期 |
| 待决策（PENDING） | 会话级单一挂起状态；pending 非 none 时冻结工具 | 与“working”混淆：模型正在流式输出不是 pending | 门控、状态栏 |
| 授权（Approval） | 对某个具体副作用动作（写文件/跑命令）的执行许可 | 与“方案确认”混淆：批准文件清单 ≠ 确认方案 | 工具卡、授权卡 |
| 工具调用（Tool Call） | 模型请求执行一个工具的结构化调用 | 与“工具结果”混淆：调用是意图，结果含 ok/error | 流式回合 |
| 计划清单（PlannedFiles） | 由已确认方案派生、追加式合并的允许写入边界 | 与“产出”混淆：计划 ≠ 实际产出 | 写门控 |
| 产出（ProducedFiles） | write/edit 成功累积的真实文件集合 | 文件树中已存在不等于本任务产出 | 进度、完成核验 |
| 沙箱（Sandbox） | 项目根目录；是信任边界与路径基准，不是 OS 级隔离 | write/edit 沙箱外仍可在逐次授权下执行；read 无沙箱限制 | 路径解析、信任 |
| 能力（Capability） | 达成目标所需的抽象能力，如 `node-runtime`、`spreadsheet` | 与“工具”混淆：工具是实现，能力是需求视图 | 环境检查 |
| 环境（Environment） | 项目的 runtime、包管理器、工具链、端口等事实快照 | 与“能力”混淆：环境是事实，能力是语义视图 | 检查环境、起服务 |
| 服务（Service） | NeonForge 管理的开发服务器实例（按 rootPath 唯一） | 与“bash 后台进程”混淆：服务工具只停自己起的 | 起/查/停服务 |
| 交付包（Delivery Package） | 产物 + 人话摘要 + 验收对照 + 下一步 + 复跑入口 | 与“完成声明”混淆：声明是模型说的，交付包是系统汇总的 | 产物区 |
| 问题台账（Problem Ledger） | 7 态问题实例 + 断点快照 | 与“会话”混淆：一个会话可承载多个问题 | 左侧问题列表 |
| 会话（Session） | 一次对话消息序列与时间线文件；有 UUID | 与“问题”混淆：会话是交互容器，问题是业务对象 | 断点续做、日志 |
| 时间线（Timeline） | 按 ts+seq 排序的领域事件 JSONL | 与“聊天日志”混淆：时间线是超集，含工具/授权/状态 | 审计、排障 |
| 接入方（Provider） | 模型服务的接入配置：baseURL、鉴权、模型列表 | 与“模型”混淆：接入方是通道，模型是上游 id | 首次配置 |
| 档位（Model Tier） | 产品抽象的两个档位：flash / pro | 与“模型名”混淆：档位映射到上游具体 id | 路由、状态栏 |
| 上下文注入（Context Injection） | @mention 文件片段、`.neonforge` 搭档须知、环境快照 | 与“RAG”混淆：注入是确定性读取，RAG 是检索兜底 | 发送前组装 |
| 压缩（Compaction） | 长对话摘要 + 保留最近 20 条 | 与“截断”混淆：压缩保留语义摘要 | 长会话 |
| 预热（Preheat） | 标准前缀构建 + 前缀缓存 + 最小成本 API 预热 | 与“缓存命中”混淆：预热是首请求成本优化 | 打开项目 |

**术语种子数量：25 个，超过 Scope 校验要求的 10 个。**

---

## 5. 风险清单

| 编号 | 类别 | 风险 | 影响 | 触发条件 | 初步缓解 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 业务 | 用户不理解“决策点”，把确认卡当普通弹窗 | 误确认/疲劳，任务走错 | 首次使用；确认卡连续弹出 | 确认卡展示目标/方案原文与后果；`ask_user` 候选点选；`loop-guard` 引导 |
| R2 | 业务 | 模型“只说不做”或空转 | 用户等待无产出 | 模型输出承诺但无 tool_call | `decideProgressGuarantee` 强制推进；`StuckDetector` 升级；重复工具暂停 |
| R3 | 业务 | 模型虚报完成 | 用户以为已交付，实际未达成 | 无可代跑证据；计划文件未产出 | 证据门 + 系统代跑 + diff 对账（不变量 4） |
| R4 | 业务 | 非技术用户被要求输入暗号/理解技术细节 | 流程失败 | 模型要求用户“输入确认” | `sysPrompt` ⑳ 明确禁止；确认只能通过卡按钮 |
| R5 | 集成 | 接入方 401/5xx/超时/网络失败 | 会话中断 | provider 不可用 | 3 次重试 + `stream-reset`；key-invalid 回配置页；结构化错误分类 |
| R6 | 集成 | 模型 tool_call JSON 漂移/截断 | 工具无法执行 | 上游输出畸形 | `toolCallRepair` 4 轮修复；失败后跳过并记录 |
| R7 | 集成 | LSP / 开发服务器 / web 检索不可用 | 能力降级 | 工具链缺失、端口冲突、网络不可达 | 能力检查、服务生命周期工具、web 访问探测与降级 |
| R8 | 一致性 | 计划清单与实际产出路径形态不一致（相对/绝对） | 完成核验死锁 | `propose_plan` 时 rootPath 未注入；approve 后绝对化 | `matchesPlannedPath` 末段边界匹配；`trustPath` 规范化 |
| R9 | 一致性 | renderer 状态与 main 门控镜像不同步 | 卡不渲染或越权放行 | 确认/拒绝只改一侧 | `session:plan-confirmed` 双向同步；`planned-files` 权威落 main |
| R10 | 一致性 | 事件时间线与真实状态漂移 | 审计不可信 | 日志写失败被静默吞掉；手工打点遗漏 | `deriveStateEvents` 单点派生；`validateTimelineEvent`；但当前仍 fire-and-forget（见 08） |
| R11 | 交付 | 写前快照未清理或回滚失败 | 磁盘残留、无法恢复 | 任务边界未清理、文件被外部修改 | `planned-files:reset` 触发 `cleanupSnapshots`；`.nf-bak` 快照 |
| R12 | 交付 | 文件内容/凭据被发送到外部模型供应商 | 隐私/合规风险 | 用户使用云端 provider；`read` 可读绝对路径 | 当前无显式数据外发同意；建议增加数据边界与供应商说明（见 08） |
| R13 | 交付 | 高危命令被误判为只读而免授权 | 未授权写入/删除 | `sed -i`、`find -exec`、`awk system()`、`git branch -D` 等 | `classifyReadonly` 需补充危险参数形态；见 08 安全发现 |
| R14 | 交付 | 长任务/安装/起服务超时或进程残留 | 端口占用、资源泄漏 | npm install >120s、dev server 长驻、异常退出 | 进程组 kill、PID 记录、`killAllSubprocesses`、服务注册表 |
| R15 | 交付 | 本地存储损坏/配额满 | 会话或台账丢失 | localStorage 不可用、JSON 损坏 | try/catch 降级；`plannedFilesStore` 损坏回退空清单 |

风险清单覆盖：业务（R1-R4）、集成（R5-R7）、一致性（R8-R10）、交付/安全（R11-R15）。

---

## 6. 下一步准备清单（进入 `ddd-discover`）

| 项 | 内容 |
| :--- | :--- |
| 必要输入 | 01 本文档；代码基线 commit；场景卡与系统提示词；工具清单与 IPC 契约 |
| 参与角色 | 产品负责人（判定价值与优先级）；领域专家（判定任务/决策语义）；桌面端开发（判定代码事实）；UX（判定确认卡与文案） |
| 期望产出 | 事件流（主路径 + 异常/回滚路径）、命令/事件候选、热点、歧义清单、边界线索 |
| 已排除输入 | `docs/` 历史产品文档与旧领域文档；本地旧 DDD Skill 副本 |

---

## 7. 校验清单

- [x] 目标与非目标互斥且可落地执行
- [x] 约束与假设均已标注验证方式
- [x] 术语种子 ≥ 10 个（实际 25 个），歧义点已标注
- [x] 风险清单覆盖业务 / 集成 / 一致性 / 交付四类
- [x] 问题陈述与价值陈述不含技术实现细节
- [x] 明确声明未使用历史产品文档
