# 证据卡：NeonForge 核心工具执行延迟基线（2026-11-22）

> 本卡是**产品级工具执行基线**的第一版，不是 SLO 达成声明。
> 测量对象是构建后的真实 `ToolRegistry.execute` 路径（Electron 主进程内），不是外部 Agent 基准。

## 基本信息

| 字段     | 值                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 03:44）                                                                                                       |
| 产品代码 | `32247b6`（main）                                                                                                             |
| 测量脚本 | `evals/perf/`（commit `295edb3`，仅测量，不改产品代码）                                                                       |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；`xvfb`；`--disable-gpu --no-sandbox`              |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1                                                                        |
| 运行方式 | 3 个独立 Electron 主进程；每个工具每进程 30 次（3 次预热）；合计每工具 90 个样本                                              |
| Fixture  | 临时项目：`readme.md` 约 3.1 KB、`edit-target.txt`（alpha/beta/gamma）、`search-target.txt`、`write-target.txt`（写入时创建） |
| 授权路径 | `approved:true, approvalSource:'user'`（模拟用户已批准后的执行；仍走 `ToolRegistry.decide`）                                  |
| 凭据     | 假 Key `dummy-not-a-key`；剔除 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量；不读取真实凭据                                        |
| 原始数据 | `.scratch/evals/perf/tools-2026-11-22T03-44-35-183Z.jsonl`（gitignored）                                                      |

## 测量方法

- `evals/perf/tool-execution.cjs` 在 Electron 主进程 `app.whenReady()` 后加载 `dist/main/tools.js`，调用 `initTools()`，然后直接调用 `toolRegistry.execute(name, args, opts)`。
- 每次调用覆盖真实产品路径：`decide`（授权/策略）→ 执行器 → 文件系统/子进程；不含渲染器 IPC 与审批卡交互。
- 顺序：`read`、`search`、`write`、`edit`、`bash`。`search` 放在写操作之前，避免 `.nf-bak` 快照污染检索 fixture。
- 每个工具先预热 3 次，再记录 30 次主进程内耗时；运行器汇总 3 个进程的 90 个样本并计算 p50/p95/min/max。
- 结果校验：read 返回 3130 字符；write 返回 `bytes=8` 与 `snapshot=true`；edit 返回 `snapshot=true`；search 返回命中 `hits`；bash stdout 为 `perf-ok\n`。快速空操作不能当作有效结果。

## 结果（毫秒，主进程内耗时）

| 工具     |   n | 失败 |   p50 |   p95 |   min |   max |
| -------- | --: | ---: | ----: | ----: | ----: | ----: |
| `read`   |  90 |    0 |  6.49 |  9.57 |  5.76 | 14.82 |
| `search` |  90 |    0 |  5.99 |  6.87 |  5.29 | 10.10 |
| `write`  |  90 |    0 | 20.24 | 23.40 | 18.21 | 27.79 |
| `edit`   |  90 |    0 | 19.83 | 26.88 | 18.26 | 34.43 |
| `bash`   |  90 |    0 |  8.88 | 11.73 |  7.78 | 15.13 |

- 3/3 进程成功，450 次测量调用全部成功，0 失败/0 策略拦截。
- 单次调用最大 34.43 ms（edit）；写/编辑的额外开销来自写前快照与变更集记录，符合预期。
- 与 SLO 提案对比（仅参考，不是目标机结论）：只读工具 p95 9.57 ms（提案 ≤200 ms）；写入工具 p95 23.40 ms（提案 ≤500 ms）。差距很大，但本基线是 3 KB fixture、文件缓存已热、主进程内耗时。

## 解释

- 空载 fixture 下，读/检索约 6 ms、写/编辑约 20 ms、bash 约 9 ms；没有观察到显著失败或授权路径开销。
- 写/编辑耗时约为读的 3 倍，主要来自 `takeSnapshot`（写前 `.nf-bak`）与 `recordChange`；这是产品可回滚语义的固定成本，不是异常。
- 渲染器 IPC 的启动页往返在 0.2 ms 量级（见启动基线卡片），因此工具调用端到端仍远低于当前 SLO 提案；但本卡未测审批卡等待或真实用户决策时间。
- 这些数字只适合同环境纵向比较；不能作为 macOS/Windows 桌面或大项目/大文件性能结论。

## 限制

- **主进程内耗时**：不含 renderer→main IPC、授权卡显示、用户点击等待、网络工具（`web_search`/`web_fetch`）或 MCP 扩展。
- **fixture 很小且缓存热**：3 KB 文件、顺序调用、无并发、无大文件/冷缓存/磁盘竞争；不代表真实项目。
- **单一授权路径**：`approved:true + approvalSource:'user'`；未测 `ask` 拦截、`deny` 规则或 delegate 边界。
- **样本量**：3 个独立进程、每工具 90 次；p95 是粗分位数，无置信区间或跨机器比较。
- **不覆盖工具组合**：未测连续 read/write/edit 的变更集增长、长会话内存、工具失败重试或模型驱动的多轮调用。
- **不是 SLO 达成**：提案阈值面向 macOS 目标机；本卡是开发机基线，且只覆盖 5 个核心工具。

## 安全与边界

- 使用隔离临时 fixture 与 userData；假 Key、剔除敏感环境变量；不读取真实凭据。
- 原始 JSONL 只落 `.scratch/`（gitignored）；未上传任何文件路径、会话内容或凭据。
- 未调用外部模型或网络工具。
