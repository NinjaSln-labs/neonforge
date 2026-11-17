#!/usr/bin/env bash
# 在一次性 Docker 沙箱中运行 AgentDojo workspace 子集（提示注入韧性）。
# 凭据只从环境变量读取：DEEPSEEK_API_KEY 或 MAGPIE_GATEWAY_KEY。
# NF_EVAL_TARGET=deepseek（默认）|magpie；magpie 经 NeonForge 无头适配器调用本地 DSV4.1F。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TARGET="${NF_EVAL_TARGET:-deepseek}"
if [ "$TARGET" = "magpie" ]; then
  : "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"
else
  : "${DEEPSEEK_API_KEY:?请先在环境中设置 DEEPSEEK_API_KEY（不要写入文件）}"
fi

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
    if [ "$TARGET" = "deepseek" ]; then
      DOCKER_BIN=(sudo -n --preserve-env=DEEPSEEK_API_KEY docker)
    else
      DOCKER_BIN=(sudo -n docker)
    fi
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

NET="${NF_EVAL_NET:-nf-eval-internal}"
PROXY="${NF_EVAL_PROXY_NAME:-nf-eval-proxy}"
# shellcheck source=egress-proxy/proxy.sh
source evals/sandbox/egress-proxy/proxy.sh
# shellcheck source=local-model-adapter.sh
source evals/sandbox/local-model-adapter.sh

if [ "$TARGET" = "magpie" ]; then
  adapter_start
  trap adapter_stop EXIT
  RUN_ENV=(
    -e OPENAI_API_KEY=unused
    -e NF_EVAL_UPSTREAM_BASE="$NF_EVAL_ADAPTER_URL"
    -e NF_EVAL_UPSTREAM_KEY=unused
    -e NF_EVAL_MODEL_ID=opendesign/deepseek-v4.1-flash
    -e NO_PROXY="localhost,127.0.0.1,$NF_EVAL_ADAPTER_HOSTNAME"
  )
else
  eval_proxy_start
  trap eval_proxy_stop EXIT
  RUN_ENV=(
    -e DEEPSEEK_API_KEY
    -e HTTP_PROXY="http://$PROXY:3128"
    -e HTTPS_PROXY="http://$PROXY:3128"
    -e NO_PROXY="localhost,127.0.0.1"
  )
fi

echo "[eval] 运行 AgentDojo 子集 target=$TARGET -> $OUT"
DEFENSE="${NF_EVAL_DEFENSE:-tool_filter}"
DEFENSE_ARGS=()
if [ "$DEFENSE" != "none" ]; then
  DEFENSE_ARGS=(--defense "$DEFENSE")
fi

USER_TASKS="${NF_EVAL_USER_TASKS:-user_task_0,user_task_1,user_task_2}"
INJECTION_TASKS="${NF_EVAL_INJECTION_TASKS:-injection_task_0,injection_task_1}"
USER_ARGS=()
INJECTION_ARGS=()
IFS=',' read -r -a _user_list <<<"$USER_TASKS"
for t in "${_user_list[@]}"; do
  t="${t// /}"
  [ -n "$t" ] && USER_ARGS+=(--user-task "$t")
done
IFS=',' read -r -a _injection_list <<<"$INJECTION_TASKS"
for t in "${_injection_list[@]}"; do
  t="${t// /}"
  [ -n "$t" ] && INJECTION_ARGS+=(--injection-task "$t")
done

GATE_MODE="${NF_GATE_MODE:-off}"
APPROVAL_MODE="${NF_GATE_APPROVAL_MODE:-off}"
GATE_ARGS=()
if [ "$GATE_MODE" != "off" ]; then
  echo "[eval] NeonForge policy gate: $GATE_MODE (approval=$APPROVAL_MODE)"
  GATE_POLICY_FILE="${NF_GATE_POLICY_FILE:-evals/sandbox/neonforge-policy.json}"
  case "$GATE_POLICY_FILE" in
    /*) GATE_POLICY_ABS="$GATE_POLICY_FILE" ;;
    *) GATE_POLICY_ABS="$ROOT/$GATE_POLICY_FILE" ;;
  esac
  if [ ! -f "$GATE_POLICY_ABS" ]; then
    echo "错误：找不到策略文件 $GATE_POLICY_ABS" >&2
    exit 1
  fi
  GATE_ARGS=(
    -e NF_GATE_MODE="$GATE_MODE"
    -e NF_GATE_RUNNER=/eval/neonforge_gate_runner.py
    -e NF_GATE_POLICY=/eval/neonforge-policy.json
    -e NF_GATE_LOG=/eval/out/neonforge-gate.jsonl
    -e NF_GATE_APPROVAL_MODE="$APPROVAL_MODE"
    -e NF_GATE_APPROVAL_LOG=/eval/out/neonforge-approvals.jsonl
    -v "$ROOT/evals/sandbox/neonforge_gate.py:/eval/neonforge_gate.py:ro"
    -v "$ROOT/evals/sandbox/neonforge_gate_runner.py:/eval/neonforge_gate_runner.py:ro"
    -v "$ROOT/evals/sandbox/neonforge_approval_server.py:/eval/neonforge_approval_server.py:ro"
    -v "$GATE_POLICY_ABS:/eval/neonforge-policy.json:ro"
  )
  if [ "$APPROVAL_MODE" = "off" ]; then
    # 保留外部审批 URL 透传（仅当没有使用容器内模拟审批端）
    GATE_ARGS+=(-e NF_GATE_APPROVAL_URL)
  else
    echo "[eval] 容器内模拟审批端: $APPROVAL_MODE"
  fi
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
  "${RUN_ENV[@]}" \
  "${GATE_ARGS[@]}" \
  -v "$OUT_ABS:/eval/out" \
  -v "$ROOT/evals/sandbox/agentdojo_with_proxy.py:/eval/agentdojo_with_proxy.py:ro" \
  "$IMAGE" \
  python /eval/agentdojo_with_proxy.py \
    --model VLLM_PARSED \
    --model-id deepseek-chat \
    --suite workspace \
    "${USER_ARGS[@]}" \
    "${INJECTION_ARGS[@]}" \
    --attack important_instructions \
    "${DEFENSE_ARGS[@]}" \
    --max-workers 1 \
    --logdir /eval/out/logs

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] 注意：AgentDojo 结果是模型级安全信号，不等同于 NeonForge 审批边界的完整安全评估。"
