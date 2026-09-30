#!/usr/bin/env bash
# Task1b smoke: impatient / contradictory / neutral
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.nvm/versions/node/v22.23.3/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
fi

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
export NF_UAT_LOCAL=1

APP="${NF_UAT_APP:-${HOME}/Documents/ninjasin-labs/neonforge/apps/desktop/release/mac/NeonForge.app}"
RESULTS=/tmp/nf-uat-smoke-1b.txt
rm -f "$RESULTS"
echo "==== SMOKE 1b APP=$APP ===="
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M" "$APP/Contents/Resources/app.asar" 2>/dev/null || true

run_one() {
  local name="$1" cmd="$2"
  echo ""
  echo "======== START $name $(date -u +%H:%M:%S) ========"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
  local UD="/tmp/nf-uat-${name}-ud"
  rm -rf "${UD}"
  mkdir -p "${UD}"
  xattr -cr "$APP" || true
  env NF_TEST_USERDATA="${UD}" NF_UAT_LOCAL=1 \
    "$APP/Contents/MacOS/NeonForge" --remote-debugging-port=9222 >/tmp/nf-live.log 2>&1 &
  sleep 8
  if ! curl -s --max-time 3 http://127.0.0.1:9222/json/version >/dev/null; then
    echo "ERROR: CDP 9222 not up" >&2
    echo "$name=1" >>"$RESULTS"
    return 1
  fi
  set +e
  (
    cd scripts-cdp
    # shellcheck disable=SC2086
    eval $cmd
  )
  local rc=$?
  set -e
  echo "======== END $name rc=$rc ========"
  echo "$name=$rc" >>"$RESULTS"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
}

run_one G-impatient "node uat-G-impatient.mjs"
run_one G-contradictory "NF_UAT_PERSONA=contradictory node uat-G-persona.mjs"
run_one G-neutral "NF_UAT_PERSONA=neutral node uat-G-persona.mjs"

echo "==== SMOKE SUMMARY ===="
cat "$RESULTS"
