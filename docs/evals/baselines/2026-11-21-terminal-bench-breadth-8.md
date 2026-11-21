# 证据卡：Terminal-Bench 2.0 第八批四任务广度（2026-11-21）

> 本卡记录 Terminal-Bench 2.0 的**第八批广度**：剩余 4 个可运行任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前几批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `4236ac0`（main，第七批广度证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 4 个任务 × 1 次尝试，共 4 trials；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 18:36:30 → 19:28:16（51m46） |
| 沙箱 | 专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket；运行前清理旧镜像释放约 26 GB |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **713,835 输入 / 16,057 输出**（3 个异常 trial 无用量汇总，实际更高；自定义 agent 不报缓存） |

## 任务列表

`caffe-cifar-10`、`compile-compcert`、`install-windows-3.11`、`mteb-leaderboard`。

未运行：`mteb-retrieve`。其镜像 `alexgshaw/mteb-retrieve:20251031` 此前在 600/900/1200/2400 秒拉取中均超时，最后停留在同一大层 `420d334c0bc9: Pulling fs layer`；本批仍无法取得可用镜像，**不计入模型分数，也不计入已评估任务数**。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `caffe-cifar-10` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 13m20s | 单条命令超过 300 秒上限 |
| `compile-compcert` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 9m36s | 单条命令超过 300 秒上限 |
| `install-windows-3.11` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 13m38s | 单条命令超过 300 秒上限 |
| `mteb-leaderboard` | 验证失败 | 0.0 | 713,835 / 16,057 | 40 | 9m44s | 无异常；达到 40 轮上限 |

### 汇总

- **4 个任务逐项分类**：0 通过、1 个有效 0.0、3 个异常（均为 300 秒单命令超时；Harbor `RuntimeError`）。
- **有效模型通过率**：0/1 = 0.0%（排除 3 个异常）；异常按 0 为 0/4 = 0.0%，与 Harbor mean 0.000 一致。
- 总 token：713,835 输入 / 16,057 输出；3 个异常 trial 的用量未汇总，实际更高；无缓存计数。
- 累计已评估任务：前七批 84 + 第八批 4 = **88/89** 个任务；`mteb-retrieve` 未评估，不计入；不同批次的任务不合并计算总体通过率。

## 追加：3 个异常任务的 600 秒重跑（`tbench2-breadth-8-timeout600`）

对 3 个异常任务各 1 次重跑，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。19:28:53 → 20:01:38 UTC（32m44），1 异常。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `caffe-cifar-10` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 17m48s | 仍超过 600 秒单命令上限 |
| `compile-compcert` | 通过 | 1.0 | 428,540 / 9,179 | 34 | 15m17s | 600 秒下干净通过 |
| `install-windows-3.11` | 验证失败 | 0.0 | 782,129 / 20,445 | 40 | 11m35s | 无异常；达到 40 轮上限；验证器 5m09s |

- **结果**：1/3 通过、1 个有效 0.0、1 个异常；有效尝试 1/2 = 50.0%；异常按 0 为 1/3 = 33.3%。
- **解读**：`compile-compcert` 的 300 秒失败是单命令预算限制，600 秒下干净通过；`install-windows-3.11` 600 秒下无异常但达到 40 轮上限，属有效 0.0；`caffe-cifar-10` 即使 600 秒仍超时，需更长上限或不同 agent/策略。
- 总 token：1,210,669 输入 / 29,624 输出。这是**新配置**的单独重跑，不能混入第八批 300 秒的 0/4 或 0/1。

## 追加：2 个有效 0.0 任务的 3 次重复（300 秒 / 600 秒配置）

对第八批 2 个有效 0.0 任务各做 3 次重复，使用各自此前有效 0.0 时的配置：`mteb-leaderboard` 用 300 秒基准配置，`install-windows-3.11` 用 600 秒配置；2 并发、40 轮。

| 任务 | 配置 | 3 次结果 | 命令数 | Agent 用时 | 输入 / 输出 tokens |
|------|------|----------|--------|----------|-------------------|
| `mteb-leaderboard` | 300 秒 | 3 × 有效 0.0 | 8 / 40 / 39 | 1m49s / 8m17s / 13m06s | 合计 1,863,852 / 35,542 |
| `install-windows-3.11` | 600 秒 | 3 × 有效 0.0 | 39 / 41 / 40 | 10m05s / 9m14s / 9m47s | 合计 2,276,951 / 62,926 |

- `mteb-leaderboard` 重复 job：22:57:56 → 23:11:32 UTC（13m36）；3 trials，0 异常，Harbor mean 0.000。
- `install-windows-3.11` 重复 job：23:12:16 → 23:33:53 UTC（21m36）；3 trials，0 异常，Harbor mean 0.000。
- **汇总**：6 trials、0 通过、0 异常；两个任务的有效 0.0 均稳定复现。
- **解读**：`mteb-leaderboard` 的失败并不总是达到 40 轮——一次仅 8 条命令、1m49s 即 0.0，另两次为 40/39 条命令；`install-windows-3.11` 在 600 秒下三次均为 39-41 条命令的有效 0.0，说明此前 40 轮上限是主要限制之一，但延长单命令预算并未带来通过。
- 这是**分任务配置**的重复，不能与第八批初轮 300 秒的 0/4 或 600 秒重跑的 1/3 合并为总体通过率。

## 追加：`caffe-cifar-10` 的 1200 秒与 2400 秒重跑

`caffe-cifar-10` 在 300 秒与 600 秒均为命令超时；继续放宽单命令预算：

| 配置 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| 1200 秒（`tbench2-caffe-timeout1200`） | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 47m03s | 仍 `Command timed out after 1200 seconds` |
| 2400 秒（`tbench2-caffe-timeout2400`） | 验证失败 | 0.0 | 1,954,693 / 20,364 | 58 | 54m37s | 无异常；验证器 20 秒；job 55m12 |

- 1200 秒 job：23:36:48 → 2026-11-21T00:24:24 UTC（47m35）。
- 2400 秒 job：2026-11-21T00:25:06 → 01:20:18 UTC（55m12）。
- **解读**：300/600/1200 秒均为单命令超时；2400 秒下执行完成（58 条命令）但验证器 0.0，说明该任务不只是单命令预算问题，需要不同 agent/策略或任务特定分析；单纯继续加预算没有带来通过。
- 这是**新配置**的单独重跑，不能与第八批 300 秒的 0/4 或 600 秒的 1/3 合并。

## 追加：40 轮上限任务的 60 轮 + 600 秒对照（`tbench2-b8-iter60-600`）

`mteb-leaderboard` 与 `install-windows-3.11` 此前在 40 轮附近失败；用 60 轮 + 600 秒单命令做新配置对照（2 并发、各 1 次尝试）。01:52:04 → 02:08:34 UTC（16m29），0 异常。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `mteb-leaderboard` | 验证失败 | 0.0 | 2,283,343 / 23,216 | 59 | 15m29s | 无异常；验证器 31s；仍达到新轮次上限 |
| `install-windows-3.11` | 验证失败 | 0.0 | 1,814,189 / 32,734 | 60 | 15m23s | 无异常；验证器 54s；仍达到新轮次上限 |

- 另有一次 `mteb-leaderboard` 60 轮 + 300 秒的初步对照：`RuntimeError: Command timed out after 300 seconds`（agent 27m12，无 reward），说明放宽轮次后单命令预算先成为瓶颈；不进入干净比较。
- **解读**：60 轮 + 600 秒下两个任务都跑满 59/60 条命令仍为 0.0，说明失败不只是“40 轮上限”；单纯增加轮次或单命令预算不能解决，需要不同 agent/策略或任务特定分析。
- 这是**新配置**对照，不能与第八批 300 秒的 0/4、600 秒重跑的 1/3 或 3 次重复合并。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `caffe-cifar-10` | `RuntimeError: Command timed out after 300 seconds`，agent 13m20s 结束 | 单条命令超过 300 秒配置上限 | 否（agent 配置限制） |
| `compile-compcert` | `RuntimeError: Command timed out after 300 seconds`，agent 9m36s 结束 | 单条命令超过 300 秒配置上限 | 否（agent 配置限制） |
| `install-windows-3.11` | `RuntimeError: Command timed out after 300 seconds`，agent 13m38s 结束 | 单条命令超过 300 秒配置上限 | 否（agent 配置限制） |
| `mteb-leaderboard` | 验证器 0.0，无异常；40 条命令，9m44s | 模型/agent 达到 40 轮上限且未完成任务；无轨迹 | 否（模型/agent 行为） |
| `mteb-retrieve` | 镜像多次拉取超时，停留同一大层，未进入环境 | 镜像拉取/网络基础设施限制 | 否（基础设施，未评估） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：实际仅 4 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **3 个异常都是 300 秒命令超时**：属 agent 单命令预算限制，不是模型能力结论；需按 600 秒或更长配置单独重跑。
- **`mteb-leaderboard` 是有效 0.0**：40 条命令达到轮次上限，属模型/agent 行为；无轨迹，不能给出逐命令根因。
- **`mteb-retrieve` 未评估**：镜像拉取基础设施限制，不计入 88/89。
- **样本小**：每任务 1 次；1 个有效 0.0 未重复；3 个异常任务仅按新配置重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第八批 4 个 Terminal-Bench 任务中 0/4 首次尝试通过；排除 3 个 300 秒命令超时异常后，唯一有效尝试为 0.0；累计评估 88/89 个任务。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 0.0% 与前几批直接比较或合并；不能把命令超时或镜像拉取失败归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：第八批 3 个异常任务已按 600 秒重跑（`compile-compcert` 通过，`install-windows-3.11` 为有效 0.0，`caffe-cifar-10` 仍超时）；`mteb-leaderboard`（300 秒）与 `install-windows-3.11`（600 秒）各 3 次重复均为有效 0.0；`mteb-leaderboard` 与 `install-windows-3.11` 在 60 轮 + 600 秒下仍跑满 59/60 条命令且为 0.0，轮次上限不是唯一原因；`caffe-cifar-10` 在 1200 秒仍超时、2400 秒执行完成但验证器 0.0，需不同 agent/策略或任务特定分析；`mteb-retrieve` 已完成补跑（89/89 覆盖）。
