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
| `qemu-startup` | 验证失败 | 0.0 | 700,036 / 24,422 | 36 | 12m38s | 无异常；验证器依赖安装失败（2026-11-22 更正，见文末） |

### 汇总

- **10 个任务逐项分类**：4 通过、3 个模型可验证 0.0、1 个 verifier 依赖失败（`qemu-startup`；2026-11-22 更正）、2 个异常（均为 300 秒单命令超时）。
- **模型可验证通过率**：4/7 = **57.1%**（排除 2 个异常与 1 个 verifier 依赖失败）；Harbor 无异常口径为 4/8 = 50.0%，异常按 0 为 4/10 = 40.0%，与 Harbor mean 0.400 一致。
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

## 追加：4 个 0.0 的 3 次重复（`tbench2-b5zero-repeat-3x`）

对第五批 4 个 0.0 各做 3 次重复，300 秒基准配置、40 轮、2 并发（12 trials）。03:52:13 → 05:02:17 UTC（1h10m04），1 个 300 秒命令超时异常。

| 任务 | 3 次结果 | 干净有效 trials | 异常 | 通过 | 备注 |
|------|----------|----------------|------|------|------|
| `mailman` | 2 × 1.0、1 × RuntimeError | 2 | 1 | 2 | 40 / 52 条命令；6m46s / 13m03s；2,986,292 / 41,717 tokens |
| `make-doom-for-mips` | 3 × 有效 0.0 | 3 | 0 | 0 | 39 / 52 / 63 条命令；7m20s / 11m45s / 7m08s；6,016,966 / 71,377 tokens |
| `make-mips-interpreter` | 1 × 1.0、2 × 有效 0.0 | 3 | 0 | 1 | 50 / 59 / 47 条命令；12m31s / 10m18s / 12m13s；5,797,729 / 98,936 tokens |
| `qemu-startup` | 3 × verifier 依赖安装失败（Harbor 0.0） | 0 | 0（3 个 verifier 失败） | 0 | 28 / 39 / 28 条命令；10m35s / 8m43s / 8m43s；2,312,228 / 76,964 tokens；测试未执行（2026-11-22 更正，见文末） |

### 汇总

- **12 trials**：3 × 1.0（`mailman` 2、`make-mips-interpreter` 1）、9 × 0.0；1 个 300 秒命令超时异常；Harbor mean 0.25。
- **Harbor 无异常尝试**：11 个；其中 `qemu-startup` 的 3 个为 verifier 依赖安装失败（测试未执行）。**模型可验证尝试 8 个**，干净通过 3/8 = **37.5%**（2026-11-22 更正；原 3/11 = 27.3% 含 3 个 verifier 失败）。
- **异常按 0**：3/12 = 25.0%。
- 总 token：17,113,215 输入 / 288,994 输出；异常 trial 未汇总用量，实际更高。
- **解读**：`mailman` 初轮 0.0 是波动——2 次干净运行全部通过（另 1 次命令超时）；`make-mips-interpreter` 1/3 干净通过，也非稳定失败；`make-doom-for-mips` 3/3 干净 0.0，失败稳定；`qemu-startup` 3/3 的 0.0 实际是 verifier 依赖安装失败（测试未执行），不能判为模型失败（2026-11-22 更正）。
- 这是**相同 300 秒配置**的重复，不能与第五批初轮的 4/10 或 4/8 合并为总体通过率，只作各任务稳定性信号。

## 追加：2 个 600 秒任务的 3 次重复（`tbench2-600s-zero-repeat-3x`）

`qemu-alpine-ssh`（第六批 600 秒有效 0.0）与 `extract-moves-from-video`（第五批 600 秒有效 0.0）各重复 3 次，600 秒配置、2 并发、40 轮。11:52:55 → 12:36:53 UTC（43m57），1 个 600 秒命令超时异常。

| 任务 | 3 次结果 | 干净有效 trials | 异常 | 通过 | 备注 |
|------|----------|----------------|------|------|------|
| `qemu-alpine-ssh` | 3 × 有效 0.0 | 3 | 0 | 0 | 29 / 33 / 32 条命令；9m15s / 6m44s / 9m24s；1,228,185 / 38,870 tokens |
| `extract-moves-from-video` | 1 × 1.0、1 × 有效 0.0、1 × RuntimeError | 2 | 1 | 1 | 通过 trial：28 条命令，13m34s，409,014 / 7,735；有效 0.0：40 条命令，20m08s，628,648 / 10,293 |

### 汇总

- **6 trials**：1 × 1.0（`extract-moves-from-video`）、5 × 0.0；1 个 600 秒命令超时异常；Harbor mean 0.167。
- **干净有效尝试**：5 个；干净通过 1/5 = **20.0%**。
- **异常按 0**：1/6 = 16.7%。
- 总 token：2,265,847 输入 / 56,898 输出；异常 trial 无用量汇总。
- **解读**：`qemu-alpine-ssh` 在 600 秒下 3/3 有效 0.0，稳定失败；`extract-moves-from-video` 出现 1 次干净通过、1 次有效 0.0 和 1 次命令超时，600 秒下的有效 0.0 不是稳定失败，波动明显。
- 这是**600 秒配置**的重复，不能与第五批初轮的 4/10 或 600 秒重跑的 1/2 合并。

## 追加：`model-extraction-relu-logits` 600 秒 3 次重复（`tbench2-model-extraction-600s-repeat-3x-rerun1`）

`model-extraction-relu-logits` 此前 600 秒重跑 1/1 通过；用相同 600 秒配置重复 3 次（2 并发、40 轮）。16:01:23 → 16:28:13 UTC（26m49），0 异常。

| 任务 | 3 次结果 | 干净有效 trials | 异常 | 通过 | 备注 |
|------|----------|----------------|------|------|------|
| `model-extraction-relu-logits` | 1 × 1.0、2 × 有效 0.0 | 3 | 0 | 1 | 通过 trial：37 条命令，19m35s，2,396,958 / 77,107；两个 0.0：24 / 19 条命令，13m09s / 8m57s |

- **结果**：1/3 干净通过 = 33.3%；0 异常；token 合计 3,826,379 / 157,275。
- **同配置合计**：此前 600 秒重跑 1/1 通过 + 本轮 1/3 通过 = 2/4（50.0%），但样本仍小。
- **解读**：该任务在 600 秒下可以通过，但不是稳定通过——重复中 1/3 通过、2/3 有效 0.0，波动明显；不能按单次通过判定为稳定能力。
- 这是**600 秒配置**的重复，不能与第五批初轮 300 秒的 4/10 合并。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `extract-moves-from-video` | 300 秒命令超时；600 秒下无异常但验证器 0.0（43 条命令） | 300 秒为配置限制；600 秒下为模型/实现失败 | 否（模型/agent 行为） |
| `model-extraction-relu-logits` | 300 秒命令超时；600 秒下干净通过（17 条命令） | 单条命令预算不足；600 秒解决 | 否（agent 配置限制） |
| `mailman` | 验证器 0.0，无异常；65 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `make-doom-for-mips` | 验证器 0.0，无异常；38 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `make-mips-interpreter` | 验证器 0.0，无异常；56 条命令 | 任务/模型实现失败；无轨迹 | 否（模型/agent 行为） |
| `qemu-startup` | 验证器依赖安装失败（apt 404、curl/uvx 缺失）；测试未执行；36 条命令 | 验证器基础设施失败；无模型断言 | 否（验证器基础设施，2026-11-22 更正） |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 10 个任务、每任务 1 次尝试；单 VM；不能与官方榜单或前几批/pilot/扩展批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **任务选择可能影响通过率**：本批模型可验证 4/7 通过（57.1%；Harbor 无异常口径 4/8 = 50.0%），低于第三/四批，但任务集合不同，不能据此推断总体能力或与前几批直接比较。
- **异常不是模型分数**：两个 300 秒命令超时是 agent 配置限制；600 秒重跑显示 `model-extraction-relu-logits` 通过、`extract-moves-from-video` 为有效 0.0。
- **无轨迹分析**：自定义 agent 不持久化命令/工具结果，失败只能按任务测试断言归类，不能给出逐命令根因。
- **样本小**：初轮每任务 1 次；4 个 0.0（含 `qemu-startup` 的 verifier 依赖失败）已各重复 3 次（见追加节），但每任务总样本仍小；2 个异常任务仅重跑 1 次；不能估计总体通过率或置信区间。

## 结论

- **可用结论**：自定义最小 agent 在第五批 10 个新 Terminal-Bench 任务中 4/10 首次尝试通过；排除 2 个 300 秒命令超时异常与 1 个 verifier 依赖失败（`qemu-startup`）后，模型可验证尝试 4/7 = 57.1%（Harbor 无异常口径 4/8 = 50.0%）；600 秒重跑显示 `model-extraction-relu-logits` 可通过、`extract-moves-from-video` 为有效 0.0；累计覆盖 65/89 个任务；第六批再评估 9 个新任务（`mteb-retrieve` 镜像失败未评估），累计 74/89，见 `2026-11-20-terminal-bench-breadth-6.md`。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 50% 或 40% 与前几批直接比较或合并；不能把命令超时异常归因于模型失败或 NeonForge 产品审批/工具链；不能据此估计总体通过率。
- **下一步**：4 个 0.0（含 `qemu-startup` 的 verifier 依赖失败）已各做 3 次重复（Harbor 无异常 3/11，模型可验证 3/8；`mailman` 2/2 干净通过，`make-mips-interpreter` 1/3 干净通过，`make-doom-for-mips` 3/3 稳定 0.0）；`qemu-startup` 的初轮与 3 次重复共 4 个 0.0 均为 verifier 依赖安装失败，已撤销“稳定失败”结论；`qemu-alpine-ssh` 在 600 秒下同样为 verifier 依赖失败；`extract-moves-from-video` 在 600 秒下 1 次干净通过、1 次有效 0.0、1 次超时，波动明显；`model-extraction-relu-logits` 在 600 秒下同配置合计 2/4 通过（本轮 1/3），也不是稳定通过；terminal-bench@2.0 已达到 89/89 覆盖。详见 `2026-11-22-terminal-bench-verifier-failure-analysis.md`。

## 更正（2026-11-22）：`qemu-startup` 为 verifier 依赖安装失败

对既有 trial 产物的回溯检查（`2026-11-22-terminal-bench-verifier-failure-analysis.md`）发现，本卡 `qemu-startup` 初轮与 3 次重复的 4 个 0.0 trial **均无 `ctrf.json`**，`verifier/test-stdout.txt` 显示 Debian bullseye-security 的 `curl`/`libcurl4`/`libnghttp2-14` 固定版本 404，随后 `curl`、`uvx` 均缺失。Harbor 仍记录 `reward_valid=True` 和 0.0，但测试没有执行。

- 因此本卡前述把 `qemu-startup` 归为“模型/实现失败”或“稳定失败”的表述**作废**；这 4 个 trial 不计入模型可验证尝试。
- 修正后，第五批 4 个 0.0 任务的重复仍为 12 trials：3 个模型可验证通过、5 个模型可验证 0.0、1 个 300 秒命令超时异常、3 个 verifier 依赖失败；模型可验证干净通过率为 **3/8 = 37.5%**，不是 3/11 = 27.3%。
- 若要重新评估 `qemu-startup`，需先修复或绕过 verifier 的依赖安装，并按新配置单独记录，不能与旧 reward 合并。
