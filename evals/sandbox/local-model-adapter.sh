#!/usr/bin/env bash
# 启动本机 Magpie 评估适配器 + 沙箱内单目标 TCP 中继。
# 用法：source 本文件后调用 adapter_start / adapter_stop。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NET="${NF_EVAL_NET:-nf-eval-internal}"
RELAY_NAME="${NF_EVAL_ADAPTER_RELAY:-nf-eval-adapter-relay}"
RELAY_IMAGE="${NF_EVAL_RELAY_IMAGE:-python:3.11-slim}"
ADAPTER_PORT="${NF_EVAL_ADAPTER_PORT:-18080}"
ADAPTER_PROMPT="${NF_EVAL_PROMPT:-product}"
ADAPTER_LOG="$ROOT/.scratch/evals/adapter.log"
ADAPTER_PID="$ROOT/.scratch/evals/adapter.pid"

_nf_docker_bin() {
  if docker info >/dev/null 2>&1; then
    echo docker
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    echo "sudo -n docker"
  else
    echo "错误：无法访问 Docker daemon" >&2
    exit 1
  fi
}

_adapter_bridge_ip() {
  local d="$1"
  $d network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}'
}

adapter_start() {
  : "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"
  local d bridge_ip
  d="$(_nf_docker_bin)"
  bridge_ip="$(_adapter_bridge_ip "$d")"
  if [ -z "$bridge_ip" ]; then
    echo "错误：无法解析 Docker bridge 网关地址" >&2
    exit 1
  fi

  mkdir -p "$ROOT/.scratch/evals"
  $d network inspect "$NET" >/dev/null 2>&1 || $d network create --internal "$NET" >/dev/null
  if [ ! -f "$ROOT/evals/adapter/dist/adapter.mjs" ] || \
     find "$ROOT/evals/adapter/src" -type f -newer "$ROOT/evals/adapter/dist/adapter.mjs" | grep -q .; then
    bash "$ROOT/evals/adapter/build.sh"
  fi

  # 每次重新启动，确保 NF_EVAL_PROMPT / 模型配置与本次运行一致
  if [ -f "$ADAPTER_PID" ] && kill -0 "$(cat "$ADAPTER_PID")" 2>/dev/null; then
    kill "$(cat "$ADAPTER_PID")" >/dev/null 2>&1 || true
    wait "$(cat "$ADAPTER_PID")" 2>/dev/null || true
    rm -f "$ADAPTER_PID"
  fi
  NF_ADAPTER_HOST="$bridge_ip" \
    NF_ADAPTER_PORT="$ADAPTER_PORT" \
    NF_ADAPTER_PROMPT="$ADAPTER_PROMPT" \
    NF_ADAPTER_TOLERANT_ARGS="${NF_ADAPTER_TOLERANT_ARGS:-0}" \
    MAGPIE_BASE_URL="${MAGPIE_BASE_URL:-http://127.0.0.1:3425/v1}" \
    MAGPIE_MODEL="${MAGPIE_MODEL:-opendesign/deepseek-v4.1-flash}" \
      nohup node "$ROOT/evals/adapter/dist/adapter.mjs" >"$ADAPTER_LOG" 2>&1 &
  echo $! >"$ADAPTER_PID"
  local i
  for i in $(seq 1 40); do
    if curl -fsS "http://$bridge_ip:$ADAPTER_PORT/health" >/dev/null 2>&1; then break; fi
    sleep 0.25
  done
  if ! curl -fsS "http://$bridge_ip:$ADAPTER_PORT/health" >/dev/null 2>&1; then
    echo "错误：评估适配器未就绪；日志：$ADAPTER_LOG" >&2
    tail -20 "$ADAPTER_LOG" >&2 || true
    adapter_stop
    exit 1
  fi

  $d rm -f "$RELAY_NAME" >/dev/null 2>&1 || true
  $d run -d --rm --name "$RELAY_NAME" \
    --network "$NET" \
    --read-only \
    --tmpfs /tmp:rw,nosuid,nodev,size=16m \
    --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --pids-limit=128 \
    --memory=128m \
    --user "$(id -u):$(id -g)" \
    --add-host=host.docker.internal:host-gateway \
    -e PYTHONDONTWRITEBYTECODE=1 \
    -v "$ROOT/evals/sandbox/model_relay.py:/eval/model_relay.py:ro" \
    --entrypoint python \
    "$RELAY_IMAGE" /eval/model_relay.py \
    --listen "0.0.0.0:$ADAPTER_PORT" \
    --target "host.docker.internal:$ADAPTER_PORT" >/dev/null
  $d network connect bridge "$RELAY_NAME" >/dev/null

  local i
  for i in $(seq 1 40); do
    if $d run --rm --network "$NET" --entrypoint python "$RELAY_IMAGE" -c \
      "import urllib.request; urllib.request.urlopen('http://$RELAY_NAME:$ADAPTER_PORT/health', timeout=2).read()" \
      >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  if ! $d run --rm --network "$NET" --entrypoint python "$RELAY_IMAGE" -c \
    "import urllib.request; urllib.request.urlopen('http://$RELAY_NAME:$ADAPTER_PORT/health', timeout=2).read()" \
    >/dev/null 2>&1; then
    echo "错误：沙箱内适配器中继不可用" >&2
    adapter_stop
    exit 1
  fi

  export NF_EVAL_ADAPTER_URL="http://$RELAY_NAME:$ADAPTER_PORT/v1"
  export NF_EVAL_ADAPTER_HOSTNAME="$RELAY_NAME"
  echo "[eval] model adapter: $NF_EVAL_ADAPTER_URL (magpie, prompt=$ADAPTER_PROMPT)" >&2
}

adapter_stop() {
  local d
  d="$(_nf_docker_bin)"
  $d rm -f "$RELAY_NAME" >/dev/null 2>&1 || true
  if [ -f "$ADAPTER_PID" ]; then
    local pid
    pid="$(cat "$ADAPTER_PID")"
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" 2>/dev/null || true
    rm -f "$ADAPTER_PID"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-start}" in
    start) adapter_start ;;
    stop) adapter_stop ;;
    *) echo "用法：$0 {start|stop}" >&2; exit 2 ;;
  esac
fi
