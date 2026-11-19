# 外部基准评估方案（NeonForge Agent 工作台）

- 生效日期：2026-11-17
- 状态：v1.29（模型级基线 + 适配器 v0 + 策略门 v2 + 审批回调基准 + BFCL 十七类全量（4441/4706）+ 六种注入攻击（合计 648 配对）+ 产品审批边界证据（`decide` 已抽出）+ ToolRegistry 桥接设计（阶段 2 复核后暂不做）+ 治理差距评估/风险登记册/威胁模型/事件响应 Runbook/SLO 计划/SUS·HEART 套件/AI 管理方针/AI 辅助可用性走查初版 + Terminal-Bench 2.0 专用 KVM VM 试点 + pilot 4 任务 × 3 次重复（11/11 可评估通过）+ 十任务 × 3 次重复（29 次有效尝试 25 通过，异常按 0 的 Harbor mean 0.833；两个 agent 分开报告）+ 十任务广度批次（5/8 有效通过，2 个配置/基础设施异常；其中 3 个失败任务追加 ×3 重复，6/9 通过）；评估默认模型已改用 DSV4.1FE-OD（同一模型的 eco/慢速模式）；memory 不跑、web_search 按范围取消、format 跳过；外部基准接真实审批 UI / 真实 SUS·HEART 数据待接入）
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
- Terminal-Bench 2.0 广度批次：10 个新任务 × 1 次尝试（2 并发，自定义 agent）；5 个通过、3 个有效 0.0、2 个异常（命令超时与 502 上游）；有效通过 5/8 = 62.5%；追加 3 个有效失败任务 ×3 次重复，6/9 = 66.7%（`git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3）；累计尝试 25/89 个任务，跨批次不合并平均。结果见 `baselines/2026-11-19-terminal-bench-breadth.md`。
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
7. **Terminal-Bench 2.0（试点 + 扩展重复 + 广度批次完成）/ SWE-bench（仍阻塞）**：Terminal-Bench 已在专用 QEMU/KVM VM 上完成试点（Harbor 0.26.0；`terminal-bench@2.0`；oracle 1/1；内置 `terminus-2` 与自定义 `neonforge-terminal` 分开报告；5 次有效模型运行全部 1.0）；扩展批次为 10 个新任务 × 3 次尝试（30 trials，2 并发），有效运行 25/29 = 86.2%，10/10 任务至少一次通过，6/10 任务 3/3 通过，Harbor mean 0.833（异常按 0）；广度批次为另外 10 个新任务 × 1 次尝试，5/8 有效通过（62.5%），2 个配置/基础设施异常；其中 3 个有效失败任务追加 ×3 重复，6/9 通过（`git-multibranch` 3/3、`polyglot-rust-c` 2/3、`sanitize-git-repo` 1/3）。能力卡见 `baselines/2026-11-19-terminal-bench-pilot.md`（含追加：pilot 4 任务 ×3 重复，11/11 可评估通过）、`baselines/2026-11-19-terminal-bench-expanded.md` 与 `baselines/2026-11-19-terminal-bench-breadth.md`。下一步：对 `sanitize-git-repo` 增加重复或分析失败轨迹；`gpt2-codegolf` 已做两次放宽预算尝试：60 轮/600 秒单命令在 35m37s 因命令超时结束，60 轮/1200 秒单命令在 43m01s 得到无异常 0.0（预算耗尽），需更强 agent/更长轮次或专门方案；修正自定义 agent 的 300 秒命令上限并作为新配置重新评估；继续扩大任务数。SWE-bench 仍需独立的每实例容器执行适配器与固定镜像摘要，暂不运行。不要在评估容器内挂宿主 Docker socket 或启用 privileged。
8. **用户体验与治理（初版完成）**：ISO/IEC 25010 质量映射、NIST AI RMF / ISO/IEC 42001 差距评估与 SUS/HEART 计划见 `governance-gap-assessment-2026-11-18.md`；AI 风险登记册初版见 `ai-risk-register-2026-11-19.md`（14 项风险）；威胁模型初版见 `threat-model-2026-11-19.md`（13 项威胁）；事件响应 Runbook 初版见 `incident-response-runbook-2026-11-19.md`；SLO 计划与 SUS/HEART 套件初版见 `slo-and-performance-plan-2026-11-19.md`、`sus-heart-study-kit-2026-11-19.md`；AI 管理方针初版见 `ai-management-policy-2026-11-19.md`；AI 辅助可用性走查（3/3 脚本场景、8 张截图、6 项启发式发现，**非人类研究**）见 `ai-walkthrough-2026-11-19.md`。已识别的主要缺口：无产品级性能基线、无真实 SUS/HEART 数据、无独立渗透测试、无真实事件响应演练、角色尚未正式任命；均未声称认证或符合性。
