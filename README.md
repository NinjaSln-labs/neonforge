# NeonForge

> 为 DeepSeek 打造的 **AI 问题工作台**：说出你当前的问题，拿到结果。帮用户解决当前的问题——一切能被数字工具解决的。

**产品定位**：AI 问题工作台（非 IDE、非 Chatbot）——对话进入 · 分步授权 · 内在工程/设计/编排自动推进 · 交付可验证结果 · 超出数字能力部分给产物+指导（不装能）

**谁在用**：不会写代码的人（说出问题→被解决→拿到数字产物+指导）· 开发者（异常修复/0-1 交付，授权闭环）

**核心流**：`说出问题 → 分析 → 分步授权 → 解决 → 交付结果（数字产物/修复闭环）→ 反馈 + 指导继续`

**技术栈**：Electron + React + Monaco + Vite + Zustand + TypeScript + SQLite

**四层领域架构**：
```
Engineering   — AgentChain 流水线 → DiffApply → ChangeSet 交付
Orchestrate   — Compaction · PrefixCache · ContextEngine
Design        — ThinkingLevel · ReasoningViz
Code          — Editor · ToolRegistry · DeepSeekGateway · PluginSystem
```

---

## 文档

```
docs/
├── product/   # 产品设计（设计→工程交付，8 份）
└── domain/    # 领域驱动设计 + 技术架构（8 份）
```

### 产品 & 设计（`docs/product/`）

| 编号 | 文档 | 说明 |
|------|------|------|
| D0 | [产品设计规范](./docs/product/00-product-design.md) | **总纲**：完整产品定义、页面规格、交互模式、状态处理、语气指南 |
| D1 | [用户旅程图](./docs/product/01-user-flows.md) | 所有界面流转、分支路径、关键决策点 |
| D2 | [UI 组件规格](./docs/product/02-components.md) | 19 个组件：变体、尺寸、状态、动画参数 |
| D3 | [设计令牌](./docs/product/03-design-tokens.md) | 色彩/字体/间距/圆角/阴影/动画 — CSS 变量可直接映射 |
| D4 | [对齐索引](./docs/product/04-alignment.md) | 不同角色读什么、文档交叉引用、工程实现顺序 |
| D5 | [视觉设计规范](./docs/product/05-visual-spec.md) | 屏幕级视觉、三层深度、动效时序、Figma 画板指引 |
| D6 | [竞品产品参考](./docs/product/00-product-reference.md) | Codex Desktop & Cursor 产品设计分析 |
| D7 | [交叉审计报告](./docs/product/06-product-design-audit.md) | 设计→交付前的独立审计（含修复状态） |
| D8 | [成功指标](./docs/product/07-success-metrics.md) | 北极星 + leading/lagging 指标、分阶段验证阈值（0-1 落地标尺） |

### 技术架构（`docs/domain/`）

| 编号 | 文档 | 说明 |
|------|------|------|
| A0 | [领域权威总纲](./docs/domain/00-domain-authority.md) | **实现权威（v2.0）**：模型策略、16 限界上下文、AgentChain 规格化、工具面、1M 预算、EventBus 规则、产品↔领域 V1 矩阵；A1–A7 冲突处以此为准 |
| A1 | [竞品技术分析](./docs/domain/01-reference-analysis.md) | Pi / Reasonix / DeepCode / Cursor 技术对比 |
| A2 | [领域模型](./docs/domain/02-domain-model.md) | 四层架构、12 限界上下文、设计原则、统一语言 |
| A3 | [战略设计](./docs/domain/03-strategic-design.md) | 限界上下文详细建模、上下文映射 |
| A4 | [战术设计](./docs/domain/04-tactical-design.md) | 聚合根、值对象、领域服务、不变性规则 |
| A5 | [架构设计](./docs/domain/05-architecture.md) | 分层架构、管线设计、模块目录树、技术选型 |
| A6 | [领域事件](./docs/domain/06-domain-events.md) | 完整事件目录、关键时序图 |
| A7 | [API网关设计](./docs/domain/07-api-gateway.md) | DeepSeek API 适配、1M 上下文策略、PrefixCache + 预热 |
| A8 | [交叉审计报告](./docs/domain/08-domain-design-audit.md) | 领域文档交叉验证（第 1 轮，就绪度 42；第 2 轮 8 Critical 已由 A0 闭合） |
| A9 | [PRD↔领域追溯矩阵](./docs/domain/09-traceability.md) | D0 ↔ A0 追溯（直接/精化/偏离 + 同构说明），实现防漂移 |

### 执行区产出（非 docs/，工程执行资产）

| 资产 | 位置 | 说明 |
|------|------|------|
| 工程 tickets | `.scratch/neonforge-v1/issues/` | 9 个垂直切片（01-scaffold 已开工） |
| launch 计划 | `.scratch/launch/launch-plan.md` | 五阶段 + ORB 渠道 |
| 高风险决策压力测试 | `.scratch/grill/high-risk-decisions.md` | 串行队列 / DeepSeek-only（均通过） |
| product-marketing 上下文 | `.agents/product-marketing.md` | 定位/ICP/竞品/差异化 |
| 工程代码 | `apps/desktop/` | Electron + Vite + React + TS + Monaco |
