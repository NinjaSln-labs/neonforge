#!/usr/bin/env bash
# 策略门 v2 审批回调基准：容器内模拟审批端（approve-local / deny-all / approve-all）。
# 任务集覆盖只读、本地创建/编辑、日历创建（含/不含参与者）与外部共享。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${MAGPIE_GATEWAY_KEY:?请先在环境中设置 MAGPIE_GATEWAY_KEY（不要写入文件）}"

OUT="${1:-.scratch/evals/agentdojo-gate-v2-approval-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$OUT" in
  /*) OUT_ABS="$OUT" ;;
  *) OUT_ABS="$ROOT/$OUT" ;;
esac
mkdir -p "$OUT_ABS"

TASKS="user_task_0,user_task_1,user_task_2,user_task_12,user_task_15,user_task_20,user_task_29,user_task_31,user_task_32,user_task_34"
REPS="${NF_EVAL_APPROVAL_REPS:-3}"

run_group() {
  local gate_mode="$1"
  local approval_mode="$2"
  local name="$3"
  echo "[eval] === gate=$gate_mode approval=$approval_mode run=$name ==="
  NF_EVAL_TARGET=magpie \
  NF_EVAL_PROMPT="${NF_EVAL_PROMPT:-product}" \
  NF_EVAL_DEFENSE=none \
  NF_EVAL_USER_TASKS="$TASKS" \
  NF_EVAL_INJECTION_TASKS=injection_task_0,injection_task_1 \
  NF_GATE_MODE="$gate_mode" \
  NF_GATE_APPROVAL_MODE="$approval_mode" \
  NF_GATE_POLICY_FILE=evals/sandbox/neonforge-policy.json \
    bash evals/sandbox/run-agentdojo-subset.sh "$OUT_ABS/$name" \
    2>&1 | tee "$OUT_ABS/$name.log"
}

for i in $(seq 1 "$REPS"); do
  run_group strict approve-local "strict-approve-local-r$i"
done
run_group strict deny-all "strict-deny-all-r1"
run_group strict approve-all "strict-approve-all-r1"

echo "[eval] 完成。结果目录：$OUT_ABS"
echo "[eval] gate.decided 见 neonforge-gate.jsonl；模拟审批记录见 neonforge-approvals.jsonl。"
