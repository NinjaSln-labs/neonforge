# 外部基准评估方案（NeonForge Agent 工作台）

- 生效日期：2026-11-17
- 状态：v1（模型级基线；产品级适配待后续阶段）
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
| 工具调用 | BFCL v4（UC Berkeley） | ✅ 子集 | 官方 `bfcl-eval`，DeepSeek 官方 handler；子集使用 `--run-ids` + `--partial-eval` |
| 提示注入韧性 | AgentDojo（ETH Zurich） | ✅ 子集 | 官方 `agentdojo`，`workspace` suite + `important_instructions` 攻击；仅作模型级安全信号 |
| 终端任务 | Terminal-Bench | ⏳ 下一阶段 | 需要独立 Docker/VM 沙箱与镜像仓库；本期不跑 |
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

## 4. 本期基线范围（成本可控）

- BFCL v4：`simple_python` 10 题 + `multiple` 4 题 + `parallel` 5 题 + `irrelevance` 5 题，共 24 题；单线程。首发 50 题版本在 `multiple_4` 出现长时间等待，基线改用 24 题子集并记录该限制。
- AgentDojo：`workspace` suite，`user_task_0/1/2`，`injection_task_0/1`，攻击 `important_instructions`；分别跑无防御与 `tool_filter` 两组。
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

- **测的是模型 + 固定 harness**，不是 NeonForge 的完整产品；NeonForge 的工具集、系统提示、审批策略尚未进入 BFCL/AgentDojo 管线。
- 子集分数与官方全量榜单不可直接比较；必须标注 `partial-eval`。
- 模型版本可能随 Provider 路由变化；能力卡必须记录调用日期与实际 API 模型名。
- 基准可能被污染或饱和；后续优先使用难度更高、维护活跃的基准（SWE-bench Pro、Terminal-Bench）。
- 单次运行存在非确定性；结论应基于重复运行或置信区间（本期为一次性基线，仅作方向性参考）。

## 7. 后续阶段

1. **NeonForge 无头适配器**：让外部 harness 通过 NeonForge gateway/工具协议执行，测“产品级”而非“模型级”。
2. **Terminal-Bench / SWE-bench**：独立 VM + Docker-in-Docker；固定数据集与镜像摘要。
3. **产品级安全**：把信任模式、逐项授权、`gate.denied` 映射到 AgentDojo 工具过滤器，报告攻击成功率与误拦截率。
4. **用户体验与治理**：ISO/IEC 25010 质量评审 + SUS/HEART；NIST AI RMF / ISO/IEC 42001 差距评估。
