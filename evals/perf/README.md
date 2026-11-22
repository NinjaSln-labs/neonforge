# NeonForge 性能基线探针

测量 NeonForge 真实 Electron 启动、空载内存、代表性 IPC 与核心工具执行延迟。**只测量，不改产品代码。**

## 启动基准

```bash
# 在仓库根；先构建（产品代码冻结后）
cd apps/desktop && npm run build && cd ../..
node evals/perf/run-startup-benchmark.cjs --cold 5 --warm 3
```

- 冷启动：每次新建独立 `HOME`、`XDG_*`、Electron `userData` 与短 `TMPDIR`。
- 热启动：复用第 1 次冷启动的同一用户数据目录。
- 无显示环境自动使用 `xvfb-run`；固定 `--disable-gpu --no-sandbox`，保证软件渲染下的可比性。
- 每次运行注入假 Key `dummy-not-a-key`，并剔除所有 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量；不读取真实凭据。
- 原始 JSONL 与构建日志只写 `.scratch/evals/perf/`，不进入仓库。

## 启动指标

| 指标                               | 含义                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `wallMs`                           | 运行器从 spawn `xvfb-run`/Electron 到进程退出的墙钟时间（含 Xvfb 启动）                                            |
| `app_ready`                        | 主进程从入口到 `app.whenReady` 解析                                                                                |
| `window_created`                   | 首个 `browser-window-created`                                                                                      |
| `did_finish_load`                  | 渲染器 `did-finish-load`                                                                                           |
| `ready_screen`                     | 渲染器出现 `.nf-start` 或 `.nf-config`（首屏可交互判定）                                                           |
| IPC `config.hasKey` / `budget.get` | 渲染器→主进程 30 次 `invoke` 的 median / p95（3 次预热）                                                           |
| `totalWorkingSetMB`                | `app.getAppMetrics()` 各进程 working set 之和（含共享页，**不可当作唯一内存**）；另报 Browser/GPU/Utility/Tab 分解 |
| `totalPssMB`                       | Linux `/proc/<pid>/smaps_rollup` 的 PSS 之和（更接近唯一驻留内存）；文档记录时优先使用                             |
| `renderer.heap`                    | `performance.memory` 的 JS heap（仅作为观测值）                                                                    |

## 工具执行基准

```bash
node evals/perf/run-tool-benchmark.cjs --runs 3 --iterations 30 --warmup 3
```

- 直接调用构建后的 `toolRegistry.execute`（`apps/desktop/dist/main/tools.js`），覆盖 `read`/`write`/`edit`/`search`/`bash`。
- 每次运行创建独立 fixture 与 userData；通过 `approved:true, approvalSource:'user'` 模拟用户已批准的执行路径。
- 每个工具每进程 30 次（3 次预热）；默认 3 个独立进程，汇总 90 个样本。
- `search` 在 `write`/`edit` 之前执行，避免快照 `.nf-bak` 污染检索 fixture。
- 记录每次调用主进程内耗时、失败数，并校验返回值（read 字符数、write bytes/snapshot、edit snapshot、search hits、bash stdout）。

## 端到端工具执行基准

```bash
node evals/perf/run-tool-ipc-benchmark.cjs --runs 3 --iterations 30 --warmup 3
```

- 启动真实 Electron 应用与启动页，渲染器通过 `window.neonforge.tools.execute` 发起调用，经过 preload → `tools:execute` IPC → `ToolRegistry.decide/execute`。
- 与主进程基准使用同一 fixture/工具参数/授权路径，便于直接比较 IPC 固定开销。
- 同时校验返回载荷；不包含审批卡显示或用户点击等待。
- 结果只统计渲染器内测得的端到端 invoke 往返。

## 限制

- 头部启动数字是 **headless + 软件渲染 + xvfb**，不等于 macOS/Windows 桌面 GPU 路径；只作同环境纵向对比。
- 冷启动的“冷”仅指应用用户数据为空，不清理操作系统文件缓存；首次构建后首次运行通常更慢，需单独记录。
- 假 Key 会进入启动页，不进入配置/工作区；启动基准未覆盖项目打开或会话流式输出。
- 工具基准是**主进程 ToolRegistry 内部耗时**；端到端基准增加渲染器 IPC，但两者都不含审批卡显示/点击等待。
- fixture 很小且文件缓存已热，不代表大文件、冷缓存、并发或网络工具。
- 不是官方基准，也不代表用户感知的端到端时延。
