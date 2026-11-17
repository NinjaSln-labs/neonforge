#!/usr/bin/env bash
# 启动内部网络 + 白名单代理（只允许 api.deepseek.com:443）。
# 用法：source 本文件后调用 eval_proxy_start / eval_proxy_stop；或直接执行 start。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NET="${NF_EVAL_NET:-nf-eval-internal}"
PROXY_NAME="${NF_EVAL_PROXY_NAME:-nf-eval-proxy}"
PROXY_IMAGE="${NF_EVAL_PROXY_IMAGE:-ubuntu/squid:latest}"

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

eval_proxy_start() {
  local d
  d="$(_nf_docker_bin)"
  $d network inspect "$NET" >/dev/null 2>&1 || $d network create --internal "$NET" >/dev/null
  $d rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
  $d run -d --rm --name "$PROXY_NAME" --network "$NET" \
    -v "$ROOT/evals/sandbox/egress-proxy/squid.conf:/etc/squid/squid.conf:ro" \
    "$PROXY_IMAGE" -f /etc/squid/squid.conf -N >/dev/null
  # 代理自身需要出站；eval 容器只在 internal 网络内，无法绕过代理直连
  $d network connect bridge "$PROXY_NAME"
  echo "[eval] egress proxy: $PROXY_NAME on $NET (allow api.deepseek.com:443)" >&2
}

eval_proxy_stop() {
  local d
  d="$(_nf_docker_bin)"
  $d rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-start}" in
    start) eval_proxy_start ;;
    stop) eval_proxy_stop ;;
    *) echo "用法：$0 {start|stop}" >&2; exit 2 ;;
  esac
fi
