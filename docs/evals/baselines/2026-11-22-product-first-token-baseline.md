# 证据卡：NeonForge 产品级首 token 延迟基线（2026-11-22）

> 本卡是**产品级性能基线**，不是 SLO 达成声明，也不是人类可用性研究。
> 对象是真实 Electron 产品（主进程 + preload + 渲染器）与真实本机 Magpie 网关；mock 场景只用于隔离上游延迟。
> 渲染器时间线由脚本驱动，不代表真人操作或 SUS/HEART 数据。

## 基本信息

| 字段     | 值                                                                                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 07:25–07:40；CST 15:25–15:40）                                                                                                                                                                                                                              |
| 产品代码 | `79e07f4`（main；首个 token 探针合并前）                                                                                                                                                                                                                                    |
| 测量脚本 | 本 PR 的 `evals/perf/first-token.cjs`、`first-token-renderer.cjs`、`run-first-token-benchmark.cjs`（仅测量，不改产品代码）                                                                                                                                                  |
| 构建     | `apps/desktop/dist/main/main.js`（`npm run build` 产物；测量期间未改产品代码）                                                                                                                                                                                              |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；`xvfb` 1280×800；`--disable-gpu --no-sandbox`                                                                                                                                                   |
| 目标机   | 2018 MacBook Pro（`MacBookPro15,1`）；i9-8950HK（12 线程）；32 GB；macOS 15.8.3（Darwin 24.6.0）；默认 GPU；负载均值约 1.4–1.9                                                                                                                                              |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1（两平台相同）                                                                                                                                                                                                        |
| 本轮模型 | `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，本机 Magpie `127.0.0.1:3425`）；仅真实场景使用                                                                                                                                                                           |
| 凭据     | mock 场景仅假 Key；真实场景 Key 只从 `MAGPIE_GATEWAY_KEY` 环境变量进入探针，不写文件、不写日志；macOS 通过 localhost 反向 SSH 隧道访问 WSL 网关                                                                                                                             |
| 原始数据 | WSL：`.scratch/evals/perf/first-token-mock-0ms-2026-11-22T07-34-03-100Z.jsonl`、`first-token-real-800ms-2026-11-22T07-33-18-079Z.jsonl`、`first-token-real-0ms-2026-11-22T07-36-01-959Z.jsonl`；macOS：`.scratch/evals/perf/macos-2026-11-22-first-token/`（均 gitignored） |

## 测量方法

### 1. 被测链路

- **网关路径**：`DeepSeekGateway.streamChat` → `postChatCompletions` → 流式 SSE 解析 → `onDelta`。探针在主进程内直接调用真实 `dist/main/gateway.js`，记录请求开始到首个 `reasoning` / `content` / `done` 回调的耗时。
- **渲染器路径**：脚本在真实启动页填入首句，点击「从零开始」（与用户点击同一 React 路径）；产品自身的 `initialPrompt` 自动发送流程经 `window.neonforge.gateway.streamChat` → `gateway:stream-chat` IPC → 网关。渲染器另挂独立 `onStreamChunk` 监听，并用 `MutationObserver` + 5 ms 轮询检测首个**非占位 assistant 正文文本**（排除 `搭档处理中…` 占位与 100 ms 的 React 受控输入等待不计入计时）。

### 2. 上游控制

- **mock SSE**：`first-token.cjs` 启动本机 OpenAI 兼容服务，`/v1/models` 返回假模型列表，`/v1/chat/completions` 先保持连接，再按 `NF_FIRST_TOKEN_DELAY_MS` 延迟发送首个 `reasoning_content`、随后 `content`、`finish_reason=stop` 与 `[DONE]`。
- **固定延迟场景**：真实 UI + mock 上游延迟 800 ms（`--mode real --delay-ms 800 --delay-mock`），只用于验证「点击 → 首块」对上游延迟的可加性。
- **真实场景**：`--mode real`，将三个产品 provider 固定 origin（`api.deepseek.com` 等）仅在探针进程内路由到本机 Magpie；模型固定 `opendesign/deepseek-v4.1-flash-eco`，请求形态为产品真实 `tools: true` + 系统提示（渲染器路径）或无工具简单提示（网关路径）。

### 3. 样本

| 场景              | 运行数 | 每进程网关迭代 | 网关样本 | 渲染器样本 | 失败 |
| ----------------- | -----: | -------------: | -------: | ---------: | ---: |
| WSL mock 0 ms     |     10 |              8 |       80 |         10 |    0 |
| WSL mock 800 ms   |      3 |              5 |       15 |          3 |    0 |
| WSL real Magpie   |     10 |              5 |       50 |         10 |    0 |
| macOS mock 0 ms   |     10 |              8 |       80 |         10 |    0 |
| macOS mock 800 ms |      5 |              3 |       15 |          5 |    0 |
| macOS real Magpie |     10 |              5 |       50 |         10 |    0 |

- 每个进程独立 `userData`/`HOME`/`XDG`；每进程先做 2–3 次网关预热，再进入正式迭代；渲染器场景每进程只发送一次首句（不复用会话）。
- 所有样本 0 失败、0 超时；p50/p95 为原始样本的粗分位数（渲染器只有 3–10 个样本）。

## 结果 1：网关路径（毫秒）

| 场景              | 首 delta（reasoning/content 任一） | 首个 reasoning |  首个 content |   流结束 done |
| ----------------- | ---------------------------------: | -------------: | ------------: | ------------: |
| WSL mock 0 ms     |                          3.3 / 4.8 |        3.3/4.8 |       3.3/4.8 |       3.4/4.9 |
| macOS mock 0 ms   |                          3.0 / 4.7 |        3.0/4.7 |       3.0/4.7 |       3.1/4.7 |
| WSL mock 800 ms   |                      803.1 / 804.2 |    803.1/804.2 |   803.1/804.2 |   803.2/804.3 |
| macOS mock 800 ms |                      807.1 / 807.8 |    807.1/807.8 |   807.1/807.8 |   807.4/808.1 |
| WSL real Magpie   |                    1518.5 / 1991.4 |  1494.7/2228.4 | 1910.1/3445.9 | 2120.9/3796.4 |
| macOS real Magpie |                    1598.7 / 1980.8 |  1594.8/2044.9 | 2063.0/3284.8 | 2228.5/3415.5 |

- 表中为 p50 / p95。真实场景中首个 reasoning token 与首个 content token 常不是同一样本（部分响应先直接给 content，部分先给 reasoning）；`firstContent n=50`，`firstReasoning n=38/40`。
- mock 场景下网关自身固定开销约 **3 ms**（两平台一致）；800 ms 注入后 p50 为 803/807 ms，说明网关/SSE 路径基本可加，没有隐藏的固定瓶颈。
- 真实场景首 delta p50 约 **1.5–1.6 秒**；首个 content p50 约 **1.9–2.1 秒**，p95 约 **3.3–3.4 秒**。该差异来自 Magpie 模型在真实 prompt/上下文下的思考长度，不是网关固定开销。

## 结果 2：渲染器路径（毫秒，相对点击「从零开始」）

| 场景              |      首块到达 | 首个 content 块 |  首个可见正文 | content 块 → 正文 |
| ----------------- | ------------: | --------------: | ------------: | ----------------: |
| WSL mock 0 ms     |   120.7/122.4 |     122.6/124.7 |   124.7/127.3 |            约 1–4 |
| macOS mock 0 ms   |   554.3/570.5 |     556.3/572.6 |   560.3/576.6 |            约 1–6 |
| WSL mock 800 ms   |   918.3/918.6 |     919.9/919.9 |   921.8/922.3 |            约 3–4 |
| macOS mock 800 ms | 1399.1/1564.0 |   1401.8/1566.7 | 1406.2/1570.8 |            约 4–7 |
| WSL real Magpie   | 2066.6/2454.5 |   2196.0/2888.1 | 2196.7/2888.7 |           1.3/1.8 |
| macOS real Magpie | 2681.5/3085.7 |   2866.4/3116.5 | 2868.8/3117.1 |           0.9/2.4 |

- 表中为 p50 / p95。mock 场景下「点击 → 首块」是纯 UI 固定开销：WSL 约 **121 ms**，Mac 约 **554 ms**；800 ms 场景的增量分别为约 798/845 ms（Mac 有一个 1570.8 ms 的调度离群样本）。
- 首个 content chunk 到首个可见正文的 DOM 更新约 **1–2 ms**（p95 ≤ 2.4 ms），说明 React 渲染本身不是首 token 的瓶颈。
- 真实场景下，首个可见正文相对首个 content chunk 的 p50 差约 **1 ms**；相对首个流式块（可能是 reasoning）的差约 **50–190 ms**，因为 content 块本身晚于 reasoning 块。
- 真实场景的渲染器路径使用产品自己的首句自动发送、系统提示与 `tools: true`；网关路径使用简单无工具请求。两者不应直接相减当作纯 UI 开销；纯 UI 开销应看 mock 0 ms 场景。

## 解释与 SLO 对照

- **首 token 必须先定义口径**：若定义为「首个流式 token（reasoning/content 任一）」，本机 Magpie 的 p50 为 **1.52 s（WSL）/ 1.60 s（Mac）**、p95 为 **1.99 s / 1.98 s**，落在提案的 p50 ≤ 2 s / p95 ≤ 5 s 内。
- 若定义为「首个正文 content token」，p50 为 **1.91 s / 2.06 s**、p95 为 **3.45 s / 3.28 s**；WSL p50 在 2 s 内，Mac 略超 2 s，p95 在 5 s 内。
- 若定义为「渲染器首个可见正文」，p50 为 **2.20 s / 2.87 s**、p95 为 **2.89 s / 3.12 s**；p95 在 5 s 内，但 p50 已超过 2 s。**因此不能声称首 token SLO 已达成**；更稳妥的做法是把口径写清，并把可见正文的 p50 提案上调到 3 s，或保留 2 s 但把它限定为首个流式块。
- UI 固定开销存在明显平台差异（WSL 约 121 ms，Mac 约 554 ms，约 4.6 倍）；它包含启动页点击 → 工作区挂载/会话建立 → IPC → 网关 → 回传，而不是模型时间。优化首 token时，Mac 上应先看这段固定开销。
- 网关固定开销约 3 ms，SSE/解析不是瓶颈；真实首 token 的主要变量是模型思考时间与产品 prompt/tools 上下文。

## 限制

- **单一 macOS 机型/版本**：只有 2018 MacBook Pro + macOS 15.8.3，且运行时有背景负载；不能代表 Apple Silicon 或其他 macOS/Linux/Windows。
- **只测本机 Magpie**：无远端 DeepSeek/Command Code/OpenCode，也不含网络抖动、代理、DNS、Provider 限流；这些需要另立远端基线。
- **mock 上游是单形状**：固定 reasoning/content、无工具调用、无多轮、无长上下文；真实产品 UI 请求虽为 `tools: true`，mock 不按请求内容生成，因此 mock 只测固定链路开销。
- **渲染器脚本非人类**：点击与等待是脚本驱动的，不能产生 SUS/HEART 或真人决策时间；每进程只测一次首句，不覆盖会话复用、长会话、确认卡/工具链。
- **样本量有限**：渲染器每平台 3–10 个样本；p95 是粗分位数，没有置信区间；WSL/macOS 分开采集，不能直接做统计显著性比较。
- **测量隔离**：macOS 真实场景通过 localhost 反向 SSH 隧道访问 WSL 上的 Magpie；隧道只用于本机回环，不是远端网络基线。
- **不是 SLO 达成或外部基准成绩**：无外部对照，不能替代产品可用性、任务成功率或安全评估。

## 安全与边界

- mock 场景仅使用假 Key；真实场景 Key 只从环境变量进入探针进程，未写入文件或日志，也未提交到仓库。
- 原始 JSONL/汇总只落 `.scratch/evals/perf/`（gitignored）；卡内不包含 Key、会话内容或文件路径。
- 探针只改写 `globalThis.fetch` 的产品 provider origin 路由（探针进程内），不修改产品注册表或产品代码；真实主入口仍加载 `dist/main/main.js`。
