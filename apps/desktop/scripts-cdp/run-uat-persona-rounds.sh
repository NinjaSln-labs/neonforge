#!/usr/bin/env bash
# 三轮多样性人格 UAT（人格跨轮不重复）。cwd=apps/desktop
# 用法：
#   export NEONFORGE_COMMANDCODE=…   # 或 /tmp/nf-uat-key-keep
#   export NF_UAT_LOCAL=1
#   # 可选：NF_UAT_APP=/path/to/NeonForge.app  NF_UAT_KEENABLE_KEY=…
#   bash scripts-cdp/run-uat-persona-rounds.sh 1|2|3
set -euo pipefail
cd "$(dirname "$0")/.."

ROUND="${1:-}"
if [[ ! "$ROUND" =~ ^[123]$ ]]; then
  echo "usage: $0 1|2|3" >&2
  exit 2
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
if [ -z "${NEONFORGE_COMMANDCODE:-}" ]; then
  echo "missing NEONFORGE_COMMANDCODE" >&2
  exit 1
fi
export NF_UAT_LOCAL=1

APP="${NF_UAT_APP:-${HOME}/Documents/ninjasin-labs/neonforge/apps/desktop/release/mac/NeonForge.app}"
if [ ! -x "$APP/Contents/MacOS/NeonForge" ]; then
  echo "APP missing: $APP" >&2
  exit 1
fi

case "$ROUND" in
  1) NAMES=(G-impatient G-picky); SCRIPTS=(uat-G-impatient.mjs uat-G-picky.mjs) ;;
  2) NAMES=(G-novice G-contradictory); SCRIPTS=(uat-G-novice.mjs uat-G-contradictory.mjs) ;;
  3) NAMES=(G-boundary G-web); SCRIPTS=(uat-G-boundary.mjs uat-G-web.mjs) ;;
esac

RESULTS="/tmp/nf-uat-r${ROUND}-results.txt"
rm -f "$RESULTS"
echo "==== ROUND $ROUND APP=$APP HEAD hint via asar mtime ===="
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M" "$APP/Contents/Resources/app.asar" 2>/dev/null || true

run_one() {
  local name="$1" script="$2"
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
  if [ ! -d "${UD}/Cache" ] && [ ! -f "${UD}/DevToolsActivePort" ]; then
    echo "ERROR: userData not isolated to ${UD}" >&2
    ls -la "${UD}" >&2 || true
    return 1
  fi
  set +e
  node "scripts-cdp/$script"
  local rc=$?
  set -e
  echo "======== END $name rc=$rc $(date -u +%H:%M:%S) ========"
  echo "$name=$rc" >>"$RESULTS"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
  return 0
}

for i in "${!NAMES[@]}"; do
  run_one "${NAMES[$i]}" "${SCRIPTS[$i]}"
done

echo ""
echo "==== ROUND $ROUND SUMMARY ===="
cat "$RESULTS"
