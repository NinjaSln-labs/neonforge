# 05 — 架构设计（无阶段·目标驱动版）

> 2026-08-07 重新生成——架构基于无阶段目标驱动领域模型（00 权威总纲 v3.0 / 02 领域模型 / 03 战略设计 / 04 战术设计）。
> 替代旧六阶段版（ContextEngine 管线 / Preheating / AgentChain 模块树）。

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                       RENDERER（对话/确认/授权 UI）                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │确认卡     │ │授权卡     │ │候选按钮   │ │工具卡     │             │
│  │(目标/执行/│ │(允许/拒绝) │ │(candidates)│ │(执行/回滚)│             │
│  │ 达成)    │ │          │ │          │ │          │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
├──────────────────────────────────────────────────────────────────┤
│                       DOMAIN（领域层——核心）                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Conversation BC：Task 状态机 / 确认点 / 推进门控           │    │
│  │  · TurnExecutionPolicy（forceTool 决策）                  │    │
│  │  · ProgressionGate（模型活动边界）                        │    │
│  │  · PlannedFiles（写文件边界——宿主强制）                    │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐    │
│  │ Capability BC │ │ Workspace BC  │ │ Session Timeline BC    │    │
│  │ 环境检测(事实) │ │ 文件/快照/回滚 │ │ 全步骤统一记录（JSONL）  │    │
│  │ 能力视图(推导) │ │ 计划清单(批准) │ │（main 进程落盘）        │    │
│  │ Ledger 回填   │ └──────────────┘ └────────────────────────┘    │
│  └──────────────┘                                               │
├──────────────────────────────────────────────────────────────────┤
│                    APPLICATION（应用层——编排）                      │
│  ConversationPanel / MainWorkspace（确认卡回调、状态同步、流式驱动） │
├──────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE                               │
│  Electron（窗口）│ Gateway（DeepSeek API + forceTool 传递）│ 文件系统 │
└──────────────────────────────────────────────────────────────────┘
```

**设计原则**：
- **确认点 = 推进门槛**（结构性——领域状态机未到下一态，模型不越级）
- **宿主强制边界**（写文件受计划清单约束——不依赖模型自律）
- **环境单源**（能力从环境推导——不重复检测）
- **全步骤可观测**（时间线——分析一步到位）

---

## 2. 目标驱动管线（确认点驱动推进）

```
用户输入 ─→ 目标澄清（模型+候选按钮）─→ 目标确认卡 ─[确认目标]→ 能力检查 ─→ 执行方案 ─→ 执行确认卡 ─[确认执行]
    → 动手产出（自推进工具链——forceTool 保障）→ 达成汇报 ─→ 达成确认卡 ─[已解决]→ 收敛
                 ↑                                      ↑
           计划清单边界（write 受批准约束）         失败感知（工具失败→释放诊断）
```

## 3. 执行保障管线（forceTool 决策链）

```
确认状态(goal/execution) + 产出 + 失败 + 完成度
    │
    ▼
TurnExecutionPolicy（领域层——纯函数）
    │
    ├─ 目标未确认 → auto（澄清）
    ├─ 执行未确认 → auto（等确认卡）
    ├─ 确认+无产出 → required（强制动手）
    ├─ 工具失败 → auto（释放诊断）
    └─ 计划写完/达成确认 → auto（收敛）
    │
    ▼
Gateway.forceTool 传递 → DeepSeek API（tool_choice）
```

## 4. 宿主强制边界管线（模型漂移防护 + 会话级单一 PENDING 状态机）

```
模型调任何工具(read/write/edit/bash/…)
    │
    ▼
ProgressionGate（领域层——会话级单一 PENDING——Conversation 聚合承载）
    ├─ ①【PENDING：等用户决策】──→ 模型动作全部无效（所有工具都不放行——做了白做——不执行不生效）
    │     └─ 卡来源：目标确认卡 / 执行确认卡 / 达成确认卡 / 授权卡（小阶段——影响大阶段后续）
    │（用户「是」→ 状态推进 → 模型根据决策重新做；用户「否」→ 状态回退 → 模型调整）
    ▼
    ├─ ② 非 pending（已确认）→ 按计划清单判定（文件级边界）：
    │     ├─ file ∈ 计划清单 → 放行执行
    │     └─ file ∉ 计划清单 → 拒绝 + 拒绝带边界（「X 不在批准清单（批准的是：A/B/C）」）
    ▼
Workspace 执行（快照→写入→可回滚）
```

## 5. 模块目录（无阶段对齐）

```
apps/desktop/src/
├── domain/                          # 领域层（纯逻辑——L1 可测）
│   ├── conversationState.ts         # Task 聚合（会话状态机单一来源——2026-08-14 落地）
│   ├── turnPolicy.ts                # TurnExecutionPolicy（forceTool 决策）
│   └── agentLoop.ts                 # ProgressEvaluator / StuckDetector / parseExecutionPlan
├── main/                          # Electron Main Process
│   ├── envManager.ts              # Capability BC——环境检测/能力推导/Ledger
│   ├── tools.ts                   # ToolRegistry——工具执行分发
│   ├── gateway.ts                 # DeepSeek API（forceTool 传递/流式/修复）
│   ├── timelineLogger.ts          # Session Timeline BC——JSONL 落盘
│   ├── ipc.ts                     # 进程桥（timeline:log / tools:execute…）
│   └── workspace.ts               # Workspace BC——项目/文件
└── renderer/                       # React 应用层——对话/确认卡/授权卡/工具卡编排
    ├── ConversationPanel.tsx      # 应用层编排（消费领域层纯函数）
    └── MainWorkspace.tsx          # 应用层——状态接线
```

## 6. 关键选型

| 层 | 技术 | 理由 |
|----|------|------|
| 桌面 | Electron | 桌面应用（Monaco 可选）|
| UI | React | 组件化（确认卡/授权卡）|
| 领域层 | TypeScript 纯函数 | L1 可测（turnPolicy/agentLoop）|
| 日志 | JSONL 追加 | 时间线（崩溃保留已写行）|
| 环境检测 | 一次检测 + 推导 | 消除双源（能力=环境视图）|

---

**下一步**: [06-领域事件](./06-domain-events.md)
