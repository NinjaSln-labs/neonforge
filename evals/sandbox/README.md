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

## 本地 Magpie / opendesign DSV4.1F

`NF_EVAL_TARGET=magpie` 时，harness 经 **NeonForge 无头评估适配器**（`evals/adapter/`）调用本机 Magpie：

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

## 策略门 v1（AgentDojo）

```bash
# strict / standard / delegated 三档；默认 prompt=product、defense=none
bash evals/sandbox/run-agentdojo-gate.sh

# 单档
NF_EVAL_TARGET=magpie NF_GATE_MODE=standard NF_EVAL_DEFENSE=none \
  bash evals/sandbox/run-agentdojo-subset.sh .scratch/evals/gate-standard
```

- `neonforge_gate.py` 在 AgentDojo 进程内包装 `FunctionsRuntime.run_function`；`deny > ask > allow`，`ask` 在无人类审批的基准中 fail-closed 为拒绝。
- 策略预设：`neonforge-policy.json`；只读 allow，本地写入按 strict/standard/delegated 区分，外部副作用 ask→deny，破坏性 deny，未知工具 fail-closed。
- 审计：每组结果目录下 `neonforge-gate.jsonl`，记录 `gate.decided`（工具名、决策、原因、参数名；不记录正文/收件人值）。
- 单元测试：`python3 -m unittest evals/sandbox/test_neonforge_gate.py`。

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
