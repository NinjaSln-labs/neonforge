# 竞品产品方案参考：Codex Desktop & Cursor

> 只关注产品设计层面：用户看到什么、怎么交互、有哪些模式。
> 日期：2026-07-30

---

## 1. OpenAI Codex Desktop — 多 Agent 指挥中心

### 产品形态

桌面应用（macOS 2026.2 / Windows 2026.3）。Electron 框架。基于 GPT-5.3-Codex。

**三条产品线共享引擎**：Desktop App（全功能）+ CLI（`npm install -g @openai/codex`）+ IDE 扩展（VS Code / JetBrains / Cursor）。

### 核心哲学

**"你不是在和一个 AI 对话，你是在指挥一支 AI 工程师团队。"**

官方定义：Codex 是一个 **"command center"** —— 用于同时管理多个 AI 编码代理的中枢系统。它不是一个代码编辑器。

### 界面设计

**极简聊天界面**。没有文件树、没有代码编辑器、没有终端面板。就一个对话框 + Agent 任务列表。

用户看到的：
- 左侧：项目列表 + Agent 进度
- 中间：对话框（和当前选中的 Agent 对话）
- 右侧：当前 Agent 的 diff / 日志 / Worktree 状态

### 交互模型：一人指挥多 Agent

```
用户（指挥官）
  │
  ├─→ Agent A：写单元测试     ──→ Worktree A ──→ diff → 审核
  ├─→ Agent B：修 Bug #42      ──→ Worktree B ──→ diff → 审核
  └─→ Agent C：重构模块 X      ──→ Worktree C ──→ diff → 审核
```

每个 Agent：
- 在独立 Git Worktree 中运行（云端沙箱）
- 互不干扰，可并行也可以先后
- 有自己的进度状态、diff 通道
- 可运行 1-30 分钟的长时任务
- 你可以随时切到任意 Agent 查看进展、对话、审核

### 核心功能清单

| 功能 | 说明 | 用户感知 |
|------|------|---------|
| **多 Agent 并行** | 同时分配多个任务，各在独立 Worktree | 像派活儿给多位同事 |
| **Skills** | 可安装/创建的可复用能力包（工具+规范） | 给 Agent "装技能" |
| **Automations** | 定时后台工作流，可运行数天/数周 | 设置一次，定期自动执行 |
| **Appshots**（macOS） | Cmd+快捷键将应用窗口关联到 Codex 对话 | 打开 Figma→按快捷键→AI 直接看设计稿 |
| **Computer Use**（macOS） | AI 操作电脑桌面 | AI 能打开浏览器、操作应用 |
| **应用内浏览器** | 内置浏览器，AI 可操控 | AI 可以在网页上操作 |
| **记忆系统** | 跨会话记住偏好、修正、项目上下文 | 越用越懂你 |
| **主动建议** | 重开时提醒未完成工作 | "上次的 PR 还没合，要接着弄吗？" |
| **桌面沙箱**（Windows） | 系统级安全隔离 | Agent 改动不影响原文件，直到你接受 |

### Skills 生态

```
内置 Skills:
  Figma       → 设计稿转代码
  Linear      → 项目管理集成
  Cloudflare  → 一键部署
  Netlify     → 一键部署
  Vercel      → 一键部署
  WinUI       → Windows 桌面应用开发

社区可创建和分享 Skills。打包"工具+规范"即可。
```

### 关键数据（截至 2026.7）

- 100 万+ 月活开发者
- 80% OpenAI 员工使用
- 20%+ 用户不是程序员
- 50+ 编程语言
- 40 万 token 上下文窗口

### 产品亮点

- **不是 IDE** — 极简聊天界面，Agent 在云端跑
- **多 Agent 并行是核心设计**，不是附加功能
- **Skills 市场** — 能力可封装、复用、分享
- **不强迫换编辑器** — 可以联动 VS Code / JetBrains / Cursor
- **非程序员可用** — 自然语言描述即可

---

## 2. Cursor — 从 IDE 进化为 Agent 管理控制台

### 产品形态

桌面 IDE，基于 VS Code。2026 年 4 月发布 **Cursor 3**，架构级重构。

### 核心哲学（2026 版）

**"传统代码编辑器成了次要界面，Agent 管理控制台成为主界面。"**

Cursor 3 做了一个根本性改变：把 Agent 管理面板从侧边栏提升为整个应用的主视图。代码编辑器不再是默认中心，Agent 才是。

### Cursor 3 界面变化

**Cursor 3 之前**：代码编辑器在中间，Agent 面板在侧边。

**Cursor 3 之后**：Agent 窗口是主界面。提示框放在了原来文件树的位置。传统代码编辑器退后。

这意味着 Cursor 不再把自己定位为"带 AI 的编辑器"，而是"管理 Agent 完成编码任务的控制台"。

### 交互层次

```
Tab 补全（无感）  →  Chat 对话  →  Agent 自主执行  →  Background Agent
   写代码自动弹出      侧边栏对话       主界面             后台静默
```

| 层级 | 触发 | 说明 |
|------|------|------|
| **Tab** | 写代码时自动 | 根据上下文补全，Tab 接受 / Esc 忽略 |
| **Cmd+K** | 选中代码 + 快捷键 | 单文件级编辑，接受/拒绝 diff |
| **Chat** | Cmd+L | 侧边对话，@ 引用上下文 |
| **Agent** | Agent 面板 | 自主多步执行：读文件→编辑→终端→循环 |
| **Background Agent** | 分配任务后关掉 | 后台持续运行，完成通知你 |

### @ 上下文引用系统

```
@file       → 引用特定文件
@folder     → 引用整个文件夹
@codebase   → 语义搜索整个项目
@docs       → 引用在线文档
@web        → 实时搜索
@git        → 最近的变更
@terminal   → 终端输出
```

这是 Cursor 最强大的能力——用户精确控制 AI 能看到什么。不是靠 AI 猜。

### Cursor 3 新增功能

| 功能 | 说明 |
|------|------|
| **Agent 主界面** | Agent 管理控制台取代代码编辑器为中心 |
| **Canvas**（3.1） | 可视化输出面板，不只是文字 |
| **Bugbot** | AI 代码审查，学习项目规则后自动找 Bug |
| **/debug** | CLI 模式下自动调试 |
| **/btw** | 不打断 Agent 的侧问——Agent 干活时你可以聊别的 |
| **Background Agent** | Agent 在后台跑，你可以关掉窗口，完成通知你 |
| **MCP 集成** | 连接外部工具和数据源 |
| **Learned Rules** | Bugbot 从代码审查中学习项目规则 |

### 三层上下文工程

Cursor 不只是"把代码发给 LLM"：

```
Layer 1: 全局上下文 → .cursorrules 注入每次对话的系统提示
Layer 2: 会话上下文 → 当前 Chat/Agent 引用的文件和代码
Layer 3: 隐式上下文 → @codebase 的语义搜索结果
```

### 产品亮点

- **2026.4 的转型** — 从 IDE 变成 Agent 管理台，行业信号极强
- **@ 系统** — 最精确的上下文控制
- **可视化 Diff** — 业内最佳
- **Background Agent** — 你不用盯着，完成通知

---

## 3. 对比：两种"Agent 管理台"

### 惊人趋同

两个产品在 2026 年上半年都发生了同一个转向：**从"带 AI 的编码工具"变成"管理 Agent 完成任务的平台"**。

| | Codex Desktop | Cursor 3 |
|------|-------------|----------|
| **主界面** | 极简聊天窗口 | Agent 控制台（Cursor 3 后） |
| **Agent 并行** | ✅ 多 Agent 同时，Worktree 隔离 | ⚠️ Background Agent（逐步趋近） |
| **Agent 在哪跑** | 云端沙箱 | 本地（通过 API） |
| **编辑器** | 不内置，联动外部 | 内置 Monaco |
| **上下文控制** | Agent 自己读项目 | @ 精确引用 |
| **可复用能力** | Skills 市场 | MCP 集成 + .cursorrules |
| **自动化** | Automations（定时/长期） | Background Agent |
| **编码之外** | ✅ 20% 非程序员用户 | ❌ 仍以开发者为主 |
| **记忆** | 跨会话记忆 | 会话内上下文 |
| **开源** | ❌ | ❌ |
| **模型** | GPT-5.3-Codex（固定） | 多模型可选（自带 + 自定义） |

### 本质差异

```
Codex Desktop:                      Cursor 3:
"Agent 是云服务"                      "Agent 是本地进程"
不需要你在电脑前                        你在本地看着
多任务并行、后台自动跑                   单任务深度、实时交互
用现有的编辑器写代码                    在 Cursor 里写代码
```

---

## 4. 行业信号

**2026 年上半年，AI 编程工具集体从"编辑器思维"转向"Agent 平台思维"：**

- Cursor 3：代码编辑器退后，Agent 控制台成为主界面
- Codex Desktop：不做编辑器，直接做 Agent 指挥中心
- Windsurf：被 Cognition AI（Devin）收购，加速 Agent 化
- Claude Code：从一开始就是纯 Agent 终端

**传统"AI + 代码编辑器"模式正在过时。** 新一代产品问的不是"AI 怎么帮你写代码"，而是"你怎么管理一群 AI 来完成软件工程任务"。

---

## 5. 对 NeonForge 的启示（更新）

### 行业标准（必须有的）

| 能力 | 理由 |
|------|------|
| Agent 自主执行 | 基本门槛，Codex/Cursor/Windsurf/Claude Code 都有 |
| Diff 审核 | 不可妥协 |
| 上下文控制 | 用户需要控制 Agent 看到什么 |
| 项目规则配置 | AI 行为需要可定制 |

### 差异化机会（行业还没做好的）

| 方向 | 机会 | 现状 |
|------|------|------|
| **Agent 推理过程可视化** | 让用户看到 Agent "在想什么" | Cursor 有但不结构化，Codex 几乎没有 |
| **"分析→动手→审核"三步引导** | 显式导航 Agent 的工作流程 | 竞品都是"扔给 Agent，等结果" |
| **DeepSeek 专属** | 首字延迟、推理展示、成本透明 | 无竞品做这个 |
| **从零构建向导** | 非技术用户也能创建项目 | Codex 在做（20% 非程序员），但远未完善 |
| **Worktree 本地化** | Codex 的 Worktree 是云端的，本地化可以做更快的 diff 切换 | 空白 |
