# 06 — 领域事件

> 完整事件目录。新增 ContextEngine、Preheating、LSP 工具事件。
> 已补齐全部占位内容，无"同旧版"引用。

---

## 1. 事件目录

### 1.1 ContextEngine 事件 ★ 新增

| 事件 | 触发时机 | 携带数据 | 消费方 |
|------|---------|---------|--------|
| `context.resolved` | 上下文管线完成 | taskId, payload, layerBreakdown | Conversation（注入上下文） |
| `context.lsp_hit` | LSP 层命中 | taskId, fileCount, tokenCount | StatusBar |
| `context.coderag_fallback` | 降级到 CodeRAG | taskId, reason | — |
| `context.agent_explore_hint` | 前两层不够，建议 Agent 探索 | taskId, suggestion | Agent（读取建议文件） |

### 1.2 Preheating 事件 ★ 新增

| 事件 | 触发时机 | 携带数据 | 消费方 |
|------|---------|---------|--------|
| `preheat.started` | 开始预热 | projectId, prefixHash | StatusBar（"预热中..."） |
| `preheat.completed` | 预热完成 | projectId, cacheHit, cost, duration | StatusBar（🟢 就绪） |
| `preheat.cache_hit` | 预热请求命中已有缓存 | projectId | — |
| `preheat.failed` | 预热失败（网络等） | projectId, error | StatusBar（非阻塞，降级） |

### 1.3 Compaction 事件

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `compaction.warning` | 剩余 < 20% (200K 中 < 40K) | conversationId, remaining |
| `compaction.triggered` | 触发（100条 或 200K） | conversationId, messageCount |
| `compaction.completed` | 完成 | conversationId, snapshot, savedTokens |
| `compaction.failed` | 失败 | conversationId, error |

### 1.4 AgentChain 事件

chain.loaded / chain.started / stage.started / stage.reasoning / stage.reasoning_block / stage.tool_call / stage.tool_result / stage.completed / stage.failed / chain.completed / chain.failed — 共 11 个。

### 1.5 Plugin 事件

plugin.registered / plugin.activated / plugin.deactivated / plugin.error / plugin.hook_triggered — 共 5 个。

### 1.6 Conversation 事件

| 事件 | 说明 |
|------|------|
| `conversation.created` / `archived` | 生命周期 |
| `message.appended` / `edited` | 消息变更 → 触发 Compaction 检查 |
| `thinking_level.changed` | Level 变更 |
| `streaming.started` / `token` / `reasoning_token` / `completed` | 流式输出 |

### 1.7 LSP 工具事件 ★ 新增

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `lsp.find_definition` | 查找定义 | filePath, symbol, result |
| `lsp.find_references` | 查找引用 | filePath, symbol, count |
| `lsp.get_imports` | 获取导入 | filePath, importCount |
| `lsp.get_call_chain` | 调用链 | filePath, symbol, depth |

### 1.8 PrefixCache 事件

| 事件 | 说明 |
|------|------|
| `cache.hit` / `cache.missed` | 缓存命中/未命中 |
| `cache.append_only_activated` / `broken` | append-only 模式变更 |
| `cache.preheat_ready` ★ | 预热就绪 |

### 1.9 CodeRAG 事件（降级为 Layer 2）

| 事件 | 说明 |
|------|------|
| `coderag.index.ready` / `stale` | 索引状态 |
| `coderag.retrieved` | 检索完成 |

### 1.10 ChangeSet / Shell / Project

change.proposed / change.accepted / change.rejected / changeset.applied。
shell.command.executed / shell.command.failed。
project.opened / project.closed / file.changed。

---

## 2. 关键时序图

### 2.1 ContextEngine 管线

```
Agent          ContextEngine      LSPResolver      CodeRAGResolver
 │                  │                  │                  │
 │ resolve(task)    │                  │                  │
 ├─────────────────►│                  │                  │
 │                  │ Layer 1: LSP     │                  │
 │                  ├─────────────────►│                  │
 │                  │ find_definition  │                  │
 │                  │ find_references  │                  │
 │                  │ get_imports      │                  │
 │                  │ get_call_chain   │                  │
 │                  │                  │                  │
 │                  │ 5 files, 8K      │                  │
 │                  │◄─────────────────┤                  │
 │                  │                  │                  │
 │                  │ sufficient? YES  │                  │
 │                  │                  │                  │
 │ context.payload  │                  │                  │
 │◄─────────────────┤                  │                  │
 │                  │                  │                  │
 │  (如果 LSP 不够)  │                  │                  │
 │                  │ Layer 2: CodeRAG │                  │
 │                  ├──────────────────────────────────►│
 │                  │                  │  semanticSearch │
 │                  │ 3 snippets       │                  │
 │                  │◄──────────────────────────────────┤
```

### 2.2 预热 → 首次请求

```
User           PreheatingSvc     DeepSeekAPI     PrefixCache
 │                  │                 │               │
 │ 打开项目          │                 │               │
 ├─────────────────►│                 │               │
 │                  │ buildPrefix()   │               │
 │                  │ POST /chat      │               │
 │                  │ (Flash,         │               │
 │                  │  thinking=none) │               │
 │                  ├────────────────►│               │
 │                  │  (静默, 丢弃)    │               │
 │                  │◄────────────────┤               │
 │                  │                 │ KV cached     │
 │                  │ preheat.completed               │
 │   🟢 就绪        │                 │               │
 │                  │                 │               │
 │  "帮我改..."     │                 │               │
 ├─────────────────►│                 │               │
 │                  │ POST /chat      │               │
 │                  │ (前缀匹配!)     │               │
 │                  ├────────────────►│               │
 │                  │                 │ cache.hit!    │
 │                  │ 0.3s 首字延迟   │               │
 │                  │◄────────────────┤               │
 │  极速响应        │                 │               │
```

---

**下一步**: [07-API网关设计](./07-api-gateway.md)
