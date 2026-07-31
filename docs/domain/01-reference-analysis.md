# 01 — 参考项目分析

> 对 Pi、Reasonix、DeepCode (HKUDS)、Cursor 四个参考项目的深入分析，作为设计修正的输入。  
> **最后更新**: 2026-07-29

---

## 0. 最新动态 (2026年7月)

### 0.1 新发现：oh-my-pi — Pi 的 Rust 重写版

**oh-my-pi** (can1357/oh-my-pi, 14,312 commits!) 是 Pi 生态中最值得关注的衍生项目：

- **Rust 重写**：用 Rust 重写核心，性能大幅提升
- **hash-anchored edits**：用哈希锚定的编辑替代传统的 search/replace——更精准、冲突更少
- **LSP 集成**：内置语言服务器支持——这是 Pi 原版没有的
- **Python + Browser 工具**：扩展了原版 Pi 的 4 工具集
- **"coding agent with the IDE wired in"**：项目描述暗示正在走向 IDE 集成

> 🔑 **信号**：社区已经在往「极简哲学 + IDE 体验」方向走。oh-my-pi 正好踩在我们想做但还没做的位置上。

### 0.2 新发现：Deep Code — DeepSeek 官方文档收录的新工具

DeepSeek 官方 API 文档收录了一个叫 **Deep Code** 的终端 AI 编程助手（注意：不是 HKUDS/DeepCode）：

| 属性 | 详情 |
|------|------|
| 首次发布 | 2026年5月 (v0.1.20) |
| 最新版本 | v0.1.31 (2026-06-16) |
| 特性 | 深度思考、推理强度控制、Agent Skills |
| 形态 | CLI + VS Code 扩展 |

> 🔑 **信号**：DeepSeek 官方在主动推广第三方编码工具。AI Native IDE 如果做 DeepSeek 优先，有机会进入官方的推荐生态。

### 0.3 关键数据更新

| 项目 | 最新数据 |
|------|---------|
| **Pi** | GitHub 生态 425+ repos；核心 npm 包 `@mariozechner/pi-agent-core` |
| **Reasonix** | v1.17.3（桌面版 Tauri GUI 预发布）；~83,000 Stars |
| **DeepCode (HKUDS)** | 211 commits，最近活动 2026-07-10；新增 Web UI + prompts 模块 |
| **DeepSeek V4** | 正式版 7月中旬上线，引入峰谷定价（高峰 2x） |

---

## 1. Pi Coding Agent

**作者**: Mario Zechner (libGDX 作者)  
**形态**: 终端 TUI (Node.js/TypeScript)  
**定位**: 极简 AI 编程 Agent，Claude Code 的"反向"选择  
**上线**: 2025年底 ~ 2026年初  

### 优点

| # | 优点 | 说明 |
|---|------|------|
| 1 | **极简系统提示** | ~200 tokens，仅 4 工具 (read/write/edit/bash)。token 消耗低，模型更专注，不会因冗长提示产生幻觉漂移 |
| 2 | **对话压缩 (Compaction)** | 长对话自动触发压缩：早期消息 → 结构化摘要。上下文窗口永不溢出，这是所有竞品中最稀缺的能力 |
| 3 | **ThinkingLevel 分级** | none/basic/medium/high 四档推理深度。用户按任务复杂度选择，简单问答不走深度思考，省 token |
| 4 | **声明式 Agent-Chain** | YAML 定义多 Agent 流水线（stages → agent → thinking → depends_on），可版本控制、可共享 |
| 5 | **Event Bus 驱动** | 25+ 领域事件、松耦合架构。每步可观测、可审计、可拦截 |
| 6 | **插件扩展体系** | 16+ plugins，核心精简、能力外挂。插件通过 Event Bus 注入，不污染核心代码 |
| 7 | **4 种运行模式** | Interactive TUI / Print / JSON / RPC，适配不同场景（日常开发 → CI/CD → 作为后端服务） |
| 8 | **生态活跃** | 2026年7月社区已涌现大量周边：Pocket Pi (Android)、pi-todotools、多种 proxy/agent 桥接。**oh-my-pi** (Rust 重写 + LSP + IDE 集成，14K+ commits) 是最值得关注的衍生项目 |

### 缺点

| # | 缺点 | 影响 |
|---|------|------|
| 1 | **不针对 DeepSeek 优化** | 主要适配 Claude/Anthropic API。不支持 reasoning_content 处理、不利用 prefix-cache 特性 |
| 2 | **无 Prefix-Cache 策略** | 消息历史正常发送，不刻意维持前缀一致性。用 DeepSeek 时缓存命中率低，成本无优势 |
| 3 | **终端 only** | 无 GUI / 桌面 IDE。虽然生态已有 Pocket Pi 等，但 IDE 级别的编辑器体验缺失 |
| 4 | **无 CodeRAG** | 大项目中全靠 LLM 自己去定位代码，无检索增强。项目变大后效率下降 |
| 5 | **多 Agent 编排较浅** | Agent-Chain 是声明式的，但 stage 间 handoff 简单（纯文本传递），无结构化上下文传递 |
| 6 | **社区力量分散** | 开源但核心依赖 Mario 个人。商业化路径不明确，长期维护存在不确定性 |
| 7 | **Diff 体验简陋** | 无 IDE 级 Diff Apply / Reject 面板。变更审批依赖终端交互 |

---

## 2. Reasonix (DeepSeek-Reasonix)

**作者**: esengine  
**形态**: 终端 + 桌面（Tauri，预发布）(Node.js/TypeScript)  
**定位**: DeepSeek-only 终端编程 Agent，为 prefix-cache 而生  
**上线**: 2026年4月  
**最新版本**: v1.17.3 (2026年7月)  
**数据**: GitHub ~83,000 stars，MIT 协议，TypeScript

### 优点

| # | 优点 | 说明 |
|---|------|------|
| 1 | **Prefix-Cache 极致优化** | Append-only 消息循环→缓存命中率 90%~99.8%。长会话输入 token 成本降至常规 1/5。435M input tokens / 12美元的真实案例 |
| 2 | **DeepSeek Native** | 深度适配 DeepSeek API：reasoning_content 处理、tool call 中 reasoning 强制传递、prefix-cache 感知的消息构建 |
| 3 | **Token 实时追踪** | 状态栏实时显示缓存命中率、token 消耗、预估费用。成本完全透明 |
| 4 | **智能模型切换** | Auto 模式：简单任务→v4-flash (快+便宜)，复杂任务→v4-pro (能力强)。用户也可 /pro 手动切换 |
| 5 | **工具调用修复** | 4 轮内部处理：修复畸形 JSON、参数错误、重复调用风暴、JSON 截断——这些都是 DeepSeek 常见问题 |
| 6 | **Skill 与记忆系统** | Markdown Skill 编写（inline/subagent 模式），用户私有知识的前缀记忆注入 |
| 7 | **桌面版体验** | Tauri 原生 GUI（预发布）：多标签页、文件读写追踪、成本仪表盘 |
| 8 | **QQ 远程通道** | 可将会话扩展为 QQ 远程交互通道——独特的移动端接入方式 |

### 缺点

| # | 缺点 | 影响 |
|---|------|------|
| 1 | **DeepSeek Only** | 只能调用 DeepSeek API。模型选择零弹性，DeepSeek 服务故障时完全不可用 |
| 2 | **单 Agent 架构** | 无多 Agent 协作。复杂任务无法拆解为 analyst→architect→coder→reviewer 流水线 |
| 3 | **无 CodeRAG** | 和 Pi 一样，缺少代码检索增强。大项目中 LLM 靠记忆和搜索找代码 |
| 4 | **插件体系薄弱** | 无 Pi 式的插件扩展框架。Skill/Memory 是内置功能而非可扩展架构 |
| 5 | **无 Compaction** | 轮次结束后会"自动压缩上下文"，但这不同于 Pi 的结构化 Compaction（保留决策/变更/错误） |
| 6 | **ThinkingLevel 缺失** | 无推理深度分级控制。要么开启 thinking 要么关闭，无法按任务粒度调节 |
| 7 | **Agent-Chain 缺失** | 无声明式多 Agent 流水线。复杂任务靠用户手动分步 |
| 8 | **项目年轻** | 2026年4月才上线，虽已有83K stars，但相比 Pi/Cursor 文档和社区深度不足 |

---

## 3. DeepCode (HKUDS/DeepCode)

**作者**: 香港大学 HKUDS 实验室  
**形态**: Python CLI + Web UI  
**定位**: 开源多 Agent 编程平台，Paper2Code / Text2Web / Text2Backend  
**上线**: 2025年  

### 优点

| # | 优点 | 说明 |
|---|------|------|
| 1 | **7-Agent 协作架构** | Orchestrator → Analyst → Architect → Coder → Reviewer → Tester。工业化任务拆解，各角色各司其职 |
| 2 | **CodeRAG** | 代码检索增强生成。大项目中精准定位相关代码片段，注入 LLM 上下文 |
| 3 | **MCP 协议支持** | Model Context Protocol 标准化外部工具集成。生态兼容性好 |
| 4 | **Paper2Code** | 从学术论文到可运行代码的端到端流水线。科研→工程的独特能力 |
| 5 | **Text2Web / Text2Backend** | 自然语言描述→前端页面 / 后端服务。面向全栈场景 |
| 6 | **Python 生态** | Python 技术栈，与 AI/ML 工具链天然兼容 |

### 缺点

| # | 缺点 | 影响 |
|---|------|------|
| 1 | **研究项目属性** | 来自学术实验室，非产品化软件。代码质量、稳定性、长期维护存疑 |
| 2 | **7-Agent 过度设计** | 简单任务（改个变量名）也要走完整流水线——浪费 token 和时间。缺少轻量模式 |
| 3 | **无 Prefix-Cache** | 不针对任何模型做缓存优化。DeepSeek 上的成本无优势 |
| 4 | **无 Compaction** | 长对话无压缩机制。上下文窗口溢出后会丢失早期信息 |
| 5 | **无 ThinkingLevel** | 无推理深度控制。所有任务的 thinking 一视同仁 |
| 6 | **Python 性能** | 启动慢、内存占用高。不适合作为常驻后台的编程助手 |
| 7 | **无 IDE 集成** | CLI + Web UI，但无 IDE 级的编辑器体验。无 Diff Apply / Monaco Editor |
| 8 | **无插件体系** | 多 Agent 是内置的，不能以插件方式扩展新 Agent 类型或工具 |
| 9 | **Agent 间通信重** | 每个 Agent 是一个完整的 LLM 调用，chain 执行时间长、成本高 |

---

## 4. Cursor

**公司**: Anysphere  
**形态**: 桌面 IDE (VS Code fork, Electron)  
**定位**: AI-first 编程 IDE，市场领导者  
**上线**: 2023年  

### 优点

| # | 优点 | 说明 |
|---|------|------|
| 1 | **最好的 IDE 体验** | VS Code 分支 + Monaco Editor。Tab 补全、Inline Edit、Cmd+K、Chat、Composer——全场景覆盖 |
| 2 | **Inline 代码补全** | 实时代码建议，毫秒级延迟。这个能力是所有终端 Agent 都做不了的 |
| 3 | **多模型支持** | GPT-4o、Claude、Gemini、DeepSeek 等。用户自由选择 |
| 4 | **Apply/Diff 体验** | 代码变更直接以 diff 形式展示，一键 accept/reject。业内最佳 |
| 5 | **上下文感知** | 自动索引项目结构、文件关系。@file / @folder 引用精准 |
| 6 | **成熟产品** | Bug Tracker、社区、插件市场、企业版。产品完成度最高 |
| 7 | **Rules / .cursorrules** | 项目级规则配置，定制 Agent 行为 |

### 缺点

| # | 缺点 | 影响 |
|---|------|------|
| 1 | **闭源 + 订阅付费** | $20/月 Pro，$40/月 Ultra。不可自部署 |
| 2 | **大 System Prompt** | 系统提示非常冗长（包括规则、上下文、索引信息）。token 开销大，每次对话都在燃烧预算 |
| 3 | **无 Compaction** | 长对话历史全部保留。上下文窗口满了之后行为不确定（截断 vs 报错） |
| 4 | **无 ThinkingLevel** | 不支持 DeepSeek 推理深度分级。要么全开要么全关 |
| 5 | **DeepSeek 是二等公民** | DeepSeek 优化远不如 GPT/Claude。reasoning_content 处理、prefix-cache 优化均非重点 |
| 6 | **无 Prefix-Cache 策略** | 消息构建不考虑前缀一致性。用 DeepSeek 时缓存命中率很低，成本劣势明显 |
| 7 | **无声明式 Agent Chain** | 无多 Agent 流水线编排。Composer 是单 Agent 模式 |
| 8 | **无 CodeRAG** | 项目索引主要用于上下文引用，非语义检索增强 |
| 9 | **VS Code 遗产** | Fork 意味着架构受 VS Code 限制。Electron 内存占用高，启动不如原生客户端快 |
| 10 | **数据隐私** | 代码发送到 Cursor 服务器。对敏感项目不友好 |

---

## 5. 横向对比矩阵

| 维度 | Pi | oh-my-pi | Reasonix | DeepCode | Cursor | **Deep IDE 目标** |
|---|---|---|---|---|---|---|
| **形态** | 终端 TUI | 终端 TUI | 终端+桌面 | CLI+Web | 桌面 IDE | **桌面 IDE** |
| **语言** | TS | Rust+TS | TS | Python | TS | **TS/Rust** |
| **模型绑定** | Claude 优先 | 多模型 | DeepSeek Only | 多模型 | 多模型 | **DeepSeek 优先，可扩展** ⚠️（历史调研观点；V1 以 A0 §1 为准 = DeepSeek-only，可扩展标 V2+） |
| **系统提示** | ~200 tokens | — | 中等 | 大 | 很大 | **~200 tokens** |
| **Compaction** | ✅ 结构化 | — | ⚠️ 简单截断 | ❌ | ❌ | **✅ 必备** |
| **ThinkingLevel** | ✅ 4 级 | — | ❌ | ❌ | ❌ | **✅ 必备** |
| **Prefix-Cache** | ❌ | ❌ | ✅ 90%+ | ❌ | ❌ | **✅ 必备** |
| **Agent-Chain** | ✅ YAML | ✅ | ❌ | ✅ 7-Agent | ❌ | **✅ 声明式** |
| **CodeRAG** | ❌ | ❌ | ❌ | ✅ | ⚠️ 基础 | **✅ 必备** |
| **MCP** | ⚠️ 有限 | — | ❌ | ✅ | ⚠️ 部分 | **✅ 必备** |
| **插件体系** | ✅ 16+ | ✅ | ⚠️ Skill | ❌ | ⚠️ 扩展市场 | **✅ 必备** |
| **Event Bus** | ✅ 25+ | — | ❌ | ❌ | ❌ | **✅ 必备** |
| **LSP** | ❌ | ✅ | ❌ | ❌ | ✅ | **✅ 必备** |
| **Diff Apply** | ❌ | ❌ | ⚠️ 基础 | ❌ | ✅ 最佳 | **✅ 必备** |
| **Inline 补全** | ❌ | ❌ | ❌ | ❌ | ✅ | **❌ 不做** |
| **开源** | ✅ | ✅ | ✅ MIT | ✅ | ❌ 闭源 | **✅** |
| **商业化** | 无 | 无 | 无 | 无 | $20-40/月 | **待定** |
| **GitHub Stars** | — | — | ~83K | — | — | — |

---

## 6. 关键洞察

### 6.1 竞争生态位（更新版）

```
              终端                    桌面
轻量/极简     Pi / oh-my-pi           (空白)
               │                        │
重量/全功能   Reasonix              Cursor
               │                        │
学术/研究     DeepCode (HKUDS)         —
```

- Pi 和 oh-my-pi 同属极简终端阵营，oh-my-pi 正在走 Rust + LSP + IDE 路线
- Reasonix 83K stars 证明「DeepSeek 深度优化」有巨大市场需求
- Cursor 独占桌面 IDE，但闭源、贵、DeepSeek 是二等公民
- DeepCode 偏学术，多 Agent 但产品化不足
- **桌面 IDE + 极简核心 + DeepSeek 深度优化 = 空白地带（oh-my-pi 正在逼近）**

### 6.2 最该从每个项目拿什么（更新版）

| 项目 | 必拿 | 慎拿 |
|---|---|---|
| **Pi** | Compaction、ThinkingLevel、Agent-Chain YAML、Event Bus、插件体系、4 工具极简 | —（Pi 的核心设计几乎全收） |
| **oh-my-pi** | LSP 集成方式、hash-anchored edits、Rust 核心思路 | 终端优先（我们要桌面 IDE） |
| **Reasonix** | Prefix-Cache 策略、DeepSeek API 适配、Token 实时追踪、Auto 模型切换、工具调用修复 | DeepSeek Only（应该可扩展）、终端优先 |
| **DeepCode** | CodeRAG、MCP Bridge、多 Agent 角色定义 | 7-Agent 固定流水线（太重）、Python 技术栈 |
| **Cursor** | Diff Apply 体验、Monaco Editor 集成、上下文感知 UI | 大 System Prompt、闭源模式、订阅定价 |

### 6.3 设计修正方向（更新版）

基于最新调研，之前的设计需要在以下方面调整：

1. **模型策略**：~~从 "DeepSeek 专属" 调整为 "DeepSeek 优先 + 可扩展"。Prefix-Cache 作为 DeepSeek 模式的核心优化，但不排斥其他模型~~ → **⚠️ 已由 A0 领域权威总纲 §1 裁决（D-C1）推翻：V1 = DeepSeek-only；「可扩展」标 V2+（本段为历史调研观点，实现以 `00-domain-authority.md` §1 为准）**。Prefix-Cache 作为 DeepSeek 模式的核心优化
2. **Agent 编排**：Pi 的声明式 Agent-Chain 优于 DeepCode 的固定 7-Agent。保留 YAML 定义，但 stage 间传递结构化上下文（参考 DeepCode 的 handoff 质量）
3. **Compaction 与 Prefix-Cache 的冲突**：压缩会破坏缓存前缀——需要设计协调策略（压缩后重建缓存基线）
4. **插件不应只是能力附加**：还应能拦截/转换领域事件。比如 GitPlugin 可以拦截 bash 命令而不仅仅是添加 git 工具
5. **桌面 IDE 体验参考 Cursor**：Diff Apply 面板、Reasoning 可视化面板、AgentChain 进度面板——这些在之前的架构文档中已有但需要更具体
6. **⚠️ 新威胁：oh-my-pi**：社区已经在 Pi 基础上做 LSP + IDE 集成。如果我们在设计阶段耽搁太久，这个空白地带会被 oh-my-pi 占据。需要加速从设计到实现的转化
7. **⚠️ 新机会：DeepSeek 官方生态**：DeepSeek 主动推广第三方工具（收录 Deep Code）。如果我们的产品做 DeepSeek 优先且开源，有机会被官方推荐

---

**下一步**: 基于本分析修正设计文档
