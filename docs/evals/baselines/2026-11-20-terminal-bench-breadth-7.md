# 证据卡：Terminal-Bench 2.0 第七批十任务广度（2026-11-20）

> 本卡记录 Terminal-Bench 2.0 的**第七批广度**：10 个未测任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前几批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `9f06a00`（main，第六批广度证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 09:09:36 → 10:47:03（1h37m26） |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **10,978,401 输入 / 301,059 输出**（异常 `torch-pipeline-parallelism` 无用量汇总，实际更高；自定义 agent 不报缓存） |

## 任务列表

`build-pov-ray`、`protein-assembly`、`reshard-c4-data`、`rstan-to-pystan`、`sam-cell-seg`、`schemelike-metacircular-eval`、`torch-pipeline-parallelism`、`torch-tensor-parallelism`、`tune-mjcf`、`video-processing`。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `build-pov-ray` | 通过 | 1.0 | 1,531,993 / 15,107 | 40 | 6m59s | — |
| `protein-assembly` | 验证失败 | 0.0 | 1,263,666 / 44,836 | 39 | 21m50s | 无异常 |
| `reshard-c4-data` | 通过 | 1.0 | 752,648 / 40,103 | 22 | 9m33s | — |
| `rstan-to-pystan` | 通过 | 1.0 | 673,743 / 17,435 | 38 | 23m03s | — |
| `sam-cell-seg` | 验证失败 | 0.0 | 1,357,288 / 45,880 | 43 | 22m57s | 无异常 |
| `schemelike-metacircular-eval` | 验证失败 | 0.0 | 2,188,883 / 52,376 | 38 | 13m35s | 无异常 |
| `torch-pipeline-parallelism` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 5m57s | 单条命令超过 300 秒上限 |
| `torch-tensor-parallelism` | **VerifierTimeoutError** | None（异常） | 494,221 / 26,049 | 29 | 12m45s | Agent 完成执行；验证器超过默认 900 秒 |
| `tune-mjcf` | 通过 | 1.0 | 323,511 / 12,106 | 22 | 12m38s | — |
| `video-processing` | 验证失败 | 0.0 | 2,392,448 / 47,167 | 42 | 12m45s | 无异常 |

### 汇总

- **10 个任务逐项分类**：4 通过、4 个有效 0.0、2 个异常（1 个 300 秒单命令超时、1 个验证器 900 秒超时）。
- **有效模型通过率**：4/8 = **50.0%**（排除 2 个异常）；异常按 0 为 4/10 = 40.0%。
- Harbor 控制台显示 9 trials / 2 exceptions / mean 0.444（按 9 个计分 trial 计算）；逐 trial 目录共 10 个，其中 2 个异常无有效 reward。本卡分类以逐 trial 结果为准。
- 总 token：10,978,401 输入 / 301,059 输出；异常 `torch-pipeline-parallelism` 无用量汇总，实际更高；无缓存计数。
- 累计已评估任务：前六批 74 + 第七批 10 = **84/89** 个任务；不同批次的任务不合并计算总体通过率。

## 追加：2 个异常任务的 600 秒 + verifier ×4 重跑（`tbench2-breadth-7-recover2`）

对第七批 2 个异常任务各 1 次重跑：`NEONFORGE_COMMAND_TIMEOUT_SEC=600`、`--verifier-timeout-multiplier 4`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。17:55:12 → 18:32:27 UTC（37m15），0 异常。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `torch-pipeline-parallelism` | 验证失败 | 0.0 | 1,358,764 / 42,414 | 39 | 25m03s | 600 秒下无异常；验证器 11m59s |
| `torch-tensor-parallelism` | 通过 | 1.0 | 1,057,008 / 38,114 | 29 | 13m33s | verifier ×4 后验证器 11m26s 完成 |

- **结果**：1/2 通过、0 异常；有效尝试 1/2 = 50.0%。
- **解读**：`torch-pipeline-parallelism` 的 300 秒失败是单命令预算限制，600 秒下完成执行但验证器 0.0；`torch-tensor-parallelism` 的验证器 900 秒超时由 `verifier-timeout-multiplier 4` 解决，干净通过。这是**新配置**的单独重跑，不能混入第七批 300 秒的 4/10 或 4/8。
- 总 token：2,415,772 输入 / 80,528 输出。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `torch-pipeline-parallelism` | `RuntimeError: Command timed out after 300 seconds`，agent 5m57s 结束 | 单条命令超过 300 秒配置上限 | 否（agent 配置限制） |
| `torch-tensor-parallelism` | Agent 12m45s 完成 29 条命令；验证器启动后 900 秒超时（`Verifier execution timed out after 900.0 seconds`），reward 为 None | 验证器默认 900 秒预算不足；新配置以 `--verifier-timeout-multiplier 4` 重跑 | 否（harness/验证器预算限制，非模型失败） |
| `protein-assembly` | 验证器 0.0，无异常；39 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `sam-cell-seg` | 验证器 0.0，无异常；43 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `schemelike-metacircular-eval` | 验证器 0.0，无异常；38 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `video-processing` | 验证器 0.0，无异常；42 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：实际仅 10 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **新增验证器超时异常**：`torch-tensor-parallelism` 的 `VerifierTimeoutError` 发生在验证器阶段，不是模型执行失败；需按 `verifier-timeout-multiplier` 配置单独重跑，不能直接算作模型 0.0。
- **异常不是模型分数**：`torch-pipeline-parallelism` 的 300 秒命令超时是 agent 配置限制；其验证器随后也结束，但 reward 已因异常无效。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：每任务 1 次；4 个有效 0.0 未重复；2 个异常任务仅按新配置重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第七批 10 个 Terminal-Bench 任务中 4/10 首次尝试通过；排除 2 个异常后，有效尝试 4/8 = 50.0%；累计评估 84/89 个任务。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 50.0% 或 40.0% 与前几批直接比较或合并；不能把命令超时或验证器超时归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：第七批 2 个异常已按 600 秒单命令 + `verifier-timeout-multiplier 4` 重跑（`torch-tensor-parallelism` 通过，`torch-pipeline-parallelism` 无异常但验证器 0.0）；对 4 个有效 0.0（`protein-assembly`、`sam-cell-seg`、`schemelike-metacircular-eval`、`video-processing`）各增加重复或分析测试断言；继续评估剩余 5 个任务（`caffe-cifar-10`、`compile-compcert`、`install-windows-3.11`、`mteb-leaderboard`、`mteb-retrieve`，后者需先解决镜像拉取）。
