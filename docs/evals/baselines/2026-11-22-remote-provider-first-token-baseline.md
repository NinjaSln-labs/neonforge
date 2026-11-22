# 证据卡：NeonForge 远端 Provider 首 token 延迟基线（2026-11-22）

> 本卡是**产品级性能基线**，不是 SLO 达成声明，也不是人类可用性研究。
> 对象是真实 Electron 产品与 DeepSeek 官方 API（`https://api.deepseek.com`）；渲染器时间线由脚本驱动。
> 与本机 Magpie 基线（`2026-11-22-product-first-token-baseline.md`）分开记录，不合并统计。

## 基本信息

| 字段     | 值                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 14:56–15:02；CST 22:56–23:02）                                                                                                       |
| 产品代码 | `ca68560`（main；首 token 探针 PR #109 合并后）                                                                                                       |
| 测量脚本 | `evals/perf/first-token.cjs` 的远端模式（`--mode remote` / `NF_FIRST_TOKEN_REMOTE=1`），仅测量                                                       |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；`xvfb` 1280×800；`--disable-gpu --no-sandbox`                             |
| 目标机   | 2018 MacBook Pro（`MacBookPro15,1`）；i9-8950HK（12 线程）；32 GB；macOS 15.8.3（Darwin 24.6.0）；默认 GPU；负载均值约 1.5–1.9                        |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1                                                                                               |
| 上游     | DeepSeek 官方 `api.deepseek.com`；`/models` 返回 `deepseek-flash`、`deepseek-v4-pro`                                                                 |
| 模型     | 默认路径由产品 `/models` 档位解析选出 `deepseek-flash`（未手填模型）；显式模型场景为 `deepseek-v4-pro`                                              |
| 凭据     | 仅从 `DEEPSEEK_API_KEY` 环境变量进入探针进程；macOS 经 SSH stdin 注入；不写文件、不写日志、不入仓库                                                  |
| 原始数据 | WSL：`.scratch/evals/perf/first-token-remote-0ms-2026-11-22T14-56-56-220Z.jsonl`（flash）、`first-token-remote-0ms-2026-11-22T14-56-50-001Z.jsonl`（pro）；macOS：`.scratch/evals/perf/macos-2026-11-22-first-token/mac-remote-flash.jsonl`、`mac-remote-pro.jsonl`（均 gitignored） |

## 测量方法

- 与本地基线同一探针：主进程内直接调用真实 `DeepSeekGateway.streamChat`，时间点来自 `onDelta`；渲染器路径脚本化走启动页「从零开始」→ `initialPrompt` 自动发送 → `gateway:stream-chat`，`MutationObserver` 记首个可见正文。
- **远端模式不改写 `fetch`**：走产品 descriptor 的固定 origin（`https://api.deepseek.com`）与真实网络；默认模型留空，由产品自身 `/models` 解析档位（与用户配置一致），显式模型场景传 `--remote-model deepseek-v4-pro`。
- 每次运行独立 `userData`/`HOME`/`XDG`；每进程先预热 1–2 次再进入正式迭代；渲染器场景每进程只发一次首句。
- 三个口径分开报告：首流式块（reasoning/content 任一）、首个 content 块、渲染器首个可见正文。

## 样本

| 场景                  | 平台 | 运行数 | 每进程网关迭代 | 网关样本 | 渲染器样本 | 失败 |
| --------------------- | ---- | -----: | -------------: | -------: | ---------: | ---: |
| `deepseek-flash`      | WSL  |     10 |              5 |       50 |         10 |    0 |
| `deepseek-v4-pro`     | WSL  |     10 |              5 |       50 |         10 |    0 |
| `deepseek-flash`      | Mac  |      5 |              3 |       15 |          5 |    0 |
| `deepseek-v4-pro`     | Mac  |      5 |              3 |       15 |          5 |    0 |

## 结果 1：网关路径（毫秒）

| 场景             | 平台 | 首流式块 p50/p95 | 首个 reasoning p50/p95 | 首个 content p50/p95 | done p50/p95 |
| ---------------- | ---- | ---------------: | ---------------------: | -------------------: | -----------: |
| `deepseek-flash` | WSL  |     **392 / 738** |             386 / 738 |        604 / 1281 |   624 / 1318 |
| `deepseek-flash` | Mac  |     **614 / 1283** |             613 / 1283 |        720 / 1283 |   729 / 1293 |
| `deepseek-v4-pro` | WSL  |     **740 / 1033** |             740 / 1033 |       1429 / 2128 |  1445 / 2164 |
| `deepseek-v4-pro` | Mac  |     **913 / 2208** |             913 / 2208 |       1592 / 3587 |  1630 / 3594 |

- flash 在 WSL 上的首流式块几乎等同于首个 reasoning token（`n=32/50` 有 reasoning；部分响应直接给 content），说明默认档位模型先出思考块再出正文。
- pro 在 WSL 上首流式块全部是 reasoning（`n=50/50`），content 平均要再等约 0.6–0.7 s；Mac 上同结构但离散更大。
- 首内容块到 done 的间隔在 flash 上约 20 ms，在 pro 上约 16 ms；本轮回复很短（一条问候），不代表长回复时长。
- 同一模型跨平台对比：flash 的 WSL p50 392 ms vs Mac 614 ms；pro 的 740 ms vs 913 ms。Mac 侧多出的部分是渲染器/进程固定开销与网络栈差异，不是模型更慢。

## 结果 2：渲染器路径（毫秒，相对点击「从零开始」）

| 场景             | 平台 | 首块 p50/p95 | 首个 content 块 | 首个可见正文 | done |
| ---------------- | ---- | -----------: | --------------: | -----------: | ---: |
| `deepseek-flash` | WSL  | 672 / 944 |    672 / 944 | **673 / 945** | 871 / 1180 |
| `deepseek-flash` | Mac  | 1281 / 1319 |  1281 / 1319 | **1284 / 1322** | 1409 / 1600 |
| `deepseek-v4-pro` | WSL  | 1119 / 1556 |  1119 / 1556 | **1121 / 1558** | 1338 / 1726 |
| `deepseek-v4-pro` | Mac  | 1624 / 3521 |  1624 / 3521 | **1627 / 3523** | 1690 / 3749 |

- 渲染器路径的可见正文与首个 content 块只差约 1–3 ms，说明持续流式下 React 更新不是瓶颈。
- WSL 的「点击 → 首块」比网关直调多约 280 ms（flash：672 vs 392）和约 379 ms（pro：1119 vs 740）；Mac 侧多约 667 ms 和 711 ms。这部分包含工作区挂载/会话建立、preload/IPC、系统提示与 `tools: true` 请求体变大，以及本地基线里测到的 UI 固定开销（mock 0 ms 时 WSL 121 ms / Mac 554 ms）。
- 由于渲染器请求体是完整产品系统提示 + 工具定义，而网关直调是简短无工具请求，两者不应直接相减当作纯 UI 开销。

## 解释与 SLO 对照

- 远端 DeepSeek flash 的**首流式块 p50 为 392 ms（WSL）/ 614 ms（Mac）**，**首个可见正文 p50 为 673 ms / 1284 ms**，均明显低于 SLO 提案的首 token p50 ≤ 2 s / p95 ≤ 5 s；p95 也都在提案内（最差 3749 ms 为 Mac pro 的 done，不是首正文）。
- 即使显式选择 pro，可见正文 p50 仍为 1.12 s（WSL）/ 1.63 s（Mac），p95 为 1.56 s / 3.52 s。
- 因此本轮远端 Provider 数据**支持"首 token 提案对远端官方 API 也成立"**，但不构成 SLO 达成声明：模型短回复、单一 Provider、单一模型族、无跨地域网络矩阵，且不是真实用户会话。
- 与本地 Magpie 相比，远端 flash 的首流式块快约 1.1–1.3 s（WSL 392 vs 1518），主要原因应是 Magpie 的 eco 模式与本地排队；不能据此认为远端整体更快——本地没有网络出口成本，长上下文与并发下需另测。

## 限制

- **单一 Provider/模型族**：只测 DeepSeek 官方；Command Code、OpenCode Zen/Go 未测。
- **短回复**：提示为「Say hello in one short sentence.」，回复极短；长回复的总时长、长上下文与工具首轮未覆盖。
- **网络位置单一**：WSL 与 Mac 都在同一局域网/同一出口；没有跨地域、代理、限流或断网恢复场景。
- **渲染器为非人类脚本**：点击与等待由脚本驱动，不产生 SUS/HEART 或真人决策时间；每进程只发一次首句。
- **样本量**：WSL 50 网关样本 + 10 渲染器样本；Mac 15 + 5。p95 是粗分位数，无置信区间；两平台不是同一网络路径（Mac 在 macOS 本机网络栈）。
- **计费副作用**：真实 API 调用按 DeepSeek 计费；本轮调用量很小（约 130 次短请求），但不可当作免费基准。
- **不是官方成绩或 SLO 达成**：无外部对照，也不代表用户感知端到端时延。

## 安全与边界

- Key 只从 `DEEPSEEK_API_KEY` 环境变量读取，经 SSH stdin 传到 Mac 进程环境；未写入配置、日志、shell history 或仓库；运行器剔除 `*KEY*`/`*SECRET*`/`*TOKEN*` 等环境变量后再启动 Electron，仅显式注入一个凭据变量。
- 请求内容只有固定问候语与探针系统提示；不上传用户文件、路径或会话内容。
- 原始 JSONL/汇总只落 `.scratch/evals/perf/`（gitignored）。

