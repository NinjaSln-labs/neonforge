# NeonForge

> **你之所向，我之所往；你之所定，我之所行。**
>
> **为 DeepSeek 打造的 AI 问题工作台**——说出你当前的问题，拿到结果。一切能被数字工具解决的：文件整理、小工具、网站、系统修复、0-1 交付。

NeonForge **不是 IDE，也不是 Chatbot**。你用自然语言描述问题，工程/设计/编排由它内在推进——每一步都有**确认卡**把关、**分步授权**、**结果可验证**；超出数字能力时交付数字产物 + 分步指导（不装能、不半吊子）。

**谁在用**：不会写代码的人（说出问题 → 被解决 → 拿到产物 + 指导）· 开发者（异常修复 / 0-1 交付，授权闭环）。

> English: [README.en.md](README.en.md)

> **⚠️ 破坏性变更声明**：NeonForge 处于活跃开发期（V1 尚未到 1.0）——工具接口、系统提示语义、确认卡流程、会话/台账/配置存储格式均**可能发生破坏性变更**，不保证向后兼容。升级以 Releases 与 git 提交说明为准；遇到破坏性变更欢迎提 Issue（注明版本）。

<video controls width="720" src="demo/neonforge-demo.mov" title="NeonForge 核心流演示（真实 API 录制——首次配置 → 打开项目 → 两轮对话）">
  你的浏览器不支持 video 标签——<a href="demo/neonforge-demo.mov">下载演示视频</a>。
</video>

---

## 它如何工作

```
说出问题 → 澄清目标（候选按钮 / 自由输入）→ 【目标确认卡】→ 能力检查 → 执行方案 → 【方案确认卡】（可审阅：文件清单 + 假设 + 验证计划）
    → 动手产出（强制保障：说做就做，防「只说不做」）→ 达成汇报（附验证证据）→ 【解决确认卡】（证据对账）→ 交付产物 + 反馈
```

- **确认卡 = 推进门槛**：目标 / 方案 / 解决三处结构化确认（确认 / 拒绝带原因）——未确认时模型停在确认点，不越级、不白做
- **分步授权**：写文件、执行命令逐项授权（风险明示 + 写前快照可回滚）；「允许并记住」免去重复打断；高危命令永远单独确认
- **宿主强制边界**：模型只能写批准清单内的文件（approve-files 批量授权），清单外写入被拒并提示边界
- **问题 = 一等公民**：问题台账 + 会话快照（目标 / 已决策 / 已授权 / 待办）+ 断点续做 + 复跑

## 功能亮点

1. **KV 缓存预热**：打开项目即预热提示前缀，首字延迟 ~0.1s（真实 API 实测：冷启动 275ms → 预热命中 118ms）
2. **精准上下文**：真实 LSP（定义 / 引用 / 类型 / 诊断）+ CodeRAG 关键词检索 + `@引用` 文件注入——不倾倒垃圾 token
3. **快照与回滚**：每次写入前快照（`.nf-bak`），工具卡一键回滚；交付包批量接受
4. **信任阶梯授权**：L1 观察 → L2 建议 → L3 操作（逐项授权）→ L4 委托（低危自动授权，可撤销）；疲劳防护（批量合并授权）；任何时刻可停止 / 撤销
5. **会话级单一 PENDING**：确认卡 / 授权卡统一「等用户决策」状态机——用户决策是下一个状态的唯一输入
6. **长对话不丢**：自动压缩（真实摘要 + 保留最近 20 条）
7. **服务生命周期托管**：起服务 / 查服务 / 停服务专用工具（自动分配端口、宿主端口保护、进程退出清理）

## 代理能做什么（工具面）

| 工具                                                                                                               | 用途                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| read / write / edit / bash                                                                                         | 核心四件套（write/edit 受分步授权 + 批准清单双重边界；bash 只读命令自动放行） |
| search + LSP（find_definition / find_references / get_type_info / get_diagnostics / get_imports / get_call_chain） | 定位 / 查询 / 诊断——零 token 确定性上下文                                     |
| check-capability                                                                                                   | 能力检测（runtime / 依赖 / 工具链）——环境快照注入模型，开箱即知               |
| approve-files                                                                                                      | 批量授权（1-N 文件，追加语义）——批准后清单内写入自动放行                      |
| start-server / check-server / stop-server                                                                          | 开发服务器生命周期（自动分配动态端口，宿主 5173/5175 保留）                   |
| open                                                                                                               | 打开网页（默认浏览器，仅 http/https）                                         |

## 快速上手

> 需要 Command Code API Key（`commandcode.ai` 获取——Studio → API Keys → Generate；模型为 DeepSeek V4 系列，经 Command Code 聚合接入）。

- **直接下载**：暂未开放——当前版本正在真机验收打磨，下载开放时会通过 [GitHub Releases](https://github.com/NinjaSln-labs/neonforge/releases) 与官网公告（可 Watch Releases 获取通知）

```bash
cd apps/desktop
npm install                # 安装依赖（Electron 下载失败见下方镜像）
npm run dev                # 仅 renderer dev server（:5173）
npm run dev:electron       # 完整应用（dev 模式，连接 :5173）
```

- 首次启动在「设置」中粘贴 API Key（Key 存系统级 `safeStorage`，绝不上传）
- **打开已有项目** → 在对话里说出问题 → 确认卡 + 分步授权 → 拿到交付结果
- **从零开始** → 自动创建项目骨架 → 0-1 交付

### 打包安装

```bash
cd apps/desktop
npm run dist               # 产出 release/（macOS: .dmg + .zip；win: .nsis；linux: AppImage——Electron 下载失败时见下方镜像）
```

> **ExFAT/外置卷已知问题**：electron-builder 在 ExFAT 卷打包会生成损坏的 asar（`chromium-pickle` offset 越界）——输出到本地卷：`npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`
>
> macOS 未签名版本首次打开需右键 → 打开（Gatekeeper 提示）。代码签名 / 公证列入后续路线。

## 仓库结构

```
neonforge/
├── apps/desktop/               # Electron 桌面应用（V1 全量）
│   ├── src/domain/             # 领域层（纯逻辑——Task 聚合 / 意图确认（决策点·推进保障）/ 停滞检测 / 时间线，L1 可测）
│   ├── src/main/               # 主进程（Gateway / ToolRegistry / 环境能力 / 时间线）
│   ├── src/renderer/           # React 应用层（对话 / 确认卡 / 授权卡 / 工具卡）
│   ├── tests/                  # L1 单元 + L3 交互 + L5 视觉
│   └── e2e-*.mjs               # L4 真实 API E2E（需 NF_TEST_KEY）
├── docs/product/               # 产品设计（D0-D9）
├── docs/domain/                # 领域设计（A0-A9，A0 = 实现权威）
└── demo/                       # 演示录屏
```

## 架构

**技术栈**：Electron 43 + React 19 + TypeScript + Vite + esbuild + Monaco（产物查看）+ Vitest + Playwright。V1 网关仅接 DeepSeek（`toDeepSeekParams` 单点收敛，V2 多模型只动网关）。

**领域架构（无阶段 · 目标驱动）**：

```
Conversation BC（核心域） — 目标状态机 · 确认点（目标/方案/解决确认卡——触发权在系统，模型只能提议）· 推进保障（强制推进≠调工具）· 会话级单一 PENDING
Capability BC            — 环境检测（事实来源）· 能力视图（从环境推导）· Ledger 回填（自学习）
Workspace BC             — 项目文件 · 计划清单（宿主强制边界）· 授权裁决 + 任务级信任
Delivery BC              — 交付包（产物+验收对照+确认关闭）· DoD 对齐 · 快照回滚
Session Timeline BC      — 全步骤统一记录（可观测性——JSONL）
```

领域层为纯函数（无 React 依赖），L1 单测锁定状态机 8 组合穷举与门控优先级。

## 文档

| 文档                                            | 说明                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `docs/product/00-product-design.md`（D0 v2.2）  | 产品设计总纲（定位 / 用户流 / 组件 / 指标）  |
| `docs/domain/00-domain-authority.md`（A0 v4.0） | 领域实现权威（确认点 / 推进保障 / 宿主边界） |
| `docs/product/`、`docs/domain/`                 | 完整索引（D0-D9 / A0-A9）                    |

## 测试

```bash
npx vitest run                            # L1 领域逻辑（436）
npx tsc -p tsconfig.json --noEmit         # L2 契约（renderer + main）
npx playwright test --project=interaction # L3 组件交互（49）
npx playwright test                       # L5 视觉 + L3
NF_TEST_KEY=<key> node e2e-suite.mjs      # L4 真实 API E2E（前置：mkdir -p /tmp/nf-e2e-test）
```

CI（GitHub Actions）：push 自动 L1+L2+L3+L5；L4 需仓库 Secret `NF_TEST_KEY`（手动触发）。

### 镜像（Electron 下载失败时）

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

## Roadmap

> 正式跟踪：GitHub [Issues](https://github.com/NinjaSln-labs/neonforge/issues?q=label%3Aroadmap)（label `roadmap` · Milestones：V1 稳定收尾 / V1.x 体验与稳健 / V2 方向）

**V1（当前——稳定收尾）**

- 发布资产：macOS `.dmg` 打包（`.zip` 已可用）· Blog 发布 · Landing + waitlist · 渠道与 Product Hunt
- 真实体验闭环：用户实测反馈 → 修复——本期重点复测**授权卡路径**与**意图确认新交互**（目标/方案/解决确认卡）

**V1.x（体验与稳健）**

- 连续任务体验：换目标时重新确认（当前新【目标确认】在已确认目标后不弹卡——评估补充）
- 拦截引导优化：`tool.blocked` 回填更明确的引导（目标提议/补充授权）
- e2e 模拟器收敛判定（长流程自动化稳定性）；测试基建收尾清理

**V2（规划方向——按依赖排序）**

1. **会话快照完整化**：任务状态机跨重启（确认/执行进度序列化——批准文件清单已先行落地：D3）；与 compaction 摘要基准一致性联动
2. **信任分级**：授权疲劳治理（低危委托自动化档位 / 模式预设——当前「允许并记住」与合并授权之上的下一步）
3. **结构化澄清工具**（AskToAct 式：目标假设显式采集，替代自由文本框的澄清输入）
4. **多模型网关**（接口已按单点收敛设计——`toDeepSeekParams`）+ **插件体系深化**（内置插件注册表已就绪）
5. **问题台账云端同步 / 多设备**
6. **机制事件补全**（如 `gate.denied` 结构化拒绝事件）
7. **代码签名与公证**（macOS/Windows）

## 已知限制（V1）

- **断点续做范围**：重启后恢复对话消息 + 问题台账（目标/已授权）+ **批准文件清单（D3——批准事实跨重启：重启后写清单内文件不需重新批量授权）；确认状态与执行进度不跨重启**（复开从目标澄清重新走——安全回退；会话快照持久化在 V2）
- **打包版 LSP 降级**：dev 模式 LSP 完整可用；打包版若系统未装 `typescript-language-server` 则 LSP 工具提示未连接——对话 / 工具 / 交付主链路不受影响
- macOS 未签名（见上）；Windows / Linux 打包目标已配置未实测
- 单实例锁按应用作用域；测试环境注意残留实例（见 CI 脚本）

## 贡献指南

1. Fork + 新分支（`feat/xxx` 或 `fix/xxx`）
2. 改动前先读 `docs/domain/00-domain-authority.md`（A0 实现权威）与 `docs/product/00-product-design.md`（D0）
3. 改动后质量链全绿再提 PR：`npx vitest run` + `npx tsc -p tsconfig.json --noEmit` + 相关 L3/L5
4. 安全约定：Key 不落盘不上传；写操作先快照；IPC 参数校验

---

**License**：MIT（见 [LICENSE](LICENSE)）· **联系**：GitHub Issues
