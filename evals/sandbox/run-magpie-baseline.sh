#!/usr/bin/env bash
# 一键跑本地 Magpie / opendesign DSV4.1F 的受控基线：
#   BFCL 24 题子集 + AgentDojo workspace 3 用户任务 × 2 注入任务
#   分别跑 prompt=none（对照）与 prompt=product（NeonForge 产品系统提示）
# 凭据只从环境变量读取：MAGPIE_GATEWAY_KEY。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"
OUT="${1:-.scratch/evals/magpie-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"

export NF_EVAL_TARGET=magpie
for PROMPT in none product; do
  echo "[eval] === prompt=$PROMPT ==="
  NF_EVAL_PROMPT="$PROMPT" bash evals/sandbox/run-bfcl-subset.sh "$OUT_ABS/bfcl-$PROMPT"
  NF_EVAL_PROMPT="$PROMPT" NF_EVAL_DEFENSE=none \
    bash evals/sandbox/run-agentdojo-subset.sh "$OUT_ABS/agentdojo-$PROMPT-none"
  NF_EVAL_PROMPT="$PROMPT" NF_EVAL_DEFENSE=tool_filter \
    bash evals/sandbox/run-agentdojo-subset.sh "$OUT_ABS/agentdojo-$PROMPT-tool_filter"
done

echo "[eval] 全部完成。结果目录：$OUT_ABS"
echo "[eval] 提醒：产物在 .scratch/evals/（不入库）；只把摘要写进 docs/evals/baselines/。"
