#!/usr/bin/env bash
# 在一次性 Docker 沙箱中运行 BFCL v4 子集（默认 24 题，成本可控）。
# 凭据只从环境变量读取：DEEPSEEK_API_KEY。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${DEEPSEEK_API_KEY:?请先在环境中设置 DEEPSEEK_API_KEY（不要写入文件）}"

IMAGE="nf-eval-bfcl:2026.3.23"
OUT="${1:-.scratch/evals/bfcl-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"
cp evals/sandbox/bfcl-subset-ids.json "$OUT_ABS/test_case_ids_to_generate.json"

DOCKER_BIN=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    # 当前用户不在 docker 组时使用 sudo；显式保留模型 Key 供 docker CLI 读取
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
  "${DOCKER_BIN[@]}" build -f evals/sandbox/Dockerfile.bfcl -t "$IMAGE" evals/sandbox
fi

# shellcheck source=egress-proxy/proxy.sh
source evals/sandbox/egress-proxy/proxy.sh
eval_proxy_start
trap eval_proxy_stop EXIT
NET="${NF_EVAL_NET:-nf-eval-internal}"
PROXY="${NF_EVAL_PROXY_NAME:-nf-eval-proxy}"

echo "[eval] 运行 BFCL 子集 -> $OUT"
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
  -e DEEPSEEK_API_KEY \
  -e OPENAI_API_KEY=unused \
  -e HTTP_PROXY="http://$PROXY:3128" \
  -e HTTPS_PROXY="http://$PROXY:3128" \
  -e NO_PROXY="localhost,127.0.0.1" \
  -v "$OUT_ABS:/eval/out" \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    bfcl generate --model DeepSeek-V3.2-Exp-FC --run-ids --num-threads 1
    bfcl evaluate --model DeepSeek-V3.2-Exp-FC --partial-eval
  '

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] 注意：子集分数不可与官方全量榜单横比（partial-eval）。"
