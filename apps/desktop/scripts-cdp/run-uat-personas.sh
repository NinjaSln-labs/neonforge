#!/usr/bin/env bash
# Mac 本机：多人格 UAT（含 G-web）。cwd=apps/desktop
# 用法：
#   export NEONFORGE_COMMANDCODE=sk-...
#   export NF_UAT_LOCAL=1
#   # 可选：export NF_UAT_KEENABLE_KEY=keen_...（否则 G-web 显式开公共试用）
#   bash scripts-cdp/run-uat-personas.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# /tmp/nf-uat-key-keep：export 形（含 NF_UAT_KEENABLE_KEY）或单行裸 CMD
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

APP="${HOME}/Documents/ninjasin-labs/neonforge/apps/desktop/release/mac/NeonForge.app"
if [ ! -x "$APP/Contents/MacOS/NeonForge" ]; then
  echo "APP missing: $APP" >&2
  exit 1
fi

RESULTS=/tmp/nf-uat-persona-results.txt
rm -f "$RESULTS"

run_one() {
  local name="$1" script="$2"
  echo ""
  echo "======== START $name $(date -u +%H:%M:%S) ========"
  # 杀净旧实例 + 释放 9222（否则 CDP 会连到已有 Key 的残留进程——跳过钥匙页）
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
  # 显式带入环境——空 UD = 必出钥匙配置页
  env NF_TEST_USERDATA="${UD}" NF_UAT_LOCAL=1 \
    "$APP/Contents/MacOS/NeonForge" --remote-debugging-port=9222 >/tmp/nf-live.log 2>&1 &
  sleep 8
  if ! curl -s --max-time 3 http://127.0.0.1:9222/json/version >/dev/null; then
    echo "ERROR: CDP 9222 not up" >&2
    head -20 /tmp/nf-live.log >&2 || true
    return 1
  fi
  # 隔离自检：UD 下应有 Chromium 缓存目录
  if [ ! -d "${UD}/Cache" ] && [ ! -f "${UD}/DevToolsActivePort" ]; then
    echo "ERROR: userData not isolated to ${UD}" >&2
    ls -la "${UD}" >&2 || true
    return 1
  fi
  curl -s --max-time 3 http://127.0.0.1:9222/json/version | head -c 120 || true
  echo
  set +e
  node "scripts-cdp/$script"
  local rc=$?
  set -e
  echo "======== END $name rc=$rc $(date -u +%H:%M:%S) ========"
  echo "$name=$rc" >>"$RESULTS"
  pkill -f "NeonForge.app/Contents/MacOS/NeonForge" 2>/dev/null || true
  pkill -f "NeonForge Helper" 2>/dev/null || true
  sleep 2
}

run_one G-impatient uat-G-impatient.mjs
run_one G-picky uat-G-picky.mjs
run_one G-boundary uat-G-boundary.mjs
run_one G-web uat-G-web.mjs

echo ""
echo "==== SUMMARY ===="
cat "$RESULTS"
