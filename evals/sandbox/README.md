# 评估沙箱

所有外部 Agent 基准都在一次性 Docker 容器中运行。容器默认：

- 只读根文件系统，`/tmp` 为 tmpfs；仅挂载结果目录
- 非 root（宿主 UID/GID）
- `--cap-drop=ALL --security-opt=no-new-privileges`
- PID/内存/CPU 限制
- 不挂载宿主 Home、SSH、仓库源码或云凭据
- 仅加入 `nf-eval-internal` 内部网络；DeepSeek 路径出站只经 Squid 白名单代理（仅允许 `api.deepseek.com:443`），Magpie 路径只经单目标适配器中继

## 前置（WSL2）

Docker 在 WSL2 下创建 veth 时可能报 `no buffer space available`；先提高 netlink 缓冲（重启后失效）：

```bash
sudo sysctl -w net.core.rmem_default=1048576 net.core.wmem_default=1048576
sudo sysctl -w net.core.rmem_max=16777216 net.core.wmem_max=16777216
sudo systemctl restart docker
```

若当前用户不在 `docker` 组，脚本会在检测到免密 sudo 时自动使用 `sudo -n docker`；否则请先加入 docker 组。

## 运行

```bash
# 前置：Docker daemon 可访问；DEEPSEEK_API_KEY 已在环境中（不要写文件）
bash evals/sandbox/run-bfcl-subset.sh
bash evals/sandbox/run-agentdojo-subset.sh

# AgentDojo 对照组：默认 tool_filter；无防御用 NF_EVAL_DEFENSE=none
NF_EVAL_DEFENSE=none bash evals/sandbox/run-agentdojo-subset.sh
```

脚本会自动启动/停止出站代理；结果默认写入 `.scratch/evals/`（已 gitignore）。把摘要整理到 `docs/evals/baselines/`，不要提交原始日志或任何 Key。

## 本地 Magpie / opendesign DSV4.1FE-OD

`NF_EVAL_TARGET=magpie` 时，harness 经 **NeonForge 无头评估适配器**（`evals/adapter/`）调用本机 Magpie；默认模型为 DSV4.1FE-OD（API model id `opendesign/deepseek-v4.1-flash-eco`，与原 flash 是同一模型的 eco/慢速模式），可用 `MAGPIE_MODEL` 覆盖：

```bash
# 前置：Magpie 在 127.0.0.1:3425；MAGPIE_GATEWAY_KEY 已在环境中
NF_EVAL_TARGET=magpie NF_EVAL_PROMPT=product bash evals/sandbox/run-bfcl-subset.sh
NF_EVAL_TARGET=magpie NF_EVAL_PROMPT=product NF_EVAL_DEFENSE=none bash evals/sandbox/run-agentdojo-subset.sh

# 一次跑 prompt=none/product × 无防御/tool_filter 的完整子集
bash evals/sandbox/run-magpie-baseline.sh
```

- 适配器只监听 Docker bridge 网关地址（默认 `172.17.0.1:18080`），由 `nf-eval-adapter-relay` 单目标中继进 `nf-eval-internal`；评估容器拿不到 `MAGPIE_GATEWAY_KEY`。
- 中继镜像默认 `python:3.11-slim`（首次需拉取，可用 `NF_EVAL_RELAY_IMAGE` 覆盖）；适配器单元测试：`bash evals/adapter/test.sh`。
- `NF_EVAL_PROMPT=product` 注入 NeonForge 产品系统提示；`none` 是不注入的对照。
- **v0 边界**：适配器覆盖产品系统提示、provider 传输语义、工具参数修复；策略门 v1 已在下节接入 AgentDojo 执行点，但完整审批 UI/持久化规则仍未接入。能力卡不得把结果称为“完整产品级安全认证”。
- 不写入仓库：适配器 bundle 在 `evals/adapter/dist/`（gitignore），原始日志在 `.scratch/evals/`。

## BFCL 类别全量

```bash
# 默认四个单轮类别：simple_python,multiple,parallel,irrelevance（共 1040 题，非 partial-eval）
bash evals/sandbox/run-bfcl-categories.sh

# 单类别（例如先跑 400 题 simple_python）
NF_EVAL_TARGET=magpie NF_EVAL_BFCL_CATEGORIES=simple_python \
  bash evals/sandbox/run-bfcl-categories.sh .scratch/evals/bfcl-simple-python-full

# 扩展七类（与核心四类合计 1704 题）
NF_EVAL_TARGET=magpie \
NF_EVAL_BFCL_CATEGORIES=parallel_multiple,simple_java,simple_javascript,live_simple,live_parallel,live_parallel_multiple,live_relevance \
  bash evals/sandbox/run-bfcl-categories.sh .scratch/evals/bfcl-extra-categories-full

# 剩余两个 live 大类（live_multiple 1053 + live_irrelevance 884）
NF_EVAL_TARGET=magpie NF_EVAL_BFCL_CATEGORIES=live_multiple,live_irrelevance \
  bash evals/sandbox/run-bfcl-categories.sh .scratch/evals/bfcl-live-large-full

# 多轮试点（multi_turn_base 200）
NF_EVAL_TARGET=magpie NF_EVAL_BFCL_CATEGORIES=multi_turn_base \
  bash evals/sandbox/run-bfcl-categories.sh .scratch/evals/bfcl-multiturn-base
```

- 使用 `bfcl generate --test-category ...` + `bfcl evaluate`，不带 `--run-ids` / `--partial-eval`；结果是类别全量分数，但仍不能与官方总榜直接横比。
- 全量 BFCL v4 共 20 类 4706 题（含 live、multi-turn、web_search、memory 等）；默认只跑与现有子集相同的四个单轮类别，长类别需单独评估时间与依赖。
- `format_sensitivity` 仅对非 FC 模型生效；通用 FC handler 会被跳过。

## 策略门 v2（AgentDojo）

```bash
# 扩展任务集 + 四组对照：off / strict / standard / delegated
bash evals/sandbox/run-agentdojo-gate-v2.sh

# v1 历史基线复现（固定 neonforge-policy-v1.json）
bash evals/sandbox/run-agentdojo-gate.sh

# 单档 + 自定义任务集
NF_EVAL_TARGET=magpie NF_GATE_MODE=standard NF_EVAL_DEFENSE=none \
NF_EVAL_USER_TASKS=user_task_0,user_task_1,user_task_2,user_task_15,user_task_29,user_task_31 \
  bash evals/sandbox/run-agentdojo-subset.sh .scratch/evals/gate-standard
```

- `neonforge_gate.py` 在 AgentDojo 进程内包装 `FunctionsRuntime.run_function`；`deny > ask > allow`，`ask` 在无人类审批的基准中 fail-closed 为拒绝。
- 策略预设：`neonforge-policy.json`（v2）；`strict` 仅只读，`standard` 放行 `create_file`/无参与者日历创建，`delegated` 额外放行 `append_to_file`；外部副作用 ask→deny，破坏性 deny，未知工具 fail-closed。
- `PermissionRule(tool, specifier)`：`create_file` 的 `secret-` 前缀示例在全部模式 deny；文件路径做 NFC/分隔符/`.`/`..` 规范化，URL 做 scheme/host 小写、默认端口、百分号解码与点段折叠。
- `NF_GATE_APPROVAL_URL`：可选 HTTP 审批回调；超时/异常 fail-closed。基准默认不启用。
- `GroundTruthPipeline` 通过 ContextVar 绕过执行门，避免合法任务的 ground truth 被当作 agent 工具调用拦截。
- 任务集：`NF_EVAL_USER_TASKS` / `NF_EVAL_INJECTION_TASKS`（逗号分隔）；策略文件：`NF_GATE_POLICY_FILE`。
- 注入攻击：`NF_EVAL_ATTACK`（默认 `important_instructions`）。`tool_knowledge` 可触发模型输出 malformed tool arguments；`NF_ADAPTER_TOLERANT_ARGS=1` 会把无法解析的参数降级为 `{}` 并计数（评估用，默认关闭），容忍模式下已完成一次四组对照。
- 审计：每组结果目录下 `neonforge-gate.jsonl`，记录 `gate.decided`（工具名、决策、原因、参数名；不记录正文/收件人值）。
- 单元测试：`python3 -m unittest evals/sandbox/test_neonforge_gate.py`。

### 审批回调基准（模拟审批端）

```bash
# strict + approve-local ×3；strict + deny-all 与 strict + approve-all 各 3 次对照
# 快速对照可设 NF_EVAL_APPROVAL_DENY_REPS=1 NF_EVAL_APPROVAL_ALL_REPS=1
bash evals/sandbox/run-agentdojo-gate-v2-approval.sh
```

- `neonforge_approval_server.py` 在评估容器内监听 `127.0.0.1`，由 `NF_GATE_APPROVAL_MODE` 启用：
  - `approve-local`：批准 `create_file`/`append_to_file`/无参与者 `create_calendar_event`；外部副作用与破坏性拒绝。
  - `deny-all`：全部拒绝（无审批 fail-closed 的显式对照）。
  - `approve-all`：全部批准，仅用于演示“过度宽松审批者”；`deny` 规则仍不可被覆盖。
- 请求/响应只含工具名与参数名；模拟审批日志写入结果目录 `neonforge-approvals.jsonl`，不记录参数值。
- 审批端不暴露到容器外，也不改变 `nf-eval-internal` 网络边界。
- 单元测试：`python3 -m unittest evals/sandbox/test_neonforge_approval_server.py`。

## Terminal-Bench 2.0（专用 KVM VM）

Terminal-Bench 的任务会在容器内执行任意命令，因此**不在宿主 Docker 中运行**；使用一次性 QEMU/KVM VM，VM 内再运行 Docker + Harbor。拓扑：

```text
WSL2 host: NeonForge adapter (0.0.0.0:$NF_EVAL_ADAPTER_PORT) + Magpie
   │  QEMU user networking (10.0.2.2)
   ▼
KVM VM: Ubuntu 24.04, Docker 29.x, Harbor 0.26.0, socat relays
   │  docker bridge
   ▼
task container: terminus-2 agent / verifier; proxy only for apt/uv
```

构造步骤（脚本放在本机 `.scratch/evals/terminal-bench-vm/`，不入库；SSH 私钥也只留在该目录）：

1. 宿主安装 `qemu-system-x86 qemu-utils cloud-image-utils openssh-client`；下载 Ubuntu Noble cloud image，生成一次性 SSH key。
2. cloud-init 创建非 root 用户、安装 `docker.io`、`docker-compose-v2`、`socat`；VM 规格建议 6 vCPU / 8GB / 100GB。
3. QEMU 启动：`-enable-kvm -cpu host -netdev user,hostfwd=tcp:127.0.0.1:$SSH_PORT-:22`；VM 内 Docker 的镜像拉取走宿主代理。
4. VM 内安装 Harbor：`uv tool install harbor`（当前验证版本 0.26.0）。
5. 宿主启动 NeonForge 适配器并绑定 `0.0.0.0`；VM 内用 `socat` 把适配器端口和宿主代理端口转到 Docker bridge，任务容器只拿 `HTTP(S)_PROXY` 与 `NO_PROXY`，不拿 `MAGPIE_GATEWAY_KEY`。
6. 先跑 oracle 验证：`harbor run --dataset terminal-bench@2.0 --agent oracle --n-tasks 1`；再跑模型：
   `--agent terminus-2 --model openai/$MAGPIE_MODEL --base-url http://<vm-bridge>:<adapter-port>/v1 --api-key-name OPENAI_API_KEY --api-format openai_chat_completions`。
7. 结果写入 Harbor 的任务目录（默认 `jobs/`，可用 `--jobs-dir ~/harbor-jobs` 固定）；摘要写入 `docs/evals/baselines/`，不提交原始轨迹、代理地址或任何 Key。

### 自定义最小 agent（无 tmux/asciinema）

`terminus-2` 会在每个任务容器内安装 tmux/asciinema；网络受限时可能在 setup 阶段抛 `RuntimeError`，这是基础设施异常，不是模型分数。`evals/harbor/neonforge_terminal_agent.py` 提供无容器侧安装的最小 agent（单个 `execute_bash` 工具，经 NeonForge 适配器调用模型）：

```bash
ssh -p $SSH_PORT -i <key> nf@127.0.0.1 'mkdir -p ~/harbor-agents'
scp -P $SSH_PORT -i <key> evals/harbor/neonforge_terminal_agent.py \
  nf@127.0.0.1:~/harbor-agents/neonforge_terminal_agent.py

ssh -p $SSH_PORT -i <key> nf@127.0.0.1 \
  'cd ~ && PYTHONPATH=$HOME/harbor-agents \
   NEONFORGE_BASE_URL=http://172.17.0.1:18082/v1 \
   NEONFORGE_MODEL=opendesign/deepseek-v4.1-flash-eco \
   harbor run --dataset terminal-bench@2.0 --include-task-name regex-log --n-tasks 1 \
     --agent neonforge_terminal_agent:NeonForgeTerminalAgent \
     --model openai/$MAGPIE_MODEL --agent-timeout-multiplier 4'
```

- Agent 只从 VM 进程环境读取 `NEONFORGE_BASE_URL` / `NEONFORGE_MODEL`；`MAGPIE_GATEWAY_KEY` 仍只留在宿主适配器进程。
- 可调配置：`NEONFORGE_MAX_ITERATIONS`（默认 40）、`NEONFORGE_COMMAND_TIMEOUT_SEC`（默认 300）、`OPENAI_API_KEY`（默认占位值）。单条命令超过 300 秒会以 `RuntimeError` 结束，属于 agent 配置限制，不是模型分数；需要时用环境变量单独放宽后作为新配置重跑。
- 它不是 `terminus-2`，也不含 NeonForge GUI/审批链；结果只能代表“适配器 + 最小 shell 循环”，不能与 `terminus-2` 或官方榜单合并比较。扩展重复结果见 `docs/evals/baselines/2026-11-19-terminal-bench-expanded.md`。

注意：

- Harbor 进程自身需要代理访问 GitHub/镜像；但模型请求必须绕过代理（`NO_PROXY` 必须包含 VM 内适配器中继地址），否则本地模型端点会被宿主代理当作外网并返回 502。
- 内置 `terminus-2` 每个 task 会重新安装 tmux/asciinema 与 verifier 依赖；首轮较慢，不能把环境安装时间当作 agent 时间。自定义 agent 无容器侧安装。
- 当前只验证 `terminal-bench@2.0` 的少量任务；单次运行、子集分数，不能称为官方 Terminal-Bench 完整成绩。试点结果见 `docs/evals/baselines/2026-11-19-terminal-bench-pilot.md`。

## 版本固定

- BFCL：`bfcl-eval==2026.3.23`（DeepSeek handler 构造基类 client 需要 `OPENAI_API_KEY`；脚本注入 dummy `unused`，实际请求使用 `DEEPSEEK_API_KEY`）
- AgentDojo：`agentdojo==0.1.35`（通过容器内本地代理使用 `VLLM_PARSED` 原生工具调用；不依赖未发布的 `openai-compatible` provider）

修改版本时必须同时更新能力卡与本文档，并重新生成基线。

## 离线构建（网络不稳定时）

```bash
pip3 download --dest /tmp/nf-<bench>-wheels --python-version 3.11 --only-binary=:all: <package>==<version>
cp -al /tmp/nf-<bench>-wheels/*.whl evals/sandbox/wheels/
NF_EVAL_SKIP_BUILD=0 docker build ...   # Dockerfile 会自动使用 /wheels
rm -f evals/sandbox/wheels/*.whl
```

`evals/sandbox/wheels/*.whl` 已在 `.gitignore` 中，不会入库。
