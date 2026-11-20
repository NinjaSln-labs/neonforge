# 外部评估覆盖总览（截至 2026-11-18）

本页汇总当前已完成的外部基准能力卡，便于快速查看“测了什么、得到什么、还不能说什么”。
所有结果均为 **模型 + 固定 harness / 适配器** 的评估信号，不是 NeonForge 完整产品认证。

## 运行环境

| 项 | 值 |
|----|----|
| 模型 / Provider | 本机 Magpie；本页已汇总卡片多数使用 `opendesign/deepseek-v4.1-flash`；2026-11-18 起后续评估默认 **DSV4.1FE-OD**（API model id `opendesign/deepseek-v4.1-flash-eco`）。二者是同一模型，后者为 eco/慢速模式，分数按同一模型解释，但需注明模式差异 |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`） |
| BFCL harness | `bfcl-eval==2026.3.23`（BFCL v4） |
| AgentDojo harness | `agentdojo==0.1.35`（benchmark v1.2.2） |
| 沙箱 | 一次性 Docker；只读根、非 root、cap-drop、no-new-privileges、PID/内存/CPU 限制、`nf-eval-internal` 内部网络 |
| Terminal-Bench 沙箱 | 一次性 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU/8 GB/100 GB、Docker 29.1.3 + Harbor 0.26.0；任务容器不挂宿主 Docker socket；VM 用完即弃 |
| 凭据 | 只从宿主环境变量注入；Magpie Key 不进入评估容器 |

## 覆盖与关键结果

| 评估 | 范围 | 关键结果 | 能力卡 |
|------|------|----------|--------|
| BFCL 24 题子集 | `simple_python` 10 + `multiple` 4 + `parallel` 5 + `irrelevance` 5；`--run-ids` + `--partial-eval` | product 21-22/24（87.5-91.7%）；none 20-23/24（83.3-95.8%） | `2026-11-17-magpie-dsv41f-adapter-baseline.md` |
| BFCL 十四类全量 | 单轮/实时 13 类 + `multi_turn_base`；3641 + 200 题；非 partial-eval | **2896/3841 = 75.40%**；`simple_python` 92.25%、`parallel` 90.00%；`simple_javascript` 44.00%、`multi_turn_base` 56.00% | `2026-11-18-magpie-bfcl-category-full.md` |
| BFCL `multi_turn_long_context` 全量 | 200 题；非 partial-eval；DSV4.1FE-OD（eco） | **92/200 = 46.00%**；平均 82.2 秒/题；108 题无效（状态不一致/缺少执行结果） | `2026-11-18-magpie-bfcl-multi-turn-long-context.md` |
| BFCL `multi_turn_miss_func` 全量 | 200 题；非 partial-eval；DSV4.1FE-OD（eco） | **89/200 = 44.50%**；平均 103.5 秒/题；111 题无效；928 次轮次结束日志与 930 个轮次基本 1:1（非崩溃） | `2026-11-18-magpie-bfcl-multi-turn-miss-func.md` |
| BFCL `multi_turn_miss_param` 全量 | 200 题；非 partial-eval；DSV4.1FE-OD（eco） | **79/200 = 39.50%**；平均 77.3 秒/题；121 题无效；930 次轮次结束日志与 931 个轮次基本 1:1；12 题首轮空响应待抽查 | `2026-11-18-magpie-bfcl-multi-turn-miss-param.md` |
| AgentDojo 无防御 | `workspace` 3 用户任务 × 2 注入，3 次 | 效用 6/6；注入成功 0/6；tool_filter 效用 0/6 | `2026-11-17-magpie-dsv41f-adapter-baseline.md` |
| 策略门 v1 | `workspace` 3 用户任务 × 2 注入，3 次 | strict 6/6、6/6、5/6；standard/delegated 6/6；注入成功 0/6 | `2026-11-17-magpie-policy-gate-v1.md` |
| 策略门 v2 | `workspace` 6 用户任务 × 2 注入 | off 12/12；strict 6/12；standard 10/12；delegated 10/12、11/12；注入成功 0/12 | `2026-11-18-magpie-policy-gate-v2.md` |
| 审批回调 | 10 用户任务 × 2 注入；approve-local / deny-all / approve-all 各 3 次 | approve-local 75%/70%/80%；deny-all 30%；approve-all 100%/95%/100%；注入成功均 0/20 | `2026-11-18-magpie-policy-gate-v2-approval.md` |
| `tool_knowledge` 攻击 | 6 用户任务 × 2 注入；容忍模式 3 次 + 默认模式 2 次完成 | off 约 92-100%；strict 50%；standard 75-83.33%；delegated 100%；注入成功 0/60；默认模式 3 次尝试中 1 次崩溃 | `2026-11-18-magpie-policy-gate-v2-tool-knowledge.md` |
| `ignore_previous` / `injecagent` | 6 用户任务 × 2 注入；每种攻击四档各 3 次 | `ignore_previous` 均值：off 11.33/12、strict 6/12、standard 9.67/12、delegated 10/12；`injecagent`：11.33/12、6/12、9.67/12、11.67/12；两种攻击合计 288 配对，注入成功 0 | `2026-11-18-magpie-policy-gate-v2-ignore-previous-injecagent.md` |
| `system_message` / `direct` | 6 用户任务 × 2 注入；每种攻击四档各 3 次 | `system_message` 均值：off 12/12、strict 6/12、standard 9.67/12、delegated 11.67/12；`direct`：11.67/12、6/12、9.67/12、11.33/12；两种攻击合计 288 配对，注入成功 0 | `2026-11-19-magpie-policy-gate-v2-system-message-direct.md` |
| Terminal-Bench 2.0 试点 | 专用 KVM VM；`terminal-bench@2.0`；oracle 自检；内置 `terminus-2` + 自定义 `neonforge-terminal`；5 个任务 | 内置 agent 3/3 有效运行通过；自定义 agent 2/2 有效运行通过；`gpt2-codegolf` 60 分钟超时、`regex-log` 一次 setup 异常，均不计分；4/5 个任务至少在一种 agent 下干净通过 | `2026-11-19-terminal-bench-pilot.md` |
| Terminal-Bench 2.0 pilot 重复 | 4 个 pilot 任务 × 3 次尝试（12 trials，2 并发）；自定义 agent | 11/12 reward 1.0；唯一 0.0 是验证器 apt/curl 网络失败、未评估模型；11/11 可评估尝试通过；3/4 任务 3/3 | `2026-11-19-terminal-bench-pilot.md`（追加节） |
| Terminal-Bench 2.0 扩展重复 | 10 个新任务 × 3 次尝试（30 trials，2 并发）；仅自定义 `neonforge-terminal` | 有效运行 25/29 = 86.2%；Harbor mean 0.833（异常按 0）；10/10 任务至少一次通过，6/10 任务 3/3 通过；1 次命令超时异常 | `2026-11-19-terminal-bench-expanded.md` |
| Terminal-Bench 2.0 首批广度 | 另外 10 个新任务 × 1 次尝试（2 并发）；自定义 agent；3 个失败任务追加 ×3 重复 | 初轮 5 通过、3 个有效 0.0、2 个异常（300 秒命令超时与 502 上游），有效通过 5/8 = 62.5%；追加重复 6/9 = 66.7%（`git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3） | `2026-11-19-terminal-bench-breadth.md` |
| Terminal-Bench 2.0 第二批广度 | 再 10 个新任务 × 1 次尝试（2 并发）；自定义 agent | 4 通过、3 个有效 0.0、3 个异常（2 个 300 秒命令超时 + 1 个适配器瞬时 502）；有效通过 4/7 = 57.1%（异常按 0 为 4/10）；前置 `10d` 因 VM `HTTP_PROXY` 未豁免本地中继，10/10 首次调用 502，整轮排除；该批后累计 35/89 个任务 | `2026-11-19-terminal-bench-breadth.md`（追加节） |
| Terminal-Bench 2.0 第二批 0.0 重复 | 3 个有效 0.0 任务 × 3 次尝试（9 trials，2 并发）；相同 40 轮/300 秒配置 | 2 个 300 秒命令超时异常；干净有效尝试 1/7 = 14.3%；`gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效、`fix-ocaml-gc` 1/2 干净有效（另有 1 次超时但验证器 1.0）；token 10,379,402 / 318,798 | `2026-11-19-terminal-bench-breadth.md`（追加节） |
| Terminal-Bench 2.0 600 秒单命令重跑 | `crack-7z-hash`、`extract-elf` 各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` 新配置 | `crack-7z-hash` 干净通过（1.0，13 条命令，3m03s）；`extract-elf` 600 秒仍超时（异常，22m03s）；有效通过 1/1，异常按 0 为 1/2；Harbor mean 0.5 | `2026-11-19-terminal-bench-breadth.md`（追加节） |
| Terminal-Bench 2.0 600 秒零任务重跑 | `filter-js-from-html`、`fix-ocaml-gc` 各 2 次；同样 600 秒新配置 | 无异常，2/4 = 50%；`fix-ocaml-gc` 2/2 干净通过，`filter-js-from-html` 0/2；token 6,623,552 / 198,285 | `2026-11-19-terminal-bench-breadth.md`（追加节） |
| Terminal-Bench 2.0 第三批广度 | 再 10 个新任务 × 1 次尝试（2 并发）；自定义 agent；300 秒基准配置 | 8 通过、2 个有效 0.0、0 异常；有效通过 8/10 = 80.0%；token 4,781,089 / 166,022；累计 45/89 个任务 | `2026-11-19-terminal-bench-breadth-3.md` |
| Terminal-Bench 2.0 第三批 0.0 的 300 秒重复 | 2 个任务 × 3 次；300 秒基准配置 | **整轮异常，不计模型结果**：4 次 300 秒命令超时 + 2 次适配器 `Headers Timeout Error` 502；6/6 异常 | `2026-11-19-terminal-bench-breadth-3.md`（追加节） |
| Terminal-Bench 2.0 第三批 0.0 的 600 秒重复 | 2 个任务 × 3 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` 新配置；修复后的原生 HTTP 适配器 | 干净有效尝试 2/5 = 40.0%（`adaptive-rejection-sampler` 1/3、`count-dataset-tokens` 1/2 有效）；另 1 次 600 秒超时异常；全部 6 trials 2/6 = 33.3%，无 502；token 9,422,647 / 290,425 | `2026-11-19-terminal-bench-breadth-3.md`（追加节） |
| Terminal-Bench 2.0 第四批广度 | 再 10 个新任务 × 1 次尝试（2 并发）；自定义 agent；300 秒基准配置 | 7 通过、0 个有效 0.0、3 个 300 秒命令超时异常；有效通过 7/7 = 100%，异常按 0 为 7/10 = 70.0%；token 1,139,763 / 69,228；累计 55/89 个任务 | `2026-11-20-terminal-bench-breadth-4.md` |
| Terminal-Bench 2.0 第四批超时任务 600 秒重跑 | 3 个异常任务各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` 新配置 | 0/3 通过；`bn-fit-modify`/`code-from-image` 仍 600 秒超时异常；`dna-assembly` 无异常但验证器 0.0（37 条命令）；token 1,997,220 / 83,797 | `2026-11-20-terminal-bench-breadth-4.md`（追加节） |
| Terminal-Bench 2.0 第四批超时任务 1200 秒重跑 | `bn-fit-modify`、`code-from-image` 各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=1200` 新配置 | 1/2 通过、0 异常；`bn-fit-modify` 干净通过（16 条命令，13m40s）；`code-from-image` 无异常但验证器 0.0（39 条命令，10m04s）；token 943,684 / 37,833 | `2026-11-20-terminal-bench-breadth-4.md`（追加节） |
| Terminal-Bench 2.0 第五批广度 | 再 10 个新任务 × 1 次尝试（2 并发）；自定义 agent；300 秒基准配置 | 4 通过、4 个有效 0.0、2 个 300 秒命令超时异常；有效通过 4/8 = 50.0%，异常按 0 为 4/10 = 40.0%；token 11,563,418 / 255,868；累计 65/89 个任务 | `2026-11-20-terminal-bench-breadth-5.md` |
| Terminal-Bench 2.0 第五批超时任务 600 秒重跑 | 2 个异常任务各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` 新配置 | 1/2 通过、0 异常；`model-extraction-relu-logits` 干净通过（17 条命令，10m39s）；`extract-moves-from-video` 无异常但验证器 0.0（43 条命令，23m42s）；token 1,031,652 / 53,515 | `2026-11-20-terminal-bench-breadth-5.md`（追加节） |
| Terminal-Bench 2.0 第六批广度 | 计划 10 个新任务 ×1；`mteb-retrieve` 镜像拉取失败未评估；实际 9 个任务 ×1（2 并发）；300 秒基准配置 | 3 通过、4 个有效 0.0、2 个 300 秒命令超时异常；有效通过 3/7 = 42.9%，异常按 0 为 3/9 = 33.3%；token 3,575,549 / 215,088；累计评估 74/89 个任务 | `2026-11-20-terminal-bench-breadth-6.md` |
| Terminal-Bench 2.0 第六批超时任务 600 秒重跑 | `qemu-alpine-ssh`、`train-fasttext` 各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` 新配置 | 0/2 通过、1 异常；`qemu-alpine-ssh` 无异常但验证器 0.0（37 条命令，13m58s）；`train-fasttext` 仍 600 秒超时（35m47s）；token 1,393,627 / 33,292 | `2026-11-20-terminal-bench-breadth-6.md`（追加节） |
| Terminal-Bench 2.0 第七批广度 | 再 10 个新任务 × 1 次尝试（2 并发）；自定义 agent；300 秒基准配置 | 4 通过、4 个有效 0.0、2 个异常（`torch-pipeline-parallelism` 300 秒命令超时 + `torch-tensor-parallelism` 验证器 900 秒 `VerifierTimeoutError`）；有效通过 4/8 = 50.0%，异常按 0 为 4/10 = 40.0%；token 10,978,401 / 301,059；Harbor mean 0.444（9 个计分 trial）；累计 84/89 个任务 | `2026-11-20-terminal-bench-breadth-7.md` |
| Terminal-Bench 2.0 第七批异常任务 600 秒 + verifier ×4 重跑 | `torch-pipeline-parallelism`、`torch-tensor-parallelism` 各 1 次；`NEONFORGE_COMMAND_TIMEOUT_SEC=600` + `--verifier-timeout-multiplier 4` 新配置 | 1/2 通过、0 异常；`torch-tensor-parallelism` 干净通过（29 条命令，13m33s）；`torch-pipeline-parallelism` 无异常但验证器 0.0（39 条命令，25m03s）；token 2,415,772 / 80,528 | `2026-11-20-terminal-bench-breadth-7.md`（追加节） |

## 覆盖图（BFCL v4）

| 类别组 | 题量 | 状态 |
|--------|------|------|
| 核心四类（simple_python / multiple / parallel / irrelevance） | 1040 | ✅ 全量 |
| 扩展七类（parallel_multiple / Java / JavaScript / live_simple / live_parallel / live_parallel_multiple / live_relevance） | 664 | ✅ 全量 |
| 两个 live 大类（live_multiple / live_irrelevance） | 1937 | ✅ 全量 |
| `multi_turn_base` | 200 | ✅ 全量 |
| `multi_turn_long_context` | 200 | ✅ 全量（46.00%，108 题无效，见能力卡） |
| `multi_turn_miss_func` | 200 | ✅ 全量（44.50%，111 题无效，见能力卡） |
| `multi_turn_miss_param` | 200 | ✅ 全量（39.50%，121 题无效，见能力卡） |
| `memory` | 155 | ⏳ 不跑：BFCL 合成 memory API 与 NeonForge 产品无对应工具；576 个 checkpoint、串行约 7-10 小时 |
| `web_search` | 100 | ⏭ 按范围取消：用户明确不做 SerpAPI 依赖；BFCL 合成搜索 API 与 NeonForge 自有 `web_search`（`NEONFORGE_SEARCH_KEY` 端点）不等价 |
| `format_sensitivity` | 10 | ⏭ 跳过：对 FC 模型不适用 |
| **合计** | **4706** | **4441 已覆盖（94.4% 题量）** |

## 不能声称的内容

- 不能称为“BFCL v4 完整成绩”或官方榜单排名；仅覆盖 17/20 类，且模型别名、适配器、Magpie 路由与官方评测不同。
- 不能把 `multi_turn_long_context` 46.00%、`multi_turn_miss_func` 44.50% 或 `multi_turn_miss_param` 39.50% 当作官方口径或模型能力的干净分数；handler、适配器与 Magpie 路由均与官方设置不同，且均为单次运行。三个类别的轮次结束日志（731/732、928/930、930/931）都是自然语言结束轮次的预期路径，不是崩溃；`miss_param` 另有 12 题首轮空响应待抽查。
- 不能把 AgentDojo 的 0% 注入成功全部归因于策略门；无门基线中模型本身已拒绝多数注入，结果属于 defense-in-depth。
- 不能把审批回调的 `approve-all` 高效用当作推荐配置；模拟审批端不是人类审批 UI。
- 不能把单次或 3 次运行当作统计显著结论；模型输出波动明显。
- 不能把评估门当作独立内核/沙箱边界；它是进程内 monkey-patch。
- 注入攻击目前覆盖 `important_instructions`、`tool_knowledge`、`ignore_previous`、`injecagent`、`system_message`、`direct` 六种；每种至少 3 次或 60 配对，但仍不足以给出置信区间，不能当作稳定安全保证；默认模式下 malformed tool arguments 仍可能导致 `JSONDecodeError`。
- Terminal-Bench 2.0 目前只有 pilot 的 5 个任务、扩展批次的 10 个新任务（每个 3 次尝试）、前五批广度各 10 个新任务、第六批 9 个新任务（每任务 1 次尝试）以及第二/三批部分 0.0 任务的重复，合计 74/89 个任务；`mteb-retrieve` 因镜像拉取失败未评估；不能称其为完整 Terminal-Bench 成绩。pilot 同时使用内置 `terminus-2` 与自定义 `neonforge-terminal`，扩展/广度批次仅用自定义 agent；不能合并两个 agent 或跨批次的平均分，也不能把 `gpt2-codegolf` 的 60 分钟 `AgentTimeoutError`、`password-recovery`/`crack-7z-hash`/`extract-elf` 的 300 秒命令超时、`circuit-fibsqrt`/`regex-chess` 的 502 上游错误当作模型必然失败；`tbench2-breadth-10d` 的 10/10 首次调用 502 是 VM 代理配置错误，不进入任何模型统计。第二批 3 个 0.0 的重复显示干净有效尝试仅 1/7 通过（`gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效、`fix-ocaml-gc` 1/2 干净有效），不能继续称为“单次波动”；600 秒新配置下 `crack-7z-hash` 通过、`fix-ocaml-gc` 2/2 通过、`filter-js-from-html` 仍 0/2、`extract-elf` 仍超时，均属单独配置结果，不能混入 300 秒批次分数。第三批广度 8/10 通过，但任务集合不同且可能偏易，不能与前两批的 62.5% / 57.1% 合并或平均；2 个有效 0.0 的 300 秒重复轮因 4 次命令超时与 2 次 undici headers-timeout 502 整轮异常，600 秒修复后重复为干净有效 2/5 = 40.0%（`adaptive-rejection-sampler` 1/3、`count-dataset-tokens` 1/2 有效），说明初轮 0.0 主要是波动，不能称为稳定失败。第四批广度 7/10 通过，但 3 个异常均为 300 秒命令超时，有效尝试 7/7 = 100%；600 秒重跑后 `bn-fit-modify`/`code-from-image` 仍超时、`dna-assembly` 为有效 0.0；1200 秒重跑后 `bn-fit-modify` 通过、`code-from-image` 为有效 0.0；第五批广度 4/10 通过、4 个有效 0.0、2 个 300 秒命令超时异常（有效 4/8 = 50.0%），600 秒重跑后 `model-extraction-relu-logits` 通过、`extract-moves-from-video` 为有效 0.0；第六批计划 10 个任务但 `mteb-retrieve` 镜像拉取失败未评估，实际 9 个中 3/9 通过、4 个有效 0.0、2 个 300 秒命令超时异常（有效 3/7 = 42.9%），600 秒重跑后 `qemu-alpine-ssh` 为有效 0.0、`train-fasttext` 仍超时；第七批广度 4/10 通过、4 个有效 0.0、2 个异常（300 秒命令超时与验证器 900 秒超时，有效 4/8 = 50.0%）；第七批 2 个异常在 600 秒 + verifier ×4 下重跑为 1/2 通过、0 异常（`torch-tensor-parallelism` 通过、`torch-pipeline-parallelism` 有效 0.0）；均属单独配置结果，任务集合不同，不能与前几批合并或平均，也不能把镜像拉取失败当作模型失败。

## 缺口与下一步

1. **BFCL 剩余 265 题**：四个 multi-turn 类别均已完成；轮次结束日志与用户轮次基本 1:1，不是需要修复的故障；`miss_param` 的 12 题首轮空响应仍需抽查。
   - `memory`（155）不跑：BFCL 测试的是合成 Core/Archival Memory 工具，NeonForge 没有对应产品工具（仅有拒绝记忆与会话状态）；4 线程实测 7 分钟仅 6/576，成本高且不代表产品能力。
   - `web_search`（100）按范围取消：用户明确不做 SerpAPI 依赖；NeonForge 的 `web_search` 使用自有搜索端点（`NEONFORGE_SEARCH_KEY`），不能拿 BFCL 合成搜索 API 冒充产品能力。
   - `format_sensitivity`（10）对 FC 模型跳过。
   - 不以离线 mock 或替换搜索后端凑覆盖率；如需评估产品 `web_search`，应另建产品级测试。
2. **重复运行**：BFCL 十七类目前每类 1 次；优先对四类核心与四个 multi-turn 类别做 ≥3 次重复。
3. **Terminal-Bench 2.0（试点 + 扩展重复 + 七批广度完成）/ SWE-bench（仍缺）**：pilot 见 `2026-11-19-terminal-bench-pilot.md`（含 4 任务 ×3 重复，11/11 可评估通过）；扩展批次 10 个新任务 × 3 次尝试见 `2026-11-19-terminal-bench-expanded.md`（有效运行 25/29 = 86.2%，10/10 任务至少一次通过，6/10 任务 3/3 通过）；首批广度 10 个新任务 × 1 次尝试见 `2026-11-19-terminal-bench-breadth.md`（5/8 有效通过，3 个失败任务追加 ×3 重复，6/9 通过）；第二批广度 10 个新任务 ×1（同卡追加节，4/7 有效通过，3 个异常）；该批 3 个有效 0.0 各做 3 次重复（9 trials），干净有效尝试 1/7 = 14.3%（`gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效、`fix-ocaml-gc` 1/2 干净有效，另有 1 次超时但验证器 1.0）；600 秒单命令新配置重跑 `crack-7z-hash` 通过、`extract-elf` 仍超时；另对 `filter-js-from-html`/`fix-ocaml-gc` 各 2 次 600 秒重跑，前者仍 0/2、后者 2/2 干净通过（无异常）；第三批广度 10 个新任务 ×1 见 `2026-11-19-terminal-bench-breadth-3.md`（8/10 有效通过，0 异常，`adaptive-rejection-sampler`/`count-dataset-tokens` 为有效 0.0）。第三批 2 个 0.0 已在 600 秒配置下各重复 3 次（干净有效 2/5，另 1 次 600 秒超时异常；300 秒重复轮 6/6 异常，整体排除），初轮 0.0 主要是波动；如需更高置信度可继续增加 600 秒重复；第四批广度 10 个新任务 ×1 见 `2026-11-20-terminal-bench-breadth-4.md`（7/10 通过，3 个 300 秒命令超时异常，有效尝试 7/7；600 秒重跑后 `bn-fit-modify`/`code-from-image` 仍超时、`dna-assembly` 为有效 0.0）；第五批广度 10 个新任务 ×1 见 `2026-11-20-terminal-bench-breadth-5.md`（4/10 通过，4 个有效 0.0，2 个 300 秒命令超时异常，有效尝试 4/8 = 50.0%；600 秒重跑后 `model-extraction-relu-logits` 通过、`extract-moves-from-video` 为有效 0.0）；第六批计划 10 个任务，`mteb-retrieve` 镜像拉取失败未评估，实际 9 个任务 ×1 见 `2026-11-20-terminal-bench-breadth-6.md`（3/9 通过，4 个有效 0.0，2 个 300 秒命令超时异常，有效尝试 3/7 = 42.9%；600 秒重跑后 `qemu-alpine-ssh` 为有效 0.0、`train-fasttext` 仍超时）；第七批广度 10 个新任务 ×1 见 `2026-11-20-terminal-bench-breadth-7.md`（4/10 通过，4 个有效 0.0，2 个异常：1 个 300 秒命令超时 + 1 个验证器 900 秒超时，有效尝试 4/8 = 50.0%；600 秒 + verifier ×4 重跑后 `torch-tensor-parallelism` 通过、`torch-pipeline-parallelism` 为有效 0.0）；`gcode-to-text`、`filter-js-from-html` 按稳定失败记录，除引入新 agent/提示/预算外不再重复；`fix-ocaml-gc` 统一用 600 秒配置或记录配置差异；`extract-elf` 需 >600 秒、不同 agent/策略或任务特定分析；适配器已改用原生 `node:http/https` 并新增 headers 超时配置（PR #78），继续观察是否仍有 502；对 `dna-assembly`、`code-from-image` 的有效 0.0 增加重复；`bn-fit-modify` 已在 1200 秒配置下通过；对第五批 4 个有效 0.0（`mailman`、`make-doom-for-mips`、`make-mips-interpreter`、`qemu-startup`）增加重复或分析测试断言；`extract-moves-from-video` 可按 600 秒配置重复；对第六批 4 个有效 0.0（`dna-insert`、`pytorch-model-cli`、`raman-fitting`、`winning-avg-corewars`）增加重复或分析测试断言；`qemu-alpine-ssh` 可按 600 秒配置重复；`train-fasttext` 用 1200 秒或不同 agent/策略单独评估；`mteb-retrieve` 需解决镜像拉取后再评估；对 `sanitize-git-repo` 增加重复或分析失败轨迹；`gpt2-codegolf` 已做两次放宽预算尝试：60 轮/600 秒单命令在 35m37s 因命令超时结束；60 轮/1200 秒单命令在 43m01s 得到无异常 0.0（预算耗尽），需更强 agent/更长轮次或专门方案。SWE-bench 仍需独立的每实例容器执行适配器与固定镜像摘要。
4. **真实审批 UI（部分完成）**：产品 ToolRegistry 44 项单测 + trustModes UI 3 项通过，见 `2026-11-19-neonforge-approval-boundary.md`；`decide` 裁决入口已抽出。外部基准仍用模拟审批端；桥接设计见 `../product-toolregistry-bridge-design.md`：阶段 2 sidecar 经复核暂不做（synthetic 工具映射会取代产品真实语义），执行桥暂不做；尚无人类审批链路。
5. **治理评估**：ISO/IEC 25010、NIST AI RMF / ISO/IEC 42001 差距评估与 SUS/HEART 计划已完成初版，见 `../governance-gap-assessment-2026-11-18.md`；AI 风险登记册初版见 `../ai-risk-register-2026-11-19.md`；威胁模型初版见 `../threat-model-2026-11-19.md`；事件响应 Runbook 初版见 `../incident-response-runbook-2026-11-19.md`；SLO 测量计划初版见 `../slo-and-performance-plan-2026-11-19.md`；SUS/HEART 研究套件初版见 `../sus-heart-study-kit-2026-11-19.md`；AI 管理方针初版见 `../ai-management-policy-2026-11-19.md`；AI 辅助可用性走查（3/3 脚本场景、8 张截图、6 项启发式发现，非人类研究）见 `../ai-walkthrough-2026-11-19.md`。真实 SUS/HEART 数据、产品级性能基线、渗透测试、真实演练与正式角色任命仍缺。
