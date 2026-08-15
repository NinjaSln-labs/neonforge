# 07 — DeepSeek API 网关设计

> Streaming 解析、Prefix-Cache + 预热、Compaction 协调、1M 上下文策略。DeepSeek-only。
> 2026-08-07 无阶段对齐：新增 §1.1 forceTool 传递（执行保障的网关链路——确认点驱动）。

---

## 1. DeepSeek V4 API 参数

| 参数 | 说明 |
|------|------|
| `model` | `deepseek-v4-flash` / `deepseek-v4-pro` |
| `thinking` | `{type: 'enabled' \| 'disabled'}` |
| `reasoning_effort` ★ | `'high'` / `'max'`（仅 thinking=enabled 时有效） |
| `messages` | OpenAI 兼容格式 |
| `tools` | OpenAI 兼容格式 |
| `tool_choice` ★ 2026-08-07（语义 2026-08-16 更新——推进保障）| `'required'`（确认后**无推进**时强制模型推进——产出/提议/证据，非强制调工具）/ `'auto'`（澄清/等用户决策/失败诊断） |
| `stream` | SSE 流式输出 |
| `max_tokens` | 最大输出 token |

### 1.1 推进保障传递（ProgressGuarantee——无阶段目标驱动核心链路；2026-08-16 重设计，原 forceTool/执行保障）

```
ProgressGuarantee（领域层——确认状态 + 推进 + 失败 + 完成度 + pending）
    │ 决策 { mode: 'require-advance' | 'require-action' | 'auto'; reason: string }
    ▼
Gateway.buildRequest(mode)
    │ require-advance/require-action → tool_choice: 'required'
    │   ——强制对象是「推进」（产出/结构化提议/证据/提问），不是「必须调工具」
    │ auto → tool_choice: 'auto'（澄清/等用户决策/失败诊断——模型自由）
    ▼
DeepSeek API
```

| 场景 | mode | tool_choice | 理由 |
|------|------|-------------|------|
| pending（等用户决策——授权卡/确认卡悬挂）| auto | auto | 模型停住等用户（pending 恒不强制——三判定器同源）|
| 目标未确认 | auto | auto | 澄清（模型自由问答）|
| 方案未确认 | auto | auto | 等方案批准卡（模型只给方案）|
| 目标+方案确认、无任何推进 | **require-advance** | **required** | 防只说不做——强制推进（产出/提议/证据；模型可输出结构化提议与提问，不逼调工具）|
| 工具失败 | auto | auto | 释放诊断（模型停下修正——required 压制诊断是反模式）|
| 计划写完/解决确认 | auto | auto | 收敛（模型可停下汇报/对账）|

**不变式**：tool_choice 决策只来自领域层 ProgressGuarantee（网关不自行判定——单一事实来源）；required 语义 = 强制推进 ≠ 强制调工具（2026-08-16 推进保障重设计——A0 §4/`intent-confirmation-domain-design.md` §3.3）。

### ThinkingLevel → API 映射 ★

```typescript
function toDeepSeekParams(level: ThinkingLevel): DeepSeekThinkingParams {
  switch (level) {
    case 'none':   return { thinking: { type: 'disabled' } }
    case 'basic':  return { thinking: { type: 'enabled' } }
    case 'medium': return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    case 'high':   return { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
}
```

---

## 2. Streaming 解析状态机

同旧版：IDLE → PARSING_REASONING → PARSING_CONTENT / PARSING_TOOL_CALLS → FINISHED。

---

## 3. Prefix-Cache + 预热

> ⚠️ **实现权威更新（2026-08-01）**：本节约预热示例中的 `this.deepseek.streamChat` 直连调用为**旧写法**——按 A0 领域权威总纲 §6 裁决（D-C7），预热必须经 `DeepSeekGateway` 端口（`gateway.preheat(prefix)`），EventBus 只发通知。实现以 `00-domain-authority.md` 为准。

### 3.1 标准前缀（固定 ~5-10K）

```typescript
const STANDARD_PREFIX = `
You are a coding agent with these tools:
- read(path): read file
- write(path, content): create/overwrite
- edit(path, old, new): replace text
- bash(cmd): run shell command
- find_definition(path, symbol): locate symbol definition
- find_references(path, symbol): find all usages
- get_imports(path): get file imports
- get_call_chain(path, symbol): trace calls
- get_type_info(path, line, col): get type at position
- get_diagnostics(path): get errors/warnings

Work step by step. Explain before making changes.
Prefer edit() over write().

Project: ${projectName}
Structure: ${fileTreeSummary}
Key files: ${topLevelASTSignatures}
`
// ~200 tokens core + tool defs + project meta = 5-10K
```

### 3.2 预热请求

```typescript
class PreheatingService {
  async preheat(workspace: Workspace, prefix: StandardPrefix): Promise<void> {
    // 只在首次打开或 prefix hash 变化时执行
    if (this.lastHash === prefix.hash) {
      this.eventBus.publish({ type: 'preheat.cache_hit', ... })
      return
    }

    this.eventBus.publish({ type: 'preheat.started', ... })

    try {
      // 最低成本的虚拟请求
      await this.deepseek.streamChat({
        model: 'deepseek-v4-flash',
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prefix.stringify() }],
        max_tokens: 1  // 最小输出
      })
      // 响应丢弃，但 KV 已被 DeepSeek 缓存

      this.lastHash = prefix.hash
      this.eventBus.publish({ type: 'preheat.completed', ... })
    } catch (e) {
      // 预热失败不阻塞，降级运行
      this.eventBus.publish({ type: 'preheat.failed', ... })
    }
  }
}
```

### 3.3 Append-Only + 预热协同

```
预热成功 → 首次请求已命中 → 后续追加 → 持续命中
预热失败 → 首次请求 miss   → 后续追加 → 从第二请求开始命中

两种情况最终都达到 ≥90% 命中率
预热只是把"第二请求命中"提前到"第一请求命中"
```

---

## 4. 1M 上下文预算策略 ★

```
┌────────────────────────────────────────────────────────┐
│          1M Token 预算分配（不滥用, 精准使用）            │
│                                                        │
│  固定前缀    5-10K    缓存基石，永远不变                  │
│  LSP 上下文  5-30K    精准注入，仅相关文件                 │
│  CodeRAG     0-20K    仅 LSP 不够时启用                  │
│  对话历史    5-50K    压缩摘要 + 最近 20 条               │
│  推理空间    100-500K  Pro + reasoning_effort=max        │
│  工具结果    不定      大文件读操作、bash 输出            │
│  安全余量    200K+     永不满                              │
└────────────────────────────────────────────────────────┘

永远不因"便宜"而倾倒垃圾——每 1K 都有明确用途
```

---

## 5. Compaction ↔ PrefixCache 协调 ★ 更新

```
旧: 30条/64K 触发, 保留 10 条
新: 100条/200K 触发, 保留 20 条

更大的触发窗口 = 压缩频率显著降低
更多的保留消息 = PrefixCache 重建后命中更快

流:
  消息数超过 100 或 token 超过 200K
    → 触发 Compaction (thinking=none, 轻量)
    → 压缩摘要 + 保留最近 20 条原始消息
    → PrefixCache miss（前缀变了）
    → 但 20 条保留消息形成新基线
    → 后续请求在 20 条内继续 append → 很快恢复命中
    → 压缩释放的 token >> 重建缓存成本
```

---

## 6. ModelRouter: Flash ↔ Pro

```typescript
class ModelRouter {
  route(task: TaskContext, thinking: ThinkingLevel): ModelID {
    if (task.userRequestedPro) return 'v4-pro'
    if (thinking === 'high') return 'v4-pro'
    if (task.stageAgent === 'analyst' || task.stageAgent === 'architect') return 'v4-pro'
    return 'v4-flash'
  }
}
```

---

## 7. ToolCallRepair

同旧版。4 轮内部修复：畸形 JSON / 未知工具 / 截断 / 调用风暴。

---

## 8. StatusBar

```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 预热就绪 │ Cache: 94% │ 3.2K/0.8K │ ¥0.004 │ v4-flash  │
└──────────────────────────────────────────────────────────────┘

🟢 = 预热完成 + append-only
🟡 = 预热中 / 正常模式
🔴 = 预热失败 / 缓存重建
```

---

**← 设计文档全系列完成。**

## 文档索引

| 文档 | 核心变化 |
|------|---------|
| [01-竞品分析](./01-reference-analysis.md) | Pi / Reasonix / DeepCode / Cursor 深度对比 |
| [02-领域模型](./02-domain-model.md) | 四层架构、12 限界上下文、设计原则、统一语言 |
| [03-战略设计](./03-strategic-design.md) | 限界上下文详细建模、上下文映射 |
| [04-战术设计](./04-tactical-design.md) | 聚合根、值对象、领域服务、不变性规则 |
| [05-架构设计](./05-architecture.md) | 分层架构、管线设计、模块目录树、技术选型 |
| [06-领域事件](./06-domain-events.md) | 完整事件目录、关键时序图 |
