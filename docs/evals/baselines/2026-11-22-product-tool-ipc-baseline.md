# 证据卡：NeonForge 端到端工具调用基线（渲染器 IPC，2026-11-22）

> 本卡是**产品级端到端工具调用基线**，覆盖渲染器 → preload → `tools:execute` IPC → `ToolRegistry` 的真实路径。
> 仍不包含审批卡显示或用户点击等待，也不是 SLO 达成声明。

## 基本信息

| 字段     | 值                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 03:51）                                                                                                |
| 产品代码 | `32247b6`（main）                                                                                                      |
| 测量脚本 | `evals/perf/`（commit `2bee3b3`，仅测量，不改产品代码）                                                                |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；`xvfb`；`--disable-gpu --no-sandbox`       |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1                                                                 |
| 运行方式 | 3 个独立 Electron 应用；每个工具每应用 30 次（3 次预热）；每工具 90 个样本                                             |
| Fixture  | 临时项目：`readme.md` 约 3.1 KB、`edit-target.txt`、`search-target.txt`、`write-target.txt`                            |
| 授权路径 | 渲染器调用 `window.neonforge.tools.execute(name, args, { rootPath, approved:true, approvalSource:'user', sessionId })` |
| 凭据     | 假 Key `dummy-not-a-key`；剔除 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量；不读取真实凭据                                 |
| 原始数据 | `.scratch/evals/perf/tool-ipc-2026-11-22T03-51-30-287Z.jsonl`（gitignored）                                            |

## 测量方法

- `evals/perf/tool-ipc-execution.cjs` 启动真实 Electron 应用，等启动页 `.nf-start` 可见后，在渲染器内调用 `window.neonforge.tools.execute`。
- 调用链：渲染器 → preload bridge → `ipcRenderer.invoke('tools:execute')` → IPC schema 校验 → `ToolRegistry.decide` → 执行器 → 返回渲染器。
- 计时使用渲染器 `performance.now()`，覆盖完整 invoke 往返；未在主进程内单独计时。
- 顺序与主进程工具基准一致：`read`、`search`、`write`、`edit`、`bash`，`search` 在写操作前以避免 `.nf-bak` 污染。
- 每次运行 3 次预热 + 30 次测量；汇总 3 个应用进程的 90 个样本。
- 返回载荷校验：read 3130 字符、write `bytes=8`/`snapshot=true`、edit `snapshot=true`、search `hits`、bash stdout `perf-ok\n`。
- 应用启动阶段（本探针内）：窗口创建约 202 ms、`did-finish-load` 约 416 ms、启动页可见约 444 ms；全部工具调用完成约 2.65 s。

## 结果（毫秒，渲染器内端到端 invoke 往返）

| 工具     |   n | 失败 |   p50 |   p95 |   min |   max |
| -------- | --: | ---: | ----: | ----: | ----: | ----: |
| `read`   |  90 |    0 |  6.70 |  8.80 |  5.90 | 12.80 |
| `search` |  90 |    0 |  6.30 |  7.90 |  5.80 |  8.70 |
| `write`  |  90 |    0 | 20.80 | 24.00 | 19.80 | 26.20 |
| `edit`   |  90 |    0 | 20.60 | 23.60 | 19.50 | 27.80 |
| `bash`   |  90 |    0 |  9.80 | 10.70 |  8.30 | 20.40 |

与同日的**主进程内**工具基线（`2026-11-22-product-tool-execution-baseline.md`）对照：

| 工具     | 主进程 p50 / p95 | 端到端 p50 / p95 |
| -------- | ---------------: | ---------------: |
| `read`   |      6.49 / 9.57 |      6.70 / 8.80 |
| `search` |      5.99 / 6.87 |      6.30 / 7.90 |
| `write`  |    20.24 / 23.40 |    20.80 / 24.00 |
| `edit`   |    19.83 / 26.88 |    20.60 / 23.60 |
| `bash`   |     8.88 / 11.73 |     9.80 / 10.70 |

- 两组是独立运行，差值在运行间波动范围内；没有观察到显著 IPC 固定开销（此前启动页 `config.hasKey`/`budget.get` 往返 median 约 0.2 ms）。
- 3/3 应用进程成功，450 次测量调用全部成功，0 失败/0 策略拦截。
- 写/编辑耗时约为读的 3 倍，与主进程基线一致，主要是写前快照 `.nf-bak` 与变更集记录。

## 解释

- 在 3 KB fixture 与热文件缓存下，渲染器发起一次已授权的核心工具调用，端到端 p95 在 7.9–24.0 ms 之间；没有出现审批/策略失败。
- 端到端与主进程内数字接近，说明 preload/IPC 收敛路径的固定开销相对工具本身很小（本机、空载、无并发）。
- 真正用户感知的“审批等待”是用户看到授权卡到点击的时间，通常由人决定，不能用本卡数字代替。
- 本卡支持“工具执行主路径没有明显 IPC 瓶颈”的结论；不支持大项目、冷缓存、并发、网络工具或 macOS 目标机结论。

## 限制

- **仍未覆盖审批卡**：使用 `approved:true, approvalSource:'user'` 模拟已批准；未测 `ask` 拦截、deny 规则、delegate 边界或用户点击延迟。
- **fixture 很小且缓存热**：3 KB 文件、顺序调用、无并发、无大文件/冷缓存/磁盘竞争。
- **未覆盖网络/MCP/扩展工具**；仅 5 个核心工具。
- **样本量**：3 个独立应用、每工具 90 次；p95 是粗分位数，无置信区间。
- **平台限制**：WSL2 + xvfb + 软件渲染，不是 macOS/Windows 桌面 GPU 路径。
- **不是 SLO 达成**：SLO 提案面向 macOS 目标机；本卡是开发机端到端基线。

## 安全与边界

- 隔离临时 fixture 与 userData；假 Key、剔除敏感环境变量；不读取真实凭据。
- 原始 JSONL 只落 `.scratch/`（gitignored）；未上传文件路径、会话内容或凭据。
- 未调用外部模型或网络工具。
