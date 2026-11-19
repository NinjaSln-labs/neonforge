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

## 失败与异常

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| `gpt2-codegolf` | `AgentTimeoutError`，35 episodes 后到达 60 分钟上限；日志显示模型仍在调试 GPT-2 张量/分词布局，未见明显重复循环 | 任务难度 + 时间上限 + 本地 eco 模式速度 | 待定：需要更长超时或更多 episode 重跑后才能判断 |
| `regex-log`（terminus-2） | `Failed to install tmux from source`、`Failed to install asciinema using pip`、`Failed to start tmux session` | 任务环境内 apt/pip 网络与 agent setup，不是模型输出 | 否（基础设施） |

## 安全与边界

- VM 为一次性开发沙箱；任务容器由 VM 内 Docker 管理，不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- 宿主适配器监听 `0.0.0.0:18082` 仅用于 VM 中继；`MAGPIE_GATEWAY_KEY` 只存在于宿主适配器进程环境，VM、任务容器和验证容器均不持有。
- 任务与验证容器仅通过 `HTTP(S)_PROXY` 访问 apt/uv/GitHub；模型调用走 `NO_PROXY` 直连适配器中继。
- 原始轨迹、VM 日志、SSH 私钥与代理地址只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：仅 5 个任务 ID，未跑完整数据集，单次运行，无重复与置信区间。
- **不能把两个 agent 合并**：`terminus-2` 是 Harbor 内置 agent；`neonforge-terminal` 是本次自建的最小 shell 循环（一个 `execute_bash` 工具、无 tmux/asciinema、无 NeonForge 审批链）。两者分数不能相加或平均后与官方榜单横比。
- **超时不是失败分数**：`gpt2-codegolf` 的 0.0 是 Harbor 在 `AgentTimeoutError` 下的记录值，不代表模型在完整时限内无法完成。
- **基础设施异常不是模型失败**：`regex-log` 首次失败发生在 agent setup，自定义 agent 补跑通过，说明原因在 terminus-2 的容器侧安装路径。
- **不代表产品能力**：适配器 v0 覆盖产品系统提示/传输语义/工具参数修复；自定义 agent 只验证“适配器 + 最小终端循环”，不覆盖 NeonForge 的 ToolRegistry、审批 UI、计划门或交付链路。
- 本地 Magpie 的 eco/慢速模式会影响长任务的墙钟时间与超时概率；token 数来自 Harbor `agent_result`，缓存计数在自定义 agent 中不可用。

## 结论

- **可用结论**：专用 QEMU/KVM VM 能稳定运行 `terminal-bench@2.0` 的 oracle 与模型任务；oracle 在 `gpt2-codegolf` 通过；试点中 5 次有效模型运行全部 reward 1.0（3 次 `terminus-2` + 2 次 `neonforge-terminal`），4/5 个任务至少在一种 agent 下干净通过。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 `gpt2-codegolf` 超时当作模型必然失败；不能把本卡结果归因于 NeonForge 产品审批/工具链；不能用单次试点估计总体通过率。
- **下一步**：扩大任务数（建议先 10-20 个任务）并对每个任务至少重复 3 次；为 `gpt2-codegolf` 单独评估更长超时或更大 episode 预算；继续分别报告内置与自定义 agent；SWE-bench 仍需独立的每实例容器执行适配器。
