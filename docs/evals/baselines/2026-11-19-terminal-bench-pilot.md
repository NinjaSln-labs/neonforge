# 证据卡：Terminal-Bench 2.0 专用 VM 试点（2026-11-19）

> 本卡记录 Terminal-Bench 2.0 在专用 QEMU/KVM VM 上的**试点运行**，不是官方完整成绩。
> 仅覆盖 5 个任务 ID、单次运行；内置 `terminus-2` 与自定义 `neonforge-terminal` 的结果分开报告，不能合并为一个平均分。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `20d4ec7`（main） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，同一模型的 eco/慢速模式） |
| 适配器 | NeonForge 无头适配器 v0：`prompt=none`、`tolerantArgs=1`、请求超时 900 秒 |
| 评估日期（UTC） | 2026-11-19 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| Agent | 内置 `terminus-2`；自定义 `neonforge-terminal`（`evals/harbor/neonforge_terminal_agent.py`） |
| 评估类型 | 模型 + harness / 适配器级；自定义 agent 只有单个 `execute_bash` 工具，不含 NeonForge GUI、审批链或产品 ToolRegistry |
| 沙箱 | 专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB RAM、100 GB 磁盘；Docker 29.1.3 + Harbor 0.26.0；VM 内再跑任务容器 |
| 网络与凭据 | VM 用户态网络经 `10.0.2.2` 访问宿主；VM 内 `socat` 把宿主适配器与代理转到 Docker bridge；任务/验证容器只拿 `HTTP(S)_PROXY` 和 `NO_PROXY`，不拿 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；token 用量见结果表 |

## 为什么使用专用 VM

Terminal-Bench 的任务会在容器内执行任意 shell 命令；在 WSL2 宿主 Docker 上运行会要求挂 Docker socket 或 `privileged`，破坏现有沙箱边界。试点改为一次性 QEMU/KVM VM：VM 内独立 Docker daemon，任务容器与宿主仓库、Home、SSH、云凭据隔离；VM 用完后可整体丢弃。

## 执行命令（示例）

```bash
# VM 内，先做 oracle 自检（不代表模型能力）
harbor run --dataset terminal-bench@2.0 --include-task-name gpt2-codegolf \
  --n-tasks 1 --agent oracle

# 内置 terminus-2，经 NeonForge 适配器调用本机 Magpie
harbor run --dataset terminal-bench@2.0 --include-task-name openssl-selfsigned-cert \
  --n-tasks 1 --agent terminus-2 \
  --model openai/opendesign/deepseek-v4.1-flash-eco \
  --base-url http://172.17.0.1:18082/v1 \
  --api-key-name OPENAI_API_KEY --api-format openai_chat_completions

# 自定义最小 agent（无 tmux/asciinema 安装）
PYTHONPATH=$HOME/harbor-agents \
NEONFORGE_BASE_URL=http://172.17.0.1:18082/v1 \
NEONFORGE_MODEL=opendesign/deepseek-v4.1-flash-eco \
harbor run --dataset terminal-bench@2.0 --include-task-name regex-log \
  --n-tasks 1 --agent neonforge_terminal_agent:NeonForgeTerminalAgent \
  --model openai/opendesign/deepseek-v4.1-flash-eco \
  --agent-timeout-multiplier 4
```

验证器安装依赖需要 `--ve HTTP(S)_PROXY=... --ve NO_PROXY=...`；Harbor 进程自身访问 GitHub/镜像也需要代理，但 `NO_PROXY` 必须包含 VM 内适配器中继地址，否则本地模型端点会被代理当作外网而返回 502。

## 结果

| 任务 | Agent | 结果 | 总用时 / Agent 用时 | 交互量 | Tokens（输入 / 输出 / 缓存） | 备注 |
|------|-------|------|--------------------|--------|-------------------------------|------|
| `gpt2-codegolf` | `oracle` | **1.0** | 1m21s / — | — | — | 环境与验证器自检；不是模型成绩 |
| `gpt2-codegolf` | `terminus-2` | **AgentTimeoutError**（记录 reward 0.0） | 1h02m16s / 1h00m00s | 35 episodes | 778,363 / 248,197 / 731,520 | 达到 agent 超时上限；不是干净分数 |
| `openssl-selfsigned-cert` | `terminus-2` | **1.0** | 3m34s / 1m23s | 4 episodes | 9,840 / 6,235 / 6,016 | — |
| `log-summary-date-ranges` | `terminus-2` | **1.0** | 3m19s / 1m26s | 5 episodes | 36,815 / 5,707 / 26,368 | — |
| `sqlite-db-truncate` | `terminus-2` | **1.0** | 3m01s / 2m17s | 7 episodes | 29,267 / 9,911 / 20,736 | — |
| `regex-log` | `terminus-2` | **RuntimeError**（未计分） | 2m46s / — | — | — | agent setup 安装 tmux/asciinema 失败；基础设施异常 |
| `openssl-selfsigned-cert` | `neonforge-terminal` | **1.0** | 1m34s / 1m06s | 8 commands | 21,975 / 4,068 / 不适用 | 自定义最小 agent；无容器侧安装 |
| `regex-log` | `neonforge-terminal` | **1.0** | 6m07s / 4m39s | 8 commands | 103,727 / 22,320 / 不适用 | 补跑原基础设施异常任务 |

### 汇总

- **内置 `terminus-2`**：3 次有效运行全部 reward 1.0；另有 1 次 60 分钟超时与 1 次 setup 异常，均不计入 mean。
- **自定义 `neonforge-terminal`**：2 次有效运行全部 reward 1.0。
- **任务层面**：5 个任务中 4 个（`openssl-selfsigned-cert`、`log-summary-date-ranges`、`sqlite-db-truncate`、`regex-log`）至少有一个 agent 干净通过；`gpt2-codegolf` 仅超时异常。
- 有效运行 token 合计：**201,624 输入 / 48,241 输出 / 53,120 缓存**（缓存仅 terminus-2 可读；自定义 agent 未上报缓存）。
- 超时那次 `gpt2-codegolf` 单独消耗 778,363 / 248,197 / 731,520，不计入有效运行。

## 追加：pilot 4 任务的 3 次重复（同日）

`tbench2-pilot-repeat-3x` job：`openssl-selfsigned-cert`、`log-summary-date-ranges`、`sqlite-db-truncate`、`regex-log` 各 3 次尝试，共 12 trials；仅自定义 `neonforge-terminal`，2 并发，同一 VM / 适配器 / 模型。job 11:34:32 → 12:18:50（44m18s），总 token **1,716,269 输入 / 157,220 输出**。

| 任务 | 尝试数 | 通过 | Reward 序列 |
|------|-------:|-----:|-------------|
| `log-summary-date-ranges` | 3 | 3 | 1.0 / 1.0 / 1.0 |
| `openssl-selfsigned-cert` | 3 | 3 | 1.0 / 1.0 / 1.0 |
| `sqlite-db-truncate` | 3 | 3 | 1.0 / 1.0 / 1.0 |
| `regex-log` | 3 | 2/2 可评估 | 1.0 / 1.0 / 0.0（验证器网络失败） |

- 结果：11/12 reward 1.0；唯一 0.0 是 `regex-log` 的验证器在 `apt-get update`/`curl` 安装阶段网络失败（`Unable to locate package curl`、`curl: command not found`、`uvx: command not found`），测试脚本未真正评估模型输出。排除该次后，11/11 可评估尝试通过；4/4 任务至少一次通过，3/4 任务 3 次全部通过。
- 该次验证器失败属于基础设施问题，不是模型 0 分；不应计入模型通过率。

## 追加：gpt2 放宽预算尝试（同日）

`tbench2-gpt2-long` job：单个 `gpt2-codegolf` trial，自定义 `neonforge-terminal`，`NEONFORGE_MAX_ITERATIONS=60`、`NEONFORGE_COMMAND_TIMEOUT_SEC=600`、agent timeout multiplier 4。13:49:18 → 14:24:55（35m37s），最终 `RuntimeError: Command timed out after 600 seconds`，无 token 统计。

- 模型确实在推进：容器命令显示它生成了 `/tmp/v1`、`/tmp/cbin` 等变体并反复运行 GPT-2 checkpoint 推理；失败点是单条推理/测试命令超过 600 秒上限。
- 这仍不是干净分数：既不是 1.0，也不能据此断言模型无法完成；应作为“agent 命令超时配置限制”记录。
- 若继续评估，需要把单命令上限进一步提高，或改用能长时间运行单条命令的 agent/harness；单纯增加 agent timeout 不足以避免本类失败。

第二次放宽 `tbench2-gpt2-long2`：`NEONFORGE_MAX_ITERATIONS=60`、`NEONFORGE_COMMAND_TIMEOUT_SEC=1200`、agent timeout multiplier 4。15:46:02 → 16:29:04（43m01s），**reward 0.0，无异常**，执行 60 条命令，token 1,679,632 输入 / 57,373 输出。

- 这次没有命令超时；模型用完了 60 轮预算仍未通过验证器，是更干净的“预算耗尽的 0.0”。
- 结论：单纯把单命令上限从 600 秒提高到 1200 秒不足以让当前模型完成 `gpt2-codegolf`；该任务需更长轮次/更强 agent 或专门方案，不能把 0.0 归因于 harness 崩溃。

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `gpt2-codegolf` | 首轮 terminus-2 `AgentTimeoutError`（35 episodes、60 分钟）；追加自定义 agent 600 秒单命令尝试 `RuntimeError`；再追加 60 轮/1200 秒单命令尝试，43m01s 后 **reward 0.0、无异常、60 条命令** | 任务难度 + 预算耗尽；最后一次是干净的有效 0.0 | 否（模型能力/预算，不是产品问题） |
| `regex-log`（terminus-2） | `Failed to install tmux from source`、`Failed to install asciinema using pip`、`Failed to start tmux session` | 任务环境内 apt/pip 网络与 agent setup，不是模型输出 | 否（基础设施） |

## 安全与边界

- VM 为一次性开发沙箱；任务容器由 VM 内 Docker 管理，不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- 宿主适配器监听 `0.0.0.0:18082` 仅用于 VM 中继；`MAGPIE_GATEWAY_KEY` 只存在于宿主适配器进程环境，VM、任务容器和验证容器均不持有。
- 任务与验证容器仅通过 `HTTP(S)_PROXY` 访问 apt/uv/GitHub；模型调用走 `NO_PROXY` 直连适配器中继。
- 原始轨迹、VM 日志、SSH 私钥与代理地址只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 5 个任务 ID，未跑完整数据集；初轮为单次运行，追加节仅重复其中 4 个任务，仍无置信区间。
- **不能把两个 agent 合并**：`terminus-2` 是 Harbor 内置 agent；`neonforge-terminal` 是本次自建的最小 shell 循环（一个 `execute_bash` 工具、无 tmux/asciinema、无 NeonForge 审批链）。两者分数不能相加或平均后与官方榜单横比。
- **区分超时与干净 0.0**：`gpt2-codegolf` 首轮 `terminus-2` 的 0.0 是 `AgentTimeoutError` 记录值，不代表模型在完整时限内无法完成；追加的 60 轮/1200 秒单命令自定义 agent 尝试得到**无异常的 0.0**（预算耗尽），这才是在该预算下的有效失败。
- **基础设施异常不是模型失败**：`regex-log` 首次失败发生在 agent setup，自定义 agent 补跑通过，说明原因在 terminus-2 的容器侧安装路径。
- **不代表产品能力**：适配器 v0 覆盖产品系统提示/传输语义/工具参数修复；自定义 agent 只验证“适配器 + 最小终端循环”，不覆盖 NeonForge 的 ToolRegistry、审批 UI、计划门或交付链路。
- 本地 Magpie 的 eco/慢速模式会影响长任务的墙钟时间与超时概率；token 数来自 Harbor `agent_result`，缓存计数在自定义 agent 中不可用。

## 结论

- **可用结论**：专用 QEMU/KVM VM 能稳定运行 `terminal-bench@2.0` 的 oracle 与模型任务；oracle 在 `gpt2-codegolf` 通过；试点中 5 次有效模型运行全部 reward 1.0（3 次 `terminus-2` + 2 次 `neonforge-terminal`），4/5 个任务至少在一种 agent 下干净通过；`gpt2-codegolf` 在 60 轮/1200 秒单命令预算下得到无异常的 0.0，说明当前预算内未完成。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把首轮 `gpt2-codegolf` 超时当作模型必然失败；也不能把 60 轮/1200 秒预算下的 0.0 外推到更强预算或不同 agent；不能把本卡结果归因于 NeonForge 产品审批/工具链；不能用单次试点估计总体通过率。
- **下一步**：`gpt2-codegolf` 需要更强 agent/更长轮次或专门方案，单纯放宽命令超时不足；扩展批次已覆盖 10 个新任务 ×3 次（见 `2026-11-19-terminal-bench-expanded.md`）；广度批次与失败重复见 `2026-11-19-terminal-bench-breadth.md`；继续分别报告内置与自定义 agent；SWE-bench 仍需独立的每实例容器执行适配器。
