# 04 — 战术设计

> 聚合、实体、值对象、领域服务。新增 ContextEngine、Preheating、更新 ThinkingLevel。
> 已补齐全部占位内容，无"同旧版"引用。四层权威架构见 [02-领域模型](./02-domain-model.md) §6。

---

## 1. 聚合

### 1.1 Conversation 聚合

```
┌──────────────────────────────────────────────────────────────────┐
│ Conversation (聚合根)                                              │
│                                                                  │
│ id / title / status / thinkingLevel / prefixState                │
│                                                                  │
│ ◆ messages: Message[]                                            │
│ ◆ compactionSnapshots: CompactionSnapshot[]                      │
│ ◆ compactionConfig: CompactionConfig                             │
│     └── triggerMessageCount: 100    // ← 从 30 提升              │
│     └── triggerTokenThreshold: 200K // ← 从 64K 提升              │
│     └── preserveLastMessages: 20    // ← 从 10 提升              │
│ ◆ runtimeContext: RuntimeContext ★ 新增                           │
│     └── currentFile?: string        // 编辑器当前焦点文件          │
│     └── selectedCode?: string       // 用户选中的代码段            │
│     └── recentTools: ToolCall[]     // 最近的工具调用              │
│     └── lspContext?: LSPContext     // LSP 层注入的上下文          │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 AgentChain 聚合

YAML 声明式多 Agent 流水线。Stage handoff 使用结构化 JSON，不引入 A2A。DAG 无环约束。

### 1.3 PluginRegistry 聚合

插件注册、激活、停用生命周期管理。权限检查与沙箱。

### 1.4 ChangeSet 聚合

文件变更追踪：proposed → accepted/rejected。冲突检测。

### 1.5 ContextEngine ★ 重新设计

```
┌──────────────────────────────────────────────────────────────────┐
│ ContextEngine (聚合根)                                             │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ resolve(task: TaskContext, workspace: Workspace): ContextPayload│
│ │                                                               │ │
│ │ 内部管线:                                                      │ │
│ │   Layer 1: resolveLSP(task) → CodeContext[]                   │ │
│ │     if result.isSufficient → return                            │ │
│ │   Layer 2: resolveCodeRAG(task) → CodeContext[]               │ │
│ │     if result.isSufficient → return                            │ │
│ │   Layer 3: return AgentExplorationHint                        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ◆ LSPResolver (Layer 1)                                          │
│     ├── findDefinition(path, symbol)                             │
│     ├── findReferences(path, symbol)                             │
│     ├── getImports(path)                                         │
│     ├── getCallChain(path, symbol)                               │
│     ├── getTypeInfo(path, position)                              │
│     └── getDiagnostics(path)                                     │
│                                                                  │
│ ◆ CodeRAGResolver (Layer 2)                                      │
│     ├── semanticSearch(query, topK)                              │
│     └── findSimilarCode(snippet)                                 │
│                                                                  │
│ ◆ ContextAssembler                                              │
│     ├── assemble(contexts: CodeContext[]): string                │
│     │   // 将找到的代码片段格式化为 LLM 可读的上下文              │
│     └── estimateTokens(contexts): number                         │
│                                                                  │
│ ◆ CodeContext (值对象)                                            │
│     ├── source: 'lsp' | 'coderag' | 'agent'                     │
│     ├── filePath: string                                         │
│     ├── content: string                                          │
│     ├── relevance: number (0-1)                                  │
│     └── reason: string  // 为什么这段代码被包含                    │
│                                                                  │
│ ◆ ContextPayload (值对象)                                         │
│     ├── contexts: CodeContext[]                                  │
│     ├── totalTokens: number                                      │
│     ├── layerBreakdown: { lsp: N, coderag: N, agent: N }        │
│     └── suggestion?: string  // 如果不足，建议 Agent 下一步做什么  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.6 PrefixCacheState ★ 新增预热

```
┌──────────────────────────────────────────────────────────────────┐
│ PrefixCacheState (聚合根)                                         │
│                                                                  │
│ ◆ state: PrefixState                                             │
│ ◆ preheatingStatus: idle | warming | ready ★ 新增                │
│ ◆ standardPrefix: string         // 固定的"超级前缀"              │
│ ◆ preheatHistory: PreheatRecord[]                                 │
│                                                                  │
│ ◆ StandardPrefix (值对象) ★ 新增                                  │
│     ├── systemPrompt: string      // ~200 tokens                 │
│     ├── toolDefinitions: string   // 工具描述                     │
│     ├── projectMetadata: string   // 文件树 + 常用 AST 签名       │
│     └── hash: string              // 前缀的哈希，用于判断是否变化   │
│                                                                  │
│ ◆ PreheatRecord (值对象) ★ 新增                                   │
│     ├── timestamp: DateTime                                      │
│     ├── tokensSent: number                                       │
│     ├── cacheHit: boolean                                        │
│     └── cost: Money                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 值对象

### 2.1 ThinkingLevel ★ 更新

```typescript
type ThinkingLevel = 'none' | 'basic' | 'medium' | 'high'

function toDeepSeekParams(level: ThinkingLevel): DeepSeekThinkingParams {
  switch (level) {
    case 'none':
      return { thinking: { type: 'disabled' } }
    case 'basic':
      return { thinking: { type: 'enabled' } }
    case 'medium':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    case 'high':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
}

type DeepSeekThinkingParams = {
  thinking: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}
```

### 2.2 LSPTool ★ 新增

```typescript
// 注册到 ToolRegistry 的 LSP 工具
const LSP_TOOLS: SystemTool[] = [
  {
    name: 'find_definition',
    description: 'Find where a symbol is defined',
    source: 'builtin',
    parameters: { path: 'string', symbol: 'string' }
  },
  {
    name: 'find_references',
    description: 'Find all usages of a symbol',
    source: 'builtin',
    parameters: { path: 'string', symbol: 'string' }
  },
  {
    name: 'get_imports',
    description: 'Get all imports of a file and where they lead',
    source: 'builtin',
    parameters: { path: 'string' }
  },
  {
    name: 'get_call_chain',
    description: 'Trace the call chain from a function',
    source: 'builtin',
    parameters: { path: 'string', symbol: 'string' }
  },
  {
    name: 'get_type_info',
    description: 'Get type information at a position',
    source: 'builtin',
    parameters: { path: 'string', line: 'number', column: 'number' }
  },
  {
    name: 'get_diagnostics',
    description: 'Get errors and warnings for a file',
    source: 'builtin',
    parameters: { path: 'string' }
  }
]
```

### 2.3 RuntimeContext ★ 新增

```typescript
interface RuntimeContext {
  currentFile?: string
  selectedCode?: string
  cursorPosition?: { line: number; column: number }
  recentToolCalls: ToolCall[]
}
```

### 2.4 CodeContext ★ 新增

```typescript
interface CodeContext {
  source: 'lsp' | 'coderag' | 'agent'
  filePath: string
  content: string
  relevance: number
  reason: string
}

interface ContextPayload {
  contexts: CodeContext[]
  totalTokens: number
  layerBreakdown: { lsp: number; coderag: number; agent: number }
  suggestion?: string
}
```

---

## 3. 领域服务

### 3.1 ContextEngineService ★ 重新设计

```typescript
interface ContextEngineService {
  /**
   * 管道入口：根据任务返回精准上下文
   * Layer 1 → Layer 2 → Layer 3 逐层降级
   */
  resolveContext(task: TaskContext, workspace: Workspace): Promise<ContextPayload>
}

// 内部实现管线:
// 1. 从 RuntimeContext 提取目标符号
// 2. Layer 1: LSPResolver → 定义 + 引用 + 调用链 + 导入
// 3. 如果 token 已足够 → 返回
// 4. Layer 2: CodeRAG → 语义搜索补充
// 5. 如果仍不足 → 返回 AgentExplorationHint
```

### 3.2 PreheatingService ★ 新增

```typescript
interface PreheatingService {
  /**
   * 项目打开时调用
   * 后台构建超级前缀，发送虚拟请求预热缓存
   */
  preheat(workspace: Workspace, prefix: StandardPrefix): Promise<void>
  
  /**
   * 检查预热是否完成
   */
  isReady(): boolean
  
  /**
   * 文件变更后增量预热
   * (只在项目元信息变化时触发，成本极低)
   */
  reheatOnChange(changedFiles: string[]): Promise<void>
}
```

### 3.3 CompactionService

对话压缩服务。触发阈值 100 条消息 / 200K tokens。保留最近 20 条原始消息，其余生成结构化摘要。

### 3.4 ChainExecutorService

DAG 拓扑排序调度。Stage 依次执行，上游失败则下游 Skip。EventBus 推送进度。

### 3.5 PluginService

插件生命周期管理：加载、激活、停用。权限校验前置。

### 3.6 ReasoningCaptureService

reasoning_content 流式捕获。按 ThinkingLevel 结构化分组。

### 3.7 DiffApplyService

逐文件 / 逐处 accept/reject/applyAll。写入前冲突检测。

### 3.8 PrefixCacheService ★ 更新

```typescript
interface PrefixCacheService {
  updateCacheState(conversation: Conversation, prevMessages: Message[]): PrefixState
  shouldUseAppendOnly(state: PrefixState): boolean
  buildMessages(conversation: Conversation, state: PrefixState): ChatMessage[]
  onCompactionCompleted(conversation: Conversation, snapshot: CompactionSnapshot): void
  
  /** ★ 新增 */
  buildStandardPrefix(config: AppConfig, workspace: Workspace): StandardPrefix
}
```

---

## 4. 仓库接口

领域端口接口：IConversationRepository、IChainTemplateRepository、IPluginRepository、ICodeIndexRepository、IConfigurationRepository。均定义在领域层，实现在基础设施层。

---

## 5. 不变性规则

| 聚合 | 规则 |
|------|------|
| ContextEngine | Layer 1 结果已充分时，不进入 Layer 2（节省索引查询） |
| ContextEngine | 注入的上下文总 token < 上下文窗口的 30%（给推理和对话留空间） |
| PrefixCache | 预热仅在 idle 状态且前端不可见时执行 |
| PrefixCache | 预热必须使用 Flash + thinking=disabled（最低成本） |
| PrefixCache | 超级前缀 hash 变化 → 重新预热 |
| Conversation | 压缩保留 20 条原始消息，维持局部缓存 |
| AgentChain | dependsOn 无环 |
| Plugin | 未声明权限操作 → SecurityError |

---

## 6. 类型汇总

```typescript
// ===== 标识符 =====
type ConversationId = string & { readonly __brand: 'ConversationId' }
type MessageId = string & { readonly __brand: 'MessageId' }
type ChainId = string & { readonly __brand: 'ChainId' }
type StageId = string & { readonly __brand: 'StageId' }

// ===== ThinkingLevel ★ =====
type ThinkingLevel = 'none' | 'basic' | 'medium' | 'high'

// ===== CodeContext ★ =====
interface CodeContext {
  source: 'lsp' | 'coderag' | 'agent'
  filePath: string; content: string
  relevance: number; reason: string
}

// ===== ContextPayload ★ =====
interface ContextPayload {
  contexts: CodeContext[]
  totalTokens: number
  layerBreakdown: { lsp: number; coderag: number; agent: number }
  suggestion?: string
}

// ===== StandardPrefix ★ =====
interface StandardPrefix {
  systemPrompt: string
  toolDefinitions: string
  projectMetadata: string
  hash: string
}

// ===== LSP Tools ★ =====
type LSPToolName = 'find_definition' | 'find_references' | 'get_imports' 
                 | 'get_call_chain' | 'get_type_info' | 'get_diagnostics'

// ===== EventBus =====
interface DomainEvent<T = unknown> {
  readonly type: DomainEventType
  readonly aggregateId: string
  readonly timestamp: number
  readonly payload: T
}

interface EventBusPort {
  publish(event: DomainEvent): void
  subscribe(type: DomainEventType, handler: (e: DomainEvent) => void): () => void
}
```

---

**下一步**: [05-架构设计](./05-architecture.md)
