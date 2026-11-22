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

## 审批卡 UI 基准（mock，非人类）

```bash
node evals/perf/run-renderer-ui-benchmark.cjs --cycles 20
```

- 通过 `apps/desktop/playwright.perf.config.ts` 启动 Vite 渲染器 + Chromium；`tests/perf/approval.perf.ts` 使用 mock bridge。
- 先用“目标确认 → 执行确认”进入可授权状态，再连续注入 `write` tool-call。
- `MutationObserver` 记录 tool-call → `.nf-toolcall--need-approval` 出现；页面内脚本 `button.click()` 记录点击 → `.nf-toolcall--done`。
- **非人类数据**：不含阅读/理解/犹豫/误点，不能用于 SUS/HEART 或人类审批等待结论。
- 不经过真实 Electron preload/IPC/main/文件系统；mock `tools.execute` 立即返回。

## 首 token 基准

```bash
# mock 上游（无需真实 Key）：3 进程 × 每进程 8 次网关迭代 + 每进程 1 次渲染器首句
node evals/perf/run-first-token-benchmark.cjs --mode mock --delay-ms 0 --runs 3 --iterations 8

# 注入固定 800 ms 上游延迟（只测 UI/网关固定开销的可加性）
node evals/perf/run-first-token-benchmark.cjs --mode mock --delay-ms 800 --runs 3 --iterations 5

# 真实本机 Magpie（Key 只从环境变量进入，不写文件）
MAGPIE_GATEWAY_KEY=... node evals/perf/run-first-token-benchmark.cjs --mode real --runs 10 --iterations 5

# 远端 DeepSeek 官方 API（真实网络；默认模型由产品 /models 档位解析）
DEEPSEEK_API_KEY=... node evals/perf/run-first-token-benchmark.cjs --mode remote --runs 10 --iterations 5
DEEPSEEK_API_KEY=... node evals/perf/run-first-token-benchmark.cjs --mode remote --remote-model deepseek-v4-pro
```

- `first-token.cjs` 在主进程内直接调用真实 `dist/main/gateway.js`，记请求开始 → 首个 reasoning/content/`done` 回调。
- `first-token-renderer.cjs` 脚本化走启动页「从零开始」→ `initialPrompt` 自动发送 → `gateway:stream-chat`，用 `MutationObserver` 记首个可见正文；**脚本驱动，非人类研究**。
- mock 场景用本机 OpenAI 兼容 SSE 服务，探针进程内只改写三个产品 provider 固定 origin 的 `fetch` 路由；不改产品代码/注册表。
- 真实场景指向 `http://127.0.0.1:3425/v1` 的本机 Magpie；跨机时需自行建立 localhost 隧道，不把远端网络混入本机基线。
- 远端场景 `--mode remote` 不改写 `fetch`，走产品 descriptor 的真实 API；`--remote-model` 可显式指定模型（默认留空由产品 `/models` 档位解析）；`--key-env` 可换凭据环境变量名。
- 结果必须写清口径：首流式块（reasoning/content 任一）、首个 content 块、渲染器首个可见正文。
- 数据只写 `.scratch/evals/perf/first-token-*.jsonl` 与 `first-token-*-summary.json`。

## 长会话内存基准

```bash
# 30 分钟（默认）：1 进程、每分钟采样并发送一轮，mock 上游
node evals/perf/run-long-session-benchmark.cjs --minutes 30

# 120 分钟，显式采样/轮次间隔与输出路径
node evals/perf/run-long-session-benchmark.cjs --minutes 120 --sample-ms 60000 --out .scratch/evals/perf/run.jsonl
```

- `long-session.cjs` 加载真实 `dist/main/main.js`，隔离 `userData`/`HOME`/`XDG`，假 Key + 本机 mock SSE（默认每轮 60 块 ×120 字符 ≈ 7.2 KB）。
- 启动页首句 → 「从零开始」→ `initialPrompt` 自动发送第 1 轮；之后每分钟在真实 composer 填入第 N 轮并点发送，等待产品自身 `done` chunk（最多 60 s；连续 3 轮失败中止）。
- 每分钟采样：`app.getAppMetrics()` 各进程 working set、Linux `/proc/<pid>/smaps_rollup` PSS（macOS 无 PSS）、主进程 RSS/heap、渲染器 `performance.memory`、DOM 消息数/正文字符、`localStorage` 体积、主/渲染器事件循环延迟。
- 产品压缩（`history.length > 100`）与 `SESSION_MAX = 50` 会被真实触发；结论必须同时给行前/行后分段斜率，避免只看首尾差值。
- **脚本驱动，非人类研究**；mock 短消息不带工具、文件上下文或 reasoning。
- 数据只写 `.scratch/evals/perf/long-session-*.jsonl` 与 `long-session-*-summary.json`。

## 性能回归门

```bash
node evals/perf/run-perf-regression-gate.cjs              # 串行跑启动/工具/mock 首 token
node evals/perf/run-perf-regression-gate.cjs --only startup,tools
node evals/perf/run-perf-regression-gate.cjs --dry-run    # 只打印将执行的命令
```

- 按当前平台（可用 `--host` 显式指定）选择阈值；退出码 `0` 通过、`1` 超限/运行失败、`2` 参数错误。
- 阈值是 2–4 倍余量的**回归上限**，不是 SLO；样本少于正式基线，仅同平台同探针形状可用。
- 报告写 `.scratch/evals/perf/perf-gate-<时间戳>/report.json`；全部场景用假 Key 与本地 mock，不发起外部模型调用。
- 详见 `docs/evals/perf-regression-gate-2026-11-23.md`。

## 限制

- 头部启动数字是 **headless + 软件渲染 + xvfb**，不等于 macOS/Windows 桌面 GPU 路径；只作同环境纵向对比。
- 冷启动的“冷”仅指应用用户数据为空，不清理操作系统文件缓存；首次构建后首次运行通常更慢，需单独记录。
- 假 Key 会进入启动页，不进入配置/工作区；启动基准未覆盖项目打开或会话流式输出。
- 工具基准是**主进程 ToolRegistry 内部耗时**；端到端基准增加渲染器 IPC，但两者都不含审批卡显示/点击等待。
- fixture 很小且文件缓存已热，不代表大文件、冷缓存、并发或网络工具。
- 首 token 只测本机 Magpie（`opendesign/deepseek-v4.1-flash-eco`）、远端 DeepSeek flash/pro 与单一 macOS 机型；mock 上游形状固定，不含远端网络抖动、工具首轮或长上下文。
- 长会话只测 mock 短消息（无工具/文件上下文），WSL2+xvfb 与单一 2018 MacBook Pro；macOS 无 PSS，working set 含共享页。
- 回归门只覆盖启动/工具/mock 首 token，尚未接入 CI，且阈值与当前机型/负载绑定。
- 不是官方基准，也不代表用户感知的端到端时延。
