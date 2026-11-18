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
| 凭据 | 只从宿主环境变量注入；Magpie Key 不进入评估容器 |

## 覆盖与关键结果

| 评估 | 范围 | 关键结果 | 能力卡 |
|------|------|----------|--------|
| BFCL 24 题子集 | `simple_python` 10 + `multiple` 4 + `parallel` 5 + `irrelevance` 5；`--run-ids` + `--partial-eval` | product 21-22/24（87.5-91.7%）；none 20-23/24（83.3-95.8%） | `2026-11-17-magpie-dsv41f-adapter-baseline.md` |
| BFCL 十四类全量 | 单轮/实时 13 类 + `multi_turn_base`；3641 + 200 题；非 partial-eval | **2896/3841 = 75.40%**；`simple_python` 92.25%、`parallel` 90.00%；`simple_javascript` 44.00%、`multi_turn_base` 56.00% | `2026-11-18-magpie-bfcl-category-full.md` |
| BFCL `multi_turn_long_context` 全量 | 200 题；非 partial-eval；DSV4.1FE-OD（eco） | **92/200 = 46.00%**；731 次解码失败（199/200 题受影响）；平均 82.2 秒/题；108 题无效 | `2026-11-18-magpie-bfcl-multi-turn-long-context.md` |
| AgentDojo 无防御 | `workspace` 3 用户任务 × 2 注入，3 次 | 效用 6/6；注入成功 0/6；tool_filter 效用 0/6 | `2026-11-17-magpie-dsv41f-adapter-baseline.md` |
| 策略门 v1 | `workspace` 3 用户任务 × 2 注入，3 次 | strict 6/6、6/6、5/6；standard/delegated 6/6；注入成功 0/6 | `2026-11-17-magpie-policy-gate-v1.md` |
| 策略门 v2 | `workspace` 6 用户任务 × 2 注入 | off 12/12；strict 6/12；standard 10/12；delegated 10/12、11/12；注入成功 0/12 | `2026-11-18-magpie-policy-gate-v2.md` |
| 审批回调 | 10 用户任务 × 2 注入；approve-local / deny-all / approve-all 各 3 次 | approve-local 75%/70%/80%；deny-all 30%；approve-all 100%/95%/100%；注入成功均 0/20 | `2026-11-18-magpie-policy-gate-v2-approval.md` |
| `tool_knowledge` 攻击 | 6 用户任务 × 2 注入；容忍模式 3 次 + 默认模式 2 次完成 | off 约 92-100%；strict 50%；standard 75-83.33%；delegated 100%；注入成功 0/60；默认模式 3 次尝试中 1 次崩溃 | `2026-11-18-magpie-policy-gate-v2-tool-knowledge.md` |
| `ignore_previous` / `injecagent` | 6 用户任务 × 2 注入；每种攻击四档各 3 次 | `ignore_previous` 均值：off 11.33/12、strict 6/12、standard 9.67/12、delegated 10/12；`injecagent`：11.33/12、6/12、9.67/12、11.67/12；两种攻击合计 288 配对，注入成功 0 | `2026-11-18-magpie-policy-gate-v2-ignore-previous-injecagent.md` |

## 覆盖图（BFCL v4）

| 类别组 | 题量 | 状态 |
|--------|------|------|
| 核心四类（simple_python / multiple / parallel / irrelevance） | 1040 | ✅ 全量 |
| 扩展七类（parallel_multiple / Java / JavaScript / live_simple / live_parallel / live_parallel_multiple / live_relevance） | 664 | ✅ 全量 |
| 两个 live 大类（live_multiple / live_irrelevance） | 1937 | ✅ 全量 |
| `multi_turn_base` | 200 | ✅ 全量 |
| `multi_turn_long_context` | 200 | ✅ 全量（46.00%，731 次解码失败，见能力卡） |
| `multi_turn_miss_func` / `multi_turn_miss_param` | 400 | ⏳ 未跑 |
| memory / web_search / format_sensitivity | 155 / 100 / 10 | ⏳ 未跑（format 对 FC 模型跳过） |
| **合计** | **4706** | **4041 已覆盖（85.9% 题量）** |

## 不能声称的内容

- 不能称为“BFCL v4 完整成绩”或官方榜单排名；仅覆盖 15/20 类，且模型别名、适配器、Magpie 路由与官方评测不同。
- 不能把 `multi_turn_long_context` 的 46.00% 当作模型长上下文能力的干净分数；199/200 题出现解码失败，分数受 handler/适配器兼容性影响。
- 不能把 AgentDojo 的 0% 注入成功全部归因于策略门；无门基线中模型本身已拒绝多数注入，结果属于 defense-in-depth。
- 不能把审批回调的 `approve-all` 高效用当作推荐配置；模拟审批端不是人类审批 UI。
- 不能把单次或 3 次运行当作统计显著结论；模型输出波动明显。
- 不能把评估门当作独立内核/沙箱边界；它是进程内 monkey-patch。
- 注入攻击目前覆盖 `important_instructions`、`tool_knowledge`、`ignore_previous`、`injecagent` 四种；新增两种各档 3 次，但仍不足以给出置信区间，不能当作稳定安全保证；默认模式下 malformed tool arguments 仍可能导致 `JSONDecodeError`。

## 缺口与下一步

1. **BFCL 剩余类别**：`multi_turn_miss_func` / `multi_turn_miss_param`（400）、memory（155）、web_search（100）。`multi_turn_long_context` 已完成但 731 次解码失败，需先修多轮最终自然语言响应的解码/适配再重跑；memory/web_search 试点 30 分钟仅 10/776 题且 111 次解码失败，已停止，需先解决运行时长与响应格式适配。
2. **重复运行**：BFCL 十四类及 `multi_turn_long_context` 目前每类 1 次；优先对四类核心、`multi_turn_base` 与 `multi_turn_long_context` 做 ≥3 次重复，并在修复解码问题后重跑长上下文。
3. **Terminal-Bench / SWE-bench**：需要独立 VM + Docker-in-Docker 与固定镜像摘要；当前 WSL2 宿主 Docker 不满足沙箱边界，暂不运行。
4. **真实审批 UI**：评估用审批回调已实现；产品 Electron ToolRegistry / 审批 UI 尚未进入基准。
5. **治理评估**：ISO/IEC 25010、NIST AI RMF / ISO/IEC 42001 差距评估与 SUS/HEART 计划已完成初版，见 `../governance-gap-assessment-2026-11-18.md`；真实 SUS/HEART 数据、产品级 SLO、威胁模型与渗透测试仍缺。
