# 证据卡：Terminal-Bench 2.0 第三批十任务广度（2026-11-19）

> 本卡记录 Terminal-Bench 2.0 的**第三批广度**：10 个未在 pilot/扩展/前两批广度出现过的任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前两批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `c66c46d`（main，600 秒重跑证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器 v0：`prompt=none`、`tolerantArgs=1`、请求超时 900 秒、`fetch` TypeError 单次重试（PR #74） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个新任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-19；job 23:10:01 → 23:51:28（41m26s） |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **4,781,089 输入 / 166,022 输出**（自定义 agent 不报缓存） |

## 任务列表

`adaptive-rejection-sampler`、`build-cython-ext`、`count-dataset-tokens`、`distribution-search`、`headless-terminal`、`kv-store-grpc`、`largest-eigenval`、`prove-plus-comm`、`pypi-server`、`query-optimize`。

镜像已在运行前全部预拉取；本批没有 environment start timeout 或镜像拉取失败。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `adaptive-rejection-sampler` | 验证失败 | 0.0 | 2,072,495 / 61,329 | 38 | 22m48s | 无异常；任务要求 R `ars.R` 实现，验证器未通过；未保留命令轨迹 |
| `build-cython-ext` | 通过 | 1.0 | 785,927 / 10,859 | 40 | 6m29s | 40 条命令（单轮可含多个工具调用） |
| `count-dataset-tokens` | 验证失败 | 0.0 | 620,397 / 13,950 | 47 | 10m18s | 无异常；`answer.txt` 未匹配预期 `79586` |
| `distribution-search` | 通过 | 1.0 | 47,818 / 7,166 | 5 | 1m49s | — |
| `headless-terminal` | 通过 | 1.0 | 169,296 / 17,064 | 14 | 4m13s | — |
| `kv-store-grpc` | 通过 | 1.0 | 13,129 / 2,398 | 5 | 0m58s | — |
| `largest-eigenval` | 通过 | 1.0 | 967,072 / 42,143 | 34 | 12m11s | — |
| `prove-plus-comm` | 通过 | 1.0 | 12,180 / 2,151 | 7 | 1m01s | — |
| `pypi-server` | 通过 | 1.0 | 27,195 / 1,878 | 7 | 1m04s | — |
| `query-optimize` | 通过 | 1.0 | 65,580 / 7,084 | 16 | 5m30s | — |

### 汇总

- **10 个任务逐项分类**：8 通过、2 个有效 0.0、0 异常。
- **有效模型通过率**：8/10 = **80.0%**（全部 10 次尝试均有效，无异常）。
- **任务层面**：8/10 任务首次尝试通过；2 个失败均为验证器 0.0，无异常。
- 总 token：4,781,089 输入 / 166,022 输出；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 第一批广度 10 + 第二批广度 10 + 第三批广度 10 = **45/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）。

## 追加：2 个有效 0.0 的重复（300 秒批次异常，600 秒批次有效）

### 第一次重复（300 秒配置）：整轮异常，不计模型结果

`tbench2-breadth3-zero-repeat-3x`：`adaptive-rejection-sampler`、`count-dataset-tokens` 各 3 次（6 trials，2 并发，相同 40 轮/300 秒配置），23:56:16 → 00:33:21 UTC（37m05s）。**6/6 全部异常**：

- 4 次 `RuntimeError: Command timed out after 300 seconds`（`adaptive-rejection-sampler` 1 次、`count-dataset-tokens` 3 次）。
- 2 次 `InternalServerError: 502`（`adaptive-rejection-sampler` 2 次）；适配器日志显示 `TypeError: Headers Timeout Error`，根因是全局 `fetch`（undici）默认 300 秒 `headersTimeout` 早于适配器 900 秒预算触发。
- 该轮没有干净的模型评估结果，整体排除；随后已用原生 `node:http/https` 替换 `fetch`（PR #78，9/9 测试通过），并新增 `NF_ADAPTER_HEADERS_TIMEOUT_MS`。

### 第二次重复（600 秒配置，修复后适配器）：有效但高波动

`tbench2-breadth3-zero-repeat-600-3x`：同样 2 个任务各 3 次（6 trials，2 并发，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变；修复后的原生 HTTP 适配器）。00:42:45 → 01:59:48 UTC（1h17m03s），无 502，1 次 600 秒命令超时异常。

| 任务 | 尝试数 | 干净通过 | Reward 序列（含异常） | 有效输入 / 输出 tokens |
|------|-------:|---------:|----------------------|------------------------|
| `adaptive-rejection-sampler` | 3 | 1/3 | 1.0 / 0.0 / 0.0 | 2,402,735 + 2,783,035 + 2,989,754 / 72,612 + 81,196 + 105,435 |
| `count-dataset-tokens` | 3 | 1/2 有效 | 1.0 / 0.0 / 0.0（600 秒超时异常） | 459,603 + 787,520 / 13,680 + 17,502 |

- **6 trials**：2 个 reward 1.0、4 个 reward 0.0（其中 1 个是 600 秒命令超时异常）、0 个 502。
- **干净有效尝试**：5 个（排除 1 个异常），通过 **2/5 = 40.0%**；按全部 6 trials（异常按 0）为 2/6 = 33.3%，与 Harbor mean 0.333、Pass@2 0.667 一致。
- **任务层面**：`adaptive-rejection-sampler` 1/3 干净通过，`count-dataset-tokens` 1/2 干净有效通过（另有 1 次 600 秒超时异常）；两者都是**高波动、偶尔可通过**，不是稳定失败。第三批初轮的两个 0.0 因此更像单次波动，而不是能力下限。
- 总 token：9,422,647 输入 / 290,425 输出（异常 trial 未汇总用量，实际更高）；无缓存计数。
- 这是 **600 秒新配置**的单独结果，不能混入第三批 300 秒的 8/10。

## 失败说明

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `adaptive-rejection-sampler` | 验证器 0.0，无异常；任务要求 `/app/ars.R` 中的 R 实现，测试覆盖多个分布 | 任务/模型实现失败；自定义 agent 未持久化命令轨迹，无法逐命令归因 | 否（模型/agent 行为） |
| `count-dataset-tokens` | 验证器 0.0，无异常；`/app/answer.txt` 未包含预期 token 数 `79586` | 计数/实现失败；无轨迹 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`，避免 VM 全局 `HTTP_PROXY` 把本地模型请求当作外网；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：10 个任务、每任务 1 次尝试；2 个 0.0 另有 2 个任务各 3 次重复（300 秒轮整轮异常、600 秒轮 6 trials）；单 VM；不能与官方榜单或前两批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **本批任务选择可能偏易**：8/10 通过高于前两批广度（5/8、4/7），但任务集合不同，不能据此推断总体能力或与前两批直接比较；也可能与任务难度分布和 300 秒命令上限是否触发有关。
- **无异常不等于无配置限制**：`build-cython-ext` 提交 40 条命令仍通过，`count-dataset-tokens` 提交 47 条命令（单轮可含并行工具调用），说明轮数/命令预算对部分任务有压力；`adaptive-rejection-sampler` 与 `count-dataset-tokens` 的初轮是干净 0.0，不是 harness 崩溃；600 秒重复显示二者均可偶尔通过（前者 1/3、后者 1/2 干净有效），并非稳定失败。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：初轮每任务 1 次；300 秒重复轮因适配器/命令超时整轮异常，600 秒轮仅 6 trials；不能把 80% 或重复的 2/5 当作稳定总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在同日第三批 10 个新 Terminal-Bench 任务中 8/10 有效评估通过（80.0%），无运行异常；8 个任务首次尝试干净通过，2 个任务初轮为验证器 0.0（`adaptive-rejection-sampler`、`count-dataset-tokens`）。600 秒重复中二者各为 1/3 与 1/2 干净有效通过（合计 2/5 = 40%，另 1 次 600 秒超时异常），说明初轮 0.0 主要是波动，不是稳定失败；累计覆盖 45/89 个任务。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把本批 80% 与前两批的 62.5%/57.1% 直接比较或合并；不能把两个 0.0 或 600 秒重复的 40% 当作稳定能力或总体通过率；不能归因于 NeonForge 产品审批/工具链。
- **下一步**：如需更高置信度，可对 `adaptive-rejection-sampler`、`count-dataset-tokens` 继续增加 600 秒重复（当前各 3 次仍样本小）；继续选择未测任务扩大覆盖；含长命令的任务按需使用 600 秒新配置并单独记录；保留 300 秒基准配置用于跨批判度对照；300 秒重复轮因适配器/命令超时不可用于模型统计。
