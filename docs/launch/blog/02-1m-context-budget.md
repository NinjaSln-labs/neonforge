# 1M 上下文预算：为什么我们给 agent 用 LSP 精准注入，而不是向量库

> NeonForge 设计思考 · 第 2 篇（共 3 篇）· 2026-08
> **NeonForge**——为 DeepSeek 打造的 AI 问题工作台：你之所向，我之所往；你之所定，我之所行。说出你的问题，拿到结果。[GitHub](https://github.com/NinjaSln-labs/neonforge)
> 配套源码：`apps/desktop/src/main/lsp.ts`（真实 LSP 客户端）· `codeRag.ts`（关键词兜底）· `context.ts`（@引用注入）

## 背景：上下文窗口很大，但 token 不是免费的

DeepSeek 有 1M 上下文。听起来可以把整个仓库塞进去。但三个现实：

1. **prefill 延迟**：上下文翻倍，首字延迟线性涨——这正是上一篇「缓存预热」要打的问题
2. **注意力稀释**：塞 50 万 token 无关代码，模型「找不到重点」的失败率显著上升
3. **成本**：每次请求都重复送前缀——贵

所以「1M 预算」的真正含义不是「能塞多少」，而是**「怎么用最少的 token 拿到正确的上下文」**。

## 我们的结论：agentic 检索 > 向量语义（调研 + 实践）

2025-26 行业共识正在转向**用工具检索代替向量库**：

- **Claude Code 弃用向量库改 grep**——官方口径：语义检索的召回质量对代码任务不划算
- **AAAI 2026（Amazon）论文 94.5%**：agent 调用 grep 类工具的检索准确率显著高于 embedding 检索
- **本地 embedding 的隐性成本**：~200MB 模型常驻 + 索引随代码变化陈旧 + 隐私（代码要过 embedding 模型）

对 NeonForge，结论更直接：**agent 问「这个符号在哪定义」是精确问题，向量检索是错工具**。

## 实现：三层检索，按需取用

### 1. LSP 真实连接（精确层——查「符号」）

`lsp.ts` 是 JSON-RPC over stdio 的轻量客户端（typescript-language-server）：

- `find_definition` / `find_references` / `get_type_info`（hover）/ `get_diagnostics`
- 工具参数设计成 **`path + symbol` 而非行号**——因为模型不知道行号，`locateSymbol` 用文本扫描把符号定位到行（确定性、零 token）
- 关键修复：tsserver 对未打开文件不解析——`didOpen` 联动打开 import 引入的文件（项目内防逃逸）

模型在对话中自主决定「查这个符号的定义」→ 拿到精确的 definition 位置 → 只读那几行。

### 2. `search` 工具（覆盖层——查「内容」）

`codeRag.ts` 关键词检索（大小写不敏感、扫描上限 200 文件、5 条命中）注册为 agent 工具——模型自主 `search({query})` 找相关文件，命中即注入片段。不建向量索引，标注降级。

### 3. `@引用`（显式层——用户指定）

`context.ts` ContextEngine：用户 `@文件名` → 解析相对/绝对路径 → 150 行截断 + 5 文件上限 + 2MB 限制 → 注入 system 消息。用户自己指定比任何检索都准。

## 效果

- **系统提示词保持 <300 tokens**（工具定义简短——精确工具不需要长描述）
- **单次请求上下文只含「与当前任务相关」的文件片段**——不是整仓
- 真实 Key 冒烟：模型自主调用 `find_definition({path, symbol})` ✅、自主 `search({query})` ✅

## 局限

- 打包版若系统无 `typescript-language-server` → LSP 层降级（对话/工具/交付主链路不受影响）
- 只做 TS/JS 生态精确层；其他语言靠 search 关键词 + @引用兜底

---

**系列（NeonForge 设计思考）**
1. [缓存预热：把 DeepSeek 首字延迟从 275ms 压到 118ms](01-cache-preheating.md)（**快**）
2. 1M 上下文预算：为什么我们给 agent 用 LSP 精准注入，而不是向量库（本篇——**省**）
3. [为什么 NeonForge 只做 DeepSeek](03-why-deepseek-only.md)（**深**）

*下一篇（终篇）：「为什么只做 DeepSeek」——单模型深度集成的工程理由（预热、前缀、成本）。*
