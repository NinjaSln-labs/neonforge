# 性能回归门（初版，2026-11-23）

> 性质：本地可执行的**回归上限**检查，不是 SLO、承诺值或 CI 门禁。
> 阈值来自 2026-11-22/23 的 mock/隔离基线，留约 2–4 倍余量；只用于同平台、同探针形状的纵向比较。

## 目的与范围

在不改产品代码、不读取真实凭据的前提下，串行运行已有产品级探针，检查首屏、空载内存、核心工具 p95 与 mock 首 token是否发生明显回退。

| 检查        | 探针                            | 样本（简化配置）                                 | 指标                                                        |
| ----------- | ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| startup     | `run-startup-benchmark.cjs`     | 3 冷 + 2 热                                      | 冷/热成功数、冷启动首屏 p95、冷启动工作集中位数、冷 PSS p95 |
| tools       | `run-tool-benchmark.cjs`        | 1 进程 × 20 次/工具（3 次预热）                  | read/search/write/edit/bash p95 与失败数                    |
| first-token | `run-first-token-benchmark.cjs` | 3 进程 × 5 网关迭代 + 3 次渲染器，mock 0 ms 上游 | 网关首流式块 p95、渲染器首个可见正文 p95、失败数            |

- 长会话内存未纳入初版门：10–120 分钟窗口成本高，且短窗口内存噪声大；沿用证据卡人工复核。
- 真实 Provider/网络、审批等待、任务成功率不在本门范围。

## 阈值（2026-11-23 初版）

| 指标                          | Linux（WSL2+xvfb） | macOS（单一 2018 MBP） | 依据基线（p95 或中位数）           |
| ----------------------------- | -----------------: | ---------------------: | ---------------------------------- |
| 冷启动首屏 p95                |          ≤ 2000 ms |              ≤ 4000 ms | WSL 512 / Mac 1344 ms              |
| 冷启动工作集中位数            |           ≤ 900 MB |               ≤ 700 MB | WSL 约 515 / Mac 315 MB            |
| 冷启动总 PSS p95              |           ≤ 600 MB |                   跳过 | WSL 约 273 MB；macOS 无 PSS        |
| read/search p95               |            ≤ 40 ms |               ≤ 300 ms | WSL 9.6/6.9 / Mac 66.9/85.9 ms     |
| write/edit p95                |           ≤ 100 ms |               ≤ 800 ms | WSL 23.4/26.9 / Mac 221.7/235.5 ms |
| bash p95                      |            ≤ 50 ms |               ≤ 300 ms | WSL 11.7 / Mac 73.2 ms             |
| 网关首流式块 p95（mock 0 ms） |           ≤ 100 ms |               ≤ 300 ms | 固定开销约 3–8 ms                  |
| 渲染器首个可见正文 p95        |          ≤ 1000 ms |              ≤ 2500 ms | WSL 127 / Mac 577 ms               |

- 工具失败数必须为 0；冷启动成功数必须为 3、热启动为 2、首 token 进程为 3。
- macOS 工作集含共享页，不能与 Linux PSS 直接比较；PSS 指标在 macOS 记为 SKIP。

## 运行结果（2026-11-23）

同一天在 WSL 与 Mac 各跑两轮，全部 3/3 检查通过。下表取第二轮（最终配置，含热启动检查）：

| 平台 | 冷首屏 p95 | 工作集中位 | PSS p95 | tools read/search/write/edit/bash p95 | 网关首块 p95 | 渲染器正文 p95 | 结果             |
| ---- | ---------: | ---------: | ------: | ------------------------------------- | -----------: | -------------: | ---------------- |
| WSL  |   487.8 ms |     515 MB |  273 MB | 9.5 / 6.4 / 24.2 / 24.3 / 11.0 ms     |       4.4 ms |       127.3 ms | PASS（3/3 检查） |
| Mac  |  1330.1 ms |     315 MB |    SKIP | 87.1 / 83.3 / 236.2 / 223.8 / 71.8 ms |       4.4 ms |       594.8 ms | PASS（3/3 检查） |

- 首轮（启动/工具检查加入热启动前）WSL 冷首屏 p95 517.7 ms、Mac 1333.0 ms；两轮波动在 10% 内。
- 两平台全部指标通过，0 工具失败、0 首 token 失败；数值与既有基线同量级。
- 样本量小于正式基线（冷启动 3 vs 20、工具 20 vs 90、首 token 15 vs 50），p95 的统计稳定性较弱，因此阈值留了较大余量。

## 用法

```bash
# 仓库根；默认按当前平台选阈值
node evals/perf/run-perf-regression-gate.cjs

# 只跑部分检查 / 查看将执行的命令
node evals/perf/run-perf-regression-gate.cjs --only startup,tools
node evals/perf/run-perf-regression-gate.cjs --dry-run

# 显式平台（跨平台机器上仅在确认探针形状一致时使用）
node evals/perf/run-perf-regression-gate.cjs --host darwin
```

- 退出码：`0` 全部通过；`1` 指标超限或检查运行失败；`2` 参数/环境错误。
- 报告写 `.scratch/evals/perf/perf-gate-<时间戳>/report.json`（gitignored），不进入仓库。
- 子进程环境在启动前剔除凭据类变量；全部场景使用假 Key 与本地 mock，不发起外部模型调用。

## 限制

- **阈值是回归上限，不是 SLO**：超过阈值说明“与既有基线相比可能回退”，通过阈值不证明满足用户体验目标。
- **环境绑定**：WSL 有 `xvfb`/软件渲染，Mac 有默认 GPU 与后台负载；换机器、换显示或换后台负载都可能需要重定阈值。
- **无 CI 接入**：初版只提供本地命令与 JSON 报告，尚未接入持续集成或发布门禁。
- **样本少**：简化配置的 p95 接近最大值，长尾波动可能造成偶发失败；需结合 `--only` 复跑与原始 JSONL 判读。
- **场景窄**：仅启动页、固定小 fixture 工具、mock 短回复；不含真实模型、工具审批、网络、大项目或长会话。
- **非人类**：脚本驱动，不产生 SUS/HEART 或真人审批数据。

## 安全与边界

- 没有真实凭据进入探针；`NEONFORGE_*` 与假 Key 仅存在于隔离进程/临时目录。
- 原始数据与报告只在 `.scratch/`（gitignored）；不包含用户文件或真实会话。
- 不改产品代码、注册表或 Provider 配置；探针内仅重写固定 Provider origin 的 `fetch` 路由。

## 关联

- 启动基线：`baselines/2026-11-22-product-startup-baseline.md`、`baselines/2026-11-22-macos-startup-baseline.md`
- 工具基线：`baselines/2026-11-22-product-tool-execution-baseline.md`、`baselines/2026-11-22-macos-tool-baseline.md`
- 首 token 基线：`baselines/2026-11-22-product-first-token-baseline.md`
- 长会话基线：`baselines/2026-11-23-long-session-memory-baseline.md`
- 计划：`../slo-and-performance-plan-2026-11-19.md`
