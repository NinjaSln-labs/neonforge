# 00 — 领域权威总纲（重构版 v2.0）

> 版本：v2.0 · 2026-07-31
> 状态：**实现权威**。本总纲为领域设计的唯一权威；A1–A7 降级为参考（冲突处以本总纲为准）。
> 重构依据：A8（08-domain-design-audit）第 1 轮审计 8 项 Critical + 14 Major，产品文档（`docs/product/` 100/100）为产品门禁。
> 方法：PRD 驱动领域建模——产品为问题空间，本总纲为解决方案空间权威；不逐文档修补，直接重构自洽。

---

## 1. 模型策略（裁决 D-C1）

**V1 = DeepSeek-only。** 对齐 README 与产品定位「专为 DeepSeek 打造，不是多模型兼容客户端」。

- `DeepSeekGateway` 不引入 provider 抽象层（Gateway 简化的架构红利成立）；
- 网关接口按单一 provider 设计，但**请求参数构造收敛在 `toDeepSeekParams()` 一处**——若 V2+ 需要多模型，只需在网关内新增 provider 适配，不扩散到领域层；
- `01` 的「DeepSeek-first + 可扩展」表述标记为 **V2+ 方向**，不进入 V1 实现决策；
- 产品文档（README/产品定位）已一致，无修改。

**裁决表**：`07` 题头「DeepSeek-only」= 保留 ✅；`02`「唯一适配」= 表述为「V1 唯一适配，V2 可扩展（见 §1）」；`01` §6.3「可扩展」= 标 V2+。

---

## 2. 限界上下文清单（裁决 D-C2 / D-C3 / D-C8）

**唯一权威清单：4 层 16 个 BC。** 03 额外建模的 Workspace / ShellAgent / TokenTracker / Configuration / MCPBridge 全部纳入；02 的 Preheating 降级为 PrefixCache 内领域服务（非独立 BC）。

### Layer 1: Code（基础编码层）

| 限界上下文 | 类型 | 职责 | 聚合根 | 归属裁决 |
|-----------|------|------|--------|---------|
| **ToolRegistry** | 通用域 | 工具注册/发现/执行（4 核心 + 6 LSP） | ToolRegistry | 02 保留 |
| **DeepSeekGateway** | 通用域（防腐层） | API 通信、StreamParser、ToolCallRepair、ModelRouter、**预热端口** | —（防腐层） | 02 保留 |
| **Editor** | 支撑域 | Monaco、DiffApply、ChangeSet | ChangeSet | 02 保留 |
| **Workspace** | 支撑域 | 项目文件 + LSP 客户端集成、文件监听 | Workspace | **03 晋升** |
| **ShellAgent** | 支撑域 | 命令执行沙箱（Main Process） | — | **03 晋升** |

### Layer 2: Design（分析设计层）

| 限界上下文 | 类型 | 职责 | 聚合根 |
|-----------|------|------|--------|
| **ThinkingLevel** | 核心域 | 推理深度四档 `none\|basic\|medium\|high` → reasoning_effort | ThinkingLevel（VO） |
| **ReasoningViz** | 核心域 | reasoning_content 捕获 → 结构化 → 分级展示 | ReasoningCapture |

### Layer 3: Orchestrate（Agent 协作层）

| 限界上下文 | 类型 | 职责 | 聚合根 |
|-----------|------|------|--------|
| **Conversation** | 核心域 | 多轮对话聚合，承载 ThinkingLevel + PrefixState + CompactionConfig | Conversation |
| **Compaction** | 核心域 | 触发阈值 100 条 / 200K，保留最近 20 条 | CompactionService |
| **PrefixCache** | 核心域 | Append-Only + **Preheating 服务（归属此处）**，≥90% 命中率 | PrefixCacheState |
| **ContextEngine** | 核心域 | LSP → CodeRAG → Agent 三层上下文管线 | ContextEngine |

### Layer 4: Engineering（产品交付层）

| 限界上下文 | 类型 | 职责 | 聚合根 |
|-----------|------|------|--------|
| **AgentChain** | 核心域 | YAML 声明式流水线（规格化见 §3） | AgentChain |
| **PluginSystem** | 支撑域 | 插件注册/生命周期/事件钩子/沙箱（内置 5 插件） | PluginRegistry |

### 通用支撑（跨层）

| 限界上下文 | 类型 | 职责 | 聚合根 |
|-----------|------|------|--------|
| **TokenTracker** | 通用域 | token/缓存/费用统计（含预热命中率） | TokenTracker |
| **Configuration** | 通用域 | 用户 & 项目配置 | Configuration |
| **MCPBridge** | 通用域 | MCP 协议外部工具集成（V1 可选） | — |

**类型判定规则**（解决 D-C3）：核心 = 产品差异化壁垒（上下文/推理/流水线）；支撑 = 核心的配合载体（编辑器/工作区/插件）；通用 = 无业务差异的基础设施（网关防腐/工具执行/配置/统计）。**PluginSystem 定为支撑域**（插件是产品形态核心配合，非纯通用设施）；**ContextEngine 定为核心域**（LSP 先行是产品独有壁垒）。

### BC 职责边界判定表（防实现期双源）

| 边界对 | 归属判定 | 理由 |
|--------|---------|------|
| **Workspace（文件+LSP 集成） vs Editor（Monaco+Diff）** | 文件监听 → Workspace；Diff/ChangeSet 渲染 → Editor | 文件系统/LSP 是 Workspace 的输入面；Editor 只消费 ChangeSet 做展示与交互，不直接碰 LSP |
| **ContextEngine（上下文管线） vs Workspace** | LSP 查询与上下文组装 → ContextEngine；LSP 连接/增量订阅 → Workspace | Workspace 管 LSP 客户端生命周期（连接/重连/文件变更事件）；ContextEngine 只调用其查询端口做 Layer 1-3 组装 |
| **DeepSeekGateway.ModelRouter vs ThinkingLevel** | 档位定义 → ThinkingLevel；路由决策（档位+任务→模型）→ ModelRouter | ThinkingLevel 是值对象（四档定义），ModelRouter 是决策者（读档位+任务上下文）；ThinkingLevel 不依赖 ModelRouter |
| **PrefixCache vs DeepSeekGateway** | 前缀构建/命中状态 → PrefixCache；实际 API 请求 → Gateway | PrefixCache 管状态与策略；Gateway 是唯一 API 出口（含预热请求，裁决 D-C7） |
| **AgentChain vs Conversation** | 流水线编排（角色/模板/Stage）→ AgentChain；对话上下文/消息流 → Conversation | AgentChain 描述"怎么跑"，Conversation 承载"跑在什么上"；Conversation 引用链结果 |
| **ToolRegistry vs ShellAgent** | 工具注册/执行分发 → ToolRegistry；命令执行沙箱（Main）→ ShellAgent | ToolRegistry 是目录与分发；ShellAgent 是 bash 执行者，ToolRegistry 调用其端口 |
| **ToolRegistry vs DeepSeekGateway（ToolCallRepair）** | 工具执行分发 → ToolRegistry；工具调用**修复**（畸形 JSON/未知工具/截断/风暴，4 轮）→ DeepSeekGateway | 修复是模型输出的清洗，属网关防腐职责（对齐 07 §7 ToolCallRepair）；ToolRegistry 只负责"执行"，不负责"修"——调用顺序：Gateway 修好 → ToolRegistry 执行 |

**使用规则**：实现新能力时，先查本表确定归属 BC；表未覆盖的边界，按「职责单一 + 输入面 vs 决策面」判定，并在本表追加一行（防漂移）。

---

## 3. AgentChain 规格化（裁决 D-C5 / D-M3）

删除全部「同旧版」占位。V1 规格化如下：

### 6 种 Agent 角色

| 角色 | 职责 | 默认模型 | 默认 ThinkingLevel |
|------|------|---------|-------------------|
| `analyst` | 分析问题、定位相关代码（ContextEngine 为主） | v4-flash | basic |
| `architect` | 设计方案、权衡取舍、产出修改计划 | v4-pro | medium |
| `implementer` | 执行修改（read/write/edit/bash） | v4-flash | basic |
| `reviewer` | 审核 ChangeSet、校验不变式 | v4-pro | medium |
| `researcher` | 外部调研（文档/API/竞品，V1 可选） | v4-flash | none |
| `compactor` | 对话压缩摘要（thinking=none） | v4-flash | none |

### 4 个内置模板（YAML）

```yaml
# 模板 1: single-agent —— 单 Agent 直答（V1 默认；产品三步工作流映射此链）
stages:
  - { agent: analyst, tools: [read, find_definition, get_diagnostics] }

# 模板 2: analyze-implement —— 分析 → 实现
stages:
  - { agent: analyst,   tools: [read, find_definition, find_references] }
  - { agent: implementer, tools: [read, write, edit, bash] }

# 模板 3: implement-review —— 实现 → 审核
stages:
  - { agent: implementer, tools: [read, write, edit, bash] }
  - { agent: reviewer,    tools: [read, get_diagnostics] }

# 模板 4: analyze-implement-review —— 三步全链（V1 手动任务可选）
stages:
  - { agent: analyst,     tools: [read, find_definition, get_call_chain] }
  - { agent: architect,   tools: [read, get_type_info], thinkingLevel: medium }
  - { agent: implementer, tools: [read, write, edit, bash] }
  - { agent: reviewer,    tools: [read, get_diagnostics], thinkingLevel: medium }
```

**V1 产品映射**：产品三步工作流（分析→确认→修改）由 **single-agent 链 + 用户确认闸门**实现（搭档单角色，不引入多 Agent 并行——对齐 D0 V1 范围「不做多 Agent 并行」）。多 Stage 模板为配置能力，V1 默认不启用多 Agent 并行编排。

---

## 4. 工具面（裁决 D-C4）

**统一叙事：Agent 可见 10 工具 = 4 核心 + 6 LSP。**

- 「叙述性 system prompt < 300 tokens」仅指 system 指令文本；tool defs 计入 StandardPrefix（总 5–10K）；
- 4 核心：`read` / `write` / `edit` / `bash`（bash 需审批）；
- 6 LSP：`find_definition` / `find_references` / `get_imports` / `get_call_chain` / `get_type_info` / `get_diagnostics`；
- 02 原则 1 / UL 同步改为「10 工具（4+6），叙述性 prompt <300」。

---

## 5. 上下文与 1M 预算（裁决 D-M10 / D-M11）

**以 07 §4 为权威**（与 1M 战略资源原则一致）：

```
固定前缀    5-10K    缓存基石（system 叙述 <300 + tool defs + 项目元）
LSP 上下文  5-30K    精准注入，仅相关文件（ContextEngine Layer 1）
CodeRAG     0-20K    仅 LSP 不够时启用（Layer 2）
对话历史    5-50K    压缩摘要 + 最近 20 条（Compaction 100条/200K 触发）
推理空间    100-500K  Pro + reasoning_effort=max
工具结果    不定      大文件读、bash 输出
安全余量    200K+     永不满
```

Compaction 触发：**100 条 / 200K**，保留最近 20 条，压缩用 `compactor` 角色（thinking=none），压缩后 20 条形成新缓存基线（02 原则 5 补触发值）。

---

## 6. Preheating 归属 + EventBus 规则（裁决 D-C7 / D-C8 / D-M8）

**Preheating**：PrefixCache BC 内的**领域服务**（操作 `PrefixCacheState`），非独立 BC。状态字段：`preheatingStatus` / `standardPrefix` / `history`（以 04 为准）。

**EventBus 唯一通道的精确规则**：
1. 跨模块**通知**一律走 EventBus（`preheat.started/completed/failed` 等）；
2. **数据/请求不经过 EventBus**——预热必须调用 `DeepSeekGateway` 的端口（`gateway.preheat(prefix)`），不得直连 `deepseek.streamChat`；
3. `DeepSeekClient`/`PreheatingService` 网络侧收敛在 **Main Process**（Electron 主进程持 Gateway；renderer 经 IPC 调用），裁决 D-M8。

---

## 7. 产品 ↔ 领域 V1 矩阵（裁决 D-C6 / D-M14）

| 领域能力 | V1 产品形态 | 门禁 |
|---------|------------|------|
| AgentChain（single-agent 链） | 搭档三步工作流（分析→确认→修改） | ✅ V1 做 |
| DiffApply / ChangeSet | Diff 审核（摘要→逐处→写入）| ✅ V1 做（产品核心） |
| ContextEngine（LSP 三层） | 后台能力，无 UI；@引用文件优先 | ✅ V1 做（无 UI） |
| PrefixCache + Preheating | 后台；「本轮用量」折叠显示 Cache% | ✅ V1 做（无 UI） |
| Compaction | 后台自动 | ✅ V1 做（无 UI） |
| ThinkingLevel | 无 UI；后台默认 `basic`（产品设置不含此档） | ✅ V1 后台，UI 进 V2 |
| ReasoningViz | 详情面板「🧠 怎么看这个问题」推理展示 | ✅ V1 做（产品 §3.4 动效） |
| TokenTracker | 「本轮用量」折叠（12K tokens/缓存命中 87%） | ✅ V1 做（无独立 StatusBar 项） |
| StatusBar | 产品权威：`🟢 就绪 │ branch │ 待审核: N`；领域指标进「本轮用量」 | ✅ 产品 `00` §3.3 权威 |
| PluginSystem | 内置插件（V1 无插件市场） | ✅ V1 做（无市场） |
| MCPBridge | 不进 V1 产品门禁 | ⏸ V1 不做（领域预留） |
| 多 Agent 并行 / Worktree | D0 范围外 | ❌ V2+ |

---

## 8. 术语表补充（裁决 D-M12）

在 02 §11 基础上补充：`ChangeSet`（暂存改动集合，状态 proposed→accepted→applied）、`DiffApply`（原子 apply 到文件系统）、`ModelRouter`（Flash↔Pro 路由）、`ToolCallRepair`（4 轮修复）、`handoff`（Stage 间结构化 JSON 交接）、`StandardPrefix`（固定前缀，缓存基石）、`Preheating`（预热服务，属 PrefixCache）。

---

## 9. Critical 裁决追溯表

| ID | 裁决 | 落点 |
|----|------|------|
| D-C1 | V1 = DeepSeek-only；`01` 可扩展标 V2+ | §1 |
| D-C2 | 唯一 BC 清单 4 层 16 个；03 额外 5 个纳入 | §2 |
| D-C3 | 类型按壁垒/配合/通用判定；PluginSystem=支撑、ContextEngine=核心 | §2 |
| D-C4 | 统一「10 工具（4+6）」；叙述性 prompt <300 | §4 |
| D-C5 | 6 角色 / 4 模板规格化；V1=single-agent 链 | §3 |
| D-C6 | 产品↔领域 V1 矩阵（做/无UI后台/不做） | §7 |
| D-C7 | EventBus 只发通知；预热经 Gateway 端口 | §6 |
| D-C8 | Preheating = PrefixCache 内服务，非独立 BC | §2/§6 |

**Major 处置**：D-M1 命名统一 NeonForge；D-M2 ThinkingLevel 四档（§2）；D-M3 已随 §3 清除占位；D-M4 保留 `preheat.completed`；D-M5 LSP 事件补全（见 `06` 修订）；D-M6 `05` 事件计数引用 `06`；D-M7 以 TS 合同为准；D-M8 见 §6；D-M9 不变式并入 `04`§5；D-M10 见 §5；D-M11 见 §5；D-M12 见 §8；D-M13 core 重定义为「领域核心模块（renderer/src/core）<5000 行」；D-M14 见 §7。

---

## 10. 对旧文档的处置

| 文档 | 处置 |
|------|------|
| 01 / 06 / 07 | 保留为参考（冲突以本总纲为准；07 仅 §1 模型策略与 §3.1 预热对齐总纲） |
| 02 | 降级参考；BC 清单/原则/UL 以本总纲 §2/§4/§8 为权威 |
| 03 | 降级参考；BC 全景以本总纲 §2 为权威（03 标注「早期模型」已自知） |
| 04 / 05 | 保留为参考；Preheating 归属（04 已一致）、进程边界（§6）、模块树对齐 §2 |
| 08（A8 审计） | 追加本总纲为「第 2 轮裁决产出」，Critical 全部闭合 |

**下一步**：按本总纲进入工程拆解（to-tickets）；实现时产品门禁仍先读 `product/00` + `04-alignment`。
