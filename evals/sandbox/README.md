# 评估沙箱

所有外部 Agent 基准都在一次性 Docker 容器中运行。容器默认：

- 只读根文件系统，`/tmp` 为 tmpfs；仅挂载结果目录
- 非 root（宿主 UID/GID）
- `--cap-drop=ALL --security-opt=no-new-privileges`
- PID/内存/CPU 限制
- 不挂载宿主 Home、SSH、仓库源码或云凭据
- 仅加入 `nf-eval-internal` 内部网络，出站只经 Squid 白名单代理（仅允许 `api.deepseek.com:443`）

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
