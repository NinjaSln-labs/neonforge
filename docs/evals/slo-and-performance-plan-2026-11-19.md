# 产品级 SLO 与性能测量计划（初版，2026-11-19）

> 性质：指标定义与测量计划，不是已验证的 SLO；已有 WSL2+xvfb 启动、主进程/端到端工具、mock 审批卡渲染与本地 Magpie 首 token 基线，长会话内存与真实用户数据仍无产品级基线。
> 关联：`governance-gap-assessment-2026-11-18.md` 第 2 项、`ai-risk-register-2026-11-19.md` R-12、`baselines/2026-11-22-product-startup-baseline.md`、`baselines/2026-11-22-product-first-token-baseline.md`。

## 1. 目标

- 给 NeonForge 桌面工作台建立可重复的产品级性能指标，而不是只引用模型/基准延迟。
- 指标优先本地采集、默认不上传云端；采集需用户同意并说明保留期限。
- 先建基线，再定 SLO 阈值；本文的阈值只是**待验证提案**。

## 2. 指标定义

| 指标          | 定义                                   | 采集点                                | 现状                                                                                               |
| ------------- | -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 冷启动时间    | 进程启动到主窗口可交互                 | Electron main 时间戳 + renderer ready | 已有 WSL2+xvfb 与 macOS 目标机基线（20 冷 + 10 热；单一 MacBook）                                  |
| 首 token 延迟 | 用户发送到首个流式 token               | renderer 请求时间 → gateway 首块      | 已有 WSL2+xvfb 与单一 macOS 目标机基线（口径：首流式块 p50 1.52/1.60 s；可见正文 p50 2.20/2.87 s） |
| 工具执行延迟  | 工具调用进入到结果返回                 | ToolRegistry 执行前后                 | 已有 WSL2+xvfb 与 macOS 主进程内/渲染器 IPC 基线（macOS read p95 66.7 ms / write 239.8 ms）        |
| 审批等待时间  | 授权卡出现到用户决定                   | renderer 授权卡事件                   | 仅 mock 渲染器脚本化事件（卡出现 p95 13.9 ms、点击→done p95 36.4 ms；**非人类**）                  |
| 空载启动内存  | 启动页可见后各进程 PSS/RSS             | Electron 进程指标 + `/proc` PSS       | 已有 WSL2+xvfb 基线（约 272 MB PSS）                                                               |
| 长会话内存    | 30/60/120 分钟会话的 renderer/main RSS | Electron 进程指标                     | 未测                                                                                               |
| 任务成功率    | 目标确认 → 交付包 → 解决确认完成率     | timeline/状态机                       | 未测                                                                                               |
| 错误率        | 工具失败/模型失败/崩溃占比             | timeline + 日志                       | 未测                                                                                               |

## 3. 测量方法

- **冷启动**：在 macOS 目标机重复 20 次，记录 p50/p95；区分首次安装与热启动。2026-11-22 已先在 WSL2+xvfb 完成 20 冷 + 10 热的开发机基线（`baselines/2026-11-22-product-startup-baseline.md`），并在单一 MacBook Pro（macOS 15.8.3、默认 GPU）完成 20 冷 + 10 热目标机基线（`baselines/2026-11-22-macos-startup-baseline.md`）；其他 Mac 机型/版本仍未覆盖。
- **首 token**：本地 Magpie 与远端 DeepSeek 分开记录；流式与非流式分开；记录模型/Provider/日期。2026-11-22 已完成本地 Magpie 的网关/渲染器基线（mock 隔离上游 + 真实 Magpie；`baselines/2026-11-22-product-first-token-baseline.md`）；必须同时报告三种口径：首流式块、首个正文 content、渲染器首个可见正文。远端 Provider 与网络抖动仍未测。
- **工具延迟**：固定 fixture 项目，read/write/edit/search/bash 各 30 次；记录 p50/p95 与失败。2026-11-22 已完成主进程内基线（3 进程 × 30 次；`baselines/2026-11-22-product-tool-execution-baseline.md`）与渲染器 IPC 端到端基线（`baselines/2026-11-22-product-tool-ipc-baseline.md`），尚未覆盖审批卡等待与真实大项目。
- **审批等待**：受控用户研究或模拟点击；记录卡出现到决定的时间与误解点（与 SUS/HEART 共用）。2026-11-22 已完成 mock 渲染器的脚本化事件基线（`baselines/2026-11-22-product-approval-ui-baseline.md`；**非人类**），真实用户决策时间仍待受控研究。
- **长会话**：固定脚本 30/60/120 分钟，记录 RSS、事件循环延迟、工具失败。
- **任务成功率**：用固定任务集（目标/方案/授权/交付）做端到端运行；当前只有 L1/L3 测试，不是产品级任务成功率。

## 4. 待验证的 SLO 提案

| 指标               | 提案               | 说明                                                    |
| ------------------ | ------------------ | ------------------------------------------------------- |
| 冷启动 p95         | ≤ 3 秒             | macOS 目标机、热启动另计                                |
| 首 token p50 / p95 | ≤ 2 秒 / ≤ 5 秒    | 本地 Magpie；**口径必须写明**：首流式块 vs 首个可见正文 |
| 只读工具 p95       | ≤ 200 ms           | 固定 fixture                                            |
| 写入工具 p95       | ≤ 500 ms           | 含快照                                                  |
| 审批卡出现         | ≤ 100 ms           | renderer 事件到可见                                     |
| 崩溃率             | 0（每 100 次会话） | 先统计再定阈值                                          |

- 以上不是承诺值；基线采集后再调整。

## 5. 埋点与隐私

- 优先使用本地 timeline/日志与受控测试；不上传会话内容、文件路径或 Key。
- 如需匿名指标，必须明确字段、保留期限与退出方式。
- 性能日志与评估日志分开，避免把模型延迟混入产品指标。

## 6. 当前结论

- 已有：BFCL 单题延迟、AgentDojo 单题延迟、部分工具单测耗时；这些是模型/评估信号，不是产品 SLO。
- 已有（2026-11-22）：WSL2+xvfb 下真实 Electron 的冷/热启动与空载 PSS/IPC 基线；冷启动首屏 p50 449 ms / p95 512 ms，空载 PSS 约 272 MB。该数据不是 macOS 目标机，也不是 SLO 达成声明。
- 已有（2026-11-22）：5 个核心工具（read/search/write/edit/bash）的主进程内基线（WSL 与 macOS 各每工具 90 次、0 失败）；WSL read p95 9.6 ms、write 23.4 ms；macOS read 66.9 ms、write 221.7 ms。
- 已有（2026-11-22）：WSL 与 macOS 的同一 fixture `tools:execute` 端到端基线；WSL read p95 8.8 ms、write 24.0 ms；macOS read 66.7 ms、write 239.8 ms（`baselines/2026-11-22-macos-tool-baseline.md`）。macOS 固定开销约为 WSL 的 7–10 倍，但仍是小 fixture、热缓存。
- 已有（2026-11-22）：同一 fixture/tools:execute 路径的渲染器 IPC 端到端基线，每工具 90 次、0 失败；read p95 8.8 ms、write 24.0 ms、edit 23.6 ms、bash 10.7 ms。仍未覆盖审批卡等待、网络/MCP、大项目。
- 已有（2026-11-22，**非人类**）：mock 渲染器审批卡出现 p95 13.9 ms、脚本化批准往返 p95 36.4 ms（20 周期）；只代表 DOM 更新与 mock 执行，不代表真人决策时间。
- 已有（2026-11-22）：单一 MacBook Pro（macOS 15.8.3、i9-8950HK、默认 GPU）启动页 p50 1321 ms / p95 1344 ms（20 冷 + 10 热）；其他 Mac 机型/版本、项目/会话场景仍缺。
- 已有（2026-11-22）：本地 Magpie（`opendesign/deepseek-v4.1-flash-eco`）首 token 基线。网关路径首流式块 p50/p95 **1.52/1.99 s（WSL）**、**1.60/1.98 s（Mac）**；首个 content 块 **1.91/3.45 s**、**2.06/3.28 s**；渲染器首个可见正文 **2.20/2.89 s**、**2.87/3.12 s**。mock 0 ms 下 UI 固定开销 **121 ms（WSL）/ 554 ms（Mac）**，网关固定开销约 3 ms；首 content 块到 DOM 更新 p95 ≤ 2.4 ms。按「首流式块」口径落在提案内；按「可见正文」口径 p50 超出 2 s，**不能声称首 token SLO 达成**（`baselines/2026-11-22-product-first-token-baseline.md`）。
- 缺失：远端 Provider 首 token、真实用户审批等待、长会话内存、产品级任务成功率、多机型 macOS 矩阵。
- 下一步：补远端 Provider 首 token、真实审批卡端到端与长会话内存；未采到基线前不对外承诺 SLO。
