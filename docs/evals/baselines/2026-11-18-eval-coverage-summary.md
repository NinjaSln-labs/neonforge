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
| `web_search` | 100 | ⏳ 阻塞：BFCL 需 SerpAPI 包与 `SERPAPI_API_KEY`；NeonForge 自有 web_search 走 `NEONFORGE_SEARCH_KEY` 端点，不等价 |
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

## 缺口与下一步

1. **BFCL 剩余 265 题**：四个 multi-turn 类别均已完成；轮次结束日志与用户轮次基本 1:1，不是需要修复的故障；`miss_param` 的 12 题首轮空响应仍需抽查。
   - `memory`（155）不跑：BFCL 测试的是合成 Core/Archival Memory 工具，NeonForge 没有对应产品工具（仅有拒绝记忆与会话状态）；4 线程实测 7 分钟仅 6/576，成本高且不代表产品能力。
   - `web_search`（100）阻塞：BFCL 依赖 SerpAPI 包与 `SERPAPI_API_KEY`；NeonForge 的 `web_search` 使用自有搜索端点（`NEONFORGE_SEARCH_KEY`），不能拿 BFCL 合成搜索 API 冒充产品能力。
   - `format_sensitivity`（10）对 FC 模型跳过。
   - 不以离线 mock 或替换搜索后端凑覆盖率；如需评估产品 `web_search`，应另建产品级测试。
2. **重复运行**：BFCL 十七类目前每类 1 次；优先对四类核心与四个 multi-turn 类别做 ≥3 次重复。
3. **Terminal-Bench / SWE-bench**：需要独立 VM + Docker-in-Docker 与固定镜像摘要；当前 WSL2 宿主 Docker 不满足沙箱边界，暂不运行。
4. **真实审批 UI（部分完成）**：产品 ToolRegistry 44 项单测 + trustModes UI 3 项通过，见 `2026-11-19-neonforge-approval-boundary.md`；`decide` 裁决入口已抽出。外部基准仍用模拟审批端；桥接设计见 `../product-toolregistry-bridge-design.md`：阶段 2 sidecar 经复核暂不做（synthetic 工具映射会取代产品真实语义），执行桥暂不做；尚无人类审批链路。
5. **治理评估**：ISO/IEC 25010、NIST AI RMF / ISO/IEC 42001 差距评估与 SUS/HEART 计划已完成初版，见 `../governance-gap-assessment-2026-11-18.md`；AI 风险登记册初版见 `../ai-risk-register-2026-11-19.md`；威胁模型初版见 `../threat-model-2026-11-19.md`；事件响应 Runbook 初版见 `../incident-response-runbook-2026-11-19.md`；SLO 测量计划初版见 `../slo-and-performance-plan-2026-11-19.md`；SUS/HEART 研究套件初版见 `../sus-heart-study-kit-2026-11-19.md`；真实 SUS/HEART 数据、产品级性能基线、渗透测试与真实演练仍缺。
