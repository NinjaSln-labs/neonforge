#!/usr/bin/env bash
# 在一次性 Docker 沙箱中运行 AgentDojo workspace 子集（提示注入韧性）。
# 凭据只从环境变量读取：DEEPSEEK_API_KEY（映射为 OPENAI_COMPATIBLE_API_KEY）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${DEEPSEEK_API_KEY:?请先在环境中设置 DEEPSEEK_API_KEY（不要写入文件）}"
IMAGE="nf-eval-agentdojo:0.1.35"
OUT="${1:-.scratch/evals/agentdojo-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"

DOCKER_BIN=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER_BIN=(sudo -n --preserve-env=DEEPSEEK_API_KEY docker)
  else
    echo "错误：无法访问 Docker daemon（需 docker 组权限或免密 sudo）" >&2
    exit 1
  fi
fi

echo "[eval] 构建沙箱镜像 $IMAGE"
if [ "${NF_EVAL_SKIP_BUILD:-0}" = "1" ]; then
  echo "[eval] NF_EVAL_SKIP_BUILD=1，跳过构建（使用本地镜像）"
else
  "${DOCKER_BIN[@]}" build -f evals/sandbox/Dockerfile.agentdojo -t "$IMAGE" evals/sandbox
fi

# shellcheck source=egress-proxy/proxy.sh
source evals/sandbox/egress-proxy/proxy.sh
eval_proxy_start
trap eval_proxy_stop EXIT
NET="${NF_EVAL_NET:-nf-eval-internal}"
PROXY="${NF_EVAL_PROXY_NAME:-nf-eval-proxy}"

echo "[eval] 运行 AgentDojo 子集 -> $OUT"
DEFENSE="${NF_EVAL_DEFENSE:-tool_filter}"
DEFENSE_ARGS=()
if [ "$DEFENSE" != "none" ]; then
  DEFENSE_ARGS=(--defense "$DEFENSE")
fi
"${DOCKER_BIN[@]}" run --rm \
  --name nf-eval-agentdojo \
  --network "$NET" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=1g \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit=512 \
  --memory=2g \
  --cpus=2 \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e DEEPSEEK_API_KEY \
  -e NF_EVAL_MODEL_ID=deepseek-chat \
  -e HTTP_PROXY="http://$PROXY:3128" \
  -e HTTPS_PROXY="http://$PROXY:3128" \
  -e NO_PROXY="localhost,127.0.0.1" \
  -v "$OUT_ABS:/eval/out" \
  -v "$ROOT/evals/sandbox/agentdojo_with_proxy.py:/eval/agentdojo_with_proxy.py:ro" \
  "$IMAGE" \
  python /eval/agentdojo_with_proxy.py \
    --model VLLM_PARSED \
    --model-id deepseek-chat \
    --suite workspace \
    --user-task user_task_0 \
    --user-task user_task_1 \
    --user-task user_task_2 \
    --injection-task injection_task_0 \
    --injection-task injection_task_1 \
    --attack important_instructions \
    "${DEFENSE_ARGS[@]}" \
    --max-workers 1 \
    --logdir /eval/out/logs

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] 注意：AgentDojo 结果是模型级安全信号，不等同于 NeonForge 审批边界的完整安全评估。"
