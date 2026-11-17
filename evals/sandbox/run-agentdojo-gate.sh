#!/usr/bin/env bash
# 跑 NeonForge 策略门 v1：strict / standard / delegated 三档信任预设。
# 前置：Magpie 在 127.0.0.1:3425；MAGPIE_GATEWAY_KEY 已在环境中。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"
OUT="${1:-.scratch/evals/agentdojo-gate-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"

for MODE in strict standard delegated; do
  echo "[eval] === policy gate mode=$MODE ==="
  NF_EVAL_TARGET=magpie \
  NF_EVAL_PROMPT="${NF_EVAL_PROMPT:-product}" \
  NF_EVAL_DEFENSE=none \
  NF_GATE_MODE="$MODE" \
    bash evals/sandbox/run-agentdojo-subset.sh "$OUT_ABS/$MODE"
done

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] gate.decided 在每组结果的 neonforge-gate.jsonl。"
