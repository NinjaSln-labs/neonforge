#!/usr/bin/env bash
# 多样性人格池：分层抽 12 → 串行 e2e。推荐入口（legacy 见 run-uat-persona-rounds.sh）
# cwd: apps/desktop
# 用法：
#   NF_UAT_SEED=pilot30 bash scripts-cdp/run-uat-persona-pool.sh
#   NF_UAT_DRY=1 bash scripts-cdp/run-uat-persona-pool.sh   # 只抽签打印
set -euo pipefail
cd "$(dirname "$0")/.."

# nvm / homebrew node（非交互 ssh 常无 PATH）
if [ -z "${NODE:-}" ] || ! command -v node >/dev/null 2>&1; then
  if [ -s "${HOME}/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${HOME}/.nvm/nvm.sh"
  fi
  export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"
fi
command -v node >/dev/null || {
  echo "node not found in PATH" >&2
  exit 1
}

if [ -s /tmp/nf-uat-key-keep ]; then
  if grep -q '^export ' /tmp/nf-uat-key-keep 2>/dev/null; then
    set -a
    # shellcheck disable=SC1091
    . /tmp/nf-uat-key-keep
    set +a
  elif [ -z "${NEONFORGE_COMMANDCODE:-}" ]; then
    export NEONFORGE_COMMANDCODE="$(cat /tmp/nf-uat-key-keep)"
  fi
fi

DRAW="/tmp/nf-uat-draw.json"
RESULTS="/tmp/nf-uat-pool-results.txt"
SEED="${NF_UAT_SEED:-}"
export NF_UAT_SEED="${SEED}"
export NF_UAT_LOCAL=1

node scripts-cdp/draw-persona-batch.mjs --out "$DRAW"

if [ "${NF_UAT_DRY:-}" = "1" ]; then
  echo "NF_UAT_DRY=1 — skip e2e"
  cat "$DRAW"
  exit 0
fi

if [ -z "${NEONFORGE_COMMANDCODE:-}" ]; then
  echo "missing NEONFORGE_COMMANDCODE (or dry with NF_UAT_DRY=1)" >&2
  exit 1
fi

APP="${NF_UAT_APP:-${HOME}/Documents/ninjasin-labs/neonforge/apps/desktop/release/mac/NeonForge.app}"
if [ ! -x "$APP/Contents/MacOS/NeonForge" ]; then
  echo "APP missing: $APP" >&2
  echo "hint: set NF_UAT_APP or run on Mac after dist; use NF_UAT_DRY=1 for draw-only" >&2
  exit 1
fi

rm -f "$RESULTS"
echo "==== POOL DRAW seed=${NF_UAT_SEED:-(date)} APP=$APP ===="
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M" "$APP/Contents/Resources/app.asar" 2>/dev/null || true

IDS_FILE="/tmp/nf-uat-draw-ids.txt"
node -e "
const d=require('fs').readFileSync('$DRAW','utf8');
const j=JSON.parse(d);
require('fs').writeFileSync('$IDS_FILE', j.personas.map(p=>p.id).join('\n')+'\n');
"
IDS=()
while IFS= read -r id; do
  [ -n "$id" ] && IDS+=("$id")
done <"$IDS_FILE"

run_one() {
  local id="$1"
  local name="G-pool-${id}"
  echo ""
  echo "======== START $name $(date -u +%H:%M:%S) ========"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
  local i=0
  while curl -s --max-time 1 http://127.0.0.1:9222/json/version >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 15 ]; then
      echo "ERROR: port 9222 still busy after kill" >&2
      return 1
    fi
    pkill -9 -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
    pkill -9 -f "NeonForge Helper" 2>/dev/null || true
    sleep 1
  done
  local UD="/tmp/nf-uat-${name}-ud"
  rm -rf "${UD}"
  mkdir -p "${UD}"
  xattr -cr "$APP" || true
  export NF_TEST_USERDATA="${UD}"
  env NF_TEST_USERDATA="${UD}" NF_UAT_LOCAL=1 \
    "$APP/Contents/MacOS/NeonForge" --remote-debugging-port=9222 >/tmp/nf-live.log 2>&1 &
  sleep 8
  if ! curl -s --max-time 3 http://127.0.0.1:9222/json/version >/dev/null; then
    echo "ERROR: CDP 9222 not up" >&2
    head -20 /tmp/nf-live.log >&2 || true
    return 1
  fi
  set +e
  (
    cd scripts-cdp
    node uat-G-persona.mjs --from-pool "$id"
  )
  local rc=$?
  set -e
  echo "======== END $name rc=$rc $(date -u +%H:%M:%S) ========"
  echo "$name=$rc" >>"$RESULTS"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
}

for id in "${IDS[@]}"; do
  run_one "$id"
done

echo ""
echo "==== POOL SUMMARY ===="
cat "$RESULTS"
