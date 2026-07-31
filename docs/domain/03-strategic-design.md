# 03 — 战略设计

> 限界上下文详细建模。新增 ContextEngine（LSP + CodeRAG 三层），DeepSeek-first。
> ⚠️ **实现权威更新（2026-08-01）**：本文为**历史参考**——唯一权威为 [00-领域权威总纲](./00-domain-authority.md)（A0：4 层 16 BC、模型策略 V1=DeepSeek-only、AgentChain 规格化）。本文三层分类（核心/支撑/通用）为早期模型，BC 清单/类型/AgentChain 以 A0 §2/§3 为准；本文 §1 上下文映射图为**历史 15 BC 视图**（A0 为 16 BC，差异在 MCPBridge 单列/合并），以 A0 为准。

---

## 1. 限界上下文全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Deep IDE 领域全景                              │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │Compaction│ │Thinking  │ │PrefixCache│ │AgentChain│ │Reasoning │ │
│  │ (核心域)  │ │Level     │ │ (核心域)  │ │ (核心域)  │ │Viz       │ │
│  │          │ │ (核心域)  │ │ +预热     │ │          │ │ (核心域)  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       │            │            │            │             │       │
│       ▼            ▼            ▼            ▼             ▼       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Conversation (支撑域)                        │   │
│  │  · CompactionTrigger  · ThinkingLevel 绑定                  │   │
│  │  · PrefixState  · RuntimeContext                            │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────┼──────────────────────────────────┐   │
│  │                          ▼                                    │   │
│  │  ┌──────────────────────────────────────┐                     │   │
│  │  │        DeepSeekGateway (通用域)       │                     │   │
│  │  │  · DeepSeekClient · StreamParser     │                     │   │
│  │  │  · ToolCallRepair · ModelRouter      │                     │   │
│  │  └──────────────────────────────────────┘                     │   │
│  │                                                                │   │
│  │  ┌────────────────┐ ┌──────────┐ ┌──────────┐                 │   │
│  │  │ ContextEngine  │ │Plugin    │ │MCPBridge │                 │   │
│  │  │ (支撑域) ★新增  │ │System    │ │ (通用域)  │                 │   │
│  │  │ LSP→CodeRAG     │ │ (支撑域)  │ │          │                 │   │
│  │  │ →Agent探索      │ │          │ │          │                 │   │
│  │  └───────┬────────┘ └────┬─────┘ └──────────┘                 │   │
│  │          │               │                                     │   │
│  │  ┌───────┴───────┐ ┌────┴─────┐ ┌──────────┐                   │   │
│  │  │  Editor       │ │Workspace │ │ShellAgent│                   │   │
│  │  │  (支撑域)      │ │(支撑域)   │ │(支撑域)   │                   │   │
│  │  │  Monaco       │ │+LSP集成  │ │          │                   │   │
│  │  └───────────────┘ └──────────┘ └──────────┘                   │   │
│  │                                                                │   │
│  │  ┌────────────────┐ ┌──────────────────┐                       │   │
│  │  │ TokenTracker   │ │ Configuration    │                       │   │
│  │  │ (通用域)        │ │ (通用域)          │                       │   │
│  │  └────────────────┘ └──────────────────┘                       │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心域

### 2.1 Compaction

**职责**：自动管理上下文窗口。**1M 窗口解放了压缩的紧急性**——从"紧急措施"变为"优化手段"。

| 旧策略 | 新策略 |
|--------|--------|
| 触发阈值: 30条 / 64K tokens | 触发阈值: **100条 / 200K tokens** |
| 保留最近 10 条 | 保留最近 **20 条** |
| 频繁触发压缩 | 大多数对话不需要压缩 |
| 压缩时 PrefixCache 全 miss | 压缩后 20 条保留消息形成新缓存基线 |

**关键业务规则**：触发阈值 **100 条 / 200K**、保留最近 **20 条**（A0 §5 与 03/04/06/07 对齐）；压缩后 20 条保留消息形成新缓存基线。

### 2.2 ThinkingLevel

**职责**：控制推理深度。更新为使用 DeepSeek V4 `reasoning_effort` 参数。

| Level | API 参数 | 推理 budget | 典型场景 |
|-------|---------|------------|---------|
| `none` | `thinking: disabled` | 0 | 简单问答 |
| `basic` | `thinking: enabled` (默认) | ~100-300 | 常规编码 |
| `medium` | `thinking: enabled, reasoning_effort: high` | ~300-800 | 架构设计 |
| `high` | `thinking: enabled, reasoning_effort: max` | ~800-2000 | 算法分析 |

### 2.3 PrefixCache

**职责**：Append-only + **预热**，最大化缓存命中。

**新增：预热（Preheating）**

```
打开项目
  → 后台构建"超级前缀"（system prompt + tool defs + 项目元信息）
  → 发送虚拟请求到 DeepSeek API（静默，不显示给用户）
  → API 缓存前缀的 KV 计算
  → 用户第一次真实请求 → 已经是缓存命中状态
  → 首字延迟从 ~2s 降至 ~0.3s
```

**超级前缀内容**（固定 5-10K tokens）：
- System prompt (~200 tokens)
- Tool definitions
- 项目文件树摘要
- 常用文件路径的 AST 签名

**关键约束**：预热请求使用 Flash 模型 + thinking=disabled，成本极低。

### 2.4 AgentChain

声明式 YAML 流水线，6 种 Agent 角色（analyst/architect/implementer/reviewer/researcher/compactor），4 个内置模板（single-agent/analyze-implement/implement-review/analyze-implement-review，A0 §3 规格化）。

**Stage 间 handoff 格式**：结构化 JSON（不是 A2A 协议——理由：Stage 同进程运行，不需要分布式协议）。

### 2.5 ReasoningViz

reasoning_content 捕获 → 结构化 → 按 ThinkingLevel 四档（none/basic/medium/high）分级展示（A0 §2 Layer 2）。

---

## 3. 支撑域

### 3.1 ContextEngine ★ 重新设计

**职责**：为 Agent 提供当前任务所需的精准代码上下文。三层管线。

```
用户指令: "修改 authMiddleware 的逻辑"

┌─ Layer 1: LSP + 依赖图 ──────────────────────────────┐
│                                                        │
│  find_definition("authMiddleware")                     │
│    → src/middleware/auth.ts:42                         │
│  find_references("authMiddleware")                     │
│    → app.ts:15, routes/api.ts:8, routes/admin.ts:22   │
│  get_imports("src/middleware/auth.ts")                 │
│    → jwt.ts, config.ts, types.ts                      │
│  get_call_chain("authMiddleware")                      │
│    → authMiddleware → validateToken → checkPermission │
│                                                        │
│  输出: 5 个精准文件, 共 ~8K tokens                     │
│  成本: 0 tokens, ~50ms                                 │
│  精度: 100% (确定性的)                                  │
└────────────────────────────────────────────────────────┘
                              │
                              ▼ 不够？还有模糊查询
┌─ Layer 2: CodeRAG ────────────────────────────────────┐
│                                                        │
│  "项目中有没有其他地方做类似的权限检查？"                   │
│    → 语义搜索 "permission check pattern"               │
│    → 返回 3 个相关代码片段                               │
│                                                        │
│  成本: 需要维护向量索引                                  │
│  精度: ~85-95%                                         │
└────────────────────────────────────────────────────────┘
                              │
                              ▼ 还不够？
┌─ Layer 3: Agent 自主探索 ──────────────────────────────┐
│                                                        │
│  LLM: "我读了 auth.ts，发现它导入了 jwt.ts              │
│        让我看看 jwt.ts..."                              │
│  → read("src/utils/jwt.ts")                            │
│  → read("src/config/security.ts")                      │
│                                                        │
│  成本: token 消耗                                       │
│  适用: 前两层都解决不了的复杂场景                         │
└────────────────────────────────────────────────────────┘
```

**CodeRAG 角色重新定位**：从"默认上下文引擎" → **降级为 Layer 2 语义精筛器**。代码有结构，不需要用猜的。

**LSP 层提供的工具**（注册到 ToolRegistry）：
- `find_definition(path, symbol)` → 精确跳转
- `find_references(path, symbol)` → 所有引用点
- `get_imports(path)` → 依赖关系
- `get_call_chain(start)` → 调用链
- `get_type_info(path, position)` → 类型
- `get_diagnostics(path)` → 错误/警告

### 3.2 PluginSystem

插件注册/生命周期/事件钩子/沙箱。内置 5 个插件（code-rag/mcp-bridge/git/stats/language-server，A0 §2 Layer 4 + 05 模块树）；PluginSystem 为支撑域（A0 §2 类型判定）。

### 3.3 Conversation

职责：多轮对话聚合点。绑定 ThinkingLevel + PrefixState + CompactionConfig。

### 3.4 Editor

Monaco Editor + DiffPanel + ChangeSet。Electron 架构下运行。

### 3.5 ShellAgent

命令执行沙箱。Electron Main Process 中执行。

### 3.6 Workspace

项目文件管理 + **LSP 客户端集成**。文件监听 → 触发 ContextEngine 增量更新。

---

## 4. 通用域

### 4.1 DeepSeekGateway

| 元素 | 说明 |
|------|------|
| DeepSeekClient | HTTP/SSE 客户端 |
| StreamParser | reasoning_content → content → tool_calls 状态机 |
| ToolCallRepair | 4 轮自动修复 |
| ModelRouter | Flash↔Pro 自动切换 |

**新增：PreheatingClient** — 后台静默调用 DeepSeek API 预热缓存。

### 4.2 TokenTracker

实时 token/缓存/费用统计。新增：缓存预热命中率独立显示。

### 4.3 MCPBridge

MCP 协议外部工具集成。不引入 A2A。

### 4.4 Configuration

用户 & 项目配置管理。

---

## 5. 上下文映射

```
                          U/S
┌──────────┐              ┌──────────┐
│AgentChain│─────────────►│Conversation│◄─────────────┐
│ (核心域)  │              │ (支撑域)    │              │
└──────────┘              └─────┬──────┘              │
                               │                      │
              ┌────────────────┼────────────────┐     │
              │                │                │     │
              ▼                ▼                ▼     │
      ┌──────────┐    ┌──────────┐     ┌──────────┐   │
      │Compaction│    │Thinking  │     │PrefixCache│   │
      │ (核心域)  │    │Level     │     │ (核心域)   │   │
      └──────────┘    │(核心域)   │     │ +预热     │   │
                      └──────────┘     └──────────┘   │
                               │                       │
                               ▼                       │
                      ┌──────────────┐                 │
                      │DeepSeekGateway│◄────────────────┘
                      │  (通用域)     │    ReasoningViz
                      └──────┬───────┘    (核心域)
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │Token     │   │MCPBridge │   │ToolCall  │
      │Tracker   │   │ (通用域)  │   │Repair    │
      └──────────┘   └──────────┘   └──────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌──────────────┐  ┌──────────────┐
            │PluginSystem  │  │ContextEngine │
            │ (支撑域)      │  │ (支撑域) ★    │
            └──────┬───────┘  └──────┬───────┘
                   │                 │
       ┌───────────┼───────┐         │
       │           │       │         │
       ▼           ▼       ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Editor  │ │Workspace │ │ShellAgent│
│ (支撑域)  │ │(支撑域)   │ │(支撑域)   │
│ Monaco   │ │+LSP集成  │ │          │
└──────────┘ └──────────┘ └──────────┘
```

---

**下一步**: [04-战术设计](./04-tactical-design.md)
