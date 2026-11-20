# 证据卡：Terminal-Bench 2.0 `mteb-retrieve` 补跑（2026-11-21）

> 本卡记录 Terminal-Bench 2.0 最后一个未评测任务 `mteb-retrieve` 的补跑：镜像大层此前反复拉取超时，2026-11-20T20:46Z 长超时拉取成功后以 300 秒基准配置运行 1 次。
> 仅使用自定义最小 agent `neonforge-terminal`；不是官方完整成绩。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `9b64048`（main，第八批广度证据合并后） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD，eco/慢速模式） |
| 适配器 | NeonForge 无头适配器：原生 `node:http/https`、`prompt=none`、`tolerantArgs=1`、请求/headers 超时 900 秒、仅对 `ECONNRESET`/`EPIPE` 重试（PR #78） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash` 工具；最多 40 轮；单命令超时 300 秒 |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| 任务范围 | `mteb-retrieve` × 1 次尝试，共 1 trial；1 并发；`--environment-build-timeout-multiplier 4`、`--agent-timeout-multiplier 4` |
| 评估日期（UTC） | 2026-11-20；job 20:46:39 → 21:05:58（19m18） |
| 沙箱 | 专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；Docker 29.1.3；任务容器不挂宿主 Docker socket |
| 网络与凭据 | VM 内 `socat` 中继宿主适配器；Harbor 进程显式设置 `NO_PROXY/no_proxy` 豁免 `172.17.0.1`；任务/验证容器不持有 `MAGPIE_GATEWAY_KEY` |
| 运行成本 | 本地 Magpie，无外部 API 账单；token **1,553,778 输入 / 15,531 输出**；无缓存计数 |

## 镜像问题与解决

- 镜像 `alexgshaw/mteb-retrieve:20251031` 含一个 **8.63 GB** 大层（`420d334c0bc9`），其余层合计约 180 MB。
- 此前 600/900/1200/2400 秒拉取均在最后大层超时，任务未进入环境。
- 2026-11-20T20:03:06Z 以无短超时的后台 `docker pull` 重试，**20:46:11Z 成功**（43m05s，`420d334c0bc9: Pull complete`），随后启动本补跑。

## 结果

| 任务 | 结果 | Reward | 输入 / 输出 tokens | 命令数 | Agent 用时 | 备注 |
|------|------|-------:|-------------------|-------:|----------|------|
| `mteb-retrieve` | 通过 | 1.0 | 1,553,778 / 15,531 | 39 | 10m04s | 验证器 9m02s；无异常 |

### 汇总

- **1/1 通过**；无异常；有效通过率 100%（单次）。
- 总 token：1,553,778 输入 / 15,531 输出。
- **累计已评测任务：88 + 1 = 89/89**；所有 terminal-bench@2.0 任务均至少完成 1 次可评估尝试。
- 该 trial 是单任务补跑，不与第八批的 0/4 或任何前批合并。

## 安全与边界

- 与 pilot 相同的 VM 隔离与凭据边界；任务容器不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- Harbor 进程的 `NO_PROXY` 显式包含 `172.17.0.1`；本批未出现 502。
- 原始轨迹、日志与 SSH 私钥只留在 `.scratch/`，不入库；本卡不记录任何 Key 值。

## 解释与限制

- **不是官方 Terminal-Bench 2.0 成绩**：每个任务仅 1 次尝试，跨多批完成；不能与官方榜单或其他批次合并或平均。
- **仅自定义 agent**：不含 NeonForge GUI、审批链、ToolRegistry 或计划门。
- **镜像拉取是基础设施限制**：此前未评估不代表模型失败；本次成功补跑只说明该任务在给定配置下可完成。
- **样本为 1**：不能据此推断 `mteb-retrieve` 类任务的稳定通过率。

## 结论

- **可用结论**：`mteb-retrieve` 在镜像拉取解决后以 300 秒基准配置 1/1 通过；terminal-bench@2.0 的 **89/89** 个任务已全部至少评估 1 次。
- **不可用结论**：不能称为 Terminal-Bench 2.0 完整成绩或官方排名；不能把 89/89 覆盖当作 89/89 通过率；不能与前几批的通过率合并或平均。
- **下一步**：覆盖已完整，后续优先做重复试验、失败断言分析与新 agent/策略对照，而不是继续扩大任务数。
