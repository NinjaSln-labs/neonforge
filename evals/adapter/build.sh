#!/usr/bin/env bash
# 构建无头评估适配器（单文件 ESM，无需在容器内安装依赖）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ESBUILD="$ROOT/apps/desktop/node_modules/.bin/esbuild"

if [ ! -x "$ESBUILD" ]; then
  echo "错误：找不到 esbuild（先运行 cd apps/desktop && npm ci）" >&2
  exit 1
fi

mkdir -p "$ROOT/evals/adapter/dist"
"$ESBUILD" "$ROOT/evals/adapter/src/adapter.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node22 \
  --legal-comments=none \
  --log-level=warning \
  --outfile="$ROOT/evals/adapter/dist/adapter.mjs"

echo "[adapter] built evals/adapter/dist/adapter.mjs"
