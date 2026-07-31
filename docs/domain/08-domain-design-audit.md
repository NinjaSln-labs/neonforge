# NeonForge 领域设计交叉审计（v1.0 第 1 轮）

> 日期：2026-07-31  
> 范围：`docs/domain/` A1–A7（01–07）  
> 对照：`docs/product/00-product-design.md`、`04-alignment.md`、`README.md`  
> 方法：文档间断言交叉验证 + 产品↔领域能力矩阵 spot-check  
> 可视化：旁路 Canvas — [domain-design-audit.canvas.tsx](/Users/tester/.cursor/projects/neonforge/canvases/domain-design-audit.canvas.tsx)

---

## Verdict

**Critical：8。Major：14。Minor：10。**

产品设计已完结（`product/06` 就绪度 100）；领域文档仍未收敛。模型策略、限界上下文清单、工具面与产品缺口未裁决前，**不宜按 domain 文档开工实现领域层**。

**就绪度：42 / 100**

---

## 分维评分

| 维度 | 分 | 一句话 |
|------|----|--------|
| 一致性 | 48 | BC / 域类型 / 预算 / 命名多处打架 |
| 完整性 | 42 | 「同旧版」占位 + AgentChain 未规格化 |
| 可实现 | 38 | Gateway / 进程边界 / EventBus 规则未裁决 |
| 产品对齐 | 35 | 领域核心能力无产品表面与 V1 门禁 |
| 竞品输入 | 72 | 01 可用；内部算术/标签瑕疵 |

---

## Critical（挡开工）

### D-C1 — 模型策略：DeepSeek-only vs DeepSeek-first + 可扩展

| 文档 | 主张 |
|------|------|
| `01` §6.3 / 矩阵 | DeepSeek **优先 + 可扩展**，不排斥其他模型 |
| `02` §1–§4 | **唯一适配** / DeepSeek-first；**无模型抽象层**，Gateway 简化 50% |
| `07` 题头 | **DeepSeek-only** |
| README / 产品 | 专为 DeepSeek；不是多模型兼容客户端 |

**影响**：Gateway 是否做 provider 抽象是架构分叉。  
**建议裁决**：V1 = DeepSeek-only（对齐 README/产品）；`01` §6.3「可扩展」标为 V2+；`07` 保留 only；删掉 `02`「无模型抽象层」中暗示永久不可扩展的绝对表述，改为「V1 无抽象层」。

### D-C2 — 限界上下文清单：12 vs ~15

`02` §7 声称 **12 个**：ToolRegistry、DeepSeekGateway、PluginSystem、Editor、ThinkingLevel、ReasoningViz、Compaction、PrefixCache、ContextEngine、Conversation、AgentChain、Preheating。

`03` 另列且建模：**MCPBridge、Workspace、ShellAgent、TokenTracker、Configuration**（预热还嵌在 PrefixCache / Gateway）。

**建议裁决**：以修后的 `02` §7 为唯一清单；五者要么晋升入 `02`，要么降为既有 BC 内模块并写明归属。

### D-C3 — 域类型冲突（核心/支撑/通用）

| 上下文 | `02` | `03` |
|--------|------|------|
| PluginSystem | 通用域 | 支撑域 |
| ContextEngine | 核心域 | 支撑域 |
| Preheating | 应用层 BC | 非独立 BC（挂 PrefixCache） |

**建议裁决**：`02` 类型列权威；`03` 图表回写对齐，或去掉类型标签只保留职责。

### D-C4 — 工具面：4 vs 4+6 vs StandardPrefix 列 10

- `02` 原则 1 / UL：**4 工具**，System prompt **&lt; 300** tokens  
- `02` ToolRegistry / `05`：4 核心 + **6 LSP**  
- `07` `STANDARD_PREFIX`：模板内列出 **10** 个工具；注释称 core ~200 + defs + meta = 5–10K  

**建议裁决**：叙事改为「叙述性 system &lt;300；tool defs 计入 StandardPrefix；Agent 可见 4+6」。同步改 `02` 原则 1 与 UL。

### D-C5 — AgentChain「6 角色 / 4 模板」从未枚举

`03` §2.4：「职责同旧版…6 种 Agent 角色，4 个内置模板。」全系列无角色/模板表。`07` ModelRouter 仅出现 `analyst` / `architect`。

**建议裁决**：在 `03` §2.4（或 `04` §1.2）补全角色与 YAML 模板；删除「同旧版」。

### D-C6 — 产品 V1 与领域核心能力脱节

领域核心：AgentChain、ThinkingLevel、ContextEngine、Preheating。  
产品 `00`：无同名能力；设置无 ThinkingLevel；V1「不做」仅提多 Agent **并行**，未说明串行 Chain 是否进 V1；缓存仅出现在「本轮用量」细节。

**建议裁决**：在 `product/00` 或 `04-alignment` 增加 **产品↔领域 V1 矩阵**（做 / 不做 / 无 UI 后台能力）。领域 `02` 对未进 V1 的能力标版本。

### D-C7 — EventBus「唯一通道」vs 预热直调 API

`02`/`05`：EventBus 唯一跨模块通道。  
`07`：`PreheatingService` 直接 `deepseek.streamChat`；`06` 时序亦直连 DeepSeekAPI。

**建议裁决**：预热必须经 DeepSeekGateway 端口；EventBus 只发通知。改 `07`/`06`。

### D-C8 — Preheating 归属三套说法

- `02`：Engineering **应用层** BC，聚合根 PreheatingService  
- `04`：状态在 **PrefixCacheState**（preheatingStatus / standardPrefix / history）  
- `05`：画在 **CORE LAYER**；代码挂 `prefix-cache/`  

**建议裁决**：以 `04` 为准——Preheating 为操作 `PrefixCacheState` 的领域服务；`02` 去掉独立 BC 或标明「服务非 BC」。

---

## Major

| ID | 问题 | 建议权威 |
|----|------|----------|
| D-M1 | 「Deep IDE」 vs NeonForge（`01`/`03`） | README → 全局改名 |
| D-M2 | `02`「none→max」vs 四档 `none\|basic\|medium\|high` | `04`/`07` 映射 |
| D-M3 | `03`/`07` 多处「同旧版」；`04`/`06` 自称已清 | 内联补全，禁占位 |
| D-M4 | `preheat.completed` 与 `cache.preheat_ready` 双就绪 | 保留前者 |
| D-M5 | LSP 事件缺 `get_type_info` / `get_diagnostics` | 补 `06` 或声明不发事件 |
| D-M6 | `05`「30+」vs `06` 约 58 个 | `05` 改为见 `06` 精确数 |
| D-M7 | RuntimeContext 图有 `lspContext`，§2.3 TS 无；`recentTools` vs `recentToolCalls` | 以 TS 合同为准并补字段 |
| D-M8 | DeepSeekClient / Preheating 在 renderer，IPC 在 main | `05` 定 main 持 Gateway |
| D-M9 | 不变式 `02`§10 vs `04`§5 互缺；「1:1 reasoning_effort」与实际映射不符 | 合并进 `04`§5 |
| D-M10 | 1M 预算：`02` 精选 10–50K / 对话 50–200K vs `07` LSP 5–30K / 对话 5–50K | 以 `07`§4 为准 |
| D-M11 | 压缩触发 100/200K 在 03–07 一致，**`02` 未写触发** | 补进原则 5 |
| D-M12 | UL 缺 ChangeSet、DiffApply、ModelRouter、ToolCallRepair、handoff 等 | 扩 `02`§11 |
| D-M13 | 「核心 &lt;5000 行」与 `05` 模块面不匹配 | 重定义 core 或删数字 |
| D-M14 | StatusBar：产品「就绪/分支/待审核」vs 领域「预热/Cache%/费用」 | 产品 UI 权威；领域进用量明细 |

---

## Minor（摘要）

- D-m1：`thinking=none` 措辞 vs `{type:'disabled'}`  
- D-m2：system ~200 vs &lt;300  
- D-m3：`01`/`02` 缺「下一步」链接  
- D-m4：`04-alignment` 指向产品空 §十 NFR  
- D-m5：`03` 自称早期三分类 vs `02` 仍用类型列——需说明「层」与「类型」正交  
- D-m6：上下文映射把 ToolCallRepair 画成独立框  
- D-m7：ModelRouter 角色依赖未定义目录（同 D-C5）  
- D-m8：单文件「无同旧版」宣称覆盖不了系列  
- D-m9：`streaming.token` 等事件名未完全限定  
- D-m10：MCPBridge 通用域 BC vs mcp-bridge 插件双重模型未解释  

---

## Observations（`01` 内部）

| ID | 内容 |
|----|------|
| D-O3 | Reasonix 缺点标题「无 Compaction」正文承认同类截断 |
| D-O4 | DeepCode「7-Agent」但只列 6 个角色名 |
| D-O5 | Cursor CodeRAG：缺点 ❌ vs 矩阵 ⚠️ |
| D-O1/O2 | 事件「30+」字面正确但低估；压缩数字在 03–07 一致 |

---

## 已对齐（无需改）

- Compaction：**100 条 / 200K / 保留 20**（03、04、06、07）  
- ThinkingLevel → API 映射（04 ↔ 07，除 02 笔误）  
- LSP 六工具名称（03 / 04 / 05）  
- Electron + Monaco 硬约束（与产品一致）  

---

## 建议权威裁决（实现时用）

| 主题 | 权威 | 规则 |
|------|------|------|
| 产品命名 / V1 范围 | README + `product/00` | 领域服从产品门禁 |
| 四层放置 | `02` §6 | Engineering → … → Code |
| BC 清单 + 类型 | `02` §7（本轮后修好） | `03` 不得另开清单 |
| 聚合 / 不变式 | `04` | `02` §10 改为摘要指针 |
| 事件目录 | `06` | `05` 引用精确计数 |
| API 映射 | `07`（修正 only/占位） | thinking / reasoning_effort |
| StatusBar UI | `product/00` §3.3 | 领域指标进「本轮用量」 |

---

## 建议修复序

1. 冻结模型策略 + V1 能力矩阵（D-C1 / D-C6）  
2. 重建 `02` BC 清单与类型，回写 `03`（D-C2 / D-C3 / D-C8）  
3. 规格化 AgentChain；清除「同旧版」（D-C5 / D-M3）  
4. 统一 4+6 工具与 StandardPrefix 叙事（D-C4）  
5. Gateway / EventBus / 进程边界（D-C7 / D-M8）  
6. 事件 · 不变式 · 预算 · UL · StatusBar（D-M4–M14）  

---

## 可交付开工

**否。** 待 Critical 全部闭合后再开第 2 轮复审。

建议阅读序（修复后）：`02` → `03` → `04` → `06` → `05` → `07`；产品门禁始终先读 `product/00` + `04-alignment`。

---

## 第 2 轮裁决（2026-07-31 · Critical 全部闭合）

依据「现有文档仅参考，不合适直接重构重写」决策，产出 **[00-领域权威总纲（重构版 v2.0）](./00-domain-authority.md)**：

- **D-C1~C8 全部裁决**（模型策略 / BC 清单 16 个 / 域类型 / 工具面 4+6 / AgentChain 6 角色 4 模板 / 产品领域 V1 矩阵 / EventBus 规则 / Preheating 归属）；
- 14 Major 处置见总纲 §9；
- 本审计就绪度 42 → **以总纲为准可进入工程拆解**（实现权威从 A1–A7 切换至 00）。

后续若需对总纲本身复审，开新审计轮次。
