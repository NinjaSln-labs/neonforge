# 证据卡：Terminal-Bench 2.0 十任务广度批次（2026-11-19）

> 本卡记录 Terminal-Bench 2.0 的**广度批次**：10 个未在 pilot/扩展批次出现过的任务，每任务 1 次尝试。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，也不能与 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `a332619`（main，pilot 重复证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器 v0：`prompt=none`、`tolerantArgs=1`、请求超时 900 秒 |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个新任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-19；job 12:37:56 → 13:43:17（1h05m21s） |
| 沙箱 | 与 pilot 相同的专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 凭据 | 仅宿主适配器进程持有 Magpie Key；VM、任务容器与验证容器不持有 |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token 4,241,929 输入 / 166,884 输出（自定义 agent 不报缓存） |

## 环境准备说明

首次尝试 `tbench2-breadth-10` 使用默认 600 秒 environment start timeout；`chess-best-move` 与 `write-compressor` 在镜像拉取/环境启动阶段出现 `EnvironmentStartTimeoutError`，未进入模型执行。随后预取 `write-compressor` 镜像并把 `--environment-build-timeout-multiplier` 提高到 4 重跑，得到本卡结果。首次的两个启动失败属于基础设施问题，不计入模型分数。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | 备注 |
|------|------|-------:|-------------------|-------:|------|
| `cobol-modernization` | 通过 | 1.0 | 1,086,127 / 51,904 | 41 | 长上下文；接近 40 轮上限 |
| `fix-git` | 通过 | 1.0 | 58,401 / 3,617 | 11 | — |
| `overfull-hbox` | 通过 | 1.0 | 163,183 / 12,320 | 14 | — |
| `sparql-university` | 通过 | 1.0 | 62,297 / 6,800 | 8 | — |
| `write-compressor` | 通过 | 1.0 | 128,346 / 19,626 | 10 | — |
| `git-multibranch` | 验证失败 | 0.0 | 372,984 / 18,941 | 24 | 验证器 `git_push.exp` 报 `expect: spawn id exp3 not open`，空仓库推送未完成 |
| `polyglot-rust-c` | 验证失败 | 0.0 | 416,566 / 26,165 | 19 | 目录中留下 `main`、`cmain` 编译产物；测试只允许 `main.rs` |
| `sanitize-git-repo` | 验证失败 | 0.0 | 1,954,025 / 27,511 | 64 | `test_no_other_files_changed` 中 `SHA ... could not be resolved`；重写历史时移除了对象 |
| `chess-best-move` | **RuntimeError** | 0.0（异常） | — | — | 单条命令超过 300 秒上限（pip/numpy 图像处理命令） |
| `circuit-fibsqrt` | **InternalServerError** | 0.0（异常） | — | — | 模型端点返回 `502 upstream request failed`，未完成评估 |

### 汇总

- **10 个任务逐项分类**：5 通过、3 个有效 0.0、2 个异常。
- **有效模型通过率**：5/8 = **62.5%**（排除 2 个异常）。
- Harbor 内置统计显示 9 trials、2 exceptions、mean 0.556；其 trial/exception 计数与原始 `result.json` 的 10 个任务不完全一致，本卡以上表的逐项分类为准，不引用该 mean 作为模型分数。
- 总 token：4,241,929 输入 / 166,884 输出；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 广度 10 = **25/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `chess-best-move` | `RuntimeError: Command timed out after 300 seconds` | 自定义 agent 单命令 300 秒上限；任务内 pip/numpy 图像处理耗时更长 | 否（agent 配置限制） |
| `circuit-fibsqrt` | `InternalServerError: Error code: 502 - upstream request failed` | 本机 Magpie/适配器上游错误；未完成模型评估 | 否（基础设施） |
| `git-multibranch` | `expect: spawn id exp3 not open`，验证器未能完成多分支 HTTPS 推送测试 | 模型实现/验证脚本交互；为任务验证失败，不是 harness 异常 | 否（模型/agent 行为） |
| `polyglot-rust-c` | 测试断言只允许 `main.rs`，实际发现 `main`、`cmain`、`main.rs` | 模型把编译产物留在交付目录 | 否（模型实现） |
| `sanitize-git-repo` | `SHA ... could not be resolved`；历史重写移除了测试引用的对象 | 模型清理历史时改变了仓库对象 | 否（模型实现） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：10 个新任务、每任务 1 次尝试、单 VM；不能与官方榜单或 pilot/扩展批次合并。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **异常不是模型分数**：`chess-best-move` 的 300 秒命令超时是 agent 配置；`circuit-fibsqrt` 的 502 是模型端点基础设施错误。两者都不应计入模型通过率。
- **有效 0.0 是模型/agent 行为**：三个验证失败均来自任务测试断言，不是 harness 崩溃；`git-multibranch` 的 `expect` 错误也可能与验证脚本环境有关，需重跑确认。
- **样本小**：每任务仅 1 次，不能估计总体通过率或置信区间；任务难度差异大，跨批次平均无意义。
- **产品能力未覆盖**：本卡没有运行 NeonForge Electron UI、真实审批或真实工具注册表。

## 结论

- **可用结论**：自定义最小 agent 在 10 个新 Terminal-Bench 任务中 5/8 有效评估通过（62.5%）；5 个任务干净通过，3 个任务出现可归因于模型/agent 实现的验证失败，2 个任务因配置/基础设施异常未完成评估。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 62.5% 当作模型总体能力；不能把 300 秒命令超时或 502 上游错误当作模型失败；不能把结果归因于 NeonForge 产品审批/工具链。
- **下一步**：对 3 个有效失败任务做重复运行以区分模型波动与实现错误；修正单命令超时并作为新配置重跑 `chess-best-move`；排查 `circuit-fibsqrt` 的 502 上游；继续扩大任务覆盖；`gpt2-codegolf` 仍需更长超时/轮次预算的单独评估。
