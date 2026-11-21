# 证据卡：Terminal-Bench 2.0 第六批九任务广度（2026-11-20）

> 本卡记录 Terminal-Bench 2.0 的**第六批广度**：计划 10 个未测任务，其中 `mteb-retrieve` 因镜像大层反复拉取失败而**未评估**；实际运行 9 个任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前几批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `02afdb9`（main，第五批广度证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 9 个任务 × 1 次尝试，共 9 trials（计划中的 `mteb-retrieve` 未进入运行）；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 06:54:16 → 07:48:31（54m14） |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **3,575,549 输入 / 215,088 输出**（自定义 agent 不报缓存；异常 trial 未汇总用量） |

## 任务列表与镜像问题

实际运行：`dna-insert`、`llm-inference-batching-scheduler`、`modernize-scientific-stack`、`portfolio-optimization`、`pytorch-model-cli`、`qemu-alpine-ssh`、`raman-fitting`、`train-fasttext`、`winning-avg-corewars`。

未运行：`mteb-retrieve`。其镜像 `alexgshaw/mteb-retrieve:20251031` 在 600、900、1200、2400 秒四次拉取中均超时，最后停留在同一大层 `420d334c0bc9: Pulling fs layer`，无可用镜像。该任务**不计入模型分数，也不计入已评估任务数**；这是镜像拉取/网络基础设施限制。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `dna-insert` | 验证失败 | 0.0 | 234,725 / 16,096 | 18 | 4m38s | 无异常 |
| `llm-inference-batching-scheduler` | 通过 | 1.0 | 1,135,309 / 85,687 | 27 | 18m54s | — |
| `modernize-scientific-stack` | 通过 | 1.0 | 24,322 / 5,130 | 6 | 1m19s | — |
| `portfolio-optimization` | 通过 | 1.0 | 73,948 / 11,202 | 8 | 4m13s | — |
| `pytorch-model-cli` | 验证失败 | 0.0 | 259,945 / 12,599 | 20 | 4m15s | 无异常 |
| `qemu-alpine-ssh` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 12m52s | 单条命令超过 300 秒上限 |
| `raman-fitting` | 验证失败 | 0.0 | 671,337 / 47,062 | 27 | 12m29s | 无异常 |
| `train-fasttext` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 10m17s | 单条命令超过 300 秒上限 |
| `winning-avg-corewars` | 验证失败 | 0.0 | 1,175,963 / 37,312 | 44 | 11m30s | 无异常 |

### 汇总

- **9 个任务逐项分类**：3 通过、4 个有效 0.0、2 个异常（均为 300 秒单命令超时）。
- **有效模型通过率**：3/7 = **42.9%**（排除 2 个异常）；异常按 0 为 3/9 = 33.3%，与 Harbor mean 0.333 一致。
- 总 token：3,575,549 输入 / 215,088 输出；两个异常 trial 的用量未汇总，实际更高；无缓存计数。
- 累计已评估任务：pilot 5 + 扩展 10 + 第一至第五批广度各 10 + 第六批 9 = **74/89** 个任务（`mteb-retrieve` 未评估，不计入）；不同批次的任务不合并计算总体通过率。

## 追加：2 个命令超时任务的 600 秒重跑（`tbench2-breadth-6-timeout600`）

对第六批 2 个异常任务单次重跑，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。07:49:16 → 08:27:28 UTC（38m11），1 异常。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `qemu-alpine-ssh` | 验证失败 | 0.0 | 1,393,627 / 33,292 | 37 | 13m58s | 无异常；300 秒超时是配置限制，600 秒下为有效 0.0 |
| `train-fasttext` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 35m47s | 仍超过 600 秒单命令上限 |

- **结果**：0/2 通过，1 个有效 0.0、1 个异常；有效尝试 0/1。
- **解读**：`qemu-alpine-ssh` 的 300 秒失败是单命令预算限制，600 秒下完成执行但验证器 0.0；`train-fasttext` 即使 600 秒仍超时，需要更长单命令上限、不同 agent/策略或任务特定分析。
- 总 token：1,393,627 输入 / 33,292 输出；这是**新配置**的单独重跑，不能混入第六批 300 秒的 3/9 或 3/7。

## 追加：4 个有效 0.0 的 3 次重复（`tbench2-b6zero-repeat-3x`）

对第六批 4 个有效 0.0 各做 3 次重复，300 秒基准配置、40 轮、2 并发（12 trials）。02:11:38 → 03:48:23 UTC（1h36m44），4 个 300 秒命令超时异常。

| 任务 | 3 次结果 | 干净有效 trials | 异常 | 通过 | 备注 |
|------|----------|----------------|------|------|------|
| `dna-insert` | 2 × 1.0、1 × 有效 0.0 | 3 | 0 | 2 | 26 / 27 / 20 条命令；6m41s / 21m13s / 12m48s；2,337,505 / 175,766 tokens |
| `pytorch-model-cli` | 3 × 有效 0.0 | 3 | 0 | 0 | 23 / 33 / 37 条命令；4m28s / 18m37s / 16m55s；1,346,598 / 67,462 tokens |
| `raman-fitting` | 1 × 有效 0.0、2 × RuntimeError | 1 | 2 | 0 | 有效 trial：34 条命令，24m49s，1,605,099 / 94,538 |
| `winning-avg-corewars` | 1 × 有效 0.0、2 × RuntimeError | 1 | 2 | 0 | 有效 trial：62 条命令，21m46s，2,184,569 / 82,292 |

### 汇总

- **12 trials**：2 × 1.0（均为 `dna-insert`）、10 × 0.0；Harbor mean 0.167。
- **干净有效尝试**：8 个（无异常）；干净通过 2/8 = **25.0%**。
- **异常**：4 个，均为 300 秒命令超时（`raman-fitting` 2、`winning-avg-corewars` 2）。
- **异常按 0**：2/12 = 16.7%。
- 总 token：7,473,771 输入 / 420,058 输出；4 个异常 trial 未汇总用量，实际更高。
- **解读**：`dna-insert` 初轮 0.0 是波动——重复中 2/3 干净通过；`pytorch-model-cli` 3/3 干净 0.0，失败稳定；`raman-fitting` 与 `winning-avg-corewars` 无干净通过且各出现 2 次命令超时，仍需更长预算或不同策略。
- 这是**相同 300 秒配置**的重复，不能与第六批初轮的 3/9 或 3/7 合并为总体通过率，只作各任务稳定性信号。

## 追加：`train-fasttext` 1200 秒重跑（`tbench2-train-fasttext-1200`）

`train-fasttext` 在 300 秒与 600 秒均为命令超时；继续放宽到 1200 秒（另加 verifier ×4）：

| 配置 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| 1200 秒（`tbench2-train-fasttext-1200`） | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 51m35s | 仍 `Command timed out after 1200 seconds` |

- Job：2026-11-21T05:05:54 → 06:00:18 UTC（54m23）。
- **解读**：300/600/1200 秒均为单命令超时；该任务需要 >1200 秒预算或不同 agent/策略，不能按现有配置判为模型失败。
- 这是**新配置**的单独重跑，不混入第六批 300 秒的 3/9 或 600 秒重跑结果。

## 追加：2 个任务的 600 秒 3 次重复（`tbench2-b6-600s-repeat-3x`）

`raman-fitting` 与 `winning-avg-corewars` 在 300 秒重复中各有 2 次命令超时；用 600 秒配置各重复 3 次（2 并发、40 轮）。11:00:33 → 11:49:00 UTC（48m27），3 个 600 秒命令超时异常。

| 任务 | 3 次结果 | 干净有效 trials | 异常 | 通过 | 备注 |
|------|----------|----------------|------|------|------|
| `raman-fitting` | 3 × RuntimeError | 0 | 3 | 0 | 三次均为 `Command timed out after 600 seconds` |
| `winning-avg-corewars` | 3 × 有效 0.0 | 3 | 0 | 0 | 39 / 43 / 40 条命令；8m33s / 16m31s / 7m14s；3,330,109 / 98,188 tokens |

- `winning-avg-corewars` 三个 trial 的 token 合计 3,330,109 / 98,188；`raman-fitting` 异常 trial 无用量汇总。
- **汇总**：6 trials、0 通过、3 个异常；干净有效尝试 3 个，均为 0.0。
- **解读**：`winning-avg-corewars` 的 300 秒超时主要来自单命令预算，600 秒下可完成但稳定 0.0；`raman-fitting` 即使 600 秒仍 3/3 超时，需要 >600 秒或不同 agent/策略。
- 这是**600 秒配置**的重复，不能与第六批 300 秒初轮的 3/9 或 3 次 300 秒重复合并。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `mteb-retrieve` | 镜像多次拉取超时，停留同一大层，未进入环境 | 镜像拉取/网络基础设施限制 | 否（基础设施，未评估） |
| `qemu-alpine-ssh` | 300 秒命令超时；600 秒下无异常但验证器 0.0（37 条命令） | 300 秒为配置限制；600 秒下为模型/实现失败 | 否（模型/agent 行为） |
| `train-fasttext` | 300 秒与 600 秒均为 `RuntimeError: Command timed out`（600 秒轮用时 35m47s） | 单条命令超过配置上限；600 秒仍不足 | 否（agent 配置限制） |
| `dna-insert` | 验证器 0.0，无异常；18 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `pytorch-model-cli` | 验证器 0.0，无异常；20 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `raman-fitting` | 验证器 0.0，无异常；27 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `winning-avg-corewars` | 验证器 0.0，无异常；44 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：实际仅 9 个任务、每任务 1 次尝试；`mteb-retrieve` 未评估；单 VM；不能与官方榜单或前几批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **任务选择与镜像可用性影响结果**：本批 3/7 有效通过，低于第三/四/五批；任务集合不同，且一个任务因镜像失败被排除，不能据此推断总体能力。
- **异常不是模型分数**：`qemu-alpine-ssh`、`train-fasttext` 的 300 秒超时是 agent 配置限制；600 秒重跑显示前者为有效 0.0、后者仍超时。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：每任务 1 次；4 个有效 0.0 未重复；2 个异常任务仅重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第六批 9 个可运行 Terminal-Bench 任务中 3/9 首次尝试通过；排除 2 个 300 秒命令超时异常后，有效尝试 3/7 = 42.9%；600 秒重跑显示 `qemu-alpine-ssh` 为有效 0.0、`train-fasttext` 仍超时；累计评估 74/89 个任务（`mteb-retrieve` 因镜像拉取失败未评估）。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 42.9% 或 33.3% 与前几批直接比较或合并；不能把命令超时或镜像拉取失败归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：4 个有效 0.0 已各做 3 次重复（干净有效 2/8；`dna-insert` 2/3 干净通过，`pytorch-model-cli` 3/3 稳定 0.0，`raman-fitting`/`winning-avg-corewars` 各有 2 次命令超时且无干净通过）；`qemu-alpine-ssh` 可按 600 秒配置重复；`train-fasttext` 在 1200 秒仍超时，需 >1200 秒或不同 agent/策略；`raman-fitting` 在 600 秒 ×3 仍 3/3 超时，需更长预算或不同 agent/策略；`winning-avg-corewars` 在 600 秒 ×3 为 3/3 有效 0.0（预算相关，稳定失败）；`mteb-retrieve` 已补跑通过，terminal-bench@2.0 达到 89/89 覆盖。
