# 文档对齐索引

> 工程侧拿到这套文档后，按什么顺序读、不同角色看什么、相互怎么引用。

---

## 文档清单

```
neonforge/
├── README.md
└── docs/
    ├── product/                         # 产品设计（设计→工程交付）
    │   ├── 00-product-design.md         # 产品总纲
    │   ├── 00-product-reference.md      # 竞品与差异化
    │   ├── 01-user-flows.md             # 用户旅程图
    │   ├── 02-components.md             # UI 组件规格
    │   ├── 03-design-tokens.md          # 设计令牌
    │   ├── 04-alignment.md              # 本文档
    │   ├── 05-visual-spec.md            # 视觉设计规范
    │   └── 06-product-design-audit.md   # 交叉审计报告
    └── domain/                          # 领域 / 架构
        ├── 01-reference-analysis.md     # 竞品技术分析
        ├── 02-domain-model.md           # 领域模型
        ├── 03-strategic-design.md       # 战略设计
        ├── 04-tactical-design.md        # 战术设计
        ├── 05-architecture.md           # 架构设计
        ├── 06-domain-events.md          # 领域事件
        └── 07-api-gateway.md            # API 网关
```

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
| Button | `--nf-blue`, `--nf-space-2`, `--nf-radius-md`, `--nf-duration-fast` |
| Input | `--nf-bg-input`, `--nf-border`, `--nf-blue`, `--nf-radius-lg` |
| MessageBubble | `--nf-bubble-user`, `--nf-bubble-partner`, `--nf-radius-xl`, `--nf-duration-fast` |
| BreathBar | `--nf-blue`, `--nf-amber`, `--nf-ease-in-out` |
| DiffView | `--nf-diff-add-bg`, `--nf-diff-remove-bg`, `--nf-green`, `--nf-red` |
| ... | 见 `product/02-components.md` 各组件详细说明 |
| 所有组件 | 颜色、间距、圆角等参见 `product/03-design-tokens.md` |

---

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
13. 实现三步工作流状态机（`product/01-user-flows.md` Flow 5）
14. 实现任务列表 + 多任务（`product/02-components.md` §5, `product/01-user-flows.md` Flow 7）

### Phase 5 — 完善（Day 22-28）

15. 实现新建项目流（`product/01-user-flows.md` Flow 4）
16. 实现非技术视图（`product/00-product-design.md` §3.8, `product/02-components.md` §13）
17. 实现通知、错误横幅、骨架屏（`product/02-components.md` §10, §11, §12）
18. 实现所有状态和错误处理（`product/00-product-design.md` §五）
19. 性能优化到预算目标（`product/00-product-design.md` §十）
