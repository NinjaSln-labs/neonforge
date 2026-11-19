# 证据卡：Terminal-Bench 2.0 十任务 × 3 次重复（2026-11-19）

> 本卡记录 Terminal-Bench 2.0 的**扩展重复试点**：10 个新任务、每任务 3 次尝试，共 30 trials。不是官方完整成绩。
> 仅使用自定义最小 agent `neonforge-terminal`；pilot 卡中的 `terminus-2` 结果不与本卡合并。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `2e31c5f`（main，pilot 证据卡合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器 v0：`prompt=none`、`tolerantArgs=1`、请求超时 900 秒 |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具，无 tmux/asciinema 容器侧安装；单命令超时 300 秒，最多 40 轮 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | 10 个新任务（见结果表），每个 `--n-attempts 3`，共 30 trials；`--n-concurrent 2` |
| 评估日期（UTC） | 2026-11-19；job 10:08:47 → 11:27:32（1h18m45s） |
| 沙箱 | 与 pilot 相同的专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 凭据 | 仅宿主适配器进程持有 Magpie Key；VM、任务容器与验证容器不持有 |
| 运行成本 | 本地 Magpie，无外部 API 账单；总 token 3,919,110 输入 / 283,073 输出（自定义 agent 不报缓存） |

## 设计

- 任务选择覆盖数据合并、异步取消、文本编辑、强口令恢复、SQLite WAL、漏洞修复、Git 泄漏恢复、Web 服务器配置、nginx 日志与 C/Python polyglot；包含 medium 与 hard 难度。
- 每个任务独立容器、独立 3 次尝试；同一 job 内共享 VM、Docker 资源与本地模型端点。
- 重复目的是观察同一任务在相同 harness 下的波动，而不是用单次运行估计通过率。

## 结果

Harbor 内置统计：**30 trials、1 exception、mean 0.833、Pass@2 0.967**。该 mean 将异常按 0 计入；Pass@2 是小样本 UI 指标，不建议单独引用。本卡同时报告有效运行与任务层结果。

| 任务 | 尝试数 | 有效 | 通过 | Reward 序列 | 输入 / 输出 tokens |
|------|-------:|-----:|-----:|-------------|-------------------|
| `cancel-async-tasks` | 3 | 3 | 2 | 1.0 / 1.0 / 0.0 | 544,439 / 43,470 |
| `configure-git-webserver` | 3 | 3 | 1 | 0.0 / 0.0 / 1.0 | 650,711 / 45,984 |
| `db-wal-recovery` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 106,312 / 8,210 |
| `fix-code-vulnerability` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 264,347 / 6,977 |
| `git-leak-recovery` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 41,767 / 5,596 |
| `large-scale-text-editing` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 668,404 / 54,288 |
| `multi-source-data-merger` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 81,625 / 15,765 |
| `nginx-request-logging` | 3 | 3 | 2 | 1.0 / 1.0 / 0.0 | 81,878 / 10,391 |
| `password-recovery` | 3 | 2 | 2 | exception / 1.0 / 1.0 | 808,917 / 37,675 |
| `polyglot-c-py` | 3 | 3 | 3 | 1.0 / 1.0 / 1.0 | 670,710 / 54,717 |

### 汇总

- **有效运行通过率**：25/29 = **86.2%**（不含 1 次命令超时异常）。
- **Harbor mean**：25/30 = **0.833**（异常按 0 计入）。
- **任务层至少一次通过**：**10/10**。
- **3/3 次全部通过**：**6/10**（`db-wal-recovery`、`fix-code-vulnerability`、`git-leak-recovery`、`large-scale-text-editing`、`multi-source-data-merger`、`polyglot-c-py`）。
- **波动任务**：`cancel-async-tasks` 2/3、`nginx-request-logging` 2/3、`configure-git-webserver` 1/3、`password-recovery` 2/2 有效（另 1 次异常）。
- 总 token：3,919,110 输入 / 283,073 输出；无缓存计数。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `configure-git-webserver`（2 次） | `/tests/verify.sh` 返回 `❌ TEST FAILED: Web server returned HTTP 404` | agent 的服务器/仓库配置未满足验证脚本；模型实现波动 | 否（模型/agent 行为，非 harness） |
| `cancel-async-tasks`（1 次） | `test_tasks_cancel_above_max_concurrent` 断言失败：期望的 `Task started` 计数不符 | 并发取消边界实现不完整 | 否（模型实现） |
| `nginx-request-logging`（1 次） | `test_index_page_content` 与 `test_custom_404_page` 断言失败 | 页面内容/404 配置未满足要求 | 否（模型实现） |
| `password-recovery`（1 次） | `RuntimeError: Command timed out after 300 seconds` | 自定义 agent 的单命令 300 秒上限；任务所需命令耗时更长 | 否（agent 配置限制，不是模型分数） |

## 安全与边界

- 与 pilot 相同的 VM 隔离：任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码；VM 用完即弃。
- 宿主适配器只经 VM 内 `socat` 中继访问；任务/验证容器只拿代理与 `NO_PROXY`，不拿 `MAGPIE_GATEWAY_KEY`。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 10/89 个任务、单个 VM、每任务 3 次尝试；无全量榜单可比性。
- **仅自定义 agent**：`neonforge-terminal` 只有单个 `execute_bash` 工具，不含 NeonForge GUI、审批链、ToolRegistry 或计划门；结果只代表“适配器 + 最小 shell 循环”。
- **Harbor mean 与有效通过率不同**：异常尝试按 0 计入 Harbor mean；有效通过率排除该异常。两者都需标注，不能只引用其中一个。
- **异常不是模型失败**：`password-recovery` 的 300 秒命令超时来自 agent 配置；若用于能力评估，应单独调整超时后重跑，不能直接当作模型不会做。
- **重复不等于独立**：3 次尝试共享同一 VM、模型端点和并发负载；样本仍小，不能给出置信区间。
- **0.0 是验证器结果**：`configure-git-webserver`、`cancel-async-tasks`、`nginx-request-logging` 的失败均来自任务验证断言，不是 harness 崩溃。
- **不能归因于产品**：本卡没有运行 NeonForge Electron UI、真实审批或真实工具注册表。

## 结论

- **可用结论**：自定义最小 agent 在 10 个新 Terminal-Bench 任务上有效运行 25/29 通过（86.2%），10/10 任务至少一次通过，6/10 任务 3/3 通过；Harbor 内置 mean 0.833（含异常）。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 30 trials 当作总体通过率；不能把一次命令超时归因于模型能力；不能把结果归因于 NeonForge 产品审批/工具链。
- **下一步**：把 pilot 的 5 个任务也纳入同一 3 次尝试协议；为 `gpt2-codegolf` 单独放宽超时/轮次预算后重跑；修正自定义 agent 的 300 秒命令上限并作为新的配置版本重新评估；继续扩大任务数；SWE-bench 仍需独立的每实例容器执行适配器。
