# 证据卡：macOS 目标机启动性能基线（2026-11-22）

> 这是 NeonForge 在真实 macOS GUI 桌面上的首份启动基线，补上 SLO 计划要求的“macOS 目标机重复 20 次”。
> 仍不是 SLO 达成声明：单一 MacBook 型号、默认 GPU 路径、启动页场景，未覆盖项目/会话/工具。

## 基本信息

| 字段     | 值                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 05:46）                                                                                                                 |
| 产品代码 | `32247b6`（main）                                                                                                                       |
| 测量脚本 | `evals/perf/`（commit `9fd0da7`；仅测量，不改产品代码）                                                                                 |
| 机器     | MacBook Pro 15-inch 2018（`MacBookPro15,1`）：Intel Core i9-8950HK（12 线程）、32 GB、Radeon Pro 555X + Intel UHD 630、2880×1800 Retina |
| 系统     | macOS 15.8.3（Darwin 24.6.0，x86_64）                                                                                                   |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1                                                                                  |
| 显示路径 | 真实 macOS GUI（`mac-gui`），默认 GPU；**未**使用 `--disable-gpu`/`xvfb`                                                                |
| 运行方式 | 20 次冷启动（每次新 `HOME`/`XDG_*`/Electron `userData`）+ 10 次热启动（复用第 1 次目录）                                                |
| 凭据     | 假 Key `dummy-not-a-key`；运行器剔除 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量；不读取真实凭据                                            |
| 原始数据 | `.scratch/evals/perf/macos-startup-2026-11-22.jsonl`（从 Mac 复制，gitignored）                                                         |

## 测量方法

- 与 WSL 基线使用同一 `evals/perf/electron-startup.cjs` 探针：启动真实 `apps/desktop/dist/main/main.js`，记录 `app_ready`、窗口创建、`did-finish-load`、首屏 `.nf-start` 可见、IPC 与内存。
- 20 冷 + 10 热；每次新用户数据，应用层冷启动；不清理 macOS 文件缓存。
- 无 `xvfb`、无软件渲染开关；窗口在真实 macOS GUI 会话中显示。运行期间系统 load average 约 `2.75 / 1.82 / 1.61`（有其他活动）。
- 内存使用 `app.getAppMetrics()` 的 working set（含共享页，不可当作唯一内存）；macOS 无 `/proc/<pid>/smaps_rollup`，因此本机不报 PSS。

## 结果：启动阶段（毫秒，相对 Electron 主进程入口）

| 阶段                           | 冷启动 p50 | 冷启动 p95 | 热启动 p50 | 热启动 p95 |
| ------------------------------ | ---------: | ---------: | ---------: | ---------: |
| `app_ready`（`app.whenReady`） |       80.7 |       83.5 |       80.5 |       82.6 |
| `window_created`               |      511.9 |      533.1 |      511.5 |      550.9 |
| `did_finish_load`              |      851.9 |      872.4 |      848.6 |      893.2 |
| `ready_to_show`                |      853.0 |          — |          — |          — |
| `window_show`                  |     1282.7 |          — |          — |          — |
| **`ready_screen`（首屏可见）** | **1321.1** | **1344.0** | **1328.7** | **1373.9** |

- 20/20 冷启动与 10/10 热启动成功完成测量，无失败/异常。
- 热启动没有比冷启动更快（1328.7 vs 1321.1 ms）：启动时间主要花在 macOS 窗口/Chromium 渲染路径，应用用户数据命中不是主因。
- `wallMs`（运行器从 spawn 到进程退出，含退出清理）：冷 p50 2373 / p95 2398；热 p50 2376 / p95 2434；不作为启动延迟。

## 结果：IPC 与内存（空载启动页）

| 指标                            |   冷启动 |   热启动 |
| ------------------------------- | -------: | -------: |
| `config.hasKey` 30 次 median    |   0.2 ms |   0.1 ms |
| `budget.get` 30 次 median       |   0.2 ms |   0.2 ms |
| `budget.get` per-run p95 的 p95 |   1.2 ms |   1.2 ms |
| 总 working set（含共享页）      | 315.3 MB | 314.7 MB |
| 主进程 RSS                      | 104.1 MB | 104.0 MB |
| 渲染器 JS heap                  |  18.4 MB |  18.4 MB |

Working set 分解（冷启动中位数）：Browser/主进程 104.2 MB、Tab/渲染器 119.3 MB、Utility 26.6 MB、GPU 65.3 MB。macOS 无 PSS，不能与 WSL 卡片的 PSS 直接相加或比较。

## 与 WSL2 基线的对照

| 指标（p50）        | WSL2 + xvfb（`2026-11-22-product-startup-baseline.md`） | macOS GUI（本卡） |
| ------------------ | ------------------------------------------------------: | ----------------: |
| `app_ready`        |                                                158.2 ms |           80.7 ms |
| `window_created`   |                                                208.5 ms |          511.9 ms |
| `did_finish_load`  |                                                424.5 ms |          851.9 ms |
| **`ready_screen`** |                                            **448.8 ms** |     **1321.1 ms** |
| 总 working set     |                                                516.6 MB |          315.3 MB |

- macOS 的 `ready_screen` 约为 WSL 的 2.9 倍；窗口创建与渲染加载是主要差距，不能直接归因于硬件或 GPU（OS/窗口服务器/Chromium 路径不同）。
- macOS working set 较低（315 vs 517 MB），但 macOS 与 Linux 的计费口径不同，且 macOS 无 PSS；不能得出“macOS 更省内存”的强结论。
- SLO 提案的冷启动 p95 ≤3 s：本机 1.344 s 低于该值，但这是单一机器、启动页、默认 GPU 的观察，**不是 SLO 达标声明**。

## 限制

- **单一机器**：2018 MacBook Pro（Intel i9 + Radeon 555X），macOS 15.8.3；不代表 Apple Silicon、其他 macOS 版本或新机型。
- **有背景负载**：运行期间 load average 约 2.75/1.82/1.61；未隔离其他应用/窗口服务器活动。
- **应用层冷启动**：每次新 userData，但不清理 macOS 文件缓存；首次安装/首次启动可能更慢。
- **场景有限**：假 Key 进入启动页，不进入项目工作区、会话流式输出、工具执行或长会话；未测首 token/审批等待/任务成功率。
- **无 PSS**：macOS 只能报 working set/RSS；working set 含共享页，不能当作唯一内存。
- **p95 为粗分位数**：20 个冷启动样本的 p95 实际接近最大值；无置信区间。
- **不是 SLO 达成**：未做多机型/多 macOS 版本，也未验证用户感知端到端时延。

## 安全与边界

- 使用隔离的临时 userData/HOME 与假 Key；运行器剔除敏感环境变量；不读取真实凭据。
- 原始 JSONL 只在 Mac 与宿主 `.scratch/`（gitignored）；未上传会话内容、文件路径或凭据。
- 未调用外部模型或网络工具。
