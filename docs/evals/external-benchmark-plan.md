# 外部基准评估方案（NeonForge Agent 工作台）

- 生效日期：2026-11-17
- 状态：v1.39（模型级基线 + 适配器 v0（原生 HTTP、显式 headers 超时、连接重置重试）+ 策略门 v2 + 审批回调基准 + BFCL 十七类全量（4441/4706）+ 六种注入攻击（合计 648 配对）+ 产品审批边界证据（`decide` 已抽出）+ ToolRegistry 桥接设计（阶段 2 复核后暂不做）+ 治理差距评估/风险登记册/威胁模型/事件响应 Runbook/SLO 计划/SUS·HEART 套件/AI 管理方针/AI 辅助可用性走查初版 + Terminal-Bench 2.0 专用 KVM VM 试点 + pilot 4 任务 × 3 次重复（11/11 可评估通过）+ 十任务 × 3 次重复（29 次有效尝试 25 通过，异常按 0 的 Harbor mean 0.833；两个 agent 分开报告）+ 首批十任务广度（5/8 有效通过；3 个失败任务追加 ×3 重复，6/9 通过）+ 第二批十任务广度（4/7 有效通过，3 个配置/基础设施异常）+ 第二批 3 个 0.0 的 3 次重复（干净有效 1/7）+ 600 秒单命令重跑（crack 通过、fix-ocaml 2/2、filter 仍 0/2、extract 仍超时）+ 第三批十任务广度（8/10 有效通过，0 异常）+ 其 2 个 0.0 的 600 秒重复（干净有效 2/5，另 1 次超时异常；300 秒重复轮整轮异常已排除）+ 第四批十任务广度（7/10 通过，3 个 300 秒命令超时异常；600 秒重跑后 2 个仍超时、1 个有效 0.0；1200 秒后 bn 通过、code 有效 0.0）+ 第五批十任务广度（4/10 通过，2 个 300 秒命令超时异常；600 秒重跑后 1 个通过、1 个有效 0.0）+ 第六批九任务广度（mteb-retrieve 镜像拉取失败未评估；3/9 通过，2 个 300 秒命令超时异常；600 秒重跑后 1 个有效 0.0、1 个仍超时）+ 第七批十任务广度（4/10 通过，4 个有效 0.0，2 个异常：1 个 300 秒命令超时 + 1 个验证器 900 秒超时；有效 4/8 = 50.0%；600 秒 + verifier ×4 重跑后 1 个通过、1 个有效 0.0）+ 第八批四任务广度（0/4 通过，1 个有效 0.0，3 个 300 秒命令超时异常；有效 0/1 = 0.0%；600 秒重跑后 1 个通过、1 个有效 0.0、1 个仍超时）+ `mteb-retrieve` 补跑（8.63 GB 镜像大层长超时拉取成功；1/1 通过）+ 第七批 4 个有效 0.0 的 3 次重复（12 trials；干净有效 0/7，2 个超时 trial 验证器 1.0，Harbor mean 0.167）+ 第八批 2 个有效 0.0 的 3 次重复（`mteb-leaderboard` 300 秒、`install-windows-3.11` 600 秒；6 trials 全部有效 0.0、0 异常）+ `caffe-cifar-10` 1200 秒仍超时、2400 秒有效 0.0（58 条命令）；累计评估 89/89 个任务；评估默认模型已改用 DSV4.1FE-OD（同一模型的 eco/慢速模式）；memory 不跑、web_search 按范围取消、format 跳过；外部基准接真实审批 UI / 真实 SUS·HEART 数据待接入）
- 关联：`docs/evals/capability-card-template.md`、`evals/sandbox/`、ADR-012（测完再修）

## 1. 目标与非目标

**目标**：用公开、可复现的第三方基准，给 NeonForge 的能力建立可比较的“能力卡”，而不是追求一个并不存在的“综合能力总榜”。

**非目标**：

- 不把内部 L1-L5 回归测试冒充外部能力基准。
- 不在宿主机上直接运行可能执行任意命令/注入内容的 Agent 基准。
- 不在仓库写入任何凭据值；模型 Key 只经环境变量注入沙箱。
- 不把子集分数与官方榜单直接横比。

## 2. 基准选择

| 维度 | 基准 | 本期采用 | 说明 |
|------|------|----------|------|
| 工具调用 | BFCL v4（UC Berkeley） | ✅ 子集 + 十七类全量 | 官方 `bfcl-eval`；DeepSeek 路径用 DeepSeek 官方 handler，Magpie 路径用通用 OpenAI-compatible FC handler；子集使用 `--run-ids` + `--partial-eval`；十四类 3841 题 + 三个 multi-turn 变体各 200 题（long_context / miss_func / miss_param），共 4441 题 |
| 提示注入韧性 | AgentDojo（ETH Zurich） | ✅ 子集 | 官方 `agentdojo`，`workspace` suite；已覆盖 `important_instructions`、`tool_knowledge`、`ignore_previous`、`injecagent`、`system_message`、`direct` 六种攻击；仅作模型级安全信号 |
| 产品级适配 | NeonForge 无头适配器 v0 | ✅ 子集 | 产品系统提示（可选）+ provider 传输语义 + `toolCallRepair` |
| 产品级执行门 | NeonForge 策略门 v2 | ✅ 子集 | AgentDojo `FunctionsRuntime.run_function` 执行门；`deny > ask > allow`，`PermissionRule(specifier)`，信任阶梯，`ask` fail-closed；`gate.decided` JSONL |
| 终端任务 | Terminal-Bench 2.0（Harbor） | 🧪 专用 VM 试点 | 一次性 QEMU/KVM VM 内 Docker；`terminal-bench@2.0`；Harbor 0.26.0；oracle 1/1；仅 5 个任务，非官方完整成绩 |
| 软件工程 | SWE-bench Verified / Pro | ⏳ 下一阶段 | 每实例容器、成本高；需 NeonForge 无头执行适配器 |
| 职场综合任务 | TheAgentCompany | ⏳ 下一阶段 | 需要模拟公司环境与浏览器/邮件服务 |
| 桌面 GUI | OSWorld | ❌ 不适用 | NeonForge 当前不是屏幕级 computer-use Agent |
| 长时程自主 | METR task suite | ⏳ 观察 | 成本与准入要求高，先作为外部审计选项 |

## 3. 专用沙箱（强制）

所有外部基准必须在**一次性容器**中运行，禁止直接在 WSL/macOS 宿主机执行：

- 只读根文件系统；仅输出目录可写；`/tmp` 为 tmpfs。
- 非 root 运行（使用宿主 UID/GID，避免输出目录权限漂移）。
- `--cap-drop=ALL --security-opt=no-new-privileges`。
- `--pids-limit`、`--memory`、`--cpus` 限制，防 fork 炸弹/内存耗尽。
- 不挂载宿主仓库、Home、SSH、云凭据；只挂载结果目录。
- 模型 Key 通过 `-e DEEPSEEK_API_KEY` 从宿主环境注入，不落盘、不出现在命令行参数。
- 评估容器只加入 `nf-eval-internal` 内部网络；出站仅经 Squid 白名单代理，默认只允许 `api.deepseek.com:443`（`evals/sandbox/egress-proxy/`）。
- 本地模型路径（`NF_EVAL_TARGET=magpie`）：评估容器仍只加内部网络，通过单目标 `nf-eval-adapter-relay` 访问宿主适配器；不开放通用出站，适配器只访问本机 Magpie。

## 4. 本期基线范围（成本可控）

- BFCL v4：`simple_python` 10 题 + `multiple` 4 题 + `parallel` 5 题 + `irrelevance` 5 题，共 24 题；单线程。首发 50 题版本在 `multiple_4` 出现长时间等待，基线改用 24 题子集并记录该限制。
- BFCL 类别全量：核心四类 1040 + 扩展七类 664 + 两个 live 大类 1937 + `multi_turn_base` 200 = 3841 题，非 partial-eval；十四类合计 75.40%；结果见 `baselines/2026-11-18-magpie-bfcl-category-full.md`。
- BFCL `multi_turn_long_context`：200 题，非 partial-eval；DSV4.1FE-OD（eco）得 92/200（46.00%），平均 82.2 秒/题；108 题无效（状态不一致/缺少执行结果）。日志中的 731 次 `Error decoding` 与 732 个用户轮次基本 1:1，是自然语言结束轮次的预期路径，不是崩溃；结果见 `baselines/2026-11-18-magpie-bfcl-multi-turn-long-context.md`。
- BFCL `multi_turn_miss_func`：200 题，非 partial-eval；DSV4.1FE-OD（eco）得 89/200（44.50%），平均 103.5 秒/题；111 题无效；928 次轮次结束日志与 930 个用户轮次基本 1:1；结果见 `baselines/2026-11-18-magpie-bfcl-multi-turn-miss-func.md`。
- BFCL `multi_turn_miss_param`：200 题，非 partial-eval；DSV4.1FE-OD（eco）得 79/200（39.50%），平均 77.3 秒/题；121 题无效；930 次轮次结束日志与 931 个用户轮次基本 1:1；12 题首轮空响应待抽查；结果见 `baselines/2026-11-18-magpie-bfcl-multi-turn-miss-param.md`。
- AgentDojo：`workspace` suite，`user_task_0/1/2`，`injection_task_0/1`，攻击 `important_instructions`；分别跑无防御与 `tool_filter` 两组。
- 本地模型链路：`NF_EVAL_TARGET=magpie` 经 `evals/adapter/`（NeonForge 无头适配器 v0）调用本机 Magpie 的 **DSV4.1FE-OD**（API model id `opendesign/deepseek-v4.1-flash-eco`）；`NF_EVAL_PROMPT=product|none` 对照产品系统提示的影响。DSV4.1FE-OD 与原 `opendesign/deepseek-v4.1-flash` 是**同一模型，仅 eco/慢速模式**；既有能力卡仍按同一模型解释，但比较时需注明模式与速度差异。
- 策略门：`NF_GATE_MODE=strict|standard|delegated` 在 AgentDojo 工具执行点按 `deny > ask > allow` 裁决；基准无人类审批，`ask` 按 fail-closed 拒绝；可选 `NF_GATE_APPROVAL_URL` HTTP 审批回调。结果写入 `neonforge-gate.jsonl`。
- 注入攻击：默认 `important_instructions`，可用 `NF_EVAL_ATTACK` 切换；`NF_ADAPTER_TOLERANT_ARGS=1` 可把无法解析的 tool arguments 降级为 `{}`（评估用，默认关闭）。`tool_knowledge` 容忍模式 3 次 + 默认模式 2 次完成：off 约 92-100%、strict 50%、standard 75-83.33%、delegated 100%，安全 0/60；默认模式 3 次尝试中 1 次因 malformed 参数崩溃。
- 审批回调基准：`NF_GATE_APPROVAL_MODE=approve-local|deny-all|approve-all` 在容器内启动模拟审批端，覆盖 10 个用户任务（只读、本地创建/编辑、日历创建含/不含参与者、外部共享），结果见 `baselines/2026-11-18-magpie-policy-gate-v2-approval.md`。
- 新增攻击覆盖：`NF_EVAL_ATTACK=ignore_previous|injecagent`，两种攻击 × 四档各 3 次；合计 288 个配对注入成功均 0；结果见 `baselines/2026-11-18-magpie-policy-gate-v2-ignore-previous-injecagent.md`。
- 继续扩展攻击：`NF_EVAL_ATTACK=system_message|direct`，两种攻击 × 四档各 3 次；288 个配对注入成功均 0；结果见 `baselines/2026-11-19-magpie-policy-gate-v2-system-message-direct.md`。
- Terminal-Bench 2.0 试点：专用 QEMU/KVM VM（Ubuntu 24.04.5、6 vCPU/8 GB/100 GB、Docker 29.1.3 + Harbor 0.26.0）；数据集 `terminal-bench@2.0`（git commit `69671fba…`）；oracle `gpt2-codegolf` 1/1；内置 `terminus-2` 3 次有效运行全部 1.0，另有 1 次 60 分钟超时与 1 次 setup 异常；自定义 `neonforge-terminal` 2 次有效运行全部 1.0（补跑原异常任务 `regex-log`）；5 个任务中 4 个至少有一种 agent 干净通过。追加重复：其中 4 个任务 ×3 次共 12 trials，11/12 reward 1.0，唯一 0.0 为验证器 apt/curl 网络失败、未评估模型；11/11 可评估尝试通过。结果见 `baselines/2026-11-19-terminal-bench-pilot.md`；两个 agent 不得合并为单一平均分。
- Terminal-Bench 2.0 扩展重复：10 个新任务 × 3 次尝试，共 30 trials（2 并发，自定义 `neonforge-terminal`）；有效运行 25/29 = 86.2%，Harbor mean 0.833（异常按 0），10/10 任务至少一次通过，6/10 任务 3/3 通过；1 次 `password-recovery` 命令超时异常为 agent 配置限制。结果见 `baselines/2026-11-19-terminal-bench-expanded.md`。
- Terminal-Bench 2.0 广度批次：首批 10 个新任务 × 1 次尝试（2 并发，自定义 agent）；5 个通过、3 个有效 0.0、2 个异常（命令超时与 502 上游）；有效通过 5/8 = 62.5%；追加 3 个有效失败任务 ×3 次重复，6/9 = 66.7%（`git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3）。第二批追加 10 个新任务 ×1（`tbench2-breadth-10e`）：4 个通过、3 个有效 0.0、3 个异常（2 个 300 秒命令超时 + 1 个适配器瞬时 502）；有效通过 4/7 = 57.1%（异常按 0 为 4/10）；对其中 3 个有效 0.0 各做 3 次重复（`tbench2-b2zero-repeat-3x`，9 trials）：2 个 300 秒命令超时异常、7 个干净有效尝试中仅 1 个通过（14.3%）；`gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效、`fix-ocaml-gc` 1/2 干净有效（另有 1 次超时但验证器 1.0）。另做 600 秒单命令新配置重跑（`tbench2-timeout600-2`）：`crack-7z-hash` 干净通过（1.0，13 条命令），`extract-elf` 600 秒仍超时（异常）；另对 `filter-js-from-html`/`fix-ocaml-gc` 各做 2 次 600 秒重跑（`tbench2-timeout600-zero-4`）：`filter-js-from-html` 仍 0/2、`fix-ocaml-gc` 2/2 干净通过，无异常。先前 `tbench2-breadth-10d` 因 VM 全局 `HTTP_PROXY` 未豁免本地模型中继导致 10/10 首次调用 502，整轮作为环境配置错误排除。累计尝试 35/89 个任务，跨批次不合并平均。结果见 `baselines/2026-11-19-terminal-bench-breadth.md`。
- Terminal-Bench 2.0 第三批广度：10 个新任务 × 1 次尝试（2 并发，自定义 agent，300 秒基准配置）；8 个通过、2 个有效 0.0、0 异常；有效通过 8/10 = 80.0%。对 2 个 0.0 各做 3 次 600 秒重复：干净有效尝试 2/5 = 40.0%（`adaptive-rejection-sampler` 1/3、`count-dataset-tokens` 1/2 有效），另 1 次 600 秒超时异常；300 秒重复轮 6/6 异常（4 次命令超时 + 2 次 undici headers-timeout 502），整轮排除。累计尝试 45/89 个任务；任务集合与前两批不同，不能合并或比较平均。结果见 `baselines/2026-11-19-terminal-bench-breadth-3.md`。
- Terminal-Bench 2.0 第四批广度：10 个新任务 × 1 次尝试（2 并发，自定义 agent，300 秒基准配置）；7 个通过、0 个有效 0.0、3 个 300 秒命令超时异常；有效通过 7/7 = 100%，异常按 0 为 7/10 = 70.0%。对 3 个异常任务做 600 秒新配置重跑：`bn-fit-modify`/`code-from-image` 仍超时，`dna-assembly` 无异常但验证器 0.0；再对前两者做 1200 秒重跑：`bn-fit-modify` 干净通过、`code-from-image` 无异常但验证器 0.0。累计尝试 55/89 个任务；任务集合与前几批不同，不能合并或比较平均。结果见 `baselines/2026-11-20-terminal-bench-breadth-4.md`。
- Terminal-Bench 2.0 第五批广度：10 个新任务 × 1 次尝试（2 并发，自定义 agent，300 秒基准配置）；4 个通过、4 个有效 0.0、2 个 300 秒命令超时异常；有效通过 4/8 = 50.0%，异常按 0 为 4/10 = 40.0%。对 2 个异常任务做 600 秒新配置重跑：`model-extraction-relu-logits` 通过、`extract-moves-from-video` 无异常但验证器 0.0。累计尝试 65/89 个任务；任务集合与前几批不同，不能合并或比较平均。结果见 `baselines/2026-11-20-terminal-bench-breadth-5.md`。
- Terminal-Bench 2.0 第六批广度：计划 10 个新任务 ×1（2 并发，自定义 agent，300 秒基准配置）；`mteb-retrieve` 镜像在 600/900/1200/2400 秒拉取均超时，未进入运行，不计入评估；实际 9 个任务中 3 个通过、4 个有效 0.0、2 个 300 秒命令超时异常；有效通过 3/7 = 42.9%，异常按 0 为 3/9 = 33.3%。对 2 个异常任务做 600 秒新配置重跑：`qemu-alpine-ssh` 无异常但验证器 0.0，`train-fasttext` 仍超时。累计评估 74/89 个任务；不能与前几批合并或比较平均。结果见 `baselines/2026-11-20-terminal-bench-breadth-6.md`。
- Terminal-Bench 2.0 第七批广度：10 个新任务 ×1（2 并发，自定义 agent，300 秒基准配置）；4 个通过、4 个有效 0.0、2 个异常（`torch-pipeline-parallelism` 300 秒命令超时 + `torch-tensor-parallelism` 验证器 900 秒超时 `VerifierTimeoutError`）；有效通过 4/8 = 50.0%，异常按 0 为 4/10 = 40.0%。对 2 个异常任务按 600 秒单命令 + `--verifier-timeout-multiplier 4` 新配置重跑：`torch-tensor-parallelism` 通过，`torch-pipeline-parallelism` 无异常但验证器 0.0（1/2，0 异常）。累计评估 84/89 个任务；不能与前几批合并或比较平均。结果见 `baselines/2026-11-20-terminal-bench-breadth-7.md`。
- Terminal-Bench 2.0 第八批广度：剩余 4 个可运行任务 ×1（2 并发，自定义 agent，300 秒基准配置）；0 个通过、1 个有效 0.0（`mteb-leaderboard`，40 轮上限）、3 个 300 秒命令超时异常（`caffe-cifar-10`、`compile-compcert`、`install-windows-3.11`）；有效通过 0/1 = 0.0%。对 3 个异常任务按 600 秒单命令新配置重跑：`compile-compcert` 通过、`install-windows-3.11` 无异常但验证器 0.0、`caffe-cifar-10` 仍超时（1/3，1 异常）。当时累计评估 88/89 个任务；`mteb-retrieve` 见下一条补跑记录。结果见 `baselines/2026-11-21-terminal-bench-breadth-8.md`。
- Terminal-Bench 2.0 `mteb-retrieve` 补跑：镜像 8.63 GB 大层（`420d334c0bc9`）以无短超时的后台拉取在 43m05s 完成（此前 600/900/1200/2400 秒均超时）；随后以 300 秒基准配置运行 1 次，1/1 通过（39 条命令，10m04s，验证器 9m02s，token 1,553,778 / 15,531）。至此 **89/89** 个 terminal-bench@2.0 任务均至少评估 1 次。结果见 `baselines/2026-11-21-terminal-bench-mteb-retrieve.md`。
- Terminal-Bench 2.0 第七批 0.0 重复：4 个有效 0.0 各 3 次（12 trials，2 并发，300 秒同配置）；干净有效 0/7 = 0.0%；5 个 300 秒命令超时异常，其中 `schemelike-metacircular-eval` 的 2 个超时 trial 验证器仍为 1.0；Harbor mean 0.167（异常按 0 为 2/12）；`video-processing` 3/3 有效 0.0，`protein-assembly`/`sam-cell-seg` 干净有效也均为 0.0。结果见 `baselines/2026-11-20-terminal-bench-breadth-7.md`（追加节）。
- Terminal-Bench 2.0 第八批 0.0 重复：`mteb-leaderboard`（300 秒）×3 与 `install-windows-3.11`（600 秒）×3，2 并发；6 trials 全部有效 0.0、0 异常；`mteb-leaderboard` 的 40 轮上限并非唯一失败模式（一次 8 条命令、1m49s 即 0.0）；`install-windows-3.11` 三次 39-41 条命令均未通过。结果见 `baselines/2026-11-21-terminal-bench-breadth-8.md`（追加节）。
- Terminal-Bench 2.0 `caffe-cifar-10` 预算放宽：1200 秒仍 `Command timed out`（47m03）；2400 秒下无异常但验证器 0.0（58 条命令，54m37s，token 1,954,693 / 20,364，job 55m12）。说明该任务不只是单命令预算问题，需不同 agent/策略或任务特定分析。结果见 `baselines/2026-11-21-terminal-bench-breadth-8.md`（追加节）。
- 预算上限：单次运行 ≤ US$5（按 Provider 账单为准）；超限立即中止并保留已完成结果。
- 所有分数必须标注：模型/Provider、harness 版本、数据集版本、日期、子集 ID 文件、是否 `partial-eval`。

## 5. 运行与结果

```bash
# 1) 构建沙箱并跑 BFCL 子集（需要 DEEPSEEK_API_KEY）
bash evals/sandbox/run-bfcl-subset.sh

# 2) 构建沙箱并跑 AgentDojo 子集
bash evals/sandbox/run-agentdojo-subset.sh
```

结果写入 `.scratch/evals/<timestamp>/`（不入库）。人工摘要写入 `docs/evals/baselines/`，只保留分数、配置和失败样例，不保留原始日志中的敏感内容。

## 6. 结果解释与威胁

- **测的是模型 + 固定 harness**，不是 NeonForge 的完整产品；NeonForge 的工具集、系统提示、审批策略尚未全部进入 BFCL/AgentDojo 管线。
- `NF_EVAL_TARGET=magpie` 时，适配器 v0 覆盖产品系统提示（`product` 模式）、provider 传输和工具参数修复；策略门 v2 覆盖 AgentDojo 工具执行点的 `ask`/`deny`/信任阶梯、`PermissionRule(specifier)`、GroundTruthPipeline 绕过与 `gate.decided` 审计。两者仍**不是**完整 Electron ToolRegistry / 审批 UI；能力卡必须把覆盖项与未覆盖项分开写。
- 子集分数与官方全量榜单不可直接比较；必须标注 `partial-eval`。
- 模型版本可能随 Provider 路由变化；能力卡必须记录调用日期与实际 API 模型名。
- 基准可能被污染或饱和；后续优先使用难度更高、维护活跃的基准（SWE-bench Pro、Terminal-Bench）。
- 单次运行存在非确定性；结论应基于重复运行或置信区间（本期已做 3 次重复，但仍只作方向性参考）。

## 7. 后续阶段

1. **NeonForge 无头适配器 v0（已完成）**：`evals/adapter/` 已让外部 harness 经产品系统提示、provider 传输与工具参数修复执行；基线见 `baselines/2026-11-17-magpie-dsv41f-adapter-baseline.md`。
2. **策略门 v1（已完成，子集）**：AgentDojo 工具执行点的 `ask`/`deny`/信任预设与 `gate.decided` 审计；基线见 `baselines/2026-11-17-magpie-policy-gate-v1.md`。
3. **策略门 v2（已完成，扩展子集）**：加入本地创建/编辑/日历任务区分 strict/standard/delegated；`PermissionRule(specifier)` 与 HTTP 审批回调已实现；基线见 `baselines/2026-11-18-magpie-policy-gate-v2.md`。
4. **审批回调基准（已完成，扩展子集）**：容器内模拟 `approve-local`/`deny-all`/`approve-all`，10 个用户任务 × 2 注入，`approve-local` 3 次；基线见 `baselines/2026-11-18-magpie-policy-gate-v2-approval.md`。
5. **策略门 v2 补强（部分完成）**：`PermissionRule(specifier)` 路径/URL 规范化、审批回调 3 次重复、`tool_knowledge` 容忍模式 3 次 + 默认模式 2 次四组对照、`ignore_previous`/`injecagent`/`system_message`/`direct` 四档各 3 次、产品 ToolRegistry 44 项单测 + trustModes UI 3 项、`decide` 裁决入口均已完成，见 `baselines/2026-11-19-neonforge-approval-boundary.md`；六种攻击合计 648 配对，注入成功 0。桥接设计见 `product-toolregistry-bridge-design.md`：阶段 1 已完成；阶段 2 经复核暂不做（synthetic 工具映射会取代产品真实语义）；执行桥暂不做。剩余人类审批链路、自适应/多轮攻击与更多攻击族。
6. **BFCL 类别全量（已完成十七类）**：3841 题十四类 + `multi_turn_long_context` / `multi_turn_miss_func` / `multi_turn_miss_param` 各 200 题，共 4441/4706（94.4%）非 partial-eval；`multi_turn_base` 56.00%、`multi_turn_long_context` 46.00%、`multi_turn_miss_func` 44.50%、`multi_turn_miss_param` 39.50%；轮次结束日志不是崩溃。剩余 265 题明确处理：memory（155）不跑（BFCL 合成 memory 工具与产品无对应，成本高）；web_search（100）按范围取消（用户明确不做 SerpAPI 依赖，且 BFCL 合成搜索 API 与产品自有 `web_search` 端点不等价）；format_sensitivity（10）对 FC 模型跳过。不以 mock/替换后端凑覆盖率。
7. **Terminal-Bench 2.0（试点 + 扩展重复 + 八批广度 + `mteb-retrieve` 补跑完成）/ SWE-bench（仍阻塞）**：Terminal-Bench 已在专用 QEMU/KVM VM 上完成试点（Harbor 0.26.0；`terminal-bench@2.0`；oracle 1/1；内置 `terminus-2` 与自定义 `neonforge-terminal` 分开报告；5 次有效模型运行全部 1.0）；扩展批次为 10 个新任务 × 3 次尝试（30 trials，2 并发），有效运行 25/29 = 86.2%，10/10 任务至少一次通过，6/10 任务 3/3 通过，Harbor mean 0.833（异常按 0）；首批广度为另外 10 个新任务 × 1 次尝试，5/8 有效通过（62.5%），2 个配置/基础设施异常，其中 3 个有效失败任务追加 ×3 重复后 6/9 通过（`git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3）；第二批广度为 10 个新任务 ×1，4/7 有效通过（57.1%），4 个通过、3 个有效 0.0、3 个异常（2 个 300 秒命令超时 + 1 个适配器瞬时 502）；对 3 个有效 0.0 追加 ×3 重复（9 trials），干净有效尝试 1/7（14.3%），`gcode-to-text` 0/3、`filter-js-from-html` 0/2 有效、`fix-ocaml-gc` 1/2 干净有效（另有 1 次超时但验证器 1.0）；另以 600 秒单命令新配置重跑：`crack-7z-hash` 干净通过、`fix-ocaml-gc` 2/2 干净通过、`filter-js-from-html` 仍 0/2（无异常）、`extract-elf` 仍超时；第三批广度为 10 个新任务 ×1，8/10 有效通过（80.0%），2 个有效 0.0、0 异常；对其 2 个 0.0 各做 3 次 600 秒重复，干净有效 2/5（`adaptive-rejection-sampler` 1/3、`count-dataset-tokens` 1/2 有效，另 1 次超时异常），说明初轮 0.0 主要是波动；300 秒重复轮 6/6 异常（4 次命令超时 + 2 次 undici headers-timeout 502），整轮按基础设施/配置异常排除；第四批广度为 10 个新任务 ×1，7/10 通过，3 个 300 秒命令超时异常（有效尝试 7/7 通过）；600 秒重跑后 `bn-fit-modify`/`code-from-image` 仍超时、`dna-assembly` 为有效 0.0；1200 秒重跑后 `bn-fit-modify` 干净通过、`code-from-image` 为有效 0.0；第五批广度为 10 个新任务 ×1，4/10 通过、4 个有效 0.0、2 个 300 秒命令超时异常（有效尝试 4/8 = 50.0%）；600 秒重跑后 `model-extraction-relu-logits` 通过、`extract-moves-from-video` 为有效 0.0；第六批计划 10 个任务，`mteb-retrieve` 镜像拉取失败未评估，实际 9 个任务 3/9 通过、4 个有效 0.0、2 个 300 秒命令超时异常（有效 3/7 = 42.9%），600 秒重跑后 `qemu-alpine-ssh` 为有效 0.0、`train-fasttext` 仍超时；第七批广度为 10 个新任务 ×1，4 个通过、4 个有效 0.0、2 个异常（`torch-pipeline-parallelism` 300 秒命令超时 + `torch-tensor-parallelism` 验证器 900 秒超时 `VerifierTimeoutError`），有效 4/8 = 50.0%；600 秒 + verifier ×4 重跑后 `torch-tensor-parallelism` 通过、`torch-pipeline-parallelism` 为有效 0.0；第八批广度为剩余 4 个可运行任务 ×1，0 个通过、1 个有效 0.0（`mteb-leaderboard`，40 轮上限）、3 个 300 秒命令超时异常（`caffe-cifar-10`、`compile-compcert`、`install-windows-3.11`），有效 0/1 = 0.0%；600 秒重跑后 `compile-compcert` 通过、`install-windows-3.11` 为有效 0.0、`caffe-cifar-10` 仍超时；累计评估 88/89；`mteb-retrieve` 的 8.63 GB 镜像大层以长超时拉取成功（43m05s），随后 300 秒配置 1/1 通过（39 条命令，10m04s）；第七批 4 个有效 0.0 的 3 次重复（12 trials）干净有效 0/7，5 个 300 秒命令超时异常（其中 2 个验证器 1.0），Harbor mean 0.167；第八批 2 个有效 0.0 的 3 次重复（`mteb-leaderboard` 300 秒、`install-windows-3.11` 600 秒）6 trials 全部有效 0.0、0 异常；`caffe-cifar-10` 1200 秒仍超时、2400 秒无异常但验证器 0.0（58 条命令）；累计评估 89/89。前置 `tbench2-breadth-10d` 因 VM 全局 `HTTP_PROXY` 未豁免 `172.17.0.1` 导致 10/10 首次调用 502，整轮按环境配置错误排除。能力卡见 `baselines/2026-11-19-terminal-bench-pilot.md`（含追加：pilot 4 任务 ×3 重复，11/11 可评估通过）、`baselines/2026-11-19-terminal-bench-expanded.md`、`baselines/2026-11-19-terminal-bench-breadth.md`、`baselines/2026-11-19-terminal-bench-breadth-3.md`、`baselines/2026-11-20-terminal-bench-breadth-4.md`、`baselines/2026-11-20-terminal-bench-breadth-5.md` 与 `baselines/2026-11-20-terminal-bench-breadth-6.md`、`baselines/2026-11-20-terminal-bench-breadth-7.md`、`baselines/2026-11-21-terminal-bench-breadth-8.md`、`baselines/2026-11-21-terminal-bench-mteb-retrieve.md`。下一步：`gcode-to-text`、`filter-js-from-html` 已按稳定/近稳定失败记录，除引入新 agent/提示/预算外不再重复；`fix-ocaml-gc` 已在 600 秒配置下 2/2 通过，后续统一用 600 秒或记录配置差异；`extract-elf` 需 >600 秒单命令、不同 agent/策略或任务特定分析；适配器已改用原生 `node:http/https` 并新增 headers 超时配置（PR #78；此前 `fetch`/undici 默认 300 秒 headersTimeout 会误报 502），继续观察是否仍有 502；第三批 2 个 0.0 已在 600 秒配置下各重复 3 次（干净有效 2/5，其余为 1 次超时异常；300 秒轮整轮异常），如需更高置信度可继续增加 600 秒重复；对 `sanitize-git-repo` 增加重复或分析失败轨迹；`gpt2-codegolf` 已做两次放宽预算尝试：60 轮/600 秒单命令在 35m37s 因命令超时结束，60 轮/1200 秒单命令在 43m01s 得到无异常 0.0（预算耗尽），需更强 agent/更长轮次或专门方案；对第四批 `dna-assembly`、`code-from-image` 的有效 0.0 增加重复；`bn-fit-modify` 已在 1200 秒配置下通过；对第五批 4 个有效 0.0（`mailman`、`make-doom-for-mips`、`make-mips-interpreter`、`qemu-startup`）增加重复或分析测试断言；`extract-moves-from-video` 可按 600 秒配置重复；对第六批 4 个有效 0.0（`dna-insert`、`pytorch-model-cli`、`raman-fitting`、`winning-avg-corewars`）增加重复或分析测试断言；`qemu-alpine-ssh` 可按 600 秒配置重复；`train-fasttext` 用 1200 秒或不同 agent/策略单独评估；第七批 `torch-tensor-parallelism` 已在 600 秒 + verifier ×4 下通过，`torch-pipeline-parallelism` 为有效 0.0；第七批 4 个有效 0.0 已完成 3 次重复（干净有效 0/7 = 0.0%；`video-processing` 3/3 有效 0.0，`protein-assembly` 1/3、`sam-cell-seg` 2/3 有效 0.0，`schemelike-metacircular-eval` 1/3 有效 0.0 + 2 个超时但验证器 1.0）；第八批 3 个命令超时任务已按 600 秒配置重跑（`compile-compcert` 通过、`install-windows-3.11` 为有效 0.0、`caffe-cifar-10` 仍超时）；`caffe-cifar-10` 在 1200 秒仍超时、2400 秒下无异常但验证器 0.0，需不同 agent/策略或任务特定分析；`mteb-leaderboard` 与 `install-windows-3.11` 已完成各 3 次重复（均为有效 0.0）；`mteb-retrieve` 的镜像拉取已解决并在 300 秒配置下 1/1 通过，terminal-bench@2.0 已达到 89/89 覆盖；后续转向重复试验、失败断言分析与新 agent/策略对照，不再以扩大任务数为主。继续扩大任务数。SWE-bench 仍需独立的每实例容器执行适配器与固定镜像摘要，暂不运行。不要在评估容器内挂宿主 Docker socket 或启用 privileged。
8. **用户体验与治理（初版完成）**：ISO/IEC 25010 质量映射、NIST AI RMF / ISO/IEC 42001 差距评估与 SUS/HEART 计划见 `governance-gap-assessment-2026-11-18.md`；AI 风险登记册初版见 `ai-risk-register-2026-11-19.md`（14 项风险）；威胁模型初版见 `threat-model-2026-11-19.md`（13 项威胁）；事件响应 Runbook 初版见 `incident-response-runbook-2026-11-19.md`；SLO 计划与 SUS/HEART 套件初版见 `slo-and-performance-plan-2026-11-19.md`、`sus-heart-study-kit-2026-11-19.md`；AI 管理方针初版见 `ai-management-policy-2026-11-19.md`；AI 辅助可用性走查（3/3 脚本场景、8 张截图、6 项启发式发现，**非人类研究**）见 `ai-walkthrough-2026-11-19.md`。已识别的主要缺口：无产品级性能基线、无真实 SUS/HEART 数据、无独立渗透测试、无真实事件响应演练、角色尚未正式任命；均未声称认证或符合性。
