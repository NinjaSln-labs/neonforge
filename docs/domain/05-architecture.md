# 05 — 架构设计

> Electron + React、插件化、目录树。新增 ContextEngine（LSP 管线）、Preheating。
> 模块目录树为架构参考，实现时以 `docs/product/` 产品设计规范为准。四层模型见 [02-领域模型](./02-domain-model.md) §6。

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                       PLUGIN LAYER                                │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐    │
│  │CodeRAG │ │MCP Bridge│ │  Git   │ │  LSP   │ │  Stats   │ ...│
│  │Plugin  │ │ Plugin   │ │Plugin  │ │Plugin  │ │ Plugin   │    │
│  └───┬────┘ └────┬─────┘ └───┬────┘ └───┬────┘ └────┬─────┘    │
│      │           │           │          │           │            │
├──────┼───────────┼───────────┼──────────┼───────────┼────────────┤
│  ┌───┴───────────┴───────────┴──────────┴───────────┴─────────┐ │
│  │                    EVENT BUS (30+ events)                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                       CORE LAYER                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Conversat.│ │AgentChain│ │Compaction│ │Prefix    │           │
│  │          │ │          │ │          │ │Cache     │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Context   │ │Reasoning │ │DiffApply │ │Thinking  │           │
│  │Engine ★  │ │Capture   │ │          │ │Level     │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                      │
│  │Tool      │ │Preheating│ ★                                    │
│  │Registry  │ │          │                                      │
│  └──────────┘ └──────────┘                                      │
│                                                                  │
│  4 核心工具: read | write | edit | bash                          │
│  6 LSP 工具: find_definition | find_references | get_imports    │
│              get_call_chain | get_type_info | get_diagnostics    │
├──────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Electron  │ │ Monaco   │ │ File     │ │ SQLite   │           │
│  │(窗口)    │ │ Editor   │ │ System   │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**设计原则**：
- 核心 < 5000 行
- System prompt < 300 tokens
- Electron（非 Tauri）— Monaco 硬约束
- Event Bus 唯一跨模块通道

---

## 2. 上下文管线 ★ 新增

```
用户输入 "修改 authMiddleware"
    │
    ▼
┌──────────────────────────────────────────┐
│        ContextEngine.resolve()            │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ Layer 1: LSP Resolver               │ │
│  │  find_definition("authMiddleware")   │ │
│  │  find_references("authMiddleware")   │ │
│  │  get_imports("auth.ts")             │ │
│  │  get_call_chain("authMiddleware")   │ │
│  │                                     │ │
│  │  → 5 files, ~8K tokens              │ │
│  │  → sufficient? YES → return         │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ Layer 2: CodeRAG (if needed)        │ │
│  │  semanticSearch("permission check")  │ │
│  │  → 3 more snippets                  │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ Layer 3: Agent Exploration Hint     │ │
│  │  "Try reading config/security.ts"   │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
    │
    ▼
ContextPayload → 注入到 Conversation → 发送给 LLM
```

---

## 3. 预热管线 ★ 新增

```
项目打开
    │
    ▼
┌──────────────────────────────────┐
│ PreheatingService.preheat()       │
│                                   │
│  1. buildStandardPrefix()         │
│     system prompt (200 tokens)    │
│     + tool defs                   │
│     + 文件树 + AST 签名            │
│     = ~5-10K tokens               │
│                                   │
│  2. DeepSeek API (后台, 静默)      │
│     model: v4-flash               │
│     thinking: disabled             │
│     messages: [{role:'user',       │
│       content: standardPrefix}]    │
│                                   │
│  3. 响应丢弃（不需要结果）           │
│     但 KV 已被 DeepSeek 缓存       │
│                                   │
│  4. 用户首次真实请求                │
│     → 前缀匹配 → 缓存命中           │
│     → 首字延迟 ~0.3s               │
└──────────────────────────────────┘
```

---

## 4. 模块目录树 ★ 更新

```
neonforge/
├── apps/
│   ├── desktop/                          # Electron Main Process
│   │   └── src/
│   │       ├── main.ts
│   │       ├── ipc/
│   │       │   ├── fileHandlers.ts
│   │       │   ├── shellHandlers.ts
│   │       │   ├── lspHandlers.ts        ★ LSP 通信（主进程）
│   │       │   └── preheatHandlers.ts    ★ 预热（主进程后台）
│   │       └── adapters/
│   │           ├── FileSystemAdapter.ts
│   │           ├── ShellProcessAdapter.ts
│   │           ├── LSPClientAdapter.ts   ★ LSP 客户端
│   │           └── SqliteAdapter.ts
│   │
│   ├── renderer/
│   │   └── src/
│   │       ├── core/
│   │       │   ├── event-bus/
│   │       │   ├── conversation/
│   │       │   ├── compaction/
│   │       │   ├── thinking/
│   │       │   ├── prefix-cache/
│   │       │   │   ├── PrefixCacheService.ts
│   │       │   │   ├── PreheatingService.ts  ★
│   │       │   │   └── StandardPrefix.ts     ★
│   │       │   ├── agent-chain/
│   │       │   ├── reasoning/
│   │       │   ├── context-engine/           ★ 新增模块
│   │       │   │   ├── ContextEngine.ts
│   │       │   │   ├── LSPResolver.ts
│   │       │   │   ├── CodeRAGResolver.ts
│   │       │   │   ├── ContextAssembler.ts
│   │       │   │   └── CodeContext.ts
│   │       │   ├── diff/
│   │       │   ├── llm/
│   │       │   │   ├── DeepSeekClient.ts
│   │       │   │   ├── StreamParser.ts
│   │       │   │   ├── ToolCallRepair.ts
│   │       │   │   ├── ModelRouter.ts
│   │       │   │   └── TokenUsage.ts
│   │       │   ├── tools/
│   │       │   │   ├── ToolRegistry.ts
│   │       │   │   └── builtin/
│   │       │   │       ├── read.ts / write.ts / edit.ts / bash.ts
│   │       │   │       └── lsp-tools.ts    ★ 6 个 LSP 工具
│   │       │   └── project/
│   │       │
│   │       ├── plugins/
│   │       │   ├── PluginRegistry.ts
│   │       │   └── builtin/
│   │       │       ├── code-rag/           (降级为 Layer 2)
│   │       │       ├── mcp-bridge/
│   │       │       ├── git/
│   │       │       ├── stats/
│   │       │       └── language-server/    ★ LSP 插件
│   │       │
│   │       ├── ui/
│   │       │   ├── chat/  editor/  diff/  reasoning/
│   │       │   ├── agent-chain/  plugin-manager/
│   │       │   ├── context-panel/          ★ 上下文可视化面板
│   │       │   └── status-bar/
│   │       │       └── (Cache% | Preheated? | Tokens | Cost)
│   │       │
│   │       └── store/
│   │
│   └── cli/
│
├── packages/shared/
└── docs/
```

---

## 5. 工具注册 ★ 更新（含 LSP 工具）

```typescript
class ToolRegistry {
  constructor() {
    // 4 核心工具
    this.register({ name: 'read',  source: 'builtin', ... })
    this.register({ name: 'write', source: 'builtin', ... })
    this.register({ name: 'edit',  source: 'builtin', ... })
    this.register({ name: 'bash',  source: 'builtin', requiresApproval: true, ... })

    // 6 LSP 工具 ★
    this.register({ name: 'find_definition',  source: 'builtin', ... })
    this.register({ name: 'find_references',  source: 'builtin', ... })
    this.register({ name: 'get_imports',      source: 'builtin', ... })
    this.register({ name: 'get_call_chain',   source: 'builtin', ... })
    this.register({ name: 'get_type_info',    source: 'builtin', ... })
    this.register({ name: 'get_diagnostics',  source: 'builtin', ... })
  }
}
```

---

## 6. 关键选型

| 层 | 技术 | 理由 |
|----|------|------|
| 桌面 | **Electron** | Monaco 硬约束，不可妥协 |
| UI | React + Zustand | 轻量 |
| 编辑器 | **Monaco Editor** | IDE 级体验，产品核心 |
| 构建 | Vite 6 | Rolldown 加速 |
| 存储 | SQLite | 对话 + 索引 |
| LSP | vscode-languageserver-node | 成熟稳定 |

---

**下一步**: [06-领域事件](./06-domain-events.md)
