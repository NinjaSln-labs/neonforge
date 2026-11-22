# 证据卡：审批卡出现与脚本化批准（mock 渲染器，2026-11-22）

> **非人类数据**：批准动作由脚本在页面内 `button.click()` 触发，不包含真人看到卡片、理解风险、做出决定的时间；不能用于 SUS/HEART 或人类审批等待结论。
> 本卡也不是端到端产品延迟：使用 mock provider/bridge，排除模型与网络时延。

## 基本信息

| 字段     | 值                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 测量日期 | 2026-11-22（UTC 05:31）                                                                                                             |
| 产品代码 | `9e8ca1e`（main）                                                                                                                   |
| 测量脚本 | `evals/perf/run-renderer-ui-benchmark.cjs` + `apps/desktop/tests/perf/approval.perf.ts`（commit `89f64ca`）                         |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；Playwright Chromium headless（151.0.7922.34）           |
| 运行方式 | 1 个 Chromium 页面、1 个 Vite 实例；20 个连续审批周期；mock bridge + mock `tools.execute`                                           |
| 事件定义 | 审批卡出现：`__emit(write tool-call)` → `.nf-toolcall--need-approval` 出现在 DOM；批准往返：页面内点击「允许执行」→ 同一卡变为 done |
| 样本     | 20 个周期；页面内 `performance.now()`                                                                                               |
| 原始数据 | `.scratch/evals/perf/renderer-ui-2026-11-22T05-31-14-520Z.json`（gitignored）                                                       |

## 测量方法

- 通过 `apps/desktop/playwright.perf.config.ts` 启动真实 Vite 渲染器与 Chromium；`tests/perf/approval.perf.ts` 使用 `installMockBridge`。
- 先走“目标确认 → 执行确认”流程，使 `write` 工具卡进入 `need-approval`；之后再连续 20 次发送新消息并注入一个 `write` tool-call。
- 用 `MutationObserver` 在页面内记录：
  - 注入 tool-call 的 `performance.now()` → 首个 `.nf-toolcall--need-approval` 出现；
  - 脚本点击「允许执行」的 `performance.now()` → 同一工具卡变为 `.nf-toolcall--done`。
- mock `tools.execute` 在 `approved:false` 时返回 `needApproval:true`，在 `approved:true` 时立即返回成功；不经过真实 main/IPC/文件系统。
- 点击使用页面内 `button.click()`，避免 Playwright 协议往返进入测量。

## 结果

| 指标                               |         p50 |         p95 |    min |     max |
| ---------------------------------- | ----------: | ----------: | -----: | ------: |
| 审批卡出现（tool-call → DOM 可见） |  **7.9 ms** | **13.9 ms** | 2.3 ms | 13.9 ms |
| 脚本化批准往返（点击 → done）      | **19.4 ms** | **36.4 ms** | 6.2 ms | 36.4 ms |

- 20/20 周期完成，无失败/无缺失时间戳。
- 审批卡出现远低于 SLO 提案的“≤100 ms”；但该数值是渲染器 DOM 更新，不含模型生成 tool-call、IPC 或用户决策。
- 脚本化批准往返 19.4 ms 包含 mock `tools.execute`、React 状态更新、工具卡重渲染；不代表真人在授权卡上的操作时间。

## 解释

- 在 mock 输入下，审批卡从 tool-call 注入到 DOM 可见的 p50 约 8 ms、p95 约 14 ms；渲染器状态机与卡片挂载没有明显固定瓶颈。
- 脚本点击后到 done 的 p50 约 19 ms、p95 约 36 ms；其中包含 mock 执行与两次状态更新，不是文件系统或 IPC 延迟。
- 本卡可以支持“审批卡出现路径很快”的组件级结论；不能声称审批等待（人类决策）已达到 SLO，也不能把它当作端到端工具调用延迟。

## 限制

- **非人类**：脚本点击，不测用户阅读/理解/犹豫/误点；不可用于可用性研究或 SUS/HEART。
- **mock 渲染器**：不经过真实 Electron preload/IPC/main/ToolRegistry、文件系统或策略规则；mock 的 `tools.execute` 立即返回。
- **单一场景**：只测 `write` 卡的 `need-approval` 与单卡批准；未测合并授权、bash 高危、拒绝、允许并记住、信任模式或 delegate 边界。
- **平台**：Chromium headless + Vite，不是 macOS/Windows Electron 桌面 GPU 路径。
- **样本量**：20 次单页连续周期，可能受消息列表增长影响；无多页面/多机对比。
- **不是 SLO 达成**：SLO 提案面向真实产品与目标机；本卡只覆盖一个渲染器路径。

## 安全与边界

- 使用 mock bridge，不读取真实凭据、文件或会话；Vite/Chromium 进程的敏感环境变量在运行器启动前剔除。
- 原始 JSON 只落 `.scratch/`（gitignored）；未上传任何内容。
