# 证据卡：Terminal-Bench 2.0 第四批十任务广度（2026-11-20）

> 本卡记录 Terminal-Bench 2.0 的**第四批广度**：10 个未在 pilot/扩展/前三批广度出现过的任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前几批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `04459ba`（main，第三批 0.0 重复证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个新任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 02:29:46 → 03:09:42（39m56） |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **1,139,763 输入 / 69,228 输出**（自定义 agent 不报缓存；异常 trial 未汇总用量） |

## 任务列表

`bn-fit-modify`、`build-pmars`、`code-from-image`、`constraints-scheduling`、`dna-assembly`、`feal-differential-cryptanalysis`、`financial-document-processor`、`mcmc-sampling-stan`、`merge-diff-arc-agi-task`、`pytorch-model-recovery`。

镜像已全部预拉取；本批无 environment start timeout 或镜像拉取失败。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `bn-fit-modify` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 5m12s | 单条命令超过 300 秒上限 |
| `build-pmars` | 通过 | 1.0 | 276,085 / 5,340 | 17 | 2m46s | — |
| `code-from-image` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 9m47s | 单条命令超过 300 秒上限 |
| `constraints-scheduling` | 通过 | 1.0 | 41,097 / 5,643 | 6 | 1m19s | — |
| `dna-assembly` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 9m02s | 单条命令超过 300 秒上限 |
| `feal-differential-cryptanalysis` | 通过 | 1.0 | 163,230 / 19,373 | 11 | 4m31s | — |
| `financial-document-processor` | 通过 | 1.0 | 174,799 / 7,787 | 22 | 4m50s | — |
| `mcmc-sampling-stan` | 通过 | 1.0 | 128,815 / 7,432 | 16 | 11m02s | — |
| `merge-diff-arc-agi-task` | 通过 | 1.0 | 57,560 / 5,690 | 15 | 2m04s | — |
| `pytorch-model-recovery` | 通过 | 1.0 | 298,177 / 17,963 | 15 | 5m32s | — |

### 汇总

- **10 个任务逐项分类**：7 通过、0 个有效 0.0、3 个异常（均为 300 秒单命令超时）。
- **有效模型通过率**：7/7 = **100%**（排除 3 个异常）；异常按 0 为 7/10 = 70.0%，与 Harbor mean 0.700 一致。
- 总 token：1,139,763 输入 / 69,228 输出；三个异常 trial 的用量未汇总，实际更高；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 第一批广度 10 + 第二批广度 10 + 第三批广度 10 + 第四批广度 10 = **55/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）。

## 追加：3 个命令超时任务的 600 秒重跑（`tbench2-breadth-4-timeout600`）

对第四批 3 个异常任务单次重跑，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。03:10:32 → 03:44:06 UTC（33m34）。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `bn-fit-modify` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 10m14s | 仍超过 600 秒单命令上限 |
| `code-from-image` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 13m30s | 仍超过 600 秒单命令上限 |
| `dna-assembly` | 验证失败 | 0.0 | 1,997,220 / 83,797 | 37 | 21m20s | 无异常；300 秒超时是配置问题，600 秒下为纯模型/实现失败 |

- **结果**：0/3 通过，2 个异常、1 个有效 0.0；有效尝试（仅 `dna-assembly`）0/1。
- **解读**：`bn-fit-modify` 与 `code-from-image` 的阻塞不是 300 秒配置，而是单条命令本身超过 600 秒；需要更长单命令上限、不同 agent/策略或任务特定分析。`dna-assembly` 在 600 秒下完成执行但验证器 0.0，是有效的模型/实现失败。
- 这是**新配置的单独重跑**，不能混入第四批 300 秒的 7/7 或 7/10 统计。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `bn-fit-modify` | 300 秒与 600 秒均为 `RuntimeError: Command timed out` | 单条命令超过配置上限；600 秒仍不足 | 否（agent 配置限制） |
| `code-from-image` | 300 秒与 600 秒均为 `RuntimeError: Command timed out` | 单条命令超过配置上限；600 秒仍不足 | 否（agent 配置限制） |
| `dna-assembly` | 300 秒命令超时；600 秒下无异常但验证器 0.0 | 300 秒为配置限制；600 秒下为模型/实现失败 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；适配器使用原生 HTTP 后本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 10 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/ pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **本批有效任务可能偏易**：7/7 有效尝试通过高于前几批（5/8、4/7、8/10），但任务集合不同，不能据此推断总体能力或与前几批直接比较。
- **异常不是模型分数**：`bn-fit-modify`/`code-from-image`/`dna-assembly` 的 300 秒超时是 agent 配置限制；600 秒重跑显示前两者仍超时，`dna-assembly` 才是有效的实现失败。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：每任务 1 次；3 个异常任务仅重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第四批 10 个新 Terminal-Bench 任务中 7/10 首次尝试通过；排除 3 个 300 秒命令超时异常后，有效尝试 7/7 = 100%；600 秒重跑显示 `bn-fit-modify`/`code-from-image` 仍需更长命令预算，`dna-assembly` 为有效 0.0；累计覆盖 55/89 个任务。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 7/7 或 70% 与前几批直接比较或合并；不能把命令超时异常归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：对 `dna-assembly` 增加重复；对 `bn-fit-modify`/`code-from-image` 使用更长的单命令上限（如 1200 秒）或不同 agent/策略作为新配置单独评估；继续选择未测任务扩大覆盖；保留 300 秒基准配置用于跨批判度对照。
