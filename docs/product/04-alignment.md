# 文档对齐索引

> 工程侧拿到这套文档后，按什么顺序读、不同角色看什么、相互怎么引用。

---

## 文档清单

```
neonforge/
├── README.md
└── docs/
    ├── product/                         # 产品设计（设计→工程交付）
    │   ├── 00-product-design.md         # 产品总纲（D0——v2.2）
    │   ├── 00-product-reference.md      # 竞品与差异化
    │   ├── 01-user-flows.md             # 用户旅程图
    │   ├── 02-components.md             # UI 组件规格
    │   ├── 03-design-tokens.md          # 设计令牌
    │   ├── 04-alignment.md              # 本文档
    │   ├── 05-visual-spec.md            # 视觉设计规范
    │   ├── 06-product-design-audit.md   # 交叉审计报告
    │   └── 07-success-metrics.md        # 成功指标（D8——v1.1）
    └── domain/                          # 领域 / 架构
        ├── 00-domain-authority.md       # 领域权威总纲（A0——v4.0，实现权威——先读）
        ├── 01-reference-analysis.md     # 竞品技术分析（历史参考）
        ├── 02-domain-model.md           # 领域模型
        ├── 03-strategic-design.md       # 战略设计
        ├── 04-tactical-design.md        # 战术设计
        ├── 05-architecture.md           # 架构设计
        ├── 06-domain-events.md          # 领域事件
        ├── 07-api-gateway.md            # API 网关
        ├── 08-domain-design-audit.md    # 领域审计（历史——裁决已回写 A0）
        └── 09-traceability.md           # 产品↔领域追溯矩阵
```

> 2026-08-16 第 13 轮审计 #5：清单补 A0（领域实现权威）/08/09/07-success-metrics（原清单缺失——索引入口漏权威文档）。

---

## 按角色阅读

### 产品经理 / 设计师

| 顺序 | 文档 | 学什么 |
|------|------|--------|
| 1 | `product/00-product-design.md` | 完整产品定义：理念、页面、交互、状态、语气 |
| 2 | `product/01-user-flows.md` | 所有用户路径和分支 |
| 3 | `product/00-product-reference.md` | 竞品做了什么、我们怎么差异化 |
| 4 | `product/02-components.md` | 每个组件的设计意图和变体 |
| 5 | `product/03-design-tokens.md` | 视觉语言（做 Figma 稿时直接引用） |
| 6 | `product/05-visual-spec.md` | 屏幕级视觉、动效时序、Figma 画板 |
| 7 | `product/06-product-design-audit.md` | 交付前交叉审计：冲突、缺口、修复顺序 |

### 前端工程师

| 顺序 | 文档 | 学什么 |
|------|------|--------|
| 1 | `product/00-product-design.md` | 要建什么：所有页面和它们的逻辑 |
| 2 | `product/01-user-flows.md` | 页面间怎么跳转、每个分支的处理 |
| 3 | `product/02-components.md` | 每个组件的规格：尺寸、状态、动画参数 |
| 4 | `product/03-design-tokens.md` | CSS 变量和 Tailwind 配置，直接复制到代码 |
| 5 | `domain/05-architecture.md` | 整体架构，理解模块目录 |
| 6 | `domain/07-api-gateway.md` | 与 DeepSeek API 的对接方式 |

### 后端 / Electron 工程师

| 顺序 | 文档 | 学什么 |
|------|------|--------|
| 1 | `product/00-product-design.md` | 了解产品是什么（尤其 §十 非功能规格） |
| 2 | `domain/05-architecture.md` | 架构总览 + 模块目录树 |
| 3 | `domain/03-strategic-design.md` + `domain/04-tactical-design.md` | 领域模型和聚合根 |
| 4 | `domain/06-domain-events.md` | 事件通信 |
| 5 | `domain/07-api-gateway.md` | DeepSeek API 对接 |
| 6 | `domain/02-domain-model.md` | 核心设计原则和统一语言 |

---

## 文档间交叉引用

### 产品设计规范 → 其他文档

| 产品规范中的引用 | 详见 |
|----------------|------|
| 页面布局和交互 | `product/01-user-flows.md` — 完整流转 |
| 具体组件的样式 | `product/02-components.md` — 组件规格 |
| 颜色、字体、间距数值 | `product/03-design-tokens.md` — 设计令牌 |
| 竞品对比 | `product/00-product-reference.md` |

### 用户旅程图 → 其他文档

| 旅程图中的引用 | 详见 |
|-------------|------|
| Flow 3 主工作区 | `product/00-product-design.md` §3.3 |
| Flow 5 搭档工作流 | `product/00-product-design.md` §四 |
| Flow 6 Diff 审核 | `product/00-product-design.md` §3.5 + `product/02-components.md` §8 |
| 所有界面清单 S1-S14 | `product/00-product-design.md` §三 |

### 组件规格 → 其他文档

| 组件 | 设计令牌引用 |
|------|------------|
| Button | `--nf-accent`, `--nf-space-2`, `--nf-radius-md`, `--nf-duration-fast`（2026-08-16 第 17 轮审计 #1：原 --nf-blue——03 终版名 --nf-accent）|
| Input | `--nf-bg-elevated`, `--nf-border`, `--nf-accent`, `--nf-radius-lg`（#1：原 --nf-bg-input）|
| MessageBubble | `--nf-bubble-user`, `--nf-bubble-partner`, `--nf-radius-xl`, `--nf-duration-fast` |
| BreathBar | `--nf-accent`, `--nf-amber`, `--nf-ease-in-out`（#1：原 --nf-blue）|
| DiffView | `--nf-diff-add-bg`, `--nf-diff-remove-bg`, `--nf-green`, `--nf-red` |
| ... | 见 `product/02-components.md` 各组件详细说明 |
| 所有组件 | 颜色、间距、圆角等参见 `product/03-design-tokens.md` |

---

## 重构期文档（2026-08-16 补——第 5 轮产品文档审计 #4）

**意图确认领域模型重设计（进行中）**——重构期权威文档（scratch，不入 docs 索引）：

| 文档 | 作用 |
|------|------|
| `.scratch/neonforge-v1/intent-confirmation-domain-design.md` | **重构期设计权威**（§1-9：决策点触发权/完成证据/PlanProposal/RejectReason/推进保障/双维门控/测试域 DDD；S0-S7 分阶段）|
| `.scratch/neonforge-v1/intent-confirmation-doc-audit.md` | 设计文档五轮审计闭环（1C+16M+14m 全修）|
| `analysis/competitor-crawler/reports/neonforge-intent-confirmation-research.md` | 三视角调研依据（9 竞品+14 源码+20+ 学术）——2026-08-16 第 14 轮审计 #5：**物理位置在项目外** `~/Documents/myself/analysis/competitor-crawler/`（仓库内引用为逻辑路径——内容已内化设计文档）|
| `docs/PRODUCT-DOC-AUDIT.md`（最新轮——当前第 13 轮；r4-r12 归档）| 产品文档审计（领域/产品文档就绪度与验收标准——修复随轮次回写）|

> 冲突裁决：重构期实现语义以 scratch 设计文档为准（领域/产品文档同步已完成——A0 v4.0 / D0 v2.2 / 07 v1.1 / 07-api-gateway 推进保障同步）；本索引的旧 Phase 1-3 为 0-1 初始搭建序，重构按设计文档 S0-S7 执行。
> 历史文档标注（2026-08-16 第 6/9 轮审计）：`product/06-product-design-audit.md`（07-31）与 `domain/08-domain-design-audit.md`（M1-M10）为历史审计——裁决已回写 A0，与新设计无冲突，仅作追溯参考；`domain/01-reference-analysis.md`（07-30）为历史竞品技术分析——无确认语义冲突（新调研引用见本表上方）。

## 工程实现顺序建议

### Phase 1 — 骨架（Day 1-3）

1. Electron + Monaco + React 工程搭建（参考 `domain/05-architecture.md`）
2. 实现 `product/03-design-tokens.md` 中的 CSS 变量 / Tailwind 配置
3. 实现基础组件（Button, Input）— 参考 `product/02-components.md`

### Phase 2 — 主界面（Day 4-7）

4. 实现首次配置页（§3.1，Flow 0）+ 启动页（§3.2，Flow 1）— 见 product/01-user-flows.md
5. 实现主工作区（§3.3，Flow 3）
6. 实现文件树、代码编辑器集成（`product/02-components.md` §9）

### Phase 3 — 搭档核心（Day 8-14）

7. 实现消息气泡和输入框（`product/02-components.md` §3, §2）
8. 实现对话区（对话消息/输入）、分段动画（`product/02-components.md` §3）
9. 实现呼吸光条（`product/02-components.md` §4）
10. 对接 DeepSeek API（`domain/07-api-gateway.md`）

### Phase 4 — 工作流（Day 15-21）

11. 实现产物区（工程/产物 Tab）+ 问题台账（`product/02-components.md` §6, §7）
12. 实现 Diff 审核视图（`product/02-components.md` §8, `product/01-user-flows.md` Flow 6）
13. 实现无阶段确认驱动状态机（目标确认/执行确认/达成确认卡——`product/01-user-flows.md` Flow 5）〔2026-08-16 标注：本步为 0-1 初始搭建序的旧语义——重构期以 `intent-confirmation-domain-design.md` S0-S7 为准（方案确认/解决确认+证据对账/触发权在系统），冲突处以重构期表裁决为准〕
14. 实现任务列表 + 多任务（`product/02-components.md` §5, `product/01-user-flows.md` Flow 7）

### Phase 5 — 完善（Day 22-28）

15. 实现新建项目流（`product/01-user-flows.md` Flow 4）
16. 实现非技术视图（`product/00-product-design.md` §3.8, `product/02-components.md` §13）
17. 实现通知、错误横幅、骨架屏（`product/02-components.md` §10, §11, §12）
18. 实现所有状态和错误处理（`product/00-product-design.md` §五）
19. 性能优化到预算目标（`product/00-product-design.md` §十）
