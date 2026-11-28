# 证据卡：Terminal-Bench 2.0 十任务广度批次（2026-11-19）

> 本卡记录 Terminal-Bench 2.0 的**广度批次**：首批 10 个未在 pilot/扩展批次出现过的任务，每任务 1 次尝试；同日追加第二批 10 个新任务 ×1。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩，也不能与 pilot 的 `terminus-2` 结果合并。

## 基本信息

| 字段              | 值                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| 产品版本 / commit | NeonForge `a332619`（main，pilot 重复证据合并后）                                                                    |
| 模型 / Provider   | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式）                                        |
| 适配器            | NeonForge 无头适配器 v0：`prompt=none`、`tolerantArgs=1`、请求超时 900 秒                                            |
| Agent             | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒                           |
| Harness           | Harbor `0.26.0`                                                                                                      |
| 数据集            | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`）   |
| 任务范围          | 10 个新任务 × 1 次尝试，共 10 trials；2 并发；`--environment-build-timeout-multiplier 4`                             |
| 评估日期（UTC）   | 2026-11-19；job 12:37:56 → 13:43:17（1h05m21s）                                                                      |
| 沙箱              | 与 pilot 相同的专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 凭据              | 仅宿主适配器进程持有 Magpie Key；VM、任务容器与验证容器不持有                                                        |
| 运行成本          | 本地 Magpie，无外部 API 账单；总 token 4,241,929 输入 / 166,884 输出（自定义 agent 不报缓存）                        |

## 环境准备说明

首次尝试 `tbench2-breadth-10` 使用默认 600 秒 environment start timeout；`chess-best-move` 与 `write-compressor` 在镜像拉取/环境启动阶段出现 `EnvironmentStartTimeoutError`，未进入模型执行。随后预取 `write-compressor` 镜像并把 `--environment-build-timeout-multiplier` 提高到 4 重跑，得到本卡结果。首次的两个启动失败属于基础设施问题，不计入模型分数。

## 结果

| 任务                  | 结果                    |      Reward | 输入 / 输出 tokens | 命令数 | 备注                                                                                   |
| --------------------- | ----------------------- | ----------: | ------------------ | -----: | -------------------------------------------------------------------------------------- |
| `cobol-modernization` | 通过                    |         1.0 | 1,086,127 / 51,904 |     41 | 长上下文；接近 40 轮上限                                                               |
| `fix-git`             | 通过                    |         1.0 | 58,401 / 3,617     |     11 | —                                                                                      |
| `overfull-hbox`       | 通过                    |         1.0 | 163,183 / 12,320   |     14 | —                                                                                      |
| `sparql-university`   | 通过                    |         1.0 | 62,297 / 6,800     |      8 | —                                                                                      |
| `write-compressor`    | 通过                    |         1.0 | 128,346 / 19,626   |     10 | —                                                                                      |
| `git-multibranch`     | 验证失败                |         0.0 | 372,984 / 18,941   |     24 | 验证器 `git_push.exp` 报 `expect: spawn id exp3 not open`，空仓库推送未完成            |
| `polyglot-rust-c`     | 验证失败                |         0.0 | 416,566 / 26,165   |     19 | 目录中留下 `main`、`cmain` 编译产物；测试只允许 `main.rs`                              |
| `sanitize-git-repo`   | 验证失败                |         0.0 | 1,954,025 / 27,511 |     64 | `test_no_other_files_changed` 中 `SHA ... could not be resolved`；重写历史时移除了对象 |
| `chess-best-move`     | **RuntimeError**        | 0.0（异常） | —                  |      — | 单条命令超过 300 秒上限（pip/numpy 图像处理命令）                                      |
| `circuit-fibsqrt`     | **InternalServerError** | 0.0（异常） | —                  |      — | 模型端点返回 `502 upstream request failed`，未完成评估                                 |

### 汇总

- **10 个任务逐项分类**：5 通过、3 个有效 0.0、2 个异常。
- **有效模型通过率**：5/8 = **62.5%**（排除 2 个异常）。
- Harbor 内置统计显示 9 trials、2 exceptions、mean 0.556；其 trial/exception 计数与原始 `result.json` 的 10 个任务不完全一致，本卡以上表的逐项分类为准，不引用该 mean 作为模型分数。
- 总 token：4,241,929 输入 / 166,884 输出；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 首批广度 10 = **25/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）；第二批再追加 10 个新任务，见下节，累计 **35/89**。

## 追加：3 个有效失败任务的 3 次重复（同日）

`tbench2-fail-repeat-3x` job：对广度批次中 3 个有效 0.0 任务各做 3 次尝试（9 trials，2 并发，自定义 `neonforge-terminal`，相同 40 轮/300 秒单命令配置）。14:36:21 → 15:37:13（1h00m52s），总 token **6,776,808 输入 / 212,517 输出**。

| 任务                | 尝试数 | 通过 | Reward 序列     | 输入 / 输出 tokens                                   |
| ------------------- | -----: | ---: | --------------- | ---------------------------------------------------- |
| `git-multibranch`   |      3 |    3 | 1.0 / 1.0 / 1.0 | 235,175+395,802+91,718 / 15,065+19,098+10,646        |
| `polyglot-rust-c`   |      3 |    2 | 1.0 / 1.0 / 0.0 | 150,212+268,257+124,549 / 22,048+29,351+16,341       |
| `sanitize-git-repo` |      3 |    1 | 1.0 / 0.0 / 0.0 | 1,456,986+1,257,615+2,796,494 / 31,110+27,691+41,167 |

- 结果：**6/9 = 66.7%** 通过，无异常。
- 解读：广度批次的单次 0.0 主要是模型/agent 波动，不是稳定失败。`git-multibranch` 3/3 恢复，`polyglot-rust-c` 2/3 恢复，`sanitize-git-repo` 仅 1/3 通过，重写历史任务明显不稳定。
- `sanitize-git-repo` 一次失败尝试消耗约 2.8M 输入 token（75 条命令），成本高；失败原因仍是重写历史后测试 SHA 无法解析（模型实现问题）。

## 追加：第二批广度（10 个新任务 ×1，`tbench2-breadth-10e`）

`tbench2-breadth-10e` job：10 个与 pilot/扩展/首批广度均不重复的任务，每任务 1 次尝试（10 trials，2 并发，自定义 `neonforge-terminal`，相同 40 轮/300 秒单命令配置，agent 超时 ×4、环境构建超时 ×4）。18:49:05 → 19:48:14 UTC（59m09s）。

前置尝试 `tbench2-breadth-10d` 因 VM 全局 `HTTP_PROXY` 把发往 `172.17.0.1:18082` 的本地模型请求交给出站代理（`NO_PROXY` 未含该地址），10/10 次均在首次模型调用即返回 `InternalServerError: 502`，未进入任务执行。该轮是环境配置错误，整体排除；`10e` 在 Harbor 进程环境显式设置 `NO_PROXY/no_proxy` 后重跑。

| 任务                        | 结果                    |      Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注                                                  |
| --------------------------- | ----------------------- | ----------: | ------------------ | -----: | ---------- | ----------------------------------------------------- |
| `break-filter-js-from-html` | 通过                    |         1.0 | 35,282 / 4,571     |      8 | 1m46s      | —                                                     |
| `custom-memory-heap-crash`  | 通过                    |         1.0 | 1,213,714 / 22,272 |     45 | 7m20s      | 单轮可含多个工具调用，命令数可超过 40 轮上限          |
| `sqlite-with-gcov`          | 通过                    |         1.0 | 229,527 / 7,527    |     21 | 5m01s      | —                                                     |
| `vulnerable-secret`         | 通过                    |         1.0 | 35,443 / 2,038     |      6 | 0m44s      | —                                                     |
| `filter-js-from-html`       | 验证失败                |         0.0 | 2,418,992 / 99,563 |     39 | 28m11s     | 无异常；本批最大 token 消耗                           |
| `fix-ocaml-gc`              | 验证失败                |         0.0 | 1,273,917 / 14,675 |     40 | 7m39s      | 无异常                                                |
| `gcode-to-text`             | 验证失败                |         0.0 | 1,319,167 / 37,147 |     42 | 10m58s     | 无异常                                                |
| `crack-7z-hash`             | **RuntimeError**        | 0.0（异常） | 0 / 0（未汇总）    |      — | 5m59s      | 单条命令超过 300 秒上限                               |
| `extract-elf`               | **RuntimeError**        | 0.0（异常） | 0 / 0（未汇总）    |      — | 7m58s      | 单条命令超过 300 秒上限                               |
| `regex-chess`               | **InternalServerError** | 0.0（异常） | 0 / 0（未汇总）    |      — | 5m37s      | 适配器一次瞬时 `TypeError` 导致 502，下一请求恢复 200 |

### 汇总

- **10 个任务逐项分类**：4 通过、3 个有效 0.0、3 个异常。
- **有效模型通过率**：4/7 = **57.1%**（排除 3 个异常）；异常按 0 计为 4/10 = 40.0%。
- Harbor 内置统计显示 9 trials、3 exceptions、mean 0.444；其 `reward_stats` 未包含 `regex-chess`，但 `exception_stats` 同时把两个 `RuntimeError` 任务计入异常与 0.0，trial/exception 计数与原始 `result.json` 的 10 个任务不一致；本卡以逐项分类为准，不引用该 mean。
- 总 token：6,526,042 输入 / 187,793 输出；三个异常 trial 的 `agent_result` 为 0（agent 异常退出前未汇总用量），因此总 token 低于实际调用量；无缓存计数。
- 累计已尝试任务：pilot 5 + 扩展 10 + 首批广度 10 + 第二批广度 10 = **35/89** 个 Terminal-Bench 2.0 任务（不同批次的任务不合并计算总体通过率）；第三批广度后再加 10 个新任务，累计 **45/89**，见 `2026-11-19-terminal-bench-breadth-3.md`。

- 失败/异常归因：`crack-7z-hash` 与 `extract-elf` 的 300 秒命令超时是自定义 agent 配置限制，不是模型失败；`regex-chess` 的 502 是适配器/上游瞬时错误（同一时段适配器只出现一次 `upstream error: TypeError`，随后请求 200），不计入模型通过率；三个有效 0.0 均为验证器返回，无异常，但自定义 agent 未持久化命令轨迹，本卡不做逐命令归因。
- 单次尝试、单 VM、无重复；4/7 只能作为方向性信号，不能估计总体通过率，也不能与首批广度的 5/8 直接合并或平均。

## 追加：第二批 3 个有效 0.0 的 3 次重复（`tbench2-b2zero-repeat-3x`）

`tbench2-b2zero-repeat-3x` job：对第二批 3 个有效 0.0 任务各做 3 次尝试（9 trials，2 并发，相同 40 轮/300 秒单命令配置，agent 超时 ×4），19:59:53 → 21:30:27 UTC（1h30m33s）。该轮使用带 `fetch` TypeError 单次重试的适配器构建，未出现 502。

| 任务                  | 尝试数 | 干净通过 | Reward 序列（含异常）                           | 有效输入 / 输出 tokens                                       |
| --------------------- | -----: | -------: | ----------------------------------------------- | ------------------------------------------------------------ |
| `filter-js-from-html` |      3 | 0/2 有效 | 0.0 / 0.0（300 秒超时异常）/ 0.0                | 2,105,848 + 2,264,746 / 72,837 + 85,677                      |
| `fix-ocaml-gc`        |      3 | 1/2 有效 | 1.0 / 0.0 / 1.0（300 秒超时异常，验证器仍 1.0） | 1,105,037 + 1,164,375 / 9,630 + 5,841                        |
| `gcode-to-text`       |      3 |      0/3 | 0.0 / 0.0 / 0.0                                 | 1,293,017 + 1,023,720 + 1,422,659 / 54,699 + 49,675 + 40,439 |

### 汇总

- **9 trials**：2 个异常（均为 300 秒单命令超时 `RuntimeError`）、2 个 reward 1.0、7 个 reward 0.0。
- **干净有效尝试**：7 个（排除 2 个异常），干净通过 **1/7 = 14.3%**；按验证器 reward（含那条异常但仍 1.0 的 `fix-ocaml-gc`）为 2/9 = 22.2%，与 Harbor mean 0.222、Pass@2 0.333 一致。
- **任务层面**：`gcode-to-text` 0/3 干净通过，`filter-js-from-html` 0/2 有效尝试通过，`fix-ocaml-gc` 1/2 干净有效尝试通过（另有 1 次超时异常但验证器 1.0）。
- **解读**：这 3 个任务不是单次运行波动——`gcode-to-text` 稳定失败，`filter-js-from-html` 稳定失败，`fix-ocaml-gc` 不稳定但偶尔可通过；此前“单次 0.0 可能只是波动”的假设对这三个任务不成立。
- `fix-ocaml-gc` 的超时异常试验在 agent 命令超时后仍由验证器判 1.0（说明解已写入，失败点是最后一条长命令），但本卡不把它算作干净通过，只作为异常单独记录。
- 总 token：10,379,402 输入 / 318,798 输出（两个异常 trial 未汇总用量，实际更高）；无缓存计数。

## 追加：600 秒单命令上限重跑（`tbench2-timeout600-2`，新配置）

为区分“命令超时配置”与模型失败，对第二批两个 300 秒超时任务单次重跑，设置 `NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变（40 轮、agent 超时 ×4、2 并发）。21:31:28 → 21:54:11 UTC（22m43s）。

| 任务            | 结果             |      Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注                    |
| --------------- | ---------------- | ----------: | ------------------ | -----: | ---------- | ----------------------- |
| `crack-7z-hash` | 通过             |         1.0 | 74,245 / 2,919     |     13 | 3m03s      | 600 秒上限下干净通过    |
| `extract-elf`   | **RuntimeError** | 0.0（异常） | 0 / 0（未汇总）    |      — | 22m03s     | 仍超过 600 秒单命令上限 |

- **结果**：1 个干净通过、1 个异常；有效通过 1/1（`crack-7z-hash`），异常按 0 为 1/2；Harbor mean 0.5。
- **解读**：`crack-7z-hash` 的失败原因是 300 秒单命令上限，提高到 600 秒后通过；`extract-elf` 即使 600 秒仍超时，需要更长单命令上限、不同 agent/策略或任务特定分析，不能简单归因于模型失败。
- 这是**新配置的单独重跑**，不能混入 `tbench2-breadth-10e` 的 4/10 或 4/7 统计；总 token 74,245 / 2,919（异常 trial 未汇总）。

### 追加：`filter-js-from-html` / `fix-ocaml-gc` 的 600 秒重跑（`tbench2-timeout600-zero-4`）

`tbench2-timeout600-zero-4` job：对第二批另外两个 0.0/超时任务各做 2 次尝试（4 trials，2 并发，`NEONFORGE_COMMAND_TIMEOUT_SEC=600`，其余配置不变）。21:58:55 → 23:02:00 UTC（1h03m05s），**无异常**，Harbor mean 0.5。

| 任务                  | Reward 序列 |  命令数 | Agent 用时      | 输入 / 输出 tokens                       |
| --------------------- | ----------- | ------: | --------------- | ---------------------------------------- |
| `filter-js-from-html` | 0.0 / 0.0   | 39 / 36 | 19m11s / 35m30s | 2,402,487 + 2,467,560 / 80,097 + 100,172 |
| `fix-ocaml-gc`        | 1.0 / 1.0   | 33 / 30 | 12m32s / 9m30s  | 991,586 + 761,919 / 12,012 + 6,004       |

- **结果**：4 个有效尝试，2/4 = 50% 通过；`fix-ocaml-gc` 2/2 干净通过，`filter-js-from-html` 0/2、无异常。
- **解读**：`fix-ocaml-gc` 的失败确与单命令上限相关——300 秒配置下 1/2 干净通过、1 次超时异常（验证器仍 1.0），600 秒配置下 2/2 干净通过。`filter-js-from-html` 在 300 秒与 600 秒下均为 0/2 且无异常，说明其失败不是命令超时，而是任务/模型行为。
- 总 token：6,623,552 输入 / 198,285 输出；该轮同样使用带 `fetch` TypeError 重试的适配器，无 502。
- 这是**新配置的单独重跑**，不能混入 300 秒批次的通过率。

## 失败与异常

| 用例                | 现象                                                                  | 归因                                                              | 是否产品问题          |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| `chess-best-move`   | `RuntimeError: Command timed out after 300 seconds`                   | 自定义 agent 单命令 300 秒上限；任务内 pip/numpy 图像处理耗时更长 | 否（agent 配置限制）  |
| `circuit-fibsqrt`   | `InternalServerError: Error code: 502 - upstream request failed`      | 本机 Magpie/适配器上游错误；未完成模型评估                        | 否（基础设施）        |
| `git-multibranch`   | `expect: spawn id exp3 not open`，验证器未能完成多分支 HTTPS 推送测试 | 模型实现/验证脚本交互；为任务验证失败，不是 harness 异常          | 否（模型/agent 行为） |
| `polyglot-rust-c`   | 测试断言只允许 `main.rs`，实际发现 `main`、`cmain`、`main.rs`         | 模型把编译产物留在交付目录                                        | 否（模型实现）        |
| `sanitize-git-repo` | `SHA ... could not be resolved`；历史重写移除了测试引用的对象         | 模型清理历史时改变了仓库对象                                      | 否（模型实现）        |

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：前后两批各 10 个新任务、每任务初轮 1 次尝试；首批 3 个有效失败任务与第二批 3 个有效 0.0 任务各追加了 3 次重复，另对 2 个命令超时任务做了 600 秒新配置重跑；单 VM；不能与官方榜单或 pilot/扩展批次合并。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **异常不是模型分数**：`chess-best-move`、`crack-7z-hash`、`extract-elf`、第二批重复中的 `filter-js-from-html`/`fix-ocaml-gc` 的 300 秒命令超时是 agent 配置；`circuit-fibsqrt` 与 `regex-chess` 的 502 是模型端点/适配器基础设施错误。均不应计入模型通过率。`crack-7z-hash` 与 `fix-ocaml-gc` 在 600 秒新配置下已干净通过；`extract-elf` 即使 600 秒仍超时。
- **有效 0.0 是模型/agent 行为，但存在明显波动**：首批三个验证失败均来自任务测试断言，不是 harness 崩溃；追加重复显示 `git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3。第二批三个有效 0.0 的 3 次重复显示 `gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效尝试通过、`fix-ocaml-gc` 1/2 干净有效尝试通过；600 秒重跑后 `fix-ocaml-gc` 2/2 干净通过，`filter-js-from-html` 仍 0/2。`gcode-to-text` 与 `filter-js-from-html` 应按稳定失败处理，`fix-ocaml-gc` 主要受 300 秒命令上限影响。
- **样本小**：每任务初轮仅 1 次，追加重复各覆盖 3 个任务（每任务 3 次），600 秒重跑覆盖 4 个任务（1-2 次）；不能估计总体通过率或置信区间；任务难度差异大，跨批次平均无意义。
- **产品能力未覆盖**：本卡没有运行 NeonForge Electron UI、真实审批或真实工具注册表。

## 结论

- **可用结论**：自定义最小 agent 在首批 10 个新 Terminal-Bench 任务中初轮 5/8 有效评估通过（62.5%）；追加重复后，3 个失败任务合计 6/9 通过（66.7%）。第二批 10 个新任务中 4/7 有效评估通过（57.1%）；对 3 个有效 0.0 做 3 次重复后，干净有效尝试仅 1/7（14.3%）通过，`gcode-to-text`（0/3）与 `filter-js-from-html`（0/2 有效）基本稳定失败，`fix-ocaml-gc`（1/2 干净有效，另有 1 次超时但验证器 1.0）高波动。600 秒单命令重跑中，`crack-7z-hash` 通过、`fix-ocaml-gc` 2/2 干净通过，`filter-js-from-html` 仍 0/2（无异常），`extract-elf` 仍超时。因此 `filter-js-from-html`、`gcode-to-text` 是稳定失败，`fix-ocaml-gc` 的失败主要来自 300 秒命令上限，`extract-elf` 需要 >600 秒或不同方案。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把首批 62.5%/66.7%、第二批 57.1% 或重复 14.3% 当作模型总体能力；不能把 300 秒/600 秒命令超时或 502 上游错误当作模型失败；不能把结果归因于 NeonForge 产品审批/工具链。
- **下一步**：`gcode-to-text`、`filter-js-from-html` 已按稳定失败记录，除非引入新 agent/提示/预算，不再重复；`fix-ocaml-gc` 在 600 秒配置下 2/2 通过，后续统一使用 600 秒或记录为配置差异；`extract-elf` 需 >600 秒单命令、不同 agent/策略或任务特定分析；`crack-7z-hash` 的 600 秒结果已单独记录；继续观察适配器是否仍有 502（已加一次 `fetch` TypeError 重试）；对 `sanitize-git-repo` 再增加重复或分析失败轨迹；继续扩大任务覆盖；`gpt2-codegolf` 仍需更长超时/轮次预算的单独评估。
