# Electron 启动性能基线探针

测量 NeonForge 真实 Electron 主进程/窗口/渲染器首屏启动与空载内存、代表性 IPC 往返延迟。**只测量，不改产品代码。**

## 运行

```bash
# 在仓库根；先构建（产品代码冻结后）
cd apps/desktop && npm run build && cd ../..
node evals/perf/run-startup-benchmark.cjs --cold 5 --warm 3
```

- 冷启动：每次新建独立 `HOME`、`XDG_*`、Electron `userData` 与短 `TMPDIR`。
- 热启动：复用第 1 次冷启动的同一用户数据目录。
- 无显示环境自动使用 `xvfb-run`；固定 `--disable-gpu --no-sandbox`，保证软件渲染下的可比性。
- 每次运行注入假 Key `nf-perf-dummy-not-a-key`，并剔除所有 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量；不读取真实凭据。
- 原始 JSONL 与构建日志只写 `.scratch/evals/perf/`，不进入仓库。

## 指标

| 指标                               | 含义                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `wallMs`                           | 运行器从 spawn `xvfb-run`/Electron 到进程退出的墙钟时间（含 Xvfb 启动）          |
| `app_ready`                        | 主进程从入口到 `app.whenReady` 解析                                              |
| `window_created`                   | 首个 `browser-window-created`                                                    |
| `did_finish_load`                  | 渲染器 `did-finish-load`                                                         |
| `ready_screen`                     | 渲染器出现 `.nf-start` 或 `.nf-config`（首屏可交互判定）                         |
| IPC `config.hasKey` / `budget.get` | 渲染器→主进程 30 次 `invoke` 的 median / p95（3 次预热）                         |
| `totalWorkingSetMB`                | `app.getAppMetrics()` 各进程 working set 之和；另报 Browser/GPU/Utility/Tab 分解 |
| `renderer.heap`                    | `performance.memory` 的 JS heap（仅作为观测值）                                  |

## 限制

- 头部数字是 **headless + 软件渲染 + xvfb**，不等于 macOS/Windows 桌面 GPU 路径；只作同环境纵向对比。
- 冷启动的“冷”仅指应用用户数据为空，不清理操作系统文件缓存；首次构建后首次运行通常更慢，需单独记录。
- 假 Key 会进入启动页，不进入配置/工作区；未覆盖项目打开、会话流式输出、工具执行等场景。
- 不是官方基准，也不代表用户感知的端到端时延。
