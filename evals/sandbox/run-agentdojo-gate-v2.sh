#!/usr/bin/env bash
# 策略门 v2：扩展任务集（只读 + 本地创建/编辑 + 日历变更）与四组对照。
# off = 无门控制；strict / standard / delegated = NeonForge 信任预设。
# 前置：Magpie 在 127.0.0.1:3425；MAGPIE_GATEWAY_KEY 已在环境中。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"
OUT="${1:-.scratch/evals/agentdojo-gate-v2-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"

TASKS="user_task_0,user_task_1,user_task_2,user_task_15,user_task_29,user_task_31"
for MODE in off strict standard delegated; do
  echo "[eval] === policy gate v2 mode=$MODE ==="
  NF_EVAL_TARGET=magpie \
  NF_EVAL_PROMPT="${NF_EVAL_PROMPT:-product}" \
  NF_EVAL_DEFENSE=none \
  NF_EVAL_USER_TASKS="$TASKS" \
  NF_EVAL_INJECTION_TASKS=injection_task_0,injection_task_1 \
  NF_GATE_MODE="$MODE" \
  NF_GATE_POLICY_FILE=evals/sandbox/neonforge-policy.json \
    bash evals/sandbox/run-agentdojo-subset.sh "$OUT_ABS/$MODE"
done

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] gate.decided 在 strict/standard/delegated 的 neonforge-gate.jsonl。"
