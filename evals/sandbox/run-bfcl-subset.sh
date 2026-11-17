#!/usr/bin/env bash
# 在一次性 Docker 沙箱中运行 BFCL v4 子集（默认 24 题，成本可控）。
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

IMAGE="nf-eval-bfcl:2026.3.23"
OUT="${1:-.scratch/evals/bfcl-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"
IDS="${NF_EVAL_BFCL_IDS:-evals/sandbox/bfcl-subset-ids.json}"
cp "$IDS" "$OUT_ABS/test_case_ids_to_generate.json"

DOCKER_BIN=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    # 当前用户不在 docker 组时使用 sudo；仅 DeepSeek 路径需要显式保留模型 Key
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
  "${DOCKER_BIN[@]}" build -f evals/sandbox/Dockerfile.bfcl -t "$IMAGE" evals/sandbox
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
  MODEL="openbmb/MiniCPM-SALA-FC" # BFCL 的通用 OpenAI-compatible FC handler
  RUN_ENV=(
    -e OPENAI_API_KEY=unused
    -e OPENAI_BASE_URL="$NF_EVAL_ADAPTER_URL"
    -e NO_PROXY="localhost,127.0.0.1,$NF_EVAL_ADAPTER_HOSTNAME"
  )
else
  eval_proxy_start
  trap eval_proxy_stop EXIT
  MODEL="DeepSeek-V3.2-Exp-FC"
  RUN_ENV=(
    -e DEEPSEEK_API_KEY
    -e OPENAI_API_KEY=unused
    -e HTTP_PROXY="http://$PROXY:3128"
    -e HTTPS_PROXY="http://$PROXY:3128"
    -e NO_PROXY="localhost,127.0.0.1"
  )
fi

echo "[eval] 运行 BFCL 子集 target=$TARGET model=$MODEL -> $OUT"
"${DOCKER_BIN[@]}" run --rm \
  --name nf-eval-bfcl \
  --network "$NET" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=2g \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit=512 \
  --memory=4g \
  --cpus=2 \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e BFCL_PROJECT_ROOT=/eval/out \
  "${RUN_ENV[@]}" \
  -v "$OUT_ABS:/eval/out" \
  "$IMAGE" \
  bash -lc "
    set -euo pipefail
    bfcl generate --model '$MODEL' --run-ids --num-threads 1
    bfcl evaluate --model '$MODEL' --partial-eval
  "

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] 注意：子集分数不可与官方全量榜单横比（partial-eval）。"
