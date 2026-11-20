# 证据卡：Terminal-Bench 2.0 第五批十任务广度（2026-11-20）

> 本卡记录 Terminal-Bench 2.0 的**第五批广度**：10 个未在 pilot/扩展/前四批广度出现过的任务，每任务 1 次尝试，使用 300 秒单命令基准配置。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，不能与前几批或 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `4ed9842`（main，第四批 1200 秒重跑证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个新任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 04:40:22 → 05:37:43（57m20） |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token **11,563,418 输入 / 255,868 输出**（自定义 agent 不报缓存；异常 trial 未汇总用量） |

## 任务列表

`extract-moves-from-video`、`feal-linear-cryptanalysis`、`hf-model-inference`、`mailman`、`make-doom-for-mips`、`make-mips-interpreter`、`model-extraction-relu-logits`、`path-tracing`、`path-tracing-reverse`、`qemu-startup`。

镜像已全部预拉取；`hf-model-inference` 镜像较大，600 秒首拉未完成，1200 秒重试后补齐。本批无 environment start timeout 或镜像拉取失败。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `extract-moves-from-video` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 5m21s | 单条命令超过 300 秒上限 |
| `feal-linear-cryptanalysis` | 通过 | 1.0 | 457,634 / 29,737 | 18 | 10m19s | — |
| `hf-model-inference` | 通过 | 1.0 | 52,804 / 3,777 | 15 | 2m48s | — |
| `mailman` | 验证失败 | 0.0 | 1,971,502 / 22,823 | 65 | 7m55s | 无异常；命令数超过 40 轮上限（单轮可含多个工具调用） |
| `make-doom-for-mips` | 验证失败 | 0.0 | 2,064,020 / 41,885 | 38 | 10m43s | 无异常 |
| `make-mips-interpreter` | 验证失败 | 0.0 | 2,871,899 / 55,712 | 56 | 13m36s | 无异常；命令数超过 40 轮上限 |
| `model-extraction-relu-logits` | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总） | — | 11m23s | 单条命令超过 300 秒上限 |
| `path-tracing-reverse` | 通过 | 1.0 | 2,873,258 / 59,378 | 45 | 14m51s | — |
| `path-tracing` | 通过 | 1.0 | 572,265 / 18,134 | 17 | 4m32s | — |
| `qemu-startup` | 验证失败 | 0.0 | 700,036 / 24,422 | 36 | 12m38s | 无异常 |

### 汇总

- **10 个任务逐项分类**：4 通过、4 个有效 0.0、2 个异常（均为 300 秒单命令超时）。
- **有效模型通过率**：4/8 = **50.0%**（排除 2 个异常）；异常按 0 为 4/10 = 40.0%，与 Harbor mean 0.400 一致。
- 总 token：11,563,418 输入 / 255,868 输出；两个异常 trial 的用量未汇总，实际更高；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 第一批广度 10 + 第二批广度 10 + 第三批广度 10 + 第四批广度 10 + 第五批广度 10 = **65/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）。

## 追加：2 个命令超时任务的 600 秒重跑（`tbench2-breadth-5-timeout600`）

对第五批 2 个异常任务单次重跑，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。05:38:32 → 06:03:52 UTC（25m20），0 异常。

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `extract-moves-from-video` | 验证失败 | 0.0 | 611,629 / 17,546 | 43 | 23m42s | 无异常；600 秒下完成执行但验证器 0.0 |
| `model-extraction-relu-logits` | 通过 | 1.0 | 420,023 / 35,969 | 17 | 10m39s | 600 秒下干净通过 |

- **结果**：1/2 通过，0 异常；`model-extraction-relu-logits` 干净通过，`extract-moves-from-video` 为有效 0.0。
- **解读**：两者的 300 秒失败都是单命令预算限制；600 秒下 `model-extraction-relu-logits` 通过，`extract-moves-from-video` 完成执行但验证器 0.0，是有效的模型/实现失败。
- 总 token：1,031,652 输入 / 53,515 输出；这是**新配置**的单独重跑，不能混入第五批 300 秒的 4/8 或 4/10。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `extract-moves-from-video` | 300 秒命令超时；600 秒下无异常但验证器 0.0（43 条命令） | 300 秒为配置限制；600 秒下为模型/实现失败 | 否（模型/agent 行为） |
| `model-extraction-relu-logits` | 300 秒命令超时；600 秒下干净通过（17 条命令） | 单条命令预算不足；600 秒解决 | 否（agent 配置限制） |
| `mailman` | 验证器 0.0，无异常；65 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `make-doom-for-mips` | 验证器 0.0，无异常；38 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `make-mips-interpreter` | 验证器 0.0，无异常；56 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `qemu-startup` | 验证器 0.0，无异常；36 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 10 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **任务选择可能影响通过率**：本批 4/8 有效通过低于第三/四批，但任务集合不同，不能据此推断总体能力或与前几批直接比较。
- **异常不是模型分数**：两个 300 秒命令超时是 agent 配置限制；600 秒重跑显示 `model-extraction-relu-logits` 通过、`extract-moves-from-video` 为有效 0.0。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：每任务 1 次；4 个有效 0.0 未重复；2 个异常任务仅重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第五批 10 个新 Terminal-Bench 任务中 4/10 首次尝试通过；排除 2 个 300 秒命令超时异常后，有效尝试 4/8 = 50.0%；600 秒重跑显示 `model-extraction-relu-logits` 可通过、`extract-moves-from-video` 为有效 0.0；累计覆盖 65/89 个任务；第六批再评估 9 个新任务（`mteb-retrieve` 镜像失败未评估），累计 74/89，见 `2026-11-20-terminal-bench-breadth-6.md`。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 50% 或 40% 与前几批直接比较或合并；不能把命令超时异常归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：对 4 个有效 0.0（`mailman`、`make-doom-for-mips`、`make-mips-interpreter`、`qemu-startup`）各增加重复或分析测试断言；`extract-moves-from-video` 可按 600 秒配置重复；`model-extraction-relu-logits` 的 600 秒通过单独记录；继续选择未测任务扩大覆盖。
