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

## 追加：1200 秒重跑（`tbench2-breadth-4-timeout1200`）

对仍在 600 秒超时的 `bn-fit-modify`、`code-from-image` 单次重跑，`NEONFORGE_COMMAND_TIMEOUT_SEC=1200`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。03:49:34 → 04:04:09 UTC（14m34）。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `bn-fit-modify` | 通过 | 1.0 | 107,771 / 7,977 | 16 | 13m40s | 1200 秒下干净通过 |
| `code-from-image` | 验证失败 | 0.0 | 835,913 / 29,856 | 39 | 10m04s | 无异常；600 秒超时是配置限制，1200 秒下为有效模型/实现失败 |

- **结果**：1/2 通过，0 异常；`bn-fit-modify` 在 1200 秒下通过，`code-from-image` 完成执行但验证器 0.0。
- **解读**：`bn-fit-modify` 的失败是单命令预算不足，1200 秒解决；`code-from-image` 在 300/600 秒是超时，1200 秒下则是有效失败，不能归因于 harness。
- 总 token：943,684 输入 / 37,833 输出；这是**新配置**的单独重跑，不能混入 300 秒批次的 7/10 或 7/7。

## 追加：`dna-assembly` 600 秒配置的 3 次重复（`tbench2-b4-dna-assembly-repeat-3x-600`）

`dna-assembly` 在 300 秒为命令超时、600 秒重跑为有效 0.0；用 600 秒配置再重复 3 次（2 并发、40 轮）。06:03:11 → 06:40:01 UTC（36m50），0 异常。

| 任务 | 配置 | 3 次结果 | 命令数 | Agent 用时 | 输入 / 输出 tokens |
|------|------|----------|--------|----------|-------------------|
| `dna-assembly` | 600 秒 | 3 × 有效 0.0 | 36 / 40 / 37 | 20m31s / 22m19s / 15m04s | 合计 5,360,514 / 204,140 |

- **结果**：3/3 有效 0.0、0 异常；Harbor mean 0.000。
- **解读**：`dna-assembly` 的 600 秒有效 0.0 稳定复现，不是单次波动，也不是单命令预算问题；需要不同 agent/策略或任务特定分析。
- 这是**600 秒配置**的重复，不能与第四批初轮 300 秒的 7/10 或 600 秒重跑的 0/3 合并。

## 追加：`code-from-image` 1200 秒配置的 3 次重复（两个 job）

`code-from-image` 在 600/1200 秒均为有效 0.0；用 1200 秒配置重复 3 次（2 并发）。首次 job `tbench2-b4-code-from-image-repeat-3x-1200`（06:41:06Z 启动）在主机暂停时中断：2 个已完成 trial 中 1 个为有效 0.0、1 个为 verifier 依赖安装失败（测试未执行），第 3 个为 `CancelledError`；恢复后用 `tbench2-b4-code-from-image-repeat-3x-1200-rerun1` 补跑第 3 个 trial（10:21:37 → 10:57:27 UTC，35m50，0 异常，有效 0.0）。

| trial 来源 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 |
|------------|------|-------:|-------------------|-------:|----------|
| 首次 job（2 个完成） | 1 × 有效 0.0、1 × verifier 依赖失败（Harbor 0.0） | 0.0 | 有效：1,179,775 / 43,690；verifier 失败：848,372 / 36,738 | 有效 40 / 失败 28 | 有效 17m47s / 失败 20m08s |
| `-rerun1`（1 个） | 有效 0.0 | 0.0 | 766,064 / 27,114 | 39 | 34m51s（验证器 47s） |

- **结果**：3 个**模型可验证** trial（首次 job 1 个 + `-rerun1` 1 个 + 此前 1200 秒重跑 1 个）均为有效 0.0；首次 job 的另一个完成 trial 是 verifier 依赖安装失败（apt/curl/uvx 缺失，测试未执行），被取消的 trial 不计入。重复 + 补跑的模型可验证 token 合计 **1,945,839 / 70,804**（不含 verifier 失败 trial 的 848,372 / 36,738）；此前 `tbench2-breadth-4-timeout1200` 的 `code-from-image` trial 另有 835,913 / 29,856。
- **解读**：`code-from-image` 的 1200 秒有效 0.0 稳定复现，不是单次波动或单命令预算问题；3 个模型可验证 trial 的断言均为 `/app/output.txt` 不存在；需要不同 agent/策略或任务特定分析。verifier 依赖失败 trial 不计入模型结论。
- 这是**1200 秒配置**的重复，不能与第四批初轮 300 秒的 7/10 或 1200 秒重跑的 1/2 合并。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `bn-fit-modify` | 300/600 秒命令超时；1200 秒下无异常并 reward 1.0 | 单条命令预算不足；1200 秒解决 | 否（agent 配置限制） |
| `code-from-image` | 300/600 秒命令超时；1200 秒下无异常但验证器 0.0（39 条命令） | 前期为命令预算限制；1200 秒下为模型/实现失败 | 否（模型/agent 行为） |
| `dna-assembly` | 300 秒命令超时；600 秒下无异常但验证器 0.0（37 条命令） | 300 秒为配置限制；600 秒下为模型/实现失败 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；适配器使用原生 HTTP 后本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 10 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/ pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **本批有效任务可能偏易**：7/7 有效尝试通过高于前几批（5/8、4/7、8/10），但任务集合不同，不能据此推断总体能力或与前几批直接比较。
- **异常不是模型分数**：`bn-fit-modify`/`code-from-image`/`dna-assembly` 的 300 秒超时是 agent 配置限制；600 秒重跑显示前两者仍超时，`dna-assembly` 为有效实现失败；1200 秒重跑显示 `bn-fit-modify` 可通过、`code-from-image` 为有效实现失败。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：初轮每任务 1 次；`dna-assembly` 与 `code-from-image` 已各做 3 次重复，其余异常任务仅重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第四批 10 个新 Terminal-Bench 任务中 7/10 首次尝试通过；排除 3 个 300 秒命令超时异常后，有效尝试 7/7 = 100%。600 秒重跑显示 `bn-fit-modify`/`code-from-image` 仍超时、`dna-assembly` 为有效 0.0；1200 秒重跑显示 `bn-fit-modify` 可通过、`code-from-image` 为有效 0.0。累计覆盖 55/89 个任务；第五批广度后再加 10 个新任务，累计 65/89，见 `2026-11-20-terminal-bench-breadth-5.md`。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 7/7、70% 或 1200 秒结果与前几批直接比较或合并；不能把命令超时异常归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：`dna-assembly` 已在 600 秒配置下 3/3 有效 0.0；`code-from-image` 已在 1200 秒配置下 3 个模型可验证 trial 均为有效 0.0（稳定失败；另有 1 个 verifier 依赖失败、1 个取消，不计入）；`bn-fit-modify` 的 1200 秒通过可作为新配置结果；terminal-bench@2.0 已达到 89/89 覆盖，继续扩大任务数已无必要；失败断言分析见 `2026-11-22-terminal-bench-verifier-failure-analysis.md`。

## 更正（2026-11-22）：`code-from-image` 的 1 个完成 trial 为 verifier 依赖失败

回溯检查（`2026-11-22-terminal-bench-verifier-failure-analysis.md`）发现，首次 job 中 `code-from-image__4PvhgkL`（28 条命令、20m08s、848,372 / 36,738 tokens）没有 `ctrf.json`；`verifier/test-stdout.txt` 显示 `curl: (18) HTTP/2 stream 1 was not closed cleanly`、`uvx: command not found`，测试未执行。Harbor 仍记录 reward 0.0、`reward_valid=True`。

- 该 trial 不计入模型可验证的稳定失败样本；本卡前述“2 个已完成 trial 均为有效 0.0”和“3/3 完成 trial 均为有效 0.0”的表述作废。
- 修正后，1200 秒配置共有 **3 个模型可验证 trial**（此前 1200 秒重跑 1 个 + 首次 job 1 个 + `-rerun1` 1 个），均为有效 0.0，断言均为 `/app/output.txt` 不存在；稳定失败结论仍成立，但样本构成不同。
- 被取消的 trial 与 verifier 依赖失败 trial 均不计入模型通过率或 token 汇总。
